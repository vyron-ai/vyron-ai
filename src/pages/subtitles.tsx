import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Captions, RefreshCw, AlertCircle, CheckCircle2,
  Loader2, Play, Trash2, Copy, CheckCheck, Clock, Sparkles,
  ExternalLink, Zap, Film, Mic, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SubtitleSegment,
  saveSubtitleSession,
  loadSubtitlesForUrl,
  clearSubtitlesForUrl,
  formatMs,
} from "@/lib/subtitles";

// ── Preset definitions ────────────────────────────────────────────────────────
type SubtitlePreset = "viral" | "documentary" | "podcast";

interface PresetDef {
  id: SubtitlePreset;
  label: string;
  icon: React.ReactNode;
  description: string;
  container: React.CSSProperties;
  activeWord: React.CSSProperties;
  inactiveWord: React.CSSProperties;
  activeFontSize: string;
  inactiveFontSize: string;
  accentColor: string;
}

const PRESETS: Record<SubtitlePreset, PresetDef> = {
  viral: {
    id: "viral",
    label: "Viral",
    icon: <Zap className="w-3.5 h-3.5" />,
    description: "Bold · Energetic · Reels / TikTok",
    accentColor: "#f59e0b",
    container: {
      background:
        "linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.18) 60%, rgba(0,0,0,0) 100%)",
      borderRadius: 0,
      padding: "28px 18px 12px",
      backdropFilter: "none",
      WebkitBackdropFilter: "none",
    },
    activeWord: {
      color: "#fde047",
      fontWeight: 900,
      letterSpacing: "-0.035em",
      textShadow:
        "0 0 28px rgba(253,224,71,0.5), 0 0 52px rgba(253,200,40,0.22), 0 4px 18px rgba(0,0,0,0.72), 0 1px 4px rgba(0,0,0,0.55)",
      animation: "wordSpring 320ms cubic-bezier(0.34,1.56,0.64,1) both",
    },
    inactiveWord: {
      color: "rgba(255,255,255,0.5)",
      fontWeight: 800,
      letterSpacing: "-0.01em",
      textShadow: "0 2px 10px rgba(0,0,0,0.68)",
    },
    activeFontSize: "clamp(20px, 6vw, 28px)",
    inactiveFontSize: "clamp(17px, 5.2vw, 24px)",
  },
  documentary: {
    id: "documentary",
    label: "Documentary",
    icon: <Film className="w-3.5 h-3.5" />,
    description: "Elegant · Cinematic · Editorial",
    accentColor: "#7dd3fc",
    container: {
      background: "rgba(0,0,0,0.2)",
      borderRadius: 20,
      padding: "7px 22px 9px",
      backdropFilter: "blur(3px)",
      WebkitBackdropFilter: "blur(3px)",
      border: "1px solid rgba(255,255,255,0.05)",
    },
    activeWord: {
      color: "#ffffff",
      fontWeight: 800,
      letterSpacing: "-0.018em",
      textShadow:
        "0 0 20px rgba(150,205,255,0.45), 0 3px 18px rgba(0,0,0,0.68)",
      transform: "scale(1.07)",
    },
    inactiveWord: {
      color: "rgba(255,255,255,0.38)",
      fontWeight: 600,
      letterSpacing: "0.018em",
      textShadow: "0 1px 8px rgba(0,0,0,0.55)",
    },
    activeFontSize: "clamp(16px, 4.8vw, 22px)",
    inactiveFontSize: "clamp(14px, 4.2vw, 19px)",
  },
  podcast: {
    id: "podcast",
    label: "Podcast",
    icon: <Mic className="w-3.5 h-3.5" />,
    description: "Clean · Legible · Minimal",
    accentColor: "#a78bfa",
    container: {
      background: "rgba(8,8,12,0.62)",
      borderRadius: 13,
      padding: "9px 18px 11px",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.08)",
    },
    activeWord: {
      color: "#ffffff",
      fontWeight: 900,
      letterSpacing: "-0.022em",
      textShadow: "0 3px 22px rgba(0,0,0,0.72), 0 1px 6px rgba(0,0,0,0.55)",
      transform: "scale(1.05)",
    },
    inactiveWord: {
      color: "rgba(255,255,255,0.5)",
      fontWeight: 700,
      letterSpacing: "0.004em",
      textShadow: "0 1px 8px rgba(0,0,0,0.55)",
    },
    activeFontSize: "clamp(17px, 5.2vw, 24px)",
    inactiveFontSize: "clamp(15px, 4.6vw, 21px)",
  },
};

