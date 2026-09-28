import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260928121500_allow_fleet_reassign_after_pickup.sql",
  ),
  "utf8",
);

describe("allow fleet reassignment after pickup", () => {
  it("lets picked-up deliveries move to another fleet and resets pickup state", () => {
    expect(migration).toContain(
      "create or replace function public.assign_delivery_motorcade",
    );
    expect(migration).not.toContain(
      "picked up or delivered orders cannot change fleet",
    );
    expect(migration).toContain("delivered orders cannot change fleet");
    expect(migration).toContain("taken_at = case");
    expect(migration).toContain("when v_fleet_changed then null");
    expect(migration).toContain("else '待接單'");
  });
});
