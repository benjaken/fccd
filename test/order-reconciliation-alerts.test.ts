import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260831120000_order_reconciliation_alerts.sql",
  "utf8",
);
const shopifySync = readFileSync(
  "supabase/functions/shopify-order-sync/index.ts",
  "utf8",
);
const notificationWorker = readFileSync(
  "supabase/functions/wati-order-notifications/index.ts",
  "utf8",
);
const productionCronMigration = readFileSync(
  "supabase/migrations/20260831124000_production_only_order_reconciliation_crons.sql",
  "utf8",
);
const factoryUnsentSection = migration.slice(
  migration.indexOf("select 'factory_unsent'"),
  migration.indexOf("with candidates as (", migration.indexOf("select 'factory_unsent'") + 1),
);

describe("Shopify/FCCD order reconciliation alerts", () => {
  it("reconciles one calendar month back through every future service date", () => {
    expect(migration).toContain("interval '1 month'");
    expect(migration).toContain(">= v_scope_start");
    expect(migration).toContain("scope_end text not null default 'future'");
  });

  it("tracks counts, order-level issues, six-hour urgency, and factory status", () => {
    expect(migration).toContain("create table public.order_reconciliation_runs");
    expect(migration).toContain("create table public.order_reconciliation_issues");
    expect(migration).toContain("p_now + interval '6 hours'");
    expect(migration).toContain("not coalesce(orders.is_sent_to_factory, false)");
    expect(migration).toContain("v_today and v_today + 2");
  });

  it("warns for every unsent order in the three-day window, including orders under review", () => {
    expect(factoryUnsentSection).toContain("not coalesce(orders.is_sent_to_factory, false)");
    expect(factoryUnsentSection).toContain("not coalesce(orders.do_not_send_to_factory, false)");
    expect(factoryUnsentSection).toContain("between v_today and v_today + 2");
    expect(factoryUnsentSection).not.toContain("orders.source_system is distinct from 'shopify'");
  });

  it("uses only configured internal email and WhatsApp recipients", () => {
    expect(migration).toContain("from public.user_profiles profile");
    expect(migration).toContain("profile.email_noti");
    expect(migration).toContain("from public.order_first_notification_recipients recipient");
    expect(migration).not.toMatch(/recipient_address[^;]+contact_number_[ab]_snapshot/s);
  });

  it("creates urgent in-app alerts and resolves them with the issue", () => {
    expect(migration).toContain("'order_reconciliation_urgent'");
    expect(migration).toContain("'緊急漏單預警'");
    expect(migration).toContain("set resolved_at = p_now");
  });

  it("refreshes Shopify before the daily Hong Kong report", () => {
    expect(migration).toContain("'fccd-shopify-order-daily-reconciliation'");
    expect(migration).toContain("'45 0 * * *'");
    expect(migration).toContain("'mode', 'reconcile'");
    expect(shopifySync).toContain('status: "open"');
    expect(shopifySync).toContain("updated_at_min");
    expect(shopifySync).toContain("...openOrders.orders, ...recentlyUpdated.orders");
  });

  it("targets production-only reconciliation schedules and never develop", () => {
    expect(migration).toContain("vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/shopify-order-sync");
    expect(migration).toContain("vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/wati-order-notifications");
    expect(migration).toContain("'fccd-order-reconciliation-alerts'");
    expect(migration).toContain("'mode', 'reconciliation_only'");
    expect(migration).toContain("order_reconciliation_notifications_enabled");
    expect(migration).toContain("), 'false') = 'true'");
    expect(migration).not.toContain("mxiueauyylnpwlxrvgbo.supabase.co");
    expect(productionCronMigration).toContain("order_reconciliation_notifications_enabled");
    expect(productionCronMigration).not.toContain("mxiueauyylnpwlxrvgbo.supabase.co");
  });

  it("keeps customer activation disabled while allowing the isolated internal run", () => {
    expect(notificationWorker).toContain("if (!reconciliationOnly && Date.now() < activation.timestamp)");
    expect(notificationWorker).toContain("if (!reconciliationOnly)");
  });

  it("keeps WATI reconciliation parameters free of rejected newlines", () => {
    expect(notificationWorker).toContain('issues.map(reconciliationIssueLine).join("；")');
    expect(notificationWorker).not.toContain('issues.map(reconciliationIssueLine).join("\\n")');
  });
});
