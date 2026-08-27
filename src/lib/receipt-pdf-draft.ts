export type ReceiptPdfLineDraft = {
  id: string;
  description: string;
  unitPrice: string;
  quantity: string;
};

export type ReceiptPdfPaymentDraft = {
  id: string;
  method: string;
  date: string;
  amount: string;
};

export type ReceiptPdfDraft = {
  invoiceSourceContentVersion: number;
  sourceFinancialsVersion: number;
  receiptNumber: string;
  customer: string;
  contactPerson: string;
  deliveryAddress: string;
  invoiceDate: string;
  deliveryDate: string;
  deliveryTime: string;
  lines: ReceiptPdfLineDraft[];
  deliveryFeeId: string;
  deliveryFeeLabel: string;
  deliveryFee: string;
  paymentInformation: string;
  receiptPayments: ReceiptPdfPaymentDraft[];
  terms: string[];
  paymentMethods: string[];
  showCustomerSignature: boolean;
  signaturePartyName: string;
};

export function receiptPdfDraftStorageKey(
  orderId: string,
  documentKind: "receipt" | "invoice" = "receipt",
) {
  return `fccd:${documentKind}-pdf-draft:${orderId}`;
}

/** Fits products + payment/signature on the first A4 sheet. */
export const RECEIPT_PDF_FIRST_PAGE_WITH_TRAILING = 10;
/**
 * When products already overflow onto a later sheet, the first page has no
 * totals or signature, so it can hold more rows than the trailing-budget size.
 */
export const RECEIPT_PDF_OVERFLOW_FIRST_PAGE_SIZE = 16;
export const RECEIPT_PDF_CONTINUATION_PAGE_SIZE = 18;

export function paginatePdfProductLines<T>(
  lines: readonly T[],
  firstPageSize: number,
  continuationPageSize: number,
): T[][] {
  const pages: T[][] = [lines.slice(0, firstPageSize)];
  for (let index = firstPageSize; index < lines.length; index += continuationPageSize) {
    pages.push(lines.slice(index, index + continuationPageSize));
  }
  return pages;
}

export function paginateReceiptPdfLines<T>(lines: readonly T[]): T[][] {
  if (lines.length <= RECEIPT_PDF_FIRST_PAGE_WITH_TRAILING) {
    return [lines.slice()];
  }
  return paginatePdfProductLines(
    lines,
    RECEIPT_PDF_OVERFLOW_FIRST_PAGE_SIZE,
    RECEIPT_PDF_CONTINUATION_PAGE_SIZE,
  );
}
