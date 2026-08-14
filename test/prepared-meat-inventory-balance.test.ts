import { describe, expect, it } from "vitest";

import {
  currentHongKongYear,
  hongKongYearBounds,
  hongKongYearMonthKey,
  preparedMeatMovementKind,
  preparedMeatYearOptions,
  withPreparedMeatRunningBalance,
} from "@/lib/prepared-meat-inventory";

describe("prepared meat running balance", () => {
  it("tracks package stock after each movement and lists newest first", () => {
    const result = withPreparedMeatRunningBalance(
      [
        {
          id: "b",
          movement_at: "2026-05-31T00:00:00.000Z",
          inbound_packages: 2,
          outbound_packages: null,
          remarks: null,
          bubble_created_at: null,
          created_at: "2026-05-31T00:00:00.000Z",
          meat_customer_id: null,
          meat_customers: null,
        },
        {
          id: "a",
          movement_at: "2026-05-01T00:00:00.000Z",
          inbound_packages: 3,
          outbound_packages: null,
          remarks: null,
          bubble_created_at: null,
          created_at: "2026-05-01T00:00:00.000Z",
          meat_customer_id: null,
          meat_customers: null,
        },
        {
          id: "c",
          movement_at: "2026-06-01T00:00:00.000Z",
          inbound_packages: null,
          outbound_packages: 1,
          remarks: null,
          bubble_created_at: null,
          created_at: "2026-06-01T00:00:00.000Z",
          meat_customer_id: "shop-1",
          meat_customers: { id: "shop-1", name: "桂花小幸 YLP" },
        },
      ],
      "五香牛腩",
    );

    expect(result.map((row) => row.id)).toEqual(["c", "b", "a"]);
    expect(result.map((row) => row.balancePackages)).toEqual([4, 5, 3]);
    expect(result[0]?.kind).toBe("outbound");
    expect(result[0]?.shopName).toBe("桂花小幸 YLP");
    expect(result[1]?.kind).toBe("inbound");
  });

  it("carries opening balance into the selected year", () => {
    const result = withPreparedMeatRunningBalance(
      [
        {
          id: "a",
          movement_at: "2026-01-10T00:00:00.000Z",
          inbound_packages: 2,
          outbound_packages: 0,
          remarks: null,
          bubble_created_at: null,
          created_at: "2026-01-10T00:00:00.000Z",
          meat_customer_id: null,
          meat_customers: null,
        },
      ],
      "五香牛腩",
      10,
    );
    expect(result[0]?.balancePackages).toBe(12);
  });
});

describe("prepared meat movement kind", () => {
  it("classifies inbound and outbound separately", () => {
    expect(preparedMeatMovementKind(4, null)).toBe("inbound");
    expect(preparedMeatMovementKind(null, 2)).toBe("outbound");
    expect(preparedMeatMovementKind(1, 1)).toBe("both");
    expect(preparedMeatMovementKind(null, null)).toBe("none");
  });
});

describe("prepared meat year helpers", () => {
  it("defaults year options to the current Hong Kong year", () => {
    const years = preparedMeatYearOptions(
      new Date("2026-08-14T04:00:00+08:00"),
    );
    expect(currentHongKongYear(new Date("2026-08-14T04:00:00+08:00"))).toBe(
      2026,
    );
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(2023);
  });

  it("builds Hong Kong year bounds and month keys", () => {
    expect(hongKongYearBounds(2026)).toEqual({
      start: "2026-01-01T00:00:00+08:00",
      end: "2027-01-01T00:00:00+08:00",
    });
    expect(hongKongYearMonthKey("2026-06-15T04:00:00.000Z")).toBe("2026-06");
  });
});
