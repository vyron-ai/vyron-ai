import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDemoMode: boolean;
  enterDemoMode: () => void;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Minimal demo user — satisfies all guarded routes without any network request
const DEMO_USER: User = {
  id: "demo-user-00000000-0000-0000-0000-000000000000",
  aud: "authenticated",
  role: "authenticated",
  email: "demo@vyron.ai",
  email_confirmed_at: new Date().toISOString(),
  phone: "",
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: "demo", providers: ["demo"] },
  user_metadata: { full_name: "Demo User" },
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_anonymous: false,
};

const NOT_CONFIGURED_ERROR = {
  message:
    "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your Replit Secrets, then restart the app.",
} as AuthError;

function humanizeError(err: AuthError | null): AuthError | null {
  if (!err) return null;
  const msg = err.message ?? "";
  if (
    msg.toLowerCase().includes("failed to fetch") ||
    msg.toLowerCase().includes("networkerror") ||
    msg.toLowerCase().includes("load failed")
  ) {
    return {
      ...err,
      message:
        "Cannot reach Supabase. Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are correct in your Replit Secrets.",
    };
  }
  return err;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    if (!isSupabaseConfigured) {
      initializedRef.current = true;
      setLoading(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) {
          setSession(data.session);
          setUser(data.session?.user ?? null);
        }
        initializedRef.current = true;
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        initializedRef.current = true;
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      if (initializedRef.current) {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        // If a real sign-out happens, also clear demo mode
        if (!newSession) setIsDemoMode(false);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const enterDemoMode = () => {
    setUser(DEMO_USER);
    setIsDemoMode(true);
  };

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR };
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: humanizeError(error) };
    } catch {
      return { error: NOT_CONFIGURED_ERROR };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR };
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      return { error: humanizeError(error) };
    } catch {
      return { error: NOT_CONFIGURED_ERROR };
    }
  };

  const signOut = async () => {
    setIsDemoMode(false);
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isDemoMode, enterDemoMode, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
