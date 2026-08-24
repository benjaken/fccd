import { describe, expect, it } from "vitest";

import { normalizeSupplierQuotePrice } from "@/lib/supplier-quote-price";

describe("supplier quote price normalization", () => {
  it("converts a per-bottle quote to both carton and per-kg prices", () => {
    const result = normalizeSupplierQuotePrice({
      price: 68,
      priceUnit: "unit",
      rawPriceText: "$68/bottle",
      sizeText: "615g",
      packingText: "6 x 615g / carton",
    });

    expect(result).toMatchObject({
      sourceUnit: "unit",
      sourceUnitLabel: "bottle",
      unitWeightKg: 0.615,
      unitsPerContainer: 6,
      containerPrice: 408,
      containerWeightKg: 3.69,
    });
    expect(result.comparablePricePerKg).toBeCloseTo(110.5691, 4);
  });

  it("converts a per-carton quote using the complete carton weight", () => {
    const result = normalizeSupplierQuotePrice({
      price: 408,
      priceUnit: "box",
      rawPriceText: "$408/ctn",
      sizeText: "615g",
      packingText: "6 bottles / carton",
    });

    expect(result.containerWeightKg).toBeCloseTo(3.69, 4);
    expect(result.comparablePricePerKg).toBeCloseTo(110.5691, 4);
  });

  it("uses one pack's weight for a per-pack quote", () => {
    const result = normalizeSupplierQuotePrice({
      price: 68,
      priceUnit: "pack",
      rawPriceText: "$68/pack",
      sizeText: "520g",
      packingText: "6 x 520g / carton",
    });

    expect(result.comparablePricePerKg).toBeCloseTo(130.7692, 4);
    expect(result.containerPrice).toBe(408);
  });

  it("does not compare when the price basis is missing or only volume is known", () => {
    expect(normalizeSupplierQuotePrice({
      price: 68,
      priceUnit: null,
      rawPriceText: "$68",
      sizeText: "520g",
      packingText: "6 x 520g",
    }).comparablePricePerKg).toBeNull();

    expect(normalizeSupplierQuotePrice({
      price: 183,
      priceUnit: "unit",
      rawPriceText: "$183/bottle",
      sizeText: "2.65L",
      packingText: "4 x 2.65L",
    }).comparablePricePerKg).toBeNull();
  });
});
