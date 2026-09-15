import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
const migration = readFileSync("supabase/migrations/20260915143000_customer_service_learning_safety.sql", "utf8");
const prior = readFileSync("supabase/migrations/20260915110000_execute_customer_service_learning_suggestions.sql", "utf8");
const report = "00000000-0000-4000-8000-000000000001";
async function database() {
 const db = new PGlite();
 await db.exec(`create role service_role;
      create role anon;
      create role authenticated;
      create schema auth;
      create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function private.has_page_access(text) returns boolean language sql stable as $$ select true $$;
      create table public.customer_faqs (
        id uuid primary key default gen_random_uuid(), category text, question text,
        answer text, keywords text, locale text, is_published boolean, sort_order integer,
        updated_at timestamptz default now(), unique(locale, question)
      );
      create table public.customer_service_daily_reports (
        id uuid primary key, report_date date not null
      );
      create table public.customer_service_learning_suggestions (
        id uuid primary key default gen_random_uuid(), report_id uuid not null, suggestion_type text not null,
        title text not null, reason text not null default '', proposed_content jsonb not null default '{}',
        evidence_turn_ids uuid[] not null default '{}', status text not null default 'draft',
        target_faq_id uuid, reviewed_by uuid, reviewed_at timestamptz,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table public.customer_service_intents (
        intent_key text primary key, display_name text not null, description text not null,
        examples text[] not null default '{}', action_key text not null, enabled boolean not null default true,
        priority integer not null default 100, confidence_threshold numeric not null default .65,
        updated_at timestamptz not null default now(), updated_by uuid
      );
      create table public.customer_service_reply_templates (
        template_key text primary key, display_name text not null, content text not null,
        locale text not null default 'zh-HK', enabled boolean not null default true,
        updated_at timestamptz not null default now(), updated_by uuid
      );
      create table public.customer_service_workflow_policies (
        goal_key text primary key, display_name text not null, instructions text not null default '',
        context_window integer not null default 8, clarification_threshold numeric not null default .72,
        auto_resume boolean not null default true, enabled boolean not null default true,
        updated_by uuid, updated_at timestamptz not null default now()
      );
      insert into public.customer_service_daily_reports values
        ('00000000-0000-4000-8000-000000000001', '2026-09-14');
      insert into public.customer_service_intents values
        ('lookup_order', '查詢訂單', '查詢訂單。', array['查單'], 'order_lookup', true, 10, .6, now(), null),
        ('complaint_refund', '投訴', '投訴。', array['投訴'], 'human_handoff', true, 15, .58, now(), null),
        ('search_faq', 'FAQ', '一般問題。', array['運費'], 'faq_search', true, 40, .55, now(), null),
        ('collect_inquiry', '到會', '到會。', array['到會'], 'inquiry_collect', true, 30, .62, now(), null);
      insert into public.customer_service_reply_templates values
        ('help', '歡迎訊息', '你好', 'zh-HK', true, now(), null),
        ('refuse', '非服務範圍', '只處理客服問題', 'zh-HK', true, now(), null);
      insert into public.customer_service_learning_suggestions(
        id, report_id, suggestion_type, title
      ) values
        ('7caf2740-7222-4146-8cc3-0ab5bed0aa66', '00000000-0000-4000-8000-000000000001', 'intent', 'one'),
        ('7d18bfd3-20a0-493e-843c-2e34505c16c0', '00000000-0000-4000-8000-000000000001', 'policy', 'two'),
        ('d7d830bb-16da-46e0-bcb3-97fa719e5b23', '00000000-0000-4000-8000-000000000001', 'policy', 'three'),
        ('1558c5dd-f951-41be-9dce-61e749eba02b', '00000000-0000-4000-8000-000000000001', 'intent', 'four'),
        ('15d39fc3-79b4-4c23-8ffb-65dc77a3778b', '00000000-0000-4000-8000-000000000001', 'policy', 'five'),
        ('0b4f9caa-42f5-45e4-82c0-566b7d0d2563', '00000000-0000-4000-8000-000000000001', 'intent', 'six'),
        ('4a137ef8-35e4-4ff0-9e5a-fe9459097a76', '00000000-0000-4000-8000-000000000001', 'policy', 'seven'),
        ('2183f904-e858-4ec5-84e4-88745630596c', '00000000-0000-4000-8000-000000000001', 'intent', 'eight'),
        ('59c3ecb7-23e2-4bd6-a716-28e8e3527c32', '00000000-0000-4000-8000-000000000001', 'policy', 'nine');
    `);
 await db.exec(prior);
 await db.exec(migration);
 return db;
}
const suggestion = (question = "如何網上訂餐", eligible = true) => ({suggestion_type:"faq",title:question,reason:"evidence", proposed_content:{question,answer:"請到網站落單。",category:"ordering",keywords:"退款, unrelated"},evidence_turn_ids:["00000000-0000-4000-8000-000000000011"],evidence_message_ids:[],auto_alias_eligible:eligible});
async function store(db: PGlite, input = suggestion()) {
 const result = await db.query<{id:string}>("select customer_service_learning_suggestion_store($1, $2::jsonb) id", [report, JSON.stringify(input)]);
 return result.rows[0].id;
}
async function faq(db: PGlite) {
 await db.exec("insert into customer_faqs(category,question,answer,keywords,locale,is_published,sort_order) values ('ordering','如何訂餐','請到網站落單。','原有關鍵字','zh-HK',true,0)");
}

