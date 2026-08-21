import { describe, expect, it } from "vitest";
import {
  collectLineMenuRemarkText,
  extractDeliveryFromRemark,
  extractOptionRemark,
  filterLegacyPaymentDuplicates,
  mapShopifyOrder,
  mapShopifyTransaction,
  normalizeNameForMatch,
  orderNeedsTransactionSync,
  parseMenuRemark,
  pickCatalogMatchByName,
  resolveAliasSku,
  shopifyFinancialStatus,
  shopifyOutstanding,
  shopifyTransactionLegacyId,
  stripSkuSuffix,
} from "../supabase/functions/shopify-order-sync/map.ts";

const baseInput = {
  shopDomain: "test-store.myshopify.com",
  orderId: 4242,
  orderSupabaseId: "order-uuid",
  orderLegacyId: "shopify:test-store:4242",
  channelId: "channel-uuid",
  orderNumber: "#1001",
  orderCurrency: "HKD",
};

describe("shopify transaction mapping", () => {
  it("maps a successful sale transaction into a payments row", () => {
    const row = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9001,
        kind: "sale",
        status: "success",
        amount: "1234.56",
        currency: "HKD",
        gateway: "shopify_payments",
        authorization: "auth-abc",
        created_at: "2026-08-01T12:00:00.000Z",
      },
    });

    expect(row).toBeTruthy();
    expect(row!.legacy_id).toBe(
      shopifyTransactionLegacyId(baseInput.shopDomain, 4242, 9001),
    );
    expect(row!.order_id).toBe("order-uuid");
    expect(row!.amount).toBe(1234.56);
    expect(row!.currency).toBe("HKD");
    expect(row!.payment_at).toBe("2026-08-01T12:00:00.000Z");
    expect(row!.voided_at).toBeNull();
  });

  it("skips authorization transactions (only sale/capture are payments)", () => {
    const row = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9002,
        kind: "authorization",
        status: "success",
        amount: "100.00",
        currency: "HKD",
      },
    });
    expect(row).toBeNull();
  });

  it("skips failed transactions", () => {
    const row = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9003,
        kind: "sale",
        status: "failure",
        amount: "100.00",
        currency: "HKD",
      },
    });
    expect(row).toBeNull();
  });

  it("skips zero or negative amounts", () => {
    for (const amount of ["0.00", "-5.00", "0"]) {
      const row = mapShopifyTransaction({
        ...baseInput,
        transaction: {
          id: 9004,
          kind: "sale",
          status: "success",
          amount,
          currency: "HKD",
        },
      });
      expect(row).toBeNull();
    }
  });

  it("maps capture and refund-like kinds correctly", () => {
    const capture = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9005,
        kind: "capture",
        status: "success",
        amount: "50.00",
        currency: "HKD",
      },
    });
    expect(capture).toBeTruthy();
  });

  it("falls back to the order currency when transaction has none", () => {
    const row = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9006,
        kind: "sale",
        status: "success",
        amount: "10.00",
        currency: null,
      },
    });
    expect(row!.currency).toBe("HKD");
  });

  it("stores paypal authorization in paypal_reference for paypal gateway", () => {
    const row = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9007,
        kind: "sale",
        status: "success",
        amount: "20.00",
        currency: "HKD",
        gateway: "paypal",
        authorization: "PAY-123",
      },
    });
    expect(row!.paypal_reference).toBe("PAY-123");
  });
});

