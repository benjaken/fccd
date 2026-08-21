export type QuoteActivityDraft = {
  id: string;
  description: string;
  amount: string;
};

export type QuotePdfSupplementDraft = {
  additionalInfo: string[];
  activities: QuoteActivityDraft[];
  utensilPackQuantity: string;
};

export const QUOTE_ADDITIONAL_INFO_OPTIONS = [
  "每個便當包括一份餐具",
  "每款揀選的飯盒最少3盒",
  "以上只列出部份款式，我們另可提供更多選擇及客制款式",
  "以上便當款式每盒可自選一款飲品：烏龍茶／檸檬茶／可口可樂",
  "如需加購紙包飲品 $4／包：烏龍茶／檸檬茶／可口可樂",
];

export const QUOTE_ACTIVITY_OPTIONS = [
  { description: "10月15日 120個飯盒", amount: "5400" },
  { description: "活動場地佈置及運送", amount: "800" },
  { description: "即棄餐具及飲品套裝", amount: "480" },
];

export function quotePdfDraftStorageKey(quoteId: string) {
  return `fccd:quote-pdf-draft:${quoteId}`;
}

export function readQuotePdfSupplements(quoteId: string): QuotePdfSupplementDraft {
  const fallback: QuotePdfSupplementDraft = {
    additionalInfo: [],
    activities: [],
    utensilPackQuantity: "0",
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
