import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260921240000_purge_develop_history_replay.sql",
  "utf8",
);

describe("purge develop history replay migration", () => {
  it("deletes only the develop replay runs, samples, proposals and R1 rules", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create schema extensions;
        create table public.customer_service_history_eval_runs (
          id uuid primary key, environment text not null
        );
        create table public.customer_service_history_eval_samples (
          id uuid primary key,
          run_id uuid not null references public.customer_service_history_eval_runs(id) on delete cascade
        );
        create table public.customer_service_repair_proposals (
          id uuid primary key, environment text not null
        );
        create table public.customer_service_verified_rewrite_repairs (
          id uuid primary key,
          proposal_id uuid not null references public.customer_service_repair_proposals(id),
          environment text not null
        );
        insert into public.customer_service_history_eval_runs values
          ('00000000-0000-4000-8000-000000000001', 'develop'),
          ('00000000-0000-4000-8000-000000000002', 'production');
        insert into public.customer_service_history_eval_samples values
          ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001'),
          ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002');
        insert into public.customer_service_repair_proposals values
          ('00000000-0000-4000-8000-000000000021', 'develop'),
          ('00000000-0000-4000-8000-000000000022', 'production');
        insert into public.customer_service_verified_rewrite_repairs values
          ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000021', 'develop'),
          ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000022', 'production');
      `);
      await db.exec(migration);

      const count = async (table: string) =>
        (await db.query<{ count: number }>(`select count(*)::int as count from public.${table}`)).rows[0].count;
      expect(await count("customer_service_verified_rewrite_repairs")).toBe(1);
      expect(await count("customer_service_repair_proposals")).toBe(1);
      expect(await count("customer_service_history_eval_runs")).toBe(1);
      expect(await count("customer_service_history_eval_samples")).toBe(1);

      const [remainingRun] = (await db.query<{ environment: string }>(
        "select environment from public.customer_service_history_eval_runs",
      )).rows;
      expect(remainingRun.environment).toBe("production");
    } finally {
      await db.close();
    }
  });
});
