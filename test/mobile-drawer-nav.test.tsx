import { describe, expect, it } from "vitest";

import { buildMobileDrawerNav } from "@/lib/nav";

describe("buildMobileDrawerNav", () => {
  const visiblePrimary = [
    { key: "overview", to: "/", icon: () => null },
    {
      key: "followUp",
      to: "/follow-up",
      icon: () => null,
      permissionKey: "overview.follow_up",
    },
    { key: "orders", to: "/orders", icon: () => null },
    { key: "quotes", to: "/quotes", icon: () => null },
    { key: "delivery", to: "/delivery", icon: () => null },
    { key: "restaurant", to: "/restaurant", icon: () => null },
    { key: "settings", to: "/settings", icon: () => null, permissionKey: "settings" },
    { key: "reports", to: "/reports", icon: () => null },
  ];

  it("flattens secondary destinations into one drawer list", () => {
    const groups = buildMobileDrawerNav(visiblePrimary, () => true);
    const overview = groups.find((group) => group.groupKey === "overview");
    const orders = groups.find((group) => group.groupKey === "orders");
    const quotes = groups.find((group) => group.groupKey === "quotes");
    const delivery = groups.find((group) => group.groupKey === "delivery");
    const restaurant = groups.find((group) => group.groupKey === "restaurant");
    const settings = groups.find((group) => group.groupKey === "settings");

    const followUp = groups.find((group) => group.groupKey === "followUp");

    expect(overview?.items.map((item) => item.to)).toEqual(["/"]);
    expect(followUp?.items.map((item) => item.to)).toEqual(["/follow-up"]);
    expect(orders?.items.map((item) => item.to)).toEqual([
      "/orders",
      "/orders/shopify-pending",
      "/orders/pending",
      "/orders/not-sent-factory",
      "/orders/unpaid",
      "/orders/monthly",
      "/orders/split",
      "/orders/kitchen-notes",
      "/orders/reschedule-pending",
      "/orders/payments/bank-arrival-date",
      "/orders/payments/masoft-invoices",
      "/orders/calendar",
      "/orders/settings/wati-notifications",
      "/orders/settings/email-notifications",
      "/orders/settings/first-notification-recipients",
      "/orders/settings/sale-partners",
      "/orders/settings/statuses",
      "/orders/settings/tags",
      "/orders/settings/customer-tags",
      "/orders/settings/cost-options",
      "/orders/settings/supplier-expenses",
      "/orders/settings/quote-sales-sources",
      "/orders/settings/quote-communication-channels",
      "/orders/settings/festivals",
      "/orders/settings/quote-terms",
      "/orders/settings/quote-payments",
      "/orders/settings/shipping",
      "/orders/settings/shipping-fees",
      "/orders/settings/payments",
      "/orders/settings/add-ons",
      "/orders/settings/add-on-block-dates",
      "/orders/settings/order-list-tips",
    ]);
    expect(quotes?.items.map((item) => item.to)).toEqual([
      "/quotes",
      "/quotes/large",
      "/quotes/recent-open",
      "/quotes/famous-brands",
      "/quotes/customers",
      "/quotes/pdf-pages",
    ]);
    expect(delivery?.items.map((item) => item.to)).toEqual([
      "/delivery",
      "/delivery/assign",
      "/delivery/fleets",
      "/delivery/surcharges",
    ]);
    expect(restaurant?.items.map((item) => item.to)).toContain(
      "/restaurant/inventory",
    );
    expect(restaurant?.items.map((item) => item.to)).not.toContain(
      "/restaurant/reports",
    );
    expect(restaurant?.items.map((item) => item.to)).toContain(
      "/restaurant/daily-sales",
    );
    expect(restaurant?.items.map((item) => item.to)).toContain(
      "/restaurant/daily-purchases",
    );
    expect(settings?.items.map((item) => item.key)).toEqual([
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
  });

  it("does not nest other primary sections under 主頁", () => {
    const groups = buildMobileDrawerNav(visiblePrimary, () => true);
    const overviewHrefs = groups
      .find((group) => group.groupKey === "overview")
      ?.items.map((item) => item.to);

    expect(overviewHrefs).not.toContain("/orders");
    expect(overviewHrefs).not.toContain("/quotes");
    expect(overviewHrefs).not.toContain("/delivery");
  });

  it("hides destinations the role cannot access", () => {
    const groups = buildMobileDrawerNav(visiblePrimary, (key) =>
      key === "orders" || key === "overview" || key === "overview.follow_up",
    );
    const orders = groups.find((group) => group.groupKey === "orders");
    const followUp = groups.find((group) => group.groupKey === "followUp");
    const settings = groups.find((group) => group.groupKey === "settings");

    expect(orders?.items.map((item) => item.to)).toEqual(["/orders"]);
    expect(followUp?.items.map((item) => item.to)).toEqual(["/follow-up"]);
    expect(settings).toBeUndefined();
  });

  it("lists nested report destinations as sibling drawer links", () => {
    const groups = buildMobileDrawerNav(visiblePrimary, () => true);
    const reports = groups.find((group) => group.groupKey === "reports");

    expect(reports?.items.map((item) => item.key)).toEqual([
      "kitchenReports",
      "frozenMeat",
      "shops",
      "dataInputProgress",
      "kitchenCostInput",
    ]);
  });
});
