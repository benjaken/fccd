import type { HistoryMessage, HistoryMessageRole } from "./customer-service-history-samples.ts";

/**
 * Maps live and imported message rows into replay messages (HR-02/HR-03).
 * Both tables share `source_message_id`, so live and imported copies collapse
 * into one message. `conversation_id` is used when present; otherwise the
 * normalized phone is the only grouping signal and callers must treat
 * cross-channel pairing as uncertain.
 */
export type HistorySourceRow = {
  id: string;
  phone_normalized: string;
  role: string;
  message_text: string;
  created_at: string;
  source_message_id: string;
  environment?: string;
  conversation_id?: string | null;
};

export const HISTORY_SOURCE_MAPPER_VERSION = "history-source-v1";
const ROLES: HistoryMessageRole[] = ["customer", "assistant", "human"];

export function toHistoryMessages(
  rows: readonly HistorySourceRow[],
  options: { environment: string },
): HistoryMessage[] {
  const seen = new Set<string>();
  const messages: HistoryMessage[] = [];
  for (const row of rows) {
    const role = row.role as HistoryMessageRole;
    if (!ROLES.includes(role)) continue;
    const text = String(row.message_text ?? "");
    const sourceMessageId = String(row.source_message_id ?? "").trim();
    const phone = String(row.phone_normalized ?? "").replace(/\D/g, "");
    const createdAt = String(row.created_at ?? "");
    if (!Number.isFinite(Date.parse(createdAt))) continue;
    // A provider id is the dedupe authority; otherwise fall back to row identity.
    const key = sourceMessageId ? `${sourceMessageId}\u0000${role}` : `${row.id}\u0000${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!phone && !text.trim()) continue;
    messages.push({
      id: String(row.id),
      sourceMessageId,
      phone: phone || String(row.phone_normalized ?? ""),
      conversationId: String(row.conversation_id ?? "").trim() || phone || String(row.phone_normalized ?? ""),
      role,
      text,
      createdAt: new Date(createdAt).toISOString(),
      environment: String(row.environment ?? options.environment),
    });
  }
  return messages.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}
