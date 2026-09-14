import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const runtimeCoverage = [
  ["supabase/functions/wati-order-notifications/index.ts", "delivery_today_reminder"],
  ["supabase/functions/wati-order-notifications/index.ts", "factory_unsent_reminder"],
  ["supabase/functions/wati-order-notifications/index.ts", "driver_assignment_reminder"],
  ["supabase/functions/wati-order-notifications/index.ts", "order_reconciliation"],
  ["supabase/functions/send-order-wati-confirmation/index.ts", "manual_order_confirmation"],
  ["supabase/functions/send-enquiry-notifications/index.ts", "enquiry_internal"],
  ["supabase/functions/send-enquiry-notifications/index.ts", "enquiry_customer_ack"],
  ["supabase/functions/wati-customer-service/index.ts", "enquiry_internal"],
  ["supabase/functions/inventory-email-notifications/index.ts", "inventory_email_alerts"],
  ["supabase/functions/send-daily-sales-report/index.ts", "daily_sales_report"],
  ["supabase/functions/wati-send-template/index.ts", "manual_wati_utility"],
] as const;

describe("notification control center runtime coverage", () => {
  it.each(runtimeCoverage)("gates %s with %s", (path, key) => {
    const contents = source(path);
    expect(contents).toContain("notificationChannelEnabled");
    expect(contents).toContain(`\"${key}\"`);
  });

  it("routes every controlled sender through the shared recipient policy", () => {
    for (const path of new Set(runtimeCoverage.map(([path]) => path))) {
      expect(source(path)).toContain("controls.recipientPolicy");
    }
  });

  it("uses one shell scrollbar and keeps the notification rows at their content height", () => {
    const styles = source("src/styles/07-inventory-migration.css");
    const settingsRule = styles.match(/\.wati-notification-settings\s*\{([^}]+)\}/)?.[1] || "";
    const overrides = source("src/styles/14-layout-overrides.css");

    expect(settingsRule).toContain("grid-auto-rows: max-content");
    expect(overrides).toContain(".order-settings-page-notification-center .wati-notification-settings");
    expect(overrides).toContain("overflow: visible");
    expect(overrides).toContain("height: auto !important");
  });
});
