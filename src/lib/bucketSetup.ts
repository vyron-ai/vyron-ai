import { supabaseAdmin, isAdminConfigured, getProjectRef } from "@/lib/supabaseAdmin";

export const SETUP_BUCKET = "videos";

export interface SetupResult {
  bucketCreated: boolean;
  bucketAlreadyExisted: boolean;
  policiesCreated: boolean;
  policySQL: string;
  error: string | null;
}

/** SQL that grants authenticated users INSERT, SELECT, UPDATE and DELETE on the videos bucket. */
export function buildPolicySQL(bucket = SETUP_BUCKET): string {
  return `-- Run this in your Supabase project → SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)

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
 * Try to apply storage policies via the Supabase Management API.
 * This requires a Personal Access Token as the bearer — service-role keys
 * do NOT work with api.supabase.com, so this will 401 in most setups.
 * We catch silently and return false so the caller can fall back to showing SQL.
 */
async function tryManagementAPIPolicies(bucket: string): Promise<boolean> {
  const ref = getProjectRef();
  const serviceKey = (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string) ?? "";
  if (!ref || !serviceKey) return false;

  const sql = buildPolicySQL(bucket)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--") && l.trim())
    .join(" ");

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Main entry point for the one-click bucket setup button. */
export async function setupVideosBucket(): Promise<SetupResult> {
  if (!isAdminConfigured || !supabaseAdmin) {
    return {
      bucketCreated: false,
      bucketAlreadyExisted: false,
      policiesCreated: false,
      policySQL: buildPolicySQL(),
      error: "VITE_SUPABASE_SERVICE_ROLE_KEY is not configured. Add it in Replit Secrets.",
    };
  }

  let bucketCreated = false;
  let bucketAlreadyExisted = false;

  const { error: createErr } = await supabaseAdmin.storage.createBucket(SETUP_BUCKET, {
    public: false,
    fileSizeLimit: 2 * 1024 * 1024 * 1024,
    allowedMimeTypes: ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"],
  });

  if (createErr) {
    const msg = createErr.message ?? "";
    if (
      msg.toLowerCase().includes("already exists") ||
      msg.toLowerCase().includes("duplicate") ||
      (createErr as { statusCode?: string }).statusCode === "23505"
    ) {
      bucketAlreadyExisted = true;
    } else {
      return {
        bucketCreated: false,
        bucketAlreadyExisted: false,
        policiesCreated: false,
        policySQL: buildPolicySQL(),
        error: `Bucket creation failed: ${msg}`,
      };
    }
  } else {
    bucketCreated = true;
  }

  const policiesCreated = await tryManagementAPIPolicies(SETUP_BUCKET);
  const policySQL = policiesCreated ? "" : buildPolicySQL();

  return {
    bucketCreated,
    bucketAlreadyExisted,
    policiesCreated,
    policySQL,
    error: null,
  };
}
