import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const consistency=read("supabase/migrations/20260918180000_customer_service_embedding_consistency.sql");
const settings=read("supabase/migrations/20260918181000_customer_service_rag_config_patch.sql");
// Contract/syntax-shape assertions only; NOT execution against PostgreSQL/pgvector.
describe("RAG forward migration contracts (static)",()=>{
 it("leases claims and checks token + revision before atomic completion",()=>{
  assert.ok(consistency.includes("for update skip locked"));
  const completion=consistency.split("create or replace function public.customer_service_complete_faq_embedding(")[1].split("revoke all")[0];
  for(const text of ["for update","f.embedding_revision <> p_revision","f.embedding_claim_token is distinct from p_claim_token","insert into public.customer_faq_embeddings","embedding_status='ready'"])assert.ok(completion.includes(text),text);
 });
 it("invalidates FAQ and alias edits, but does not delete all old vectors",()=>{
  assert.ok(consistency.includes("new.question is distinct from old.question"));
  assert.ok(consistency.includes("after insert or update or delete on public.customer_faq_aliases"));
  assert.ok(!/delete\s+from\s+public\.customer_faq_embeddings\s*;/i.test(consistency));
 });
 it("filters eligible revision/model/profile/hash before ranking",()=>{
  const search=consistency.split("create or replace function public.search_published_customer_faqs_by_vector_v2(")[1].split("revoke all")[0];
  for(const text of ["eligible as materialized","embedding_status='ready'","e.model=p_model","e.profile=p_profile","e.faq_revision=f.embedding_revision","e.content_hash=f.content_hash"])assert.ok(search.includes(text),text);
 });
 it("revokes client access to indexing RPCs",()=>{
  for(const name of ["claim_faq_embeddings","complete_faq_embedding","release_faq_embedding"]){
   assert.match(consistency,new RegExp(`revoke all on function public.customer_service_${name}[^;]+from public,anon,authenticated;`));
  }
 });
 it("merges config keys and preserves tiered list fields",()=>{
  assert.ok(settings.includes("merged:=coalesce(merged,'{}'::jsonb)||p_rag_config"));
  for(const field of ["fallback_model text","fallback_enabled boolean","escalation_confidence numeric"])assert.ok(settings.includes(field));
  assert.ok(settings.includes("private.has_page_access('settings.customer_faq.edit')"));
 });
 it("keeps missing FAQ labels distinct from labelled no-answer cases",()=>{
  assert.ok(settings.includes("expected_faq_ids uuid[]"));
  assert.ok(!settings.includes("expected_faq_ids uuid[] not null"));
 });
 it("evaluates the shared FAQ entry point instead of passing a full FAQ table",()=>{
  const source=read("supabase/functions/customer-service-model-evaluate/index.ts");
  assert.ok(source.includes("answerCustomerServiceFaqForEvaluation("));assert.ok(source.includes("createCustomerServiceFaqRagDeps("));
  assert.ok(!source.includes('.limit(100)'));
  assert.ok(source.includes("evaluation_side_effect_forbidden"));assert.ok(source.includes("paired_same_samples"));
 });
});
