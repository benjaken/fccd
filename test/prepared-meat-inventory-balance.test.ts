import { describe, expect, it } from "vitest";

import {
  canSelectPreparedMeatShippingMethod,
  canShipRawMeatOnPreparedOutbound,
  coercePreparedMeatQuantityInput,
  currentHongKongYear,
  formatPreparedMeatOrderNumber,
  hongKongYearBounds,
  hongKongYearMonthKey,
  nextPreparedMeatOrderSequence,
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

describe("prepared meat outbound helpers", () => {
  it("allows shipping method only for 桂花小幸 customers", () => {
    expect(canSelectPreparedMeatShippingMethod("桂花小幸 YLP")).toBe(true);
    expect(canSelectPreparedMeatShippingMethod("C0022 - 桂花小幸 TKO")).toBe(
      true,
    );
    expect(canSelectPreparedMeatShippingMethod("Room R - 到會")).toBe(false);
    expect(canSelectPreparedMeatShippingMethod(null)).toBe(false);
  });

  it("allows raw meat outbound only for 到會 and 凍肉製作", () => {
    expect(canShipRawMeatOnPreparedOutbound("Room R - 到會")).toBe(true);
    expect(canShipRawMeatOnPreparedOutbound("Room R - 凍肉製作")).toBe(true);
    expect(canShipRawMeatOnPreparedOutbound("桂花小幸 YLP")).toBe(false);
    expect(canShipRawMeatOnPreparedOutbound(null)).toBe(false);
  });

  it("builds the next R - YYYYMM - n document number", () => {
    expect(
      formatPreparedMeatOrderNumber(
        "202608",
        nextPreparedMeatOrderSequence(["R - 202608 - 7", "R - 202608 - 2"]),
      ),
    ).toBe("R - 202608 - 8");
  });

  it("keeps only numeric quantity input", () => {
    expect(coercePreparedMeatQuantityInput("勝多負少")).toBe("");
    expect(coercePreparedMeatQuantityInput("12包")).toBe("12");
    expect(coercePreparedMeatQuantityInput("1.2.3")).toBe("1.23");
    expect(coercePreparedMeatQuantityInput("１．５")).toBe("1.5");
    expect(coercePreparedMeatQuantityInput("2")).toBe("2");
  });
});
