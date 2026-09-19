import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyCustomerServiceWithTieredAi, customerServiceAiConfig, type CustomerServiceAiTierConfig, type CustomerServiceIntentConfig } from "../_shared/customer-service-ai.ts";
import { answerCustomerServiceFaqForEvaluation, type CustomerServiceBotDeps } from "../_shared/customer-service-bot.ts";
import { classifyCustomerServiceMessage } from "../_shared/customer-service-intents.ts";
import { sanitizeCustomerServiceRecentMessages, type CustomerServiceRecentMessage } from "../_shared/customer-service-context.ts";
import { customerServiceRagConfig } from "../_shared/customer-service-rag-config.ts";
import { createCustomerServiceFaqRagDeps, type RagTrace } from "../_shared/customer-service-rag-runtime.ts";
import { ragRecallAtK, meanKnown, ragAnswerTextSimilarity } from "../_shared/customer-service-rag-evaluation.ts";
import { ragRpc } from "../_shared/customer-service-rag-db.ts";

const CORS_HEADERS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...CORS_HEADERS,"Content-Type":"application/json"}});}
function env(name:string){return Deno.env.get(name)?.trim()||"";}
function serviceKey(){
  const key=env("SUPABASE_SERVICE_ROLE_KEY");if(key)return key;
  const keys=JSON.parse(env("SUPABASE_SECRET_KEYS")||"{}") as Record<string,string>;
  if(!keys.default)throw new Error("service_configuration_missing");return keys.default;
}
type ConfigRow={id:string;environment:string;model:string;fallback_model:string|null;fallback_enabled:boolean;escalation_confidence:number;system_prompt:string;temperature:number;retrieval_limit:number;rag_config:unknown};
type Sample={question:string;reference:string;intent:string|null;dialogAction:string|null;recentMessages:CustomerServiceRecentMessage[];expectedFaqIds:string[]|null};
type PermissionRow={intent_key:string;tool_key:string};
type IntentRow={intent_key:string;display_name:string;description:string;examples:string[];action_key:string;confidence_threshold:number};
type TestCaseRow={messages:unknown;expected_answer:string|null;expected_intent:string|null;expected_dialog_action:string|null;expected_faq_ids:string[]|null};
const CONFIG_COLUMNS="id,environment,model,fallback_model,fallback_enabled,escalation_confidence,system_prompt,temperature,retrieval_limit,rag_config";
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response("ok",{headers:CORS_HEADERS});
 if(request.method!=="POST")return json({error:"method_not_allowed"},405);
 const authorization=request.headers.get("authorization")?.trim()||"";
 if(!/^Bearer\s+\S+/i.test(authorization))return json({error:"authentication_required"},401);
 let runId:string|null=null;
 let admin:ReturnType<typeof createClient>|null=null;
 try{
  const url=env("SUPABASE_URL");
  const user=createClient(url,env("SUPABASE_ANON_KEY"),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {error:accessError}=await user.rpc("customer_service_edit_access_check");
  if(accessError)return json({error:"page_access_required"},403);
  let payload:Record<string,unknown>;
  try{payload=await request.json();if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new Error();}catch{return json({error:"invalid_json"},400);}
  const configId=typeof payload.config_id==="string"?payload.config_id:"";
  if(!configId)return json({error:"config_id_required"},400);
  const requested=Number(payload.sample_size??5);
  if(!Number.isFinite(requested)||requested<1)return json({error:"invalid_sample_size"},400);
  const sampleLimit=Math.min(10,Math.trunc(requested));
  const offset=Math.max(0,Math.trunc(Number(payload.offset)||0));
  admin=createClient(url,serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:candidateData,error:configError}=await admin.from("customer_service_config_versions").select(CONFIG_COLUMNS).eq("id",configId).single();
  if(configError||!candidateData)return json({error:"config_not_found"},404);
  const candidate=candidateData as ConfigRow;
  const {data:baselineData,error:baselineError}=await admin.from("customer_service_config_versions").select(CONFIG_COLUMNS).eq("environment",candidate.environment).eq("status","active").maybeSingle();
  if(baselineError)throw new Error("baseline_load_failed");
  const baseline=baselineData as ConfigRow|null;
  const {data:authData}=await user.auth.getUser();
  const {data:run,error:runError}=await admin.from("customer_service_evaluation_runs").insert({
    environment:candidate.environment,candidate_config_id:candidate.id,baseline_config_id:baseline?.id??null,status:"running",requested_by:authData.user?.id??null,started_at:new Date().toISOString(),
  }).select("id").single();
  if(runError||!run)throw new Error("evaluation_run_create_failed");runId=String(run.id);
  const [testResult,feedbackResult,intentResult,permissionResult]=await Promise.all([
    admin.from("customer_service_test_cases").select("messages,expected_intent,expected_dialog_action,expected_answer,expected_faq_ids").eq("status","active").order("created_at",{ascending:false}).range(offset,offset+sampleLimit-1),
    admin.from("customer_service_turn_feedback").select("verdict,corrected_answer,customer_service_turns!inner(question,answer,intent,environment)")
      .in("verdict",["correct","incorrect"]).eq("include_in_learning",true).eq("customer_service_turns.environment",candidate.environment).order("reviewed_at",{ascending:false}).range(offset,offset+sampleLimit-1),
    admin.from("customer_service_intents").select("intent_key,display_name,description,examples,action_key,confidence_threshold").eq("enabled",true).order("priority"),
    admin.from("customer_service_tool_permissions").select("intent_key,tool_key").eq("allowed",true),
  ]);
  if(testResult.error||feedbackResult.error||intentResult.error||permissionResult.error)throw new Error("evaluation_samples_load_failed");
  const tools=new Map<string,string[]>();
  for(const r of (permissionResult.data??[]) as PermissionRow[])tools.set(r.intent_key,[...(tools.get(r.intent_key)??[]),r.tool_key]);
  const intents:CustomerServiceIntentConfig[]=((intentResult.data??[]) as IntentRow[]).map(r=>({intentKey:r.intent_key,displayName:r.display_name,description:r.description,examples:r.examples??[],actionKey:r.action_key,confidenceThreshold:Number(r.confidence_threshold),toolKeys:tools.get(r.intent_key)??[]}));
  const samples:Sample[]=((testResult.data??[]) as TestCaseRow[]).map(r=>{
    const messages=(Array.isArray(r.messages)?r.messages:[]).filter((m:unknown):m is CustomerServiceRecentMessage=>Boolean(m)&&typeof m==="object"&&["customer","assistant","human"].includes(String((m as CustomerServiceRecentMessage).role))&&typeof (m as CustomerServiceRecentMessage).text==="string");
    const index=messages.map(m=>m.role).lastIndexOf("customer");
    return {question:index>=0?messages[index].text:"",reference:r.expected_answer??"",intent:r.expected_intent??null,dialogAction:r.expected_dialog_action??null,
      recentMessages:sanitizeCustomerServiceRecentMessages(messages.slice(0,Math.max(0,index))),expectedFaqIds:Array.isArray(r.expected_faq_ids)?r.expected_faq_ids:null};
  }).filter(s=>s.question);
  if(!samples.length)for(const row of feedbackResult.data??[]){
    const turn=row.customer_service_turns as unknown as {question:string;answer:string|null;intent:string|null};
    if(turn?.question)samples.push({question:turn.question,reference:row.verdict==="incorrect"?row.corrected_answer||"":turn.answer||"",intent:turn.intent,dialogAction:null,recentMessages:[],expectedFaqIds:null});
  }
  if(!samples.length)throw new Error("no_reviewed_samples");
  const snapshotBefore=await ragRpc(admin,"customer_service_faq_index_snapshot",{});
  const deadlineAt=Date.now()+50_000;
  const baseConfig=customerServiceAiConfig();
  const execute=async(sample:Sample,version:ConfigRow)=>{
    const traces:RagTrace[]=[];
    const cfg={...baseConfig,model:version.model,systemPrompt:version.system_prompt,temperature:Number(version.temperature),timeoutMs:Math.max(1,Math.min(baseConfig.timeoutMs,deadlineAt-Date.now()))};
    const tiers:CustomerServiceAiTierConfig={primary:cfg,fallback:version.fallback_enabled?{...cfg,model:version.fallback_model||"grok-4.5",reasoningEffort:"low"}:null,escalationConfidence:Number(version.escalation_confidence??0.72)};
    const forbidden=async():Promise<never>=>{throw new Error("evaluation_side_effect_forbidden");};
    const deps:CustomerServiceBotDeps={lookupOrders:forbidden,lookupOrderItems:forbidden,verifyOrderIdentity:forbidden,writeInquiry:forbidden,queueHandoff:forbidden,cancelHandoff:forbidden,
      ...createCustomerServiceFaqRagDeps({db:admin!,ragConfig:customerServiceRagConfig(version),tiers,recentMessages:sample.recentMessages,legacyLimit:version.retrieval_limit,onTrace:t=>traces.push(t),deadlineAt})};
    const started=Date.now();
    // Exactly the production FAQ subpipeline, including question splitting and the final guards.
    // This is NOT an end-to-end replay of business actions or the webhook transport.
    const [turn,classification]=await Promise.all([
      answerCustomerServiceFaqForEvaluation(deps,classifyCustomerServiceMessage(sample.question),{phone_normalized:"evaluation",state:"identifying",selected_order_id:null,handoff_at:null,pending_request:null,recent_messages:sample.recentMessages},sample.question),
      classifyCustomerServiceWithTieredAi({message:sample.question,conversationState:"identifying",recentMessages:sample.recentMessages,intents,
        tiers:{...tiers,primary:{...tiers.primary,timeoutMs:Math.min(5_000,tiers.primary.timeoutMs)},fallback:null}}).catch(()=>null),
    ]);
    const answered=Boolean(turn.faqSourceIds?.length&&turn.reply);
    const similarity=sample.reference&&answered?ragAnswerTextSimilarity(turn.reply??"",sample.reference):0;
    return {answered,similarity,recall5:ragRecallAtK(traces,sample.expectedFaqIds),
      intentMatched:sample.intent?classification?.intentKey===sample.intent:null,
      dialogMatched:sample.dialogAction?classification?.dialogAction===sample.dialogAction:null,
      unsupportedAnswer:sample.expectedFaqIds?.length===0&&answered,
      retrievalError:traces.some(t=>t.stage==="retrieval"&&t.status==="error"),
      degraded:traces.some(t=>t.stage==="retrieval"&&t.status==="degraded"),
      elapsedMs:Date.now()-started,sourceIds:turn.faqSourceIds??[],failureReason:turn.failureReason??null,traces};
  };
  const results:Array<{candidate:Awaited<ReturnType<typeof execute>>;baseline:Awaited<ReturnType<typeof execute>>|null}>=[];
  for(const sample of samples){
    if(deadlineAt-Date.now()<5_000)break;
    const [c,b]=await Promise.all([execute(sample,candidate),baseline&&baseline.id!==candidate.id?execute(sample,baseline):Promise.resolve(null)]);
    results.push({candidate:c,baseline:baseline?.id===candidate.id?c:b});
  }
  if(!results.length)throw new Error("evaluation_deadline");
  const aggregate=(items:Array<Awaited<ReturnType<typeof execute>>>)=>({
    reviewed_samples:items.length,answered:items.filter(i=>i.answered).length,
    answered_rate:items.filter(i=>i.answered).length/items.length,
    average_similarity:items.reduce((s,i)=>s+i.similarity,0)/items.length,
    agreement_rate:items.filter(i=>i.similarity>=0.25).length/items.length,
    agreement_is_textual:1, // Never expose this as factual correctness.
    intent_accuracy:meanKnown(items.map(i=>i.intentMatched===null?null:Number(i.intentMatched))),
    dialog_action_accuracy:meanKnown(items.map(i=>i.dialogMatched===null?null:Number(i.dialogMatched))),
    recall_at_5:meanKnown(items.map(i=>i.recall5)),recall_labelled_samples:items.filter(i=>i.recall5!==null).length,
    unexpected_answer_count:items.filter(i=>i.unsupportedAnswer).length,
    retrieval_error_count:items.filter(i=>i.retrievalError).length,degraded_retrieval_count:items.filter(i=>i.degraded).length,
    average_latency_ms:items.reduce((s,i)=>s+i.elapsedMs,0)/items.length,evaluation_pipeline_version:2,
  });
  const metrics=aggregate(results.map(r=>r.candidate));
  const baseResults=results.flatMap(r=>r.baseline?[r.baseline]:[]);
  const baseMetrics=baseResults.length?aggregate(baseResults):null;
  const snapshotAfter=await ragRpc(admin,"customer_service_faq_index_snapshot",{});
  const knowledgeUnchanged=snapshotBefore===snapshotAfter;
  const comparison={baseline_config_id:baseline?.id??null,paired_same_samples:true,knowledge_unchanged:knowledgeUnchanged,
    agreement_rate_delta:knowledgeUnchanged&&baseMetrics?metrics.agreement_rate-baseMetrics.agreement_rate:null,
    recall_at_5_delta:knowledgeUnchanged&&baseMetrics?.recall_at_5!==null&&baseMetrics?.recall_at_5!==undefined&&metrics.recall_at_5!==null?metrics.recall_at_5-baseMetrics.recall_at_5:null,
    baseline_metrics:baseMetrics,requested_samples:samples.length,processed_samples:results.length,
    complete_sample_set:results.length===samples.length,next_offset:results.length<samples.length?offset+results.length:null,
    evaluation_scope:"production_faq_subpipeline",manual_factual_review_required:true};
  const {error:saveError}=await admin.from("customer_service_evaluation_runs").update({status:"complete",sample_size:results.length,metrics,comparison,
    rag_details:results,completed_at:new Date().toISOString()}).eq("id",runId);
  if(saveError)throw new Error("evaluation_save_failed");
  return json({ok:true,run_id:runId,metrics,comparison});
 }catch(error){
  const code=error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:"evaluation_failed";
  if(admin&&runId)await admin.from("customer_service_evaluation_runs").update({status:"failed",error:code,completed_at:new Date().toISOString()}).eq("id",runId);
  return json({error:code,run_id:runId},500);
 }
});