describe("Shopify payment duplicate prevention", () => {
  const shopify = (id: string, amount: number, paymentAt: string) => ({
    legacy_id: `shopify:test:1:txn:${id}`,
    order_id: "order-1",
    amount,
    currency: "HKD",
    payment_at: paymentAt,
  });
  const bubble = (id: string, amount: number, paymentAt: string) => ({
    legacy_id: `bubble-${id}`,
    order_id: "order-1",
    amount,
    currency: "HKD",
    payment_at: paymentAt,
  });

  it("does not add a Shopify receipt already imported from Bubble", () => {
    expect(filterLegacyPaymentDuplicates(
      [shopify("1", 7440, "2026-08-04T08:02:15.000Z")],
      [bubble("1", 7440, "2026-08-03T16:00:00.000Z")],
    )).toEqual([]);
  });

  it("keeps different amounts, currencies, dates, and orders", () => {
    const rows = [
      shopify("amount", 7441, "2026-08-04T08:02:15.000Z"),
      { ...shopify("currency", 7440, "2026-08-04T08:02:15.000Z"), currency: "USD" },
      shopify("date", 7440, "2026-08-05T08:02:15.000Z"),
      { ...shopify("order", 7440, "2026-08-04T08:02:15.000Z"), order_id: "order-2" },
    ];
    expect(filterLegacyPaymentDuplicates(
      rows,
      [bubble("1", 7440, "2026-08-03T16:00:00.000Z")],
    )).toEqual(rows);
  });

  it("pairs duplicates one-to-one and preserves a real same-amount instalment", () => {
    const first = shopify("1", 1200, "2026-08-04T08:00:00.000Z");
    const second = shopify("2", 1200, "2026-08-04T10:00:00.000Z");
    expect(filterLegacyPaymentDuplicates(
      [first, second],
      [bubble("1", 1200, "2026-08-03T16:00:00.000Z")],
    )).toEqual([second]);
  });
});

describe("orderNeedsTransactionSync", () => {
  it("returns false for unpaid (pending) orders", () => {
    expect(
      orderNeedsTransactionSync({ id: 1, financial_status: "pending" }),
    ).toBe(false);
  });

  it("returns true for paid and partially paid orders", () => {
    expect(
      orderNeedsTransactionSync({ id: 1, financial_status: "paid" }),
    ).toBe(true);
    expect(
      orderNeedsTransactionSync({ id: 1, financial_status: "partially_paid" }),
    ).toBe(true);
    expect(
      orderNeedsTransactionSync({ id: 1, financial_status: null }),
    ).toBe(true);
  });
});

describe("Shopify-owned payment status", () => {
  it("uses Shopify total_outstanding when it is available", () => {
    const order = {
      id: 1,
      financial_status: "PARTIALLY_PAID",
      total_price: "1000.00",
      total_outstanding: "350.00",
    };

    expect(shopifyFinancialStatus(order)).toBe("partially_paid");
    expect(shopifyOutstanding(order)).toBe(350);
  });

  it("does not turn a refund into a new customer debt", () => {
    expect(shopifyOutstanding({
      id: 1,
      financial_status: "partially_refunded",
      total_price: "1000.00",
    })).toBe(0);
  });

  it("marks a mapped Shopify order as Shopify-managed", () => {
    const mapped = mapShopifyOrder({
      order: {
        id: 101,
        name: "#101",
        financial_status: "paid",
        total_price: "500.00",
        total_outstanding: "0.00",
        line_items: [],
      },
      shopDomain: "test-store.myshopify.com",
      storeId: "store-uuid",
      channelId: "channel-uuid",
    });

    expect(mapped).not.toBeNull();
    expect(mapped!.orderRow).toMatchObject({
      payment_status_source: "shopify",
      shopify_financial_status: "paid",
      outstanding: 0,
    });
  });
});

const CATERING_REMARK = `沙律 必選:
科布燒牛肉南瓜沙律配油醋 (2磅) x 2, 羽衣甘藍莓果煙鴨胸沙律配蜂蜜醋 (2磅)

三文治 必選:
芝士火腿迷你牛角酥 (18件), 迷你照燒雞肉熱狗 (12件)

分享小食 7選3:
蜜糖雞翼 (30件), 台灣烤香腸 (30條), 唐揚炸雞塊 (30件)

西式熱盤 5選2:
美式醬燒豬肋骨 (12支骨) x 2, 普羅旺斯焗海鱸魚柳 (2條)

粉麵飯 4選2:
芝士肉醬意粉 (3磅), 葡汁雞扒焗飯 (3磅)

分享小食 必選:
芝士忌廉燴雜菜 (2磅) x 2, 墨西哥脆片配蕃茄莎莎 (2磅) x 2

甜品 必選:
西式甜品拼盤 (泡芙9件+布朗尼9件), 歐式甜品拼盤 (香蕉蛋糕9件+布朗尼9件)`;

