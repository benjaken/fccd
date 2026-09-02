import { describe, expect, it } from "vitest";

import { formatOrderNumber, normalizeOrderNumber } from "@/lib/order-number";

describe("order number formatting", () => {
  it.each([
    ["6917", "Catering", "#6917"],
    ["#6917", "Food Channel Catering", "#6917"],
    ["#B-1513", "HK Lunch Box", "B-1513"],
    ["#FCLQ20260801", "Catering", "FCLQ20260801"],
    ["B#1462UB", "HK Lunch Box", "B#1462UB"],
    ["#1234", "HK Party Food", "1234"],
  ])("formats %s for %s as %s", (value, channel, expected) => {
    expect(formatOrderNumber(value, channel)).toBe(expected);
  });

  it("infers legacy numeric Catering numbers when the channel is unavailable", () => {
    expect(formatOrderNumber("6917")).toBe("#6917");
    expect(formatOrderNumber("#B-1513")).toBe("B-1513");
  });

  it("normalizes repeated leading hashes", () => {
    expect(normalizeOrderNumber("## B-1513")).toBe("B-1513");
  });
});
