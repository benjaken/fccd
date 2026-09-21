import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260921211000_customer_service_runtime_change_repairs.sql",
  "utf8",
);

const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const PROPOSAL = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

async function runtimeDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.customer_service_repair_proposals (
      id uuid primary key,
      environment text not null default 'develop',
      repair_kind text not null,
      risk_level text not null,
      status text not null default 'drafted',
      approved_by uuid,
      approved_at timestamptz,
      executed_by text,
      executed_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table public.customer_service_intents (
      intent_key text primary key, display_name text not null, description text not null,
      examples text[] not null default '{}', action_key text not null default 'faq_search',
      enabled boolean not null default true, priority integer not null default 100,
      confidence_threshold numeric not null default .65,
      updated_at timestamptz not null default now(), updated_by uuid
    );
    create table public.customer_service_workflow_policies (
      goal_key text primary key, display_name text not null, instructions text not null default '',
      context_window integer not null default 8, clarification_threshold numeric not null default .72,
      auto_resume boolean not null default true, enabled boolean not null default true,
      updated_by uuid, updated_at timestamptz not null default now()
    );
    create table public.customer_service_reply_templates (
      template_key text primary key, display_name text not null, content text not null,
      locale text not null default 'zh-HK', enabled boolean not null default true,
      updated_at timestamptz not null default now(), updated_by uuid
    );
    insert into public.customer_service_intents(intent_key, display_name, description, examples, action_key)
      values ('lookup_order', '查詢訂單', '查詢訂單。', array['查單'], 'order_lookup');
    insert into public.customer_service_workflow_policies(goal_key, display_name, instructions)
      values ('order_change', '訂單修改', '先核實身份。');
    insert into public.customer_service_reply_templates(template_key, display_name, content)
      values ('help', '歡迎訊息', '你好');
  `);
  await db.exec(migration);
  return db;
}

describe("customer-service repair runtime change executor", () => {
  it("applies the allow-listed patch, records audit and keeps a pre-image", async () => {
    const db = await runtimeDb();
    try {
      await db.query(
        `insert into public.customer_service_repair_proposals
           (id, repair_kind, risk_level, status, runtime_change_draft)
         values ($1, 'runtime_policy_candidate', 'R2', 'drafted', $2)`,
        [PROPOSAL, JSON.stringify({ changes: [
          { target: "workflow_policy", key: "order_change", patch: { instructions_append: "不得直接修改訂單。" } },
          { target: "intent", key: "lookup_order",
            patch: { description_append: "需先核實身份。", examples_append: ["改單"] } },
        ] })],
      );

      const applied = await db.query(
        "select * from public.customer_service_repair_runtime_change_review($1,$2,$3,$4)",
        [PROPOSAL, "develop", ACTOR, "apply"],
      );
      expect(applied.rows[0]).toMatchObject({ proposal_status: "applied", change_count: 2 });

      const [policy] = (await db.query<{ instructions: string }>(
        "select instructions from public.customer_service_workflow_policies where goal_key = 'order_change'",
      )).rows;
      expect(policy.instructions).toContain("不得直接修改訂單。");
      const [intent] = (await db.query<{ description: string; examples: string[] }>(
        "select description, examples from public.customer_service_intents where intent_key = 'lookup_order'",
      )).rows;
      expect(intent.description).toContain("需先核實身份。");
      expect(intent.examples).toContain("改單");

      const [proposal] = (await db.query<{
        status: string; approved_by: string; runtime_change_rollback: unknown;
      }>("select status, approved_by, runtime_change_rollback from public.customer_service_repair_proposals where id = $1",
        [PROPOSAL])).rows;
      expect(proposal.status).toBe("applied");
      expect(proposal.approved_by).toBe(ACTOR);
      expect(JSON.stringify(proposal.runtime_change_rollback)).toContain("先核實身份。");
    } finally {
      await db.close();
    }
  });

  it("refuses an unmapped target/key and a non-drafted proposal", async () => {
    const db = await runtimeDb();
    try {
      await db.query(
        `insert into public.customer_service_repair_proposals
           (id, repair_kind, risk_level, status, runtime_change_draft)
         values ($1, 'runtime_policy_candidate', 'R2', 'drafted', $2)`,
        [PROPOSAL, JSON.stringify({ changes: [
          { target: "workflow_policy", key: "missing_goal", patch: { instructions_append: "x" } },
        ] })],
      );
      await expect(db.query(
        "select * from public.customer_service_repair_runtime_change_review($1,$2,$3,$4)",
        [PROPOSAL, "develop", ACTOR, "apply"],
      )).rejects.toThrow("runtime_change_mapping_invalid");

      const [still] = (await db.query<{ status: string }>(
        "select status from public.customer_service_repair_proposals where id = $1", [PROPOSAL],
      )).rows;
      expect(still.status).toBe("drafted");

      await db.query(
        `insert into public.customer_service_repair_proposals
           (id, repair_kind, risk_level, status, runtime_change_draft)
         values ($1, 'runtime_policy_candidate', 'R2', 'candidate', '{}')`,
        [OTHER],
      );
      await expect(db.query(
        "select * from public.customer_service_repair_runtime_change_review($1,$2,$3,$4)",
        [OTHER, "develop", ACTOR, "apply"],
      )).rejects.toThrow("proposal_not_drafted");
    } finally {
      await db.close();
    }
  });

  it("rejects without applying any change", async () => {
    const db = await runtimeDb();
    try {
      await db.query(
        `insert into public.customer_service_repair_proposals
           (id, repair_kind, risk_level, status, runtime_change_draft)
         values ($1, 'runtime_policy_candidate', 'R2', 'drafted', $2)`,
        [PROPOSAL, JSON.stringify({ changes: [
          { target: "workflow_policy", key: "order_change", patch: { instructions_append: "不得直接修改訂單。" } },
        ] })],
      );
      const rejected = await db.query(
        "select * from public.customer_service_repair_runtime_change_review($1,$2,$3,$4)",
        [PROPOSAL, "develop", null, "reject"],
      );
      expect(rejected.rows[0]).toMatchObject({ proposal_status: "rejected", change_count: 0 });
      const [policy] = (await db.query<{ instructions: string }>(
        "select instructions from public.customer_service_workflow_policies where goal_key = 'order_change'",
      )).rows;
      expect(policy.instructions).toBe("先核實身份。");
    } finally {
      await db.close();
    }
  });
});
