import { describe, expect, it } from "vitest";

import {
  buildKitchenCalendarGrid,
  hongKongDayKey,
  kitchenCalendarDayKey,
  kitchenCalendarOrderHref,
  kitchenCalendarRangeIso,
  kitchenCalendarReturnPath,
  kitchenCalendarStatus,
  kitchenCalendarTone,
  parseKitchenCalendarMonth,
  shiftKitchenCalendarMonth,
} from "@/lib/kitchen-calendar";

describe("Kitchen calendar date helpers", () => {
  it("builds a Sunday-start August 2026 grid covering 26 Jul to 5 Sep", () => {
    const days = buildKitchenCalendarGrid(2026, 8, "2026-08-17");

    expect(days).toHaveLength(42);
    expect(days[0]).toMatchObject({
      key: "2026-07-26",
      inMonth: false,
      isToday: false,
    });
    expect(days[6]).toMatchObject({
      key: "2026-08-01",
      inMonth: true,
    });
    expect(days[22]).toMatchObject({
      key: "2026-08-17",
      inMonth: true,
      isToday: true,
    });
    expect(days[41]).toMatchObject({
      key: "2026-09-05",
      inMonth: false,
    });
  });

  it("queries Hong Kong midnight bounds for the visible grid", () => {
    const range = kitchenCalendarRangeIso(
      buildKitchenCalendarGrid(2026, 8, "2026-08-17"),
    );

    expect(range).toEqual({
      start: "2026-07-25T16:00:00.000Z",
      end: "2026-09-05T16:00:00.000Z",
    });
  });

  it("places orders on factory date, falling back to delivery date", () => {
    expect(
      kitchenCalendarDayKey({
        factoryDate: "2026-08-16T16:00:00.000Z",
        deliveryAt: "2026-08-17T02:00:00.000Z",
      }),
    ).toBe("2026-08-17");
    expect(
      kitchenCalendarDayKey({
        factoryDate: null,
        deliveryAt: "2026-08-11T16:00:00.000Z",
      }),
    ).toBe("2026-08-12");
    expect(hongKongDayKey("2026-08-16T16:00:00.000Z")).toBe("2026-08-17");
  });

  it("marks unpaid orders red and only explicitly unsent orders amber", () => {
    expect(
      kitchenCalendarTone({ isSentToFactory: true, outstanding: 120 }),
    ).toBe("red");
    expect(
      kitchenCalendarTone({ isSentToFactory: false, outstanding: 0 }),
    ).toBe("amber");
    expect(
      kitchenCalendarTone({ isSentToFactory: null, outstanding: 0 }),
    ).toBe("blue");
    expect(
      kitchenCalendarTone({ isSentToFactory: true, outstanding: 0 }),
    ).toBe("blue");
  });

  it("uses the same delivery status as order details", () => {
    expect(
      kitchenCalendarStatus({
        deliveryStatus: "已送達",
        isSentToFactory: null,
      }),
    ).toBe("completed");
    expect(
      kitchenCalendarStatus({
        deliveryStatus: "己送達",
        isSentToFactory: true,
      }),
    ).toBe("completed");
    expect(
      kitchenCalendarStatus({
        deliveryStatus: "未派車隊",
        isSentToFactory: false,
      }),
    ).toBe("awaitingDriver");
    expect(
      kitchenCalendarStatus({
        deliveryStatus: null,
        isSentToFactory: true,
      }),
    ).toBe("preparing");
    expect(
      kitchenCalendarStatus({
        deliveryStatus: null,
        isSentToFactory: null,
      }),
    ).toBe("confirmed");
  });

  it("parses and shifts month keys", () => {
    expect(
      parseKitchenCalendarMonth("2026-08", new Date("2026-01-01T00:00:00.000Z")),
    ).toEqual({
      year: 2026,
      month: 8,
    });
    expect(parseKitchenCalendarMonth("nope", new Date("2026-08-17T04:00:00Z"))).toEqual({
      year: 2026,
      month: 8,
    });
    expect(shiftKitchenCalendarMonth(2026, 1, -1)).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it("keeps a return path from order details back to the serving calendar", () => {
    expect(kitchenCalendarOrderHref("order-amber", "2026-08")).toBe(
      "/orders/order-amber?from=calendar&month=2026-08",
    );
    expect(kitchenCalendarReturnPath("calendar", "2026-08")).toBe(
      "/kitchen/calendar?month=2026-08",
    );
    expect(kitchenCalendarReturnPath("calendar", "nope")).toBe(
      "/kitchen/calendar",
    );
    expect(kitchenCalendarReturnPath("orders", "2026-08")).toBeNull();
  });
});
