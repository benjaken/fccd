import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { composeGroundedFaqReply, faqTextIsGrounded, NEUTRAL_FAQ_CLARIFICATION } from "../supabase/functions/_shared/customer-service-grounding.ts";
import { customerServiceEmbeddingProfile, embedCustomerServiceTexts, type CustomerServiceEmbeddingConfig } from "../supabase/functions/_shared/customer-service-embedding.ts";
import { runFaqEmbeddingBackfill, type ClaimedFaqEmbedding } from "../supabase/functions/_shared/customer-service-embedding-backfill.ts";
import { createCustomerServiceFaqRagDeps, CustomerServiceRetrievalError, type RagTrace } from "../supabase/functions/_shared/customer-service-rag-runtime.ts";
import { customerServiceRagConfig, type CustomerServiceRagConfig } from "../supabase/functions/_shared/customer-service-rag-config.ts";
import { ragRecallAtK, meanKnown } from "../supabase/functions/_shared/customer-service-rag-evaluation.ts";
import { answerCustomerServiceFaqWithAi, answerCustomerServiceFaqWithTieredAi } from "../supabase/functions/_shared/customer-service-ai.ts";
import type { CustomerServiceRagDatabase } from "../supabase/functions/_shared/customer-service-rag-db.ts";

const vector=(n=1)=>Array.from({length:1024},()=>n/100);
const ark:CustomerServiceEmbeddingConfig={enabled:true,apiStyle:"ark_multimodal",endpoint:"https://embedding.example.test/multimodal",apiKey:"test-key",model:"doubao-test",dimensions:1024,sendDimensions:true,timeoutMs:2000,batchSize:10,concurrency:3,maxRetries:0};
const ai={enabled:true,endpoint:"https://chat.example.test/completions",apiKey:"mock-key",model:"mock-primary",timeoutMs:2000};
const rag:CustomerServiceRagConfig={enableRagV2:true,enableQueryRewrite:false,enableGroundedClarification:true,contextRounds:5,lexicalTopK:20,vectorTopK:20,finalTopK:5,rrfK:60,vectorWeight:0.7,lexicalWeight:0.3,vectorThreshold:0.45};
const faq={id:"refund",category:"payment",question:"退款流程",answer:"一般 7 個工作天處理。"};
const response=(payload:unknown)=>new Response(JSON.stringify(payload),{status:200});
const modelResponse=(payload:unknown)=>response({choices:[{message:{content:JSON.stringify(payload)}}]});

// No API keys from environment, network, DB, order writes or WhatsApp delivery.
describe("RAG review fixes: independent embedding samples",()=>{
 for(const count of [2,10,25]) it(`keeps ${count} Ark FAQs independent and ordered`,async()=>{
  let calls=0,active=0,maxActive=0;
  const fetchImpl:typeof fetch=async(_url,init)=>{
   const body=JSON.parse(String(init?.body));calls++;active++;maxActive=Math.max(active,maxActive);
   assert.equal(body.input.length,1,"Ark input parts must never be a FAQ batch");
   const number=Number(body.input[0].text);
   await new Promise(r=>setTimeout(r,number%3));active--;
   return response({data:{object:"embedding",embedding:vector(number)}});
  };
  const result=await embedCustomerServiceTexts(Array.from({length:count},(_,i)=>String(i+1)),{config:ark,fetchImpl});
  assert.equal(calls,count);assert.ok(maxActive<=3);
  assert.deepEqual(result.map(v=>v[0]),Array.from({length:count},(_,i)=>(i+1)/100));
 });
 it("keeps OpenAI batch row indices aligned",async()=>{
  const result=await embedCustomerServiceTexts(["a","b"],{config:{...ark,apiStyle:"openai",batchSize:2},fetchImpl:async()=>response({data:[{index:1,embedding:vector(2)},{index:0,embedding:vector(1)}]})});
  assert.deepEqual(result.map(v=>v[0]),[0.01,0.02]);
 });
 it("rejects duplicate OpenAI indices",async()=>{
  await assert.rejects(embedCustomerServiceTexts(["a","b"],{config:{...ark,apiStyle:"openai"},fetchImpl:async()=>response({data:[{index:0,embedding:vector()},{index:0,embedding:vector()}]})}),/index_mismatch/);
 });
 for(const [name,embedding] of [["wrong dimension",[1,2]],["null coordinate",[null,...vector().slice(1)]],["zero vector",vector(0)]] as const) it(`rejects ${name}`,async()=>{
  await assert.rejects(embedCustomerServiceTexts(["a"],{config:ark,fetchImpl:async()=>response({data:{embedding}})}));
 });
 it("retries 429, but does not retry 401",async()=>{
  let tries=0;
  await embedCustomerServiceTexts(["a"],{config:{...ark,maxRetries:1},fetchImpl:async()=>++tries===1?new Response("",{status:429}):response({data:{embedding:vector()}})});
  assert.equal(tries,2);tries=0;
  await assert.rejects(embedCustomerServiceTexts(["a"],{config:{...ark,maxRetries:2},fetchImpl:async()=>{tries++;return new Response("",{status:401});}}),/401/);
  assert.equal(tries,1);
 });
 it("does not start an expired operation",async()=>{
  let calls=0;await assert.rejects(embedCustomerServiceTexts(["a"],{config:ark,deadlineAt:Date.now()-1,fetchImpl:async()=>{calls++;throw new Error();}}),/deadline/);assert.equal(calls,0);
 });
 it("isolates models/dimensions/endpoints, but not credential rotation",async()=>{
  const p=await customerServiceEmbeddingProfile(ark);
  assert.match(p,/^[a-f0-9]{64}$/);
  assert.equal(p,await customerServiceEmbeddingProfile({...ark,apiKey:"rotated"}));
  for(const patch of [{model:"other"},{dimensions:512},{endpoint:"https://other.example.test/embed"}]) assert.notEqual(p,await customerServiceEmbeddingProfile({...ark,...patch}));
 });
});

