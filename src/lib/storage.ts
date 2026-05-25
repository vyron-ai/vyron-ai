import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export const UPLOAD_BUCKET = "videos";

export interface UploadResult {
  path: string;
  publicUrl: string;
}

function getSupabaseBaseUrl(): string {
  const raw = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
  return raw.replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, "").replace(/\/$/, "");
}

/** Diagnostics — never returns actual secret values */
export function getStorageDiagnostics() {
  const urlRaw = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
  const keyRaw = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "";
  return {
    urlLoaded: Boolean(urlRaw) && !urlRaw.includes("placeholder"),
    keyLoaded: Boolean(keyRaw) && !keyRaw.includes("placeholder"),
    clientReady: isSupabaseConfigured,
    bucket: UPLOAD_BUCKET,
  };
}

export function uploadVideoXHR(
  file: File,
  userId: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
  /** Optional: pass a JWT to use instead of the session token (e.g. for demo mode) */
  overrideToken?: string
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const supabaseUrl = getSupabaseBaseUrl();
    const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "";

    if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
      reject(
        new Error(
          "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your Replit Secrets, then restart the app."
        )
      );
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = file.name.split(".").pop() ?? "mp4";
    const path = `${userId}/${Date.now()}-${safeName}`;

    supabase.auth.getSession().then(({ data }) => {
      // Prefer: real session token → override token → anon key
      const token = data.session?.access_token ?? overrideToken ?? anonKey;
      const url = `${supabaseUrl}/storage/v1/object/${UPLOAD_BUCKET}/${path}`;

      const xhr = new XMLHttpRequest();

      signal.addEventListener("abort", () => {
        xhr.abort();
        reject(new DOMException("Upload aborted", "AbortError"));
      });

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/${UPLOAD_BUCKET}/${path}`;
          resolve({ path, publicUrl });
        } else {
          let msg = `HTTP ${xhr.status}`;
          try {
            const body = JSON.parse(xhr.responseText);
            // Supabase returns { error, message, statusCode }
            msg = body.message ?? body.error ?? msg;
          } catch {
            if (xhr.responseText) msg += ` — ${xhr.responseText.slice(0, 200)}`;
          }

          // Translate common Supabase storage errors to actionable messages
          if (xhr.status === 404) {
            msg = `Bucket "${UPLOAD_BUCKET}" not found. Create it in Supabase → Storage → New Bucket named "videos".`;
          } else if (xhr.status === 403 || xhr.status === 401) {
            msg = `Permission denied (${xhr.status}). Add an INSERT policy on the "${UPLOAD_BUCKET}" bucket for authenticated users in Supabase → Storage → Policies.`;
          } else if (xhr.status === 413) {
            msg = "File too large. Check your Supabase storage limits.";
          }

          reject(new Error(msg));
        }
      });

      xhr.addEventListener("error", () =>
        reject(
          new Error(
            "Network error. Check your VITE_SUPABASE_URL is correct and the Supabase project is online."
          )
        )
      );
      xhr.addEventListener("abort", () =>
        reject(new DOMException("Upload aborted", "AbortError"))
      );

      xhr.open("POST", url);
      xhr.setRequestHeader("apikey", anonKey);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("Content-Type", file.type || `video/${ext}`);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.send(file);
    });
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const dur = isFinite(video.duration) ? Math.round(video.duration) : null;
      URL.revokeObjectURL(url);
      resolve(dur);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}
