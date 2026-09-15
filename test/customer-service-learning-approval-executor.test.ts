import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260915110000_execute_customer_service_learning_suggestions.sql",
  ),
  "utf8",
);

describe("customer-service learning approval executor", () => {
  it("refuses to approve a suggestion without executable runtime mappings", () => {
    expect(migration).toContain("suggestion_mapping_required");
    expect(migration).toContain("suggestion_mapping_invalid");
    expect(migration).toContain("jsonb_array_length(v_changes)");
    expect(migration).toContain("v_executed_count <> jsonb_array_length(v_changes)");
  });

  it("dispatches approved changes to tables loaded by the live runtime", () => {
    expect(migration).toContain("customer_service_intents");
    expect(migration).toContain("customer_service_reply_templates");
    expect(migration).toContain("customer_service_workflow_policies");
    expect(migration).toContain("runtime_target");
    expect(migration).toContain("execution_status");
    expect(migration).toContain("execution_result");
  });

  it("requeues and maps exactly the nine previously false-approved suggestions", () => {
    const ids = [
      "7caf2740-7222-4146-8cc3-0ab5bed0aa66",
      "7d18bfd3-20a0-493e-843c-2e34505c16c0",
      "d7d830bb-16da-46e0-bcb3-97fa719e5b23",
      "1558c5dd-f951-41be-9dce-61e749eba02b",
      "15d39fc3-79b4-4c23-8ffb-65dc77a3778b",
      "0b4f9caa-42f5-45e4-82c0-566b7d0d2563",
      "4a137ef8-35e4-4ff0-9e5a-fe9459097a76",
      "2183f904-e858-4ec5-84e4-88745630596c",
      "59c3ecb7-23e2-4bd6-a716-28e8e3527c32",
    ];
    for (const id of ids) expect(migration).toContain(id);
    expect(migration).toContain("status = 'draft'");
    expect(migration).toContain("reviewed_by = null");
    expect(migration).toContain("reviewed_at = null");
  });

  it("does not execute or publish anything merely by running the migration", () => {
    const dataMigration = migration.split(
      "create or replace function public.customer_service_learning_suggestion_review",
    )[0];
    expect(dataMigration).not.toMatch(/status\s*=\s*'approved'/i);
    expect(dataMigration).not.toMatch(/status\s*=\s*'published'/i);
    expect(dataMigration).not.toMatch(/is_published\s*=\s*true/i);
  });

  it("atomically applies a mapped approval and leaves an unmapped approval pending", async () => {
    const db = new PGlite();
    await db.exec(`
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
        id uuid primary key, report_id uuid not null, suggestion_type text not null,
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
    await db.exec(migration);

    const queued = await db.query<{ count: number }>(
      "select count(*)::int as count from customer_service_learning_suggestions where status = 'draft' and execution_status = 'pending' and runtime_target is not null",
    );
    expect(queued.rows[0].count).toBe(9);

    await db.query(
      "select * from customer_service_learning_suggestion_review($1, 'approved')",
      ["7caf2740-7222-4146-8cc3-0ab5bed0aa66"],
    );
    const applied = await db.query<{ status: string; execution_status: string }>(
      "select status, execution_status from customer_service_learning_suggestions where id = $1",
      ["7caf2740-7222-4146-8cc3-0ab5bed0aa66"],
    );
    expect(applied.rows[0]).toEqual({ status: "approved", execution_status: "applied" });
    const intent = await db.query<{ description: string }>(
      "select description from customer_service_intents where intent_key = 'lookup_order'",
    );
    expect(intent.rows[0].description).toContain("餐具");

    const unmappedId = "00000000-0000-4000-8000-000000000099";
    await db.query(
      "insert into customer_service_learning_suggestions(id, report_id, suggestion_type, title) values ($1, '00000000-0000-4000-8000-000000000001', 'policy', 'unmapped')",
      [unmappedId],
    );
    await expect(
      db.query(
        "select * from customer_service_learning_suggestion_review($1, 'approved')",
        [unmappedId],
      ),
    ).rejects.toThrow("suggestion_mapping_required");
    const stillPending = await db.query<{ status: string }>(
      "select status from customer_service_learning_suggestions where id = $1",
      [unmappedId],
    );
    expect(stillPending.rows[0].status).toBe("draft");
    await db.close();
  });
});
