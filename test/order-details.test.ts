import { describe, expect, it } from "vitest";

import { resolveOrderDetailLineCatalog } from "../src/lib/order-details";

describe("order detail line catalog display", () => {
  it("shows an unmatched parsed dish snapshot instead of its parent package", () => {
    expect(resolveOrderDetailLineCatalog({
      sku_snapshot: null,
      product_name_snapshot: "甜豆雜菌炒「植物肉絲」(2磅)",
      products: null,
      packages: { sku: "PKG-8-10", name: "精緻中式盛宴 (8-10人)" },
    })).toEqual({
      sku: null,
      productName: "甜豆雜菌炒「植物肉絲」(2磅)",
    });
  });

  it("keeps a matched product catalog name and SKU", () => {
    expect(resolveOrderDetailLineCatalog({
      sku_snapshot: null,
      product_name_snapshot: "煙肉卡邦尼烤雞扒配雜菌 (2磅)",
      products: { sku: "CP123", name: "雜菌煙肉卡邦尼烤雞扒 (2磅)" },
      packages: { sku: "PKG-PARTY", name: "派對套餐" },
    })).toEqual({
      sku: "CP123",
      productName: "雜菌煙肉卡邦尼烤雞扒 (2磅)",
    });
  });

  it("still falls back to package catalog data for a package without snapshots", () => {
    expect(resolveOrderDetailLineCatalog({
      products: null,
      packages: { sku: "PKG-01", name: "精緻中式盛宴 (8-10人)" },
    })).toEqual({
      sku: "PKG-01",
      productName: "精緻中式盛宴 (8-10人)",
    });
  });
});
