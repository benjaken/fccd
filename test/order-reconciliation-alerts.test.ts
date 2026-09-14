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
const internalTemplateConfig = readFileSync(
  "supabase/functions/_shared/wati-internal-template-config.ts",
  "utf8",
);
const productionCronMigration = readFileSync(
  "supabase/migrations/20260831124000_production_only_order_reconciliation_crons.sql",
  "utf8",
);
const reconciliationExclusionsMigration = readFileSync(
  "supabase/migrations/20260901090000_ignore_b1523_order_reconciliation.sql",
  "utf8",
);
const clearDailyMigration = readFileSync(
  "supabase/migrations/20260901113000_send_clear_daily_order_reconciliation.sql",
  "utf8",
);
const perOrderWatiMigration = readFileSync(
  "supabase/migrations/20260901230000_per_order_internal_wati_notifications.sql",
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

  it("keeps one aggregate daily email but sends one WATI per order", () => {
    expect(perOrderWatiMigration).toContain("Email stays as one aggregate message per recipient and day");
    expect(perOrderWatiMigration).toContain("select null, null, 'daily_reconciliation', v_date_key, 'email'");
    expect(perOrderWatiMigration).toContain("from private.order_email_notification_recipients() recipient");
    expect(perOrderWatiMigration).toContain("distinct on (issue.order_id, recipient.id)");
    expect(perOrderWatiMigration).toContain("case when issue.issue_type = 'factory_unsent' then 1 else 0 end");
    expect(perOrderWatiMigration).toContain("order_reconciliation_alert_outbox_order_cycle_unique");
    expect(internalTemplateConfig).toContain("WATI_ORDER_RECONCILIATION_MISSING_TEMPLATE_NAME");
    expect(internalTemplateConfig).toContain("WATI_ORDER_RECONCILIATION_FACTORY_UNSENT_TEMPLATE_NAME");
    expect(notificationWorker).toContain('internalOrderWatiParameters(reconciliationOrder(issue)!)');
    expect(notificationWorker).toContain("numberedInternalWatiParameters([");
    expect(notificationWorker).not.toContain('{ name: "brand_name"');
    expect(notificationWorker).not.toContain('{ name: "delivery_address"');
    expect(notificationWorker).toContain('replace(/^#+\\s*/, "")');
    expect(internalTemplateConfig).toContain('replace(/[\\r\\n\\t]+/g, " ")');
  });

  it("sends matching all-clear WhatsApp and email copy when the daily count is zero", () => {
    expect(clearDailyMigration).toContain("if p_daily then");
    expect(clearDailyMigration).not.toContain("p_daily and exists");
    expect(notificationWorker).toContain('job.event_key !== "daily_reconciliation"');
    expect(internalTemplateConfig).toContain("WATI_ORDER_RECONCILIATION_CLEAR_TEMPLATE_NAME");
    expect(notificationWorker).toContain("今日沒有未入單、日期、廚房顯示、司機或存貨問題需要跟進");
    expect(notificationWorker).not.toContain("Shopify：${input.run.shopify_count}");
  });

  it("records how the retired Shopify new-order WATI was historically queued", () => {
    expect(perOrderWatiMigration).toContain("'shopify_order_imported'");
    expect(perOrderWatiMigration).toContain("after insert or update of shopify_order_id");
    expect(perOrderWatiMigration).toContain("new.source_system is distinct from 'shopify'");
    expect(perOrderWatiMigration).toContain("old.shopify_order_id is not distinct from new.shopify_order_id");
    expect(perOrderWatiMigration).toContain("coalesce(new.shopify_store_id::text, 'unknown-store')");
    expect(perOrderWatiMigration).toContain("'shopify_order_imported', v_cycle_key, 'whatsapp'");
    expect(perOrderWatiMigration).not.toContain("'shopify_order_imported', v_cycle_key, 'email'");
  });

  it("counts only unresolved Shopify shadows and always ignores B-1523", () => {
    expect(reconciliationExclusionsMigration).toContain("= 'B1523'");
    expect(reconciliationExclusionsMigration).toContain("v_delivery_status is not null");
    expect(reconciliationExclusionsMigration).toContain("coalesce(v_is_sent_to_factory, false)");
    expect(reconciliationExclusionsMigration).toContain("coalesce(v_do_not_send_to_factory, false)");
    expect(reconciliationExclusionsMigration).toContain("before insert or update");
    expect(reconciliationExclusionsMigration).toContain("new.status := 'resolved'");
    expect(reconciliationExclusionsMigration).toContain("issue.status = 'open'");
    expect(reconciliationExclusionsMigration).toContain("last_error = 'reconciliation_order_ignored'");
    expect(reconciliationExclusionsMigration).toContain("notice.event_type = 'order_reconciliation_urgent'");
    expect(reconciliationExclusionsMigration).toContain("missing_fccd_count = counts.missing_fccd_count");
  });
});
