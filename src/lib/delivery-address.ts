export function formatDeliveryAddress(
  address: string | null | undefined,
  shippingMethod: string | null | undefined,
  empty = "—",
): string {
  const addressText = address?.trim() || empty;
  const methodText = shippingMethod?.trim();
  const plainAddress = addressText
    .replace(/^（送貨上門[）)]\s*/i, "")
    .replace(/^（附近車邊交收）\s*/i, "")
    .replace(/\s*（送貨上門[）)]\s*$/i, "")
    .replace(/\s*\*\s*車邊交收\s*$/i, "")
    .trim() || empty;
  if (!methodText || /(自取|pickup)/i.test(methodText)) return plainAddress;
  if (/(車邊交收|curbside)/i.test(methodText)) return `（附近車邊交收） ${plainAddress}`;
  if (/(送貨上門|delivery)/i.test(methodText)) return `（送貨上門) ${plainAddress}`;
  return plainAddress;
}
