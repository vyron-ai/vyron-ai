/**
 * bucketSetup — browser-safe bucket setup helpers.
 *
 * Bucket creation is delegated to the /api/setup-bucket endpoint which runs
 * inside the Vite dev-server (see vite.config.ts).  No service-role key is
 * ever read or used here.
 */

export const SETUP_BUCKET = "videos";

export interface SetupResult {
  bucketCreated: boolean;
  bucketAlreadyExisted: boolean;
  policiesCreated: boolean;
  policySQL: string;
  error: string | null;
  serviceKeyMissing?: boolean;
}

/** SQL to paste in Supabase → SQL Editor to create storage policies. */
export function buildPolicySQL(bucket = SETUP_BUCKET): string {
  return `-- Run this in Supabase → SQL Editor → New query → Run

-- Allow authenticated users to upload videos
CREATE POLICY "Allow authenticated uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = '${bucket}');

-- Allow authenticated users to read videos
CREATE POLICY "Allow authenticated reads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = '${bucket}');

-- Allow users to update their own videos
CREATE POLICY "Allow owner updates"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = '${bucket}' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = '${bucket}');

-- Allow users to delete their own videos
CREATE POLICY "Allow owner deletes"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = '${bucket}' AND auth.uid()::text = (storage.foldername(name))[1]);`;
}

/**
 * Creates the videos bucket by calling the Vite dev-server API route.
 * The API route reads SUPABASE_SERVICE_ROLE_KEY from process.env (server-only).
 * This function is safe to call from the browser — it never touches any secret.
 */
export async function setupVideosBucket(): Promise<SetupResult> {
  try {
    const res = await fetch("/api/setup-bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: SETUP_BUCKET }),
    });

    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      const errMsg = (data.error as string) ?? `Server error ${res.status}`;
      const serviceKeyMissing = errMsg.toLowerCase().includes("supabase_service_role_key");
      return {
        bucketCreated: false,
        bucketAlreadyExisted: false,
        policiesCreated: false,
        policySQL: buildPolicySQL(),
        error: errMsg,
        serviceKeyMissing,
      };
    }

    return {
      bucketCreated: Boolean(data.bucketCreated),
      bucketAlreadyExisted: Boolean(data.bucketAlreadyExisted),
      policiesCreated: Boolean(data.policiesCreated),
      policySQL: data.policiesCreated ? "" : buildPolicySQL(),
      error: null,
      serviceKeyMissing: false,
    };
  } catch (err) {
    return {
      bucketCreated: false,
      bucketAlreadyExisted: false,
      policiesCreated: false,
      policySQL: buildPolicySQL(),
      error: err instanceof Error ? err.message : "Network error reaching /api/setup-bucket",
      serviceKeyMissing: false,
    };
  }
}