function backfillDb(claims:ClaimedFaqEmbedding[],options:{rejectCompletion?:boolean;supersede?:boolean}={}){
 const completed:string[]=[],released:string[]=[],calls:string[]=[];
 let claimed=false;
 const db:CustomerServiceRagDatabase={rpc:async(name,args={})=>{
  calls.push(name);
  if(name==="customer_service_claim_faq_embeddings"){assert.match(String(args.p_profile),/^[a-f0-9]{64}$/);const rows=claimed?[]:claims;claimed=true;return {data:rows,error:null};}
  if(name==="customer_service_complete_faq_embedding"){
   assert.equal(JSON.parse(String(args.p_vector)).length,1024);assert.ok(args.p_claim_token);assert.ok(args.p_revision);
   if(options.rejectCompletion)return {data:null,error:{message:"write failed"}};
   if(options.supersede)return {data:false,error:null};
   completed.push(String(args.p_id));return {data:true,error:null};
  }
  if(name==="customer_service_release_faq_embedding"){released.push(String(args.p_id));return {data:!options.supersede,error:null};}
  throw new Error(`Unexpected RPC ${name}`);
 }};
 return {db,completed,released,calls};
}
const claims=(n:number):ClaimedFaqEmbedding[]=>Array.from({length:n},(_,i)=>({id:`faq-${i}`,question:String(i),aliases:[],revision:1,claim_token:`token-${i}`}));
describe("RAG review fixes: backfill progress and CAS",()=>{
 it("saves successes when another FAQ fails",async()=>{
  const state=backfillDb(claims(3));
  const result=await runFaqEmbeddingBackfill({db:state.db,config:ark,fetchImpl:async(_url,init)=>{
   const text=JSON.parse(String(init?.body)).input[0].text;
   return text==="1"?new Response("",{status:500}):response({data:{embedding:vector()}});
  }});
  assert.equal(result.embedded,2);assert.equal(result.failed,1);assert.equal(state.completed.length,2);assert.equal(state.released.length,1);
 });
 it("does not report a superseded revision ready",async()=>{
  const state=backfillDb(claims(1),{supersede:true});
  const result=await runFaqEmbeddingBackfill({db:state.db,config:ark,fetchImpl:async()=>response({data:{embedding:vector()}})});
  assert.equal(result.embedded,0);assert.equal(result.superseded,1);
 });
 it("does not count a failed DB commit as embedded",async()=>{
  const state=backfillDb(claims(1),{rejectCompletion:true});
  const result=await runFaqEmbeddingBackfill({db:state.db,config:ark,fetchImpl:async()=>response({data:{embedding:vector()}})});
  assert.equal(result.embedded,0);assert.equal(result.failed,1);
 });
 it("does not duplicate a leased claim across concurrent jobs (adapter contract)",async()=>{
  const state=backfillDb(claims(2));let calls=0;
  const fetchImpl:typeof fetch=async()=>{calls++;return response({data:{embedding:vector()}});};
  const results=await Promise.all([runFaqEmbeddingBackfill({db:state.db,config:ark,fetchImpl}),runFaqEmbeddingBackfill({db:state.db,config:ark,fetchImpl})]);
  assert.equal(calls,2);assert.equal(results.reduce((s,r)=>s+r.embedded,0),2);
 });
 it("defers work without calling the provider when the job budget is spent",async()=>{
  const state=backfillDb(claims(2));let calls=0;
  const result=await runFaqEmbeddingBackfill({db:state.db,config:ark,deadlineAt:Date.now()+500,fetchImpl:async()=>{calls++;throw new Error();}});
  assert.equal(calls,0);assert.equal(result.deferred,2);
 });
 it("rejects storage dimensions and ambiguous force before claiming",async()=>{
  const state=backfillDb(claims(1));
  await assert.rejects(runFaqEmbeddingBackfill({db:state.db,config:{...ark,dimensions:1536}}),/storage_dimension/);
  await assert.rejects(runFaqEmbeddingBackfill({db:state.db,config:ark,force:true}),/force_requires_faq_ids/);
  assert.equal(state.calls.length,0);
 });
});