describe("parseMenuRemark", () => {
  it("parses paragraphs and options with quantities", () => {
    const options = parseMenuRemark(CATERING_REMARK);
    expect(options).toEqual([
      { name: "科布燒牛肉南瓜沙律配油醋 (2磅)", quantity: 2 },
      { name: "羽衣甘藍莓果煙鴨胸沙律配蜂蜜醋 (2磅)", quantity: 1 },
      { name: "芝士火腿迷你牛角酥 (18件)", quantity: 1 },
      { name: "迷你照燒雞肉熱狗 (12件)", quantity: 1 },
      { name: "蜜糖雞翼 (30件)", quantity: 1 },
      { name: "台灣烤香腸 (30條)", quantity: 1 },
      { name: "唐揚炸雞塊 (30件)", quantity: 1 },
      { name: "美式醬燒豬肋骨 (12支骨)", quantity: 2 },
      { name: "普羅旺斯焗海鱸魚柳 (2條)", quantity: 1 },
      { name: "芝士肉醬意粉 (3磅)", quantity: 1 },
      { name: "葡汁雞扒焗飯 (3磅)", quantity: 1 },
      { name: "芝士忌廉燴雜菜 (2磅)", quantity: 2 },
      { name: "墨西哥脆片配蕃茄莎莎 (2磅)", quantity: 2 },
      { name: "西式甜品拼盤 (泡芙9件+布朗尼9件)", quantity: 1 },
      { name: "歐式甜品拼盤 (香蕉蛋糕9件+布朗尼9件)", quantity: 1 },
    ]);
  });

  it("returns an empty list for blank remarks", () => {
    expect(parseMenuRemark("")).toEqual([]);
    expect(parseMenuRemark(null)).toEqual([]);
    expect(parseMenuRemark(undefined)).toEqual([]);
  });

  it("does not parse a bare option line without a menu title", () => {
    expect(parseMenuRemark("科布燒牛肉南瓜沙律配油醋 (2磅)")).toEqual([]);
  });

  it("does not parse delivery/pickup notes as menu options", () => {
    expect(
      parseMenuRemark(
        "需要侍應\nShipping\n21/08/2026\n05:00 PM - 06:00 PM\nFriday\ndd/mm/yy",
      ),
    ).toEqual([]);
    expect(
      parseMenuRemark(
        "送貨Please contact 詹先生 61496065\nPickup / Delivery\n1787031822562\nFri, 21 Aug 2026\n11:00 AM - 12:00 PM",
      ),
    ).toEqual([]);
  });

  it("keeps commas inside parentheses within a single option", () => {
    const remark = "甜品 必選:\n西式甜品拼盤 (泡芙9件+布朗尼9件)";
    expect(parseMenuRemark(remark)).toEqual([
      { name: "西式甜品拼盤 (泡芙9件+布朗尼9件)", quantity: 1 },
    ]);
  });

  it("accepts Shopify multiplier and unit quantity spellings", () => {
    const remark = `小食 必選:
蜜糖雞翼 (30件) × 2，台灣烤香腸 (30條) 2套, 唐揚炸雞塊 (30件) 2件, 墨西哥脆片 (2磅) X2`;
    expect(parseMenuRemark(remark)).toEqual([
      { name: "蜜糖雞翼 (30件)", quantity: 2 },
      { name: "台灣烤香腸 (30條)", quantity: 2 },
      { name: "唐揚炸雞塊 (30件)", quantity: 2 },
      { name: "墨西哥脆片 (2磅)", quantity: 2 },
    ]);
  });
});

describe("normalizeNameForMatch", () => {
  it("normalizes whitespace, full-width parens, and case", () => {
    expect(normalizeNameForMatch(" 科布燒牛肉 南瓜沙律 (2磅) ")).toBe(
      "科布燒牛肉南瓜沙律(2磅)",
    );
    expect(normalizeNameForMatch("ABC DEF")).toBe("abcdef");
    expect(normalizeNameForMatch("(素) 荷塘五色小炒 (2磅)")).toBe("荷塘五色小炒(2磅)");
  });
});

