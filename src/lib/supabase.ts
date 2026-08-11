import { createClient } from "@supabase/supabase-js";

// These FCCD values are browser-safe public identifiers, not secret credentials.
// Environment variables can override them for preview or deployment environments.
const defaultSupabaseUrl = "https://vignxasvlxqnyvuhtjlu.supabase.co";
const defaultSupabasePublishableKey =
  "sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  defaultSupabaseUrl;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
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
