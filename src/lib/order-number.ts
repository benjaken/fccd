export function normalizeOrderNumber(
  value: string | null | undefined,
): string {
  return value?.trim().replace(/^(?:#\s*)+/, "").trim() ?? "";
}

function isCateringChannel(channelName: string | null | undefined) {
  const normalized = channelName?.trim().toLowerCase() ?? "";
  return normalized === "catering"
    || normalized === "food channel catering"
    || normalized === "food channels catering";
}

export function formatOrderNumber(
  value: string | null | undefined,
  channelName?: string | null,
  fallback = "",
): string {
  const normalized = normalizeOrderNumber(value);
  if (!normalized) return fallback;

  // Older factory records do not always carry their channel. A purely numeric
  // number is the legacy Catering convention, so retain that inference only
  // when no channel is available.
  const catering = channelName?.trim()
    ? isCateringChannel(channelName)
    : /^\d+$/.test(normalized);
  return catering && /^\d+$/.test(normalized)
    ? `#${normalized}`
    : normalized;
}
