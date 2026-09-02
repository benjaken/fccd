import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

import { restoreDriverDeliverySession } from "@/lib/driver-delivery";

const SESSION_KEY = "fccd.driver-delivery.session";

describe("driver delivery session persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("restores a driver session regardless of its legacy expiry timestamp", () => {
    const session = {
      token: "driver-token",
      teamId: "team-1",
      teamName: "Sun-Line",
      expiresAt: "2020-01-01T00:00:00Z",
    };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    expect(restoreDriverDeliverySession()).toEqual(session);
  });

  it("migrates an existing tab session into persistent local storage", () => {
    const session = {
      token: "legacy-token",
      teamId: "team-1",
      teamName: "Sun-Line",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

    expect(restoreDriverDeliverySession()).toEqual(session);
    expect(window.localStorage.getItem(SESSION_KEY)).toBe(JSON.stringify(session));
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
