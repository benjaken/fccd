import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260904183000_defer_customer_service_handoffs.sql",
  ),
  "utf8",
);

describe("deferred customer-service handoffs", () => {
  it("stores customer, order, questions, and notification lifecycle", () => {
    expect(sql).toContain(
      "create table if not exists public.customer_service_handoff_requests",
    );
    expect(sql).toContain("phone_normalized text not null");
    expect(sql).toContain("questions jsonb not null");
    expect(sql).toContain("message_count integer not null");
    expect(sql).toContain("'awaiting_human'");
    expect(sql).toContain("'in_progress'");
    expect(sql).toContain("'resolved'");
  });

  it("schedules the digest for 09:00 Hong Kong and restores the overnight bot window", () => {
    expect(sql).toContain("'0 1 * * *'");
    expect(sql).toContain("Asia/Hong_Kong");
    expect(sql).toContain(
      "set auto_reply_start = '19:00', auto_reply_end = '09:00'",
    );
    expect(sql).toContain(
      "private.next_customer_service_handoff_notification_at(now())",
    );
  });

  it("supports explicit human claim and return-to-bot actions", () => {
    expect(sql).toContain("customer_service_conversation_set_mode");
    expect(sql).toContain("p_mode not in ('human', 'bot')");
    expect(sql).toContain(
      "case when p_mode = 'human' then 'human_owned' else 'identifying' end",
    );
    expect(sql).toContain("set status = 'resolved'");
  });
});
