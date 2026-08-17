import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isPrimaryNavActive, sectionFromPath } from "@/App";
import { pageAccessKey } from "@/auth/use-page-access";

describe("Primary navigation section matching", () => {
  it.each([
    ["/", "overview"],
    ["/follow-up", "overview"],
    ["/inventory", "overview"],
    ["/orders", "orders"],
    ["/orders/pending", "orders"],
    ["/orders/order-1", "orders"],
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
    ["/reports", "reports"],
    ["/reports/daily", "reports"],
    ["/reports/frozen-meat", "reports"],
    ["/reports/shops", "reports"],
    ["/finance", "reports"],
    ["/settings", "settings"],
    ["/settings/users", "settings"],
    ["/settings/roles", "settings"],
    ["/settings/login-logs", "settings"],
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

  it("maps frozen-meat and shop report routes to their page keys", () => {
    expect(pageAccessKey("/reports")).toBe("reports");
    expect(pageAccessKey("/reports/frozen-meat")).toBe("reports.frozen_meat");
    expect(pageAccessKey("/reports/shops")).toBe("reports.shops");
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
    expect(pageAccessKey("/kitchen/settings")).toBe("kitchen.settings");
    expect(pageAccessKey("/kitchen/settings/cook-types")).toBe(
      "kitchen.settings",
    );
  });

  it("nests frozen meat and shop pages under the reports sidebar item", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/App.tsx"),
      "utf8",
    );
    expect(source).toContain("key: \"frozenMeat\"");
    expect(source).toContain("key: \"shops\"");
    expect(source).toContain("REPORT_GROUP_ROUTES.frozenMeat");
    expect(source).toContain("REPORT_GROUP_ROUTES.shops");
    expect(source).toContain("sidebar-subnav");
  });

  it("places selling price cost after prepared meat inventory in Frozen Goods", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/App.tsx"),
      "utf8",
    );
    const prepared = source.indexOf('key: "preparedMeatInventoryCalc"');
    const selling = source.indexOf('key: "sellingPriceCost"');
    const yieldErrors = source.indexOf('key: "yieldErrors"');
    expect(prepared).toBeGreaterThan(-1);
    expect(selling).toBeGreaterThan(prepared);
    expect(yieldErrors).toBeGreaterThan(selling);
    expect(source).toContain('to: "/frozen/yield-errors"');
    expect(source).toContain('permissionKey: "frozen.yield_errors"');
  });
});
