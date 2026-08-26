export function districtNameFromAddress(
  address: string | null | undefined,
  districtNames: readonly string[],
) {
  const normalized = normalizeDeliveryAddress(address);
  if (!normalized || !districtNames.length) return null;

  let matched: string | null = null;
  for (const name of districtNames) {
    const district = name.trim();
    if (!district) continue;
    if (
      normalized.startsWith(district) &&
      (!matched || district.length > matched.length)
    ) {
      matched = district;
    }
  }
  return matched;
}

export function normalizeDeliveryAddress(address: string | null | undefined) {
  let value = address?.trim() ?? "";
  if (!value) return "";
  value = value.replace(/^\([^)]*\)\s*/u, "").trim();
  value = value.replace(/^（[^）]*）\s*/u, "").trim();
  if (value.startsWith("香港") && value.length > 2) {
    const withoutHongKong = value.slice(2).trim();
    if (withoutHongKong.startsWith("新界")) {
      return withoutHongKong.slice(2).trim() || value;
    }
    return withoutHongKong || value;
  }
  return value;
}