describe("extractDeliveryFromRemark", () => {
  it("reads delivery date and time lines from a remark", () => {
    const { deliveryAt, deliveryTime } = extractDeliveryFromRemark(
      "送貨日期: 2026-08-20\n送貨時間: 05:00 PM - 06:00 PM",
    );
    expect(deliveryAt).toBe("2026-08-20T00:00:00.000Z");
    expect(deliveryTime).toBe("05:00 PM - 06:00 PM");
  });

  it("returns nulls when no delivery lines exist", () => {
    expect(extractDeliveryFromRemark(CATERING_REMARK)).toEqual({
      deliveryAt: null,
      deliveryTime: null,
    });
  });

  it("parses bare shipping block values (no label prefixes)", () => {
    const catering = extractDeliveryFromRemark(
      "需要侍應\nShipping\n21/08/2026\n05:00 PM - 06:00 PM\nFriday\ndd/mm/yy",
    );
    expect(catering.deliveryAt).toBe("2026-08-21T00:00:00.000Z");
    expect(catering.deliveryTime).toBe("05:00 PM - 06:00 PM");

    const lunchbox = extractDeliveryFromRemark(
      "送貨Please contact 詹先生 61496065\nPickup / Delivery\n1787031822562\nFri, 21 Aug 2026\n11:00 AM - 12:00 PM\n星期五, 21 8月 2026\n11:00 AM - 12:00 PM",
    );
    expect(lunchbox.deliveryAt).toBe("2026-08-21T00:00:00.000Z");
    expect(lunchbox.deliveryTime).toBe("11:00 AM - 12:00 PM");

    const lunchbox2 = extractDeliveryFromRemark(
      "Pickup / Delivery\nTue, 8 Sep 2026\nTue, 8 Sep 2026\n11:00 AM - 12:00 PM\n11:00 AM - 12:00 PM",
    );
    expect(lunchbox2.deliveryAt).toBe("2026-09-08T00:00:00.000Z");
    expect(lunchbox2.deliveryTime).toBe("11:00 AM - 12:00 PM");
  });

  it("ignores bare numeric ids and section headers", () => {
    const { deliveryAt, deliveryTime } = extractDeliveryFromRemark(
      "Pickup / Delivery\n1787031822562\nFriday\ndd/mm/yy",
    );
    expect(deliveryAt).toBeNull();
    expect(deliveryTime).toBeNull();
  });
});

describe("mapShopifyOrder remark collection", () => {
  it("merges order note and note_attributes into the remark", () => {
    const mapped = mapShopifyOrder({
      order: {
        id: 555,
        name: "#5001",
        note: "需要侍應",
        note_attributes: [
          { name: "套餐選項", value: "沙律 必選:\n科布燒牛肉南瓜沙律配油醋 (2磅) x 2" },
        ],
        line_items: [],
      },
      shopDomain: "test-store.myshopify.com",
      storeId: "store-uuid",
      channelId: "channel-uuid",
    });

    expect(mapped).not.toBeNull();
    expect(mapped!.remark).toContain("需要侍應");
    expect(mapped!.remark).toContain("科布燒牛肉南瓜沙律配油醋 (2磅) x 2");
  });

  it("rebuilds menu headings stored in line property names", () => {
    const text = collectLineMenuRemarkText([
      { name: "必選", value: "醬香牛展拌粉皮 (1磅), 川式涼拌青瓜魚片 (1磅)" },
      { name: "中式小菜 4選2", value: "豉油皇乾煎大蝦 (12隻), 蠔皇花膠炆大花菇 (2磅)" },
    ]);
    expect(parseMenuRemark(text)).toEqual([
      { name: "醬香牛展拌粉皮 (1磅)", quantity: 1 },
      { name: "川式涼拌青瓜魚片 (1磅)", quantity: 1 },
      { name: "豉油皇乾煎大蝦 (12隻)", quantity: 1 },
      { name: "蠔皇花膠炆大花菇 (2磅)", quantity: 1 },
    ]);
  });

  it("maps the discounted product price but keeps shipping outside package lines", () => {
    const mapped = mapShopifyOrder({
      order: {
        id: 2128,
        name: "K-2128",
        total_price: "3060",
        total_discounts: "200",
        line_items: [{ id: 1, sku: "CCMA1012", title: "中秋中菜到會", quantity: 1, price: "3080", discount_allocations: [{ amount: "200" }] }],
        shipping_lines: [{ id: 2, title: "偏遠地區 - 車邊交收收費A", price: "180", discounted_price: "180" }],
      },
      shopDomain: "foodchannels-kitchen.myshopify.com",
      storeId: "store-uuid",
      channelId: "channel-uuid",
    });
    expect(mapped!.lines).toHaveLength(1);
    expect(mapped!.lines[0].row).toMatchObject({ unit_price: 2880, total_price: 2880 });
    expect(mapped!.orderRow).toMatchObject({ shipping_fee: 180, grand_total: 3060 });
  });
});

