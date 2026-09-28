import { describe, expect, it } from "vitest";

import {
  orderHasAssignedDriver,
  orderListDeliveryStatusI18nKey,
  orderListDeliveryStatusTone,
  partitionPendingPickupOrderIds,
} from "@/lib/orders";

describe("order list pickup status split", () => {
  it("treats 待取貨 without a driver as the unassigned accepted state", () => {
    const order = {
      deliveryStatus: "待取貨",
      hasAssignedDriver: false,
    };

    expect(orderListDeliveryStatusI18nKey(order)).toBe(
      "orders.statuses.acceptedUnassigned",
    );
    expect(orderListDeliveryStatusTone(order)).toBe("amber");
    expect(
      orderHasAssignedDriver("待取貨", [
        { delivery_status: "待取貨", subdriver_id: null },
      ]),
    ).toBe(false);
  });

  it("treats 待取貨 with a driver as assigned pending pickup", () => {
    const order = {
      deliveryStatus: "待取貨",
      hasAssignedDriver: true,
    };

    expect(orderListDeliveryStatusI18nKey(order)).toBe(
      "orders.statuses.assignedPendingPickup",
    );
    expect(orderListDeliveryStatusTone(order)).toBe("green");
    expect(
      orderHasAssignedDriver("待取貨", [
        { delivery_status: "待取貨", subdriver_id: "driver-1" },
      ]),
    ).toBe(true);
  });

  it("keeps mixed pending-pickup deliveries in the unassigned bucket", () => {
    expect(
      orderHasAssignedDriver("待取貨", [
        { delivery_status: "待取貨", subdriver_id: "driver-1" },
        { delivery_status: "待取貨", subdriver_id: null },
      ]),
    ).toBe(false);

    expect(
      partitionPendingPickupOrderIds([
        { order_id: "order-mixed", subdriver_id: "driver-1" },
        { order_id: "order-mixed", subdriver_id: null },
        { order_id: "order-assigned", subdriver_id: "driver-2" },
        { order_id: "order-open", subdriver_id: null },
      ]),
    ).toEqual({
      unassigned: ["order-mixed", "order-open"],
      assigned: ["order-assigned"],
    });
  });
});
