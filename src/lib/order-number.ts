export function normalizeOrderNumber(
  value: string | null | undefined,
): string {
  return value?.trim().replace(/^(?:#\s*)+/, "").trim() ?? "";
}

function hasLeadingHash(value: string) {
  return /^#/.test(value.trim());
}

/** Catering copies such as 7041A / 7041B. A typed leading # is part of the number. */
function isCateringSplitNumber(value: string) {
  return /^[0-9]+[A-Za-z]+$/.test(value);
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
  if (catering && /^\d+$/.test(normalized)) return `#${normalized}`;

  // Staff type #7041A when copying a Catering order. Keep that hash. Other
  // channels, and Catering codes that are not a numeric split, still drop it.
  const keepTypedSplitHash = hasLeadingHash(value ?? "")
    && isCateringSplitNumber(normalized)
    && (!channelName?.trim() || catering);
  return keepTypedSplitHash ? `#${normalized}` : normalized;
}
