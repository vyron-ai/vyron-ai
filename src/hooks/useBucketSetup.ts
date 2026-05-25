import { useState, useCallback } from "react";
import { setupVideosBucket, SetupResult } from "@/lib/bucketSetup";
import { isAdminConfigured } from "@/lib/supabaseAdmin";

export type SetupPhase = "idle" | "loading" | "done" | "error";

export interface UseBucketSetupResult {
  phase: SetupPhase;
  result: SetupResult | null;
  adminConfigured: boolean;
  run: () => Promise<void>;
  reset: () => void;
}

export function useBucketSetup(onSuccess?: () => void): UseBucketSetupResult {
  const [phase, setPhase] = useState<SetupPhase>("idle");
  const [result, setResult] = useState<SetupResult | null>(null);

  const run = useCallback(async () => {
    setPhase("loading");
    setResult(null);
    const res = await setupVideosBucket();
    setResult(res);
    if (res.error) {
      setPhase("error");
    } else {
      setPhase("done");
      onSuccess?.();
    }
  }, [onSuccess]);

  const reset = useCallback(() => {
    setPhase("idle");
    setResult(null);
  }, []);

  return { phase, result, adminConfigured: isAdminConfigured, run, reset };
}
