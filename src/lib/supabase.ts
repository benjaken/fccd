import { createClient } from "@supabase/supabase-js";

import { resolveSupabasePublicConfig } from "@/lib/supabase-env";

const resolved = resolveSupabasePublicConfig(import.meta.env);

export const supabaseUrl = resolved.supabaseUrl;
export const supabasePublishableKey = resolved.supabasePublishableKey;

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
