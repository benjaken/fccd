import { describe, expect, it } from "vitest";

import {
  formatOrderListDeliveryStatus,
  orderFleetName,
} from "@/lib/orders";

const labels = { unassigned: "未派車隊", accepted: "已接單" };

describe("order list delivery status fleet suffix", () => {
  it("shows accepted pending pickup with the fleet name", () => {
    expect(
      formatOrderListDeliveryStatus(
        { deliveryStatus: "待取貨", fleetName: "Adam" },
        labels,
      ),
    ).toBe("已接單 待取貨(Adam)");
  });

  it("appends the fleet name for shipping and delivered statuses", () => {
    expect(
      formatOrderListDeliveryStatus(
        { deliveryStatus: "送貨途中", fleetName: "Sun-Line" },
        labels,
      ),
    ).toBe("送貨途中(Sun-Line)");
    expect(
      formatOrderListDeliveryStatus(
        { deliveryStatus: "已送達", fleetName: "Sun-Line" },
        labels,
      ),
    ).toBe("已送達(Sun-Line)");
  });

  it("does not suffix unassigned or awaiting-acceptance statuses", () => {
    expect(
      formatOrderListDeliveryStatus(
        { deliveryStatus: "未派車隊", fleetName: "Adam" },
        labels,
      ),
    ).toBe("未派車隊");
    expect(
      formatOrderListDeliveryStatus(
        { deliveryStatus: "待接單", fleetName: "Adam" },
        labels,
      ),
    ).toBe("待接單");
  });

  it("prefers the fleet matching the order delivery status", () => {
    expect(
      orderFleetName("待取貨", [
        {
          delivery_status: "已送達",
          delivery_teams: { name: "Sun-Line", short_name: null },
        },
        {
          delivery_status: "待取貨",
          delivery_teams: { name: "Adam", short_name: null },
        },
      ]),
    ).toBe("Adam");
  });
});
