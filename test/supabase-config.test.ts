import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEVELOP_SUPABASE_PUBLISHABLE_KEY,
  DEVELOP_SUPABASE_URL,
  PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
  PRODUCTION_SUPABASE_URL,
  resolveSupabasePublicConfig,
} from "@/lib/supabase-env";

describe("Supabase configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the production public configuration when deployment variables are absent", () => {
    expect(resolveSupabasePublicConfig({})).toEqual({
      supabaseUrl: PRODUCTION_SUPABASE_URL,
      supabasePublishableKey: PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(
      resolveSupabasePublicConfig({
        VITE_GIT_BRANCH: "",
        VITE_VERCEL_ENV: "",
        VERCEL_GIT_COMMIT_REF: "",
        VERCEL_ENV: "",
      }),
    ).toEqual({
      supabaseUrl: PRODUCTION_SUPABASE_URL,
      supabasePublishableKey: PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
    });
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
