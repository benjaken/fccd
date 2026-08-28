const GENERIC_DISTRICT_NAMES = new Set(["新界", "九龍", "香港", "TBC", "按要求"]);

function stripLeadingNotes(address: string) {
  return address
    .replace(/^\([^)]*\)\s*/u, "")
    .trim()
    .replace(/^（[^）]*）\s*/u, "")
    .trim();
}

function stripLeadingPrefix(value: string, prefix: string) {
  if (value.length <= prefix.length || !value.startsWith(prefix)) return value;
  const rest = value.slice(prefix.length).replace(/^[\s,，]+/, "").trim();
  return rest || value;
}

function matchPrefix(
  text: string,
  districtNames: readonly string[],
  allowGeneric: boolean,
) {
  let matched: string | null = null;
  for (const name of districtNames) {
    const district = name.trim();
    if (!district || !text.startsWith(district)) continue;
    if (!allowGeneric && GENERIC_DISTRICT_NAMES.has(district)) continue;
    if (!matched || district.length > matched.length) matched = district;
  }
  return matched;
}

export function districtNameFromAddress(
  address: string | null | undefined,
  districtNames: readonly string[],
) {
  const stripped = stripLeadingNotes(address?.trim() ?? "");
  if (!stripped || !districtNames.length) return null;

  const attempts = [...new Set([
    stripped,
    stripLeadingPrefix(stripped, "香港新界"),
    stripLeadingPrefix(stripped, "香港島"),
    stripLeadingPrefix(stripped, "香港"),
    stripLeadingPrefix(stripLeadingPrefix(stripped, "香港"), "新界"),
    stripLeadingPrefix(stripLeadingPrefix(stripped, "香港"), "九龍"),
    stripLeadingPrefix(stripped, "新界"),
    stripLeadingPrefix(stripped, "九龍"),
  ])];

  let best: string | null = null;
  for (const text of attempts) {
    const specific = matchPrefix(text, districtNames, false);
    if (!specific) continue;
    if (!best || GENERIC_DISTRICT_NAMES.has(best) || specific.length > best.length) {
      best = specific;
    }
  }
  if (best) return best;

  for (const text of attempts) {
    const generic = matchPrefix(text, districtNames, true);
    if (generic && (!best || generic.length > best.length)) best = generic;
  }
  return best;
}

export function normalizeDeliveryAddress(address: string | null | undefined) {
  let value = stripLeadingNotes(address?.trim() ?? "");
  if (!value) return "";
  value = stripLeadingPrefix(value, "香港新界");
  value = stripLeadingPrefix(value, "香港島");
  // Keep 香港仔 and similar district names; only strip a country prefix when
  // more text remains that does not itself start with 香港.
  if (value.startsWith("香港") && value.length > 2 && !value.startsWith("香港仔")) {
    value = stripLeadingPrefix(value, "香港");
  }
  value = stripLeadingPrefix(value, "新界");
  return value;
}
