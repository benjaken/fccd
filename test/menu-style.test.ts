import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accessibleBusinessPrimaryPath,
  buildBusinessMobileDrawerNav,
  businessPrimaryNav,
  businessSectionFromLocation,
  businessSidebarNav,
  isBusinessNavTargetActive,
  isBusinessPrimaryNavVisible,
} from "@/lib/nav";
import {
  DEFAULT_MENU_STYLE,
  MENU_STYLE_CHANGED,
  readMenuStyle,
  saveMenuStyle,
} from "@/lib/menu-style";

describe("menu styles", () => {
  beforeEach(() => window.localStorage.clear());

  it("uses style one by default and saves a per-user choice", () => {
    expect(readMenuStyle("user-a")).toBe(DEFAULT_MENU_STYLE);
    saveMenuStyle("style-two", "user-a");
    expect(readMenuStyle("user-a")).toBe("style-two");
    expect(readMenuStyle("user-b")).toBe("style-one");
  });

  it("notifies the shell immediately when the choice changes", () => {
    const listener = vi.fn();
    window.addEventListener(MENU_STYLE_CHANGED, listener);
    saveMenuStyle("style-two", "user-a");
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe("style-two");
    window.removeEventListener(MENU_STYLE_CHANGED, listener);
  });

  it("keeps business primary sections and nests canonical pages in the sidebar", () => {
    expect(businessPrimaryNav.map((item) => item.key)).toEqual([
      "overview",
      "followUp",
      "catering",
      "frozen",
      "restaurant",
      "accountingFollowUp",
      "reports",
      "promotion",
      "settings",
    ]);
    const catering = businessSidebarNav("catering", "orders");
    expect(catering.map((item) => item.key)).toEqual([
      "orders",
      "allQuotes",
      "customers",
      "products",
      "kitchen",
      "delivery",
    ]);
    expect(catering[0].children?.some((item) => item.key === "allOrders")).toBe(true);
    const customers = catering.find((item) => item.key === "customers");
    expect(customers).toMatchObject({
      to: "/quotes/customers?nav=catering.customerSection",
      permissionKey: "quotes.customers",
    });
    expect(customers?.children).toBeUndefined();
  });

  it("activates only the queue link whose tab and menu context match", () => {
    const links = businessSidebarNav("followUp", "catering")
      .find((item) => item.key === "catering")?.children ?? [];
    const active = links.filter((item) =>
      isBusinessNavTargetActive(
        "/orders",
        "?tab=shopify-pending&nav=follow-up.catering",
        item.to,
      ),
    );
    expect(active.map((item) => item.key)).toEqual(["pendingEntry"]);
  });

  it("keeps follow-up entrances while reusing operational pages from their modules", () => {
    const followUp = businessSidebarNav("followUp", "catering");
    const cateringFollowUpKeys = followUp.find((item) => item.key === "catering")?.children?.map((item) => item.key);
    expect(followUp.map((item) => item.key)).toEqual(["catering", "restaurant", "frozen"]);
    expect(cateringFollowUpKeys).toEqual([
      "reminders",
      "pendingEntry",
      "pendingQuote",
      "pendingPayment",
      "pendingFactory",
      "pendingDriver",
      "customerOrderInquiries",
      "pendingProductReview",
      "ingredientStocktakes",
      "packingStocktakes",
      "kitchenMaterialUsage",
      "operationsExpenseInput",
      "purchaseExpenseInput",
      "deliveryList",
    ]);
    expect(followUp.find((item) => item.key === "restaurant")?.children?.map((item) => item.key)).toEqual([
      "restaurantDailySales",
      "restaurantDailyPurchases",
      "restaurantStocktakes",
      "restaurantMonthlyExpenses",
      "newProductSalesStats",
    ]);
    expect(followUp.find((item) => item.key === "frozen")?.children?.map((item) => item.key)).toEqual([
      "rawMeatInventoryCalc",
      "preparedMeatInventoryCalc",
      "sellingPriceCost",
      "deliveryNotes",
    ]);

    const catering = businessSidebarNav("catering", "kitchen");
    const kitchen = catering.find((item) => item.key === "kitchen")?.children ?? [];
    expect(kitchen.map((item) => item.key)).toEqual(expect.arrayContaining([
      "packingStocktakes",
      "ingredientStocktakes",
      "kitchenMaterialUsage",
      "dataInputProgress",
      "operationsExpenseInput",
      "purchaseExpenseInput",
    ]));
    expect(kitchen.map((item) => item.key)).not.toContain("kitchenReports");
    const delivery = catering.find((item) => item.key === "delivery")?.children ?? [];
    expect(delivery.some((item) => item.key === "deliveryList")).toBe(true);

    expect(businessSidebarNav("restaurant", "").map((item) => item.key)).toEqual([
      "restaurantDailySales",
      "restaurantDailyPurchases",
      "restaurantStocktakes",
      "restaurantMonthlyExpenses",
      "restaurantOrdering",
      "shopSales",
      "shopSalesWorkingHours",
      "restaurantSalesSalary",
      "restaurantSalesCost",
      "restaurantPnl",
      "newProductSalesStats",
      "restaurantStaff",
      "restaurantSettings",
    ]);
    expect(
      businessSidebarNav("restaurant", "").find(
        (item) => item.key === "newProductSalesStats",
      )?.to,
    ).toBe("/reports/shops/new-products?nav=restaurant");
    expect(
      businessSectionFromLocation(
        "/reports/shops/pnl",
        "?nav=restaurant",
      ),
    ).toBe("restaurant");
    expect(
      isBusinessNavTargetActive(
        "/reports/shops/pnl",
        "?nav=restaurant",
        "/reports/shops/pnl?nav=restaurant",
      ),
    ).toBe(true);
    expect(businessSidebarNav("frozen", "").map((item) => item.key)).toEqual(
      expect.arrayContaining([
        "rawMeatInventoryCalc",
        "preparedMeatInventoryCalc",
        "sellingPriceCost",
        "deliveryNotes",
        "rawMeatReports",
      ]),
    );
    const appSource = readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(appSource).not.toMatch(/rawMeatInventoryCalc:\s*\[/);
    expect(appSource).not.toMatch(/preparedMeatInventoryCalc:\s*\[/);
    expect(appSource).not.toMatch(/sellingPriceCost:\s*\[/);
    expect(businessSidebarNav("frozen", "")[0]?.key).toBe("rawMeatReports");
    const frozenReports = businessSidebarNav("frozen", "").find(
      (item) => item.key === "rawMeatReports",
    );
    expect(frozenReports?.to).toBe("/reports/frozen-meat?nav=frozen");
    expect(frozenReports?.children?.map((item) => item.key)).toEqual([
      "shopOrderQuantities",
      "averageSupplyPrice",
      "productionCostPrice",
      "rawMeatAveragePrice",
      "preparedMeatStock",
      "rawMeatStock",
      "supplierPurchase",
    ]);
    expect(frozenReports?.children?.every((item) => item.to.includes("nav=frozen"))).toBe(true);
    expect(businessSidebarNav("restaurant", "").map((item) => item.key)).not.toContain("shops");

    const reports = businessSidebarNav("reports", "");
    expect(reports.map((item) => item.key)).toEqual([
      "kitchenReports",
      "frozenMeat",
      "shops",
    ]);
    expect(reports.find((item) => item.key === "kitchenReports")?.children?.map((item) => item.key)).toEqual([
      "kitchenSalesCost",
      "kitchenChannelSales",
      "kitchenProductSales",
      "kitchenAdvertisingPerformance",
      "festivalOrderGeneration",
    ]);
    expect(reports.find((item) => item.key === "frozenMeat")?.children?.map((item) => item.key)).toEqual([
      "shopOrderQuantities",
      "averageSupplyPrice",
      "productionCostPrice",
      "rawMeatAveragePrice",
      "preparedMeatStock",
      "rawMeatStock",
      "supplierPurchase",
    ]);
    expect(reports.find((item) => item.key === "shops")?.children?.map((item) => item.key)).toEqual([
      "shopSales",
      "shopSalesWorkingHours",
      "restaurantSalesSalary",
      "restaurantSalesCost",
      "restaurantPnl",
      "newProducts",
    ]);
  });

  it("keeps shared report routes and promotion settings in their current sections", () => {
    expect(businessSectionFromLocation("/reports/kitchen/channel-sales", "")).toBe("reports");
    expect(businessSectionFromLocation("/reports/frozen-meat/raw-meat-stock", "")).toBe("reports");
    expect(businessSectionFromLocation("/reports/shops/pnl", "")).toBe("reports");
    expect(businessSectionFromLocation("/reports/data-input-progress", "?nav=reports")).toBe("reports");
    expect(businessSectionFromLocation("/reports/data-input-progress", "?nav=catering.kitchen")).toBe("catering");
    expect(businessSectionFromLocation("/reports/kitchen", "?nav=accounting.cateringData")).toBe("accountingFollowUp");
    expect(businessSectionFromLocation("/reports/shops/pnl", "?nav=accounting.restaurantData")).toBe("accountingFollowUp");
    expect(businessSectionFromLocation("/reports/frozen-meat/raw-meat-stock", "?nav=accounting.factoryData")).toBe("accountingFollowUp");
    expect(businessSectionFromLocation("/settings/users", "")).toBe("settings");
    expect(businessSectionFromLocation("/settings/employees", "?nav=settings")).toBe("settings");
    expect(businessSidebarNav("settings", "").map((item) => item.key)).toEqual([
      "employees",
      "users",
      "rolePermissions",
      "loginLogs",
    ]);
    expect(businessSidebarNav("promotion", "").map((item) => item.key)).toEqual([
      "watiEmailLogs",
      "customerFaq",
      "dictionaries",
      "notificationSettings",
      "districts",
      "attachments",
    ]);
    expect(businessSidebarNav("settings", "")[0]?.to).toContain("nav=settings");
    expect(businessSidebarNav("promotion", "")[0]?.to).toContain("nav=promotion");

    expect(
      isBusinessNavTargetActive(
        "/reports/frozen-meat/raw-meat-stock",
        "",
        "/reports/frozen-meat?nav=reports",
      ),
    ).toBe(true);
  });

  it("keeps accounting follow-up as soft links to existing report pages", () => {
    const accounting = businessSidebarNav("accountingFollowUp", "cateringData");
    expect(accounting.map((item) => item.key)).toEqual([
      "cateringData",
      "restaurantData",
      "factoryData",
    ]);
    expect(accounting.find((item) => item.key === "cateringData")?.children?.map((item) => item.key)).toEqual([
      "kitchenSalesCost",
      "kitchenChannelSales",
      "kitchenProductSales",
      "kitchenAdvertisingPerformance",
      "festivalOrderGeneration",
      "dataInputProgress",
      "operationsExpenseInput",
      "purchaseExpenseInput",
    ]);
    expect(accounting.find((item) => item.key === "restaurantData")?.children?.map((item) => item.key)).toEqual(
      businessSidebarNav("reports", "").find((item) => item.key === "shops")?.children?.map((item) => item.key),
    );
    expect(accounting.find((item) => item.key === "factoryData")?.children?.map((item) => item.key)).toEqual(
      businessSidebarNav("reports", "").find((item) => item.key === "frozenMeat")?.children?.map((item) => item.key),
    );
    expect(accounting.flatMap((item) => item.children ?? []).every((item) => item.to.includes("nav=accounting."))).toBe(true);
    expect(
      isBusinessNavTargetActive(
        "/reports/kitchen/channel-sales",
        "?nav=accounting.cateringData",
        "/reports/kitchen/channel-sales?nav=accounting.cateringData",
      ),
    ).toBe(true);
    expect(
      isBusinessNavTargetActive(
        "/reports/kitchen/channel-sales",
        "?nav=accounting.cateringData",
        "/reports/kitchen/channel-sales?nav=reports",
      ),
    ).toBe(false);

    const accountingPrimary = businessPrimaryNav.find((item) => item.key === "accountingFollowUp")!;
    expect(isBusinessPrimaryNavVisible(accountingPrimary, () => false)).toBe(false);
    expect(isBusinessPrimaryNavVisible(accountingPrimary, (key) => key === "kitchen.cost_input")).toBe(true);
    expect(isBusinessPrimaryNavVisible(accountingPrimary, (key) => key === "reports.shop_sales")).toBe(true);
    expect(isBusinessPrimaryNavVisible(accountingPrimary, (key) => key === "reports.shop_order_quantities")).toBe(true);
    expect(
      accessibleBusinessPrimaryPath(accountingPrimary, (key) => key === "reports.shop_sales"),
    ).toBe("/reports/shops?nav=accounting.restaurantData");

    const appSource = readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(appSource).toMatch(/accountingFollowUp:\s*\["會計跟進"/);
    expect(appSource).toMatch(/cateringData:\s*\["到會數據"/);
    expect(appSource).toMatch(/restaurantData:\s*\["餐廳數據"/);
    expect(appSource).toMatch(/factoryData:\s*\["工場數據"/);
  });

  it("keeps second and third level groups in the style-one mobile drawer", () => {
    const groups = buildBusinessMobileDrawerNav(businessPrimaryNav, () => true);
    expect(groups.map((group) => group.groupKey)).toEqual([
      "overview",
      "followUp",
      "catering",
      "frozen",
      "restaurant",
      "accountingFollowUp",
      "reports",
      "promotion",
      "settings",
    ]);

    const catering = groups.find((group) => group.groupKey === "catering");
    expect(catering?.items.map((item) => item.key)).toEqual([
      "orders",
      "allQuotes",
      "customers",
      "products",
      "kitchen",
      "delivery",
    ]);
    const orders = catering?.items.find((item) => item.key === "orders");
    expect(orders?.children?.map((item) => item.key)).toEqual(
      expect.arrayContaining(["allOrders", "payments", "orderSettings"]),
    );
    expect(
      orders?.children?.find((item) => item.key === "orderSettings")?.children?.map((item) => item.key),
    ).toEqual(
      expect.arrayContaining([
        "salePartners",
        "orderStatuses",
      ]),
    );
    expect(catering?.items.find((item) => item.key === "customers")?.children).toBeUndefined();

    const accounting = groups.find((group) => group.groupKey === "accountingFollowUp");
    expect(accounting?.items.map((item) => item.key)).toEqual([
      "cateringData",
      "restaurantData",
      "factoryData",
    ]);
    expect(
      accounting?.items.find((item) => item.key === "cateringData")?.children?.map((item) => item.key),
    ).toEqual(expect.arrayContaining(["kitchenSalesCost", "dataInputProgress"]));

    const reports = groups.find((group) => group.groupKey === "reports");
    expect(
      reports?.items.find((item) => item.key === "kitchenReports")?.children?.map((item) => item.key),
    ).toEqual([
      "kitchenSalesCost",
      "kitchenChannelSales",
      "kitchenProductSales",
      "kitchenAdvertisingPerformance",
      "festivalOrderGeneration",
    ]);
  });
});
