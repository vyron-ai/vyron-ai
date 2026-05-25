import { createClient, SupabaseClient } from "@supabase/supabase-js";

const rawUrl = ((import.meta.env.VITE_SUPABASE_URL as string) ?? "").trim();
const rawKey = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "").trim();

// Strip any sub-paths that users sometimes copy (e.g. /rest/v1, /auth/v1)
const strippedUrl = rawUrl
  .replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, "")
  .replace(/\/$/, "");

// Auto-prefix https:// if user pasted just the host (e.g. "xxxx.supabase.co")
const supabaseUrl =
  strippedUrl && !strippedUrl.startsWith("http")
    ? `https://${strippedUrl}`
    : strippedUrl;

/** Returns true only when the URL is a structurally valid HTTP/HTTPS URL */
function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const urlOk =
  Boolean(supabaseUrl) &&
  !supabaseUrl.includes("placeholder") &&
  isValidHttpUrl(supabaseUrl);

const keyOk = Boolean(rawKey) && !rawKey.includes("placeholder");

/**
 * True only when both credentials are present, non-placeholder, and the URL
 * is a valid HTTP/HTTPS address. Import this to guard any Supabase call.
 */
export const isSupabaseConfigured = urlOk && keyOk;

if (!urlOk && rawUrl) {
  console.warn(
    `[VYRON AI] VITE_SUPABASE_URL value "${rawUrl}" is not a valid HTTP/HTTPS URL. ` +
      "Make sure it looks like: https://xxxxxxxxxxxx.supabase.co"
  );
} else if (!isSupabaseConfigured) {
  console.warn(
    "[VYRON AI] Supabase credentials are missing. " +
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Replit Secrets."
  );
}

// createClient throws if the URL is invalid — wrap in try/catch so the app never crashes
let supabaseInstance: SupabaseClient;
try {
  supabaseInstance = createClient(
    isSupabaseConfigured ? supabaseUrl : "https://placeholder.supabase.co",
    isSupabaseConfigured ? rawKey : "placeholder-anon-key"
  );
} catch (err) {
  console.error("[VYRON AI] Failed to initialise Supabase client:", err);
  // Create a non-functional fallback so imports never explode
  supabaseInstance = createClient(
    "https://placeholder.supabase.co",
    "placeholder-anon-key"
  );
}

export const supabase = supabaseInstance;
