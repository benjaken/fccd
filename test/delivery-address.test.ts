import { describe, expect, it } from "vitest";

import { formatDeliveryAddress } from "@/lib/delivery-address";

describe("formatDeliveryAddress", () => {
  it("appends the handoff method to a delivery address", () => {
    expect(formatDeliveryAddress("青衣長輝路38號", "車邊交收")).toBe(
      "青衣長輝路38號 * 車邊交收",
    );
  });

  it("does not repeat an existing handoff method", () => {
    expect(formatDeliveryAddress("青衣長輝路38號 * 車邊交收", "車邊交收")).toBe(
      "青衣長輝路38號 * 車邊交收",
    );
  });
});
