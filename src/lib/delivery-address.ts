export function formatDeliveryAddress(
  address: string | null | undefined,
  shippingMethod: string | null | undefined,
  empty = "—",
): string {
  const addressText = address?.trim() || empty;
  const methodText = shippingMethod?.trim();
  if (!methodText || addressText.toLocaleLowerCase().includes(methodText.toLocaleLowerCase())) {
    return addressText;
  }
  return `${addressText} * ${methodText}`;
}
