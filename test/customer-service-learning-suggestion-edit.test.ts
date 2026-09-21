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
const edit = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260921260000_customer_service_learning_suggestion_edit.sql"),
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
    create table private.access_flags (
      key text primary key, allowed boolean not null default true
    );
    create function private.has_page_access(text) returns boolean language sql stable as $$
      select coalesce((select allowed from private.access_flags where key = $1), true)
    $$;
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
  await db.exec(edit);
  return db;
}

function suggestion(question: string, answer: string) {
  return {
    suggestion_type: "faq",
    title: question,
    reason: "evidence",
    proposed_content: { question, answer, category: "ordering", keywords: "", note: "keep" },
    evidence_turn_ids: ["00000000-0000-4000-8000-000000000011"],
    evidence_message_ids: [],
    auto_alias_eligible: false,
  };
}

async function store(db: PGlite, input = suggestion("點樣喺網站落單？", "請到網站落單。")) {
  const result = await db.query<{ id: string }>(
    "select customer_service_learning_suggestion_store($1, $2::jsonb) id",
    [report, JSON.stringify(input)],
  );
  return result.rows[0].id;
}

async function update(
  db: PGlite,
  id: string,
  content: Record<string, unknown>,
) {
  return db.query<{ id: string; proposed_content: Record<string, unknown> }>(
    "select id, proposed_content from customer_service_learning_suggestion_update($1, $2::jsonb)",
    [id, JSON.stringify(content)],
  );
}

describe("learning suggestion answer editing", () => {
  it("writes edited FAQ fields back to the draft and keeps untouched keys", async () => {
    const db = await database();
    try {
      const id = await store(db);
      const result = await update(db, id, {
        question: "點樣喺網站落單？",
        answer: "請到網站落單，並填寫送貨日期。",
        category: "delivery",
        keywords: "網站,落單",
      });
      expect(result.rows[0].proposed_content).toMatchObject({
        answer: "請到網站落單，並填寫送貨日期。",
        category: "delivery",
        keywords: "網站,落單",
        note: "keep",
      });
      const stored = await db.query<{ proposed_content: Record<string, unknown>; status: string }>(
        "select proposed_content, status from customer_service_learning_suggestions where id=$1",
        [id],
      );
      expect(stored.rows[0].status).toBe("draft");
      expect(stored.rows[0].proposed_content.answer).toBe("請到網站落單，並填寫送貨日期。");
    } finally {
      await db.close();
    }
  });

  it("rejects edits once the suggestion has been reviewed", async () => {
    const db = await database();
    try {
      const id = await store(db);
      await db.query("select customer_service_learning_suggestion_review($1,'rejected')", [id]);
      await expect(
        update(db, id, { question: "點樣喺網站落單？", answer: "新答案", category: "ordering" }),
      ).rejects.toThrow("suggestion_already_reviewed");
    } finally {
      await db.close();
    }
  });

  it("rejects editing non-FAQ runtime proposals", async () => {
    const db = await database();
    try {
      const inserted = await db.query<{ id: string }>(
        `insert into public.customer_service_learning_suggestions
          (report_id, suggestion_type, title, proposed_content)
         values ($1, 'intent', '調整意圖', '{"runtime_changes":[]}'::jsonb)
         returning id`,
        [report],
      );
      await expect(
        update(db, inserted.rows[0].id, { question: "問", answer: "答", category: "ordering" }),
      ).rejects.toThrow("suggestion_not_editable");
    } finally {
      await db.close();
    }
  });

  it("rejects blocked, incomplete, and invalid-category edits", async () => {
    const db = await database();
    try {
      const id = await store(db);
      await expect(
        update(db, id, { question: "Hello", answer: "你好，請問是查詢現有訂單，還是需要到會訂餐協助？", category: "ordering" }),
      ).rejects.toThrow("suggestion_faq_gate_failed");
      await expect(
        update(db, id, { question: "點樣喺網站落單？", answer: "  ", category: "ordering" }),
      ).rejects.toThrow("suggestion_mapping_required");
      await expect(
        update(db, id, { question: "點樣喺網站落單？", answer: "請到網站落單。", category: "unknown" }),
      ).rejects.toThrow("suggestion_mapping_invalid");
    } finally {
      await db.close();
    }
  });

  it("requires the customer FAQ edit permission", async () => {
    const db = await database();
    try {
      const id = await store(db);
      await db.exec(
        "insert into private.access_flags(key, allowed) values ('settings.customer_faq.edit', false)",
      );
      await expect(
        update(db, id, { question: "點樣喺網站落單？", answer: "新答案", category: "ordering" }),
      ).rejects.toThrow("page_access_required");
    } finally {
      await db.close();
    }
  });
});
