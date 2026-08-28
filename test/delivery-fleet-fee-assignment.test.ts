import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260828140000_normalize_fleet_district_fees.sql",
  ),
  "utf8",
);

describe("fleet district fees bound while dispatching", () => {
  it("keeps the sales district and links the fleet/district fee", () => {
    expect(migration).toContain(
      "before insert or update of motorcade_id, district_id",
    );
    expect(migration).toContain(
      "price.delivery_team_id = new.motorcade_id",
    );
    expect(migration).toContain(
      "price.district_id = new.district_id",
    );
    expect(migration).toContain("new.fleet_district_fee_id := v_fee_id");
    expect(migration).not.toContain("new.district_id :=");
  });

  it("creates a missing combination at zero and snapshots the configured fee", () => {
    expect(migration).toContain("insert into public.delivery_fleet_district_fees as price");
    expect(migration).toMatch(/new\.motorcade_id, new\.district_id, 0/);
    expect(migration).toContain("new.basic_fee := coalesce(v_fee, 0)");
    expect(migration).toContain("new.total_fee := coalesce(v_fee, 0) + coalesce(v_surcharges, 0)");
  });

  it("shows every active district for every active fleet in fee management", () => {
    expect(migration).toContain("cross join public.delivery_districts as district");
    expect(migration).toContain("left join public.delivery_fleet_district_fees as price");
    expect(migration).toContain("district.driver_team_id is null");
  });
});
