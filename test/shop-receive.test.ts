import { describe, expect, it } from "vitest";

import {
  hasReceiveVariance,
  groupPendingShopReceives,
  isReceiveQuantityAllowed,
  receiveStatusForLines,
} from "@/lib/shop-receive";

describe("shop receive helpers", () => {
  it("allows zero received quantity as a discrepancy", () => {
    expect(isReceiveQuantityAllowed(0)).toBe(true);
    expect(isReceiveQuantityAllowed(2)).toBe(true);
    expect(isReceiveQuantityAllowed(-1)).toBe(false);
  });

  it("groups frozen and dry shipments under one restaurant order", () => {
    const shipment = {
      id: "shipment-1",
      shipmentNo: "SR-1",
      requestId: "request-1",
      requestNo: "R - 202609 - 4",
      restaurantName: "TKO",
      status: "in_transit",
      shippedAt: "2026-09-07T10:00:00Z",
      warningFlags: [],
      lines: [],
    };
    const groups = groupPendingShopReceives([
      shipment,
      { ...shipment, id: "shipment-2", shipmentNo: "SR-2", requestId: "request-2" },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      orderNo: "R - 202609 - 4",
      shipments: [{ id: "shipment-1" }, { id: "shipment-2" }],
    });
  });

  it("marks quantity differences as exceptions", () => {
    expect(hasReceiveVariance(3, 3)).toBe(false);
    expect(hasReceiveVariance(3, 2)).toBe(true);
    expect(hasReceiveVariance(3, 0)).toBe(true);
    expect(
      receiveStatusForLines([
        { shippedQuantity: 2, receivedQuantity: 2 },
        { shippedQuantity: 1, receivedQuantity: 0 },
      ]),
    ).toBe("exception");
    expect(
      receiveStatusForLines([{ shippedQuantity: 2, receivedQuantity: 2 }]),
    ).toBe("received");
  });
});
