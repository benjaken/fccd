import { describe, expect, it } from "vitest";

import {
  classifyQuoteSaveError,
  isQuoteSaveErrorKey,
} from "@/lib/quote-editor";

describe("classifyQuoteSaveError", () => {
  it("does not blame permissions for generic failures", () => {
    expect(classifyQuoteSaveError(new Error("network down"))).toBe("create");
    expect(classifyQuoteSaveError(null)).toBe("create");
    expect(isQuoteSaveErrorKey("create")).toBe(true);
    expect(isQuoteSaveErrorKey("quote_create_failed")).toBe(false);
  });

  it("maps backend permission and validation failures", () => {
    expect(
      classifyQuoteSaveError({
        code: "42501",
        message: "new row violates row-level security policy",
      }),
    ).toBe("permission");
    expect(classifyQuoteSaveError({ message: "channel_required" })).toBe(
      "channelRequired",
    );
    expect(classifyQuoteSaveError({ message: "customer_required" })).toBe(
      "customerRequired",
    );
    expect(
      classifyQuoteSaveError({ message: "district_create_not_allowed" }),
    ).toBe("districtPermission");
  });
});
