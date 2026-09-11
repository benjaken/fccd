import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const deferredSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260904183000_defer_customer_service_handoffs.sql",
  ),
  "utf8",
);

const urgentSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260910054000_customer_service_same_day_urgent_handoff.sql",
  ),
  "utf8",
);

describe("deferred customer-service handoffs", () => {
  it("stores customer, order, questions, and notification lifecycle", () => {
    expect(deferredSql).toContain(
      "create table if not exists public.customer_service_handoff_requests",
    );
    expect(deferredSql).toContain("phone_normalized text not null");
    expect(deferredSql).toContain("questions jsonb not null");
    expect(deferredSql).toContain("message_count integer not null");
    expect(deferredSql).toContain("'awaiting_human'");
    expect(deferredSql).toContain("'in_progress'");
    expect(deferredSql).toContain("'resolved'");
  });

  it("schedules the digest for 09:00 Hong Kong and restores the overnight bot window", () => {
    expect(deferredSql).toContain("'0 1 * * *'");
    expect(deferredSql).toContain("Asia/Hong_Kong");
    expect(deferredSql).toContain(
      "set auto_reply_start = '19:00', auto_reply_end = '09:00'",
    );
    expect(deferredSql).toContain(
      "private.next_customer_service_handoff_notification_at(now())",
    );
  });

  it("supports explicit human claim and return-to-bot actions", () => {
    expect(deferredSql).toContain("customer_service_conversation_set_mode");
    expect(deferredSql).toContain("p_mode not in ('human', 'bot')");
    expect(deferredSql).toContain(
      "case when p_mode = 'human' then 'human_owned' else 'identifying' end",
    );
    expect(deferredSql).toContain("set status = 'resolved'");
  });

  it("allows same-day urgent handoffs to notify immediately", () => {
    expect(urgentSql).toContain("p_notify_immediately boolean default false");
    expect(urgentSql).toContain("when coalesce(p_notify_immediately, false)");
    expect(urgentSql).toContain("same_day_urgent");
    expect(urgentSql).toContain("即日訂餐");
  });
});
