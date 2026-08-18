import { describe, expect, it } from "vitest";
import {
  extractDeliveryFromRemark,
  mapShopifyOrder,
  mapShopifyTransaction,
  normalizeNameForMatch,
  orderNeedsTransactionSync,
  parseMenuRemark,
  shopifyTransactionLegacyId,
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

const CATERING_REMARK = `沙律 必選:
科布燒牛肉南瓜沙律配油醋 (2磅) x 2, 羽衣甘藍莓果煙鴨胸沙律配蜂蜜醋 (2磅)

三文治 必選:
芝士火腿迷你牛角酥 (18件), 迷你照燒雞肉熱狗 (12件)

分享小食 7選3:
蜜糖雞翼 (30件), 台灣烤香腸 (30條), 唐揚炸雞塊 (30件)

西式熱盤 5選2:
美式醬燒豬肋骨 (12支骨) x 2, 普羅旺斯焗海鱸魚柳 (2條)

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
});

describe("normalizeNameForMatch", () => {
  it("normalizes whitespace, full-width parens, and case", () => {
    expect(normalizeNameForMatch(" 科布燒牛肉 南瓜沙律 (2磅) ")).toBe(
      "科布燒牛肉南瓜沙律(2磅)",
    );
    expect(normalizeNameForMatch("ABC DEF")).toBe("abcdef");
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
});
