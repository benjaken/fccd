import { describe, expect, it } from "vitest";

import {
  buildFestivalOrderMonthSummaries,
  buildFestivalOrderYearSummaries,
  buildFestivalOrderYearTotals,
  defaultFestivalOrderGenerationYears,
  festivalOrderGenerationCsv,
  festivalOrderGenerationFestivals,
  festivalOrderGenerationYears,
  yearOverYearChange,
  type FestivalOrderGenerationRow,
} from "@/lib/festival-order-generation-report";

const rows: FestivalOrderGenerationRow[] = [
  { festivalKey: "中秋節", festivalLabel: "中秋節", year: 2023, month: 9, orderCount: 54 },
  { festivalKey: "中秋節", festivalLabel: "中秋節", year: 2024, month: 8, orderCount: 5 },
  { festivalKey: "中秋節", festivalLabel: "中秋節", year: 2024, month: 9, orderCount: 57 },
  { festivalKey: "中秋節", festivalLabel: "中秋節", year: 2025, month: 9, orderCount: 35 },
  { festivalKey: "中秋節", festivalLabel: "中秋節", year: 2025, month: 10, orderCount: 35 },
  { festivalKey: "父親節", festivalLabel: "父親節", year: 2024, month: 6, orderCount: 24 },
  { festivalKey: "父親節", festivalLabel: "父親節", year: 2025, month: 6, orderCount: 22 },
  { festivalKey: "復活節", festivalLabel: "復活節", year: 2024, month: 3, orderCount: 5 },
];

describe("festival order generation report", () => {
  it("orders festivals by the kitchen dictionary and keeps every year from 2022", () => {
    expect(festivalOrderGenerationFestivals(rows)).toEqual([
      "中秋節",
      "復活節",
      "父親節",
    ]);
    expect(festivalOrderGenerationYears(rows)).toEqual([2023, 2024, 2025]);
    expect(defaultFestivalOrderGenerationYears([2021, 2025, 2023, 2024])).toEqual([
      2025, 2023, 2024,
    ]);
  });

  it("compares each selected year with the previous selected year", () => {
    expect(yearOverYearChange(70, 62)).toEqual({
      delta: 8,
      percent: (8 / 62) * 100,
    });
    expect(yearOverYearChange(5, 0)).toEqual({ delta: 5, percent: null });
    expect(yearOverYearChange(12, null)).toEqual({ delta: null, percent: null });

    const summaries = buildFestivalOrderYearSummaries(rows, [2024, 2025]);
    expect(summaries.map((summary) => summary.festivalLabel)).toEqual([
      "中秋節",
      "復活節",
      "父親節",
    ]);
    const midAutumn = summaries[0];
    expect(midAutumn.cells[0]).toMatchObject({
      year: 2024,
      orderCount: 62,
      previousYear: null,
      delta: null,
    });
    expect(midAutumn.cells[1]).toMatchObject({
      year: 2025,
      orderCount: 70,
      previousYear: 2024,
      delta: 8,
    });
    expect(midAutumn.cells[1].percent).toBeCloseTo((8 / 62) * 100);

    const totals = buildFestivalOrderYearTotals(summaries, [2024, 2025]);
    expect(totals[0].orderCount).toBe(91);
    expect(totals[1].orderCount).toBe(92);
    expect(totals[1].delta).toBe(1);
  });

  it("builds monthly year-over-year cells for one festival and exports csv", () => {
    const monthly = buildFestivalOrderMonthSummaries(rows, "中秋節", [2024, 2025]);
    expect(monthly[7].cells.map((cell) => cell.orderCount)).toEqual([5, 0]);
    expect(monthly[8].cells.map((cell) => cell.orderCount)).toEqual([57, 35]);
    expect(monthly[9].cells[1]).toMatchObject({
      year: 2025,
      orderCount: 35,
      delta: 35,
    });

    const summaries = buildFestivalOrderYearSummaries(rows, [2024, 2025]);
    const csv = festivalOrderGenerationCsv(
      summaries,
      buildFestivalOrderYearTotals(summaries, [2024, 2025]),
    );
    expect(csv).toContain("節日");
    expect(csv).toContain("中秋節");
    expect(csv).toContain("合計");
    expect(csv).toContain("2025較2024");
  });
});
