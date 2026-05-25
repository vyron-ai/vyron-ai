import { useState, useEffect, useCallback } from "react";
import { VideoProject, fetchProjects, deleteProject } from "@/lib/projects";
import { useAuth } from "@/contexts/AuthContext";

export interface UseProjectsResult {
  projects: VideoProject[];
  loading: boolean;
  error: string | null;
  isLocalFallback: boolean;
  reload: () => void;
  remove: (id: string) => void;
}

export function useProjects(): UseProjectsResult {
  const { user } = useAuth();
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLocalFallback, setIsLocalFallback] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchProjects();
      setProjects(result.projects);
      setIsLocalFallback(result.isLocalFallback);
    } catch (err) {
      setError((err as Error).message);
      setIsLocalFallback(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = useCallback(
    async (id: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      try {
        await deleteProject(id);
      } catch {
        load();
      }
    },
    [load]
  );

  return { projects, loading, error, isLocalFallback, reload: load, remove };
}
