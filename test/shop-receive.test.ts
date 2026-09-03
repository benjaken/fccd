import { describe, expect, it } from "vitest";

import {
  hasReceiveVariance,
  isReceiveQuantityAllowed,
  receiveStatusForLines,
} from "@/lib/shop-receive";

describe("shop receive helpers", () => {
  it("allows zero received quantity as a discrepancy", () => {
    expect(isReceiveQuantityAllowed(0)).toBe(true);
    expect(isReceiveQuantityAllowed(2)).toBe(true);
    expect(isReceiveQuantityAllowed(-1)).toBe(false);
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