describe("RAG review fixes: final composed FAQ grounding",()=>{
 it("blocks an unsupported number added through clarification",()=>{
  assert.equal(composeGroundedFaqReply(faq.answer,"手續費 HK$9999，接受嗎？",[faq]),null);
 });
 it("blocks an unsupported URL in either field",()=>{
  assert.equal(composeGroundedFaqReply(faq.answer,"請使用 https://evil.example/pay，好嗎？",[faq]),null);
  assert.equal(composeGroundedFaqReply("請到 https://evil.example/pay","",[faq]),null);
 });
 it("replaces arbitrary policy-like clarification with a neutral application question",()=>{
  const result=composeGroundedFaqReply(faq.answer,"退款不設手續費，是否同意？",[faq]);
  assert.equal(result?.clarificationQuestion,NEUTRAL_FAQ_CLARIFICATION);
  assert.equal(result?.answer.includes("不設手續費"),false);
 });
 it("does not double-append when parser and bot both guard",()=>{
  const first=composeGroundedFaqReply(faq.answer,NEUTRAL_FAQ_CLARIFICATION,[faq])!;
  assert.deepEqual(composeGroundedFaqReply(first.answer,first.clarificationQuestion,[faq]),first);
 });
 it("keeps thousands separators, rejects number substrings, and requires a source",()=>{
  assert.equal(faqTextIsGrounded("HK$2,800",[{question:"價錢",answer:"HK$2800"}]),true);
  assert.equal(faqTextIsGrounded("HK$80",[{question:"價錢",answer:"HK$2800"}]),false);
  assert.equal(faqTextIsGrounded("可以。",[]),false);
 });
 it("rejects the original clarification bypass in the actual AI parser",async()=>{
  const result=await answerCustomerServiceFaqWithAi({question:"退款？",faqs:[faq],groundedClarification:true,config:ai,
   fetchImpl:async()=>modelResponse({answer:faq.answer,sourceIds:[faq.id],needsClarification:true,clarificationQuestion:"收 HK$9999 可以嗎？"})});
  assert.equal(result,null);
 });
 it("returns already-validated combined text from the parser",async()=>{
  const result=await answerCustomerServiceFaqWithAi({question:"退款？",faqs:[faq],groundedClarification:true,config:ai,
   fetchImpl:async()=>modelResponse({answer:faq.answer,sourceIds:[faq.id],needsClarification:true,clarificationQuestion:"退款不設手續費，可以嗎？"})});
  assert.ok(result?.answer.includes(NEUTRAL_FAQ_CLARIFICATION));assert.ok(!result?.answer.includes("不設手續費"));
 });
 it("does not start a tiered answer after its deadline",async()=>{
  let calls=0;const result=await answerCustomerServiceFaqWithTieredAi({question:"退款",faqs:[faq],tiers:{primary:ai,fallback:ai,escalationConfidence:0.7},deadlineAt:Date.now()-1,fetchImpl:async()=>{calls++;throw new Error();}});
  assert.equal(result,null);assert.equal(calls,0);
 });
});

