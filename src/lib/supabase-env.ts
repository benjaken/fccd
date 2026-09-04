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

export function supabaseDeploymentBranch(env: SupabasePublicEnv) {
  return (env.VITE_GIT_BRANCH || env.VERCEL_GIT_COMMIT_REF || "").trim();
}

export function usesDevelopSupabase(env: SupabasePublicEnv) {
  const branch = supabaseDeploymentBranch(env).toLowerCase();
  const vercelEnv = env.VITE_VERCEL_ENV || env.VERCEL_ENV;
  return branch === "develop" || vercelEnv === "preview";
}

export function resolveSupabasePublicConfig(env: SupabasePublicEnv) {
  const useDevelop = usesDevelopSupabase(env);
  const supabaseUrl =
    env.VITE_SUPABASE_URL?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    (useDevelop ? DEVELOP_SUPABASE_URL : PRODUCTION_SUPABASE_URL);
  const supabasePublishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    (useDevelop ? DEVELOP_SUPABASE_PUBLISHABLE_KEY : PRODUCTION_SUPABASE_PUBLISHABLE_KEY);
  return { supabaseUrl, supabasePublishableKey };
}
