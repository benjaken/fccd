import { describe, expect, it } from "vitest";

import { buildMobileDrawerNav } from "@/App";

describe("buildMobileDrawerNav", () => {
  const visiblePrimary = [
    { key: "overview", to: "/", icon: () => null },
    { key: "orders", to: "/orders", icon: () => null },
    { key: "quotes", to: "/quotes", icon: () => null },
    { key: "delivery", to: "/delivery", icon: () => null },
    { key: "settings", to: "/settings", icon: () => null, permissionKey: "settings" },
    { key: "reports", to: "/reports", icon: () => null },
  ];

  it("flattens secondary destinations into one drawer list", () => {
    const groups = buildMobileDrawerNav(visiblePrimary, () => true);
    const overview = groups.find((group) => group.groupKey === "overview");
    const orders = groups.find((group) => group.groupKey === "orders");
    const settings = groups.find((group) => group.groupKey === "settings");

    expect(overview?.items.map((item) => item.to)).toEqual([
      "/",
      "/follow-up",
      "/inventory",
    ]);
    expect(orders?.items.map((item) => item.to)).toEqual([
      "/orders",
      "/orders/new",
      "/orders/pending",
      "/orders/unpaid",
      "/orders/monthly",
      "/orders/split",
      "/orders/kitchen-notes",
      "/orders/reschedule-pending",
      "/orders/shopify-pending",
      "/orders/payments",
      "/orders/drivers",
      "/orders/settings/sale-partners",
      "/orders/settings/statuses",
      "/orders/settings/tags",
      "/orders/settings/shipping",
      "/orders/settings/payments",
    ]);
    expect(settings?.items.map((item) => item.key)).toEqual([
      "users",
      "rolePermissions",
      "loginLogs",
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
    const settings = groups.find((group) => group.groupKey === "settings");

    expect(orders?.items.map((item) => item.to)).toEqual(["/orders"]);
    expect(settings).toBeUndefined();
  });

  it("lists nested report destinations as sibling drawer links", () => {
    const groups = buildMobileDrawerNav(visiblePrimary, () => true);
    const reports = groups.find((group) => group.groupKey === "reports");

    expect(reports?.items.map((item) => item.key)).toEqual([
      "frozenMeat",
      "shops",
      "finance",
    ]);
  });
});
