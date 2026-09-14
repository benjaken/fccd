export type CustomerServiceRecentMessage = {
  role: "customer" | "assistant" | "human";
  text: string;
  occurredAt?: string;
};

export const CUSTOMER_SERVICE_CONTEXT_LOOKBACK_DAYS = 30;

export type CustomerServiceContextMessageRow = {
  source_message_id: string;
  phone_normalized: string;
  role: CustomerServiceRecentMessage["role"];
  message_text: string;
  intent_key: string | null;
  dialog_action: string | null;
  environment: string;
  created_at?: string;
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
  limit?: number,
) {
  const selected = typeof limit === "number"
    ? messages.slice(-Math.max(1, limit))
    : messages;
  return selected
    .map((message) => ({
      role: message.role,
      text: sanitizeCustomerServiceContextText(message.text),
      ...(message.occurredAt && !Number.isNaN(Date.parse(message.occurredAt))
        ? { occurredAt: new Date(message.occurredAt).toISOString() }
        : {}),
    }))
    .filter((message) => message.text);
}

export function customerServiceContextSince(
  reference = new Date(),
  lookbackDays = CUSTOMER_SERVICE_CONTEXT_LOOKBACK_DAYS,
) {
  return new Date(
    reference.getTime() - Math.max(1, lookbackDays) * 24 * 60 * 60 * 1_000,
  ).toISOString();
}

export function customerServiceContextMessageRow(input: {
  sourceMessageId: string;
  phone: string;
  role: CustomerServiceRecentMessage["role"];
  text: string;
  environment: string;
  intentKey?: string | null;
  dialogAction?: string | null;
  occurredAt?: string | null;
}): CustomerServiceContextMessageRow | null {
  const messageText = sanitizeCustomerServiceContextText(input.text);
  if (!messageText) return null;
  const occurredAt = input.occurredAt?.trim();
  return {
    source_message_id: input.sourceMessageId,
    phone_normalized: input.phone,
    role: input.role,
    message_text: messageText,
    intent_key: input.intentKey ?? null,
    dialog_action: input.dialogAction ?? null,
    environment: input.environment,
    ...(occurredAt && !Number.isNaN(Date.parse(occurredAt))
      ? { created_at: new Date(occurredAt).toISOString() }
      : {}),
  };
}
