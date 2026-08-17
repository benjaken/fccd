import { describe, expect, it } from "vitest";

import {
  buildDeliveryExportCsv,
  feeSharePercent,
  hongKongDateInputValue,
  hongKongMonthStart,
  mapDeliveryRow,
  nextCalendarDate,
  toDeliveryExportRow,
} from "@/lib/deliveries";

describe("delivery list helpers", () => {
  it("defaults the date range to the current Hong Kong month", () => {
    const now = new Date("2026-08-17T04:00:00+08:00");
    expect(hongKongDateInputValue(now)).toBe("2026-08-17");
    expect(hongKongMonthStart(now)).toBe("2026-08-01");
    expect(nextCalendarDate("2026-08-17")).toBe("2026-08-18");
  });

  it("maps nested order, fleet, method, and surcharge snapshots", () => {
    const item = mapDeliveryRow({
      id: "delivery-1",
      delivery_at: "2026-08-01T10:00:00+08:00",
      delivery_time: "18:00 - 19:00",
      ship_out_time: "18:00",
      delivery_status: "已送達",
      basic_fee: "90",
      total_fee: "140",
      taken_at: "2026-08-01T20:37:00+08:00",
      fulfilled_at: "2026-08-01T20:37:00+08:00",
      image_references: ["https://example.com/a.jpg"],
      motorcade_id: "team-1",
      shipping_method_id: null,
      orders: {
        id: "order-1",
        order_number: "6918",
        customer_name_snapshot: "Louis Chang 張",
        contact_number_a_snapshot: "90154004",
        shipping_address_snapshot: "青衣長康邨",
        shipping_method_id: "method-1",
        grand_total: "1286",
        shipping_methods: { display_name: "車邊交收", name: "curbside" },
      },
      delivery_districts: { name: "青衣" },
      shipping_methods: null,
      delivery_teams: { name: "Sun-Line Logistics", short_name: "Sun-Line" },
      delivery_surcharges: [
        { amount: "50", delivery_surcharge_types: { name: "隧道費" } },
      ],
    });

    expect(item.orderNumber).toBe("6918");
    expect(item.customerPhone).toBe("90154004");
    expect(item.deliveryTime).toBe("18:00 - 19:00");
    expect(item.motorcadeName).toBe("Sun-Line");
    expect(item.shippingMethodName).toBe("車邊交收");
    expect(item.surcharges).toEqual([{ name: "隧道費", amount: 50 }]);
    expect(item.surchargeAmount).toBe(50);
    expect(feeSharePercent(item)).toBeCloseTo((140 / 1286) * 100);
  });

  it("builds the delivery export CSV with the requested headers", () => {
    const csv = buildDeliveryExportCsv(
      [
        toDeliveryExportRow(
          mapDeliveryRow({
            id: "delivery-1",
            delivery_at: "2026-08-01T10:00:00+08:00",
            delivery_time: "18:00 - 19:00",
            ship_out_time: null,
            delivery_status: "待取貨",
            basic_fee: 90,
            total_fee: 90,
            taken_at: null,
            fulfilled_at: null,
            image_references: [],
            motorcade_id: "team-1",
            shipping_method_id: "method-1",
            orders: {
              id: "order-1",
              order_number: "6918",
              customer_name_snapshot: "Louis Chang 張",
              contact_number_a_snapshot: "90154004",
              shipping_address_snapshot: "青衣長康邨",
              shipping_method_id: "method-1",
              grand_total: 1286,
              shipping_methods: { name: "車邊交收" },
            },
            delivery_districts: { name: "青衣" },
            shipping_methods: { name: "車邊交收" },
            delivery_teams: { name: "Sun-Line" },
          }),
          "未設定",
          () => "01/08/2026",
        ),
      ],
      {
        orderNumber: "訂單號碼",
        deliveryDate: "送貨日期",
        deliveryTime: "送貨時間",
        customerName: "客戶姓名",
        customerPhone: "客戶電話",
        district: "送貨地區",
        address: "送貨地址",
        shippingMethod: "送貨方式",
        fleet: "車隊",
      },
    );

    expect(csv.split("\n")[0]).toBe(
      '"訂單號碼","送貨日期","送貨時間","客戶姓名","客戶電話","送貨地區","送貨地址","送貨方式","車隊"',
    );
    expect(csv).toContain('"6918"');
    expect(csv).toContain('"18:00 - 19:00"');
    expect(csv).toContain('"車邊交收"');
    expect(csv).toContain('"Sun-Line"');
  });
});
