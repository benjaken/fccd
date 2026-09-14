import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914150000_notification_control_center.sql"),
  "utf8",
);

const expectedNotificationKeys = [
  "delivery_today_reminder",
  "pickup_today_reminder",
  "manual_order_confirmation",
  "factory_unsent_reminder",
  "driver_assignment_reminder",
  "order_reconciliation",
  "enquiry_internal",
  "enquiry_customer_ack",
  "inventory_email_alerts",
  "daily_sales_report",
  "manual_wati_utility",
] as const;

describe("notification control center migration", () => {
  it("creates one recipient policy and all eleven delivery controls", () => {
    expect(migration).toContain("create table if not exists public.notification_recipient_policy");
    expect(migration).toContain("create table if not exists public.notification_delivery_controls");

    for (const key of expectedNotificationKeys) {
      expect(migration).toContain(`('${key}',`);
    }
  });

  it("renames the two recipient settings consistently in permission management", () => {
    expect(migration).toContain("'郵件通知人設定'");
    expect(migration).toContain("'WATI 通知人設定'");
  });

  it("exposes read, event update, and recipient policy RPCs behind page permissions", () => {
    expect(migration).toContain("function public.notification_control_center_get()");
    expect(migration).toContain("function public.notification_delivery_control_set(");
    expect(migration).toContain("function public.notification_recipient_policy_set(");
    expect(migration).toContain("private.has_page_access('orders.settings.wati_notifications')");
    expect(migration).toContain("private.has_page_manage('orders.settings.wati_notifications')");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("grant all on public.notification_recipient_policy to service_role");
  });

  it("keeps forced allowlist mode fail-closed when no test recipient is valid", () => {
    expect(migration).toContain("p_recipient_mode = 'allowlist'");
    expect(migration).toContain("cardinality(v_phones) = 0");
    expect(migration).toContain("cardinality(v_emails) = 0");
    expect(migration).toContain("notification_allowlist_empty");
  });
});
