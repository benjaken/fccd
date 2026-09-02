export type NotificationDeliveryMethod = "pickup" | "door" | "curbside";

export function resolveNotificationDeliveryMethod(
  methodName: string | null | undefined,
  requiresAddressCheck?: boolean | null,
): NotificationDeliveryMethod {
  const method = methodName?.trim() || "";
  if (requiresAddressCheck === false || /(自取|pickup)/i.test(method)) return "pickup";
  if (/(車邊交收|curbside)/i.test(method)) return "curbside";
  return "door";
}

export function formatNotificationDeliveryAddress(
  address: string | null | undefined,
  method: NotificationDeliveryMethod | string | null | undefined,
  empty = "-",
): string {
  const addressText = address?.trim() || empty;
  const resolvedMethod = method === "pickup" || method === "door" || method === "curbside"
    ? method
    : resolveNotificationDeliveryMethod(method);

  if (resolvedMethod === "pickup") return addressText;

  const suffix = resolvedMethod === "curbside" ? " * 車邊交收" : "（送貨上門）";
  if (
    addressText.includes("（送貨上門）")
    || /(\*\s*車邊交收)/i.test(addressText)
  ) {
    return addressText;
  }
  return `${addressText}${suffix}`;
}
