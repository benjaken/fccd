import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchShopOrderRequests } = vi.hoisted(() => ({
  fetchShopOrderRequests: vi.fn(),
}));

vi.mock("@/lib/shop-orders", () => ({
  fetchShopOrderRequests,
}));

import { fetchShopOrderDeliveryNote } from "@/components/FactoryMeatDeliveryNotePage";

describe("factory shop delivery note", () => {
  beforeEach(() => {
    fetchShopOrderRequests.mockReset();
  });

  it("uses the parent order delivery details and combines every supplier", async () => {
    const frozen = {
      id: "request-frozen",
      batchId: "batch-1",
      requestNo: "R - 202609 - 4",
      restaurantId: "restaurant-1",
      restaurantName: "TKO",
      deliveryDate: "2026-09-07",
      status: "reviewed",
      note: "Monday delivery",
      shippingMethodId: "method-1",
      shippingMethodName: "Factory delivery",
      deliveryContactPerson: "Chan Tai",
      deliveryPhone: "61234567",
      deliveryAddress: "TKO delivery address",
      lines: [{ id: "line-1", sku: null, name: "Frozen beef", unit: "2kg / pack", quantity: 6 }],
    };
    const dry = {
      ...frozen,
      id: "request-dry",
      lines: [{ id: "line-2", sku: null, name: "Rice", unit: "bag", quantity: 2 }],
    };
    fetchShopOrderRequests
      .mockResolvedValueOnce([frozen])
      .mockResolvedValueOnce([frozen, dry]);

    const note = await fetchShopOrderDeliveryNote("request-frozen");

    expect(note).toMatchObject({
      shippingMethodId: "method-1",
      shippingMethodName: "Factory delivery",
      contactPerson: "Chan Tai",
      phone: "61234567",
      address: "TKO delivery address",
    });
    expect(note.lines.map((line) => line.name)).toEqual(["Frozen beef", "Rice"]);
  });
});
