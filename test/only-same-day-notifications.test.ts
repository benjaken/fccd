import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260902090000_only_same_day_customer_notifications.sql"),
  "utf8",
);
const worker = readFileSync(
  resolve(process.cwd(), "supabase/functions/wati-order-notifications/index.ts"),
  "utf8",
);

describe("automatic notification allowlist", () => {
  it("allows only same-day delivery and pickup customer events", () => {
    expect(migration).toContain(
      "p_event_key not in ('delivery_today_reminder', 'pickup_today_reminder')",
    );
    expect(migration).toContain(
      "'delivery_tomorrow_reminder', 'pickup_tomorrow_reminder'",
    );
    expect(worker).toContain('"delivery_today_reminder"');
    expect(worker).toContain('"pickup_today_reminder"');
    expect(worker).toContain("automatic_event_not_allowed");
  });

  it("removes customer order-change and factory-send notification triggers", () => {
    expect(migration).toContain("drop trigger if exists capture_wati_order_events_on_update");
  });

  it("does not disable internal operational notification pipelines", () => {
    expect(migration).not.toContain("drop trigger if exists enqueue_internal_order_notifications");
    expect(migration).not.toContain("drop trigger if exists enqueue_shopify_imported_order_wati");
    expect(migration).not.toContain("update public.order_internal_notification_outbox");
    expect(worker).not.toContain("automaticInternalNotificationsEnabled");
  });

  it("keeps explicitly requested manual utility events separate", () => {
    expect(migration).toContain("create or replace function public.enqueue_manual_wati_order_event");
    expect(migration).toContain("'manual:' || p_event_key || ':'");
    expect(migration).toContain("to service_role");
    expect(worker).toContain('job.occurrence_key.startsWith("manual:")');
  });
});
