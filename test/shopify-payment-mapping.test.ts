import { describe, expect, it } from "vitest";
import {
  collectLineMenuRemarkText,
  collectFreeDrinkRemarkText,
  extractDeliveryFromRemark,
  extractOptionRemark,
  filterLegacyPaymentDuplicates,
  mapShopifyOrder,
  mapShopifyTransaction,
  normalizeShopifyDeliveryTime,
  normalizeShopifyPhone,
  linkedOrderLineSnapshotPatch,
  normalizeNameForMatch,
  orderNeedsTransactionSync,
  planShopifyMenuOptions,
  parseMenuRemark,
  parseShopifyFreeDrinks,
  mergeShopifyLunchBoxLines,
  replaceShopifyFreeDrinkSourceLines,
  pickCatalogMatchByName,
  replaceShopifyLunchBoxAggregate,
  resolveShopifyShippingMethodId,
  resolveShopifyDistrictId,
  matchShopifyDistrictName,
  mappedShopifyCityName,
  shopifyLineRemarksSnapshot,
  stripParsedMenuRemarksFromLines,
  resolveShopifySkuSnapshot,
  resolveAliasSku,
  shopifyCateringUtensilPacks,
  shopifyBentoUtensilCount,
  shopifyLunchBoxUtensilCount,
  shopifyLunchBoxVariantRemark,
  shopifyDrinkSelectionQuantity,
  shopifyCustomizationCostParentName,
  isShopifyBeverageName,
  staleGeneratedCustomLineIds,
  shopifyFinancialStatus,
  shopifyOutstanding,
  shopifyTransactionLegacyId,
  shopDomainMatches,
  stripSkuSuffix,
} from "../supabase/functions/shopify-order-sync/map.ts";

describe("Shopify generated beverage reconciliation", () => {
  it("does not treat a tea selection as a catering dish", () => {
    expect(isShopifyBeverageName("蜂蜜綠茶")).toBe(true);
    expect(isShopifyBeverageName("煙三文魚蜂蜜醋沙律")).toBe(false);
  });

  it("counts paid SKU-less picnic boxes for lunch-box utensils", () => {
    expect(shopifyLunchBoxUtensilCount([
      { name: "(5格) 雞扒牛角酥野餐盒", quantity: 5, unitPrice: 88 },
      { name: "咖喱香煎雞扒便當", quantity: 5, unitPrice: 88 },
      { name: "煙三文魚牛角酥輕食盒", quantity: 7, unitPrice: 88 },
      { name: "烏龍茶 7包", quantity: 1, unitPrice: 0 },
    ])).toBe(17);
  });

  it("uses an explicit drink quantity instead of the parent meal quantity", () => {
    expect(shopifyDrinkSelectionQuantity("烏龍茶 6包", 7)).toBe(6);
    expect(shopifyDrinkSelectionQuantity("烏龍茶", 7)).toBe(7);
  });

  it("keeps B-1556 tomato salad as a remark and removes only a trailing drink", () => {
    expect(shopifyLunchBoxVariantRemark("蕃茄沙律")).toBe("蕃茄沙律");
    expect(shopifyLunchBoxVariantRemark("蕃茄沙律 / 蜂蜜綠茶")).toBe("蕃茄沙律");
    expect(shopifyLunchBoxVariantRemark("蜂蜜綠茶")).toBeNull();
  });

  it("parses the authoritative B-1559 order-note drink manifest", () => {
    expect(parseShopifyFreeDrinks("蜂蜜綠茶 6包")).toEqual([
      { name: "蜂蜜綠茶", quantity: 6, unit: "包" },
    ]);
  });

  it("replaces only matching zero-price custom drinks and utensils", () => {
    expect(staleGeneratedCustomLineIds({
      existing: [
        { id: "tea", name: "烏龍茶 6包", unitPrice: 0 },
        { id: "utensils", name: "飯盒餐具包 17份", unitPrice: 0 },
        { id: "paid", name: "烏龍茶 6包", unitPrice: 10 },
        { id: "dish", name: "自訂主菜", unitPrice: 0 },
      ],
      generatedNames: ["烏龍茶 13包", "飯盒餐具包 17份"],
    })).toEqual(["tea", "utensils"]);
  });
});

