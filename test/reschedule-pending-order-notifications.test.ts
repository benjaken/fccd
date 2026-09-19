import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260919090000_skip_reschedule_pending_order_notifications.sql",
  ),
  "utf8",
);
const worker = readFileSync(
  resolve(process.cwd(), "supabase/functions/wati-order-notifications/index.ts"),
  "utf8",
);

describe("reschedule-pending order notifications", () => {
  it("resolves the reschedule-pending status from the configured catalog", () => {
    expect(migration).toContain("create or replace function private.wati_reschedule_pending_status_ids");
    expect(migration).toContain("status.name in ('改期未定', '改期未審')");
    expect(migration).toContain("create or replace function private.wati_order_is_reschedule_pending");
    expect(migration).toContain("&& private.wati_reschedule_pending_status_ids()");
  });

  it("blocks every automatic customer reminder enqueue path", () => {
    expect(migration).toContain("private.wati_order_is_reschedule_pending(v_order)");
    expect(migration).toContain("and not private.wati_order_is_reschedule_pending(orders)");
    expect(migration).toContain("last_error = 'order_reschedule_pending'");
    expect(migration).toContain("wati_error = 'order_reschedule_pending'");
  });

  it("skips automatic reminders in the worker and keeps manual sends working", () => {
    expect(worker).toContain("function isReschedulePending(");
    expect(worker).toContain("order_status_legacy_ids");
    expect(worker).toContain("isReschedulePending(order, reschedulePendingLegacyIds)");
    expect(worker).toContain('last_error: "order_reschedule_pending"');

    const customerLoop = worker.slice(worker.indexOf("for (const job of jobs)"));
    const cancelled = customerLoop.indexOf("isCancelledStatus(order.delivery_status)");
    const reschedule = customerLoop.indexOf("isReschedulePending(order");
    const disabled = customerLoop.indexOf("if (template.is_active === false)");
    expect(cancelled).toBeGreaterThan(-1);
    expect(reschedule).toBeGreaterThan(cancelled);
    expect(disabled).toBeGreaterThan(reschedule);
    expect(worker).toContain("!explicitlyManual");
  });
});
