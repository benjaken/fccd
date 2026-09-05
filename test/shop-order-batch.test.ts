import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc, from },
}));

import { createShopOrderBatch } from "@/lib/shop-orders";

function requestRow(id: string, channel: "external" | "fc_internal", supplier: string) {
  return {
    id,
    order_batch_id: "batch-1",
    request_no: `hidden-${id}`,
    restaurant_id: "restaurant-1",
    channel,
    supplier_id: `supplier-${id}`,
    catalog_supplier_name: supplier,
    delivery_date: "2026-09-10",
    status: channel === "external" ? "saved" : "submitted",
    note: null,
    contact_phone: null,
    whatsapp_call_status: null,
    whatsapp_called_at: null,
    created_at: "2026-09-05T00:00:00Z",
    restaurants: { name: "TKO" },
    shop_order_batches: { order_no: "SO-20260905-0001" },
    shop_order_lines: [],
  };
}

describe("createShopOrderBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: "batch-1", error: null });
    const result = {
      data: [
        requestRow("fc", "fc_internal", "FC Frozen"),
        requestRow("external", "external", "Tea Supplier"),
      ],
      error: null,
    };
    const query: Record<string, unknown> = {};
    query.select = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    from.mockReturnValue(query);
  });

  it("creates one parent order for all supplier groups", async () => {
    const internalItem = {
      id: "item-fc", sku: null, name: "Beef", unit: "box",
      supplierName: "FC Frozen", channel: "fc_internal" as const,
      warehouse: "frozen" as const, fccSupplierId: "supplier-fc", sortOrder: 1,
    };
    const externalItem = {
      id: "item-external", sku: null, name: "Tea", unit: "box",
      supplierName: "Tea Supplier", channel: "external" as const,
      warehouse: null, fccSupplierId: "supplier-external", sortOrder: 2,
    };

    const requests = await createShopOrderBatch({
      restaurantId: "restaurant-1",
      deliveryDate: "2026-09-10",
      groups: [
        {
          channel: "fc_internal",
          supplierId: "supplier-fc",
          catalogSupplierName: "FC Frozen",
          lines: [{ catalogItemId: "item-fc", quantity: 2 }],
          catalogItems: [internalItem],
        },
        {
          channel: "external",
          supplierId: "supplier-external",
          catalogSupplierName: "Tea Supplier",
          lines: [{ catalogItemId: "item-external", quantity: 3 }],
          catalogItems: [externalItem],
        },
      ],
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("shop_create_order_batch", expect.objectContaining({
      p_restaurant_id: "restaurant-1",
      p_groups: expect.arrayContaining([
        expect.objectContaining({ supplierName: "FC Frozen" }),
        expect.objectContaining({ supplierName: "Tea Supplier" }),
      ]),
    }));
    expect(requests).toHaveLength(2);
    expect(new Set(requests.map((request) => request.requestNo))).toEqual(
      new Set(["SO-20260905-0001"]),
    );
  });
});
