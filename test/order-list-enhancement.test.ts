import { describe, expect, it } from "vitest";

import { isManualTodoTableUnavailable } from "@/lib/order-list-enhancement";

describe("manual order to-do compatibility", () => {
  it.each(["42P01", "PGRST205"])(
    "keeps the main order list available when the optional table returns %s",
    (code) => {
      expect(isManualTodoTableUnavailable({ code })).toBe(true);
    },
  );

  it("does not hide permission or other query failures", () => {
    expect(isManualTodoTableUnavailable({ code: "42501" })).toBe(false);
    expect(isManualTodoTableUnavailable(new Error("network"))).toBe(false);
  });
});
