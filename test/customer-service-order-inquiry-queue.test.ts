import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260905040000_customer_service_order_inquiry_queue.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("customer-service order inquiry queue migration", () => {
  it("registers a dedicated protected orders page", () => {
    expect(sql).toContain("'orders.customer_inquiries'");
    expect(sql).toContain("'/orders/customer-inquiries'");
    expect(sql).toContain("private.has_page_access('orders.customer_inquiries')");
    expect(sql).toContain("private.has_page_manage('orders.customer_inquiries')");
  });

  it("provides searchable listing without the old 100-row ceiling", () => {
    expect(sql).toContain("customer_service_order_inquiries_list");
    expect(sql).toContain("request.phone_normalized ilike");
    expect(sql).toContain("request.order_number, '') ilike");
    expect(sql).toContain("request.summary ilike");
    expect(sql).toContain("least(coalesce(p_limit, 100), 500)");
  });

  it("records claim, completion, and reopen actions", () => {
    expect(sql).toContain("customer_service_handoff_events");
    expect(sql).toContain("action in ('claimed', 'resolved', 'reopened')");
    expect(sql).toContain("resolution_note_required");
    expect(sql).toContain("customer_service_order_inquiry_update");
  });

  it("exposes the unresolved count for the operations follow-up badge", () => {
    expect(sql).toContain("customer_service_order_inquiries_pending_count");
    expect(sql).toContain("where request.status <> 'resolved'");
  });
});
