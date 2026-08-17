import { describe, expect, it } from "vitest";

import { addCalendarDays } from "@/lib/deliveries";
import {
  UNASSIGNED_FLEET_ID,
  factoryVisibleDates,
  filterDispatchRows,
  fleetBadgeChar,
  groupDeliveriesByDate,
  hongKongDateKey,
} from "@/lib/factory-board";
import type { DeliveryListItem } from "@/lib/deliveries";

function item(
  overrides: Partial<DeliveryListItem> & Pick<DeliveryListItem, "id">,
): DeliveryListItem {
  return {
    orderId: null,
    orderNumber: null,
    customerName: null,
    customerPhone: null,
    address: null,
    deliveryAt: null,
    deliveryTime: null,
    districtName: null,
    motorcadeId: null,
    motorcadeName: null,
    shippingMethodId: null,
    shippingMethodName: null,
    basicFee: null,
    totalFee: null,
    surchargeAmount: null,
    surcharges: [],
    grandTotal: null,
    deliveryStatus: null,
    takenAt: null,
    fulfilledAt: null,
    imageReferences: [],
    ...overrides,
  };
}

describe("factory board helpers", () => {
  it("builds a three-day window", () => {
    expect(factoryVisibleDates("2026-08-17")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
    ]);
    expect(addCalendarDays("2026-08-17", -1)).toBe("2026-08-16");
  });

  it("groups deliveries onto Hong Kong calendar days", () => {
    const grouped = groupDeliveriesByDate(
      [
        item({
          id: "late",
          deliveryAt: "2026-08-17T15:45:00.000Z",
          deliveryTime: "12:45",
        }),
        item({
          id: "early",
          deliveryAt: "2026-08-17T03:30:00.000Z",
          deliveryTime: "11:30",
        }),
        item({
          id: "next",
          deliveryAt: "2026-08-18T02:00:00.000Z",
          deliveryTime: "10:00",
        }),
      ],
      ["2026-08-17", "2026-08-18", "2026-08-19"],
    );

    expect(hongKongDateKey("2026-08-17T03:30:00.000Z")).toBe("2026-08-17");
    expect(hongKongDateKey("2026-08-17T16:00:00.000Z")).toBe("2026-08-18");
    expect(grouped["2026-08-17"]?.map((row) => row.id)).toEqual([
      "early",
      "late",
    ]);
    expect(grouped["2026-08-18"]?.map((row) => row.id)).toEqual(["next"]);
    expect(grouped["2026-08-19"]).toEqual([]);
  });

  it("filters the dispatch sheet by date and fleet, including unassigned", () => {
    const rows = [
      item({
        id: "assigned",
        deliveryAt: "2026-08-18T02:00:00.000Z",
        motorcadeId: "team-1",
      }),
      item({
        id: "open",
        deliveryAt: "2026-08-18T02:00:00.000Z",
        motorcadeId: null,
      }),
      item({
        id: "other-day",
        deliveryAt: "2026-08-17T02:00:00.000Z",
        motorcadeId: "team-1",
      }),
    ];

    expect(
      filterDispatchRows(rows, "2026-08-18", "team-1").map((row) => row.id),
    ).toEqual(["assigned"]);
    expect(
      filterDispatchRows(rows, "2026-08-18", UNASSIGNED_FLEET_ID).map(
        (row) => row.id,
      ),
    ).toEqual(["open"]);
    expect(fleetBadgeChar("Sun-Line")).toBe("S");
    expect(fleetBadgeChar("宏記")).toBe("宏");
  });
});
