import { describe, expect, it } from "vitest";

import {
  CUSTOMER_SERVICE_BRAND_MENU_LINKS,
  CUSTOMER_SERVICE_MENU_IMAGE_MIN_CONFIDENCE,
  customerServiceBrandMenuLinks,
  customerServiceMenuBrandFromUrl,
  customerServiceMenuImageBrand,
  customerServiceMenuImageBrandLink,
  customerServiceMenuImageReplyText,
  customerServiceMenuProductMatches,
  customerServiceMenuProductReplyText,
  customerServiceMenuUrlMatchesBrand,
  customerServicePublicProductUrl,
  customerServiceShopifyProductUrl,
  decideCustomerServiceMediaRoute,
} from "../supabase/functions/_shared/customer-service-vision-routing";
import type { CustomerServiceVisionResult } from "../supabase/functions/_shared/customer-service-vision";

function vision(
  overrides: Partial<CustomerServiceVisionResult>,
): CustomerServiceVisionResult {
  return {
    mediaKind: "other",
    extractedText: "",
    entities: {},
    summary: "",
    confidence: 0.9,
    needsHuman: false,
    reason: "",
    ...overrides,
  };
}

describe("customer service media routing", () => {
  it("hands off when there is no vision result", () => {
    expect(decideCustomerServiceMediaRoute(null)).toEqual({ action: "handoff" });
  });

  it("answers a confident menu image with the published menu links", () => {
    expect(
      decideCustomerServiceMediaRoute(
        vision({ mediaKind: "menu_product", confidence: 0.9 }),
      ),
    ).toEqual({ action: "menu" });
  });

  it("hands off a low-confidence or flagged menu image", () => {
    expect(
      decideCustomerServiceMediaRoute(
        vision({
          mediaKind: "menu_product",
          confidence: CUSTOMER_SERVICE_MENU_IMAGE_MIN_CONFIDENCE - 0.01,
        }),
      ),
    ).toEqual({ action: "handoff" });
    expect(
      decideCustomerServiceMediaRoute(
        vision({ mediaKind: "menu_product", confidence: 0.99, needsHuman: true }),
      ),
    ).toEqual({ action: "handoff" });
  });

  it("routes an order screenshot with an entity order number to lookup", () => {
    expect(
      decideCustomerServiceMediaRoute(
        vision({
          mediaKind: "order_screenshot",
          needsHuman: true,
          entities: { orderNumber: " B-1550C " },
        }),
      ),
    ).toEqual({ action: "order", orderNumber: "B-1550C" });
  });

  it("recovers an order number from extracted text when entities miss it", () => {
    expect(
      decideCustomerServiceMediaRoute(
        vision({
          mediaKind: "order_screenshot",
          needsHuman: true,
          extractedText: "訂單 R/202608/88 已送出",
        }),
      ),
    ).toEqual({ action: "order", orderNumber: "R/202608/88" });
  });

  it("hands off an order screenshot without a usable order number", () => {
    expect(
      decideCustomerServiceMediaRoute(
        vision({ mediaKind: "order_screenshot", needsHuman: true }),
      ),
    ).toEqual({ action: "handoff" });
  });

  it("hands off payment, complaint, address and unclear images", () => {
    for (const mediaKind of [
      "payment_proof",
      "food_complaint",
      "address_document",
      "unclear",
      "other",
    ] as const) {
      expect(
        decideCustomerServiceMediaRoute(
          vision({ mediaKind, needsHuman: true, confidence: 0.99 }),
        ),
      ).toEqual({ action: "handoff" });
    }
  });
});

