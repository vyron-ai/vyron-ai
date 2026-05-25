import { createClient, SupabaseClient } from "@supabase/supabase-js";

const rawUrl = ((import.meta.env.VITE_SUPABASE_URL as string) ?? "").trim();
const rawKey = ((import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string) ?? "").trim();

const supabaseUrl = rawUrl
  .replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, "")
  .replace(/\/$/, "");

const urlOk =
  Boolean(supabaseUrl) &&
  !supabaseUrl.includes("placeholder") &&
  /^https?:\/\//.test(supabaseUrl);

const keyOk = Boolean(rawKey) && !rawKey.includes("placeholder") && rawKey.length > 20;

export const isAdminConfigured = urlOk && keyOk;

let adminInstance: SupabaseClient | null = null;
if (isAdminConfigured) {
  try {
    adminInstance = createClient(supabaseUrl, rawKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch {
    adminInstance = null;
  }
}

export const supabaseAdmin = adminInstance;

/**
 * Extract the Supabase project ref from the project URL.
 * e.g. "https://xyzxyzxyz.supabase.co" → "xyzxyzxyz"
 */
export function getProjectRef(): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
