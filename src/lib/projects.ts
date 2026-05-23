import { supabase } from "@/lib/supabase";

export interface VideoProject {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  status: string;
  created_at: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

const BASE = "/api";

export async function insertProject(
  project: Omit<VideoProject, "id" | "created_at">
): Promise<VideoProject> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify(project),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<VideoProject>;
}

export async function fetchProjects(): Promise<VideoProject[]> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/projects`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<VideoProject[]>;
}

export async function deleteProject(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/projects/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

export function formatProjectDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
