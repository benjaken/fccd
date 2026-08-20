import { describe, expect, it } from "vitest";

import { addCalendarDays } from "@/lib/deliveries";
import {
  UNASSIGNED_FLEET_ID,
  buildFactoryDishLabelHtml,
  factoryMultiDayPrintedDate,
  factoryMultiDayRangeLabels,
  factoryVisibleDates,
  factoryOrderPrintStatus,
  filterDispatchRows,
  fleetBadgeChar,
  fleetBadgeForDelivery,
  formatFactoryLineLabel,
  groupDeliveriesByDate,
  hongKongDateKey,
  mapFactoryFleet,
  mapFactoryMeatOrder,
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
  it("formats the compact Chinese multi-day print heading", () => {
    expect(
      factoryMultiDayRangeLabels("2026-08-01", "2026-08-20", true),
    ).toEqual({ start: "2026年08月1日", end: "20日" });
    expect(
      factoryMultiDayPrintedDate(
        new Date("2026-08-20T00:00:00+08:00"),
        "zh-HK",
      ),
    ).toBe("08月20日 (星期四)");
  });

  it("maps a factory meat delivery note onto its Hong Kong delivery day", () => {
    const result = mapFactoryMeatOrder({
      id: "meat-1",
      order_number: "R - 202608 - 6",
      shipping_at: "2026-08-13T16:00:00.000Z",
      order_at: null,
      print_at: "2026-08-14T01:00:00.000Z",
      meat_customers: { name: "桂花小幸 TKO" },
    });

    expect(result.factorySource).toBe("meat");
    expect(result.factoryPrintStatus).toBe("complete");
    expect(result.orderNumber).toBe("R - 202608 - 6");
    expect(result.customerName).toBe("桂花小幸 TKO");
    expect(hongKongDateKey(result.deliveryAt)).toBe("2026-08-14");
  });

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
    expect(
      mapFactoryFleet({
        id: "team-sun",
        name: "Sun-Line",
        short_name: "宏",
      }),
    ).toEqual({
      id: "team-sun",
      name: "Sun-Line",
      shortName: "宏",
    });
    expect(
      fleetBadgeForDelivery(
        { motorcadeId: "team-sun", motorcadeName: "Sun-Line" },
        [{ id: "team-sun", name: "Sun-Line", shortName: "宏" }],
      ),
    ).toBe("宏");
  });

  it("formats factory dish cards with content prefix and quantity", () => {
    expect(
      formatFactoryLineLabel({
        productName: "拿破崙肉丸意粉",
        content: "雙格",
        quantity: 8,
      }),
    ).toBe("(雙格) 拿破崙肉丸意粉 (x 8)");
    expect(
      formatFactoryLineLabel({
        productName: "檸檬茶",
        content: "(23包) 檸檬茶",
        quantity: 23,
      }),
    ).toBe("(23包) 檸檬茶 (x 23)");
  });

  it("only marks an order complete when every active label is printed", () => {
    expect(
      factoryOrderPrintStatus({
        factoryPrintDate: null,
        lines: [
          { isPrinted: true, isVoid: false },
          { isPrinted: true, isVoid: false },
        ],
      }),
    ).toBe("complete");
    expect(
      factoryOrderPrintStatus({
        factoryPrintDate: null,
        lines: [
          { isPrinted: true, isVoid: false },
          { isPrinted: false, isVoid: false },
        ],
      }),
    ).toBe("incomplete");
  });

  it("requires reprinting when dishes change after the last full print", () => {
    expect(
      factoryOrderPrintStatus({
        factoryPrintDate: "2026-08-20T02:00:00.000Z",
        lines: [
          {
            isPrinted: true,
            isVoid: false,
            modifiedAt: "2026-08-20T02:01:00.000Z",
          },
        ],
      }),
    ).toBe("needs-reprint");
    expect(
      factoryOrderPrintStatus({
        factoryPrintDate: "2026-08-20T02:00:00.000Z",
        lines: [
          {
            isPrinted: true,
            isVoid: false,
            modifiedAt: "2026-08-20T01:59:00.000Z",
          },
          {
            isPrinted: false,
            isVoid: true,
            modifiedAt: "2026-08-20T02:01:00.000Z",
          },
        ],
      }),
    ).toBe("needs-reprint");
  });

  it("builds an escaped factory dish label for QZ Tray", () => {
    const html = buildFactoryDishLabelHtml({
      orderNumber: "B-1540",
      dish: "雞扒 <沙律>",
      quantity: "5",
      remarks: ["走醬 & 分開"],
      deliveryDate: "2026-08-20",
      deliveryTime: "10:15",
      packingNote: "木盒",
    });

    expect(html).toContain("雞扒 &lt;沙律&gt;");
    expect(html).toContain("走醬 &amp; 分開");
    expect(html).toContain("× 5");
    expect(html).toContain("#B-1540");
  });
});
