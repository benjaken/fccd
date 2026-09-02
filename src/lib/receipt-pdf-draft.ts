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
  customerName: string;
  companyName: string;
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

/** Splits products at the measured row indexes that touch the A4 footer. */
export function splitPdfProductLines<T>(lines: readonly T[], pageBreaks: readonly number[]): T[][] {
  const validBreaks = [...new Set(pageBreaks.filter((index) => index > 0 && index < lines.length))]
    .sort((left, right) => left - right);
  const starts = [0, ...validBreaks];
  return starts.map((start, pageIndex) => {
    const end = starts[pageIndex + 1] ?? lines.length;
    return lines.slice(start, end);
  });
}
