import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NOT_CONFIGURED_ERROR = {
  message:
    "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your Replit Secrets, then restart the app.",
} as AuthError;

/** Convert raw SDK/network errors to readable messages */
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
  const initializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    if (!isSupabaseConfigured) {
      // No credentials — resolve immediately as unauthenticated
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
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

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
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
