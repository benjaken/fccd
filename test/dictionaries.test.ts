import { describe, expect, it } from "vitest";

import { DICT_TYPE, dictItemLabel, dictSelectOptions, type DictItem } from "@/lib/dictionaries";
import { productPriceRangeBounds } from "@/lib/products";

const items: DictItem[] = [
  {
    id: "item-1",
    dictTypeId: "type-1",
    value: "kitchen",
    label: "廚房",
    labelEn: "Kitchen",
    description: "",
    metadata: {},
    sortOrder: 10,
    isActive: true,
  },
];

describe("dictionary interface", () => {
  it("selects the localized label through the shared interface", () => {
    expect(dictItemLabel(items[0]!, "zh-HK")).toBe("廚房");
    expect(dictItemLabel(items[0]!, "en")).toBe("Kitchen");
  });

  it("preserves an existing stored value that has since been disabled", () => {
    expect(dictSelectOptions(items, "zh-HK", "legacy")).toEqual([
      { value: "kitchen", label: "廚房", metadata: {} },
      { value: "legacy", label: "legacy", metadata: {} },
    ]);
  });

  it("exposes all 18 current-system dictionary types", () => {
    expect(Object.values(DICT_TYPE)).toHaveLength(18);
    expect(DICT_TYPE.orderManualTodo).toBe("order_manual_todo");
    expect(DICT_TYPE.supplierQuotePriceUnit).toBe("supplier_quote_price_unit");
    expect(DICT_TYPE.catalogStatus).toBe("catalog_status");
    expect(DICT_TYPE.productPriceRange).toBe("product_price_range");
  });

  it("reads product price bounds from dictionary metadata", () => {
    const rangeItem: DictItem = {
      ...items[0]!,
      value: "100-299",
      metadata: { min: 100, max: 300 },
    };
    expect(productPriceRangeBounds([rangeItem], "100-299")).toEqual({
      min: 100,
      max: 300,
    });
  });
});
