export const MEAT_QUANTITY_DECIMAL_PLACES = 2;

/** Keep meat quantities numeric with at most two decimal places while typing. */
export function coerceMeatQuantityInput(value: string): string {
  const normalized = value
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10))
    .replace(/．/g, ".");
  const cleaned = normalized.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  const intDigits = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(
    /^0+(?=\d)/,
    "",
  );
  const frac =
    dot === -1
      ? null
      : cleaned
          .slice(dot + 1)
          .replace(/\./g, "")
          .slice(0, MEAT_QUANTITY_DECIMAL_PLACES);
  const intPart = intDigits === "" ? (frac === null ? "" : "0") : intDigits;
  if (frac === null) return intPart;
  return `${intPart}.${frac}`;
}
