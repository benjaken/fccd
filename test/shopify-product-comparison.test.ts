import { describe, expect, it } from "vitest";

import { buildShopifyDatabaseComparison } from "../src/lib/shopify-product-comparison";
import type { ShopifyPendingDetail } from "../src/lib/shopify-product-approvals";

function detail(): ShopifyPendingDetail {
  return {
    id: "draft-1",
    storeId: "store-1",
    storeDomain: "hk-party-food.myshopify.com",
    shopifyProductId: 7497400418391,
    title: "蝦滑蒸鮮冬菇 (12粒)",
    catalogType: "product",
    status: "pending",
    shopifyStatus: "active",
    variantCount: 1,
    skus: ["CCH067-12"],
    blockingReasons: [],
    sourceTopic: null,
    updatedAt: "2026-08-25T00:00:00Z",
    handle: "shrimp-mushroom",
    descriptionHtml: "<p>重量: 12粒</p>",
    vendor: "Food Channels",
    productType: "中式小菜",
    featuredImageUrl: null,
    sourceUpdatedAt: "2026-08-25T00:00:00Z",
    changeDiff: {},
    variants: [{
      id: "variant-1",
      shopifyVariantId: 1,
      title: "Default Title",
      sku: "CCH067-12",
      price: 188,
      matchedProductId: "product-1",
      matchStatus: "sku_matched",
      currentProduct: {
        id: "product-1",
        sku: "CCH067-12",
        name: "蝦滑蒸鮮冬菇 (12粒)",
        description: null,
        imageUrl: null,
        price: 188,
        isActive: true,
        status: "Active",
        updatedAt: "2026-08-12T00:00:00Z",
      },
    }],
    choiceSets: [],
    fixedItems: [],
    currentPackage: null,
  };
}

describe("Shopify database comparison", () => {
  it("marks unchanged catalog fields and identifies the incoming description", () => {
    const rows = buildShopifyDatabaseComparison(detail());
    expect(rows.find((row) => row.field === "name")?.status).toBe("same");
    expect(rows.find((row) => row.field === "sku")?.status).toBe("same");
    expect(rows.find((row) => row.field === "price")?.status).toBe("same");
    expect(rows.find((row) => row.field === "description")).toMatchObject({
      currentValue: "—",
      shopifyValue: "重量: 12粒",
      status: "changed",
    });
  });

  it("marks all incoming fields as new when no database product is matched", () => {
    const value = detail();
    value.variants[0].currentProduct = null;
    value.variants[0].matchedProductId = null;
    const rows = buildShopifyDatabaseComparison(value);
    expect(rows.every((row) => row.status === "new")).toBe(true);
  });
});
