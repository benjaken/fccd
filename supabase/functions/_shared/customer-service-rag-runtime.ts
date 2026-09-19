import { answerCustomerServiceFaqWithTieredAi, type CustomerServiceAiTierConfig } from "./customer-service-ai.ts";
import { sanitizeCustomerServiceRecentMessages, type CustomerServiceRecentMessage } from "./customer-service-context.ts";
import { rewriteCustomerServiceQuery } from "./customer-service-rewrite.ts";
import { customerServiceEmbeddingConfig, customerServiceEmbeddingProfile, embedCustomerServiceTexts, CustomerServiceEmbeddingError, CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS, type CustomerServiceEmbeddingConfig } from "./customer-service-embedding.ts";
import { fuseCustomerFaqCandidates, type CustomerServiceFaqCandidate, type CustomerServiceFaqRanked } from "./customer-service-retrieval.ts";
import { type CustomerServiceRagConfig } from "./customer-service-rag-config.ts";
import { ragRpc, type CustomerServiceRagDatabase } from "./customer-service-rag-db.ts";

export type RagLeg = { status: "ok" | "error" | "skipped"; code: string; elapsedMs: number; candidates: CustomerServiceFaqCandidate[] };
export type RagTrace = {
  traceId: string; stage: "config" | "rewrite" | "retrieval" | "answer";
  status: "ok" | "degraded" | "error" | "skipped"; code: string; elapsedMs: number;
  queryHash?: string; rewrittenQueryHash?: string; profile?: string;
  lexical?: Omit<RagLeg,"candidates">; vector?: Omit<RagLeg,"candidates">;
  candidates?: Array<{ id: string; rank: number; lexicalRank?: number | null; vectorRank?: number | null; rrfScore?: number }>;
  selectedSourceIds?: string[]; effectiveConfig?: CustomerServiceRagConfig;
};
export class CustomerServiceRetrievalError extends Error {
  constructor() { super("customer_service_retrieval_error"); this.name = "CustomerServiceRetrievalError"; }
}
async function fingerprint(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,"0")).join("");
}
function records(data: unknown): CustomerServiceFaqCandidate[] {
  if (!Array.isArray(data)) throw new Error("rag_invalid_candidates");
  return data.filter((row) => row && typeof row.id === "string" && typeof row.question === "string" && typeof row.answer === "string")
    .map((row) => ({ id: row.id, category: typeof row.category === "string" ? row.category : "general", question: row.question, answer: row.answer,
      ...(Number.isFinite(Number(row.score)) ? { score: Number(row.score) } : {}) }));
}
function legMetadata(leg: RagLeg): Omit<RagLeg,"candidates"> {
  return { status:leg.status,code:leg.code,elapsedMs:leg.elapsedMs };
}

