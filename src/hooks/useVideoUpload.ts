import { useState, useCallback, useRef } from "react";
import { uploadVideoXHR, formatBytes, getVideoDuration } from "@/lib/storage";
import { insertProject } from "@/lib/projects";
import { useAuth } from "@/contexts/AuthContext";

export type UploadStatus = "uploading" | "done" | "error" | "aborted";

export interface UploadJob {
  id: string;
  file: File;
  name: string;
  size: string;
  progress: number;
  status: UploadStatus;
  publicUrl: string | null;
  durationSeconds: number | null;
  error: string | null;
}

export function useVideoUpload(onProjectSaved?: () => void) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const { user } = useAuth();
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const updateJob = useCallback((id: string, patch: Partial<UploadJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const userId = user?.id ?? "anonymous";

      for (const file of files) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const job: UploadJob = {
          id,
          file,
          name: file.name,
          size: formatBytes(file.size),
          progress: 0,
          status: "uploading",
          publicUrl: null,
          durationSeconds: null,
          error: null,
        };

        setJobs((prev) => [...prev, job]);

        const controller = new AbortController();
        abortControllers.current.set(id, controller);

        // Extract duration before uploading
        getVideoDuration(file).then((durationSeconds) => {
          updateJob(id, { durationSeconds });
        });

        uploadVideoXHR(
          file,
          userId,
          (percent) => updateJob(id, { progress: percent }),
          controller.signal
        )
          .then(async ({ publicUrl }) => {
            const durationSeconds = await getVideoDuration(file).catch(() => null);
            updateJob(id, { status: "done", progress: 100, publicUrl, durationSeconds });
            abortControllers.current.delete(id);

            if (user) {
              try {
                await insertProject({
                  user_id: user.id,
                  file_name: file.name,
                  file_url: publicUrl,
                  file_size: file.size,
                  duration_seconds: durationSeconds,
                  status: "uploaded",
                });
                onProjectSaved?.();
              } catch (err) {
                console.warn("[VYRON] Project row insert failed:", err);
              }
            }
          })
          .catch((err: Error) => {
            if (err.name === "AbortError") {
              updateJob(id, { status: "aborted", progress: 0 });
            } else {
              updateJob(id, { status: "error", error: err.message });
            }
            abortControllers.current.delete(id);
          });
      }
    },
    [user, updateJob, onProjectSaved]
  );

  const cancelJob = useCallback((id: string) => {
    abortControllers.current.get(id)?.abort();
  }, []);

  const removeJob = useCallback((id: string) => {
    abortControllers.current.get(id)?.abort();
    abortControllers.current.delete(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const activeCount = jobs.filter((j) => j.status === "uploading").length;
  const doneCount = jobs.filter((j) => j.status === "done").length;

  return { jobs, addFiles, cancelJob, removeJob, activeCount, doneCount };
}
