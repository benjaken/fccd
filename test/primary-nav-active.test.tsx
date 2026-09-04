import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  businessSidebarNav,
  flattenVisibleNavItems,
  isBusinessSecondaryNavItemActive,
  isPrimaryNavActive,
  isSecondaryNavItemActive,
  primaryNav,
  sectionFromPath,
} from "@/lib/nav";
import {
  pageAccessKey,
  REPORT_GROUP_TABS,
  REPORT_TAB_ROUTES,
} from "@/auth/use-page-access";

describe("Primary navigation section matching", () => {
  it("keeps the business menu invoice and every order setting as leaf links", () => {
    const leaves = flattenVisibleNavItems(
      businessSidebarNav("catering", "orders"),
      () => true,
    );
    expect(leaves.map((item) => item.to)).toContain(
      "/orders/payments/masoft-invoices?nav=catering.orders",
    );
    expect(leaves.filter((item) => item.to.startsWith("/orders/settings/")).length)
      .toBeGreaterThan(1);
  });

  it("activates only the most specific business-menu leaf", () => {
    const targets = [
      "/orders?nav=catering.orders",
      "/orders/payments/bank-arrival-date?nav=catering.orders",
      "/orders/payments/masoft-invoices?nav=catering.orders",
    ];
    expect(
      targets.filter((target) =>
        isBusinessSecondaryNavItemActive(
          "/orders/payments/bank-arrival-date",
          "?nav=catering.orders",
          target,
          targets,
        ),
      ),
    ).toEqual([targets[1]]);
    expect(
      targets.filter((target) =>
        isBusinessSecondaryNavItemActive(
          "/orders/payments/bank-arrival-date",
          "",
          target,
          targets,
        ),
      ),
    ).toEqual([targets[1]]);
  });

  it.each([
    ["/reports/frozen-meat", "/reports/frozen-meat"],
    ["/reports/frozen-meat/raw-meat-stock", "/reports/frozen-meat"],
    ["/reports/shops/sales-working-hours", "/reports/shops"],
    ["/reports/kitchen/advertising-performance", "/reports/kitchen"],
    ["/reports/kitchen/festival-orders", "/reports/kitchen"],
  ])("keeps report secondary item %s active under %s", (pathname, itemPath) => {
    expect(isSecondaryNavItemActive(pathname, itemPath)).toBe(true);
  });

  it.each([
    ["/orders/pending", ["/orders", "/orders/pending", "/orders/unpaid"], "/orders/pending"],
    ["/quotes/customers", ["/quotes", "/quotes/customers", "/quotes/pending"], "/quotes/customers"],
    ["/products/packages", ["/products", "/products/packages"], "/products/packages"],
    ["/delivery/assign", ["/delivery", "/delivery/assign", "/delivery/fleets"], "/delivery/assign"],
  ])("activates only the longest matching secondary route for %s", (pathname, siblings, expected) => {
    expect(
      siblings.filter((to) => isSecondaryNavItemActive(pathname, to, siblings)),
    ).toEqual([expected]);
  });

  it.each(Object.entries(REPORT_GROUP_TABS))(
    "gives every %s report tab a unique URL inside its group",
    (group, tabs) => {
      const routes = tabs.map((tab) => REPORT_TAB_ROUTES[tab]);

      expect(new Set(routes).size).toBe(routes.length);
      expect(routes.every((route) =>
        route.startsWith(group === "shops" ? "/reports/shops" : "/reports/frozen-meat"),
      )).toBe(true);
    },
  );
  it.each([
    ["/", "overview"],
    ["/follow-up", "followUp"],
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
    ["/quotes/customers", "customerSection"],
    ["/quotes/quote-1", "quotes"],
    ["/products", "products"],
    ["/products/packages", "products"],
    ["/products/packages/pkg-1", "products"],
    ["/frozen", "frozen"],
    ["/frozen/selling-price-cost", "frozen"],
    ["/frozen/raw-meat-inventory", "frozen"],
    ["/frozen/prepared-meat-inventory", "frozen"],
    ["/frozen/delivery-notes", "frozen"],
    ["/frozen/seasoning-recipes", "frozen"],
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
    ["/restaurant/daily-sales", "restaurant"],
    ["/restaurant/daily-purchases", "restaurant"],
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
    ["/settings/dictionaries", "settings"],
    ["/settings/districts", "settings"],
    ["/settings/customer-faq", "settings"],
    ["/settings/order-lists", "settings"],
    ["/settings/attachments", "settings"],
    ["/orders/settings/order-list-tips", "orders"],
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
    expect(primaryNav.find((item) => item.key === "followUp")).toMatchObject({
      to: "/follow-up",
      permissionKey: "overview.follow_up",
    });
    expect(primaryNav.find((item) => item.key === "customerSection")).toMatchObject({
      to: "/quotes/customers",
      permissionKey: "customerSection",
    });
    expect(primaryNav.find((item) => item.key === "restaurant")?.to).toBe(
      "/restaurant/daily-sales",
    );
  });

  it("maps report routes to their page keys", () => {
    expect(pageAccessKey("/reports")).toBe("reports");
    expect(pageAccessKey("/reports/data-input-progress")).toBe(
      "reports.data_input_progress",
    );
    expect(pageAccessKey("/reports/kitchen")).toBe("kitchen.cost_input");
    expect(pageAccessKey("/reports/frozen-meat")).toBe("reports.frozen_meat");
    expect(pageAccessKey("/reports/shops")).toBe("reports.shops");
    expect(pageAccessKey("/reports/shops/sales-working-hours")).toBe(
      "reports.shop_sales_working_hours",
    );
    expect(pageAccessKey("/finance/cost-input")).toBe("kitchen.cost_input");
    expect(pageAccessKey("/reports/frozen-meat/raw-meat-stock")).toBe(
      "reports.raw_meat_stock",
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
    expect(pageAccessKey("/frozen/seasoning-recipes")).toBe(
      "frozen.seasoning_recipes",
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
    expect(pageAccessKey("/orders/settings/order-list-tips")).toBe(
      "settings.order_lists",
    );
    expect(pageAccessKey("/settings/login-logs")).toBe("settings.login_logs");
    expect(pageAccessKey("/settings/dictionaries")).toBe("settings.dictionaries");
    expect(pageAccessKey("/settings/districts")).toBe("settings.districts");
    expect(pageAccessKey("/settings/customer-faq")).toBe("settings.customer_faq");
    expect(pageAccessKey("/settings/order-lists")).toBe("settings.order_lists");
    expect(pageAccessKey("/settings/attachments")).toBe(
      "settings.attachments",
    );
    expect(pageAccessKey("/orders/unpaid")).toBe("orders.unpaid");
    expect(pageAccessKey("/follow-up")).toBe("overview.follow_up");
    expect(pageAccessKey("/orders/dashboard")).toBe("overview.follow_up");
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
    expect(pageAccessKey("/quotes/pending")).toBe("quotes");
    expect(pageAccessKey("/quotes/follow-up")).toBe("quotes");
    expect(pageAccessKey("/quotes/large")).toBe("quotes");
    expect(pageAccessKey("/quotes/recent-open")).toBe("quotes");
    expect(pageAccessKey("/restaurant/daily-sales")).toBe(
      "restaurant.daily_sales",
    );
    expect(pageAccessKey("/restaurant/daily-purchases")).toBe(
      "restaurant.daily_purchases",
    );
    expect(pageAccessKey("/kitchen/settings")).toBe("kitchen.settings");
    expect(pageAccessKey("/kitchen/calendar")).toBe("kitchen.calendar");
    expect(pageAccessKey("/orders/calendar")).toBe("kitchen.calendar");
    expect(pageAccessKey("/orders/production")).toBe("kitchen.calendar");
    expect(pageAccessKey("/kitchen/settings/cook-types")).toBe(
      "kitchen.settings",
    );
    expect(pageAccessKey("/factory")).toBe("workspace.factory.board");
    expect(pageAccessKey("/factory/order/delivery-1")).toBe(
      "workspace.factory.order",
    );
    expect(pageAccessKey("/factory/multi-day-menu")).toBe(
      "workspace.factory.multi_day_menu",
    );
    expect(pageAccessKey("/factory/production-calendar")).toBe(
      "workspace.factory.production_calendar",
    );
    expect(pageAccessKey("/factory/warehouse")).toBe(
      "workspace.factory.warehouse.pending",
    );
    expect(pageAccessKey("/factory/warehouse/shipments")).toBe(
      "workspace.factory.warehouse.outbound",
    );
    expect(pageAccessKey("/factory/warehouse/receipts")).toBe(
      "workspace.factory.warehouse.inbound",
    );
    expect(pageAccessKey("/restaurant-workspace/receive")).toBe(
      "workspace.restaurant.receive",
    );
    expect(pageAccessKey("/driver-delivery")).toBe("workspace.delivery");
    expect(pageAccessKey("/driver-delivery/available")).toBe(
      "workspace.delivery.available",
    );
    expect(pageAccessKey("/driver-delivery/settings")).toBe(
      "workspace.delivery.settings",
    );
    expect(pageAccessKey("/customer")).toBe("workspace.customer.portal");
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
    expect(navSource).not.toContain('to: "/orders/unpaid"');
    expect(navSource).not.toContain('to: "/orders/monthly"');
    expect(navSource).not.toContain('to: "/orders/split"');
    expect(navSource).not.toContain('to: "/orders/kitchen-notes"');
    expect(navSource).not.toContain('to: "/orders/reschedule-pending"');
    expect(navSource).not.toContain('to: "/orders/shopify-pending"');
    expect(navSource).toContain('to: "/orders/calendar"');
    expect(navSource).toContain('key: "bankArrivalDateInput"');
    expect(navSource).toContain('to: "/orders/payments/bank-arrival-date"');
    expect(appSource.indexOf('path="/orders/calendar"')).toBeLessThan(
      appSource.indexOf('path="/orders/:id"'),
    );
    expect(appSource.indexOf('path="/orders/shopify-pending"')).toBeLessThan(
      appSource.indexOf('path="/orders/:id"'),
    );
    expect(appSource).toContain('path="/orders/settings/order-list-tips"');
    expect(appSource).toContain('path="/settings/order-lists"');
    expect(navSource).toContain('to: "/orders/settings/order-list-tips"');
    expect(navSource).not.toContain('to: "/settings/order-lists"');
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
