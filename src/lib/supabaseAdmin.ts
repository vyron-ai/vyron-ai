/**
 * supabaseAdmin — browser-side stub only.
 *
 * The service-role key MUST NOT be read from import.meta.env / VITE_* vars
 * because Vite bakes every VITE_* value into the browser bundle.
 * All admin operations (bucket creation) are handled by the Vite dev-server
 * middleware in vite.config.ts, which reads process.env.SUPABASE_SERVICE_ROLE_KEY
 * safely on the server side.
 *
 * This file intentionally exports null / false so that no browser code ever
 * touches the service-role key.
 */

export const isAdminConfigured = false as boolean;
export const supabaseAdmin = null;
export function getProjectRef(): string | null {
  try {
    const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
    const url = rawUrl.replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, "").replace(/\/$/, "");
    const host = new URL(url).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