/** Shared live/preview/evaluation adapters. No orders, handoff, notifications or writes here. */
export function createCustomerServiceFaqRagDeps({
  db, ragConfig, tiers, recentMessages = [], legacyLimit = 12,
  embeddingConfig = customerServiceEmbeddingConfig(), fetchImpl = fetch,
  onTrace, deadlineAt = Date.now()+25_000, environment,
  repairRewrite,
}: {
  db: CustomerServiceRagDatabase; ragConfig: CustomerServiceRagConfig; tiers: CustomerServiceAiTierConfig;
  recentMessages?: CustomerServiceRecentMessage[]; legacyLimit?: number;
  embeddingConfig?: CustomerServiceEmbeddingConfig; fetchImpl?: typeof fetch;
  onTrace?: (trace: RagTrace) => void; deadlineAt?: number;
  environment?: string;
  /** Isolated candidate uses the same query rewrite point as an active rule. */
  repairRewrite?: { queryKey: string; canonicalQuestion: string };
}) {
  const traceId = crypto.randomUUID();
  const emit = (trace: Omit<RagTrace,"traceId">) => {
    const event = { ...trace, traceId };
    try {
      if (onTrace) onTrace(event);
      else console.info("customer-service-rag", JSON.stringify(event));
    } catch { /* Telemetry must not break replies. Never log prompt/source/customer text. */ }
  };
  const remaining = (max: number) => Math.max(1,Math.min(max,deadlineAt-Date.now()));
  const history = sanitizeCustomerServiceRecentMessages(recentMessages,ragConfig.contextRounds*2);
  emit({ stage:"config",status:"ok",code:"effective_config",elapsedMs:0,effectiveConfig:ragConfig });
  return {
    ...(ragConfig.enableQueryRewrite ? {
      async rewriteQuery(query: string) {
        const started=Date.now();
        try {
          if (Date.now()>=deadlineAt) throw new Error("rag_deadline");
          const rewritten = await rewriteCustomerServiceQuery({ question:query,recentMessages:history,
            config:{...tiers.primary,timeoutMs:remaining(Math.min(3_000,tiers.primary.timeoutMs))},fetchImpl });
          emit({stage:"rewrite",status:rewritten?"ok":"skipped",code:rewritten?rewritten.intentHint:"rewrite_unavailable",elapsedMs:Date.now()-started,
            queryHash:await fingerprint(query),rewrittenQueryHash:await fingerprint(rewritten?.rewrittenQuery??query)});
          return rewritten;
        } catch {
          emit({stage:"rewrite",status:"degraded",code:"rewrite_failed_original_query",elapsedMs:Date.now()-started,queryHash:await fingerprint(query)});
          return null;
        }
      },
    }:{}),
    async searchFaqs(query: string): Promise<CustomerServiceFaqCandidate[]> {
      const started=Date.now();
      let lookupQuery=query;
      const queryKey=query.trim().toLocaleLowerCase().replace(/[\s?？!！,，。:：;；、]+/g,"");
      if (!ragConfig.forceOff && repairRewrite?.queryKey===queryKey) lookupQuery=repairRewrite.canonicalQuestion;
      else if (!ragConfig.forceOff && environment) {
        try {
          const repaired=await ragRpc(db,"customer_service_verified_rewrite",
            {p_environment:environment,p_query:query},Math.min(1_000,remaining(1_000)));
          if (typeof repaired==="string" && repaired.trim()) lookupQuery=repaired.trim();
        } catch { /* Missing migration or unavailable rule must preserve the original query. */ }
      }
      if (lookupQuery!==query) emit({stage:"rewrite",status:"ok",code:"verified_faq_rewrite",
        elapsedMs:Date.now()-started,queryHash:await fingerprint(query),
        rewrittenQueryHash:await fingerprint(lookupQuery)});
      const lexicalRequest = async ():Promise<RagLeg> => {
        const time=Date.now();
        try {
          if (Date.now()>=deadlineAt) throw new Error("rag_deadline");
          const data=await ragRpc(db,"search_published_customer_faqs",{p_query:lookupQuery,p_limit:ragConfig.enableRagV2?ragConfig.lexicalTopK:legacyLimit},remaining(3_000));
          return {status:"ok",code:"lexical_ok",elapsedMs:Date.now()-time,candidates:records(data)};
        } catch { return {status:"error",code:"lexical_error",elapsedMs:Date.now()-time,candidates:[]}; }
      };
      let profile:string|undefined;
      const vectorRequest = async ():Promise<RagLeg> => {
        const time=Date.now();
        if (!ragConfig.enableRagV2 || !embeddingConfig.enabled) return {status:"skipped",code:ragConfig.enableRagV2?"embedding_disabled":"legacy_mode",elapsedMs:0,candidates:[]};
        try {
          if (Date.now()>=deadlineAt) throw new Error("rag_deadline");
          if (embeddingConfig.dimensions!==CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS) throw new CustomerServiceEmbeddingError("embedding_storage_dimension_mismatch");
          profile=await customerServiceEmbeddingProfile(embeddingConfig);
          const [vector]=await embedCustomerServiceTexts([lookupQuery],{config:{...embeddingConfig,maxRetries:0,timeoutMs:remaining(Math.min(4_000,embeddingConfig.timeoutMs))},fetchImpl,deadlineAt});
          const data=await ragRpc(db,"search_published_customer_faqs_by_vector_v2",{
            p_query_embedding:JSON.stringify(vector),p_model:embeddingConfig.model,p_profile:profile,
            p_limit:ragConfig.vectorTopK,p_threshold:ragConfig.vectorThreshold,
          },remaining(3_000));
          return {status:"ok",code:"vector_ok",elapsedMs:Date.now()-time,candidates:records(data)};
        } catch(error) { return {status:"error",code:error instanceof CustomerServiceEmbeddingError?error.code:"vector_error",elapsedMs:Date.now()-time,candidates:[]}; }
      };
      const [lexical,vector]=await Promise.all([lexicalRequest(),vectorRequest()]);
      const noCandidates = lexical.candidates.length === 0 && vector.candidates.length === 0;
      const error = (lexical.status === "error" && vector.status !== "ok") ||
        (noCandidates && (lexical.status === "error" || vector.status === "error"));
      const degraded=ragConfig.enableRagV2 && (lexical.status!=="ok" || vector.status!=="ok");
      const fused: Array<CustomerServiceFaqCandidate & Partial<CustomerServiceFaqRanked>> = ragConfig.enableRagV2 ? fuseCustomerFaqCandidates(lexical.candidates,vector.candidates,{
        rrfK:ragConfig.rrfK,vectorWeight:ragConfig.vectorWeight,lexicalWeight:ragConfig.lexicalWeight,
        limit:ragConfig.lexicalTopK+ragConfig.vectorTopK,
      }) : lexical.candidates;
      emit({stage:"retrieval",status:error?"error":degraded?"degraded":"ok",code:error?"retrieval_error":fused.length?"retrieved":degraded?"degraded_empty":"no_match",
        elapsedMs:Date.now()-started,queryHash:await fingerprint(query),profile,
        lexical:legMetadata(lexical),vector:legMetadata(vector),
        candidates:fused.map((c,i)=>({id:c.id,rank:i+1,
          ...(typeof c.rrfScore === "number"?{rrfScore:c.rrfScore,lexicalRank:c.lexicalRank??null,vectorRank:c.vectorRank??null}:{})})),
      });
      if(error) throw new CustomerServiceRetrievalError();
      return ragConfig.enableRagV2?fused.slice(0,ragConfig.finalTopK):fused;
    },
    async answerFaqWithModel(query: string,candidates: Array<{id:string;category?:string;question:string;answer:string}>,rewrittenQuery?:string) {
      if(!candidates.length) return null;
      const started=Date.now();
      if(Date.now()>=deadlineAt) return null;
      try {
        const primary={...tiers.primary,timeoutMs:remaining(tiers.primary.timeoutMs)};
        // A shared remaining deadline is enforced by the composer, including fallback.
        const result=await answerCustomerServiceFaqWithTieredAi({question:query,rewrittenQuestion:rewrittenQuery??"",recentMessages:history,
          faqs:candidates.map(c=>({...c,category:c.category||"general"})),groundedClarification:ragConfig.enableGroundedClarification,
          tiers:{...tiers,primary},fetchImpl,deadlineAt});
        emit({stage:"answer",status:result?"ok":"skipped",code:result?"answered":"no_supported_answer",elapsedMs:Date.now()-started,
          queryHash:await fingerprint(query),selectedSourceIds:result?.sourceIds??[]});
        return result;
      } catch {
        emit({stage:"answer",status:"error",code:"answer_provider_error",elapsedMs:Date.now()-started,queryHash:await fingerprint(query)});
        return null;
      }
    },
  };
}
