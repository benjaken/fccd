import { describe, expect, it } from "vitest";

import {
  applyReceiptPdfSettings,
  receiptPdfSettingsFromDraft,
  splitPdfProductLines,
  type ReceiptPdfDraft,
} from "@/lib/receipt-pdf-draft";

const baseDraft: ReceiptPdfDraft = {
  invoiceSourceContentVersion: 1,
  sourceFinancialsVersion: 1,
  receiptNumber: "REC/1",
  customerName: "客戶",
  companyName: "公司",
  contactPerson: "123",
  deliveryAddress: "地址",
  invoiceDate: "1/1/2026",
  deliveryDate: "2/1/2026",
  deliveryTime: "10:00",
  lines: [{ id: "1", description: "產品", unitPrice: "10", quantity: "1" }],
  deliveryFeeId: "",
  deliveryFeeLabel: "Delivery Fee",
  deliveryFee: "30",
  discount: "0",
  cashdollarRedeemed: "0",
  cashdollarPurchased: "0",
  paymentInformation: "Paid",
  receiptPayments: [],
  terms: ["條款 A"],
  paymentMethods: ["付款 A"],
  showCustomerSignature: false,
  signaturePartyName: "公司",
};

describe("receipt PDF settings", () => {
  it("extracts only the PDF-only settings from a draft", () => {
    const settings = receiptPdfSettingsFromDraft(baseDraft);
    expect(settings).toEqual({
      terms: ["條款 A"],
      paymentMethods: ["付款 A"],
      showCustomerSignature: false,
      signaturePartyName: "公司",
      deliveryFeeId: "",
      deliveryFeeLabel: "Delivery Fee",
      deliveryFee: "30",
      discount: "0",
      cashdollarRedeemed: "0",
      cashdollarPurchased: "0",
    });
    expect(settings).not.toHaveProperty("receiptNumber");
    expect(settings).not.toHaveProperty("lines");
  });

  it("restores PDF settings while keeping the latest source fields", () => {
    const merged = applyReceiptPdfSettings(baseDraft, {
      terms: ["已儲存條款"],
      showCustomerSignature: true,
      deliveryFeeId: "fee-1",
      deliveryFeeLabel: "運費－新界區－地面交收",
      deliveryFee: "100",
      discount: "5",
    });

    expect(merged.receiptNumber).toBe("REC/1");
    expect(merged.customerName).toBe("客戶");
    expect(merged.lines).toEqual(baseDraft.lines);
    expect(merged.terms).toEqual(["已儲存條款"]);
    expect(merged.showCustomerSignature).toBe(true);
    expect(merged.deliveryFeeId).toBe("fee-1");
    expect(merged.deliveryFeeLabel).toBe("運費－新界區－地面交收");
    expect(merged.deliveryFee).toBe("100");
    expect(merged.discount).toBe("5");
  });

  it("falls back to source values when a stored setting is missing", () => {
    expect(applyReceiptPdfSettings(baseDraft, {})).toEqual(baseDraft);
    expect(applyReceiptPdfSettings(baseDraft, null)).toEqual(baseDraft);
  });

  it("ignores a stored delivery amount without a selected fee", () => {
    const merged = applyReceiptPdfSettings(baseDraft, { deliveryFee: "999" });
    expect(merged.deliveryFeeId).toBe("");
    expect(merged.deliveryFee).toBe("30");
  });

  it("ignores malformed stored clause lists", () => {
    const merged = applyReceiptPdfSettings(baseDraft, {
      terms: "不是陣列" as unknown as string[],
    });
    expect(merged.terms).toEqual(["條款 A"]);
  });
});

describe("splitPdfProductLines", () => {
  it("keeps all rows on one sheet when no measured break is reported", () => {
    expect(splitPdfProductLines(ids(10), [])).toEqual([ids(10)]);
  });

  it("splits at the row index reported by the layout observer", () => {
    expect(splitPdfProductLines(ids(18), [10])).toEqual([
      ids(10),
      ids(18).slice(10),
    ]);
  });

  it("supports multiple measured breaks and ignores invalid indexes", () => {
    const pages = splitPdfProductLines(ids(12), [8, 3, 8, 0, 12, -1]);
    expect(pages.map((page) => page.length)).toEqual([
      3,
      5,
      4,
    ]);
  });
});

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => index + 1);
}
