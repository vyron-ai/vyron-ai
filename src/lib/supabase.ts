import { createClient } from "@supabase/supabase-js";

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "";

const supabaseUrl = rawUrl.replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, "").replace(/\/$/, "");

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[VYRON AI] Supabase credentials are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment secrets."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
