import { describe, expect, it } from "vitest";

import { hongKongDateKey } from "@/lib/date-time";

describe("Hong Kong calendar dates", () => {
  it("does not expose the previous UTC date for Hong Kong midnight", () => {
    expect(hongKongDateKey("2026-08-23T16:00:00.000Z")).toBe("2026-08-24");
  });

  it("keeps null and invalid values safe", () => {
    expect(hongKongDateKey(null)).toBe("");
    expect(hongKongDateKey("not-a-date")).toBe("not-a-date");
  });
});
