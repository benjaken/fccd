import { describe, expect, it } from "vitest";

import { clearOrderCustomerInfo, emptyOrderDraft, orderDraftTotals, orderPaymentStatus } from "@/lib/order-editor";
import { normalizeDoNotSendToFactory } from "@/lib/order-factory-settings";

describe("order factory settings", () => {
  it("defaults to unchecked and only checks when the independent flag is true", () => {
    expect(normalizeDoNotSendToFactory(undefined)).toBe(false);
    expect(normalizeDoNotSendToFactory(null)).toBe(false);
    expect(normalizeDoNotSendToFactory(false)).toBe(false);
    expect(normalizeDoNotSendToFactory(true)).toBe(true);
  });
});

describe("order editor totals", () => {
  it("calculates subtotal, adjustments, payments, and outstanding balance", () => {
    const draft = emptyOrderDraft();
    draft.lines = [
      {
        id: "line-1",
        productId: "product-1",
        packageId: null,
        sku: "CBE003",
        name: "拿破崙雞扒意粉",
        remarks: "",
        quantity: 14,
        unitPrice: 45,
      },
    ];
    draft.shippingFee = 80;
    draft.discount = 30;
    draft.cashdollarRedeemed = 20;
    draft.payments = [
      {
        id: "payment-1",
        paymentAt: "2026-09-04T12:00",
        paymentMethodId: "cash",
        amount: 200,
        reference: "",
      },
    ];

    expect(orderDraftTotals(draft)).toEqual({
      subtotal: 630,
      total: 660,
      paid: 200,
      outstanding: 460,
    });
  });

  it("never returns a negative total or outstanding balance", () => {
    const draft = emptyOrderDraft();
    draft.discount = 100;
    draft.payments = [
      {
        id: "payment-1",
        paymentAt: "2026-09-04T12:00",
        paymentMethodId: "cash",
        amount: 500,
        reference: "",
      },
    ];

    expect(orderDraftTotals(draft)).toMatchObject({ total: 0, outstanding: 0 });
  });
});

describe("clear order customer info", () => {
  it("clears customer identity and contact fields while preserving order contents", () => {
    const draft = emptyOrderDraft();
    Object.assign(draft, {
      channelId: "lunch-box",
      customerName: "陳小姐",
      companyName: "測試公司",
      contactA: "91234567",
      contactB: "92345678",
      email: "customer@example.com",
      address: "九龍送貨地址",
      customerNote: "到達前致電",
      deliveryAt: "2026-08-25T12:00",
    });
    draft.lines = [{
      id: "line-1",
      productId: "product-1",
      packageId: null,
      sku: "LB-1",
      name: "試食飯盒",
      remarks: "不要辣",
      quantity: 2,
      unitPrice: 50,
    }];

    const cleared = clearOrderCustomerInfo(draft);

    expect(cleared).toMatchObject({
      customerName: "",
      companyName: "",
      contactA: "",
      contactB: "",
      email: "",
      address: "",
      customerNote: "",
      channelId: "lunch-box",
      deliveryAt: "2026-08-25T12:00",
    });
    expect(cleared.lines).toEqual(draft.lines);
  });
});

describe("order payment status", () => {
  it("distinguishes unpaid, partially paid, and fully paid orders", () => {
    expect(orderPaymentStatus({ total: 500, paid: 0, outstanding: 500, subtotal: 500 })).toBe("unpaid");
    expect(orderPaymentStatus({ total: 500, paid: 200, outstanding: 300, subtotal: 500 })).toBe("partial");
    expect(orderPaymentStatus({ total: 500, paid: 500, outstanding: 0, subtotal: 500 })).toBe("paid");
  });
});
