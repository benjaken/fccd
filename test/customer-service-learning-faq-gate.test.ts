import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const prior = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260915110000_execute_customer_service_learning_suggestions.sql"),
  "utf8",
);
const safety = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260915143000_customer_service_learning_safety.sql"),
  "utf8",
);
const gate = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260921140000_customer_service_learning_faq_gate.sql"),
  "utf8",
);
const report = "00000000-0000-4000-8000-000000000001";

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role service_role;
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
      ('lookup_order', '查詢訂單', '查詢訂單。', array['查單'], 'order_lookup', true, 10, .6, now(), null);
    insert into public.customer_service_reply_templates values
      ('help', '歡迎訊息', '你好', 'zh-HK', true, now(), null);
  `);
  await db.exec(prior);
  await db.exec(safety);
  await db.exec(gate);
  return db;
}

function suggestion(question: string, answer: string) {
  return {
    suggestion_type: "faq",
    title: question,
    reason: "evidence",
    proposed_content: { question, answer, category: "ordering", keywords: "" },
    evidence_turn_ids: ["00000000-0000-4000-8000-000000000011"],
    evidence_message_ids: [],
    auto_alias_eligible: false,
  };
}

describe("learning FAQ gate", () => {
  it("does not record greeting, urgent or clarification FAQs", async () => {
    const db = await database();
    try {
      const blocked = [
        suggestion("Hello", "你好，請問是查詢現有訂單，還是需要到會訂餐協助？"),
        suggestion("急單, 想今日18:00送到, 可以嗎？", "你好，請問送貨地區？"),
        suggestion("你好，我想問有關 HKlunchbox 飯盒送餐的問題。", "你好，請問有咩幫到你？😊"),
      ];
      for (const input of blocked) {
        const stored = await db.query<{ id: string | null }>(
          "select customer_service_learning_suggestion_store($1, $2::jsonb) id",
          [report, JSON.stringify(input)],
        );
        expect(stored.rows[0].id).toBeNull();
      }
      const kept = await db.query<{ id: string | null }>(
        "select customer_service_learning_suggestion_store($1, $2::jsonb) id",
        [report, JSON.stringify(suggestion("點樣喺網站落單？", "請到網站落單。"))],
      );
      expect(kept.rows[0].id).toBeTruthy();
      const count = await db.query<{ count: number }>(
        "select count(*)::int as count from customer_service_learning_suggestions where suggestion_type='faq'",
      );
      expect(count.rows[0].count).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("rejects approval of a blocked FAQ that was later edited in", async () => {
    const db = await database();
    try {
      const stored = await db.query<{ id: string }>(
        "select customer_service_learning_suggestion_store($1, $2::jsonb) id",
        [report, JSON.stringify(suggestion("點樣喺網站落單？", "請到網站落單。"))],
      );
      const id = stored.rows[0].id;
      await db.query(
        "update customer_service_learning_suggestions set proposed_content=$2::jsonb where id=$1",
        [id, JSON.stringify({ question: "Hello", answer: "你好，請問是查詢現有訂單，還是需要到會訂餐協助？", category: "ordering" })],
      );
      await expect(
        db.query("select customer_service_learning_suggestion_review($1,'approved')", [id]),
      ).rejects.toThrow("suggestion_faq_gate_failed");
    } finally {
      await db.close();
    }
  });
});
