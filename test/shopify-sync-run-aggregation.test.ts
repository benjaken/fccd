import { describe, expect, it } from "vitest";

import { aggregateShopifySyncRuns, type ShopifySyncRun } from "../src/lib/shopify-product-approvals";

function run(overrides: Partial<ShopifySyncRun> = {}): ShopifySyncRun {
  return {
    id: crypto.randomUUID(),
    mode: "specific_product",
    runCount: 1,
    status: "completed",
    storeDomain: "foodchannels-kitchen.myshopify.com",
    totalFetched: 1,
    products: 1,
    packages: 0,
    pending: 1,
    conflicts: 0,
    failed: 0,
    createdAt: "2026-08-25T07:16:00.000Z",
    finishedAt: "2026-08-25T07:16:01.000Z",
    errors: [],
    ...overrides,
  };
}

describe("Shopify sync run aggregation", () => {
  it("combines consecutive specific-product runs for the same store", () => {
    const result = aggregateShopifySyncRuns([
      run({ id: "first", createdAt: "2026-08-25T07:14:00.000Z", finishedAt: "2026-08-25T07:14:01.000Z" }),
      run({ id: "second", createdAt: "2026-08-25T07:16:00.000Z", pending: 0, conflicts: 1 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ runCount: 2, totalFetched: 2, products: 2, pending: 1, conflicts: 1 });
  });

  it("keeps stores, non-specific modes, and distant runs separate", () => {
    const result = aggregateShopifySyncRuns([
      run({ id: "kitchen" }),
      run({ id: "other-store", storeDomain: "hk-party-food.myshopify.com" }),
      run({ id: "later", createdAt: "2026-08-25T07:30:00.000Z" }),
      run({ id: "full", mode: "full", totalFetched: 255, products: 255, pending: 253 }),
    ]);

    expect(result).toHaveLength(4);
    expect(result.find((item) => item.id === "full")).toMatchObject({ totalFetched: 255, pending: 253 });
  });
});
