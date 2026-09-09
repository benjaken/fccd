import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908130000_daily_order_readiness_whatsapp.sql",
  "utf8",
);
const worker = readFileSync(
  "supabase/functions/wati-order-notifications/index.ts",
  "utf8",
);
const templateConfig = readFileSync(
  "supabase/functions/_shared/wati-internal-template-config.ts",
  "utf8",
);

describe("daily order readiness WhatsApp", () => {
  it("checks every requested readiness category on formal future orders", () => {
    expect(migration).toContain("'missing_delivery_date'");
    expect(migration).toContain("'kitchen_not_visible'");
    expect(migration).toContain("'driver_unassigned'");
    expect(migration).toContain("'insufficient_stock'");
    expect(migration).toContain("orders.document_type = 'order'");
    expect(migration).toContain("orders.source_system is distinct from 'shopify'");
  });

  it("mirrors kitchen visibility and excludes pickup from driver checks", () => {
    expect(migration).toContain("coalesce(orders.is_sent_to_factory, false)");
    expect(migration).toContain("from public.deliveries delivery");
    expect(migration).toContain("delivery.motorcade_id is null");
    expect(migration).toContain("coalesce(method.requires_address_check, true)");
    expect(migration).toContain("!~* '(pickup|自取)'");
  });

  it("attributes 14-day ingredient and packing risks to each order", () => {
    expect(migration).toContain("inventory_forecast_order_shortages");
    expect(migration).toContain("inventory_forecast_shortages(p_start_date, p_days)");
    expect(migration).toContain("order_bom_requirements");
    expect(migration).toContain("product_ingredients");
    expect(migration).toContain("order_package_choice_snapshots");
    expect(migration).toContain("'unmappedLineCount'");
    expect(migration).toContain("'forecastDays', 14");
    const forecastFunction = migration.slice(
      migration.indexOf("create or replace function public.inventory_forecast_order_shortages"),
      migration.indexOf("revoke all on function public.inventory_forecast_order_shortages"),
    );
    expect(forecastFunction).not.toContain("source_system is distinct from 'shopify'");
  });

  it("suppresses only stock-derived issues when the shortage switch is off", () => {
    expect(migration).toContain("v_shortage_notifications_enabled boolean");
    expect(migration).toContain("if v_shortage_notifications_enabled then");
    expect(migration).toContain("'resolutionReason', 'shortage_notifications_disabled'");
    expect(migration).toContain("issue.issue_type <> 'insufficient_stock'");
  });

  it("queues one daily WhatsApp per order and summarizes all its issues", () => {
    expect(migration).toContain("distinct on (issue.order_id, recipient.id)");
    expect(migration).toContain("one message per order/recipient/day");
    expect(worker).toContain('"refresh_order_readiness_issues"');
    expect(worker).toContain("readinessOrderWatiParameters(directOrder, issues)");
    expect(worker).toContain('{ name: "issue_summary"');
    expect(worker).toContain('? "orderReadinessIssue"');
    expect(templateConfig).toContain("WATI_ORDER_READINESS_ISSUE_TEMPLATE_NAME");
    expect(templateConfig).toContain("WATI_ORDER_READINESS_ISSUE_BROADCAST_NAME");
  });

  it("runs once after 09:00 Hong Kong time rather than recalculating stock every minute", () => {
    expect(migration).toContain("extract(hour from p_now at time zone 'Asia/Hong_Kong') < 9");
    expect(migration).toContain("from public.order_reconciliation_runs run");
    expect(migration).toContain("'skipped', true");
  });
});