const baseInput = {
  shopDomain: "test-store.myshopify.com",
  orderId: 4242,
  orderSupabaseId: "order-uuid",
  orderLegacyId: "shopify:test-store:4242",
  channelId: "channel-uuid",
  orderNumber: "#1001",
  orderCurrency: "HKD",
};

describe("Shopify store domain aliases", () => {
  it("accepts the configured primary domain and aliases only", () => {
    const configuredDomains = [
      "hklunchbox.myshopify.com",
      "test-bisbis.myshopify.com",
    ];

    expect(shopDomainMatches("hklunchbox.myshopify.com", configuredDomains)).toBe(true);
    expect(shopDomainMatches("https://TEST-BISBIS.myshopify.com/admin", configuredDomains)).toBe(true);
    expect(shopDomainMatches("another-store.myshopify.com", configuredDomains)).toBe(false);
    expect(shopDomainMatches("hklunchbox.com", configuredDomains)).toBe(false);
  });
});

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

describe("Shopify contact mapping", () => {
  it("removes a leading +852 from phone snapshots", () => {
    expect(normalizeShopifyPhone("+852 9123 4567")).toBe("9123 4567");
    expect(normalizeShopifyPhone("+852-91234567")).toBe("91234567");
    expect(normalizeShopifyPhone("9123 4567")).toBe("9123 4567");
  });

  it("uses only the shipping address and leaves internal remarks empty", () => {
    const mapped = mapShopifyOrder({
      order: {
        id: 102,
        name: "#102",
        phone: "+852 6123 4567",
        note: "Customer delivery instruction",
        shipping_address: {
          address1: "Shipping address 1",
          address2: "Room 2",
          city: "Hong Kong",
        },
        billing_address: { address1: "Billing address must not be used" },
        line_items: [],
      },
      shopDomain: "test-store.myshopify.com",
      storeId: "store-uuid",
      channelId: "channel-uuid",
    });

    expect(mapped!.orderRow).toMatchObject({
      contact_number_a_snapshot: "6123 4567",
      shipping_address_snapshot: "Shipping address 1",
      customer_note_snapshot: "Customer delivery instruction",
      remarks: null,
    });
  });

  it("maps the Shopify shipping-line title to an operational method", () => {
    const methods = [
      { id: "curbside", name: "車邊交收" },
      { id: "door", name: "(上門)", display_name: "送貨上門" },
      { id: "pickup", name: "門市自取" },
      { id: "wine", name: "品酒室 - 外賣盒上" },
      { id: "office", name: "寫字樓 - 外賣盒上" },
    ];

    expect(resolveShopifyShippingMethodId("偏遠地區 - 車邊交收收費A", methods))
      .toBe("curbside");
    expect(resolveShopifyShippingMethodId("偏遠地區－上門收費A", methods))
      .toBe("door");
    expect(resolveShopifyShippingMethodId("門市自取（免費）", methods))
      .toBe("pickup");
    expect(resolveShopifyShippingMethodId("品酒室：外賣盒上", methods))
      .toBe("wine");
    expect(resolveShopifyShippingMethodId("寫字樓–外賣盒上", methods))
      .toBe("office");
    expect(resolveShopifyShippingMethodId("Unknown carrier", methods)).toBeNull();
  });

  it("does not fall back to the billing address", () => {
    const mapped = mapShopifyOrder({
      order: {
        id: 103,
        billing_address: { address1: "Billing address" },
        line_items: [],
      },
      shopDomain: "test-store.myshopify.com",
      storeId: "store-uuid",
      channelId: "channel-uuid",
    });

    expect(mapped!.orderRow.shipping_address_snapshot).toBeNull();
  });

  it("prepends a Shopify city when it is a real district name", () => {
    const mapped = mapShopifyOrder({
      order: {
        id: 2129,
        name: "K-2129",
        shipping_address: {
          address1: "馬鈴徑2-88",
          city: "屯門",
          province: "New Territories",
        },
        line_items: [],
      },
      shopDomain: "test-store.myshopify.com",
      storeId: "store-uuid",
      channelId: "channel-uuid",
    });

    expect(mapped!.orderRow.shipping_address_snapshot).toBe("屯門馬鈴徑2-88");
    expect(mapped!.districtSources).toMatchObject({
      city: "屯門",
      address1: "馬鈴徑2-88",
    });
  });
});

