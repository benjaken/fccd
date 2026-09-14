import { describe, expect, it } from "vitest";

import {
  customerServiceCatalogReply,
  customerServiceCatalogItemLinks,
  customerServiceCatalogQuery,
  customerServiceCatalogSearchAnchor,
  customerServiceCatalogProductUrl,
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

  it("uses a recent human reply for a short catalog follow-up", () => {
    expect(
      customerServiceCatalogQuery("有參考圖片嗎？", [
        { role: "customer", text: "想睇下有咩啱六至八人" },
        { role: "human", text: "可以參考中秋6-8套餐。" },
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

  it("builds the branded Shopify product URL from the matched package SKU", () => {
    const assets = mappedCustomerServiceCatalogAssets(
      "mid-autumn-6-8",
      "Catering",
      [],
      [],
      "CCMA0608",
    );

    expect(assets.productUrl).toBe(
      "https://foodchannels-catering.com/products/ccma0608",
    );
    expect(customerServiceCatalogReply({
      ...candidates[1],
      ...assets,
      items: ["醬香牛展拌粉皮 (1磅)"],
    })).toContain(
      "套餐詳情：https://foodchannels-catering.com/products/ccma0608",
    );
  });

  it.each([
    ["Catering", "https://foodchannels-catering.com/products/sku-01"],
    ["HK Lunch Box", "https://hklunchbox.com/products/sku-01"],
    ["HK Party Food", "https://www.hkpartyfood.com/products/sku-01"],
    ["Express", "https://www.foodchannels-express.com/products/sku-01"],
    ["Kitchen", "https://foodchannels-kitchen.com/products/sku-01"],
    ["Cuisine", "https://www.foodchannels-cuisine.com/products/sku-01"],
  ])("uses the %s storefront for catalog links", (channelName, expected) => {
    expect(customerServiceCatalogProductUrl(" SKU-01 ", channelName)).toBe(
      expected,
    );
  });

  it("does not guess a storefront when the package brand is unknown", () => {
    expect(customerServiceCatalogProductUrl("SKU-01", "Unknown")).toBeNull();
  });

  it("adds branded links for at most the first eight package child dishes", () => {
    const items = [
      { name: "醬香牛展拌粉皮 (1磅)", sku: "CCB101" },
      { name: "川香椒麻魚片 (1磅)", sku: "CCB102" },
      { name: "黃金脆香一字骨 (2磅)", sku: "CCB103" },
      { name: "荷塘五色小炒 (2磅)", sku: "CCB104" },
      { name: "薑蔥霸王雞 (1隻)", sku: "CCB105" },
      { name: "豉油皇乾煎大蝦 (12隻)", sku: "CCB106" },
      { name: "蠔皇花膠炆大花菇 (2磅)", sku: "CCB107" },
      { name: "瑤柱珍菇金錢餅 (12件)", sku: "CCB108" },
      { name: "第九款菜式", sku: "CCB109" },
    ];
    const itemLinks = customerServiceCatalogItemLinks(items, "Catering");
    const reply = customerServiceCatalogReply({
      ...candidates[1],
      imageUrl: null,
      productUrl: "https://foodchannels-catering.com/products/ccma0608",
      items: items.map((item) => item.name),
      itemLinks,
    });

    expect(itemLinks).toHaveLength(8);
    expect(reply).toContain(
      "• 醬香牛展拌粉皮 (1磅)：https://foodchannels-catering.com/products/ccb101",
    );
    expect(reply).toContain(
      "• 瑤柱珍菇金錢餅 (12件)：https://foodchannels-catering.com/products/ccb108",
    );
    expect(reply).not.toContain("第九款菜式");
    expect(reply).not.toContain("/products/ccb109");
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

  it("keeps the image URL out of the text reply for native WhatsApp media", () => {
    const reply = customerServiceCatalogReply({
      ...candidates[0],
      imageUrl: "https://cdn.shopify.com/example/package.jpg",
      productUrl: "https://foodchannels-catering.com/products/ccma0406",
      items: [],
    });

    expect(reply).not.toContain("cdn.shopify.com");
    expect(reply).not.toContain("參考圖片：");
    expect(reply).toContain("套餐詳情：");
  });
});
