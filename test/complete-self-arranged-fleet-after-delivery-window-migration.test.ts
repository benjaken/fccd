import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260928133000_complete_self_arranged_fleet_after_delivery_window.sql",
  ),
  "utf8",
);

describe("complete self-arranged fleet after delivery window", () => {
  it("auto-completes 自行叫車 only after the delivery window ends", () => {
    expect(migration).toContain(
      "create or replace function private.delivery_window_end_at",
    );
    expect(migration).toContain(
      "create or replace function public.assign_delivery_motorcade",
    );
    expect(migration).toContain("in ('自行叫車', '自主叫車')");
    expect(migration).toContain("and now() >= v_window_end");
    expect(migration).toContain("when v_auto_complete then '已送達'");
    expect(migration).toContain("else '待接單'");
  });

  it("reverts premature 已送達 rows and schedules due completions", () => {
    expect(migration).toContain("delivery_status = '待接單'");
    expect(migration).toContain(
      "create or replace function public.complete_due_self_arranged_deliveries",
    );
    expect(migration).toContain("fccd-complete-due-self-arranged-deliveries");
    expect(migration).toContain("fccd-complete-past-self-arranged-deliveries");
    expect(migration).toContain(
      "drop function if exists public.complete_past_self_arranged_deliveries",
    );
    expect(migration).toContain(
      "select public.complete_due_self_arranged_deliveries()",
    );
  });
});
