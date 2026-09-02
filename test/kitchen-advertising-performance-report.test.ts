import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildKitchenAdvertisingPerformanceYearSummaries,
  defaultKitchenAdvertisingPerformanceYears,
  kitchenAdvertisingPerformanceChannels,
  kitchenAdvertisingPerformanceFestivals,
  kitchenAdvertisingPerformanceYears,
  type KitchenAdvertisingPerformanceRow,
} from "@/lib/kitchen-advertising-performance-report";

const rows: KitchenAdvertisingPerformanceRow[] = [
  { mode: "festival", segmentKey: "父親節", segmentLabel: "父親節", year: 2025, channel: "Catering", metric: "Sales", amount: 10000 },
  { mode: "festival", segmentKey: "父親節", segmentLabel: "父親節", year: 2025, channel: "Catering", metric: "Google", amount: 1000 },
  { mode: "festival", segmentKey: "父親節", segmentLabel: "父親節", year: 2025, channel: "Kitchen", metric: "Sales", amount: 5000 },
  { mode: "festival", segmentKey: "父親節", segmentLabel: "父親節", year: 2024, channel: "Catering", metric: "Sales", amount: 8000 },
  { mode: "festival", segmentKey: "父親節", segmentLabel: "父親節", year: 2021, channel: "Catering", metric: "Sales", amount: 4000 },
  { mode: "non_peak", segmentKey: "1", segmentLabel: "1月 non-peak", year: 2025, channel: "Catering", metric: "Sales", amount: 7000 },
];

describe("central kitchen advertising performance report", () => {
  it("uses a compact year-aligned table without rendering charts", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const component = readFileSync(
      path.resolve(process.cwd(), "src/components/KitchenAdvertisingPerformanceReportPage.tsx"),
      "utf8",
    );
    const pageRule = stylesheet.match(
      /\.kitchen-advertising-performance-page\s*\{([^}]+)\}/,
    )?.[1];
    const sectionRule = stylesheet.match(
      /\.kitchen-advertising-performance-section\s*\{([^}]+)\}/,
    )?.[1];
    const tableRule = stylesheet.match(
      /\.kitchen-advertising-performance-table\s*\{([^}]+)\}/,
    )?.[1];

    expect(pageRule).toContain("--primary: var(--advertising-green)");
    expect(pageRule).toContain("--selection-bg: #edf8f2");
    expect(pageRule).toContain("--advertising-side-surface:");
    expect(pageRule).toContain(
      "--report-table-header-bg: var(--advertising-table-blue)",
    );
    expect(sectionRule).toContain("grid-template-columns: 10.5rem minmax(0, 1fr)");
    expect(tableRule).toContain("table-layout: fixed");
    expect(stylesheet).toMatch(
      /\.kitchen-advertising-performance-page \.kitchen-advertising-performance-table td,[\s\S]*?background:\s*#fff/,
    );
    expect(component).toContain("data-advertising-year={summary.year}");
    expect(component).not.toContain("AdvertisingPerformanceChart");
    expect(component).not.toContain("kitchen-advertising-performance-chart-panel");

    for (const reportComponent of [
      "KitchenSalesCostReportPage.tsx",
      "KitchenChannelSalesReportPage.tsx",
      "KitchenProductSalesReportPage.tsx",
      "KitchenAdvertisingPerformanceReportPage.tsx",
      "ReportsPage.tsx",
    ]) {
      expect(
        readFileSync(
          path.resolve(process.cwd(), "src/components", reportComponent),
          "utf8",
        ),
        reportComponent,
      ).not.toContain("report-tabs");
    }
  });

  it("uses dictionary festival order and selects every available year by default", () => {
    expect(kitchenAdvertisingPerformanceFestivals(rows, ["中秋節", "父親節"])).toEqual([
      "中秋節",
      "父親節",
    ]);
    expect(defaultKitchenAdvertisingPerformanceYears([2021, 2025, 2023, 2024])).toEqual([
      2025,
      2023,
      2024,
    ]);
    expect(kitchenAdvertisingPerformanceYears(rows, "festival", "父親節")).toEqual([2024, 2025]);
  });

  it("groups sales and advertising costs by year and channel", () => {
    const summaries = buildKitchenAdvertisingPerformanceYearSummaries(
      rows,
      "festival",
      "父親節",
      [2024, 2025],
      ["Catering", "Kitchen"],
    );

    expect(summaries[0]).toMatchObject({ year: 2024, totalSales: 8000 });
    expect(summaries[1]).toMatchObject({ year: 2025, totalSales: 15000 });
    expect(summaries[1].cells.Catering).toEqual({ sales: 10000, costs: { Google: 1000 } });
    expect(summaries[1].cells.Kitchen).toEqual({ sales: 5000, costs: {} });
  });

  it("derives channel options from report data", () => {
    expect(kitchenAdvertisingPerformanceChannels([
      ...rows,
      { mode: "festival", segmentKey: "父親節", segmentLabel: "父親節", year: 2025, channel: "Custom", metric: "Sales", amount: 1 },
    ])).toEqual([
      "Catering",
      "Custom",
      "Kitchen",
    ]);
  });
});
