import { useState, useCallback } from "react";
import { setupVideosBucket, SetupResult } from "@/lib/bucketSetup";

export type SetupPhase = "idle" | "loading" | "done" | "error";

export interface UseBucketSetupResult {
  phase: SetupPhase;
  result: SetupResult | null;
  run: () => Promise<void>;
  reset: () => void;
}

export function useBucketSetup(onSuccess?: () => void): UseBucketSetupResult {
  const [phase, setPhase] = useState<SetupPhase>("idle");
  const [result, setResult] = useState<SetupResult | null>(null);

  const run = useCallback(async () => {
    setPhase("loading");
    setResult(null);
    try {
      const res = await setupVideosBucket();
      setResult(res);
      setPhase(res.error ? "error" : "done");
      if (!res.error) onSuccess?.();
    } catch (err) {
      setResult({
        bucketCreated: false,
        bucketAlreadyExisted: false,
        policiesCreated: false,
        policySQL: "",
        error: err instanceof Error ? err.message : "Unexpected error",
      });
      setPhase("error");
    }
  }, [onSuccess]);

  const reset = useCallback(() => {
    setPhase("idle");
    setResult(null);
  }, []);

  return { phase, result, run, reset };
}