describe("stripSkuSuffix", () => {
  it("strips a trailing numeric suffix so Shopify SKUs match the catalog", () => {
    expect(stripSkuSuffix("CBESE06-51")).toBe("CBESE06");
    expect(stripSkuSuffix("CBA003-18")).toBe("CBA003");
    expect(stripSkuSuffix("CBESE06")).toBe("CBESE06");
    expect(stripSkuSuffix(null)).toBeNull();
  });
});

describe("pickCatalogMatchByName", () => {
  const products = [
    { id: "p-cbese06", sku: "CBESE06", name: "(三格) 肉醬意粉盒", channel_id: "c-1" },
    { id: "p-cbe003", sku: "CBE003", name: "(雙格) 拿破崙雞扒意粉", channel_id: "c-1" },
    { id: "p-cdr001", sku: "CDR001-8", name: "可口可樂 (8罐)", channel_id: "c-1" },
  ];
  const packages: Array<{ id: string; sku: string | null; name: string | null; channel_id: string | null }> = [];

  it("matches a suffixed Shopify SKU to the catalog base SKU", () => {
    const match = pickCatalogMatchByName("CBESE06-51", null, products, packages, "c-1");
    expect(match.productId).toBe("p-cbese06");
  });

  it("matches by name when SKU is missing", () => {
    const match = pickCatalogMatchByName(null, "(雙格) 拿破崙雞扒意粉", products, packages, "c-1");
    expect(match.productId).toBe("p-cbe003");
  });

  it("resolves a Coke line with no SKU to the catalog Coke product", () => {
    const match = pickCatalogMatchByName(null, "可口可樂 (8罐)", products, packages, "c-1");
    expect(match.productId).toBe("p-cdr001");
  });

  it("matches a unique package SKU from another sales channel", () => {
    const match = pickCatalogMatchByName("CCMA1012", "【2026中秋】中秋中菜到會", [], [
      { id: "pkg-mid-autumn", sku: "CCMA1012", name: "【2025中秋】中秋中菜到會", channel_id: "catering" },
    ], "kitchen");
    expect(match.packageId).toBe("pkg-mid-autumn");
  });
});

describe("resolveAliasSku", () => {
  it("maps loose Coke names to the CDR001 prefix", () => {
    expect(resolveAliasSku("可口可樂 (8罐)")).toBe("CDR001-8");
    expect(resolveAliasSku("可口可樂 40罐")).toBe("CDR001-40");
    expect(resolveAliasSku("(凍)可口可樂-17罐")).toBe("CDR001-17");
    expect(resolveAliasSku("非可樂飲品")).toBeNull();
  });

  it("maps the renamed 2026 cold fish option to its catalog SKU", () => {
    expect(resolveAliasSku("川式涼拌青瓜魚片 (1磅)")).toBe("CCO024-1");
  });
});

describe("extractOptionRemark", () => {
  it("extracts the option text after 配 like the legacy Bubble system", () => {
    expect(extractOptionRemark("(三格) 肉醬意粉盒 配瑞士雞翼 2隻")).toBe("瑞士雞翼 2隻");
    expect(extractOptionRemark("(三格) 肉醬意粉盒   配菠蘿芝士腸串 2串")).toBe("菠蘿芝士腸串 2串");
    expect(extractOptionRemark("(三格) 肉醬意粉盒")).toBeNull();
    expect(extractOptionRemark(null)).toBeNull();
  });
});
