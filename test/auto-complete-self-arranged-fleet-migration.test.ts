import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260928123000_auto_complete_self_arranged_fleet.sql",
  ),
  "utf8",
);

describe("auto-complete self-arranged fleet assignment", () => {
  it("marks 自行叫車 assignments as delivered and backfills open rows", () => {
    expect(migration).toContain(
      "create or replace function public.assign_delivery_motorcade",
    );
    expect(migration).toContain("in ('自行叫車', '自主叫車')");
    expect(migration).toContain("v_auto_complete then coalesce(delivery.fulfilled_at, now())");
    expect(migration).toContain("when v_auto_complete then '已送達'");
    expect(migration).toContain("and delivery.fulfilled_at is null");
  });
});
