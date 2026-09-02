import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901200000_manual_order_confirmations_only.sql"),
  "utf8",
);

describe("manual order confirmations only", () => {
  it("removes every automatic order-confirmation trigger path", () => {
    expect(migration).toContain("drop trigger if exists capture_wati_order_events_on_insert");
    expect(migration).not.toContain("'review-approved:' || v_occurrence");
    expect(migration).not.toMatch(/perform private\.enqueue_wati_order_event\([\s\S]{0,180}'confirmed'/i);
    expect(migration).not.toMatch(/perform private\.enqueue_wati_order_event\([\s\S]{0,180}(delivery_order_confirmed|pickup_order_confirmed)/i);
  });

  it("keeps the update trigger for independent lifecycle notifications", () => {
    expect(migration).toContain("create trigger capture_wati_order_events_on_update");
    expect(migration).toContain("'order_details_updated'");
    expect(migration).toContain("'order_cancelled'");
    expect(migration).toContain("public.wati_order_status_event_rules");
  });

  it("cancels queued confirmations without disabling the manual action", () => {
    expect(migration).toContain("outbox.event_key in ('delivery_order_confirmed', 'pickup_order_confirmed')");
    expect(migration).toContain("last_error = 'manual_confirmation_required'");
    expect(migration).toContain("outbox.sent_at is null");
    expect(migration).not.toContain("manual_order_confirmation_enabled");
    expect(migration).not.toContain("manual_order_confirmation_email_enabled");
  });
});
