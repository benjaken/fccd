import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type UserProfile = {
  id: string;
  email: string | null;
  email_noti: boolean;
  factory_panel_date: string | null;
  role: string | null;
  shop_restro_legacy_id: string | null;
  user_name: string | null;
  week: string | null;
  week_plus_1: string | null;
  week_plus_2: string | null;
  created_at: string;
  updated_at: string;
  slug: string | null;
  social_networks: Record<string, unknown> | unknown[];
  legacy_id: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (!error) setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadProfile = async (userId: string) => {
    setProfileLoading(true);
    setProfileError(null);

    const { data, error } = await supabase
      .from("user_profiles")
      .select(
        "id,email,email_noti,factory_panel_date,role,shop_restro_legacy_id,user_name,week,week_plus_1,week_plus_2,created_at,updated_at,slug,social_networks,legacy_id",
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      setProfile(null);
      setProfileError(error.code || "profile_load_failed");
    } else {
      setProfile((data as UserProfile | null) ?? null);
      setProfileError(data ? null : "profile_not_found");
    }

    setProfileLoading(false);
  };

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }

    void loadProfile(userId);
  }, [session?.user.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      profileError,
      configured: isSupabaseConfigured,
      signIn: async (email, password) => {
        if (!isSupabaseConfigured) return "configuration";

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        return error ? error.code || "invalid_credentials" : null;
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut({ scope: "global" });
        if (error) throw error;
        setProfile(null);
      },
      resetPassword: async (email) => {
        if (!isSupabaseConfigured) return "configuration";

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        });

        return error ? error.code || "reset_failed" : null;
      },
      refreshProfile: async () => {
        if (!session?.user.id) return;
        await loadProfile(session.user.id);
      },
    }),
    [session, profile, loading, profileLoading, profileError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
