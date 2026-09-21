import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("verified history rewrite migration", () => {
  it("applies only a validated published FAQ and rolls back its own rule", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create table customer_faqs (id uuid primary key, question text, answer text,
          locale text, is_published boolean, category text, created_at timestamptz);
        create table customer_service_history_eval_runs (id uuid primary key,
          environment text, snapshot jsonb);
        create table customer_service_config_versions (id uuid primary key,
          environment text, status text, updated_at timestamptz);
        create table customer_service_repair_proposals (
          id uuid primary key, environment text, repair_kind text, status text,
          validation jsonb, scope jsonb, candidate_patch jsonb, base_hash text,
          preauthorized boolean,
          executed_by text, executed_at timestamptz, rollback jsonb,
          updated_at timestamptz, rollback_at timestamptz
        );
        insert into customer_faqs values
          ('00000000-0000-4000-8000-000000000001','送貨範圍？','港島及九龍','zh-HK',true,
           'delivery','2026-09-01T00:00:00Z');
        insert into customer_service_history_eval_runs values
          ('00000000-0000-4000-8000-000000000002','develop',
           '{"config_fingerprint":"config-1","config_id":"00000000-0000-4000-8000-000000000004","config_updated_at":"2026-09-19T00:00:00Z"}');
        insert into customer_service_config_versions values
          ('00000000-0000-4000-8000-000000000004','develop','active','2026-09-19T00:00:00Z');
        insert into customer_service_repair_proposals
          (id,environment,repair_kind,status,validation,scope,candidate_patch,base_hash,preauthorized)
        values ('00000000-0000-4000-8000-000000000003','develop','alias_candidate','eligible',
          '{"passed":true,"gate_version":"verified-faq-rewrite-v1","config_fingerprint":"config-1"}',
          '{"run_id":"00000000-0000-4000-8000-000000000002"}',
          '{"faq_id":"00000000-0000-4000-8000-000000000001","question":"有冇送貨？"}',
          md5('送貨範圍？' || chr(31) || '港島及九龍'),false);
      `);
      await db.exec(readFileSync(
        "supabase/migrations/20260919220000_customer_service_verified_rewrite_repairs.sql", "utf8"));
      const proposal = "00000000-0000-4000-8000-000000000003";
      const apply = (fingerprint: string) => db.query(
        "select customer_service_apply_verified_rewrite($1,'develop',$2)", [proposal, fingerprint]);
      await expect(apply("wrong-config")).rejects.toThrow(/repair_not_eligible/);
      await expect(apply("config-1")).rejects.toThrow(/repair_not_eligible/);
      await db.query("update customer_service_repair_proposals set preauthorized=true where id=$1", [proposal]);
      await apply("config-1");
      const staged = await db.query<{ answer: string | null }>(
        "select customer_service_verified_rewrite('develop','有冇送貨？') as answer");
      expect(staged.rows[0].answer).toBeNull();
      await db.query("update customer_service_config_versions set status='archived'");
      await expect(db.query(
        "select customer_service_finish_verified_rewrite($1,'develop',true)", [proposal]
      )).rejects.toThrow(/repair_baseline_changed/);
      await db.query("update customer_service_config_versions set status='active'");
      const activated = await db.query<{ finished: boolean }>(
        "select customer_service_finish_verified_rewrite($1,'develop',true) as finished", [proposal]);
      expect(activated.rows[0].finished).toBe(true);
      const rewritten = await db.query<{ answer: string }>(
        "select customer_service_verified_rewrite('develop','有冇送貨？') as answer");
      expect(rewritten.rows[0].answer).toBe("送貨範圍？");
      await db.query("update customer_faqs set answer='已更改' where id=$1", [
        "00000000-0000-4000-8000-000000000001"]);
      const changed = await db.query<{ answer: string | null }>(
        "select customer_service_verified_rewrite('develop','有冇送貨？') as answer");
      expect(changed.rows[0].answer).toBeNull();
      const finish = await db.query<{ finished: boolean }>(
        "select customer_service_finish_verified_rewrite($1,'develop',false) as finished", [proposal]);
      expect(finish.rows[0].finished).toBe(true);
      expect((await db.query<{ finished: boolean }>(
        "select customer_service_finish_verified_rewrite($1,'develop',false) as finished", [proposal]
      )).rows[0].finished).toBe(false);
    } finally {
      await db.close();
    }
  });
});
