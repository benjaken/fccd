import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { REPLIES } from "../supabase/functions/_shared/customer-service-replies.ts";

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

const brandSitesSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260911023000_customer_service_same_day_urgent_brand_sites.sql",
  ),
  "utf8",
);

const handoffCronRepairSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914110000_repair_customer_service_handoff_notifications.sql",
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

  it("repairs the production handoff digest with the shared WATI cron credentials", () => {
    expect(handoffCronRepairSql).toContain("fccd-customer-service-handoff-digest");
    expect(handoffCronRepairSql).toContain("'0 1 * * *'");
    expect(handoffCronRepairSql).toContain("customer_service_handoff_digest_url");
    expect(handoffCronRepairSql).toContain("wati_order_cron_secret");
    expect(handoffCronRepairSql).toContain("customer_service_handoff_cron_secret");
    expect(handoffCronRepairSql).toContain("customer_service_outbound_retry_url");
    expect(handoffCronRepairSql).toContain("fccd-customer-service-outbound-retry");
    expect(handoffCronRepairSql).toContain("'*/5 * * * *'");
    expect(handoffCronRepairSql).toContain('body := \'{"mode":"handoff_digest"}\'::jsonb');
    expect(handoffCronRepairSql).toContain('body := \'{"mode":"retry_outbound"}\'::jsonb');
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

  it("lists each brand ordering site in the same-day urgent reply", () => {
    for (const sql of [urgentSql, brandSitesSql]) {
      expect(sql).toContain("foodchannels-express.com");
      expect(sql).toContain("foodchannels-catering.com");
      expect(sql).toContain("hklunchbox.com");
      expect(sql).toContain("hkpartyfood.com");
    }
    expect(REPLIES.sameDayUrgent).toContain("foodchannels-express.com");
    expect(REPLIES.sameDayUrgent).toContain("foodchannels-catering.com");
    expect(REPLIES.sameDayUrgent).toContain("hklunchbox.com");
    expect(REPLIES.sameDayUrgent).toContain("hkpartyfood.com");
  });
});
