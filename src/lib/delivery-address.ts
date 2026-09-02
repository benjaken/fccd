export function formatDeliveryAddress(
  address: string | null | undefined,
  shippingMethod: string | null | undefined,
  empty = "—",
): string {
  const addressText = address?.trim() || empty;
  const methodText = shippingMethod?.trim();
  if (!methodText || /(自取|pickup)/i.test(methodText)) return addressText;
  if (addressText.includes("（送貨上門）") || /\*\s*車邊交收/i.test(addressText)) {
    return addressText;
  }
  if (/(車邊交收|curbside)/i.test(methodText)) return `${addressText} * 車邊交收`;
  if (/(送貨上門|delivery)/i.test(methodText)) return `${addressText}（送貨上門）`;
  return addressText;
}
