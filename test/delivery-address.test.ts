import { describe, expect, it } from "vitest";

import { formatDeliveryAddress } from "@/lib/delivery-address";

describe("formatDeliveryAddress", () => {
  it("appends the handoff method to a delivery address", () => {
    expect(formatDeliveryAddress("青衣長輝路38號", "車邊交收")).toBe(
      "（附近車邊交收） 青衣長輝路38號",
    );
  });

  it("does not repeat an existing handoff method", () => {
    expect(formatDeliveryAddress("青衣長輝路38號 * 車邊交收", "車邊交收")).toBe(
      "（附近車邊交收） 青衣長輝路38號",
    );
  });

  it("shows door delivery in parentheses", () => {
    expect(formatDeliveryAddress("青衣長輝路38號", "送貨上門")).toBe(
      "（送貨上門) 青衣長輝路38號",
    );
  });

  it("does not add a delivery suffix for pickup", () => {
    expect(formatDeliveryAddress("荃灣門市", "門市自取")).toBe("荃灣門市");
  });
});
