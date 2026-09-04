import { readAppStyles } from "./read-app-styles";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { Dashboard } from "@/App";
import i18n from "@/i18n";
import type { HomeSalesDashboardData } from "@/lib/home-sales-dashboard";

const dashboardData: HomeSalesDashboardData = {
  asOfDate: "2026-09-01",
  periods: [
    { key: "previousYearPreviousMonth", year: 2025, month: 8, startDate: "2025-08-01", endDate: "2025-08-31" },
    { key: "previousYearCurrentMonth", year: 2025, month: 9, startDate: "2025-09-01", endDate: "2025-09-30" },
    { key: "previousMonth", year: 2026, month: 8, startDate: "2026-08-01", endDate: "2026-08-31" },
    { key: "currentMonth", year: 2026, month: 9, startDate: "2026-09-01", endDate: "2026-09-30" },
  ],
  cateringChannels: [],
  cateringOther: null,
  tkoChannels: [],
};

const loadDashboard = () => Promise.resolve(dashboardData);

describe("Dashboard navigation", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it.each([
    ["查看品牌報告", "/reports/kitchen/channel-sales"],
    ["查看店舖報告", "/reports/shops"],
  ])("links %s to %s", async (name, target) => {
    render(
      <MemoryRouter>
        <Dashboard loadDashboard={loadDashboard} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("link", { name })).toHaveAttribute("href", target);
    expect(await screen.findByRole("link", { name })).toHaveClass("home-sales-report-link");
  });

  it("uses a green brand primary and explicit green active nav wash", () => {
    const stylesheet = readAppStyles();
    expect(stylesheet).toMatch(/--primary:\s*oklch\(0\.52 0\.14 150\)/);
    expect(stylesheet).toMatch(/--primary:\s*oklch\(0\.58 0\.13 150\)/);
    expect(stylesheet).toMatch(/--nav-active-bg:\s*oklch\([^)]*150\)/);
    expect(stylesheet).toMatch(/--nav-active-fg:\s*oklch\([^)]*150\)/);
    expect(stylesheet).toMatch(/\.sidebar-link\.active\s*\{[^}]*var\(--nav-active-bg\)/s);
    expect(stylesheet).toMatch(/\.workspace-soft-link\.active\s*\{[^}]*var\(--nav-active-bg\)/s);
    expect(stylesheet).not.toMatch(/--primary:\s*oklch\([^)]*250\)/);
  });

  it("uses explicit green selection washes instead of primary color-mix", () => {
    const stylesheet = readAppStyles();
    expect(stylesheet).toMatch(/--selection-bg:\s*oklch\([^)]*150\)/);
    expect(stylesheet).toMatch(/--selection-bg-strong:\s*oklch\([^)]*150\)/);
    expect(stylesheet).toMatch(/\.report-tabs button\.active[\s\S]*?background:\s*var\(--selection-bg-strong\)/);
    expect(stylesheet).toMatch(/\.meat-price-product-list > button\.selected[\s\S]*?background:\s*var\(--selection-bg\)/);
    expect(stylesheet).not.toMatch(/background:\s*color-mix\(in oklch,\s*var\(--primary\)\s+\d+%\,\s*var\(--card\)\)/);
    expect(stylesheet).toMatch(/--card:\s*oklch\(1 0 150\)/);
    expect(stylesheet).toMatch(/--popover:\s*oklch\(1 0 150\)/);
    expect(stylesheet).toMatch(/\.shop-order-product-grid article\s*\{[^}]*background:\s*var\(--secondary\)/);
    expect(stylesheet).toMatch(/\.home-sales-card-list\s*\{/);
    expect(stylesheet).toMatch(/\.home-sales-table thead \.home-sales-total-col[\s\S]*?color:\s*var\(--foreground\)/);
    expect(stylesheet).toMatch(/\.home-sales-table\.is-this-month-table td[\s\S]*?font-weight:\s*860/);
    expect(stylesheet).toMatch(/@media \(max-width: 980px\)[\s\S]*\.home-sales-table-wrap\s*\{[^}]*display:\s*none/);
    expect(stylesheet).toMatch(/@media \(max-width: 980px\)[\s\S]*\.home-sales-card-list\s*\{[^}]*display:\s*grid/);
    expect(stylesheet).toMatch(/@media \(max-width: 980px\)[\s\S]*\.home-sales-panel-actions\s*\{[^}]*display:\s*contents/);
    expect(stylesheet).toMatch(/@media \(max-width: 980px\)[\s\S]*\.home-sales-report-link\s*\{[^}]*justify-self:\s*end/);
    expect(stylesheet).not.toMatch(/@media \(max-width: 780px\)[\s\S]*\.home-sales-panel-header a[\s\S]*align-self:\s*flex-start/);
  });
});
