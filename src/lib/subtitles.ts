export interface SubtitleSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface SubtitleSession {
  videoUrl: string;
  subtitles: SubtitleSegment[];
  createdAt: string;
}

const LS_KEY = "vyron_subtitles";

export function loadSubtitleSessions(): SubtitleSession[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveSubtitleSession(
  videoUrl: string,
  subtitles: SubtitleSegment[]
): void {
  try {
    const existing = loadSubtitleSessions().filter((s) => s.videoUrl !== videoUrl);
    existing.unshift({ videoUrl, subtitles, createdAt: new Date().toISOString() });
    localStorage.setItem(LS_KEY, JSON.stringify(existing.slice(0, 20)));
  } catch {
    // localStorage full — fail silently
  }
}

export function loadSubtitlesForUrl(videoUrl: string): SubtitleSegment[] {
  return (
    loadSubtitleSessions().find((s) => s.videoUrl === videoUrl)?.subtitles ?? []
  );
}

export function clearSubtitlesForUrl(videoUrl: string): void {
  try {
    const updated = loadSubtitleSessions().filter((s) => s.videoUrl !== videoUrl);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
  } catch {}
}

/** ms → "M:SS" */
export function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
