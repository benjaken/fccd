import { describe, expect, it } from "vitest";

import { emptyOrderDraft, orderDraftTotals } from "@/lib/order-editor";

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
