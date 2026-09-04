import { describe, expect, it } from "vitest";

import {
  buildSupplierOrderMessage,
  groupCatalogBySupplier,
  isDeliveryDateAllowed,
  shopCatalogSupplierKey,
  type ShopCatalogItem,
} from "@/lib/shop-orders";

function item(partial: Partial<ShopCatalogItem> & Pick<ShopCatalogItem, "id" | "name" | "supplierName" | "channel">): ShopCatalogItem {
  return {
    sku: null,
    unit: "包",
    warehouse: partial.channel === "fc_internal" ? "dry" : null,
    fccSupplierId: null,
    sortOrder: 0,
    ...partial,
  };
}

describe("shop catalog grouping", () => {
  it("groups FC internal and external suppliers without mixing channels", () => {
    const groups = groupCatalogBySupplier([
      item({ id: "1", name: "牛展", supplierName: "FC_凍肉", channel: "fc_internal" }),
      item({ id: "2", name: "厚方包", supplierName: "鳳香園麵飽有限公司", channel: "external" }),
      item({ id: "3", name: "牛腩", supplierName: "FC_凍肉", channel: "fc_internal" }),
    ]);

    expect(groups.map((group) => [group.supplierName, group.channel, group.items.length])).toEqual([
      ["FC_凍肉", "fc_internal", 2],
      ["鳳香園麵飽有限公司", "external", 1],
    ]);
  });

  it("rejects a delivery date before today", () => {
    expect(isDeliveryDateAllowed("2026-09-03", "2026-09-03")).toBe(true);
    expect(isDeliveryDateAllowed("2026-09-02", "2026-09-03")).toBe(false);
    expect(isDeliveryDateAllowed("", "2026-09-03")).toBe(false);
  });

  it("keeps same-name suppliers separate across channels and supplier records", () => {
    const groups = groupCatalogBySupplier([
      item({ id: "1", name: "Internal item", supplierName: "Shared", channel: "fc_internal", fccSupplierId: "supplier-1" }),
      item({ id: "2", name: "External item", supplierName: "Shared", channel: "external", fccSupplierId: "supplier-1" }),
      item({ id: "3", name: "Second supplier record", supplierName: "Shared", channel: "external", fccSupplierId: "supplier-2" }),
    ]);

    expect(groups).toHaveLength(3);
    expect(new Set(groups.map(shopCatalogSupplierKey)).size).toBe(3);
  });

  it("builds a supplier-specific message with the shared delivery date", () => {
    const message = buildSupplierOrderMessage({
      restaurantName: "TKO",
      requestNo: "SO-1",
      supplierName: "Supplier A",
      deliveryDate: "2026-09-08",
      note: "Back door",
      lines: [
        { name: "Tea", unit: "box", quantity: 2 },
        { name: "Rice", unit: "bag", quantity: 3 },
      ],
    });

    expect(message).toContain("TKO");
    expect(message).toContain("SO-1");
    expect(message).toContain("2026-09-08");
    expect(message).toContain("Tea × 2 box");
    expect(message).toContain("Rice × 3 bag");
    expect(message).toContain("Back door");
  });
});
