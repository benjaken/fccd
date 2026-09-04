export const PRODUCTION_SUPABASE_URL = "https://vignxasvlxqnyvuhtjlu.supabase.co";
export const DEVELOP_SUPABASE_URL = "https://mxiueauyylnpwlxrvgbo.supabase.co";

export const PRODUCTION_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X";
export const DEVELOP_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_xgNR7t263k4Jn709h2kf2Q_NKR1hwbO";

export type SupabasePublicEnv = {
  VITE_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  VITE_GIT_BRANCH?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERCEL_ENV?: string;
  VITE_VERCEL_ENV?: string;
};

function envString(env: object, key: keyof SupabasePublicEnv) {
  const value = (env as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function supabaseDeploymentBranch(env: object) {
  return envString(env, "VITE_GIT_BRANCH") || envString(env, "VERCEL_GIT_COMMIT_REF");
}

export function usesDevelopSupabase(env: object) {
  const branch = supabaseDeploymentBranch(env).toLowerCase();
  const vercelEnv = envString(env, "VITE_VERCEL_ENV") || envString(env, "VERCEL_ENV");
  return branch === "develop" || vercelEnv === "preview";
}

export function resolveSupabasePublicConfig(env: object = {}) {
  const useDevelop = usesDevelopSupabase(env);
  const supabaseUrl =
    envString(env, "VITE_SUPABASE_URL") ||
    envString(env, "NEXT_PUBLIC_SUPABASE_URL") ||
    (useDevelop ? DEVELOP_SUPABASE_URL : PRODUCTION_SUPABASE_URL);
  const supabasePublishableKey =
    envString(env, "VITE_SUPABASE_PUBLISHABLE_KEY") ||
    envString(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
    envString(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    (useDevelop ? DEVELOP_SUPABASE_PUBLISHABLE_KEY : PRODUCTION_SUPABASE_PUBLISHABLE_KEY);
  return { supabaseUrl, supabasePublishableKey };
}
