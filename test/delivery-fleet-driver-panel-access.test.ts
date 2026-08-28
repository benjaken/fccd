import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260828131000_delivery_fleet_driver_panel_access.sql",
  "utf8",
);

describe("delivery fleet driver portal access", () => {
  it("requires an enabled driver panel when a fleet logs in", () => {
    expect(migration).toContain("and driver_panel_enabled = true");
  });

  it("revokes existing sessions as soon as access is disabled", () => {
    expect(migration).toMatch(
      /if not coalesce\(p_driver_panel_enabled, true\)[\s\S]*?delete from private\.driver_delivery_sessions[\s\S]*?where delivery_team_id = v_fleet_id/,
    );
  });

  it("keeps existing fleets enabled during rollout", () => {
    expect(migration).toContain(
      "driver_panel_enabled boolean not null default true",
    );
  });
});