function retrievalDb(options:{lexicalError?:boolean;vectorError?:boolean;empty?:boolean}={}){
 const calls:Array<{name:string;args:Record<string,unknown>}> = [];
 const db:CustomerServiceRagDatabase={rpc:async(name,args={})=>{
  calls.push({name,args});
  if(name==="search_published_customer_faqs")return {data:options.empty?[]:[faq],error:options.lexicalError?{message:"offline"}:null};
  if(name==="search_published_customer_faqs_by_vector_v2")return {data:options.empty?[]:[faq],error:options.vectorError?{message:"offline"}:null};
  throw new Error(`Unexpected read RPC ${name}`);
 }};
 return {db,calls};
}
describe("RAG review fixes: shared live/evaluation retrieval",()=>{
 it("executes lexical, query embedding and model-scoped vector RPC",async()=>{
  const state=retrievalDb();const traces:RagTrace[]=[];
  const deps=createCustomerServiceFaqRagDeps({db:state.db,ragConfig:rag,tiers:{primary:ai,escalationConfidence:0.7},embeddingConfig:ark,onTrace:t=>traces.push(t),fetchImpl:async()=>response({data:{embedding:vector()}})});
  assert.equal((await deps.searchFaqs("PRIVATE customer@example.test")).length,1);
  assert.deepEqual(state.calls.map(c=>c.name),["search_published_customer_faqs","search_published_customer_faqs_by_vector_v2"]);
  assert.equal(state.calls[1].args.p_model,ark.model);assert.match(String(state.calls[1].args.p_profile),/^[a-f0-9]{64}$/);
  assert.ok(traces.find(t=>t.stage==="retrieval")?.candidates?.[0].rrfScore);
  const logged=JSON.stringify(traces);assert.ok(!logged.includes("customer@example.test"));assert.ok(!logged.includes(ark.apiKey));assert.ok(!logged.includes(faq.answer));
 });
 it("allows either retrieval leg to fail without losing the other",async()=>{
  for(const options of [{lexicalError:true},{vectorError:true}]){
   const state=retrievalDb(options);const traces:RagTrace[]=[];
   const deps=createCustomerServiceFaqRagDeps({db:state.db,ragConfig:rag,tiers:{primary:ai,escalationConfidence:0.7},embeddingConfig:ark,onTrace:t=>traces.push(t),fetchImpl:async()=>response({data:{embedding:vector()}})});
   assert.equal((await deps.searchFaqs("退款")).length,1);assert.equal(traces.at(-1)?.status,"degraded");
  }
 });
 it("distinguishes a total retrieval outage from a valid no-match",async()=>{
  for(const failed of [true,false]){
   const state=retrievalDb(failed?{lexicalError:true,vectorError:true}:{empty:true});const traces:RagTrace[]=[];
   const deps=createCustomerServiceFaqRagDeps({db:state.db,ragConfig:rag,tiers:{primary:ai,escalationConfidence:0.7},embeddingConfig:ark,onTrace:t=>traces.push(t),fetchImpl:async()=>response({data:{embedding:vector()}})});
   if(failed)await assert.rejects(deps.searchFaqs("退款"),CustomerServiceRetrievalError);
   else assert.deepEqual(await deps.searchFaqs("退款"),[]);
   assert.equal(traces.at(-1)?.code,failed?"retrieval_error":"no_match");
  }
 });
 it("does not call an embedding provider in legacy mode",async()=>{
  const state=retrievalDb();let calls=0;
  const deps=createCustomerServiceFaqRagDeps({db:state.db,ragConfig:{...rag,enableRagV2:false},tiers:{primary:ai,escalationConfidence:0.7},embeddingConfig:ark,onTrace:()=>{},fetchImpl:async()=>{calls++;throw new Error();}});
  assert.equal((await deps.searchFaqs("退款")).length,1);assert.equal(calls,0);assert.equal(state.calls.length,1);
 });
 it("passes only selected candidates and history to the answer composer",async()=>{
  let payload:Record<string,unknown>|undefined;
  const deps=createCustomerServiceFaqRagDeps({db:retrievalDb().db,ragConfig:rag,tiers:{primary:ai,escalationConfidence:0.7},embeddingConfig:ark,
   recentMessages:[{role:"customer",text:"退款安排"}],onTrace:()=>{},fetchImpl:async(_url,init)=>{
    const body=JSON.parse(String(init?.body));payload=JSON.parse(body.messages[1].content);
    return modelResponse({answer:faq.answer,sourceIds:[faq.id]});
   }});
  const result=await deps.answerFaqWithModel("幾耐？",[faq],"退款多久處理？");
  assert.equal(result?.sourceIds[0],faq.id);assert.deepEqual((payload?.publishedFaqs as unknown[]).length,1);
  assert.equal((payload?.recentMessages as unknown[]).length,1);assert.equal(payload?.question,"幾耐？");
 });
 it("does not promote missing FAQ labels into a fake recall result",()=>{
  const traces:RagTrace[]=[{traceId:"test",stage:"retrieval",status:"ok",code:"retrieved",elapsedMs:1,candidates:[{id:"a",rank:1},{id:"b",rank:6}]}];
  assert.equal(ragRecallAtK(traces,null),null);assert.equal(ragRecallAtK(traces,[]),null);
  assert.equal(ragRecallAtK(traces,["a","b"]),0.5);assert.equal(meanKnown([null,0.5,1]),0.75);assert.equal(meanKnown([null]),null);
 });
});

