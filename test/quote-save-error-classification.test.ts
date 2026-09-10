import { describe, expect, it } from "vitest";

import {
  classifyQuoteSaveError,
  isPersistableOrderPayment,
  isQuoteSaveErrorKey,
  quoteDraftForSave,
} from "@/lib/quote-editor";

describe("classifyQuoteSaveError", () => {
  it("does not blame permissions for generic failures", () => {
    expect(classifyQuoteSaveError(new Error("network down"))).toBe("create");
    expect(classifyQuoteSaveError(null)).toBe("create");
    expect(isQuoteSaveErrorKey("create")).toBe(true);
    expect(isQuoteSaveErrorKey("quote_create_failed")).toBe(false);
  });

  it("maps client-side validation failures that happen before any API call", () => {
    expect(classifyQuoteSaveError(new Error("quote_line_invalid"))).toBe("invalidLine");
    expect(classifyQuoteSaveError(new Error("quote_payment_invalid"))).toBe("paymentInvalid");
    expect(isQuoteSaveErrorKey("invalidLine")).toBe(true);
    expect(isQuoteSaveErrorKey("paymentInvalid")).toBe(true);
  });

  it("maps backend permission and validation failures", () => {
    expect(
      classifyQuoteSaveError({
        code: "42501",
        message: "new row violates row-level security policy",
      }),
    ).toBe("permission");
    expect(classifyQuoteSaveError({ message: "channel_required" })).toBe(
      "channelRequired",
    );
    expect(classifyQuoteSaveError({ message: "customer_required" })).toBe(
      "customerRequired",
    );
    expect(
      classifyQuoteSaveError({ message: "district_create_not_allowed" }),
    ).toBe("districtPermission");
    expect(
      classifyQuoteSaveError({ message: "invalid_order_payment", code: "22023" }),
    ).toBe("paymentInvalid");
  });
});

describe("isPersistableOrderPayment", () => {
  it("rejects add-payment stubs that only have date and outstanding amount", () => {
    expect(isPersistableOrderPayment({
      id: "p1",
      paymentAt: "2026-09-10",
      paymentMethodId: "",
      amount: 120,
      reference: "",
    })).toBe(false);
  });

  it("accepts complete payment rows the batch RPC requires", () => {
    expect(isPersistableOrderPayment({
      id: "p1",
      paymentAt: "2026-09-10",
      paymentMethodId: "method-1",
      amount: 120,
      reference: "ref",
    })).toBe(true);
  });

  it("rejects zero, NaN, or missing date/method", () => {
    expect(isPersistableOrderPayment({
      id: "p1",
      paymentAt: "2026-09-10",
      paymentMethodId: "method-1",
      amount: 0,
      reference: "",
    })).toBe(false);
    expect(isPersistableOrderPayment({
      id: "p1",
      paymentAt: "2026-09-10",
      paymentMethodId: "method-1",
      amount: Number.NaN,
      reference: "",
    })).toBe(false);
    expect(isPersistableOrderPayment({
      id: "p1",
      paymentAt: "",
      paymentMethodId: "method-1",
      amount: 10,
      reference: "",
    })).toBe(false);
  });
});

describe("quoteDraftForSave", () => {
  it("fills automatic district name when the draft has neither id nor name", () => {
    const draft = {
      orderNumber: "",
      channelId: "ch-1",
      quoteStatus: "",
      quoteSalesSourceId: "",
      quoteCommunicationChannelId: "",
      followUpDate: "",
      customerName: "A",
      companyName: "",
      famousBrandTagIds: [],
      isHongKongFamousBrand: false,
      contactA: "1",
      contactB: "",
      email: "a@b.c",
      asanaLink: "",
      address: "",
      districtId: "",
      districtName: "",
      shippingMethodId: "ship-1",
      deliveryDate: "2026-09-10",
      deliveryTime: "",
      shipOutTime: "",
      customerNote: "",
      packingNote: "",
      salesPartnerId: "",
      internalNote: "",
      tagIds: [],
    };
    expect(quoteDraftForSave(draft, "門市自取").districtName).toBe("門市自取");
    expect(quoteDraftForSave({ ...draft, districtName: "中環" }, "門市自取").districtName).toBe("中環");
    expect(quoteDraftForSave({ ...draft, districtId: "d-1" }, "門市自取").districtId).toBe("d-1");
  });
});
