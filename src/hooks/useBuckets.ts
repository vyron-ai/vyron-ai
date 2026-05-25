import { useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface BucketInfo {
  id: string;
  name: string;
  public: boolean;
}

const LS_KEY = "vyron_upload_bucket";
const PREFERRED = "videos";

export interface UseBucketsResult {
  buckets: BucketInfo[];
  loading: boolean;
  error: string | null;
  selectedBucket: string | null;
  setSelectedBucket: (name: string) => void;
  refetch: () => void;
}

export function useBuckets(): UseBucketsResult {
  const [buckets, setBuckets] = useState<BucketInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucketState] = useState<string | null>(
    () => localStorage.getItem(LS_KEY) ?? null
  );

  const setSelectedBucket = useCallback((name: string) => {
    localStorage.setItem(LS_KEY, name);
    setSelectedBucketState(name);
  }, []);

  const fetchBuckets = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: sbErr } = await supabase.storage.listBuckets();
      if (sbErr) {
        setError(sbErr.message);
        setLoading(false);
        return;
      }

      const list: BucketInfo[] = (data ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        public: b.public ?? false,
      }));

      setBuckets(list);

      // Auto-select: prefer saved value → "videos" → first available
      const saved = localStorage.getItem(LS_KEY);
      const savedStillExists = saved && list.some((b) => b.name === saved);

      if (savedStillExists) {
        // keep current selection
      } else if (list.some((b) => b.name === PREFERRED)) {
        setSelectedBucket(PREFERRED);
      } else if (list.length > 0) {
        setSelectedBucket(list[0].name);
      } else {
        setSelectedBucketState(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list buckets");
    } finally {
      setLoading(false);
    }
  }, [setSelectedBucket]);

  useEffect(() => {
    fetchBuckets();
  }, [fetchBuckets]);

  return { buckets, loading, error, selectedBucket, setSelectedBucket, refetch: fetchBuckets };
}
