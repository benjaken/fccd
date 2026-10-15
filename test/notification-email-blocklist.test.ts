import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isBlockedNotificationEmail } from "../supabase/functions/_shared/notification-email-blocklist.ts";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("customer email blocklist", () => {
  it("matches addresses without regard to case or surrounding space", () => {
    const blocked = [" Guest@Example.com "];
    expect(isBlockedNotificationEmail("guest@example.com", blocked)).toBe(true);
    expect(isBlockedNotificationEmail("  GUEST@example.com ", blocked)).toBe(true);
    expect(isBlockedNotificationEmail("other@example.com", blocked)).toBe(false);
    expect(isBlockedNotificationEmail("", blocked)).toBe(false);
    expect(isBlockedNotificationEmail("guest@example.com", [])).toBe(false);
  });

  it("skips customer mail and leaves WhatsApp and internal mail alone", () => {
    const migration = source("supabase/migrations/20261015015434_notification_email_blocklist.sql");
    expect(migration).toContain("blocked_emails text[] not null default '{}'::text[]");
    expect(migration).toContain("p_blocked_emails text[] default null");

    expect(source("supabase/functions/wati-order-notifications/index.ts"))
      .toContain('email_error: "recipient_email_blocked"');
    expect(source("supabase/functions/send-order-wati-confirmation/index.ts"))
      .toContain("emailEnabled: manualEmailEnabled && !emailBlocked");
    expect(source("supabase/functions/send-enquiry-notifications/index.ts"))
      .toContain('ackStatus = "blocked"');
    expect(source("supabase/functions/customer-order-feedback-email/index.ts"))
      .toContain('last_error: "recipient_email_blocked"');

    const internal = source("supabase/functions/inventory-email-notifications/index.ts")
      + source("supabase/functions/send-daily-sales-report/index.ts");
    expect(internal).not.toContain("isBlockedNotificationEmail");
  });
});
