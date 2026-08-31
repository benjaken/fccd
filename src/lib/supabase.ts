import { createClient } from "@supabase/supabase-js";

// Browser-safe public identifiers for the production Supabase project.
// Preview and local environments override these values with their branch config.
const defaultSupabaseUrl = "https://vignxasvlxqnyvuhtjlu.supabase.co";
const defaultSupabasePublishableKey =
  "sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X";

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  defaultSupabaseUrl;
export const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  defaultSupabasePublishableKey;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