// ── Keyframes ─────────────────────────────────────────────────────────────────
const CINEMATIC_STYLES = `
@keyframes subtitleFadeUp {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}
@keyframes wordSpring {
  0%   { transform: scale(1);    }
  35%  { transform: scale(1.22); }
  60%  { transform: scale(1.13); }
  80%  { transform: scale(1.18); }
  100% { transform: scale(1.16); }
}
`;

// ── Merge very short / single-word segments for smoother reading ──────────────
function mergeShortSegments(
  segs: SubtitleSegment[],
  minDurationMs = 950
): SubtitleSegment[] {
  if (segs.length <= 1) return segs;
  const result: SubtitleSegment[] = [];
  let i = 0;
  while (i < segs.length) {
    const seg = segs[i];
    const dur = seg.end - seg.start;
    const wordCount = seg.text.trim().split(/\s+/).filter(Boolean).length;
    if ((dur < minDurationMs || wordCount <= 1) && i < segs.length - 1) {
      const next = segs[i + 1];
      result.push({
        id: seg.id,
        start: seg.start,
        end: next.end,
        text: seg.text.trim() + " " + next.text.trim(),
      });
      i += 2;
    } else {
      result.push(seg);
      i++;
    }
  }
  const stillShort = result.some(
    (s, idx) => idx < result.length - 1 && s.end - s.start < minDurationMs
  );
  if (stillShort && result.length < segs.length) {
    return mergeShortSegments(result, minDurationMs);
  }
  return result;
}

// ── Active-word highlight helper ─────────────────────────────────────────────
function getActiveWordIndex(seg: SubtitleSegment, currentMs: number): number {
  const words = seg.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const dur = Math.max(seg.end - seg.start, 300);
  const elapsed = Math.max(currentMs - seg.start, 0);
  const progress = Math.min(elapsed / dur, 1);
  return Math.min(words.length - 1, Math.floor(progress * words.length));
}

