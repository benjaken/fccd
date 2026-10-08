import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261008020000_reopen_premature_self_arranged_fleet.sql",
  ),
  "utf8",
);

describe("reopen premature self-arranged fleet completions", () => {
  it("allows a fleet change when 自行叫車 was completed before the meal window", () => {
    expect(migration).toContain(
      "create or replace function public.assign_delivery_motorcade",
    );
    expect(migration).toContain("v_premature_completion boolean");
    expect(migration).toContain(
      "coalesce(v_current_team_name, '') in ('自行叫車', '自主叫車')",
    );
    expect(migration).toContain("and not v_premature_completion");
    expect(migration).toContain("delivered orders cannot change fleet");
    expect(migration).toContain(
      "when v_self_arranged or v_premature_completion or v_fleet_changed then null",
    );
    expect(migration).toContain("when v_self_arranged then '待取貨'");
  });

  it("reopens those rows to 待取貨 before the window ends", () => {
    expect(migration).toContain("fulfilled_at = null");
    expect(migration).toContain("taken_at = null");
    expect(migration).toContain("delivery_status = '待取貨'");
    expect(migration).toContain("driver_confirmation_status = 'accepted'");
    expect(migration).toContain("now() < private.delivery_window_end_at(");
    expect(migration).toContain("where delivery.id = premature.id");
  });
});
