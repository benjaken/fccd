import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { RestaurantSalesSalaryReport } from "@/components/RestaurantSalesSalaryReport";
import i18n from "@/i18n";
import {
  buildRestaurantSalesSalaryTable,
  defaultSalesSalaryMonths,
  type RestaurantSalesSalaryRow,
} from "@/lib/restaurant-sales-salary-report";

const restaurants = [
  { id: "ylp", name: "YLP 桂花小幸 元朗" },
  { id: "tko", name: "TKO 桂花小幸 將軍澳" },
];

const rows: RestaurantSalesSalaryRow[] = [
  {
    monthStart: "2026-01-01",
    restaurantId: "ylp",
    restaurantName: restaurants[0].name,
    sales: 1_131_649,
    salary: 210_000,
    salaryToSalesPercent: 18.56,
  },
  {
    monthStart: "2026-01-01",
    restaurantId: "tko",
    restaurantName: restaurants[1].name,
    sales: 1_414_835.5,
    salary: null,
    salaryToSalesPercent: null,
  },
];

describe("Restaurant sales and salary report", () => {
  it("defaults from January through the current month", () => {
    expect(defaultSalesSalaryMonths(new Date(2026, 7, 20))).toEqual({
      startMonth: "2026-01",
      endMonth: "2026-08",
    });
  });

  it("uses the authoritative daily control total instead of adding sales breakdowns", () => {
    const migration = readFileSync(
      "supabase/migrations/20260821005600_fix_restaurant_sales_salary_revenue.sql",
      "utf8",
    );
    expect(migration).toContain("and daily.is_control_total");
    expect(migration).not.toContain("and not daily.is_control_total");
  });

  it("builds the month and restaurant lookup used by the wide table", () => {
    const report = buildRestaurantSalesSalaryTable(rows, restaurants);
    expect(report.months).toEqual(["2026-01-01"]);
    expect(report.value("2026-01-01", "ylp")).toMatchObject({
      sales: 1_131_649,
      salary: 210_000,
    });
    expect(report.value("2026-01-01", "tko")?.salary).toBeNull();
  });

  it("selects all restaurants, loads the year-to-date range, and renders missing salary data", async () => {
    await i18n.changeLanguage("zh-HK");
    const loadReport = vi.fn().mockResolvedValue(rows);
    render(
      <RestaurantSalesSalaryReport
        loadRestaurants={vi.fn().mockResolvedValue(restaurants)}
        loadReport={loadReport}
      />,
    );

    expect(await screen.findByText("$1,131,649.00")).toBeInTheDocument();
    expect(screen.getByText("$210,000.00")).toBeInTheDocument();
    expect(screen.getByText("18.56%")).toBeInTheDocument();
    expect(screen.getByText("未有薪金資料")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>(
          ".restaurant-sales-salary-table-scroll",
        )?.style.maxHeight,
      ).toMatch(/px$/),
    );
    expect(screen.getByLabelText("報告開始月份")).toHaveValue(
      `${new Date().getFullYear()}-01`,
    );
    await waitFor(() =>
      expect(loadReport).toHaveBeenCalledWith(
        expect.objectContaining({
          startMonth: `${new Date().getFullYear()}-01`,
          restaurantIds: ["ylp", "tko"],
        }),
      ),
    );
  });

  it("does not show summary-card skeletons while loading", async () => {
    await i18n.changeLanguage("zh-HK");
    render(
      <RestaurantSalesSalaryReport
        loadRestaurants={vi.fn().mockResolvedValue(restaurants)}
        loadReport={vi.fn(() => new Promise(() => undefined))}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "正在載入銷售及薪金報告",
      ),
    );
    expect(document.querySelector(".shop-order-summary")).not.toBeInTheDocument();
    expect(
      document.querySelector(".content-skeleton-report-table"),
    ).toBeInTheDocument();
  });

  it("restores the default range and all restaurants when reset", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    render(
      <RestaurantSalesSalaryReport
        loadRestaurants={vi.fn().mockResolvedValue(restaurants)}
        loadReport={vi.fn().mockResolvedValue(rows)}
      />,
    );

    const start = await screen.findByLabelText("報告開始月份");
    await user.clear(start);
    await user.type(start, "2025-03");
    await user.click(screen.getByRole("button", { name: "重設" }));
    expect(start).toHaveValue(`${new Date().getFullYear()}-01`);
  });
});
