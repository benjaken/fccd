import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260919121000_pickup_orders_use_store_pickup_district.sql",
  ),
  "utf8",
);

const syncIndex = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/functions/shopify-order-sync/index.ts",
  ),
  "utf8",
);

describe("pickup orders keep the 門市自取 district", () => {
  it("uses a distinct migration version from today's other changes", () => {
    const today = readdirSync(path.resolve(process.cwd(), "supabase/migrations"))
      .filter((name) => name.startsWith("20260919"));
    const versions = today.map((name) => name.split("_")[0]);
    expect(new Set(versions).size).toBe(today.length);
  });

  it("anchors pickup districts on 門市自取 and only rewrites TBC rows", () => {
    expect(migration).toContain("lower('門市自取')");
    expect(migration).toContain("(自取|pickup)");
    expect(migration).toContain("= 'tbc'");
    expect(migration).toContain("update public.orders");
    expect(migration).toContain("update public.deliveries");
    expect(migration).toContain("set district_id = pickup_district.id");
  });

  it("resolves the pickup district before the TBC fallback during Shopify sync", () => {
    const pickup = syncIndex.indexOf("isPickupShippingMethodName(methodName)");
    const fallback = syncIndex.indexOf("resolveShopifyDistrictId(item.districtSources");
    expect(pickup).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(pickup);
    expect(syncIndex).toContain("resolvePickupDistrictId(districts)");
  });
});
