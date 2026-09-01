export type QuoteActivityDraft = {
  id: string;
  description: string;
  amount: string;
};

export type QuotePdfSupplementDraft = {
  additionalInfo: string[];
  activities: QuoteActivityDraft[];
  utensilPackQuantity: string;
  discountLabel: string;
};

export function quotePdfDraftStorageKey(quoteId: string) {
  return `fccd:quote-pdf-draft:${quoteId}`;
}

export function readQuotePdfSupplements(quoteId: string): QuotePdfSupplementDraft {
  const fallback: QuotePdfSupplementDraft = {
    additionalInfo: [],
    activities: [],
    utensilPackQuantity: "0",
    discountLabel: "折扣 (-)",
  };
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(quotePdfDraftStorageKey(quoteId));
    if (!stored) return fallback;
    const value = JSON.parse(stored) as Partial<QuotePdfSupplementDraft>;
    return {
      additionalInfo: Array.isArray(value.additionalInfo) ? value.additionalInfo : [],
      activities: Array.isArray(value.activities) ? value.activities : [],
      utensilPackQuantity: value.utensilPackQuantity ?? "0",
      discountLabel: typeof value.discountLabel === "string"
        ? value.discountLabel
        : "折扣 (-)",
    };
  } catch {
    return fallback;
  }
}

export function writeQuotePdfSupplements(
  quoteId: string,
  supplements: QuotePdfSupplementDraft,
) {
  if (typeof window === "undefined") return;
  const key = quotePdfDraftStorageKey(quoteId);
  let current: Record<string, unknown> = {};
  try {
    const stored = window.localStorage.getItem(key);
    if (stored) current = JSON.parse(stored) as Record<string, unknown>;
  } catch {
    current = {};
  }
  window.localStorage.setItem(key, JSON.stringify({ ...current, ...supplements }));
}
