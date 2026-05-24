import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Track whether initial session has been resolved — never go back to loading after that
  const initializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // 1. Get initial session once — this is the only thing that controls `loading`
    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (!error) {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      }
      initializedRef.current = true;
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      // Supabase not configured — resolve as unauthenticated
      initializedRef.current = true;
      setLoading(false);
    });

    // 2. Subscribe to future auth events — never touch `loading` here
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      // Only apply state changes after initialization to avoid race conditions
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
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    } catch {
      return { error: { message: "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your secrets." } as AuthError };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      return { error };
    } catch {
      return { error: { message: "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your secrets." } as AuthError };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
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
