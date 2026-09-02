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

  const plainAddress = addressText
    .replace(/^（送貨上門[）)]\s*/i, "")
    .replace(/^（附近車邊交收）\s*/i, "")
    .replace(/\s*（送貨上門[）)]\s*$/i, "")
    .replace(/\s*\*\s*車邊交收\s*$/i, "")
    .trim() || empty;

  if (resolvedMethod === "pickup") return plainAddress;
  const prefix = resolvedMethod === "curbside" ? "（附近車邊交收）" : "（送貨上門)";
  return `${prefix} ${plainAddress}`;
}
