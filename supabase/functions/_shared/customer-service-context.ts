export type CustomerServiceRecentMessage = {
  role: "customer" | "assistant" | "human";
  text: string;
};

export function sanitizeCustomerServiceContextText(value: string) {
  return value
    .slice(0, 2_000)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[電郵已隱藏]")
    .replace(/(?:\+?852[\s-]?)?[456789]\d{3}[\s-]?\d{4}\b/g, "[電話已隱藏]")
    .replace(/((?:地址|address)\s*[:：]?)[^\n]{6,}/gi, "$1 [地址已隱藏]")
    .trim();
}

export function sanitizeCustomerServiceRecentMessages(
  messages: CustomerServiceRecentMessage[],
  limit = 8,
) {
  return messages
    .slice(-Math.max(1, Math.min(limit, 12)))
    .map((message) => ({
      role: message.role,
      text: sanitizeCustomerServiceContextText(message.text),
    }))
    .filter((message) => message.text);
}
