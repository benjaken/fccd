import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: { from: fromMock },
}));

import {
  fetchReceiptPdfSettings,
  saveReceiptPdfSettings,
  type ReceiptPdfSettings,
} from "@/lib/receipt-pdf-draft";

type QueryResult = { data: unknown; error: unknown };

function createQuery(result: QueryResult) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "maybeSingle", "upsert"]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  return query;
}

const settings: ReceiptPdfSettings = {
  terms: ["條款"],
  paymentMethods: ["付款"],
  showCustomerSignature: true,
  signaturePartyName: "客戶",
  deliveryFeeId: "fee-1",
  deliveryFeeLabel: "運費",
  deliveryFee: "100",
  discount: "5",
  cashdollarRedeemed: "3",
  cashdollarPurchased: "2",
};

describe("order PDF drafts data access", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("reads the saved settings for the matching document kind", async () => {
    const query = createQuery({
      data: { order_id: "order-1", document_kind: "invoice", draft: { terms: ["A"] } },
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(fetchReceiptPdfSettings("order-1", "invoice")).resolves.toEqual({
      terms: ["A"],
    });
    expect(fromMock).toHaveBeenCalledWith("order_pdf_drafts");
    expect(query.select).toHaveBeenCalledWith("order_id,document_kind,draft");
    expect(query.eq).toHaveBeenCalledWith("order_id", "order-1");
    expect(query.eq).toHaveBeenCalledWith("document_kind", "invoice");
  });

  it("returns null when no draft has been saved yet", async () => {
    fromMock.mockReturnValue(createQuery({ data: null, error: null }));
    await expect(fetchReceiptPdfSettings("order-1", "receipt")).resolves.toBeNull();
  });

  it("does not query without an order id", async () => {
    await expect(fetchReceiptPdfSettings("", "receipt")).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("upserts the settings per order and document kind", async () => {
    const query = createQuery({ data: null, error: null });
    fromMock.mockReturnValue(query);

    await saveReceiptPdfSettings("order-1", "invoice", settings);

    expect(fromMock).toHaveBeenCalledWith("order_pdf_drafts");
    expect(query.upsert).toHaveBeenCalledWith(
      { order_id: "order-1", document_kind: "invoice", draft: settings },
      { onConflict: "order_id,document_kind" },
    );
  });

  it("surfaces save failures to the caller", async () => {
    fromMock.mockReturnValue(createQuery({ data: null, error: new Error("nope") }));
    await expect(saveReceiptPdfSettings("order-1", "receipt", settings)).rejects.toThrow(
      "nope",
    );
  });
});
