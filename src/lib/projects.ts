import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface VideoProject {
  id: string;
  user_id: string | null;
  file_name: string;
  file_url: string;
  file_size: number;
  duration_seconds: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ── localStorage fallback ────────────────────────────────────────────────────
const LS_KEY = "vyron_projects";

export function loadLocalProjects(): VideoProject[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalProject(project: VideoProject): void {
  try {
    const existing = loadLocalProjects();
    const updated = [project, ...existing.filter((p) => p.id !== project.id)];
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
  } catch {
    // localStorage might be full — fail silently
  }
}

function removeLocalProject(id: string): void {
  try {
    const updated = loadLocalProjects().filter((p) => p.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
  } catch {}
}

/** True when the Supabase error indicates the table doesn't exist yet. */
function isTableMissingError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("relation") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    msg.includes("video_projects")
  );
}

function makeLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Insert a project row.  Falls back to localStorage when:
 *  - Supabase is not configured, OR
 *  - the video_projects table does not exist yet
 */
export async function insertProject(
  project: Omit<VideoProject, "id" | "created_at" | "updated_at">
): Promise<VideoProject> {
  if (!isSupabaseConfigured) {
    const row: VideoProject = {
      ...project,
      id: makeLocalId(),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    saveLocalProject(row);
    return row;
  }

  try {
    const { data, error } = await supabase
      .from("video_projects")
      .insert({ ...project, updated_at: nowIso() })
      .select()
      .single();

    if (error) {
      if (isTableMissingError(error)) {
        const row: VideoProject = {
          ...project,
          id: makeLocalId(),
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        saveLocalProject(row);
        return row;
      }
      throw new Error(error.message);
    }

    const row = data as VideoProject;
    saveLocalProject(row);
    return row;
  } catch (err) {
    if (isTableMissingError(err)) {
      const row: VideoProject = {
        ...project,
        id: makeLocalId(),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      saveLocalProject(row);
      return row;
    }
    throw err;
  }
}

export interface FetchProjectsResult {
  projects: VideoProject[];
  isLocalFallback: boolean;
}

/**
 * Fetch all projects for the current user.
 * Falls back to localStorage when the table is missing.
 */
export async function fetchProjects(): Promise<FetchProjectsResult> {
  if (!isSupabaseConfigured) {
    return { projects: loadLocalProjects(), isLocalFallback: true };
  }

  try {
    const { data, error } = await supabase
      .from("video_projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      if (isTableMissingError(error)) {
        return { projects: loadLocalProjects(), isLocalFallback: true };
      }
      throw new Error(error.message);
    }

    return { projects: (data ?? []) as VideoProject[], isLocalFallback: false };
  } catch (err) {
    if (isTableMissingError(err)) {
      return { projects: loadLocalProjects(), isLocalFallback: true };
    }
    throw err;
  }
}

/**
 * Delete a project.  Removes from localStorage too (handles both paths).
 */
export async function deleteProject(id: string): Promise<void> {
  removeLocalProject(id);

  if (!isSupabaseConfigured) return;

  if (id.startsWith("local-")) return;

  try {
    const { error } = await supabase
      .from("video_projects")
      .delete()
      .eq("id", id);

    if (error && !isTableMissingError(error)) {
      throw new Error(error.message);
    }
  } catch (err) {
    if (!isTableMissingError(err)) throw err;
  }
}

// ── Formatting helpers ───────────────────────────────────────────────────────
export function formatProjectDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** SQL to create the video_projects table (for display in the UI). */
export const VIDEO_PROJECTS_SQL = `-- Run in Supabase → SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS public.video_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name    TEXT        NOT NULL,
  file_url     TEXT        NOT NULL,
  file_size    BIGINT      NOT NULL DEFAULT 0,
  duration_seconds NUMERIC,
  status       TEXT        NOT NULL DEFAULT 'uploaded',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own projects"   ON public.video_projects FOR SELECT    TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own projects" ON public.video_projects FOR INSERT    TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own projects" ON public.video_projects FOR UPDATE    TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own projects" ON public.video_projects FOR DELETE    TO authenticated USING (auth.uid() = user_id);`;
