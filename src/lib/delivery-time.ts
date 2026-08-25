function clock24(hourText: string, minuteText: string, meridiem?: string) {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  const period = meridiem?.toUpperCase();
  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (period === "AM") hour = hour === 12 ? 0 : hour;
    if (period === "PM") hour = hour === 12 ? 12 : hour + 12;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Converts Shopify-style 12-hour ranges to the editor's 24-hour format. */
export function normalizeDeliveryTimeRange(value: string | null | undefined) {
  const source = String(value ?? "")
    .trim()
    .replaceAll("：", ":")
    .replace(/[–—~至到]/g, "-")
    .replace(/\s+/g, " ");
  if (!source) return "";

  const match = source.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)?$/i,
  );
  if (!match) return source;

  const startPeriod = match[3] || match[6];
  const endPeriod = match[6] || match[3];
  const start = clock24(match[1], match[2], startPeriod);
  const end = clock24(match[4], match[5], endPeriod);
  return start && end ? `${start} - ${end}` : source;
}

export function matchDeliveryTimeOption(
  value: string | null | undefined,
  options: readonly string[],
) {
  const normalized = normalizeDeliveryTimeRange(value);
  if (!normalized) return "";
  return options.find((option) => normalizeDeliveryTimeRange(option) === normalized) ?? "";
}
