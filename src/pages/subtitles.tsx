import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Captions, UploadCloud, RefreshCw, AlertCircle, CheckCircle2,
  Loader2, Play, Trash2, Copy, CheckCheck, Clock, Sparkles,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SubtitleSegment,
  saveSubtitleSession,
  loadSubtitlesForUrl,
  clearSubtitlesForUrl,
  formatMs,
} from "@/lib/subtitles";

// ── Keyframe styles injected once ────────────────────────────────────────────
const CINEMATIC_STYLES = `
@keyframes subtitleFadeUp {
  from { opacity: 0; transform: translateY(10px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
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
}: {
  segment: SubtitleSegment | undefined;
  currentMs: number;
}) {
  if (!segment) return null;

  const words = segment.text.trim().split(/\s+/).filter(Boolean);
  const activeIdx = getActiveWordIndex(segment, currentMs);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingLeft: 18,
        paddingRight: 18,
        paddingBottom: 60,
      }}
    >
      <style>{CINEMATIC_STYLES}</style>
      <div
        style={{
          animation: "subtitleFadeUp 210ms cubic-bezier(0.22,1,0.36,1) both",
          background: "rgba(0,0,0,0.38)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          borderRadius: 14,
          padding: "7px 14px 9px",
          textAlign: "center",
          maxWidth: "100%",
          lineHeight: 1.4,
        }}
      >
        {words.map((word, i) => {
          const active = i === activeIdx;
          return (
            <span
              key={`${word}-${i}`}
              style={{
                display: "inline-block",
                marginRight: "0.28em",
                marginBottom: "0.08em",
                color: active ? "#ffffff" : "rgba(255,255,255,0.48)",
                fontWeight: active ? 700 : 400,
                fontSize: active ? "clamp(17px, 5.4vw, 25px)" : "clamp(15px, 4.8vw, 22px)",
                fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
                letterSpacing: active ? "-0.025em" : "0.008em",
                textShadow: active
                  ? "0 2px 24px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,0.9), 0 1px 0 rgba(0,0,0,0.6)"
                  : "0 1px 8px rgba(0,0,0,0.8)",
                transform: active ? "scale(1.08)" : "scale(1)",
                transformOrigin: "center bottom",
                transition:
                  "color 150ms ease, transform 150ms cubic-bezier(0.34,1.56,0.64,1), font-weight 150ms ease",
                willChange: "transform, color",
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
    const t = setInterval(() => setIdx((i) => Math.min(i + 1, LOADING_MSGS.length - 1)), 6000);
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
  const [fromCache, setFromCache] = useState(() => initialUrl ? loadSubtitlesForUrl(initialUrl).length > 0 : false);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const loadingMsg = useRotatingMessage(generating);

  const currentSegment = useMemo(
    () => subtitles.find((s) => currentMs >= s.start && currentMs <= s.end),
    [subtitles, currentMs]
  );

  // Scroll active segment into view
  useEffect(() => {
    if (!currentSegment || !timelineRef.current) return;
    const el = timelineRef.current.querySelector(`[data-seg="${currentSegment.id}"]`);
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

      const segs = mergeShortSegments((data.subtitles as SubtitleSegment[]) ?? []);
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

  const apiMissing =
    error.toLowerCase().includes("assemblyai_api_key") ||
    error.toLowerCase().includes("not set");

  return (
    <AppLayout title="Subtitles">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Captions className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                AI Subtitles
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight">Editorial Cinema Subtitles</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Powered by AssemblyAI — real speech-to-text with word-level timestamps.
            </p>
          </div>
          {videoUrl && (
            <a href={videoUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0">
                <ExternalLink className="w-3.5 h-3.5" /> Open Source Video
              </Button>
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-8 items-start">

          {/* ── Left: Controls + timeline ── */}
          <div className="flex flex-col gap-4">

            {/* URL input */}
            <div className="glass border border-border rounded-xl p-5 flex flex-col gap-3">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Video URL
              </label>
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://your-supabase-url/storage/v1/object/public/videos/…"
                className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-[11px] text-muted-foreground">
                Must be a publicly accessible video URL. Videos uploaded via VYRON AI already have a public URL.
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
                  ? "bg-muted border-border text-muted-foreground cursor-not-allowed"
                  : "bg-primary border-primary/50 text-primary-foreground hover:bg-primary/90 electric-glow cursor-pointer"
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
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Clock className="w-3.5 h-3.5 shrink-0 text-primary" />
                Transcription takes 30–120 seconds depending on video length. Don't close this tab.
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
                    Add <code className="text-primary bg-primary/10 px-1 rounded font-mono">ASSEMBLYAI_API_KEY</code>{" "}
                    to Replit Secrets (no <code className="font-mono">VITE_</code> prefix), then restart the app.
                  </div>
                )}
              </div>
            )}

            {/* Cache notice + actions */}
            {subtitles.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5 text-xs">
                  {fromCache ? (
                    <>
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-400">Loaded from cache</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-green-400">{subtitles.length} segments generated</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyTranscript}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    title="Copy transcript"
                  >
                    {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy text"}
                  </button>
                  <button
                    onClick={clearSubtitles}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    title="Clear subtitles"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear
                  </button>
                  <button
                    onClick={generate}
                    disabled={generating}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    title="Re-generate"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} /> Re-generate
                  </button>
                </div>
              </div>
            )}

            {/* Subtitle timeline */}
            {subtitles.length > 0 && (
              <div className="glass border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Subtitle Timeline
                  </span>
                  <span className="text-xs text-muted-foreground">{subtitles.length} segments</span>
                </div>
                <div
                  ref={timelineRef}
                  className="flex flex-col gap-1 p-2 max-h-[420px] overflow-y-auto"
                >
                  {subtitles.map((seg) => {
                    const isActive = currentSegment?.id === seg.id;
                    return (
                      <div
                        key={seg.id}
                        data-seg={seg.id}
                        className={`px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm ${
                          isActive
                            ? "bg-primary/15 border border-primary/30 text-foreground"
                            : "hover:bg-card/60 border border-transparent text-foreground/80"
                        }`}
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = seg.start / 1000;
                            videoRef.current.play();
                          }
                        }}
                      >
                        <div className={`text-[10px] font-mono mb-1 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                          {formatMs(seg.start)} — {formatMs(seg.end)}
                        </div>
                        <div className="leading-snug">{seg.text}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state when no video URL */}
            {!subtitles.length && !generating && !error && (
              <div className="glass border border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground">
                <Captions className="w-8 h-8 opacity-30" />
                <p className="text-sm">No subtitles yet — enter a video URL and click Generate</p>
              </div>
            )}
          </div>

          {/* ── Right: Video preview ── */}
          <div className="flex flex-col items-center gap-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider self-start">
              Preview
            </div>

            {/* Phone-shaped video preview */}
            <div
              className="relative mx-auto w-full overflow-hidden bg-black"
              style={{
                maxWidth: 320,
                aspectRatio: "9 / 16",
                borderRadius: 32,
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 40px 120px rgba(0,0,0,0.5)",
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
                  <Play className="w-10 h-10 opacity-20" />
                  <span className="text-xs uppercase tracking-widest opacity-30">No video</span>
                </div>
              )}

              {/* key forces remount → re-triggers CSS animation on each new segment */}
              <SubtitleOverlay
                key={currentSegment?.id ?? -1}
                segment={currentSegment}
                currentMs={currentMs}
              />
            </div>

            {/* Preview legend */}
            {subtitles.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Click a subtitle segment to jump to that point in the video
              </div>
            )}

            {/* Wide-format preview hint */}
            {videoUrl && !subtitles.length && !generating && (
              <div className="max-w-[320px] text-center">
                <p className="text-xs text-muted-foreground">
                  Subtitles will appear over the video after generation.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
