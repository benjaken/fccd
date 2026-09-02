import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, invoke } = vi.hoisted(() => ({
  getSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession },
    functions: { invoke },
  },
}));

import { translateAddressToTraditionalChinese } from "../src/lib/address-tools";

describe("address translation session handling", () => {
  beforeEach(() => {
    getSession.mockReset();
    invoke.mockReset();
  });

  it("uses the SDK-managed session without forcing a token refresh", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "current-token" } },
    });
    invoke.mockResolvedValue({
      data: { translatedText: "香港皇后大道中12號" },
      error: null,
    });

    await expect(translateAddressToTraditionalChinese("12 Queen's Road Central"))
      .resolves.toBe("香港皇后大道中12號");
    expect(getSession).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("translate-address", {
      body: { text: "12 Queen's Road Central", kind: "address" },
      headers: { Authorization: "Bearer current-token" },
    });
  });

  it("does not invoke the function when there is no authenticated session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(translateAddressToTraditionalChinese("Central"))
      .rejects.toThrow("authentication_required");
    expect(invoke).not.toHaveBeenCalled();
  });
});
