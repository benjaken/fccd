import { buildFaqEmbeddingText, faqEmbeddingContentHash } from "./customer-service-embedding-content.ts";
import {
  CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS, CustomerServiceEmbeddingError,
  customerServiceEmbeddingProfile, embedCustomerServiceTexts, type CustomerServiceEmbeddingConfig,
} from "./customer-service-embedding.ts";
import { ragRpc, type CustomerServiceRagDatabase } from "./customer-service-rag-db.ts";

export type ClaimedFaqEmbedding = { id: string; question: string; aliases: string[]; revision: number; claim_token: string };
export type FaqBackfillResult = {
  scanned: number; embedded: number; failed: number; superseded: number; deferred: number;
  databaseErrors: number; profile: string; outcomes: Array<{ id: string; status: string; code?: string }>;
};

/** Claims work once, commits each success atomically, and never marks a newer revision failed. */
export async function runFaqEmbeddingBackfill({ db, config, faqIds = [], force = false, limit = 20, deadlineAt = Date.now() + 45_000, fetchImpl = fetch }: {
  db: CustomerServiceRagDatabase; config: CustomerServiceEmbeddingConfig; faqIds?: string[];
  force?: boolean; limit?: number; deadlineAt?: number; fetchImpl?: typeof fetch;
}): Promise<FaqBackfillResult> {
  if (!config.enabled || !config.apiKey || !config.model || !config.endpoint) throw new Error("embedding_not_configured");
  if (config.dimensions !== CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS) throw new Error("embedding_storage_dimension_mismatch");
  if (force && !faqIds.length) throw new Error("force_requires_faq_ids");
  const profile = await customerServiceEmbeddingProfile(config);
  const rows = await ragRpc(db, "customer_service_claim_faq_embeddings", {
    p_profile: profile, p_limit: Math.min(50, Math.max(1, Math.trunc(limit))),
    p_faq_ids: faqIds.length ? [...new Set(faqIds)] : null, p_force: force,
  }, Math.max(1, Math.min(3_000, deadlineAt - Date.now())));
  if (!Array.isArray(rows)) throw new Error("embedding_claim_invalid_response");
  const claims = rows as ClaimedFaqEmbedding[];
  if (claims.some((row) => !row?.id || typeof row.question !== "string" || !row.claim_token || !Number.isSafeInteger(row.revision) || !Array.isArray(row.aliases))) throw new Error("embedding_claim_invalid_response");
  const result: FaqBackfillResult = { scanned: claims.length, embedded: 0, failed: 0, superseded: 0, deferred: 0, databaseErrors: 0, profile, outcomes: [] };
  let next = 0;
  const release = async (claim: ClaimedFaqEmbedding, code: string | null): Promise<boolean> =>
    await ragRpc(db, "customer_service_release_faq_embedding", {
      p_id: claim.id, p_revision: claim.revision, p_claim_token: claim.claim_token, p_error: code,
    }, Math.max(1, Math.min(3_000, deadlineAt - Date.now()))) === true;
  const concurrency = Math.min(5, Math.max(1, Math.trunc(config.concurrency ?? 3)));
  await Promise.all(Array.from({ length: Math.min(concurrency, claims.length) }, async () => {
    for (;;) {
      const claim = claims[next++];
      if (!claim) return;
      try {
        // Leave headroom to release claims and commit progress before the job ends.
        if (deadlineAt - Date.now() < 2_000) {
          // Expired request: leave the claim to expire rather than start more I/O.
          if (Date.now() >= deadlineAt) {
            result.deferred++;
            result.outcomes.push({ id: claim.id, status: "deferred", code: "lease_will_expire" });
            continue;
          }
          const released = await release(claim, null);
          if (released) result.deferred++; else result.superseded++;
          result.outcomes.push({ id: claim.id, status: released ? "deferred" : "superseded" });
          continue;
        }
        const text = buildFaqEmbeddingText({ question: claim.question, aliases: claim.aliases });
        const [vector] = await embedCustomerServiceTexts([text], {
          config: { ...config, concurrency: 1 }, fetchImpl, deadlineAt: deadlineAt - 1_000,
        });
        const committed = await ragRpc(db, "customer_service_complete_faq_embedding", {
          p_id: claim.id, p_revision: claim.revision, p_claim_token: claim.claim_token,
          p_vector: JSON.stringify(vector), p_model: config.model, p_profile: profile,
          p_hash: faqEmbeddingContentHash(text),
        }, Math.max(1, Math.min(3_000, deadlineAt - Date.now())));
        if (committed === true) {
          result.embedded++;
          result.outcomes.push({ id: claim.id, status: "ready" });
        } else if (committed === false) {
          result.superseded++;
          result.outcomes.push({ id: claim.id, status: "superseded" });
        } else throw new Error("embedding_completion_invalid_response");
      } catch (error) {
        const code = error instanceof CustomerServiceEmbeddingError ? error.code : "embedding_database_or_worker_error";
        try {
          if (Date.now() >= deadlineAt) throw new Error("lease_will_expire");
          const released = await release(claim, code);
          if (released) result.failed++; else result.superseded++;
          result.outcomes.push({ id: claim.id, status: released ? "failed" : "superseded", code });
        } catch {
          // Unknown commit outcome: do NOT report success or erase an already committed row.
          // The lease expires; the next run rechecks the database's authoritative state.
          result.databaseErrors++;
          result.outcomes.push({ id: claim.id, status: "database_error", code: "embedding_database_error" });
        }
      }
    }
  }));
  return result;
}