describe("transactional learning safety", () => {
 it("seeds every allow-listed learned reply template in a disabled state", () => {
  for (const key of ["acknowledgement", "complaint_handoff", "packaging_request", "thanks"]) {
   expect(migration).toContain(`('${key}'`);
  }
  expect(migration).toContain("'zh-HK', false");
 });
 it("merges sequential aliases, ignores model keywords, and records execution", async () => {
  const db=await database(); try {
   await faq(db); const id=await store(db); await store(db,suggestion("怎樣網站下單"));
   const rows=await db.query<{keywords:string}>("select keywords from customer_faqs");
   expect(rows.rows[0].keywords).toBe("原有關鍵字, 如何網上訂餐, 怎樣網站下單");
   const audit=await db.query("select status,execution_status from customer_service_learning_suggestions where id=$1",[id]);
   expect(audit.rows[0]).toEqual({status:"published",execution_status:"applied"});
  } finally { await db.close(); }
 });
 it("preserves rejected decisions on rerun and denies unprivileged stores", async () => {
  const db=await database(); try {
   const input=suggestion("怎樣訂餐方法",false); const id=await store(db,input);
   await db.query("select customer_service_learning_suggestion_review($1,'rejected')",[id]);
   expect(await store(db,input)).toBe(id);
   expect(await store(db,{...input,auto_alias_eligible:true,proposed_content:{...input.proposed_content,keywords:"changed by AI",category:"delivery"}})).toBe(id);
   const rows=await db.query("select status from customer_service_learning_suggestions where id=$1",[id]);
   expect(rows.rows[0]).toEqual({status:"rejected"});
   await db.exec("set role authenticated");
   await expect(store(db)).rejects.toThrow(/permission denied/);
  } finally { await db.close(); }
 });
 it("rolls back alias mutation if the audit update fails", async () => {
  const db=await database(); try {
   await faq(db);
   await db.exec("create function reject_applied() returns trigger language plpgsql as $$ begin if new.execution_status = 'applied' then raise exception 'audit_failed'; end if; return new; end $$; create trigger reject_applied before update on customer_service_learning_suggestions for each row execute function reject_applied()");
   await expect(store(db)).rejects.toThrow("audit_failed");
   expect((await db.query("select keywords from customer_faqs")).rows[0]).toEqual({keywords:"原有關鍵字"});
   expect((await db.query("select count(*)::int count from customer_service_learning_suggestions where title='如何網上訂餐'")).rows[0]).toEqual({count:0});
  } finally { await db.close(); }
 });
 it("rejects null approval and existing FAQ answer conflicts", async () => {
  const db=await database(); try {
   await faq(db); const input=suggestion("如何訂餐",false); input.proposed_content.answer="另一個答案";
   const id=await store(db,input);
   await expect(db.query("select customer_service_learning_suggestion_review($1,null)",[id])).rejects.toThrow("invalid_suggestion_status");
   await expect(db.query("select customer_service_learning_suggestion_review($1,'approved')",[id])).rejects.toThrow("suggestion_faq_conflict");
   expect((await db.query("select status from customer_service_learning_suggestions where id=$1",[id])).rows[0]).toEqual({status:"draft"});
  } finally { await db.close(); }
 });
 it("keeps sensitive aliases for review", async () => {
  const db=await database(); try {
   await faq(db); const id=await store(db,suggestion("如何申請退款"));
   expect((await db.query("select status from customer_service_learning_suggestions where id=$1",[id])).rows[0]).toEqual({status:"draft"});
  } finally { await db.close(); }
 });
 it("rejects unknown runtime targets and rolls back preceding operations", async () => {
  const db=await database(); try {
   const input={...suggestion(),suggestion_type:"policy",proposed_content:{runtime_changes:[
    {target:"intent",key:"lookup_order",patch:{description_append:"must rollback"}},
    {target:"reply_template",key:"unknown_template",patch:{content:"hello"}}
   ]}};
   const rows=await db.query<{id:string}>("select customer_service_learning_suggestion_store($1,$2::jsonb) id",[report,JSON.stringify(input)]);
   await expect(db.query("select customer_service_learning_suggestion_review($1,'approved')",[rows.rows[0].id])).rejects.toThrow("suggestion_mapping_invalid");
   expect((await db.query<{description:string}>("select description from customer_service_intents where intent_key='lookup_order'")).rows[0].description).not.toContain("must rollback");
   await db.query("update customer_service_learning_suggestions set proposed_content=$2::jsonb where id=$1",[rows.rows[0].id,JSON.stringify({runtime_changes:[{target:"intent",key:"lookup_order",patch:{examples_append:[" "]}}]})]);
   await expect(db.query("select customer_service_learning_suggestion_review($1,'approved')",[rows.rows[0].id])).rejects.toThrow("suggestion_mapping_invalid");
  } finally { await db.close(); }
 });
 it("counts human message evidence without requiring bot turns", async () => {
  const db=await database(); try {
   const input={...suggestion("真人提供問法",false),evidence_turn_ids:[],evidence_message_ids:["00000000-0000-4000-8000-000000000012","00000000-0000-4000-8000-000000000013"]};
   const id=await store(db,input);
   expect((await db.query("select evidence_count from customer_service_learning_suggestions_list(null,200) where id=$1",[id])).rows[0]).toEqual({evidence_count:2});
  } finally { await db.close(); }
 });
});
