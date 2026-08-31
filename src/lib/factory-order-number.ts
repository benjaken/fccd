export function normalizeFactoryOrderNumber(
  value: string | null | undefined,
): string {
  return value?.trim().replace(/^(?:#\s*)+/, "").trim() ?? "";
}

export function formatFactoryOrderNumber(
  value: string | null | undefined,
  fallback = "",
): string {
  const normalized = normalizeFactoryOrderNumber(value);
  return normalized ? `#${normalized}` : fallback;
}
