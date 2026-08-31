import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260830223000_merge_archived_delivery_district_references.sql",
  ),
  "utf8",
);

describe("archived delivery district merge", () => {
  it("canonicalizes archived district references on future writes", () => {
    expect(migration).toContain("canonical_delivery_district_id");
    expect(migration).toContain("canonicalize_delivery_district_reference");
    expect(migration).toContain("canonicalize_order_delivery_district_reference");
    expect(migration).toContain("active.driver_team_id is null");
  });

  it("moves delivery, order, and fee references to canonical districts", () => {
    expect(migration).toContain("update public.deliveries as delivery");
    expect(migration).toContain("update public.orders as orders");
    expect(migration).toContain("delete from public.delivery_fleet_district_fees");
    expect(migration).toContain("archived_district_fee_references_remain");
  });

  it("preserves source delivery fees exactly during the merge", () => {
    expect(migration).toContain("delivery_fee_snapshot");
    expect(migration).toContain("protected_delivery_fee_snapshot");
    expect(migration).toContain("delivery_fees_changed_during_district_merge");
    expect(migration).toContain("protected_delivery_fees_changed");
  });
});