// ── Cinematic subtitle overlay ────────────────────────────────────────────────
function SubtitleOverlay({
  segment,
  currentMs,
  preset,
  scale = 1,
  positionPct = 0,
}: {
  segment: SubtitleSegment | undefined;
  currentMs: number;
  preset: SubtitlePreset;
  scale?: number;
  positionPct?: number;
}) {
  if (!segment) return null;

  const p = PRESETS[preset];
  const words = segment.text.trim().split(/\s+/).filter(Boolean);
  const activeIdx = getActiveWordIndex(segment, currentMs);
  const isViral = preset === "viral";

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingLeft: isViral ? 0 : 14,
        paddingRight: isViral ? 0 : 14,
        paddingBottom: isViral
          ? `${positionPct}%`
          : `calc(${positionPct}% + 50px)`,
      }}
    >
      <style>{CINEMATIC_STYLES}</style>
      <div
        style={{
          ...p.container,
          animation: "subtitleFadeUp 220ms cubic-bezier(0.22,1,0.36,1) both",
          textAlign: "center",
          width: isViral ? "100%" : undefined,
          maxWidth: isViral ? undefined : "100%",
          lineHeight: 1.42,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: "center bottom",
        }}
      >
        {words.map((word, i) => {
          const active = i === activeIdx;
          const baseStyle = active ? p.activeWord : p.inactiveWord;
          // For viral, key active word uniquely so it remounts → re-fires spring animation
          const spanKey = preset === "viral" && active
            ? `active-${activeIdx}`
            : `${i}`;
          return (
            <span
              key={spanKey}
              style={{
                display: "inline-block",
                marginRight: "0.3em",
                marginBottom: "0.1em",
                fontSize: active ? p.activeFontSize : p.inactiveFontSize,
                fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
                transformOrigin: "center bottom",
                transition: preset === "viral" && active
                  ? "color 120ms ease, font-weight 120ms ease, text-shadow 120ms ease"
                  : "color 150ms ease, font-weight 150ms ease, transform 155ms cubic-bezier(0.34,1.56,0.64,1), text-shadow 150ms ease",
                willChange: "transform, color, text-shadow",
                ...baseStyle,
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Preset selector ───────────────────────────────────────────────────────────
function PresetSelector({
  value,
  onChange,
}: {
  value: SubtitlePreset;
  onChange: (p: SubtitlePreset) => void;
}) {
  const options: SubtitlePreset[] = ["viral", "documentary", "podcast"];
  const active = PRESETS[value];

  return (
    <div className="flex flex-col gap-2.5 w-full max-w-[400px] mx-auto">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
          Caption Style
        </span>
        <span className="text-[10px] text-muted-foreground/70 tracking-wide">
          {active.description}
        </span>
      </div>
      <div className="flex gap-2">
        {options.map((id) => {
          const p = PRESETS[id];
          const isActive = value === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex-1 relative flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200"
              style={
                isActive
                  ? {
                      background: `rgba(${
                        id === "viral" ? "245,158,11" : id === "documentary" ? "125,211,252" : "167,139,250"
                      },0.12)`,
                      color: p.accentColor,
                      border: `1px solid ${p.accentColor}30`,
                      boxShadow: `0 0 16px ${p.accentColor}22, inset 0 0 12px ${p.accentColor}08`,
                    }
                  : {
                      background: "rgba(255,255,255,0.03)",
                      color: "rgba(255,255,255,0.38)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }
              }
            >
              <span
                style={{
                  opacity: isActive ? 1 : 0.5,
                  transition: "opacity 200ms ease",
                }}
              >
                {p.icon}
              </span>
              {p.label}
              {isActive && (
                <span
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-6 h-px rounded-full"
                  style={{ background: p.accentColor, opacity: 0.7 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Spinning loading messages ─────────────────────────────────────────────────
const LOADING_MSGS = [
  "Submitting to AssemblyAI…",
  "Uploading audio for analysis…",
  "Transcribing speech…",
  "Detecting language…",
  "Aligning words to timestamps…",
  "Segmenting into subtitle blocks…",
  "Almost done…",
];

function useRotatingMessage(active: boolean): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) { setIdx(0); return; }
    const t = setInterval(
      () => setIdx((i) => Math.min(i + 1, LOADING_MSGS.length - 1)),
      6000
    );
    return () => clearInterval(t);
  }, [active]);
  return LOADING_MSGS[idx];
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SubtitlesPage() {
  const params = new URLSearchParams(window.location.search);
  const initialUrl = params.get("videoUrl") ?? "";

  const [videoUrl, setVideoUrl] = useState(initialUrl);
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>(() =>
    initialUrl ? mergeShortSegments(loadSubtitlesForUrl(initialUrl)) : []
  );
  const [currentMs, setCurrentMs] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(
    () => initialUrl ? loadSubtitlesForUrl(initialUrl).length > 0 : false
  );
  const [copied, setCopied] = useState(false);
  const [preset, setPreset] = useState<SubtitlePreset>("viral");
  const [exportState, setExportState] = useState<"idle"|"preparing"|"rendering"|"done"|"failed">("idle");
  const [exportError, setExportError] = useState("");
  const [subtitleScale, setSubtitleScale] = useState(1.5);
  const [subtitlePosition, setSubtitlePosition] = useState(35);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const loadingMsg = useRotatingMessage(generating);

  const currentSegment = useMemo(
    () => subtitles.find((s) => currentMs >= s.start && currentMs <= s.end),
    [subtitles, currentMs]
  );

  useEffect(() => {
    if (!currentSegment || !timelineRef.current) return;
    const el = timelineRef.current.querySelector(
      `[data-seg="${currentSegment.id}"]`
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentSegment]);

  async function generate() {
    if (!videoUrl.trim()) {
      setError("Enter a public video URL first.");
      return;
    }
    setError("");
    setGenerating(true);
    setFromCache(false);

    try {
      const res = await fetch("/api/subtitles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: videoUrl.trim() }),
      });

      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch {}

      if (!res.ok || !data.success) {
        throw new Error((data.error as string) ?? `Server error ${res.status}`);
      }

      const segs = mergeShortSegments(
        (data.subtitles as SubtitleSegment[]) ?? []
      );
      setSubtitles(segs);
      saveSubtitleSession(videoUrl.trim(), segs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subtitle generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function clearSubtitles() {
    clearSubtitlesForUrl(videoUrl);
    setSubtitles([]);
    setFromCache(false);
  }

  function copyTranscript() {
    const text = subtitles.map((s) => s.text).join(" ");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function msToSrtTime(ms: number): string {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    const f = ms % 1_000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(f).padStart(3, "0")}`;
  }

  function exportSrt() {
    const lines = subtitles.map((seg, i) =>
      `${i + 1}\n${msToSrtTime(seg.start)} --> ${msToSrtTime(seg.end)}\n${seg.text}`
    );
    const blob = new Blob([lines.join("\n\n") + "\n"], { type: "text/plain;charset=utf-8" });
    const today = new Date();
    const ymd =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `subtitles-${ymd}.srt`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  }

  async function exportMp4() {
    if (!videoUrl.trim() || subtitles.length === 0) return;
    setExportState("preparing");
    setExportError("");

    try {
      setExportState("rendering");
      const res = await fetch("/api/export/mp4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: videoUrl.trim(), subtitles, preset, subtitleScale, subtitlePosition }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || contentType.includes("application/json")) {
        const data = await res.json();
        throw new Error(data.error ?? `Export failed (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      const today = new Date();
      const ymd =
        today.getFullYear().toString() +
        String(today.getMonth() + 1).padStart(2, "0") +
        String(today.getDate()).padStart(2, "0");
      const mp4Url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = mp4Url;
      a.download = `subtitles-${ymd}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(mp4Url), 60_000);
      setExportState("done");
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "MP4 export failed");
      setExportState("failed");
    }
  }

  const apiMissing =
    error.toLowerCase().includes("assemblyai_api_key") ||
    error.toLowerCase().includes("not set");

  return (
    <AppLayout title="Subtitles">
      <div className="p-4 md:p-6 max-w-7xl mx-auto w-full flex flex-col gap-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                <Captions className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                AI Subtitle Studio
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight leading-none">
              Cinema Subtitles
            </h1>
          </div>
          {videoUrl && (
            <a href={videoUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0 h-8">
                <ExternalLink className="w-3 h-3" /> Source
              </Button>
            </a>
          )}
        </div>

        {/*
          ── Main layout ──
          Mobile:  video → preset → controls → timeline  (flex-col)
          Desktop: controls (left) | video+preset (right)  (flex-row via lg:)
          We use CSS `order` so video appears first in DOM for mobile
          but controls render first on desktop via order inversion.
        */}
        <div className="flex flex-col lg:flex-row lg:gap-8 lg:items-start gap-5">

          {/* ── VIDEO + PRESET — order-1 on mobile (top), order-2 on desktop (right) ── */}
          <div className="order-1 lg:order-2 lg:flex-1 flex flex-col items-center gap-4">

            {/* Preset selector */}
            <PresetSelector value={preset} onChange={setPreset} />

            {/* ── Caption Appearance controls ── */}
            <div className="glass border border-border rounded-xl p-3 w-full max-w-[400px] mx-auto flex flex-col gap-2.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em] px-0.5">
                Caption Appearance
              </span>

              {/* Size row */}
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-muted-foreground/70 w-14 shrink-0">Size</span>
                <button
                  onClick={() => setSubtitleScale(s => Math.max(0.7, parseFloat((s - 0.1).toFixed(1))))}
                  className="w-7 h-7 rounded-lg border border-border/60 bg-card/40 flex items-center justify-center text-base leading-none text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors select-none"
                >−</button>
                <span className="flex-1 text-center text-xs font-mono tabular-nums text-foreground">
                  {subtitleScale.toFixed(1)}×
                </span>
                <button
                  onClick={() => setSubtitleScale(s => Math.min(1.5, parseFloat((s + 0.1).toFixed(1))))}
                  className="w-7 h-7 rounded-lg border border-border/60 bg-card/40 flex items-center justify-center text-base leading-none text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors select-none"
                >+</button>
                {subtitleScale !== 1.5 && (
                  <button
                    onClick={() => setSubtitleScale(1.5)}
                    className="text-[10px] text-muted-foreground/40 hover:text-primary transition-colors ml-0.5"
                  >reset</button>
                )}
              </div>

              {/* Position row */}
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-muted-foreground/70 w-14 shrink-0">Position</span>
                <span className="text-[10px] text-muted-foreground/35 select-none">↓</span>
                <input
                  type="range"
                  min={3}
                  max={55}
                  step={1}
                  value={subtitlePosition}
                  onChange={e => setSubtitlePosition(Number(e.target.value))}
                  className="flex-1 accent-primary cursor-pointer"
                  style={{ accentColor: "hsl(var(--primary))" }}
                />
                <span className="text-[10px] text-muted-foreground/35 select-none">↑</span>
                {subtitlePosition !== 35 && (
                  <button
                    onClick={() => setSubtitlePosition(35)}
                    className="text-[10px] text-muted-foreground/40 hover:text-primary transition-colors ml-0.5"
                  >reset</button>
                )}
              </div>
            </div>

            {/* Phone-frame preview */}
            <div
              className="relative mx-auto w-full max-w-[360px] lg:max-w-[310px] overflow-hidden bg-black"
              style={{
                aspectRatio: "9 / 16",
                borderRadius: 36,
                border: "1.5px solid rgba(255,255,255,0.09)",
                boxShadow:
                  "0 0 0 1px rgba(0,0,0,0.4), 0 32px 100px rgba(0,0,0,0.55), 0 8px 32px rgba(0,0,0,0.3)",
              }}
            >
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                  onTimeUpdate={(e) =>
                    setCurrentMs(e.currentTarget.currentTime * 1000)
                  }
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <Play className="w-6 h-6 opacity-30 ml-0.5" />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.15em] opacity-25">
                    No video
                  </span>
                </div>
              )}

              <SubtitleOverlay
                key={`${currentSegment?.id ?? -1}-${preset}`}
                segment={currentSegment}
                currentMs={currentMs}
                preset={preset}
                scale={subtitleScale}
                positionPct={subtitlePosition}
              />
            </div>

            {/* Preview legend */}
            {subtitles.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Tap a segment below to jump to that moment
              </div>
            )}
          </div>

          {/* ── CONTROLS + TIMELINE — order-2 on mobile (bottom), order-1 on desktop (left) ── */}
          <div className="order-2 lg:order-1 lg:w-[400px] flex flex-col gap-4">

            {/* URL input */}
            <div className="glass border border-border rounded-xl p-4 flex flex-col gap-3">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                Video URL
              </label>
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://…/videos/my-video.mp4"
                className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                Must be a publicly accessible video URL.
                Videos uploaded via VYRON AI already have a public URL.
              </p>
            </div>

            {/* Generate button */}
            <button
              onClick={generate}
              disabled={generating || !videoUrl.trim()}
              className={`flex items-center justify-center gap-2 w-full h-11 rounded-xl text-sm font-bold transition-all border
                ${generating
                  ? "bg-primary/10 border-primary/20 text-primary cursor-not-allowed"
                  : !videoUrl.trim()
                  ? "bg-muted/60 border-border/60 text-muted-foreground cursor-not-allowed"
                  : "bg-primary border-primary/40 text-primary-foreground hover:bg-primary/90 electric-glow cursor-pointer"
                }`}
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {loadingMsg}</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Generate Subtitles</>
              )}
            </button>

            {/* Loading hint */}
            {generating && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground/70 px-1">
                <Clock className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                30–120 seconds depending on video length. Keep this tab open.
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex flex-col gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive break-words">{error}</p>
                </div>
                {apiMissing && (
                  <div className="text-xs text-muted-foreground bg-card/50 px-3 py-2 rounded-lg border border-border">
                    Add{" "}
                    <code className="text-primary bg-primary/10 px-1 rounded font-mono">
                      ASSEMBLYAI_API_KEY
                    </code>{" "}
                    to Replit Secrets (no{" "}
                    <code className="font-mono">VITE_</code> prefix), then restart.
                  </div>
                )}
              </div>
            )}

            {/* Cache notice + actions */}
            {subtitles.length > 0 && (
              <>
              <div className="flex items-center justify-between gap-2 px-0.5">
                <div className="flex items-center gap-1.5 text-xs">
                  {fromCache ? (
                    <>
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-400">From cache</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-green-400">
                        {subtitles.length} segments
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportSrt}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    title="Download .srt file"
                  >
                    <Download className="w-3.5 h-3.5" /> SRT
                  </button>
                  <button
                    onClick={exportMp4}
                    disabled={exportState === "preparing" || exportState === "rendering"}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Export MP4 with burned-in subtitles"
                  >
                    {exportState === "preparing" || exportState === "rendering" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Film className="w-3.5 h-3.5" />
                    )}
                    {exportState === "preparing"
                      ? "Preparing…"
                      : exportState === "rendering"
                      ? "Rendering…"
                      : "MP4"}
                  </button>
                  <button
                    onClick={copyTranscript}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {copied ? (
                      <CheckCheck className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={clearSubtitles}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear
                  </button>
                  <button
                    onClick={generate}
                    disabled={generating}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`}
                    />
                    Redo
                  </button>
                </div>
              </div>

              {/* MP4 export status */}
              {exportState === "done" && (
                <div className="flex items-center gap-1.5 px-0.5 text-xs text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  MP4 downloaded — click MP4 again to re-export.
                </div>
              )}
              {exportState === "failed" && exportError && (
                <div className="flex items-center gap-1.5 px-0.5 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {exportError}
                </div>
              )}
              </>
            )}

            {/* Subtitle timeline */}
            {subtitles.length > 0 && (
              <div className="glass border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.1em]">
                    Timeline
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {subtitles.length} segments
                  </span>
                </div>
                <div
                  ref={timelineRef}
                  className="flex flex-col gap-0.5 p-1.5 max-h-[340px] overflow-y-auto"
                >
                  {subtitles.map((seg) => {
                    const isActive = currentSegment?.id === seg.id;
                    return (
                      <div
                        key={seg.id}
                        data-seg={seg.id}
                        className={`px-3 py-2 rounded-lg cursor-pointer transition-all text-sm ${
                          isActive
                            ? "bg-primary/12 border border-primary/25 text-foreground"
                            : "hover:bg-card/50 border border-transparent text-foreground/75"
                        }`}
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = seg.start / 1000;
                            videoRef.current.play();
                          }
                        }}
                      >
                        <div
                          className={`text-[10px] font-mono mb-0.5 ${
                            isActive ? "text-primary" : "text-muted-foreground/60"
                          }`}
                        >
                          {formatMs(seg.start)} — {formatMs(seg.end)}
                        </div>
                        <div className="leading-snug text-[13px]">
                          {seg.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!subtitles.length && !generating && !error && (
              <div className="glass border border-dashed border-border/60 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground">
                <Captions className="w-7 h-7 opacity-20" />
                <p className="text-sm opacity-60">
                  Enter a video URL and click Generate
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
