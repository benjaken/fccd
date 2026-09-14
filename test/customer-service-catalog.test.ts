import { describe, expect, it } from "vitest";

import {
  customerServiceCatalogReply,
  customerServiceCatalogQuery,
  customerServiceCatalogSearchAnchor,
  isCustomerServiceCatalogRequest,
  mappedCustomerServiceCatalogAssets,
  rankCustomerServiceCatalog,
} from "../supabase/functions/_shared/customer-service-catalog.ts";

const candidates = [
  {
    id: "mid-autumn-4-6",
    sku: "CCMA0406",
    name: "【2026中秋】中秋團圓套餐 (4-6人)",
    price: 1680,
    channelName: "Catering",
  },
  {
    id: "mid-autumn-6-8",
    sku: "CCMA0608",
    name: "【2026中秋】中秋到會套餐 (6-8人)",
    price: 2080,
    channelName: "Catering",
  },
  {
    id: "old-mid-autumn-6",
    sku: "KCMA0601",
    name: "【2024中秋】秋蟹嚐鮮盛宴 (六位用)",
    price: 4288,
    channelName: "Kitchen",
  },
];

describe("customer-service catalog lookup", () => {
  it("recognizes Arabic and Chinese seasonal headcount ranges", () => {
    expect(isCustomerServiceCatalogRequest("中秋6-8")).toBe(true);
    expect(
      isCustomerServiceCatalogRequest(
        "打算訂中秋六至八人餐，請問有參考圖片及菜式嗎？",
      ),
    ).toBe(true);
    expect(customerServiceCatalogSearchAnchor("想睇中秋六至八人餐"))
      .toBe("中秋");
  });

  it("uses recent customer context for a short reference follow-up", () => {
    expect(
      customerServiceCatalogQuery("未有訂單，想參考", [
        { role: "customer", text: "中秋6-8" },
        { role: "assistant", text: "請提供日期或者人數。" },
      ]),
    ).toContain("中秋6-8");
  });

  it("selects the current package with the exact requested headcount range", () => {
    expect(rankCustomerServiceCatalog("中秋6-8", candidates, 2026)[0]?.id)
      .toBe("mid-autumn-6-8");
    expect(rankCustomerServiceCatalog("中秋4-6", candidates, 2026)[0]?.id)
      .toBe("mid-autumn-4-6");
  });

  it("only exposes a Shopify URL when the package has an exact active mapping", () => {
    const draft = {
      storeId: "store-catering",
      shopifyProductId: "123456789",
      handle: "ccma0406",
      imageUrl: "https://cdn.example.com/ccma0406.jpg",
    };

    expect(
      mappedCustomerServiceCatalogAssets(
        "mid-autumn-4-6",
        "Catering",
        [],
        [draft],
      ),
    ).toEqual({ imageUrl: null, productUrl: null });

    expect(
      mappedCustomerServiceCatalogAssets(
        "mid-autumn-4-6",
        "Catering",
        [{
          internalPackageId: "mid-autumn-4-6",
          storeId: "store-catering",
          shopifyProductId: "123456789",
          shopDomain: "foodchannels-catering.myshopify.com",
          channelName: "Catering",
        }],
        [draft],
      ).productUrl,
    ).toBe("https://foodchannels-catering.com/products/ccma0406");
  });

  it("omits the package-detail line when no Shopify URL is available", () => {
    const reply = customerServiceCatalogReply({
      ...candidates[0],
      imageUrl: null,
      productUrl: null,
      items: [],
    });

    expect(reply).not.toContain("套餐詳情：");
    expect(reply).not.toMatch(/(?:^|\n)1(?:$|\n)/);
  });
});
