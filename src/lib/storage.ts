import { supabase } from "@/lib/supabase";

export interface UploadResult {
  path: string;
  publicUrl: string;
}

export function uploadVideoXHR(
  file: File,
  userId: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop() ?? "mp4";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${Date.now()}-${safeName}`;

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)
      .replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, "")
      .replace(/\/$/, "");
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const session = supabase.auth.getSession();
    session.then(({ data }) => {
      const token = data.session?.access_token ?? anonKey;
      const url = `${supabaseUrl}/storage/v1/object/videos/${path}`;

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
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/${path}`;
          resolve({ path, publicUrl });
        } else {
          let msg = `Upload failed (${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText);
            msg = body.message ?? body.error ?? msg;
          } catch {}
          reject(new Error(msg));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new DOMException("Upload aborted", "AbortError")));

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