describe("customer service menu image reply", () => {
  it("always includes real ordering links", () => {
    const reply = customerServiceMenuImageReplyText();
    expect(reply).toMatch(/https:\/\/foodchannels-catering\.com\//);
    expect(reply).toMatch(/https:\/\/www\.foodchannels-express\.com\//);
    expect(reply).toContain("實際供應以網站當日顯示為準");
    for (const line of CUSTOMER_SERVICE_BRAND_MENU_LINKS) {
      expect(reply).toContain(line);
    }
  });

  it("uses a provided link list when given", () => {
    const reply = customerServiceMenuImageReplyText([
      "測試品牌：https://example.com/menu",
    ]);
    expect(reply).toContain("測試品牌：https://example.com/menu");
  });

  it("extracts brand menu links from published brand FAQs", () => {
    expect(
      customerServiceBrandMenuLinks([
        {
          question: "Food Channels Express 有冇餐牌可以睇？",
          answer: "你好\nhttps://www.foodchannels-express.com/\n以網站為準。",
        },
        {
          question: "有冇食物相片或者餐牌？",
          answer: "網站有餐牌同部分食物相片。",
        },
        {
          question: "有冇餐牌可以睇？",
          answer: "請問你想查看哪一個品牌的餐牌？",
        },
      ]),
    ).toEqual(["Food Channels Express：https://www.foodchannels-express.com/"]);
  });
});

describe("customer service menu image brand", () => {
  it("prefers an explicit brand over generic category wording", () => {
    expect(
      customerServiceMenuImageBrand(
        "Food Channels Catering 到會套餐，附飯盒包裝",
      ),
    ).toBe("Food Channels Catering");
    expect(customerServiceMenuImageBrand("HK Lunch Box 飯盒餐牌")).toBe(
      "HK Lunch Box",
    );
  });

  it("falls back to category wording when no brand is named", () => {
    expect(customerServiceMenuImageBrand("飯盒同便當餐牌")).toBe("HK Lunch Box");
    expect(customerServiceMenuImageBrand("即日到會餐牌")).toBe(
      "Food Channels Express",
    );
    expect(customerServiceMenuImageBrand("")).toBe("");
  });

  it("maps a brand to its menu link", () => {
    expect(customerServiceMenuImageBrandLink("Food Channels Catering")).toContain(
      "https://foodchannels-catering.com/",
    );
    expect(customerServiceMenuImageBrandLink("Unknown")).toBe("");
  });
});

describe("customer service menu product matching", () => {
  it("keeps a brand-correct product hit whose name contains the term", () => {
    expect(
      customerServiceMenuProductMatches(
        ["椒鹽鮮魷"],
        [
          {
            name: "椒鹽鮮魷拼盤",
            product_url: "https://foodchannels-catering.com/products/a",
          },
        ],
        "Food Channels Catering",
      ),
    ).toEqual([
      {
        name: "椒鹽鮮魷拼盤",
        productUrl: "https://foodchannels-catering.com/products/a",
      },
    ]);
  });

  it("rejects a hit from a different brand", () => {
    expect(
      customerServiceMenuProductMatches(
        ["椒鹽鮮魷"],
        [
          {
            name: "椒鹽鮮魷飯盒",
            product_url: "https://hklunchbox.com/products/a",
          },
        ],
        "Food Channels Catering",
      ),
    ).toEqual([]);
  });

  it("rejects short terms and admits matches without a brand filter", () => {
    expect(customerServiceMenuProductMatches(["魷"], [])).toEqual([]);
    expect(
      customerServiceMenuProductMatches(
        ["椒鹽鮮魷"],
        [{ name: "椒鹽鮮魷", product_url: "https://hklunchbox.com/products/a" }],
      ),
    ).toHaveLength(1);
  });

  it("formats a product reply with links, brand and disclaimer", () => {
    const reply = customerServiceMenuProductReplyText(
      [
        {
          name: "椒鹽鮮魷拼盤",
          productUrl: "https://foodchannels-catering.com/products/a",
        },
      ],
      "Food Channels Catering",
    );
    expect(reply).toContain("椒鹽鮮魷拼盤");
    expect(reply).toContain("https://foodchannels-catering.com/products/a");
    expect(reply).toContain("Food Channels Catering");
    expect(reply).toContain("實際供應以網站當日顯示為準");
  });
});

describe("customer service product code link resolution", () => {
  it("maps known shopify store domains to the public site", () => {
    expect(
      customerServiceShopifyProductUrl(
        "foodchannels-catering.myshopify.com",
        "cc0012-1",
      ),
    ).toBe("https://foodchannels-catering.com/products/cc0012-1");
    expect(
      customerServiceShopifyProductUrl("hklunchbox.com", "char-siu"),
    ).toBe("https://hklunchbox.com/products/char-siu");
    expect(customerServiceShopifyProductUrl("", "x")).toBe("");
    expect(customerServiceShopifyProductUrl("hklunchbox.com", "")).toBe("");
  });

  it("infers the brand from a product URL and enforces the brand filter", () => {
    expect(customerServiceMenuBrandFromUrl("https://hklunchbox.com/products/x"))
      .toBe("HK Lunch Box");
    expect(
      customerServiceMenuBrandFromUrl(
        "https://foodchannels-catering.com/products/x",
      ),
    ).toBe("Food Channels Catering");
    expect(
      customerServiceMenuUrlMatchesBrand(
        "https://hklunchbox.com/products/x",
        "Food Channels Catering",
      ),
    ).toBe(false);
    expect(
      customerServiceMenuUrlMatchesBrand(
        "https://foodchannels-catering.com/products/x",
        "Food Channels Catering",
      ),
    ).toBe(true);
    expect(
      customerServiceMenuUrlMatchesBrand("https://example.com/x", ""),
    ).toBe(true);
  });

  it("rewrites myshopify catalog URLs to the public storefront", () => {
    expect(
      customerServicePublicProductUrl(
        "https://hklunchbox.myshopify.com/products/eco006-1",
      ),
    ).toBe("https://hklunchbox.com/products/eco006-1");
    expect(
      customerServicePublicProductUrl(
        "https://foodchannels-express.myshopify.com/products/eco006-1",
      ),
    ).toBe("https://www.foodchannels-express.com/products/eco006-1");
    expect(
      customerServicePublicProductUrl(
        "https://foodchannels-kitchen.myshopify.com/products/kco006-1",
      ),
    ).toBe("https://foodchannels-kitchen.com/products/kco006-1");
    expect(
      customerServicePublicProductUrl(
        "https://foodchannels-catering.com/products/cc0012-1",
      ),
    ).toBe("https://foodchannels-catering.com/products/cc0012-1");
  });
});
