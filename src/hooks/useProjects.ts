import { useState, useEffect, useCallback } from "react";
import { VideoProject, fetchProjects, deleteProject } from "@/lib/projects";
import { useAuth } from "@/contexts/AuthContext";

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchProjects();
      setProjects(rows);
    } catch (err) {
      setError((err as Error).message);
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

  return { projects, loading, error, reload: load, remove };
}
