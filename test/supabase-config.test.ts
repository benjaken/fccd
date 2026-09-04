import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEVELOP_SUPABASE_PUBLISHABLE_KEY,
  DEVELOP_SUPABASE_URL,
  PRODUCTION_SUPABASE_URL,
  resolveSupabasePublicConfig,
} from "@/lib/supabase-env";

const SUPABASE_ENV_NAMES = [
  "VITE_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "VITE_GIT_BRANCH",
  "VITE_VERCEL_ENV",
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
    expect(config.supabaseUrl).toBe(PRODUCTION_SUPABASE_URL);
    expect(config.supabasePublishableKey).toMatch(/^sb_publishable_/);
  });

  it("points develop-branch and Vercel preview builds at the develop Supabase project", () => {
    expect(resolveSupabasePublicConfig({ VITE_GIT_BRANCH: "develop" })).toEqual({
      supabaseUrl: DEVELOP_SUPABASE_URL,
      supabasePublishableKey: DEVELOP_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(resolveSupabasePublicConfig({ VITE_VERCEL_ENV: "preview" }).supabaseUrl).toBe(
      DEVELOP_SUPABASE_URL,
    );
    expect(
      resolveSupabasePublicConfig({
        VITE_GIT_BRANCH: "develop",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_override",
      }),
    ).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_override",
    });
  });
});
