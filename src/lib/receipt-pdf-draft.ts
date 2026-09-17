import { supabase } from "@/lib/supabase";

export type ReceiptPdfDocumentKind = "receipt" | "invoice";

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
  discount: string;
  cashdollarRedeemed: string;
  cashdollarPurchased: string;
  paymentInformation: string;
  receiptPayments: ReceiptPdfPaymentDraft[];
  terms: string[];
  paymentMethods: string[];
  showCustomerSignature: boolean;
  signaturePartyName: string;
};

/**
 * PDF-only settings that survive between visits. Everything else in
 * {@link ReceiptPdfDraft} is rebuilt from the latest saved order data.
 */
export type ReceiptPdfSettings = {
  terms: string[];
  paymentMethods: string[];
  showCustomerSignature: boolean;
  signaturePartyName: string;
  deliveryFeeId: string;
  deliveryFeeLabel: string;
  deliveryFee: string;
  discount: string;
  cashdollarRedeemed: string;
  cashdollarPurchased: string;
};

export function receiptPdfSettingsFromDraft(draft: ReceiptPdfDraft): ReceiptPdfSettings {
  return {
    terms: [...draft.terms],
    paymentMethods: [...draft.paymentMethods],
    showCustomerSignature: draft.showCustomerSignature,
    signaturePartyName: draft.signaturePartyName,
    deliveryFeeId: draft.deliveryFeeId,
    deliveryFeeLabel: draft.deliveryFeeLabel,
    deliveryFee: draft.deliveryFee,
    discount: draft.discount,
    cashdollarRedeemed: draft.cashdollarRedeemed,
    cashdollarPurchased: draft.cashdollarPurchased,
  };
}

function storedTextItems(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function storedText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function applyReceiptPdfSettings(
  fallback: ReceiptPdfDraft,
  stored: Partial<ReceiptPdfSettings> | null | undefined,
): ReceiptPdfDraft {
  if (!stored || typeof stored !== "object") return fallback;
  const hasDeliveryOverride = Boolean(stored.deliveryFeeId?.trim());
  return {
    ...fallback,
    terms: storedTextItems(stored.terms, fallback.terms),
    paymentMethods: storedTextItems(stored.paymentMethods, fallback.paymentMethods),
    showCustomerSignature: typeof stored.showCustomerSignature === "boolean"
      ? stored.showCustomerSignature
      : fallback.showCustomerSignature,
    signaturePartyName: storedText(stored.signaturePartyName, fallback.signaturePartyName),
    deliveryFeeId: hasDeliveryOverride ? stored.deliveryFeeId ?? "" : fallback.deliveryFeeId,
    deliveryFeeLabel: hasDeliveryOverride
      ? storedText(stored.deliveryFeeLabel, fallback.deliveryFeeLabel)
      : fallback.deliveryFeeLabel,
    deliveryFee: hasDeliveryOverride
      ? storedText(stored.deliveryFee, fallback.deliveryFee)
      : fallback.deliveryFee,
    discount: storedText(stored.discount, fallback.discount),
    cashdollarRedeemed: storedText(stored.cashdollarRedeemed, fallback.cashdollarRedeemed),
    cashdollarPurchased: storedText(stored.cashdollarPurchased, fallback.cashdollarPurchased),
  };
}

type OrderPdfDraftRow = {
  order_id: string;
  document_kind: ReceiptPdfDocumentKind;
  draft: Partial<ReceiptPdfSettings> | null;
};

export async function fetchReceiptPdfSettings(
  orderId: string,
  documentKind: ReceiptPdfDocumentKind,
): Promise<Partial<ReceiptPdfSettings> | null> {
  if (!orderId) return null;
  const { data, error } = await supabase
    .from("order_pdf_drafts")
    .select("order_id,document_kind,draft")
    .eq("order_id", orderId)
    .eq("document_kind", documentKind)
    .maybeSingle();
  if (error) throw error;
  return (data as OrderPdfDraftRow | null)?.draft ?? null;
}

export async function saveReceiptPdfSettings(
  orderId: string,
  documentKind: ReceiptPdfDocumentKind,
  settings: ReceiptPdfSettings,
): Promise<void> {
  if (!orderId) throw new Error("order_id_required");
  const { error } = await supabase
    .from("order_pdf_drafts")
    .upsert(
      { order_id: orderId, document_kind: documentKind, draft: settings },
      { onConflict: "order_id,document_kind" },
    );
  if (error) throw error;
}

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