describe("Shopify district mapping", () => {
  const districts = [
    { id: "kowloon-bay", name: "九龍灣", driver_team_id: "fleet-1", created_at: "2026-01-01" },
    { id: "tseung-kwan-o", name: "將軍澳", driver_team_id: "fleet-1", created_at: "2026-01-01" },
    { id: "tbc", name: "TBC", driver_team_id: null, created_at: "2026-01-01" },
    { id: "tuen-shared", name: "屯門", driver_team_id: null, created_at: "2026-01-01" },
    { id: "tuen-fleet", name: "屯門", driver_team_id: "fleet-1", created_at: "2026-01-02" },
    { id: "sai-kung", name: "西貢", driver_team_id: "fleet-1", created_at: "2026-01-01" },
    { id: "sha-tin", name: "沙田", driver_team_id: "fleet-1", created_at: "2026-01-01" },
    { id: "nt", name: "新界", driver_team_id: null, created_at: "2026-01-01" },
  ];

  it("maps city, English city aliases, and address prefixes", () => {
    expect(mappedShopifyCityName("Tuen Mun")).toBe("屯門");
    expect(mappedShopifyCityName("kowloon bay")).toBe("九龍灣");
    expect(mappedShopifyCityName("Kowloon-Bay")).toBe("九龍灣");
    expect(mappedShopifyCityName("KowloonBay")).toBe("九龍灣");
    expect(mappedShopifyCityName("Hong Kong")).toBeNull();

    expect(matchShopifyDistrictName({
      city: "kowloon bay",
      province: "Kowloon",
      address1: "UNIT 501, 5/F,",
      address2: null,
      noteDistrict: null,
    }, districts.map((row) => row.name))).toBe("九龍灣");

    expect(matchShopifyDistrictName({
      city: "Hong Kong",
      province: null,
      address1: "LOHAS Park, Tower 3",
      address2: null,
      noteDistrict: null,
    }, districts.map((row) => row.name))).toBe("將軍澳");

    expect(matchShopifyDistrictName({
      city: "Hong Kong",
      province: null,
      address1: "日出康城第八期 Sea To Sky",
      address2: null,
      noteDistrict: null,
    }, districts.map((row) => row.name))).toBe("將軍澳");

    expect(matchShopifyDistrictName({
      city: "屯門",
      province: "New Territories",
      address1: "馬鈴徑2-88",
      address2: null,
      noteDistrict: null,
    }, districts.map((row) => row.name))).toBe("屯門");

    expect(matchShopifyDistrictName({
      city: "Tuen Mun",
      province: null,
      address1: "馬鈴徑2-88",
      address2: null,
      noteDistrict: null,
    }, districts.map((row) => row.name))).toBe("屯門");

    expect(matchShopifyDistrictName({
      city: "Hong Kong",
      province: "New Territories",
      address1: "西貢康健路泰湖閣海濱別墅16號1樓",
      address2: null,
      noteDistrict: null,
    }, districts.map((row) => row.name))).toBe("西貢");

    expect(matchShopifyDistrictName({
      city: null,
      province: null,
      address1: "新界沙田銀城街30-32號威爾斯親王醫院",
      address2: null,
      noteDistrict: null,
    }, districts.map((row) => row.name))).toBe("沙田");
  });

  it("prefers a shared district row when the same name exists per fleet", () => {
    expect(resolveShopifyDistrictId({
      city: "屯門",
      province: null,
      address1: "馬鈴徑2-88",
      address2: null,
      noteDistrict: null,
    }, districts)).toBe("tuen-shared");
  });

  it("falls back to TBC instead of leaving the district empty", () => {
    expect(resolveShopifyDistrictId({
      city: "Hong Kong",
      province: null,
      address1: "Unknown Place",
      address2: null,
      noteDistrict: null,
    }, districts)).toBe("tbc");
  });

  it("reads a district cart attribute when the street has no prefix", () => {
    expect(matchShopifyDistrictName({
      city: "Hong Kong",
      province: null,
      address1: "馬鈴徑2-88",
      address2: null,
      noteDistrict: "屯門",
    }, districts.map((row) => row.name))).toBe("屯門");
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

  it("parses a lunch-box order note containing structured meal rows", () => {
    const remark = `Tina 9383 2361
Yoyo 6553 0678

(雙格) 沙嗲雞扒飯 x8
(雙格) 手撕雞髀飯 x5
(雙格) 鮮茄牛肉飯 x3
(雙格) 咕嚕魚塊飯 x3
(雙格) 黑椒雞扒炒意粉 x5
(單格) 乾燒雜菌伊麵 x2

共26個`;

    expect(parseMenuRemark(remark)).toEqual([
      { name: "(雙格) 沙嗲雞扒飯", quantity: 8 },
      { name: "(雙格) 手撕雞髀飯", quantity: 5 },
      { name: "(雙格) 鮮茄牛肉飯", quantity: 3 },
      { name: "(雙格) 咕嚕魚塊飯", quantity: 3 },
      { name: "(雙格) 黑椒雞扒炒意粉", quantity: 5 },
      { name: "(單格) 乾燒雜菌伊麵", quantity: 2 },
    ]);
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

describe("parseShopifyFreeDrinks", () => {
  it("keeps note-attribute names so free drink fields remain detectable", () => {
    const text = collectFreeDrinkRemarkText({
      id: 1,
      note_attributes: [{ name: "免費飲品", value: "檸檬茶 10包，紅茶 10包" }],
      line_items: [],
    });
    expect(parseShopifyFreeDrinks(text)).toEqual([
      { name: "檸檬茶", quantity: 10, unit: "包" },
      { name: "紅茶", quantity: 10, unit: "包" },
    ]);
  });

  it("extracts every complimentary tea entry from an order note", () => {
    expect(parseShopifyFreeDrinks(
      "免費飲品：烏龍茶 26包，檸檬茶 x 26包\n送貨前致電",
    )).toEqual([
      { name: "烏龍茶", quantity: 26, unit: "包" },
      { name: "檸檬茶", quantity: 26, unit: "包" },
    ]);
  });

  it("aggregates repeated tea rows and supports English quantities", () => {
    expect(parseShopifyFreeDrinks(
      "Complimentary drinks\nLemon Tea 6 packs\nLemon Tea 4 packs",
    )).toEqual([{ name: "Lemon Tea", quantity: 10, unit: "包" }]);
  });

  it("keeps unmatched tea bags even without a catalog/free marker", () => {
    expect(parseShopifyFreeDrinks("茉莉花茶 20包")).toEqual([
      { name: "茉莉花茶", quantity: 20, unit: "包" },
    ]);
    expect(parseShopifyFreeDrinks("客人想飲茶，送貨前致電")).toEqual([]);
  });

  it("replaces the original free tea row while retaining paid drinks", () => {
    const replacements = parseShopifyFreeDrinks(
      "免費飲品：檸檬茶 10包，紅茶 10包",
    );
    expect(replaceShopifyFreeDrinkSourceLines([
      { product_name_snapshot: "烏龍茶 20包", unit_price: 0 },
      { product_name_snapshot: "道地蜂蜜綠茶 (6包)", unit_price: 28 },
      { product_name_snapshot: "免費紙巾", unit_price: 0 },
    ], replacements)).toEqual([
      { product_name_snapshot: "道地蜂蜜綠茶 (6包)", unit_price: 28 },
      { product_name_snapshot: "免費紙巾", unit_price: 0 },
    ]);
  });
});

describe("normalizeNameForMatch", () => {
  it("normalizes whitespace, full-width parens, and case", () => {
    expect(normalizeNameForMatch(" 科布燒牛肉 南瓜沙律 (2磅) ")).toBe(
      "科布燒牛肉南瓜沙律(2磅)",
    );
    expect(normalizeNameForMatch("ABC DEF")).toBe("abcdef");
    expect(normalizeNameForMatch("(單格) 乾燒雜菌伊麵")).toBe(
      normalizeNameForMatch("(單格) 干燒雜菌伊麵"),
    );
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

describe("Shopify delivery time normalization", () => {
  it("converts Shopify 12-hour ranges to the current 24-hour options", () => {
    expect(normalizeShopifyDeliveryTime("5:00 PM - 6:00 PM")).toBe("17:00 - 18:00");
    expect(normalizeShopifyDeliveryTime("11:00 AM - 12:00 PM")).toBe("11:00 - 12:00");
    expect(normalizeShopifyDeliveryTime("5:30 PM - 6:30 PM")).toBe("17:30 - 18:30");
  });

  it("stores the normalized range on mapped orders", () => {
    const mapped = mapShopifyOrder({
      order: {
        id: 556,
        name: "#5002",
        note_attributes: [{ name: "Delivery time", value: "5:00 PM - 6:00 PM" }],
        line_items: [],
      },
      shopDomain: "test-store.myshopify.com",
      storeId: "store-uuid",
      channelId: "channel-uuid",
    });
    expect(mapped!.orderRow.delivery_time).toBe("17:00 - 18:00");
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

  it("rebuilds P-1149 menu choices stored under generic checkbox properties", () => {
    const text = collectLineMenuRemarkText([
      { name: "checkbox-1", value: "煙三文魚蜂蜜醋沙律 (2磅)" },
      { name: "checkbox-2", value: "野火串燒拼盤 (沙嗲豬肉串6串、沙嗲牛柳串6串), 蒜香避風塘雞翼 (12件)" },
      { name: "checkbox-3", value: "芝士忌廉燴雜菜 (2磅), 狂炸拼盤 (脆炸芝士6件、花枝卷6件、炸雞塊6件、甜薯絲網卷6件、芝士年糕6件)" },
      { name: "checkbox-4", value: "煙肉卡邦尼烤雞扒配雜菌 (2磅), 炭燒松阪豬配菠蘿 (2磅)" },
      { name: "checkbox-5", value: "黑椒煙鴨胸炒意粉 (3磅), 芝士粟米吞拿魚焗長通粉 (3磅)" },
      { name: "checkbox-6", value: "雲呢嗱泡芙 (12件)" },
    ]);

    expect(parseMenuRemark(text)).toEqual([
      { name: "煙三文魚蜂蜜醋沙律 (2磅)", quantity: 1 },
      { name: "野火串燒拼盤 (沙嗲豬肉串6串、沙嗲牛柳串6串)", quantity: 1 },
      { name: "蒜香避風塘雞翼 (12件)", quantity: 1 },
      { name: "芝士忌廉燴雜菜 (2磅)", quantity: 1 },
      { name: "狂炸拼盤 (脆炸芝士6件、花枝卷6件、炸雞塊6件、甜薯絲網卷6件、芝士年糕6件)", quantity: 1 },
      { name: "煙肉卡邦尼烤雞扒配雜菌 (2磅)", quantity: 1 },
      { name: "炭燒松阪豬配菠蘿 (2磅)", quantity: 1 },
      { name: "黑椒煙鴨胸炒意粉 (3磅)", quantity: 1 },
      { name: "芝士粟米吞拿魚焗長通粉 (3磅)", quantity: 1 },
      { name: "雲呢嗱泡芙 (12件)", quantity: 1 },
    ]);

    expect(collectLineMenuRemarkText([
      { name: "checkbox-7", value: "同意餐具安排" },
    ])).toBeNull();
  });

  it("keeps package menu properties as remarks after they become product lines", () => {
    const properties = [
      { name: "必選", value: "醬香牛展拌粉皮 (1磅), 川式涼拌青瓜魚片 (1磅)" },
      { name: "internal_id", value: "2420" },
      { name: "Custom Product", value: "2420" },
    ];
    expect(shopifyLineRemarksSnapshot({ properties })).toContain("醬香牛展拌粉皮");
    expect(shopifyLineRemarksSnapshot({ properties, omitMenuSelections: true }))
      .toBeNull();

    const stripped = stripParsedMenuRemarksFromLines({
      lines: [{
        shopify_line_id: 88,
        remarks_1: "醬香牛展拌粉皮 (1磅), 川式涼拌青瓜魚片 (1磅)\nCustom Product: 2420",
        product_name_snapshot: "【2026中秋】中秋中菜到會 (10-12人)",
      }],
      parsedSourceLineIds: [88],
      mappedLines: [{
        lineId: 88,
        properties,
        variantTitle: null,
        row: { product_name_snapshot: "【2026中秋】中秋中菜到會 (10-12人)" },
      }],
      lunchBox: false,
    });
    expect(stripped[0].remarks_1).toBe(
      "醬香牛展拌粉皮 (1磅), 川式涼拌青瓜魚片 (1磅)",
    );
  });

  it("keeps K-2132 package and add-on properties as line remarks", () => {
    const packageProperties = [
      {
        name: "套餐必選8道菜",
        value: "竹笙花膠紅燒翅 (8-10位), 花雕蛋白蒸松葉蟹 (1隻), 蔥燒原條海參 (6條)",
      },
      { name: "Custom Product", value: "2420" },
    ];
    const addonProperties = [
      { name: "加購 壽桃包及金豬", value: "蛋黃蓮蓉壽桃包 (6個)" },
      { name: "Custom Product", value: "2420" },
    ];

    const stripped = stripParsedMenuRemarksFromLines({
      lines: [
        { shopify_line_id: 2132, remarks_1: null },
        { shopify_line_id: 2133, remarks_1: null },
      ],
      parsedSourceLineIds: [2132],
      mappedLines: [
        {
          lineId: 2132,
          properties: packageProperties,
          variantTitle: null,
          row: { product_name_snapshot: "饌頌天下美宴 (六位用)" },
        },
        {
          lineId: 2133,
          properties: addonProperties,
          variantTitle: null,
          row: { product_name_snapshot: "蛋黃蓮蓉壽桃包 (6個)" },
        },
      ],
      lunchBox: false,
    });

    expect(stripped[0].remarks_1).toContain("竹笙花膠紅燒翅");
    expect(shopifyLineRemarksSnapshot({ properties: addonProperties }))
      .toBe("蛋黃蓮蓉壽桃包 (6個)");
  });

  it("does not import Custom Product markers into order remarks", () => {
    const mapped = mapShopifyOrder({
      order: {
        id: 556,
        name: "#5002",
        note: "Custom Product: 2420\n需要侍應",
        note_attributes: [
          { name: "Custom Product", value: "2420" },
          { name: "其他備註", value: "請提前通知" },
        ],
        line_items: [],
      },
      shopDomain: "test-store.myshopify.com",
      storeId: "store-uuid",
      channelId: "channel-uuid",
    });

    expect(mapped).not.toBeNull();
    expect(mapped!.remark).toBe("需要侍應\n請提前通知");
    expect(mapped!.orderRow.customer_note_snapshot).toBe("需要侍應");
  });

  it("keeps the gross product price while discount and shipping stay at order level", () => {
    const mapped = mapShopifyOrder({
      order: {
        id: 2128,
        name: "K-2128",
        total_price: "3060",
        total_discounts: "200",
        line_items: [{ id: 1, sku: "CCMA1012", title: "【2026中秋】中秋中菜到會 (10-12人)", quantity: 1, price: "3080", discount_allocations: [{ amount: "200" }] }],
        shipping_lines: [{ id: 2, title: "偏遠地區 - 車邊交收收費A", price: "180", discounted_price: "180" }],
      },
      shopDomain: "foodchannels-kitchen.myshopify.com",
      storeId: "store-uuid",
      channelId: "channel-uuid",
    });
    expect(mapped!.lines).toHaveLength(1);
    expect(mapped!.lines[0].row).toMatchObject({
      sku_snapshot: "CCMA1012",
      product_name_snapshot: "【2026中秋】中秋中菜到會 (10-12人)",
      unit_price: 3080,
      total_price: 3080,
    });
    expect(mapped!.orderRow).toMatchObject({ discount_amount: 200, shipping_fee: 180, grand_total: 3060 });
  });

  it("keeps package options beside their parent and absorbs priced add-on variants", () => {
    const plan = planShopifyMenuOptions({
      sources: [{
        lineId: 400,
        parentItemOrder: 4,
        parentPackageId: "package-ccch0810",
        text: "中式小菜 7選4:\n脆皮吊燒雞 (1隻), 明爐叉燒 (1斤), 鮑汁花菇扒西蘭花 (2磅), 當紅川味辣子雞 (1隻)",
      }],
      addonCandidates: [
        {
          legacyId: "addon-10",
          itemOrder: 5,
          sku: null,
          variantTitle: "鮑汁花菇扒西蘭花 (2磅)",
          quantity: 1,
          unitPrice: 10,
          totalPrice: 10,
        },
        {
          legacyId: "addon-40",
          itemOrder: 6,
          sku: null,
          variantTitle: "當紅川味辣子雞 (1隻)",
          quantity: 1,
          unitPrice: 40,
          totalPrice: 40,
        },
      ],
    });

    expect(plan.options.map((option) => ({
      name: option.name,
      itemOrder: option.itemOrder,
      parentPackageId: option.parentPackageId,
      unitPrice: option.unitPrice,
      totalPrice: option.totalPrice,
    }))).toEqual([
      { name: "脆皮吊燒雞 (1隻)", itemOrder: 4.001, parentPackageId: "package-ccch0810", unitPrice: null, totalPrice: null },
      { name: "明爐叉燒 (1斤)", itemOrder: 4.002, parentPackageId: "package-ccch0810", unitPrice: null, totalPrice: null },
      { name: "鮑汁花菇扒西蘭花 (2磅)", itemOrder: 4.003, parentPackageId: "package-ccch0810", unitPrice: 10, totalPrice: 10 },
      { name: "當紅川味辣子雞 (1隻)", itemOrder: 4.004, parentPackageId: "package-ccch0810", unitPrice: 40, totalPrice: 40 },
    ]);
    expect(plan.consumedAddonLegacyIds).toEqual(["addon-10", "addon-40"]);
  });

  it("reads a surcharge written beside the dish and drops the customization heading", () => {
    expect(parseMenuRemark(`中式小菜 3選1:
薑蔥霸王雞 (1隻) [ $40.00 ]

中式小菜 2選1:
龍躉兩食 (粉絲金菇蒸頭腩+荷豆炒龍躉) [ $100.00 ]`)).toEqual([
      { name: "薑蔥霸王雞 (1隻)", quantity: 1, surcharge: 40 },
      { name: "龍躉兩食 (粉絲金菇蒸頭腩+荷豆炒龍躉)", quantity: 1, surcharge: 100 },
    ]);

    const plan = planShopifyMenuOptions({
      sources: [{
        lineId: 30,
        parentItemOrder: 2,
        parentPackageId: "package-ccma0810",
        text: "中式小菜 3選1:\n薑蔥霸王雞 (1隻) [ $40.00 ]",
      }],
      addonCandidates: [],
    });
    expect(plan.options[0]).toMatchObject({
      name: "薑蔥霸王雞 (1隻)",
      itemOrder: 2.001,
      parentPackageId: "package-ccma0810",
      unitPrice: 40,
      totalPrice: 40,
    });
    expect(shopifyCustomizationCostParentName(
      "Customization Cost for 【2026中秋】賞月到會套餐 (8-10人)",
    )).toBe("【2026中秋】賞月到會套餐 (8-10人)");
  });

  it("derives free six-person utensil packs from catering package capacity", () => {
    expect(shopifyCateringUtensilPacks([
      { packageId: "package-1", name: "精緻中式盛宴 (8-10人)", quantity: 1 },
      { packageId: null, name: "鮮味炸蟹柳蟹鉗 (12件)", quantity: 2 },
    ])).toBe(2);
    expect(shopifyCateringUtensilPacks([
      { packageId: "package-1", name: "精緻中式盛宴 (8-10人)", quantity: 2 },
    ])).toBe(4);
  });

  it("counts one utensil set for every dish containing 便當", () => {
    expect(shopifyBentoUtensilCount([
      { name: "咖喱吉列豬扒便當", quantity: 5 },
      { name: "咖喱唐揚雞塊便當", quantity: 5 },
      { name: "鹽酥雞排滷肉便當", quantity: 5 },
      { name: "粟米魚塊欖菜炒飯", sku: "CBECH06", quantity: 5 },
    ])).toBe(20);
  });
});

describe("Shopify SKU snapshots", () => {
  it("falls back to the matched catalog SKU when a lunch-box line omits its SKU", () => {
    expect(resolveShopifySkuSnapshot({
      shopifySku: null,
      productId: "product-cbe003",
      packageId: null,
      products: [{ id: "product-cbe003", sku: "CBE003", channel_id: "lunch-box" }],
      packages: [],
      stripSuffix: true,
    })).toBe("CBE003");
  });
});

describe("Shopify lunch-box aggregate expansion", () => {
  it("does not merge different unmatched meals that share a price", () => {
    const merged = mergeShopifyLunchBoxLines([
      {
        legacy_id: "line-chicken",
        sku_snapshot: null,
        product_id: null,
        package_id: null,
        product_name_snapshot: "(便當) 咕嚕雞球飯 (獅子頭、時菜、涼菜)",
        remarks_1: null,
        quantity: 16,
        unit_price: 88,
        total_price: 1408,
      },
      {
        legacy_id: "line-pork",
        sku_snapshot: null,
        product_id: null,
        package_id: null,
        product_name_snapshot: "(便當) 香草豬扒飯 (獅子頭、時菜、涼菜)",
        remarks_1: null,
        quantity: 17,
        unit_price: 88,
        total_price: 1496,
      },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.map((line) => line.quantity)).toEqual([16, 17]);
  });

  it("still merges duplicate rows for the same meal", () => {
    const merged = mergeShopifyLunchBoxLines([
      {
        legacy_id: "line-1",
        product_name_snapshot: "(便當) 咕嚕雞球飯",
        quantity: 10,
        unit_price: 88,
        total_price: 880,
      },
      {
        legacy_id: "line-2",
        product_name_snapshot: "（便當）  咕嚕雞球飯",
        quantity: 6,
        unit_price: 88,
        total_price: 528,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      legacy_id: "line-1",
      quantity: 16,
      total_price: 1408,
    });
  });

  it("replaces the aggregate line and distributes its unit price to parsed meals", () => {
    const expanded = replaceShopifyLunchBoxAggregate({
      baseLines: [{
        legacy_id: "aggregate",
        product_name_snapshot: "雙格飯盒",
        quantity: 26,
        unit_price: 54,
        total_price: 1404,
        item_order: 1,
      }],
      menuLines: [
        { product_name_snapshot: "(雙格) 沙嗲雞扒飯", quantity: 8, unit_price: null, total_price: null },
        { product_name_snapshot: "(雙格) 手撕雞髀飯", quantity: 5, unit_price: null, total_price: null },
      ],
    });

    expect(expanded.baseLines).toEqual([]);
    expect(expanded.menuLines).toMatchObject([
      { product_name_snapshot: "(雙格) 沙嗲雞扒飯", unit_price: 54, total_price: 432, item_order: 1 },
      { product_name_snapshot: "(雙格) 手撕雞髀飯", unit_price: 54, total_price: 270, item_order: 1.001 },
    ]);
  });

  it("fills a linked Bubble line's blank name and amount from Shopify", () => {
    expect(linkedOrderLineSnapshotPatch({
      existing: { productName: "   ", unitPrice: 3080, totalPrice: null },
      shopify: {
        productName: "【2026中秋】中秋中菜到會 (10-12人)",
        unitPrice: 3080,
        totalPrice: 3080,
      },
    })).toEqual({
      product_name_snapshot: "【2026中秋】中秋中菜到會 (10-12人)",
      total_price: 3080,
    });
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
    { id: "p-cbe022", sku: "CBE022", name: "(雙格) 咕嚕雞球飯", channel_id: "c-1" },
    { id: "p-cbe083", sku: "CBE083", name: "(雙格) 粟米魚塊飯", channel_id: "c-1" },
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

  it("maps the Shopify chicken-ball lunch-box title to CBE022", () => {
    const match = pickCatalogMatchByName(
      null,
      "(便當) 咕嚕雞球飯 (獅子頭、時菜、涼菜)",
      products,
      packages,
      "c-1",
    );
    expect(match.productId).toBe("p-cbe022");
  });

  it("maps the Shopify corn-fish lunch-box title to CBE083", () => {
    const match = pickCatalogMatchByName(
      null,
      "(便當) 粟米魚塊飯 (獅子頭、時菜、涼菜)",
      products,
      packages,
      "c-1",
    );
    expect(match.productId).toBe("p-cbe083");
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
  it("maps the Shopify chicken-ball lunch-box title to CBE022", () => {
    expect(resolveAliasSku(
      "(便當) 咕嚕雞球飯 (獅子頭、時菜、涼菜)",
    )).toBe("CBE022");
  });

  it("maps the Shopify corn-fish lunch-box title to CBE083", () => {
    expect(resolveAliasSku(
      "(便當) 粟米魚塊飯 (獅子頭、時菜、涼菜)",
    )).toBe("CBE083");
  });

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
