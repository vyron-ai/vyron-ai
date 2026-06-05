import { useState, useRef, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2, Upload, Download, Play, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, X, VideoOff,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type PresetId   = "clean_boost" | "cinematic" | "social_sharp" | "low_light" | "audio_cleaner";
type Status     = "idle" | "uploading" | "enhancing" | "done" | "error";

interface Toggles {
  colorCorrection: boolean;
  brightness:      boolean;
  contrast:        boolean;
  sharpness:       boolean;
  noiseReduction:  boolean;
  audioCleanup:    boolean;
}

// ── Preset config ──────────────────────────────────────────────────────────────
interface Preset {
  id:       PresetId;
  label:    string;
  emoji:    string;
  desc:     string;
  defaults: Partial<Toggles>;
}

const PRESETS: Preset[] = [
  {
    id:       "clean_boost",
    label:    "Clean Boost",
    emoji:    "✨",
    desc:     "Balanced color lift, clarity, and natural brightness.",
    defaults: { colorCorrection: true, brightness: true, contrast: true, sharpness: false, noiseReduction: false, audioCleanup: false },
  },
  {
    id:       "cinematic",
    label:    "Cinematic",
    emoji:    "🎬",
    desc:     "Filmic tone, muted saturation, subtle vignette.",
    defaults: { colorCorrection: true, brightness: false, contrast: true, sharpness: false, noiseReduction: false, audioCleanup: false },
  },
  {
    id:       "social_sharp",
    label:    "Social Media Sharp",
    emoji:    "📱",
    desc:     "Punchy, vibrant, and razor-sharp for feeds and reels.",
    defaults: { colorCorrection: true, brightness: true, contrast: true, sharpness: true, noiseReduction: false, audioCleanup: false },
  },
  {
    id:       "low_light",
    label:    "Low Light Fix",
    emoji:    "🌙",
    desc:     "Exposure recovery, gamma lift, and noise removal.",
    defaults: { colorCorrection: true, brightness: true, contrast: true, sharpness: false, noiseReduction: true, audioCleanup: false },
  },
  {
    id:       "audio_cleaner",
    label:    "Audio Cleaner",
    emoji:    "🔊",
    desc:     "Loudness normalisation. No visual changes to footage.",
    defaults: { colorCorrection: false, brightness: false, contrast: false, sharpness: false, noiseReduction: false, audioCleanup: true },
  },
];

const DEFAULT_TOGGLES: Toggles = {
  colorCorrection: true,
  brightness:      true,
  contrast:        true,
  sharpness:       false,
  noiseReduction:  false,
  audioCleanup:    false,
};

const TOGGLE_LABELS: { key: keyof Toggles; label: string; desc: string }[] = [
  { key: "colorCorrection", label: "Color Correction",    desc: "Saturation and gamma balance" },
  { key: "brightness",      label: "Brightness / Exposure", desc: "Exposure level adjustment"    },
  { key: "contrast",        label: "Contrast Boost",      desc: "Shadow and highlight separation" },
  { key: "sharpness",       label: "Sharpness Boost",     desc: "Unsharp mask for edge clarity" },
  { key: "noiseReduction",  label: "Noise Reduction",     desc: "Temporal denoise filter"        },
  { key: "audioCleanup",    label: "Audio Cleanup",       desc: "Loudness normalisation"         },
];

// ── Toggle switch ──────────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        checked ? "bg-primary" : "bg-white/10"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-xs font-bold text-primary uppercase tracking-wider px-1 pt-2">
      — {label}
    </p>
  );
}

// ── Video card ─────────────────────────────────────────────────────────────────
const MEDIA_ERR: Record<number, string> = {
  1: "MEDIA_ERR_ABORTED",
  2: "MEDIA_ERR_NETWORK",
  3: "MEDIA_ERR_DECODE",
  4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
};

