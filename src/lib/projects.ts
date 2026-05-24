import { supabase } from "@/lib/supabase";

export interface VideoProject {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  duration_seconds: number | null;
  status: string;
  created_at: string;
}

export async function insertProject(
  project: Omit<VideoProject, "id" | "created_at">
): Promise<VideoProject> {
  const { data, error } = await supabase
    .from("video_projects")
    .insert(project)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as VideoProject;
}

export async function fetchProjects(): Promise<VideoProject[]> {
  const { data, error } = await supabase
    .from("video_projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as VideoProject[];
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase
    .from("video_projects")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export function formatProjectDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
