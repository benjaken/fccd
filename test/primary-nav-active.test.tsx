import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isPrimaryNavActive, sectionFromPath } from "@/lib/nav";
import { pageAccessKey } from "@/auth/use-page-access";

describe("Primary navigation section matching", () => {
  it.each([
    ["/", "overview"],
    ["/follow-up", "overview"],
    ["/inventory", "overview"],
    ["/orders", "orders"],
    ["/orders/pending", "orders"],
    ["/orders/calendar", "orders"],
    ["/orders/unpaid", "orders"],
    ["/orders/monthly", "orders"],
    ["/orders/split", "orders"],
    ["/orders/kitchen-notes", "orders"],
    ["/orders/reschedule-pending", "orders"],
    ["/orders/shopify-pending", "orders"],
    ["/orders/settings", "orders"],
    ["/orders/settings/tags", "orders"],
    ["/orders/order-1", "orders"],
    ["/orders/settings/statuses", "orders"],
    ["/orders/settings/sale-partners", "orders"],
    ["/quotes", "quotes"],
    ["/quotes/customers", "quotes"],
    ["/quotes/quote-1", "quotes"],
    ["/products", "products"],
    ["/products/packages", "products"],
    ["/products/packages/pkg-1", "products"],
    ["/frozen", "frozen"],
    ["/frozen/selling-price-cost", "frozen"],
    ["/frozen/raw-meat-inventory", "frozen"],
    ["/frozen/prepared-meat-inventory", "frozen"],
    ["/frozen/delivery-notes", "frozen"],
    ["/frozen/seasoning-cost", "frozen"],
    ["/frozen/calculation-settings", "frozen"],
    ["/frozen/customers", "frozen"],
    ["/frozen/spice-usage", "frozen"],
    ["/frozen/yield-errors", "frozen"],
    ["/kitchen", "kitchen"],
    ["/kitchen/calendar", "kitchen"],
    ["/kitchen/settings", "kitchen"],
    ["/delivery", "delivery"],
    ["/delivery/assign", "delivery"],
    ["/restaurant", "restaurant"],
    ["/restaurant/reports", "restaurant"],
    ["/factory", ""],
    ["/driver-delivery", ""],
    ["/reports", "reports"],
    ["/reports/daily", "reports"],
    ["/reports/data-input-progress", "reports"],
    ["/reports/kitchen", "reports"],
    ["/reports/frozen-meat", "reports"],
    ["/reports/shops", "reports"],
    ["/finance", "reports"],
    ["/finance/cost-input", "reports"],
    ["/settings", "settings"],
    ["/settings/users", "settings"],
    ["/settings/roles", "settings"],
    ["/settings/login-logs", "settings"],
    ["/settings/order-lists", "settings"],
    ["/settings/attachments", "settings"],
  ] as const)("maps %s to section %s", (pathname, section) => {
    expect(sectionFromPath(pathname)).toBe(section);
  });

  it("does not treat profile or migration as overview", () => {
    expect(sectionFromPath("/profile")).toBe("");
    expect(sectionFromPath("/migration")).toBe("");
    expect(sectionFromPath("/migration/files")).toBe("");
    expect(sectionFromPath("/unknown-module")).toBe("");
  });

  it("keeps each top-nav item active across its child routes", () => {
    expect(isPrimaryNavActive("settings", "settings", false)).toBe(true);
    expect(isPrimaryNavActive("orders", "orders", false)).toBe(true);
    expect(isPrimaryNavActive("products", "products", false)).toBe(true);
    expect(isPrimaryNavActive("reports", "reports", false)).toBe(true);
    expect(isPrimaryNavActive("kitchen", "kitchen", false)).toBe(true);
    expect(isPrimaryNavActive("overview", "overview", false)).toBe(true);
    expect(isPrimaryNavActive("orders", "settings", false)).toBe(false);
    expect(isPrimaryNavActive("", "overview", false)).toBe(false);
    expect(isPrimaryNavActive("overview", "overview", true)).toBe(true);
  });

  it("maps report routes to their page keys", () => {
    expect(pageAccessKey("/reports")).toBe("reports");
    expect(pageAccessKey("/reports/data-input-progress")).toBe(
      "reports.data_input_progress",
    );
    expect(pageAccessKey("/reports/kitchen")).toBe("kitchen.cost_input");
    expect(pageAccessKey("/reports/frozen-meat")).toBe("reports.frozen_meat");
    expect(pageAccessKey("/reports/shops")).toBe("reports.shops");
    expect(pageAccessKey("/reports/tabs/shop-sales")).toBe(
      "reports.shop_sales",
    );
    expect(pageAccessKey("/finance/cost-input")).toBe("kitchen.cost_input");
    expect(pageAccessKey("/reports/tabs/shop-order-quantities")).toBe(
      "reports.shop_order_quantities",
    );
    expect(pageAccessKey("/frozen")).toBe("frozen");
    expect(pageAccessKey("/frozen/selling-price-cost")).toBe(
      "frozen.selling_price_cost",
    );
    expect(pageAccessKey("/frozen/raw-meat-inventory")).toBe(
      "frozen.raw_meat_inventory",
    );
    expect(pageAccessKey("/frozen/prepared-meat-inventory")).toBe(
      "frozen.prepared_meat_inventory",
    );
    expect(pageAccessKey("/frozen/delivery-notes")).toBe(
      "frozen.delivery_notes",
    );
    expect(pageAccessKey("/frozen/seasoning-cost")).toBe(
      "frozen.seasoning_cost",
    );
    expect(pageAccessKey("/frozen/calculation-settings")).toBe(
      "frozen.calculation_settings",
    );
    expect(pageAccessKey("/frozen/customers")).toBe("frozen.meat_customers");
    expect(pageAccessKey("/frozen/spice-usage")).toBe("frozen.spice_usage");
    expect(pageAccessKey("/frozen/yield-errors")).toBe("frozen.yield_errors");
    expect(pageAccessKey("/orders/settings")).toBe("orders.settings");
    expect(pageAccessKey("/orders/settings/tags")).toBe("orders.settings");
    expect(pageAccessKey("/orders/settings/shipping")).toBe("orders.settings");
    expect(pageAccessKey("/orders/settings/payments")).toBe("orders.settings");
    expect(pageAccessKey("/orders/settings/statuses")).toBe(
      "orders.settings.statuses",
    );
    expect(pageAccessKey("/orders/settings/sale-partners")).toBe(
      "orders.settings.sale_partners",
    );
    expect(pageAccessKey("/settings/login-logs")).toBe("settings.login_logs");
    expect(pageAccessKey("/settings/order-lists")).toBe("settings.order_lists");
    expect(pageAccessKey("/settings/attachments")).toBe(
      "settings.attachments",
    );
    expect(pageAccessKey("/orders/unpaid")).toBe("orders.unpaid");
    expect(pageAccessKey("/orders/payments/bank-arrival-date")).toBe(
      "orders.payments",
    );
    expect(pageAccessKey("/orders/monthly")).toBe("orders.monthly");
    expect(pageAccessKey("/orders/split")).toBe("orders.split");
    expect(pageAccessKey("/orders/kitchen-notes")).toBe("orders.kitchen_notes");
    expect(pageAccessKey("/orders/reschedule-pending")).toBe(
      "orders.reschedule_pending",
    );
    expect(pageAccessKey("/orders/shopify-pending")).toBe(
      "orders.shopify_pending",
    );
    expect(pageAccessKey("/kitchen/settings")).toBe("kitchen.settings");
    expect(pageAccessKey("/kitchen/calendar")).toBe("kitchen.calendar");
    expect(pageAccessKey("/orders/calendar")).toBe("kitchen.calendar");
    expect(pageAccessKey("/orders/production")).toBe("kitchen.calendar");
    expect(pageAccessKey("/kitchen/settings/cook-types")).toBe(
      "kitchen.settings",
    );
    expect(pageAccessKey("/factory")).toBe("workspace");
    expect(pageAccessKey("/driver-delivery")).toBe("workspace");
  });

  it("registers order settings before the order detail route", () => {
    const appSource = readFileSync(
      path.resolve(process.cwd(), "src/App.tsx"),
      "utf8",
    );
    const navSource = readFileSync(
      path.resolve(process.cwd(), "src/lib/nav.ts"),
      "utf8",
    );
    expect(appSource.indexOf('path="/orders/settings/:tab"')).toBeGreaterThan(-1);
    expect(appSource.indexOf('path="/orders/settings/statuses"')).toBeGreaterThan(
      -1,
    );
    expect(appSource.indexOf('path="/orders/settings/:tab"')).toBeLessThan(
      appSource.indexOf('path="/orders/:id"'),
    );
    expect(navSource).toContain('to: "/orders/settings/sale-partners"');
    expect(navSource).toContain('permissionKey: "orders.settings"');
    expect(navSource).toContain('to: "/orders/unpaid"');
    expect(navSource).toContain('to: "/orders/monthly"');
    expect(navSource).toContain('to: "/orders/split"');
    expect(navSource).toContain('to: "/orders/kitchen-notes"');
    expect(navSource).toContain('to: "/orders/reschedule-pending"');
    expect(navSource).toContain('to: "/orders/shopify-pending"');
    expect(navSource).toContain('to: "/orders/calendar"');
    expect(navSource).toContain('key: "bankArrivalDateInput"');
    expect(navSource).toContain('to: "/orders/payments/bank-arrival-date"');
    expect(appSource.indexOf('path="/orders/calendar"')).toBeLessThan(
      appSource.indexOf('path="/orders/:id"'),
    );
    expect(appSource.indexOf('path="/orders/shopify-pending"')).toBeLessThan(
      appSource.indexOf('path="/orders/:id"'),
    );
    expect(appSource).toContain('path="/settings/order-lists"');
    expect(navSource).toContain('to: "/settings/order-lists"');
  });

  it("nests the frozen meat page under the reports sidebar item", () => {
    const appSource = readFileSync(
      path.resolve(process.cwd(), "src/App.tsx"),
      "utf8",
    );
    const navSource = readFileSync(
      path.resolve(process.cwd(), "src/lib/nav.ts"),
      "utf8",
    );
    expect(navSource).toContain("key: \"frozenMeat\"");
    expect(navSource).toContain("key: \"shops\"");
    expect(navSource).toContain("key: \"dataInputProgress\"");
    expect(navSource).toContain("REPORT_GROUP_ROUTES.dataInputProgress");
    expect(navSource).toContain("REPORT_GROUP_ROUTES.frozenMeat");
    expect(navSource).toContain("REPORT_GROUP_ROUTES.shops");
    expect(appSource).toContain("sidebar-subnav");
  });

  it("keeps legacy report deep routes inside the reports fallback", () => {
    const appSource = readFileSync(
      path.resolve(process.cwd(), "src/App.tsx"),
      "utf8",
    );

    expect(appSource.indexOf('path="/reports/data-input-progress"')).toBeLessThan(
      appSource.indexOf('path="/reports/*"'),
    );
    expect(appSource.indexOf('path="/reports/shops"')).toBeLessThan(
      appSource.indexOf('path="/reports/*"'),
    );
    expect(appSource).toContain('path="/reports/*"');
    expect(appSource).toContain(
      'element={<Navigate to={firstReportsPath} replace />}',
    );
    expect(appSource).toContain('path="/reports"');
  });

  it("places selling price cost after prepared meat inventory in Frozen Goods", () => {
    const navSource = readFileSync(
      path.resolve(process.cwd(), "src/lib/nav.ts"),
      "utf8",
    );
    const prepared = navSource.indexOf('key: "preparedMeatInventoryCalc"');
    const selling = navSource.indexOf('key: "sellingPriceCost"');
    const yieldErrors = navSource.indexOf('key: "yieldErrors"');
    expect(prepared).toBeGreaterThan(-1);
    expect(selling).toBeGreaterThan(prepared);
    expect(yieldErrors).toBeGreaterThan(selling);
    expect(navSource).toContain('to: "/frozen/yield-errors"');
    expect(navSource).toContain('permissionKey: "frozen.yield_errors"');
  });

  it("places the delivery list under Delivery as 送貨清單", () => {
    const appSource = readFileSync(
      path.resolve(process.cwd(), "src/App.tsx"),
      "utf8",
    );
    const navSource = readFileSync(
      path.resolve(process.cwd(), "src/lib/nav.ts"),
      "utf8",
    );
    expect(navSource).toContain('key: "deliveryList"');
    expect(navSource).toContain('to: "/delivery"');
    expect(appSource).toContain("DeliveryListPage");
    expect(pageAccessKey("/delivery")).toBe("delivery");
  });

  it("nests Sale Partner first under Orders settings", () => {
    const navSource = readFileSync(
      path.resolve(process.cwd(), "src/lib/nav.ts"),
      "utf8",
    );
    expect(navSource).toContain('key: "orderSettings"');
    expect(navSource).toContain('key: "salePartners"');
    expect(navSource).toContain('key: "orderStatuses"');
    expect(navSource).toContain('key: "orderTags"');
    expect(navSource).toContain('key: "orderShippingMethods"');
    expect(navSource).toContain('key: "orderPaymentMethods"');
    expect(navSource.indexOf('key: "salePartners"')).toBeLessThan(
      navSource.indexOf('key: "orderStatuses"'),
    );
    expect(navSource).toContain('to: "/orders/settings/sale-partners"');
    expect(navSource).toContain('to: "/orders/settings/tags"');
    expect(navSource).toContain('to: "/orders/settings/shipping"');
    expect(navSource).toContain('to: "/orders/settings/payments"');
    expect(navSource).toContain('to: "/orders/settings/statuses"');
    expect(navSource).toContain('permissionKey: "orders.settings"');
    expect(navSource).toContain('permissionKey: "orders.settings.statuses"');
    expect(navSource).toContain('permissionKey: "orders.settings.sale_partners"');
  });
});