function VideoCard({
  label, badge, badgeColor, src, isLoading, onVideoError, thumbUrl, thumbLoading,
}: {
  label: string;
  badge?: string;
  badgeColor?: string;
  src: string | null;
  isLoading?: boolean;
  onVideoError?: (code: string) => void;
  thumbUrl?: string | null;
  thumbLoading?: boolean;
}) {
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset error when src changes so a new URL always gets a fresh attempt
  useEffect(() => { setHasError(false); }, [src]);

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    const err = v.error;
    const codeStr = err
      ? `${MEDIA_ERR[err.code] ?? "UNKNOWN"} (code ${err.code})`
      : "unknown error";
    console.error(`[VYRON video] onError — label="${label}"`, {
      code:         codeStr,
      networkState: v.networkState,
      readyState:   v.readyState,
      src,
    });
    onVideoError?.(codeStr);
    setHasError(true);
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    console.log(`[VYRON video] onLoadedMetadata — label="${label}"`, {
      duration: v.duration,
      width:    v.videoWidth,
      height:   v.videoHeight,
      src,
    });
  };

  return (
    <div className="glass border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>

      {/*
        ── Video well ──
        padding-top: 56.25% gives a resolved pixel height (16:9) in any
        flex/grid context. The video fills it via absolute inset-0.
      */}
      <div className="relative w-full bg-black" style={{ paddingTop: "56.25%" }}>
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-xs">Processing…</p>
          </div>
        ) : src && !hasError ? (
          <video
            ref={videoRef}
            key={src}
            src={src}
            controls
            preload="auto"
            playsInline
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: "contain", background: "#000" }}
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleError}
          />
        ) : hasError && thumbUrl ? (
          /* Thumbnail fallback — shown when video codec is unsupported */
          <div className="absolute inset-0 flex flex-col">
            <img
              src={thumbUrl}
              alt={`${label} frame preview`}
              className="w-full h-full object-contain"
              style={{ background: "#000" }}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 px-3 py-2">
              <p className="text-[11px] font-semibold text-white/90">Frame preview active</p>
              <p className="text-[10px] text-white/50 mt-0.5 leading-tight">
                Video playback is limited in this browser, but the enhanced MP4 is ready to download.
              </p>
            </div>
          </div>
        ) : hasError && thumbLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground/60">
            <Loader2 size={22} className="animate-spin text-yellow-400/60" />
            <p className="text-xs text-yellow-400/60">Extracting frame preview…</p>
          </div>
        ) : hasError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground/60 px-6">
            <VideoOff size={26} className="text-red-400/60" />
            <div className="text-center space-y-1">
              <p className="text-xs font-semibold text-red-400/80">Preview unavailable</p>
              <p className="text-[11px] text-muted-foreground/50">
                Download is still ready — click Download Enhanced MP4 below.
              </p>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/30">
            <Play size={28} />
            <p className="text-xs">No preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Format bytes ───────────────────────────────────────────────────────────────
