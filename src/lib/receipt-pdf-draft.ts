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
  trailingStartsNewPage: boolean;
};

export function receiptPdfDraftStorageKey(
  orderId: string,
  documentKind: "receipt" | "invoice" = "receipt",
) {
  return `fccd:${documentKind}-pdf-draft:${orderId}`;
}
