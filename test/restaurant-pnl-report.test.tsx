import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { RestaurantPnlReport } from "@/components/RestaurantPnlReport";
import i18n from "@/i18n";
import {
  buildRestaurantPnlReport,
  defaultRestaurantPnlMonths,
  findDefaultPnlRestaurant,
  type RestaurantPnlRow,
} from "@/lib/restaurant-pnl-report";

const restaurants = [
  { id: "ylp", name: "YLP 桂花小幸 元朗" },
  { id: "tko", name: "TKO 桂花小幸 將軍澳" },
];

const base = {
  monthStart: "2026-01-01",
  restaurantId: "tko",
  restaurantName: restaurants[1].name,
  sales: 1_227_313.3,
  openingStock: 10_000,
  purchases: 40_000,
  closingStock: 15_000,
};

const rows: RestaurantPnlRow[] = [
  {
    ...base,
    categoryKey: "staff",
    categoryName: "員工成本",
    categoryOrder: 2,
    itemKey: "salary",
    itemName: "員工薪金",
    itemOrder: 1,
    amount: 384_552,
  },
  {
    ...base,
    categoryKey: "staff",
    categoryName: "員工成本",
    categoryOrder: 2,
    itemKey: "mpf",
    itemName: "員工強積金",
    itemOrder: 2,
    amount: 10_883,
  },
];

describe("Restaurant P&L report", () => {
  it("defaults from January through the current month and prefers TKO", () => {
    expect(defaultRestaurantPnlMonths(new Date(2026, 7, 21))).toEqual({
      startMonth: "2026-01",
      endMonth: "2026-08",
    });
    expect(findDefaultPnlRestaurant(restaurants)?.id).toBe("tko");
    expect(findDefaultPnlRestaurant([{ id: "tko-zh", name: "將軍澳店" }])?.id).toBe("tko-zh");
  });

  it("calculates COS, category totals, gross profit, and net profit", () => {
    const report = buildRestaurantPnlReport(rows);
    expect(report.months[0]).toMatchObject({
      totalCostOfSales: 35_000,
      grossProfit: 1_192_313.3,
      totalExpenses: 395_435,
      netProfit: 796_878.3,
    });
    expect(report.categories[0].items.map((item) => item.name)).toEqual([
      "員工薪金",
      "員工強積金",
    ]);
  });

  it("merges Discount into promotion costs like the legacy P&L", () => {
    const report = buildRestaurantPnlReport([
      {
        ...base,
        categoryKey: "discount",
        categoryName: "Discount",
        categoryOrder: 1,
        itemKey: "discount-item",
        itemName: "Discount",
        itemOrder: 1,
        amount: 123_636.74,
      },
      {
        ...base,
        categoryKey: "promotion",
        categoryName: "推廣費用",
        categoryOrder: 7,
        itemKey: "advertising",
        itemName: "廣告費",
        itemOrder: 7,
        amount: 12_332.74,
      },
    ]);

    expect(report.categories).toHaveLength(1);
    expect(report.categories[0]).toMatchObject({ name: "推廣費用" });
    expect(report.categories[0].items.map((item) => item.name)).toEqual([
      "Discount",
      "廣告費",
    ]);
    expect(report.months[0].totalExpenses).toBeCloseTo(135_969.48);
  });

  it("uses blank separator rows instead of grey profit rows", () => {
    const stylesheet = readFileSync("src/index.css", "utf8");
    expect(stylesheet).toContain(
      ".restaurant-pnl-table tbody tr.restaurant-pnl-separator td",
    );
    expect(stylesheet).not.toMatch(
      /tr\.gross[^}]+background:\s*#dfe6ee/s,
    );
    expect(stylesheet).not.toMatch(
      /tr\.draft-profit[^}]+background:\s*#dfe6ee/s,
    );
  });

  it("loads TKO by default and renders the month-by-month P&L fields", async () => {
    await i18n.changeLanguage("en");
    const loadReport = vi.fn().mockResolvedValue(rows);
    render(
      <RestaurantPnlReport
        loadRestaurants={vi.fn().mockResolvedValue(restaurants)}
        loadReport={loadReport}
      />,
    );

    expect((await screen.findAllByText("$1,227,313.30")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Cost of Sales (COS)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Gross Profit")).toBeInTheDocument();
    expect(screen.getByText("Total Operation Cost")).toBeInTheDocument();
    expect(screen.getAllByText("Draft Profit").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$395,435.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("33.17%")).toBeInTheDocument();
    expect(screen.getByText("$796,878.30")).toBeInTheDocument();
    expect(screen.getByText("64.93%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: restaurants[1].name })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Report start month")).toHaveValue(`${new Date().getFullYear()}-01`);
    await waitFor(() =>
      expect(loadReport).toHaveBeenCalledWith(
        expect.objectContaining({
          startMonth: `${new Date().getFullYear()}-01`,
          restaurantId: "tko",
        }),
      ),
    );
  });

  it("resets the restaurant selection to TKO", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();
    render(
      <RestaurantPnlReport
        loadRestaurants={vi.fn().mockResolvedValue(restaurants)}
        loadReport={vi.fn().mockResolvedValue(rows)}
      />,
    );
    await user.click(await screen.findByRole("button", { name: restaurants[0].name }));
    expect(screen.getByRole("button", { name: restaurants[0].name })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: restaurants[1].name })).toHaveAttribute("aria-pressed", "true");
  });
});