function fmtBytes(b: number) {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function VideoEnhancementPage() {
  const [file,         setFile]         = useState<File | null>(null);
  const [originalUrl,  setOriginalUrl]  = useState<string | null>(null);
  const [enhancedUrl,  setEnhancedUrl]  = useState<string | null>(null);
  const [preset,       setPreset]       = useState<PresetId>("clean_boost");
  const [toggles,     setToggles]      = useState<Toggles>({ ...DEFAULT_TOGGLES });
  const [status,       setStatus]       = useState<Status>("idle");
  const [uploadPct,       setUploadPct]       = useState(0);
  const [errorMsg,        setErrorMsg]        = useState("");
  const [dragging,        setDragging]        = useState(false);
  const [enhancedBlobSize, setEnhancedBlobSize] = useState<number>(0);
  const [origVideoError,  setOrigVideoError]  = useState<string | null>(null);
  const [enhVideoError,   setEnhVideoError]   = useState<string | null>(null);
  const [canPlayMp4,      setCanPlayMp4]      = useState<string>("");
  const [origConverting,  setOrigConverting]  = useState(false);
  const [showDebug,       setShowDebug]       = useState(false);

  interface ProbeInfo { container: string; videoCodec: string; videoProfile: string; pixFmt: string; audioCodec: string; }
  const [sourceProbe,  setSourceProbe]  = useState<ProbeInfo | null>(null);
  const [previewProbe, setPreviewProbe] = useState<ProbeInfo | null>(null);
  const [outputProbe,  setOutputProbe]  = useState<ProbeInfo | null>(null);

  const [origBlob,        setOrigBlob]        = useState<Blob | null>(null);
  const [enhBlob,         setEnhBlob]         = useState<Blob | null>(null);
  const [origThumbUrl,    setOrigThumbUrl]    = useState<string | null>(null);
  const [enhThumbUrl,     setEnhThumbUrl]     = useState<string | null>(null);
  const [origThumbLoading, setOrigThumbLoading] = useState(false);
  const [enhThumbLoading,  setEnhThumbLoading]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef   = useRef<XMLHttpRequest | null>(null);
  const { toast } = useToast();

  // ── Thumbnail extraction — calls /api/thumbnail/video with a video blob ──────
  const extractThumbnail = async (blob: Blob): Promise<string | null> => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/thumbnail/video");
      xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
      xhr.responseType = "blob";
      const imgBlob: Blob = await new Promise((resolve, reject) => {
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as Blob);
          else reject(new Error(`Thumbnail HTTP ${xhr.status}`));
        });
        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.send(blob);
      });
      return URL.createObjectURL(new Blob([imgBlob], { type: "image/jpeg" }));
    } catch {
      return null;
    }
  };

  const handleOrigVideoError = async (code: string) => {
    setOrigVideoError(code);
    if (origBlob) {
      setOrigThumbLoading(true);
      const url = await extractThumbnail(origBlob);
      setOrigThumbUrl(url);
      setOrigThumbLoading(false);
    }
  };

  const handleEnhVideoError = async (code: string) => {
    setEnhVideoError(code);
    if (enhBlob) {
      setEnhThumbLoading(true);
      const url = await extractThumbnail(enhBlob);
      setEnhThumbUrl(url);
      setEnhThumbLoading(false);
    }
  };

  useEffect(() => {
    const v = document.createElement("video");
    setCanPlayMp4(v.canPlayType("video/mp4") || "empty string (unsupported)");
  }, []);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (enhancedUrl) URL.revokeObjectURL(enhancedUrl);
    };
  }, []); // eslint-disable-line

  const applyFile = async (f: File) => {
    // Allow any video/* or files with no type (some formats report empty type)
    if (f.type && !f.type.startsWith("video/")) {
      toast({ description: "Please upload a video file.", variant: "destructive" });
      return;
    }
    // Reset all state for new file
    setFile(f);
    setOriginalUrl(null);
    setEnhancedUrl(null);
    setStatus("idle");
    setErrorMsg("");
    setOrigVideoError(null);
    setEnhVideoError(null);
    setEnhancedBlobSize(0);
    setOrigConverting(true);

    try {
      // Always transcode to H.264/baseline/yuv420p — never preview raw file directly
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/preview/video");
      xhr.setRequestHeader("Content-Type", f.type || "application/octet-stream");
      xhr.responseType = "blob";

      const rawBlob: Blob = await new Promise((resolve, reject) => {
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response as Blob);
          } else {
            // Try to read the error message
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const json = JSON.parse(reader.result as string);
                reject(new Error(json.error ?? `HTTP ${xhr.status}`));
              } catch {
                reject(new Error(`Preview conversion failed: HTTP ${xhr.status}`));
              }
            };
            reader.readAsText(xhr.response as Blob);
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Network error during preview conversion")));
        xhr.send(f);
      });

      // Read source + preview-output codec info from response headers
      const gh = (h: string) => xhr.getResponseHeader(h) ?? "—";
      setSourceProbe({
        container:    gh("X-Vyron-Src-Container"),
        videoCodec:   gh("X-Vyron-Src-Video-Codec"),
        videoProfile: gh("X-Vyron-Src-Profile"),
        pixFmt:       gh("X-Vyron-Src-Pix-Fmt"),
        audioCodec:   gh("X-Vyron-Src-Audio-Codec"),
      });
      setPreviewProbe({
        container:    gh("X-Vyron-Preview-Container"),
        videoCodec:   gh("X-Vyron-Preview-Video-Codec"),
        videoProfile: gh("X-Vyron-Preview-Profile"),
        pixFmt:       gh("X-Vyron-Preview-Pix-Fmt"),
        audioCodec:   gh("X-Vyron-Preview-Audio-Codec"),
      });

      const typed = new Blob([rawBlob], { type: "video/mp4" });
      setOrigBlob(typed);  // stored for thumbnail fallback
      const url   = URL.createObjectURL(typed);
      console.log("[VYRON preview] original preview ready:", url, "size:", typed.size);
      setOriginalUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview conversion failed";
      console.error("[VYRON preview] conversion failed:", msg);
      setOrigVideoError(msg);
      toast({ description: "Could not prepare preview — try a different format.", variant: "destructive" });
    } finally {
      setOrigConverting(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void applyFile(f);
    e.target.value = "";
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void applyFile(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPresetSelect = (id: PresetId) => {
    setPreset(id);
    const p = PRESETS.find(x => x.id === id);
    if (p) setToggles({ ...DEFAULT_TOGGLES, ...p.defaults });
    setEnhancedUrl(null);
    setStatus("idle");
  };

  const setToggle = (key: keyof Toggles, val: boolean) => {
    setToggles(prev => ({ ...prev, [key]: val }));
    setEnhancedUrl(null);
    setStatus("idle");
  };

  const cancelEnhancement = () => {
    xhrRef.current?.abort();
    setStatus("idle");
    setUploadPct(0);
  };

  const handleEnhance = () => {
    if (!file || status === "uploading" || status === "enhancing") return;
    if (enhancedUrl) URL.revokeObjectURL(enhancedUrl);
    setEnhancedUrl(null);
    setStatus("uploading");
    setUploadPct(0);
    setErrorMsg("");
    setEnhVideoError(null);
    setEnhancedBlobSize(0);
    setOutputProbe(null);

    const params = new URLSearchParams({
      preset,
      colorCorrection: String(toggles.colorCorrection),
      brightness:      String(toggles.brightness),
      contrast:        String(toggles.contrast),
      sharpness:       String(toggles.sharpness),
      noiseReduction:  String(toggles.noiseReduction),
      audioCleanup:    String(toggles.audioCleanup),
    });

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", `/api/enhance/video?${params}`);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.responseType = "blob";

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploadPct(pct);
        if (pct >= 100) setStatus("enhancing");
      }
    });

    xhr.upload.addEventListener("load", () => setStatus("enhancing"));

    xhr.addEventListener("load", () => {
      xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        // Explicitly type the blob as video/mp4 — browsers require a known
        // MIME type on blob URLs to allow in-page video playback
        const typed = new Blob([xhr.response as Blob], { type: "video/mp4" });
        setEnhancedBlobSize(typed.size);
        setEnhBlob(typed);  // stored for thumbnail fallback
        const url = URL.createObjectURL(typed);
        console.log("[VYRON enhance] enhanced blob URL ready:", url, "size:", typed.size);

        // Read enhanced output codec info from response headers
        const gh = (h: string) => xhr.getResponseHeader(h) ?? "—";
        setOutputProbe({
          container:    gh("X-Vyron-Out-Container"),
          videoCodec:   gh("X-Vyron-Out-Video-Codec"),
          videoProfile: gh("X-Vyron-Out-Profile"),
          pixFmt:       gh("X-Vyron-Out-Pix-Fmt"),
          audioCodec:   gh("X-Vyron-Out-Audio-Codec"),
        });

        setEnhancedUrl(url);
        setEnhVideoError(null);
        setStatus("done");
      } else {
        // Try to parse error message from blob
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const json = JSON.parse(reader.result as string);
            setErrorMsg(json.error ?? "Enhancement failed");
          } catch {
            setErrorMsg("Enhancement failed");
          }
          setStatus("error");
        };
        reader.readAsText(xhr.response as Blob);
      }
    });

    xhr.addEventListener("error", () => {
      xhrRef.current = null;
      setErrorMsg("Network error — check your connection and try again.");
      setStatus("error");
    });

    xhr.addEventListener("abort", () => {
      xhrRef.current = null;
    });

    xhr.send(file);
  };

  const handleDownload = () => {
    if (!enhancedUrl) return;
    const a = document.createElement("a");
    a.href = enhancedUrl;
    a.download = `vyron-enhanced.mp4`;
    a.click();
  };

  const resetFile = () => {
    cancelEnhancement();
    if (originalUrl)  URL.revokeObjectURL(originalUrl);
    if (enhancedUrl)  URL.revokeObjectURL(enhancedUrl);
    if (origThumbUrl) URL.revokeObjectURL(origThumbUrl);
    if (enhThumbUrl)  URL.revokeObjectURL(enhThumbUrl);
    setFile(null);
    setOriginalUrl(null);
    setEnhancedUrl(null);
    setOrigBlob(null);
    setEnhBlob(null);
    setOrigThumbUrl(null);
    setEnhThumbUrl(null);
    setOrigThumbLoading(false);
    setEnhThumbLoading(false);
    setStatus("idle");
    setErrorMsg("");
  };

  const isProcessing = status === "uploading" || status === "enhancing";
  const selectedPreset = PRESETS.find(p => p.id === preset)!;

  return (
    <AppLayout title="AI Video Enhancement">
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 size={22} className="text-primary" />
            AI Video Enhancement
          </h2>
          <p className="text-muted-foreground text-sm">
            Enhance real footage with FFmpeg filters — colour, clarity, exposure, and audio. No generative AI. No altered content.
          </p>
        </div>

        {/* Upload zone */}
        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`glass border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 py-14 cursor-pointer transition-all ${
              dragging
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50 hover:bg-primary/5"
            }`}
          >
            <div className={`rounded-full p-4 ${dragging ? "bg-primary/20" : "bg-white/5"}`}>
              <Upload size={28} className={dragging ? "text-primary" : "text-muted-foreground"} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-foreground">Drop a video here or click to browse</p>
              <p className="text-xs text-muted-foreground">MP4, MOV, WebM, MKV — up to 500 MB</p>
            </div>
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onFileChange} />
          </div>
        ) : (
          /* File chip */
          <div className="glass border border-border rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2 shrink-0">
              <Wand2 size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{fmtBytes(file.size)}</p>
            </div>
            {!isProcessing && (
              <button
                onClick={resetFile}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                title="Remove file"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Controls — only when file is selected */}
        {file && (
          <>
            {/* Preset selector */}
            <div className="space-y-3">
              <SectionHeader label="Enhancement Preset" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onPresetSelect(p.id)}
                    disabled={isProcessing}
                    className={`flex flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      preset === p.id
                        ? "border-primary bg-primary/10 electric-glow"
                        : "border-border bg-background/30 hover:border-primary/40"
                    }`}
                  >
                    <span className="text-lg leading-none">{p.emoji}</span>
                    <span className={`text-xs font-bold leading-tight ${preset === p.id ? "text-primary" : "text-foreground"}`}>
                      {p.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Toggle switches */}
            <div className="space-y-3">
              <SectionHeader label="Enhancement Controls" />
              <div className="glass border border-border rounded-xl divide-y divide-border/50">
                {TOGGLE_LABELS.map(({ key, label, desc }) => {
                  const isAudioOnly = preset === "audio_cleaner" && key !== "audioCleanup";
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between px-4 py-3 ${isAudioOnly ? "opacity-40" : ""}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <ToggleSwitch
                        checked={toggles[key]}
                        onChange={(v) => { if (!isProcessing && !isAudioOnly) setToggle(key, v); }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preparing preview indicator */}
            {origConverting && !isProcessing && (
              <div className="glass border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3">
                <Loader2 size={15} className="animate-spin text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Preparing preview…</p>
                  <p className="text-xs text-muted-foreground">Transcoding to browser-safe MP4</p>
                </div>
              </div>
            )}

            {/* Enhance button / progress */}
            {isProcessing ? (
              <div className="glass border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Loader2 size={18} className="animate-spin text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {status === "uploading" ? `Uploading… ${uploadPct}%` : "Enhancing video…"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {status === "uploading"
                          ? "Transferring to server"
                          : `Applying ${selectedPreset.emoji} ${selectedPreset.label} — this may take a moment`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={cancelEnhancement}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    {status === "uploading" ? (
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${uploadPct}%` }}
                      />
                    ) : (
                      /* Indeterminate bar during FFmpeg processing */
                      <div className="h-full w-1/3 bg-primary rounded-full animate-[slide_1.5s_ease-in-out_infinite]"
                        style={{ animation: "slide 1.5s ease-in-out infinite" }} />
                    )}
                  </div>
                  {status === "uploading" && (
                    <p className="text-[11px] text-muted-foreground text-right">{uploadPct}%</p>
                  )}
                </div>

                {/* Processing steps */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Preview",  done: !!originalUrl,                              active: origConverting },
                    { label: "Upload",   done: status !== "uploading" || uploadPct >= 100, active: status === "uploading" },
                    { label: "Enhance",  done: status === "done",                          active: status === "enhancing" },
                    { label: "Ready",    done: status === "done",                          active: false },
                  ].map((step) => (
                    <div key={step.label}
                      className={`text-center rounded-lg border py-2 text-xs font-semibold transition-all ${
                        step.done   ? "border-green-500/30 bg-green-500/10 text-green-400" :
                        step.active ? "border-primary/30 bg-primary/10 text-primary" :
                                      "border-border/50 text-muted-foreground/40"
                      }`}
                    >
                      {step.done ? "✓ " : ""}{step.label}
                    </div>
                  ))}
                </div>
              </div>
            ) : status === "error" ? (
              <div className="glass border border-red-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-400">Enhancement failed</p>
                    <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
                  </div>
                </div>
                <Button
                  onClick={handleEnhance}
                  variant="outline"
                  className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  <RefreshCw size={14} className="mr-2" />
                  Try Again
                </Button>
              </div>
            ) : status === "done" ? (
              <div className="flex gap-3">
                <Button onClick={handleEnhance} variant="outline" className="flex-1 border-border text-muted-foreground hover:text-foreground">
                  <RefreshCw size={14} className="mr-2" />
                  Re-Enhance
                </Button>
                <Button onClick={handleDownload} className="flex-1 electric-glow font-semibold">
                  <Download size={15} className="mr-2" />
                  Download Enhanced MP4
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleEnhance}
                disabled={!file || origConverting}
                className="w-full electric-glow font-semibold"
              >
                <Wand2 size={16} className="mr-2" />
                Enhance Video — {selectedPreset.emoji} {selectedPreset.label}
              </Button>
            )}

            {/* Status badge when done */}
            {status === "done" && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/8 text-green-400 text-xs font-semibold">
                <CheckCircle2 size={14} />
                Enhancement complete — original footage preserved, no content altered.
              </div>
            )}
          </>
        )}

        {/* Before / After previews */}
        {(originalUrl || enhancedUrl || isProcessing || origConverting) && (
          <div className="space-y-3">
            <SectionHeader label="Before / After" />
            <div className={`grid gap-4 ${enhancedUrl || isProcessing ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
              <VideoCard
                label="Original"
                badge={origConverting ? "Preparing…" : "Original"}
                badgeColor={origConverting ? "border-primary/30 text-primary" : "border-border text-muted-foreground"}
                src={originalUrl}
                isLoading={origConverting}
                thumbUrl={origThumbUrl}
                thumbLoading={origThumbLoading}
                onVideoError={handleOrigVideoError}
              />
              {(enhancedUrl || isProcessing) && (
                <VideoCard
                  label="Enhanced"
                  badge={status === "done" ? "Enhanced" : "Processing…"}
                  badgeColor={status === "done" ? "border-green-500/30 text-green-400" : "border-primary/30 text-primary"}
                  src={enhancedUrl}
                  isLoading={isProcessing}
                  thumbUrl={enhThumbUrl}
                  thumbLoading={enhThumbLoading}
                  onVideoError={handleEnhVideoError}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Debug Preview panel — hidden by default ── */}
        {file && (
          <div>
            <button
              onClick={() => setShowDebug(v => !v)}
              className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1 mb-2 flex items-center gap-1.5"
            >
              <span>{showDebug ? "▾" : "▸"}</span>
              {showDebug ? "Hide debug info" : "Show debug info"}
            </button>
            {showDebug && (
            <div className="font-mono text-[11px] bg-black/60 border border-yellow-400/30 rounded-xl overflow-hidden">
              {(() => {
                const urlType = (u: string | null) => {
                  if (!u) return "—";
                  if (u.startsWith("blob:"))  return `blob: ✓`;
                  if (u.startsWith("data:"))  return `data: (base64)`;
                  if (u.startsWith("http"))   return `server URL`;
                  return u.slice(0, 30);
                };

                const rows: [string, string, "ok" | "err" | "warn" | "info"][] = [
                  ["browser can play video/mp4",  canPlayMp4 || "—",                canPlayMp4 === "probably" || canPlayMp4 === "maybe" ? "ok" : "err"],

                  ["─── original ───",            "",                               "info"],
                  ["original URL type",           urlType(originalUrl),             originalUrl ? "ok" : "warn"],
                  ["original MIME type",          file?.type || "—",                file?.type?.startsWith("video/") ? "ok" : "warn"],
                  ["original file size",          file ? fmtBytes(file.size) : "—", "ok"],
                  ["original video error",        origVideoError ?? "none",         origVideoError ? "err" : "ok"],

                  ["─── enhanced ───",            "",                               "info"],
                  ["enhanced URL type",           urlType(enhancedUrl),             enhancedUrl ? "ok" : status === "done" ? "err" : "info"],
                  ["enhanced MIME type",          enhancedUrl ? "video/mp4" : "—",  enhancedUrl ? "ok" : "info"],
                  ["enhanced blob size",          enhancedBlobSize > 0 ? fmtBytes(enhancedBlobSize) : "—", enhancedBlobSize > 0 ? "ok" : "info"],
                  ["enhanced video error",        enhVideoError ?? "none",          enhVideoError ? "err" : "ok"],

                ];

                const colourFor = (s: "ok"|"err"|"warn"|"info") =>
                  s === "ok"   ? "text-green-400"
                  : s === "err"  ? "text-red-400"
                  : s === "warn" ? "text-yellow-400"
                  : "text-muted-foreground/40";

                const pc = (val: string, good: string) =>
                  !val || val === "—" ? "text-muted-foreground/40"
                  : val === good ? "text-green-400"
                  : "text-red-400";

                const probeRows = (p: typeof sourceProbe) => p ? [
                  ["container",    p.container,    p.container === "mp4" ? "text-green-400" : "text-red-400"],
                  ["video codec",  p.videoCodec,   pc(p.videoCodec,  "h264")],
                  ["video profile",p.videoProfile, p.videoProfile === "Baseline" ? "text-green-400" : p.videoProfile === "—" ? "text-muted-foreground/40" : "text-yellow-400"],
                  ["pixel format", p.pixFmt,       pc(p.pixFmt,      "yuv420p")],
                  ["audio codec",  p.audioCodec,   p.audioCodec === "aac" ? "text-green-400" : p.audioCodec === "none" ? "text-muted-foreground/40" : "text-yellow-400"],
                ] as [string, string, string][] : null;

                return (
                  <div>
                    <table className="w-full">
                      <tbody>
                        {rows.map(([label, value, state], i) =>
                          label.startsWith("─") ? (
                            <tr key={i} className="border-t border-border/30">
                              <td colSpan={2} className="px-3 py-1 text-muted-foreground/30 text-[10px] uppercase tracking-widest">
                                {label}
                              </td>
                            </tr>
                          ) : (
                            <tr key={i} className="border-t border-border/20 hover:bg-white/[0.02]">
                              <td className="px-3 py-1.5 text-muted-foreground/60 w-1/2">{label}</td>
                              <td className={`px-3 py-1.5 font-semibold ${colourFor(state)}`}>{value}</td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>

                    {[
                      { title: "SOURCE FILE INFO",    probe: sourceProbe,  placeholder: "upload a file to see codec info" },
                      { title: "PREVIEW MP4 INFO",    probe: previewProbe, placeholder: "upload a file to see preview codec info" },
                      { title: "ENHANCED MP4 INFO",   probe: outputProbe,  placeholder: "enhance a video to see output codec info" },
                    ].map(({ title, probe, placeholder }) => (
                      <div key={title} className="border-t border-yellow-400/30 mt-1">
                        <div className="px-3 pt-2 pb-1 text-yellow-400 text-[10px] font-bold uppercase tracking-widest">
                          {title}
                        </div>
                        {probeRows(probe) ? (
                          <table className="w-full">
                            <tbody>
                              {probeRows(probe)!.map(([label, value, cls], i) => (
                                <tr key={i} className="border-t border-border/20">
                                  <td className="px-3 py-1.5 text-muted-foreground/60 w-1/2">{label}</td>
                                  <td className={`px-3 py-1.5 font-semibold ${cls}`}>{value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="px-3 py-1.5 text-muted-foreground/40 italic text-[11px]">{placeholder}</p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            )}
          </div>
        )}

        {/* What this does — disclaimer */}
        {!file && (
          <div className="glass border border-border/50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">What this tool does</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
              {[
                "✅ Colour correction and saturation balance",
                "✅ Brightness and exposure adjustment",
                "✅ Contrast lift for depth",
                "✅ Unsharp mask for edge clarity",
                "✅ Temporal denoise for grain removal",
                "✅ Loudness normalisation for audio",
                "🚫 No generated content or scenes",
                "🚫 No background replacement",
                "🚫 No face or object alteration",
                "🚫 No AI-generated frames",
              ].map(line => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Inline style for indeterminate progress bar */}
      <style>{`
        @keyframes slide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(200%);  }
          100% { transform: translateX(200%);  }
        }
      `}</style>
    </AppLayout>
  );
}
