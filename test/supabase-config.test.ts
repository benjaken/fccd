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

  it("uses the develop public configuration for non-main branches and missing deployment variables", () => {
    expect(resolveSupabasePublicConfig({})).toEqual({
      supabaseUrl: DEVELOP_SUPABASE_URL,
      supabasePublishableKey: DEVELOP_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(
      resolveSupabasePublicConfig({
        VITE_GIT_BRANCH: "",
        VITE_VERCEL_ENV: "",
        VERCEL_GIT_COMMIT_REF: "",
        VERCEL_ENV: "",
      }),
    ).toEqual({
      supabaseUrl: DEVELOP_SUPABASE_URL,
      supabasePublishableKey: DEVELOP_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(resolveSupabasePublicConfig({ VITE_GIT_BRANCH: "feature/orders" }).supabaseUrl).toBe(
      DEVELOP_SUPABASE_URL,
    );
    expect(resolveSupabasePublicConfig({ VITE_GIT_BRANCH: "develop" })).toEqual({
      supabaseUrl: DEVELOP_SUPABASE_URL,
      supabasePublishableKey: DEVELOP_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(resolveSupabasePublicConfig({ VITE_VERCEL_ENV: "preview" }).supabaseUrl).toBe(
      DEVELOP_SUPABASE_URL,
    );
  });

  it("uses the production public configuration only for main / Vercel production", () => {
    expect(resolveSupabasePublicConfig({ VITE_GIT_BRANCH: "main" })).toEqual({
      supabaseUrl: PRODUCTION_SUPABASE_URL,
      supabasePublishableKey: PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(resolveSupabasePublicConfig({ VERCEL_ENV: "production" }).supabaseUrl).toBe(
      PRODUCTION_SUPABASE_URL,
    );
    expect(
      resolveSupabasePublicConfig({
        VITE_GIT_BRANCH: "main",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_override",
      }),
    ).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_override",
    });
  });
});
