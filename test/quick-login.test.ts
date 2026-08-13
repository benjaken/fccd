import { describe, expect, it, vi } from "vitest";

describe("quick-login helpers", () => {
  it("returns credentials only when explicitly enabled", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_ENABLE_QUICK_LOGIN", "true");
    vi.stubEnv("VITE_QUICK_LOGIN_EMAIL", "preview@foodchannels.com");
    vi.stubEnv("VITE_QUICK_LOGIN_PASSWORD", "preview-secret");

    const { getQuickLoginCredentials } = await import("@/lib/quick-login");
    expect(getQuickLoginCredentials()).toEqual({
      email: "preview@foodchannels.com",
      password: "preview-secret",
    });
  });

  it("stays disabled without the enable flag", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_ENABLE_QUICK_LOGIN", "");
    vi.stubEnv("VITE_QUICK_LOGIN_EMAIL", "preview@foodchannels.com");
    vi.stubEnv("VITE_QUICK_LOGIN_PASSWORD", "preview-secret");

    const { getQuickLoginCredentials } = await import("@/lib/quick-login");
    expect(getQuickLoginCredentials()).toBeNull();
  });

  it("detects and strips the autologin query param", async () => {
    vi.resetModules();
    const {
      shouldAutologinFromUrl,
      stripAutologinParam,
    } = await import("@/lib/quick-login");

    expect(shouldAutologinFromUrl("?autologin=1")).toBe(true);
    expect(shouldAutologinFromUrl("?foo=1")).toBe(false);

    const url = new URL("https://example.vercel.app/login?autologin=1&x=1");
    expect(stripAutologinParam(url)).toBe("/login?x=1");
  });
});
