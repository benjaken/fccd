import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260824033000_create_fleet_district_fee_on_assignment.sql",
  ),
  "utf8",
);

describe("fleet district fees created while dispatching", () => {
  it("runs for fleet or district assignment and reuses the matching fee row", () => {
    expect(migration).toContain(
      "before insert or update of motorcade_id, district_id",
    );
    expect(migration).toContain(
      "district.driver_team_id = new.motorcade_id",
    );
    expect(migration).toContain(
      "lower(btrim(district.name)) = lower(btrim(v_district_name))",
    );
    expect(migration).toContain("new.district_id := v_fleet_district_id");
  });

  it("creates a missing fleet/district fee at zero", () => {
    expect(migration).toContain("insert into public.delivery_districts");
    expect(migration).toMatch(
      /btrim\(v_district_name\),\s*0,\s*new\.motorcade_id/s,
    );
    expect(migration).toContain("pg_advisory_xact_lock");
  });
});
