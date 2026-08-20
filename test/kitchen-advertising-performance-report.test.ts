import { describe, expect, it } from "vitest";

import {
  buildKitchenAdvertisingPerformanceYearSummaries,
  defaultKitchenAdvertisingPerformanceYears,
  KITCHEN_ADVERTISING_FESTIVAL_OPTIONS,
  kitchenAdvertisingPerformanceChannels,
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
  it("keeps the requested festival options and selects every available year by default", () => {
    expect(KITCHEN_ADVERTISING_FESTIVAL_OPTIONS).toEqual([
      "父親節",
      "中秋節",
      "母親節",
      "Xmas + 冬至",
      "農曆新年",
      "復活節",
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

  it("preserves the screenshot channel order before custom channels", () => {
    expect(kitchenAdvertisingPerformanceChannels([
      ...rows,
      { mode: "festival", segmentKey: "父親節", segmentLabel: "父親節", year: 2025, channel: "Custom", metric: "Sales", amount: 1 },
    ]).slice(0, 8)).toEqual([
      "Catering",
      "Kitchen",
      "Express",
      "Cuisine",
      "Delivery",
      "Residential",
      "HK lunch box",
      "HK Party Food",
    ]);
  });
});
