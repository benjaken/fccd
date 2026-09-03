import { describe, expect, it } from "vitest";

import {
  canShipWithWarning,
  estimateMovementKg,
  isFactoryWarehouseVisible,
  isShipQuantityAllowed,
  parseKgPerUnit,
  resolveStockWarning,
} from "@/lib/shop-warehouse";

describe("factory warehouse helpers", () => {
  it("hides requests that have not been sent to the factory", () => {
    expect(isFactoryWarehouseVisible("submitted")).toBe(false);
    expect(isFactoryWarehouseVisible("saved")).toBe(false);
    expect(isFactoryWarehouseVisible("sent_to_factory")).toBe(true);
    expect(isFactoryWarehouseVisible("in_transit")).toBe(true);
    expect(isFactoryWarehouseVisible("received")).toBe(true);
    expect(isFactoryWarehouseVisible("exception")).toBe(true);
  });

  it("allows one shipment quantity up to the approved amount", () => {
    expect(isShipQuantityAllowed(2, 3)).toBe(true);
    expect(isShipQuantityAllowed(3, 3)).toBe(true);
    expect(isShipQuantityAllowed(0, 3)).toBe(false);
    expect(isShipQuantityAllowed(4, 3)).toBe(false);
  });

  it("warns when dry or frozen stock is missing or low, but still allows ship", () => {
    expect(resolveStockWarning({ mapped: true, hasLedger: false, balance: 0, quantity: 1 })).toBe("missing");
    expect(resolveStockWarning({ mapped: true, hasLedger: true, balance: 1, quantity: 2 })).toBe("low");
    expect(resolveStockWarning({ mapped: false, hasLedger: false, balance: 0, quantity: 1 })).toBe("unmapped");
    expect(resolveStockWarning({ mapped: true, hasLedger: true, balance: 2, quantity: 2 })).toBe("ok");
    expect(canShipWithWarning("missing")).toBe(true);
    expect(canShipWithWarning("low")).toBe(true);
    expect(canShipWithWarning("unmapped")).toBe(true);
  });

  it("reads kg from catalog units without converting at order time", () => {
    expect(parseKgPerUnit("2kg / 包")).toBe(2);
    expect(parseKgPerUnit("6KG/桶")).toBe(6);
    expect(parseKgPerUnit("包")).toBeNull();
    expect(estimateMovementKg(3, "2kg / 包")).toBe(6);
    expect(estimateMovementKg(2, "包")).toBe(2);
  });
});
