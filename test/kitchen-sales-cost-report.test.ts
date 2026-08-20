import { describe, expect, it } from "vitest";

import {
  buildKitchenSalesCostYearSummary,
  defaultKitchenSalesCostYears,
  kitchenSalesCostCategories,
  kitchenSalesCostYears,
  type KitchenSalesCostReportRow,
} from "@/lib/kitchen-sales-cost-report";

const rows: KitchenSalesCostReportRow[] = [
  { year: 2025, month: 1, category: "Sales", amount: 1000 },
  { year: 2025, month: 1, category: "Google", amount: 100 },
  { year: 2025, month: 1, category: "Food cost", amount: 250 },
  { year: 2025, month: 2, category: "Sales", amount: 800 },
  { year: 2025, month: 2, category: "Google", amount: 80 },
  { year: 2026, month: 1, category: "Sales", amount: 1200 },
];

describe("central kitchen sales and cost report", () => {
  it("derives chronological years and prefers 2025 and 2026 when available", () => {
    expect(kitchenSalesCostYears(rows)).toEqual([2025, 2026]);
    expect(defaultKitchenSalesCostYears([2027, 2026, 2025, 2024])).toEqual([2025, 2026]);
    expect(defaultKitchenSalesCostYears([2023, 2024])).toEqual([2023, 2024]);
  });

  it("keeps standard categories in report order and calculates net totals", () => {
    const categories = kitchenSalesCostCategories(rows);
    expect(categories.slice(0, 2)).toEqual(["Google", "Food cost"]);

    const summary = buildKitchenSalesCostYearSummary(rows, 2025, categories);
    expect(summary.sales[0]).toBe(1000);
    expect(summary.costs.Google[0]).toBe(100);
    expect(summary.costs["Food cost"][0]).toBe(250);
    expect(summary.net).toEqual([650, 720, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(summary.totalSales).toBe(1800);
    expect(summary.totalCosts).toBe(430);
    expect(summary.totalNet).toBe(1370);
  });
});
