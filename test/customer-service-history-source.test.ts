import { describe, expect, it } from "vitest";

import { toHistoryMessages, type HistorySourceRow } from "../supabase/functions/_shared/customer-service-history-source.ts";

const row = (overrides: Partial<HistorySourceRow> & Pick<HistorySourceRow, "id" | "role" | "message_text">): HistorySourceRow => ({
  phone_normalized: "85290000000",
  created_at: "2026-09-15T02:00:00.000Z",
  source_message_id: `src-${overrides.id}`,
  environment: "develop",
  ...overrides,
});

describe("history source mapping", () => {
  it("dedupes live and imported copies by provider message id and role", () => {
    const messages = toHistoryMessages([
      row({ id: "live-1", role: "customer", message_text: "想訂餐", source_message_id: "wati-1" }),
      row({ id: "import-1", role: "customer", message_text: "想訂餐", source_message_id: "wati-1" }),
    ], { environment: "develop" });
    expect(messages).toHaveLength(1);
    expect(messages[0].sourceMessageId).toBe("wati-1");
  });

  it("keeps the same id with different roles separate", () => {
    const messages = toHistoryMessages([
      row({ id: "a", role: "customer", message_text: "x", source_message_id: "m" }),
      row({ id: "b", role: "assistant", message_text: "y", source_message_id: "m" }),
    ], { environment: "develop" });
    expect(messages).toHaveLength(2);
  });

  it("falls back to phone as conversation id and drops invalid roles/dates", () => {
    const messages = toHistoryMessages([
      row({ id: "1", role: "customer", message_text: "ok" }),
      row({ id: "2", role: "system", message_text: "drop" }),
      row({ id: "3", role: "human", message_text: "drop", created_at: "not-a-date" }),
    ], { environment: "develop" });
    expect(messages).toHaveLength(1);
    expect(messages[0].conversationId).toBe("85290000000");
  });
});
