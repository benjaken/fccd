import { describe, expect, it } from "vitest";

import {
  addDays,
  buildKitchenCostWeeks,
  formatWeekRange,
  isMonday,
  previousCompleteWeekStart,
} from "@/lib/kitchen-cost-input";

describe("kitchen weekly cost dates", () => {
  it("defaults to the previous complete Monday in Hong Kong", () => {
    expect(previousCompleteWeekStart(new Date("2026-08-19T04:00:00Z"))).toBe(
      "2026-08-10",
    );
  });

  it("builds six consecutive completed weeks from newest to oldest", () => {
    expect(buildKitchenCostWeeks("2026-08-10")).toEqual([
      { start: "2026-08-10", end: "2026-08-16" },
      { start: "2026-08-03", end: "2026-08-09" },
      { start: "2026-07-27", end: "2026-08-02" },
      { start: "2026-07-20", end: "2026-07-26" },
      { start: "2026-07-13", end: "2026-07-19" },
      { start: "2026-07-06", end: "2026-07-12" },
    ]);
  });

  it("only accepts Monday and derives Sunday", () => {
    expect(isMonday("2026-08-10")).toBe(true);
    expect(isMonday("2026-08-11")).toBe(false);
    expect(addDays("2026-08-10", 6)).toBe("2026-08-16");
    expect(formatWeekRange({ start: "2026-08-10", end: "2026-08-16" })).toContain(
      "2026",
    );
  });
});
