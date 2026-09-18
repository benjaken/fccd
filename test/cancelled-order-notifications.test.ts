import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260918150000_skip_cancelled_order_notifications.sql",
  ),
  "utf8",
);
const worker = readFileSync(
  resolve(process.cwd(), "supabase/functions/wati-order-notifications/index.ts"),
  "utf8",
);

describe("cancelled order notifications", () => {
  it("defines one cancellation predicate and uses it in every enqueue path", () => {
    expect(migration).toContain("create or replace function private.wati_order_is_cancelled");
    expect(migration).toContain("~* '(cancel|取消)'");
    expect(migration).toContain("private.wati_order_is_cancelled(v_order)");
    expect(migration).toContain("and not private.wati_order_is_cancelled(orders)");
    expect(migration).toContain("private.wati_order_is_cancelled(new)");
  });

  it("stops both customer and internal reminders for cancelled orders", () => {
    expect(migration).toContain("last_error = 'order_cancelled'");
    expect(migration).toContain("wati_error = 'order_cancelled'");
    expect(migration).toContain("update public.order_internal_notification_outbox");
  });

  it("skips automatic customer reminders in the worker", () => {
    expect(worker).toContain("!explicitlyManual && isCancelledStatus(order.delivery_status)");
    expect(worker).toContain('last_error: "order_cancelled"');

    const customerLoop = worker.slice(worker.indexOf("for (const job of jobs)"));
    const pendingReview = customerLoop.indexOf("if (isPendingReview(order))");
    const cancelled = customerLoop.indexOf("isCancelledStatus(order.delivery_status)");
    const disabled = customerLoop.indexOf("if (template.is_active === false)");
    expect(pendingReview).toBeGreaterThan(-1);
    expect(cancelled).toBeGreaterThan(pendingReview);
    expect(disabled).toBeGreaterThan(cancelled);
  });

  it("loads and checks delivery_status for internal factory reminders", () => {
    const internalQuery = worker.slice(
      worker.indexOf('.from("order_internal_notification_outbox")'),
    );
    expect(internalQuery).toContain("delivery_status");

    const internalLoop = worker.slice(
      worker.indexOf("for (const job of internalJobs)"),
    );
    expect(internalLoop).toContain("isCancelledStatus(order.delivery_status)");
  });
});
