import { describe, expect, it } from "vitest";

import {
  currentHongKongYear,
  hongKongYearBounds,
  hongKongYearMonthKey,
  inboundTotalAmount,
  quantityToKg,
  rawMeatYearOptions,
  roundTo,
  unitPriceToPerKg,
} from "@/lib/raw-meat-inventory";

// Lightweight pure-logic check mirroring src/lib/raw-meat-inventory.ts
function withRunningBalance(
  rows: Array<{
    id: string;
    inbound: number;
    outbound: number;
    at: string;
  }>,
  opening = 0,
) {
  const chronological = [...rows].sort((a, b) =>
    a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? -1 : 1,
  );
  let balance = opening;
  const computed = chronological.map((row) => {
    balance += row.inbound - row.outbound;
    return { id: row.id, balance };
  });
  return computed.reverse();
}

describe("raw meat running balance", () => {
  it("tracks stock after each movement and lists newest first", () => {
    const result = withRunningBalance([
      { id: "b", inbound: 2, outbound: 0, at: "2026-05-31" },
      { id: "a", inbound: 3, outbound: 0, at: "2026-05-01" },
      { id: "c", inbound: 0, outbound: 1, at: "2026-06-01" },
    ]);

    expect(result.map((row) => row.id)).toEqual(["c", "b", "a"]);
    expect(result.map((row) => row.balance)).toEqual([4, 5, 3]);
  });

  it("carries opening balance into the selected year", () => {
    const result = withRunningBalance(
      [{ id: "a", inbound: 2, outbound: 0, at: "2026-01-10" }],
      10,
    );
    expect(result[0]?.balance).toBe(12);
  });
});

describe("raw meat year helpers", () => {
  it("defaults year options to the current Hong Kong year", () => {
    const years = rawMeatYearOptions(new Date("2026-08-14T04:00:00+08:00"));
    expect(currentHongKongYear(new Date("2026-08-14T04:00:00+08:00"))).toBe(
      2026,
    );
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(2023);
  });

  it("builds Hong Kong year bounds", () => {
    expect(hongKongYearBounds(2026)).toEqual({
      start: "2026-01-01T00:00:00+08:00",
      end: "2027-01-01T00:00:00+08:00",
    });
  });
});

describe("raw meat inbound conversion", () => {
  it("converts catty price and quantity into kg and total", () => {
    const multiplier = 1.653;
    expect(roundTo(quantityToKg(3, multiplier) ?? 0, 4)).toBe(1.8149);
    expect(roundTo(unitPriceToPerKg(23, multiplier) ?? 0, 2)).toBe(38.02);
    expect(inboundTotalAmount(23, 3)).toBe(69);
  });
});
