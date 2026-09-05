export const CUSTOMER_SERVICE_BURST_QUIET_MS = 2_500;
export const CUSTOMER_SERVICE_BURST_MAX_MS = 5_000;
export const CUSTOMER_SERVICE_BURST_MAX_MESSAGES = 10;
export const CUSTOMER_SERVICE_BURST_MAX_TEXT = 6_000;

export type CustomerServiceBufferedMessage = {
  providerMessageId: string;
  text: string;
  receivedAt: string;
};

export function customerServiceBurstProcessAt({
  firstReceivedAt,
  lastReceivedAt,
  quietMs = CUSTOMER_SERVICE_BURST_QUIET_MS,
  maxMs = CUSTOMER_SERVICE_BURST_MAX_MS,
}: {
  firstReceivedAt: Date;
  lastReceivedAt: Date;
  quietMs?: number;
  maxMs?: number;
}) {
  return new Date(Math.min(
    firstReceivedAt.getTime() + maxMs,
    lastReceivedAt.getTime() + quietMs,
  ));
}

export function mergeCustomerServiceBufferedMessages(
  messages: readonly CustomerServiceBufferedMessage[],
) {
  const ordered = messages
    .map((message, index) => ({ ...message, index }))
    .filter((message) => message.text.trim())
    .sort((left, right) => {
      const timeDifference = Date.parse(left.receivedAt) - Date.parse(right.receivedAt);
      return timeDifference || left.index - right.index;
    })
    .slice(-CUSTOMER_SERVICE_BURST_MAX_MESSAGES);

  if (!ordered.length) return "";
  if (ordered.length === 1) return ordered[0].text.trim().slice(0, CUSTOMER_SERVICE_BURST_MAX_TEXT);

  let merged = "";
  for (const [index, message] of ordered.entries()) {
    const line = `[訊息 ${index + 1}] ${message.text.trim()}`;
    const candidate = merged ? `${merged}\n${line}` : line;
    if (candidate.length > CUSTOMER_SERVICE_BURST_MAX_TEXT) break;
    merged = candidate;
  }
  return merged;
}

export function customerServiceBurstDelay(processAfter: string, now = Date.now()) {
  const timestamp = Date.parse(processAfter);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}
