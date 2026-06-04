import { useState, useRef, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2, Upload, Download, Play, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, X,
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
function VideoCard({
  label, badge, badgeColor, src, isLoading,
}: {
  label: string; badge?: string; badgeColor?: string; src: string | null; isLoading?: boolean;
}) {
  return (
    <div className="glass border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="aspect-video bg-black flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-xs">Processing…</p>
          </div>
        ) : src ? (
          <video
            key={src}
            src={src}
            controls
            className="w-full h-full object-contain"
            playsInline
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
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
  const [uploadPct,    setUploadPct]    = useState(0);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [dragging,     setDragging]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef   = useRef<XMLHttpRequest | null>(null);
  const { toast } = useToast();

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (enhancedUrl) URL.revokeObjectURL(enhancedUrl);
    };
  }, []); // eslint-disable-line

  const applyFile = (f: File) => {
    if (!f.type.startsWith("video/")) {
      toast({ description: "Please upload a video file.", variant: "destructive" });
      return;
    }
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (enhancedUrl) URL.revokeObjectURL(enhancedUrl);
    setFile(f);
    setOriginalUrl(URL.createObjectURL(f));
    setEnhancedUrl(null);
    setStatus("idle");
    setErrorMsg("");
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
    e.target.value = "";
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyFile(f);
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
        const url = URL.createObjectURL(xhr.response as Blob);
        setEnhancedUrl(url);
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
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (enhancedUrl) URL.revokeObjectURL(enhancedUrl);
    setFile(null);
    setOriginalUrl(null);
    setEnhancedUrl(null);
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

            {/* Enhance button / progress */}
            {isProcessing ? (
              <div className="glass border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Loader2 size={18} className="animate-spin text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {status === "uploading" ? `Uploading video…` : "Enhancing video…"}
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
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Upload",   done: status !== "uploading" || uploadPct >= 100, active: status === "uploading" },
                    { label: "Enhance",  done: status === "done",                          active: status === "enhancing" },
                    { label: "Download", done: status === "done",                          active: false },
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
                disabled={!file}
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
        {(originalUrl || enhancedUrl || isProcessing) && (
          <div className="space-y-3">
            <SectionHeader label="Before / After" />
            <div className={`grid gap-4 ${enhancedUrl || isProcessing ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
              <VideoCard
                label="Original"
                badge="Original"
                badgeColor="border-border text-muted-foreground"
                src={originalUrl}
              />
              {(enhancedUrl || isProcessing) && (
                <VideoCard
                  label="Enhanced"
                  badge={status === "done" ? "Enhanced" : "Processing…"}
                  badgeColor={status === "done" ? "border-green-500/30 text-green-400" : "border-primary/30 text-primary"}
                  src={enhancedUrl}
                  isLoading={isProcessing}
                />
              )}
            </div>
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