describe("RAG review fixes: effective configuration",()=>{
 function usingEnv(values:Record<string,string>,run:()=>void){
  const target=globalThis as typeof globalThis & {Deno?:unknown};
  const prior=Object.getOwnPropertyDescriptor(target,"Deno");
  Object.defineProperty(target,"Deno",{value:{env:{get:(name:string)=>values[name]??""}},configurable:true});
  try{run();}finally{if(prior)Object.defineProperty(target,"Deno",prior);else delete target.Deno;}
 }
 it("does not parse a blank env string as zero",()=>usingEnv({},()=>{
  const config=customerServiceRagConfig();assert.equal(config.contextRounds,5);assert.equal(config.rrfK,60);assert.equal(config.vectorWeight,0.7);
 }));
 it("bounds environment values and disallows an all-zero ranking",()=>usingEnv({CUSTOMER_SERVICE_CONTEXT_ROUNDS:"999",CUSTOMER_SERVICE_RRF_K:"-10",CUSTOMER_SERVICE_VECTOR_WEIGHT:"0",CUSTOMER_SERVICE_LEXICAL_WEIGHT:"0"},()=>{
  const config=customerServiceRagConfig();assert.equal(config.contextRounds,8);assert.equal(config.rrfK,1);assert.ok(config.vectorWeight+config.lexicalWeight>0);
 }));
 it("emergency-off overrides active database flags",()=>usingEnv({CUSTOMER_SERVICE_RAG_FORCE_OFF:"true"},()=>{
  const config=customerServiceRagConfig({rag_config:{enable_rag_v2:true,enable_query_rewrite:true,enable_grounded_clarification:true}});
  assert.equal(config.enableRagV2,false);assert.equal(config.enableQueryRewrite,false);assert.equal(config.enableGroundedClarification,false);
 }));
 it("still permits explicitly configured A-only rollout",()=>usingEnv({},()=>{
  const config=customerServiceRagConfig({rag_config:{enable_rag_v2:false,enable_query_rewrite:true}});assert.equal(config.enableRagV2,false);assert.equal(config.enableQueryRewrite,true);
 }));
});


describe("RAG failure versus no match", () => {
 it("does not label an empty lexical result plus failed vector leg as no_match", async () => {
  const traces: RagTrace[] = [];
  const db: CustomerServiceRagDatabase = { rpc: async () => ({ data: [], error: null }) };
  const deps = createCustomerServiceFaqRagDeps({ db, ragConfig: rag, tiers: { primary: ai, escalationConfidence: 0.72 },
   embeddingConfig: ark, onTrace: trace => traces.push(trace), fetchImpl: async () => new Response("", {status: 503}) });
  await assert.rejects(deps.searchFaqs("退款？"), CustomerServiceRetrievalError);
  assert.equal(traces.find(trace => trace.stage === "retrieval")?.code, "retrieval_error");
 });
});
