import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  businessPrimaryNav,
  businessSectionFromLocation,
  businessSidebarNav,
  isBusinessNavTargetActive,
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

  it("keeps seven business primary sections and nests canonical pages in the sidebar", () => {
    expect(businessPrimaryNav.map((item) => item.key)).toEqual([
      "overview",
      "followUp",
      "catering",
      "frozen",
      "restaurant",
      "reports",
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
      "pendingProductReview",
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

  it("keeps shared report routes inside the original reports menu", () => {
    expect(businessSectionFromLocation("/reports/kitchen/channel-sales", "")).toBe("reports");
    expect(businessSectionFromLocation("/reports/frozen-meat/raw-meat-stock", "")).toBe("reports");
    expect(businessSectionFromLocation("/reports/shops/pnl", "")).toBe("reports");
    expect(businessSectionFromLocation("/reports/data-input-progress", "?nav=reports")).toBe("reports");
    expect(businessSectionFromLocation("/reports/data-input-progress", "?nav=catering.kitchen")).toBe("catering");
    expect(businessSectionFromLocation("/settings/users", "")).toBe("settings");
    expect(businessSectionFromLocation("/settings/employees", "?nav=settings")).toBe("settings");
    expect(businessSidebarNav("settings", "").map((item) => item.key)).toEqual([
      "employees",
      "users",
      "rolePermissions",
      "loginLogs",
      "watiEmailLogs",
      "dictionaries",
      "notificationSettings",
      "districts",
      "attachments",
    ]);
    expect(businessSidebarNav("settings", "")[0]?.to).toContain("nav=settings");

    expect(
      isBusinessNavTargetActive(
        "/reports/frozen-meat/raw-meat-stock",
        "",
        "/reports/frozen-meat?nav=reports",
      ),
    ).toBe(true);
  });
});
