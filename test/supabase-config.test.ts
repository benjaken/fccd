import { afterEach, describe, expect, it, vi } from "vitest";

const SUPABASE_ENV_NAMES = [
  "VITE_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

describe("Supabase configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the production public configuration when deployment variables are absent", async () => {
    for (const name of SUPABASE_ENV_NAMES) vi.stubEnv(name, "");
    vi.resetModules();

    const config = await import("@/lib/supabase");

    expect(config.isSupabaseConfigured).toBe(true);
    expect(config.supabaseUrl).toBe("https://vignxasvlxqnyvuhtjlu.supabase.co");
    expect(config.supabasePublishableKey).toMatch(/^sb_publishable_/);
  });
});
