import { createClient } from "@supabase/supabase-js";

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "";

const supabaseUrl = rawUrl
  .replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, "")
  .replace(/\/$/, "");

/**
 * True only when both env vars are present and not placeholder values.
 * Import this wherever you need to guard a Supabase call.
 */
export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes("placeholder") &&
  !supabaseAnonKey.includes("placeholder");

if (!isSupabaseConfigured) {
  console.warn(
    "[VYRON AI] Supabase credentials are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment secrets."
  );
}

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : "https://placeholder.supabase.co",
  isSupabaseConfigured ? supabaseAnonKey : "placeholder-anon-key"
);
