import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903020000_fix_driver_delivery_district_fees.sql",
  ),
  "utf8",
);

describe("driver portal district fees after fleet price normalization", () => {
  it("reads master districts and the session team's fleet prices", () => {
    expect(migration).toContain("left join public.delivery_fleet_district_fees as price");
    expect(migration).toContain("price.delivery_team_id = session.delivery_team_id");
    expect(migration).toContain("price.district_id = district.id");
    expect(migration).toContain("district.driver_team_id is null");
    expect(migration).not.toContain("district.driver_team_id=session.delivery_team_id");
    expect(migration).not.toContain("district.default_fee");
  });
});
