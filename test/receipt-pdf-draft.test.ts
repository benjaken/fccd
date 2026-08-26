import { describe, expect, it } from "vitest";

import {
  paginateReceiptPdfLines,
  RECEIPT_PDF_CONTINUATION_PAGE_SIZE,
  RECEIPT_PDF_OVERFLOW_FIRST_PAGE_SIZE,
} from "@/lib/receipt-pdf-draft";

describe("paginateReceiptPdfLines", () => {
  it("keeps a short table on one sheet so totals and signature stay with the products", () => {
    expect(paginateReceiptPdfLines(ids(10))).toEqual([ids(10)]);
  });

  it("fills the first overflow sheet instead of leaving ten rows above a blank A4 gap", () => {
    expect(paginateReceiptPdfLines(ids(18))).toEqual([
      ids(RECEIPT_PDF_OVERFLOW_FIRST_PAGE_SIZE),
      ids(18).slice(RECEIPT_PDF_OVERFLOW_FIRST_PAGE_SIZE),
    ]);
  });

  it("continues leftover rows at the continuation page size", () => {
    const lineCount = RECEIPT_PDF_OVERFLOW_FIRST_PAGE_SIZE + RECEIPT_PDF_CONTINUATION_PAGE_SIZE + 3;
    const pages = paginateReceiptPdfLines(ids(lineCount));
    expect(pages.map((page) => page.length)).toEqual([
      RECEIPT_PDF_OVERFLOW_FIRST_PAGE_SIZE,
      RECEIPT_PDF_CONTINUATION_PAGE_SIZE,
      3,
    ]);
  });
});

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => index + 1);
}
