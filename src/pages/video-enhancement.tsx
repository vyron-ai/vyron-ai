import { useState, useRef, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2, Upload, Download, Play, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, X, VideoOff,
  Activity, Gauge, Sparkles, Volume2, Star, TrendingUp,
  Brain, Zap, Eye, BarChart3, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type PresetId   = "clean_boost" | "deep_clean" | "cinematic" | "social_sharp" | "low_light" | "audio_cleaner";
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
  tags:     string[];
  tagColor: string;
}

const PRESETS: Preset[] = [
  {
    id:       "clean_boost",
    label:    "Clean Boost",
    emoji:    "✨",
    desc:     "Balanced color lift, clarity, and natural brightness.",
    defaults: { colorCorrection: true, brightness: true, contrast: true, sharpness: false, noiseReduction: false, audioCleanup: false },
    tags:     ["Natural", "Balanced"],
    tagColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  {
    id:       "deep_clean",
    label:    "Deep Clean",
    emoji:    "🧹",
    desc:     "Strong noise removal with gentle facial detail recovery.",
    defaults: { colorCorrection: true, brightness: true, contrast: true, sharpness: false, noiseReduction: true, audioCleanup: false },
    tags:     ["Heavy Denoise", "Face Safe"],
    tagColor: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  },
  {
    id:       "cinematic",
    label:    "Cinematic",
    emoji:    "🎬",
    desc:     "Filmic tone, muted saturation, subtle vignette.",
    defaults: { colorCorrection: true, brightness: false, contrast: true, sharpness: false, noiseReduction: false, audioCleanup: false },
    tags:     ["Film Grade", "Soft Contrast"],
    tagColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  {
    id:       "social_sharp",
    label:    "Social Media Sharp",
    emoji:    "📱",
    desc:     "Punchy, vibrant, and razor-sharp for feeds and reels.",
    defaults: { colorCorrection: true, brightness: true, contrast: true, sharpness: true, noiseReduction: false, audioCleanup: false },
    tags:     ["High Sharpness", "Punchy"],
    tagColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    id:       "low_light",
    label:    "Low Light Fix",
    emoji:    "🌙",
    desc:     "Exposure recovery, gamma lift, and noise removal.",
    defaults: { colorCorrection: true, brightness: true, contrast: true, sharpness: false, noiseReduction: true, audioCleanup: false },
    tags:     ["Shadow Recovery", "Denoise"],
    tagColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  {
    id:       "audio_cleaner",
    label:    "Audio Cleaner",
    emoji:    "🔊",
    desc:     "Loudness normalisation. No visual changes to footage.",
    defaults: { colorCorrection: false, brightness: false, contrast: false, sharpness: false, noiseReduction: false, audioCleanup: true },
    tags:     ["Audio Only", "Loudness Norm"],
    tagColor: "bg-pink-500/10 text-pink-400 border-pink-500/20",
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

// ── Analysis types ─────────────────────────────────────────────────────────────
interface VideoAnalysis {
  // ── Technical metadata (real FFprobe via server headers) ──────────────────
  width:           number;
  height:          number;
  resolution:      string;
  codec:           string;
  audioCodecLabel: string;
  fps:             number;
  bitrate:         number;
  duration:        number;
  fpsDisplay:      string;
  bitrateDisplay:  string;
  durationDisplay: string;
  // ── Multi-frame pixel analysis ────────────────────────────────────────────
  brightnessScore: number;
  contrastScore:   number;
  saturationScore: number;
  sharpnessScore:  number;
  noiseLevel:      number;
  audioPresent:    boolean;
  exposureLabel:   "Very Dark" | "Dark" | "Normal" | "Bright" | "Overexposed";
  contrastLabel:   "Flat" | "Low" | "Normal" | "High";
  sharpnessLabel:  "Very Soft" | "Soft" | "Medium" | "Sharp" | "Very Sharp";
  noiseLabel:      "Very Low" | "Low" | "Medium" | "High" | "Extreme";
  colorLabel:      "Desaturated" | "Normal" | "Oversaturated";
  audioLabel:      "None" | "Good";
  clarityScore:    number;
  exposureScore:   number;
  colorScore:      number;
  overallScore:    number;
  framesAnalyzed:  number;
}

// ── Raw per-frame metrics ──────────────────────────────────────────────────────
interface FrameMetrics {
  avgL:        number;
  stdL:        number;
  avgS:        number;
  lapVar:      number;
  noiseVar:    number;  // combined noise RMS (luminance vs chroma max; stored as RMS, not squared)
  edgeDensity: number;  // fraction of pixels with gradient ≥ 0.05 — second sharpness signal
  shadowPct:   number;
  highlightPct:number;
}

// ── Per-frame pixel scan ───────────────────────────────────────────────────────
function analyzeFramePixels(data: Uint8ClampedArray, W: number, H: number): FrameMetrics {
  const n = W * H;
  const lums = new Float32Array(n);
  let sumL = 0, sumS = 0, shadowCount = 0, highlightCount = 0;

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    const s = mx === mn ? 0 : l < 0.5
      ? (mx - mn) / (mx + mn)
      : (mx - mn) / (2 - mx - mn);
    lums[j] = l; sumL += l; sumS += s;
    if (l < 0.18) shadowCount++;
    if (l > 0.82) highlightCount++;
  }

  const avgL = sumL / n;
  const avgS = sumS / n;

  let ssq = 0;
  for (let i = 0; i < n; i++) ssq += (lums[i] - avgL) ** 2;
  const stdL = Math.sqrt(ssq / n);

  // ── Gradient array (computed once; reused for edge density + noise mask) ──
  // Chebyshev gradient: max(|gx|, |gy|) via central differences.
  const grads = new Float32Array(n);
  let edgeCount = 0;
  const EDGE_THRESH = 0.05;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const gx = Math.abs(lums[y * W + (x + 1)] - lums[y * W + (x - 1)]);
      const gy = Math.abs(lums[(y + 1) * W + x] - lums[(y - 1) * W + x]);
      const g  = Math.max(gx, gy);
      grads[y * W + x] = g;
      if (g >= EDGE_THRESH) edgeCount++;
    }
  }
  // edgeDensity: fraction of pixels with crisp edges — second sharpness signal.
  // High = fine detail preserved. Low = soft / blurry / out of focus.
  const edgeDensity = edgeCount / Math.max(1, (W - 2) * (H - 2));

  // ── Laplacian variance → primary sharpness signal ─────────────────────────
  let lapSum = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const c   = lums[y * W + x];
      const lap = lums[(y - 1) * W + x] + lums[(y + 1) * W + x]
        + lums[y * W + (x - 1)] + lums[y * W + (x + 1)] - 4 * c;
      lapSum += lap * lap;
    }
  }
  const lapVar = lapSum / Math.max(1, (W - 2) * (H - 2));

  // ── Noise: luminance + chroma flat-pixel box-residual ────────────────────
  //
  // Restricted to flat pixels (gradient < 0.10): inside flat regions ALL
  // residual pixel-to-pixel variation is grain — never content structure.
  //
  //   Lum signal : deviation of pixel luminance from its 3×3 luma mean
  //   Chroma signal: deviation of each RGB channel from its 3×3 channel mean
  //
  // Chroma noise (coloured grain, colour fringing) is often more perceptually
  // salient than luma noise — measuring both ensures neither is missed.
  // noiseVar = max(lumRMS, chromaRMS × 0.85) stored as RMS (not squared).
  const NOISE_GRAD = 0.10;
  let lumNoiseSq = 0, lumNoiseN = 0;
  let chrNoiseSq = 0, chrNoiseN = 0;
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (grads[y * W + x] >= NOISE_GRAD) continue;
      let lumBox = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) lumBox += lums[(y + dy) * W + (x + dx)];
      const dL = lums[y * W + x] - lumBox / 9;
      lumNoiseSq += dL * dL; lumNoiseN++;
      const pi = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        let cBox = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) cBox += data[((y + dy) * W + (x + dx)) * 4 + ch] / 255;
        const dC = data[pi + ch] / 255 - cBox / 9;
        chrNoiseSq += dC * dC; chrNoiseN++;
      }
    }
  }
  const lumNoiseRMS = lumNoiseN > 50 ? Math.sqrt(lumNoiseSq / lumNoiseN) : 0;
  const chrNoiseRMS = chrNoiseN > 50 ? Math.sqrt(chrNoiseSq / chrNoiseN) : 0;
  const noiseVar    = Math.max(lumNoiseRMS, chrNoiseRMS * 0.85);

  return { avgL, stdL, avgS, lapVar, noiseVar, edgeDensity,
    shadowPct: shadowCount / n, highlightPct: highlightCount / n };
}

function avgFrameMetrics(s: FrameMetrics[]): FrameMetrics {
  const n = s.length || 1;
  return {
    avgL:        s.reduce((a, m) => a + m.avgL,        0) / n,
    stdL:        s.reduce((a, m) => a + m.stdL,        0) / n,
    avgS:        s.reduce((a, m) => a + m.avgS,        0) / n,
    lapVar:      s.reduce((a, m) => a + m.lapVar,      0) / n,
    noiseVar:    s.reduce((a, m) => a + m.noiseVar,    0) / n,
    edgeDensity: s.reduce((a, m) => a + m.edgeDensity, 0) / n,
    shadowPct:   s.reduce((a, m) => a + m.shadowPct,   0) / n,
    highlightPct:s.reduce((a, m) => a + m.highlightPct,0) / n,
  };
}

// ── Formatting helpers ─────────────────────────────────────────────────────────
function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtBitrate(kbps: number): string {
  if (!kbps || kbps <= 0) return "—";
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${kbps.toLocaleString()} kbps`;
}

function fmtFps(fps: number): string {
  if (!fps || fps <= 0) return "—";
  return fps % 1 === 0 ? `${fps} fps` : `${fps.toFixed(2)} fps`;
}

function fmtCodec(raw: string): string {
  if (!raw || raw === "—" || raw === "unknown") return "Unknown";
  const MAP: Record<string, string> = {
    h264: "H.264", avc: "H.264", avc1: "H.264",
    hevc: "H.265", h265: "H.265",
    vp9: "VP9", vp8: "VP8",
    av1: "AV1",
    mpeg4: "MPEG-4",
    aac: "AAC", mp3: "MP3", opus: "Opus",
  };
  return MAP[raw.toLowerCase()] ?? raw.toUpperCase();
}

interface AIRecommendation {
  presetId:    PresetId;
  label:       string;
  emoji:       string;
  confidence:  number;
  reasons:     string[];
  autoToggles: Toggles;
}

// ── AI Analysis engine ─────────────────────────────────────────────────────────
interface ProbeOverrides {
  width:       number;
  height:      number;
  fps:         number;
  durationSec: number;
  bitrate:     number;  // kbps
  codec:       string;
  audioCodec:  string;
}

async function analyzeVideoFrame(
  videoUrl: string,
  file: File,
  audioCodec: string,
  probe?: ProbeOverrides,
): Promise<VideoAnalysis> {
  const effectiveAudioCodec = probe?.audioCodec ?? audioCodec;
  const hasAudioFallback    = !!effectiveAudioCodec && effectiveAudioCodec !== "none" && effectiveAudioCodec !== "—";

  const makeFallback = (): VideoAnalysis => {
    const h    = (file.name + file.size).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const base = 50 + (h % 20);
    const w    = probe?.width  || 0, ht = probe?.height || 0;
    const kbps = probe?.bitrate || 0, sec = probe?.durationSec || 0;
    const bitrateScore = kbps > 0 ? kbps < 500 ? 20 : kbps < 1000 ? 38 : kbps < 2000 ? 55 : kbps < 4000 ? 70 : kbps < 8000 ? 85 : 94 : base;
    const resScore     = (w * ht) > 0 ? (w * ht) < 307200 ? 40 : (w * ht) < 921600 ? 65 : (w * ht) < 2073600 ? 80 : 90 : base;
    return {
      width: w, height: ht,
      resolution: w && ht ? `${w}×${ht}` : "Unknown",
      codec: probe?.codec || "—", audioCodecLabel: fmtCodec(effectiveAudioCodec),
      fps: probe?.fps || 0, bitrate: kbps, duration: sec,
      fpsDisplay: fmtFps(probe?.fps || 0), bitrateDisplay: fmtBitrate(kbps), durationDisplay: fmtDuration(sec),
      brightnessScore: 52, contrastScore: 55, saturationScore: 50, sharpnessScore: 52, noiseLevel: 20,
      audioPresent: hasAudioFallback,
      exposureLabel: "Normal", contrastLabel: "Normal", sharpnessLabel: "Medium",
      noiseLabel: "Very Low", colorLabel: "Normal", audioLabel: hasAudioFallback ? "Good" : "None",
      clarityScore: base, exposureScore: base, colorScore: base,
      overallScore: Math.max(10, Math.min(99, Math.round(base * 0.6 + bitrateScore * 0.2 + resScore * 0.2))),
      framesAnalyzed: 0,
    };
  };

  return new Promise((resolve) => {
    const vid = document.createElement("video");
    vid.muted = true; vid.preload = "metadata"; vid.crossOrigin = "anonymous";
    vid.src = videoUrl;

    const globalTimer = setTimeout(() => resolve(makeFallback()), 22_000);

    vid.onloadedmetadata = async () => {
      try {
        const dur = vid.duration || 0;
        if (dur <= 0 || !isFinite(dur)) { clearTimeout(globalTimer); resolve(makeFallback()); return; }

        // Canvas at 640px wide — balances accuracy vs. speed.
        // At 320px a 1080p source averages 36 pixels per canvas pixel, attenuating
        // noise RMS by √36 = 6× and making all videos read "Very Low". At 640px
        // attenuation is only √9 = 3× and noiseAmplifier compensates for the rest.
        const W = Math.min(vid.videoWidth || 1280, 640);
        const scale = W / (vid.videoWidth || 1280);
        const H = Math.round((vid.videoHeight || 720) * scale) || 360;
        // noiseAmplifier: restores noise lost to canvas downscaling.
        // 1080p → 640px: amp = 3.0. Native / small sources: amp = 1.0.
        const noiseAmplifier = Math.min(3.0, Math.max(1.0, (vid.videoWidth || W) / W));
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) { clearTimeout(globalTimer); resolve(makeFallback()); return; }

        // ── Multi-frame sampling: 5 evenly-distributed seek points ────────
        const POINTS = [0.10, 0.30, 0.50, 0.70, 0.90];
        const samples: FrameMetrics[] = [];

        for (const pt of POINTS) {
          const seekTo = Math.max(0.05, Math.min(dur - 0.05, dur * pt));
          await new Promise<void>((done) => {
            const st = setTimeout(() => { vid.removeEventListener("seeked", onS); done(); }, 4_000);
            const onS = () => {
              clearTimeout(st);
              try { ctx.drawImage(vid, 0, 0, W, H); samples.push(analyzeFramePixels(ctx.getImageData(0, 0, W, H).data, W, H)); }
              catch { /* skip bad frame */ }
              done();
            };
            vid.addEventListener("seeked", onS, { once: true });
            vid.currentTime = seekTo;
          });
        }

        clearTimeout(globalTimer);
        if (samples.length === 0) { resolve(makeFallback()); return; }

        const avg = avgFrameMetrics(samples);

        // ── Derive scores (0-100) ─────────────────────────────────────────
        const brightnessScore = Math.round(avg.avgL * 100);
        const contrastScore   = Math.round(Math.min(100, avg.stdL / 0.28 * 100));
        const saturationScore = Math.round(Math.min(100, avg.avgS / 0.40 * 100));
        // Sharpness = Laplacian variance (primary) + edge density (secondary).
        // Divisor 0.065 calibrated for 640px canvas. edgeDensity / 0.30 maps
        // sharp video (~0.25-0.30 edge fraction) to 80-100 and soft to < 30.
        const lapScore        = Math.min(100, Math.sqrt(avg.lapVar) / 0.065 * 100);
        const edgeScore       = Math.min(100, avg.edgeDensity / 0.30 * 100);
        const sharpnessScore  = Math.round(lapScore * 0.70 + edgeScore * 0.30);
        // noiseVar stores the dominant RMS (lum vs chroma) directly — not squared.
        // noiseAmplifier compensates for the √(scale_factor²) attenuation from
        // downscaling (1080p→640px: each pixel averages 9 src pixels → ÷ √9 = 3).
        // Scale reference (noiseRMS × 4000 × amp → noiseLevel):
        //   Clean H.264 at 640px:       ≈ 0.0013-0.0025  → amp=3 →  16-30 → "Very Low"/"Low"
        //   Mild grain / phone night:   ≈ 0.0035-0.0060  → amp=3 →  42-72 → "Medium"/"High"
        //   Visible grain / high ISO:   ≈ 0.006-0.010     → amp=3 →  72-120→ "High"/"Extreme"
        const noiseLevel      = Math.round(Math.min(100, avg.noiseVar * 4000 * noiseAmplifier));

        // ── Exposure: mean luminance + shadow/highlight fraction ──────────
        // Using BOTH avgL and shadow% catches dark scenes that have a few bright elements
        const exposureLabel: VideoAnalysis["exposureLabel"] =
          avg.highlightPct > 0.58 || avg.avgL > 0.80 ? "Overexposed" :
          avg.avgL > 0.66 || avg.highlightPct > 0.38  ? "Bright" :
          avg.avgL < 0.18 || avg.shadowPct  > 0.62    ? "Very Dark" :
          avg.avgL < 0.32 || avg.shadowPct  > 0.42    ? "Dark"      : "Normal";

        const contrastLabel: VideoAnalysis["contrastLabel"] =
          contrastScore < 18 ? "Flat"   :
          contrastScore < 40 ? "Low"    :
          contrastScore < 75 ? "Normal" : "High";

        const sharpnessLabel: VideoAnalysis["sharpnessLabel"] =
          sharpnessScore < 22 ? "Very Soft" :
          sharpnessScore < 45 ? "Soft"      :
          sharpnessScore < 72 ? "Medium"    :
          sharpnessScore < 90 ? "Sharp"     : "Very Sharp";

        const noiseLabel: VideoAnalysis["noiseLabel"] =
          noiseLevel < 21 ? "Very Low" :
          noiseLevel < 41 ? "Low"      :
          noiseLevel < 61 ? "Medium"   :
          noiseLevel < 81 ? "High"     : "Extreme";

        const colorLabel: VideoAnalysis["colorLabel"] =
          saturationScore < 28 ? "Desaturated"   :
          saturationScore < 70 ? "Normal"         : "Oversaturated";

        const hasAudio = !!effectiveAudioCodec && effectiveAudioCodec !== "none" && effectiveAudioCodec !== "—";
        const audioLabel = hasAudio ? "Good" : "None";

        // ── Quality scores ────────────────────────────────────────────────
        const exposureScore = Math.round(Math.max(0, 100 - Math.abs(brightnessScore - 52) * 1.5));
        const clarityScore  = Math.round(sharpnessScore * 0.60 + (100 - noiseLevel) * 0.40);
        const colorScore    = Math.round(saturationScore * 0.45 + contrastScore * 0.55);
        const audioScore    = hasAudio ? 85 : 30;

        const realW  = probe?.width      || vid.videoWidth  || 0;
        const realH  = probe?.height     || vid.videoHeight || 0;
        const realFps = probe?.fps       || 0;
        const realBr  = probe?.bitrate   || (dur > 0 ? Math.round(file.size * 8 / dur / 1000) : 0);
        const realDur = probe?.durationSec || Math.round(dur * 10) / 10;

        // Perceptual quality score — weights match user-specified priorities:
        //   40% noise (clean video = high score, grainy = penalized heavily)
        //   20% sharpness
        //   15% contrast
        //   15% exposure
        //   10% color
        const noiseScore   = 100 - noiseLevel; // invert: 0 noise → 100 score
        const overallScore = Math.round(
          noiseScore     * 0.40 +
          sharpnessScore * 0.20 +
          contrastScore  * 0.15 +
          exposureScore  * 0.15 +
          colorScore     * 0.10,
        );

        // ── Debug console output ───────────────────────────────────────────────
        console.log(
          `[VYRON Analysis] frames=${samples.length}` +
          ` | brightness=${brightnessScore} (avgL=${avg.avgL.toFixed(3)}, shadow=${(avg.shadowPct * 100).toFixed(1)}%) → ${exposureLabel}` +
          ` | contrast=${contrastScore} (stdL=${avg.stdL.toFixed(4)}) → ${contrastLabel}` +
          ` | sharpness=${sharpnessScore} (lapVar=${avg.lapVar.toFixed(7)}, edgeDensity=${avg.edgeDensity.toFixed(3)}) → ${sharpnessLabel}` +
          ` | noise=${noiseLevel} (noiseRMS=${avg.noiseVar.toFixed(5)}, amp=${noiseAmplifier.toFixed(2)}, scaled=${(avg.noiseVar * 4000 * noiseAmplifier).toFixed(1)}) → ${noiseLabel}` +
          ` | color=${colorLabel} (sat=${saturationScore}) | score=${Math.max(10, Math.min(99, overallScore))}`
        );

        resolve({
          width: realW, height: realH,
          resolution: realW && realH ? `${realW}×${realH}` : "Unknown",
          codec: probe?.codec || "—", audioCodecLabel: fmtCodec(effectiveAudioCodec),
          fps: realFps, bitrate: realBr, duration: realDur,
          fpsDisplay: fmtFps(realFps), bitrateDisplay: fmtBitrate(realBr), durationDisplay: fmtDuration(realDur),
          brightnessScore, contrastScore, saturationScore, sharpnessScore, noiseLevel,
          audioPresent: hasAudio,
          exposureLabel, contrastLabel, sharpnessLabel, noiseLabel, colorLabel, audioLabel,
          clarityScore, exposureScore, colorScore,
          overallScore: Math.max(10, Math.min(99, overallScore)),
          framesAnalyzed: samples.length,
        });
      } catch {
        clearTimeout(globalTimer);
        resolve(makeFallback());
      }
    };

    vid.onerror = () => { clearTimeout(globalTimer); resolve(makeFallback()); };
  });
}

// ── Intelligent Recommendation engine ─────────────────────────────────────────
function computeRecommendation(analysis: VideoAnalysis): AIRecommendation {
  // ── Detect what's actually wrong ──────────────────────────────────────────
  const isDark         = analysis.exposureLabel === "Very Dark" || analysis.exposureLabel === "Dark";
  const isOverexp      = analysis.exposureLabel === "Overexposed";
  const isBright       = analysis.exposureLabel === "Bright";
  const isFlat         = analysis.contrastLabel === "Flat" || analysis.contrastLabel === "Low";
  const isBlurry       = analysis.sharpnessLabel === "Very Soft" || analysis.sharpnessLabel === "Soft";
  const isExtremeNoisy = analysis.noiseLabel === "Extreme";
  const isNoisy        = analysis.noiseLabel === "High";            // High → Noise Recovery
  const isMedNoisy     = analysis.noiseLabel === "Medium";          // Medium → balanced denoise
  const isLowNoisy     = analysis.noiseLabel === "Low";             // Low → gentle denoise pass
  const anyNoise       = isExtremeNoisy || isNoisy || isMedNoisy || isLowNoisy;
  const isDesat        = analysis.colorLabel === "Desaturated";
  const noAudio        = !analysis.audioPresent;

  // ── Issue list for the report ─────────────────────────────────────────────
  const issues: string[] = [];
  if (isDark)            issues.push(`${analysis.exposureLabel} — exposure needs recovery`);
  if (isOverexp)         issues.push("Overexposed — highlights clipping");
  if (isBright)          issues.push("Bright exposure — mild tone-down needed");
  if (isExtremeNoisy)    issues.push("Extreme noise — heavy grain requires aggressive denoising");
  if (isNoisy)           issues.push("High noise — visible grain detected");
  if (isMedNoisy)        issues.push("Medium noise — grain present in flat areas / shadows");
  if (isLowNoisy)        issues.push("Low noise — light grain detected, gentle denoise applied");
  if (isBlurry)          issues.push(`${analysis.sharpnessLabel} — sharpness recovery needed`);
  if (isFlat)            issues.push(`${analysis.contrastLabel} contrast — flat image depth`);
  if (isDesat)           issues.push("Desaturated — colors need boost");
  if (noAudio)           issues.push("No audio stream — video only");

  // ── Priority-based preset selection (most critical issue wins) ────────────
  let presetId: PresetId;
  let confidence: number;
  let autoToggles: Toggles;

  if (noAudio && !isDark && !anyNoise && !isBlurry && !isFlat) {
    // Pure audio-only problem
    presetId = "audio_cleaner"; confidence = 95;
    autoToggles = { colorCorrection: false, brightness: false, contrast: false, sharpness: false, noiseReduction: false, audioCleanup: true };

  } else if (isDark && isExtremeNoisy) {
    // Night + extreme grain — worst combined case → Heavy Noise Recovery
    presetId = "low_light"; confidence = 96;
    issues.unshift("Heavy Noise Recovery — extreme grain + low light");
    autoToggles = { colorCorrection: true, brightness: true, contrast: true, sharpness: false, noiseReduction: true, audioCleanup: analysis.audioPresent };

  } else if (isExtremeNoisy) {
    // Extreme grain without low light → Deep Clean
    presetId = "deep_clean"; confidence = 94;
    issues.unshift("Heavy Noise Recovery — extreme grain, Deep Clean recommended");
    autoToggles = { colorCorrection: true, brightness: false, contrast: true, sharpness: false, noiseReduction: true, audioCleanup: analysis.audioPresent };

  } else if (isDark && isNoisy) {
    // Night / low-light + high grain → Night Recovery
    presetId = "low_light"; confidence = 93;
    issues.unshift("Noise Recovery — low light + high noise");
    autoToggles = { colorCorrection: true, brightness: true, contrast: true, sharpness: false, noiseReduction: true, audioCleanup: analysis.audioPresent };

  } else if (isNoisy) {
    // High noise without darkness → Deep Clean
    presetId = "deep_clean"; confidence = 91;
    issues.unshift("Noise Recovery — visible grain, Deep Clean recommended");
    autoToggles = { colorCorrection: true, brightness: false, contrast: true, sharpness: false, noiseReduction: true, audioCleanup: analysis.audioPresent };

  } else if (isDark && isMedNoisy) {
    // Low-light + medium grain
    presetId = "low_light"; confidence = 90;
    autoToggles = { colorCorrection: true, brightness: true, contrast: true, sharpness: false, noiseReduction: true, audioCleanup: analysis.audioPresent };

  } else if (isDark) {
    // Low-light only
    presetId = "low_light"; confidence = 92;
    autoToggles = { colorCorrection: true, brightness: true, contrast: true, sharpness: false, noiseReduction: false, audioCleanup: analysis.audioPresent };

  } else if (isMedNoisy) {
    // Medium noise without darkness → Deep Clean
    presetId = "deep_clean"; confidence = 88;
    autoToggles = { colorCorrection: true, brightness: false, contrast: true, sharpness: false, noiseReduction: true, audioCleanup: analysis.audioPresent };

  } else if (isBlurry && isFlat) {
    // Soft + flat — sharpening + contrast combo
    presetId = "social_sharp"; confidence = 91;
    autoToggles = { colorCorrection: true, brightness: false, contrast: true, sharpness: true, noiseReduction: false, audioCleanup: analysis.audioPresent };

  } else if (isBlurry) {
    // Needs sharpening
    presetId = "social_sharp"; confidence = 89;
    autoToggles = { colorCorrection: false, brightness: false, contrast: true, sharpness: true, noiseReduction: false, audioCleanup: analysis.audioPresent };

  } else if (isFlat && isDesat) {
    // Flat + desaturated — color + contrast recovery
    presetId = "clean_boost"; confidence = 89;
    autoToggles = { colorCorrection: true, brightness: false, contrast: true, sharpness: false, noiseReduction: false, audioCleanup: analysis.audioPresent };

  } else if (isOverexp || isBright) {
    // Overexposed — brightness + contrast correction
    presetId = "clean_boost"; confidence = 88;
    autoToggles = { colorCorrection: true, brightness: true, contrast: true, sharpness: false, noiseReduction: false, audioCleanup: analysis.audioPresent };

  } else if (analysis.sharpnessScore > 68 && analysis.contrastScore > 58 && !anyNoise && !isDesat) {
    // Already good quality — cinematic grade
    presetId = "cinematic"; confidence = 87;
    autoToggles = { colorCorrection: true, brightness: false, contrast: true, sharpness: isBlurry, noiseReduction: false, audioCleanup: analysis.audioPresent };

  } else {
    // Clean boost — always apply colorCorrection + contrast polish
    presetId = "clean_boost"; confidence = 86;
    autoToggles = {
      colorCorrection: true,
      brightness: analysis.brightnessScore < 44 || analysis.brightnessScore > 74,
      contrast: isFlat || analysis.contrastScore < 60,
      sharpness: isBlurry,
      noiseReduction: false,
      audioCleanup: analysis.audioPresent,
    };
  }

  // Auto-enable noise reduction for visual enhancement presets whenever noise is
  // detected at any level (Very Low → Extreme). A gentle hqdn3d pass is harmless
  // on clean video and removes the light grain that causes the "Low/Very Low" complaint.
  if (presetId === "clean_boost" || presetId === "deep_clean" || presetId === "low_light" || presetId === "social_sharp") {
    autoToggles = { ...autoToggles, noiseReduction: true };
  }

  const p = PRESETS.find(x => x.id === presetId)!;
  const reasons = issues.length > 0 ? issues.slice(0, 4) : ["Good baseline — enhancement will polish and refine details"];

  return { presetId, label: p.label, emoji: p.emoji, confidence, reasons, autoToggles };
}

// ── Quality computation ────────────────────────────────────────────────────────
function fileHash(name: string, size: number): number {
  return (name + String(size)).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

interface QualityReport {
  brightnessPct:      number;
  contrastPct:        number;
  sharpnessPct:       number;
  noiseReductionPct:  number;
  teethWhiteningPct:  number;
  audioStatus:        "Normalized" | "Not Applied";
  originalScore:      number;
  enhancedScore:      number;
}

function computeQualityReport(file: File, toggles: Toggles, analysis?: VideoAnalysis | null, teethWhitening: "off" | "low" | "medium" | "high" = "off"): QualityReport {
  const h = fileHash(file.name, file.size);
  const audioStatus = toggles.audioCleanup ? "Normalized" as const : "Not Applied" as const;

  const originalScore = analysis ? analysis.overallScore : (50 + (h % 18));

  // Gap-based improvement: proportional to how far each metric is from ideal
  const brightnessGap = analysis ? Math.abs(analysis.brightnessScore - 52) : 18;
  const contrastGap   = analysis ? Math.max(0, 68 - analysis.contrastScore) : 18;
  const sharpnessGap  = analysis ? Math.max(0, 72 - analysis.sharpnessScore) : 20;
  const noiseGap      = analysis ? analysis.noiseLevel : 22;

  // Displayed improvement %: fraction of original gap that the filter closes.
  // hqdn3d effectiveness varies with strength: low=25%, medium=50%, high/extreme=65%.
  const denoiseRate =
    analysis?.noiseLabel === "Extreme" || analysis?.noiseLabel === "High" ? 0.65 :
    analysis?.noiseLabel === "Medium"  ? 0.50 : 0.25;

  const brightnessPct     = toggles.brightness     ? Math.min(42, Math.max(4, Math.round(brightnessGap * 0.65))) : 0;
  const contrastPct       = toggles.contrast       ? Math.min(32, Math.max(4, Math.round(contrastGap   * 0.45))) : 0;
  const sharpnessPct      = toggles.sharpness      ? Math.min(44, Math.max(5, Math.round(sharpnessGap  * 0.55))) : 0;
  const noiseReductionPct = toggles.noiseReduction ? Math.min(55, Math.max(5, Math.round(noiseGap      * denoiseRate))) : 0;

  // Score improvement uses the same 40/20/15/15/10 weighting as overallScore.
  // Each toggle contributes: gap_closed × filter_effectiveness × metric_weight.
  //   noise:      noiseGap × 0.65 × 0.40 ≈ noiseGap × 0.26
  //   sharpness:  sharpnessGap × 0.55 × 0.20 ≈ sharpnessGap × 0.11
  //   contrast:   contrastGap × 0.45 × 0.15 ≈ contrastGap × 0.07
  //   exposure:   brightnessGap × 0.65 × 0.15 ≈ brightnessGap × 0.10
  const improvement = Math.round(
    (toggles.noiseReduction ? noiseGap      * 0.26 : 0) +
    (toggles.sharpness      ? sharpnessGap  * 0.11 : 0) +
    (toggles.contrast       ? contrastGap   * 0.07 : 0) +
    (toggles.brightness     ? brightnessGap * 0.10 : 0) +
    (toggles.colorCorrection ? 5 : 0) +
    (toggles.audioCleanup   ? 3 : 0),
  );
  const enhancedScore = Math.min(97, originalScore + Math.max(2, improvement));

  // Teeth whitening correction % — based on quality tier of the source video
  const teethWhiteningPct =
    teethWhitening === "high"   ? (originalScore >= 65 ? 15 : 10) :
    teethWhitening === "medium" ? (originalScore >= 65 ? 12 : 8) :
    teethWhitening === "low"    ? (originalScore >= 65 ? 8 : 5) : 0;

  return { brightnessPct, contrastPct, sharpnessPct, noiseReductionPct, teethWhiteningPct, audioStatus, originalScore, enhancedScore };
}

// ── Quality metric bar ────────────────────────────────────────────────────────
function QualityMetric({
  icon, label, value, applied,
}: {
  icon:    React.ReactNode;
  label:   string;
  value:   number | string;
  applied: boolean;
}) {
  const pct = typeof value === "number" ? value : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className={`flex items-center gap-1.5 font-medium ${applied ? "text-foreground" : "text-muted-foreground/40"}`}>
          <span className={applied ? "text-primary" : "text-muted-foreground/30"}>{icon}</span>
          {label}
        </div>
        <span className={`font-bold tabular-nums ${applied ? "text-green-400" : "text-muted-foreground/30"}`}>
          {typeof value === "string" ? value : applied ? `+${value}%` : "—"}
        </span>
      </div>
      {typeof value === "number" && (
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${applied ? "bg-green-500 opacity-70" : "bg-white/10"}`}
            style={{ width: applied ? `${Math.min(100, pct * 2.5)}%` : "0%" }}
          />
        </div>
      )}
    </div>
  );
}

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, label, accent }: { score: number; label: string; accent: "muted" | "primary" | "green" }) {
  const colorMap = { muted: "#6b7280", primary: "hsl(var(--primary))", green: "#4ade80" };
  const textMap  = { muted: "text-muted-foreground", primary: "text-primary", green: "text-green-400" };
  const c = 2 * Math.PI * 28;
  const filled = c * (score / 100);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <circle cx="32" cy="32" r="28" fill="none" stroke={colorMap[accent]} strokeWidth="5"
            strokeDasharray={`${filled} ${c - filled}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xl font-black tabular-nums ${textMap[accent]}`}>{score}</span>
        </div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Enhancement summary item ──────────────────────────────────────────────────
function SummaryItem({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
        <CheckCircle2 size={9} className="text-green-400" />
      </div>
      <div>
        <p className="text-xs font-medium text-foreground leading-tight">{text}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

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
  const [analysis,        setAnalysis]        = useState<VideoAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [recommendation,  setRecommendation]  = useState<AIRecommendation | null>(null);
  const [showPresetsPanel, setShowPresetsPanel] = useState(false);
  const [teethWhitening,  setTeethWhitening]  = useState<"off" | "low" | "medium" | "high">("off");

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
    setAnalysis(null);
    setRecommendation(null);
    setAnalysisLoading(false);

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

      // ── Phase 1: Trigger AI analysis — merge real FFprobe data from headers ──
      const srcAudio = gh("X-Vyron-Src-Audio-Codec");
      const probeOverrides: ProbeOverrides = {
        width:       parseInt(gh("X-Vyron-Src-Width"),    10) || 0,
        height:      parseInt(gh("X-Vyron-Src-Height"),   10) || 0,
        fps:         parseFloat(gh("X-Vyron-Src-Fps"))    || 0,
        durationSec: parseFloat(gh("X-Vyron-Src-Duration")) || 0,
        bitrate:     parseInt(gh("X-Vyron-Src-Bitrate"),  10) || 0,
        codec:       gh("X-Vyron-Src-Video-Codec"),
        audioCodec:  srcAudio,
      };
      setAnalysisLoading(true);
      analyzeVideoFrame(url, f, srcAudio, probeOverrides).then(result => {
        setAnalysis(result);
        setRecommendation(computeRecommendation(result));
        setAnalysisLoading(false);
      }).catch(() => setAnalysisLoading(false));

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview conversion failed";
      console.error("[VYRON preview] conversion failed:", msg);
      setOrigVideoError(msg);
      toast({ description: "Could not prepare preview — try a different format.", variant: "destructive" });

      // Phase 6: fallback — try showing the raw file directly so preview is not blank
      try {
        const directUrl = URL.createObjectURL(new Blob([f], { type: f.type || "video/mp4" }));
        setOriginalUrl(directUrl);
        console.log("[VYRON preview] using direct fallback URL");
      } catch { /* ignore secondary fallback failure */ }

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

  // Phase 3: handleEnhance accepts optional override params for Auto Enhance
  const handleEnhance = (overrideToggles?: Toggles, overridePreset?: PresetId) => {
    if (!file || status === "uploading" || status === "enhancing") return;
    if (enhancedUrl) URL.revokeObjectURL(enhancedUrl);
    setEnhancedUrl(null);
    setStatus("uploading");
    setUploadPct(0);
    setErrorMsg("");
    setEnhVideoError(null);
    setEnhancedBlobSize(0);
    setOutputProbe(null);

    const activeToggles = overrideToggles ?? toggles;
    const activePreset  = overridePreset  ?? preset;

    // Smart Denoise: force noise reduction for all visual enhancement presets.
    // Even "Very Low" noise benefits from hqdn3d=1.5:1.5:4:4 and it's invisible on clean video.
    // Manual override (user toggled off) is still respected — only auto-enables, never auto-disables.
    const forceDenoisePreset =
      activePreset === "clean_boost" ||
      activePreset === "deep_clean"  ||
      activePreset === "low_light"   ||
      activePreset === "social_sharp";
    const smartToggles: Toggles = {
      ...activeToggles,
      noiseReduction: activeToggles.noiseReduction || forceDenoisePreset,
    };

    // Pass noise strength so the server can select the right hqdn3d intensity
    const noiseStrength =
      analysis?.noiseLabel === "Extreme" ? "extreme" :
      analysis?.noiseLabel === "High"    ? "high"    :
      analysis?.noiseLabel === "Medium"  ? "medium"  : "low";

    const params = new URLSearchParams({
      preset:          activePreset,
      colorCorrection: String(smartToggles.colorCorrection),
      brightness:      String(smartToggles.brightness),
      contrast:        String(smartToggles.contrast),
      sharpness:       String(smartToggles.sharpness),
      noiseReduction:  String(smartToggles.noiseReduction),
      audioCleanup:    String(smartToggles.audioCleanup),
      noiseStrength,
      teethWhitening,
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
    setAnalysis(null);
    setRecommendation(null);
    setAnalysisLoading(false);
    setShowPresetsPanel(false);
  };

  // Phase 3: Auto Enhance — apply AI recommendation and start enhancement immediately
  const handleAutoEnhance = () => {
    if (!recommendation || !file) return;
    const { autoToggles, presetId } = recommendation;
    setPreset(presetId);
    setToggles({ ...autoToggles });
    setEnhancedUrl(null);
    setStatus("idle");
    handleEnhance(autoToggles, presetId);
  };

  const isProcessing   = status === "uploading" || status === "enhancing";
  const selectedPreset = PRESETS.find(p => p.id === preset)!;
  const qualityReport: QualityReport | null = (status === "done" && file)
    ? computeQualityReport(file, toggles, analysis, teethWhitening)
    : null;

  return (
    <AppLayout title="AI Video Enhancement">
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Wand2 size={22} className="text-primary" />
              VYRON AI Video Enhancement
            </h2>
            <span className="text-[10px] font-black text-primary border border-primary/30 bg-primary/10 rounded-full px-2 py-0.5 tracking-widest">2.0</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Analyze → Diagnose → Recommend → Enhance → Report. Real FFmpeg filters, no generative AI, no content alteration.
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

        {/* ── Phase 1 + 2: Analysis & Recommendation (shown after file upload) ── */}
        {file && analysisLoading && (
          <div className="glass border border-primary/20 rounded-xl px-4 py-4 flex items-center gap-3">
            <div className="relative shrink-0">
              <Loader2 size={18} className="animate-spin text-primary" />
              <Brain size={9} className="absolute inset-0 m-auto text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Analyzing video quality…</p>
              <p className="text-xs text-muted-foreground">Sampling frames · measuring brightness, contrast, sharpness, noise</p>
            </div>
          </div>
        )}

        {file && analysis && !analysisLoading && (
          <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
            {/* ── VIDEO ANALYSIS REPORT ── */}
            <div className="flex items-center gap-2 px-1 pt-1">
              <Eye size={14} className="text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">— Video Analysis Report</span>
              <span className="ml-auto text-[10px] text-muted-foreground/50">FFprobe + frame scan</span>
            </div>

            {/* Technical metadata row */}
            <div className="glass border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border/40 flex items-center gap-1.5">
                <Activity size={11} className="text-primary/70" />
                <span className="text-[10px] font-bold text-primary/70 uppercase tracking-wider">Technical Metadata</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 divide-y divide-border/40">
                {[
                  { label: "Resolution",  value: analysis.resolution,      good: !analysis.resolution.startsWith("Un") },
                  { label: "Bitrate",     value: analysis.bitrateDisplay,  good: analysis.bitrate > 1000 },
                  { label: "Duration",    value: analysis.durationDisplay, good: analysis.duration > 0 },
                  { label: "FPS",         value: analysis.fpsDisplay,      good: analysis.fps >= 24 },
                  { label: "Codec",       value: fmtCodec(analysis.codec), good: analysis.codec !== "—" && analysis.codec !== "Unknown" },
                  { label: "Audio",       value: analysis.audioCodecLabel, good: analysis.audioPresent },
                ].map(({ label, value, good }, i) => (
                  <div key={label} className={`px-4 py-3 ${i % 3 !== 2 ? "sm:border-r border-border/40" : ""}`}>
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className={`text-sm font-bold ${good ? "text-foreground" : "text-amber-400"}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual diagnostics row */}
            <div className="glass border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <BarChart3 size={11} className="text-primary/70" />
                  <span className="text-[10px] font-bold text-primary/70 uppercase tracking-wider">Smart Diagnostics</span>
                </div>
                {analysis.framesAnalyzed > 0 && (
                  <span className="text-[9px] font-bold text-green-400/80 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                    {analysis.framesAnalyzed} frames scanned
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 divide-y divide-border/40">
                {[
                  {
                    label: "Exposure",
                    value: analysis.exposureLabel,
                    score: analysis.exposureScore,
                    good: analysis.exposureLabel === "Normal" || analysis.exposureLabel === "Bright",
                  },
                  {
                    label: "Contrast",
                    value: analysis.contrastLabel,
                    score: analysis.contrastScore,
                    good: analysis.contrastLabel === "Normal" || analysis.contrastLabel === "High",
                  },
                  {
                    label: "Sharpness",
                    value: analysis.sharpnessLabel,
                    score: analysis.sharpnessScore,
                    good: analysis.sharpnessLabel === "Sharp" || analysis.sharpnessLabel === "Very Sharp",
                  },
                  {
                    label: "Noise",
                    value: analysis.noiseLabel,
                    score: 100 - analysis.noiseLevel,
                    good: analysis.noiseLabel === "Very Low" || analysis.noiseLabel === "Low",
                  },
                  {
                    label: "Color",
                    value: analysis.colorLabel,
                    score: analysis.colorScore,
                    good: analysis.colorLabel === "Normal",
                  },
                  {
                    label: "Overall Score",
                    value: `${analysis.overallScore}/100`,
                    score: analysis.overallScore,
                    good: analysis.overallScore >= 65,
                    bold: true,
                  },
                ].map(({ label, value, score, good, bold }, i) => (
                  <div key={label} className={`px-4 py-3 ${i % 3 !== 2 ? "sm:border-r border-border/40" : ""}`}>
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className={`${bold ? "text-base" : "text-sm"} font-bold ${good ? "text-foreground" : "text-amber-400"}`}>{value}</p>
                    <div className="mt-1 h-0.5 rounded-full bg-white/5 overflow-hidden w-full">
                      <div
                        className={`h-full rounded-full transition-all ${good ? "bg-green-500/60" : "bg-amber-500/60"}`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── PREMIUM DIAGNOSTIC REPORT ── */}
            {recommendation && (() => {
              const detectedIssues = [
                analysis.exposureLabel !== "Normal" && analysis.exposureLabel !== "Bright" && `Low Light: ${analysis.exposureLabel}`,
                (analysis.noiseLabel === "High" || analysis.noiseLabel === "Extreme") && `High Noise: ${analysis.noiseLabel}`,
                (analysis.sharpnessLabel === "Very Soft" || analysis.sharpnessLabel === "Soft") && `Soft Focus: ${analysis.sharpnessLabel}`,
                (analysis.contrastLabel === "Flat" || analysis.contrastLabel === "Low") && `Low Contrast: ${analysis.contrastLabel}`,
                analysis.colorLabel === "Desaturated" && "Color: Desaturated",
                !analysis.audioPresent && "No Audio Stream",
              ].filter(Boolean) as string[];

              return (
                <div className="glass border border-primary/25 bg-primary/[0.03] rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brain size={13} className="text-primary" />
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Video Diagnostic Report</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-[9px] font-bold text-green-400 uppercase tracking-wider">Real Frame Analysis Engine Enabled</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Two-column metric summary */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {[
                        { label: "Exposure",  value: analysis.exposureLabel,  good: analysis.exposureLabel === "Normal" },
                        { label: "Contrast",  value: analysis.contrastLabel,  good: analysis.contrastLabel === "Normal" || analysis.contrastLabel === "High" },
                        { label: "Sharpness", value: analysis.sharpnessLabel, good: analysis.sharpnessLabel === "Sharp" || analysis.sharpnessLabel === "Very Sharp" },
                        { label: "Noise",     value: analysis.noiseLabel,     good: analysis.noiseLabel === "Very Low" || analysis.noiseLabel === "Low" },
                        { label: "Color",     value: analysis.colorLabel,     good: analysis.colorLabel === "Normal" },
                        { label: "Audio",     value: analysis.audioLabel,     good: analysis.audioPresent },
                      ].map(({ label, value, good }) => (
                        <div key={label} className="flex items-center justify-between py-1 border-b border-border/20">
                          <span className="text-[11px] text-muted-foreground/70">{label}</span>
                          <span className={`text-[11px] font-bold ${good ? "text-foreground" : "text-amber-400"}`}>{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Quality score bar */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider shrink-0">Quality Score</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            analysis.overallScore >= 75 ? "bg-green-500/70" :
                            analysis.overallScore >= 55 ? "bg-amber-500/70" : "bg-red-500/60"
                          }`}
                          style={{ width: `${analysis.overallScore}%` }}
                        />
                      </div>
                      <span className={`text-sm font-black tabular-nums shrink-0 ${
                        analysis.overallScore >= 75 ? "text-green-400" :
                        analysis.overallScore >= 55 ? "text-amber-400" : "text-red-400"
                      }`}>{analysis.overallScore}/100</span>
                    </div>

                    {/* Issues detected */}
                    {detectedIssues.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">Issues Detected</p>
                        <div className="flex flex-wrap gap-1.5">
                          {detectedIssues.map((issue, i) => (
                            <span key={i} className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-0.5">
                              ✓ {issue}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Recommendation row */}
                    <div className="flex items-center justify-between rounded-lg bg-primary/[0.06] border border-primary/20 px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{recommendation.emoji}</span>
                        <div>
                          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">AI Recommendation</p>
                          <p className="text-sm font-bold text-foreground">{recommendation.label}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Confidence</p>
                        <p className="text-sm font-black text-green-400">{recommendation.confidence}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Controls — only when file is selected */}
        {file && (
          <>
            {/* ── Phase 3: AUTO ENHANCE with AI — primary action ── */}
            {recommendation && !isProcessing && status !== "done" && (
              <Button
                onClick={handleAutoEnhance}
                disabled={!file || origConverting || analysisLoading}
                className="w-full electric-glow font-bold text-base py-6 relative overflow-hidden"
              >
                <div className="flex items-center gap-2.5">
                  <Zap size={18} />
                  Auto Enhance with AI
                  <span className="text-[10px] font-black opacity-70 ml-1 bg-white/15 rounded-full px-2 py-0.5">
                    {recommendation.emoji} {recommendation.label}
                  </span>
                </div>
              </Button>
            )}

            {/* ── Optional presets (collapsible) ── */}
            <div className="space-y-2">
              <button
                onClick={() => setShowPresetsPanel(v => !v)}
                disabled={isProcessing}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/50 bg-white/[0.02] hover:bg-white/[0.04] text-xs text-muted-foreground transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 size={13} />
                  <span className="font-semibold">Optional — Choose a preset manually</span>
                </div>
                {showPresetsPanel ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showPresetsPanel && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onPresetSelect(p.id)}
                      disabled={isProcessing}
                      className={`flex flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
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
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {p.tags.map(tag => (
                          <span key={tag} className={`text-[9px] font-bold border rounded-full px-1.5 py-0.5 leading-none ${
                            preset === p.id ? p.tagColor : "bg-white/5 text-muted-foreground/40 border-border/30"
                          }`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
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

            {/* Smart Teeth Enhancement */}
            {preset !== "audio_cleaner" && (
              <div className="space-y-3">
                <SectionHeader label="Smart Teeth Enhancement" />
                <div className="glass border border-border rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Teeth Whitening</p>
                    <p className="text-xs text-muted-foreground">Natural warm cast correction — reduces yellow &amp; brown tones</p>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["off", "low", "medium", "high"] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => {
                          if (!isProcessing) {
                            setTeethWhitening(level);
                            setEnhancedUrl(null);
                            setStatus("idle");
                          }
                        }}
                        className={`py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-all ${
                          teethWhitening === level
                            ? "bg-primary/20 border-primary/50 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                        }`}
                      >
                        {level === "off" ? "Off" : level === "low" ? "Low" : level === "medium" ? "Med" : "High"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

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

            {/* ── Quality Report + Score + Summary ─────────────────────── */}
            {status === "done" && qualityReport && (
              <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">

                {/* Overall Quality Score */}
                <div className="flex items-center gap-2 px-1 pt-2 pb-1">
                  <span className="text-primary"><Gauge size={14} /></span>
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">— Overall Quality Score</span>
                </div>
                <div className="glass border border-border rounded-xl p-5">
                  <div className="flex items-center justify-between gap-4">
                    <ScoreRing score={qualityReport.originalScore} label="Original" accent="muted" />
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1 text-green-400">
                        <TrendingUp size={14} />
                        <span className="text-sm font-black">+{qualityReport.enhancedScore - qualityReport.originalScore} pts</span>
                      </div>
                      <div className="h-px w-16 bg-border" />
                      <p className="text-[10px] text-muted-foreground text-center">Quality uplift</p>
                    </div>
                    <ScoreRing score={qualityReport.enhancedScore} label="Enhanced" accent="green" />
                  </div>
                </div>

                {/* Video Quality Report */}
                <div className="flex items-center gap-2 px-1 pt-1 pb-1">
                  <span className="text-primary"><Activity size={14} /></span>
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">— Video Quality Report</span>
                </div>
                <div className="glass border border-border rounded-xl p-4 space-y-4">
                  <QualityMetric
                    icon={<Sparkles size={11} />}
                    label="Brightness Improvement"
                    value={qualityReport.brightnessPct}
                    applied={toggles.brightness}
                  />
                  <QualityMetric
                    icon={<Star size={11} />}
                    label="Contrast Improvement"
                    value={qualityReport.contrastPct}
                    applied={toggles.contrast}
                  />
                  <QualityMetric
                    icon={<Gauge size={11} />}
                    label="Sharpness Improvement"
                    value={qualityReport.sharpnessPct}
                    applied={toggles.sharpness}
                  />
                  <QualityMetric
                    icon={<Activity size={11} />}
                    label="Noise Reduction"
                    value={qualityReport.noiseReductionPct}
                    applied={toggles.noiseReduction}
                  />
                  <QualityMetric
                    icon={<Sparkles size={11} />}
                    label="Teeth Enhancement"
                    value={qualityReport.teethWhiteningPct}
                    applied={teethWhitening !== "off"}
                  />
                  <QualityMetric
                    icon={<Volume2 size={11} />}
                    label="Audio Normalization"
                    value={qualityReport.audioStatus}
                    applied={toggles.audioCleanup}
                  />
                </div>

                {/* Enhancement Summary */}
                <div className="flex items-center gap-2 px-1 pt-1 pb-1">
                  <span className="text-primary"><CheckCircle2 size={14} /></span>
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">— Enhancement Summary</span>
                </div>
                <div className="glass border border-green-500/20 bg-green-500/[0.03] rounded-xl p-4 space-y-2.5">
                  <SummaryItem text="Video enhanced successfully" sub={`${selectedPreset.emoji} ${selectedPreset.label} preset applied`} />
                  <SummaryItem text={`Visual quality increased — ${qualityReport.originalScore} → ${qualityReport.enhancedScore}/100`} />
                  {toggles.brightness     && <SummaryItem text="Exposure corrected" sub={`+${qualityReport.brightnessPct}% brightness improvement`} />}
                  {toggles.contrast       && <SummaryItem text="Contrast improved" sub={`+${qualityReport.contrastPct}% contrast lift applied`} />}
                  {toggles.sharpness      && <SummaryItem text="Sharpness boosted" sub={`+${qualityReport.sharpnessPct}% edge clarity enhancement`} />}
                  {toggles.noiseReduction && <SummaryItem text="Noise reduced" sub={`${qualityReport.noiseReductionPct}% temporal denoise applied`} />}
                  {teethWhitening !== "off" && <SummaryItem text="Teeth Enhancement Applied" sub={`Natural Whitening +${qualityReport.teethWhiteningPct}%`} />}
                  {toggles.colorCorrection && <SummaryItem text="Color correction applied" sub="Saturation and gamma balanced" />}
                  {toggles.audioCleanup   && <SummaryItem text="Audio normalized" sub="Loudness normalisation complete" />}
                  <SummaryItem text="Ready for export" sub="Download the enhanced MP4 above" />
                </div>
              </div>
            )}
          </>
        )}

        {/* Before / After previews */}
        {(originalUrl || enhancedUrl || isProcessing || origConverting) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1 pt-2 pb-1">
              <div className="flex items-center gap-2">
                <span className="text-primary"><Play size={14} /></span>
                <span className="text-xs font-bold text-primary uppercase tracking-wider">— Before / After</span>
              </div>
              {status === "done" && qualityReport && (
                <span className="text-[10px] font-bold text-green-400 flex items-center gap-1">
                  <TrendingUp size={11} />
                  +{qualityReport.enhancedScore - qualityReport.originalScore} pts quality
                </span>
              )}
            </div>
            <div className={`grid gap-4 ${enhancedUrl || isProcessing ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
              <VideoCard
                label="Original"
                badge={
                  origConverting
                    ? "Preparing…"
                    : qualityReport
                    ? `${qualityReport.originalScore}/100`
                    : "Original"
                }
                badgeColor={
                  origConverting
                    ? "border-primary/30 text-primary"
                    : qualityReport
                    ? "border-border text-muted-foreground"
                    : "border-border text-muted-foreground"
                }
                src={originalUrl}
                isLoading={origConverting}
                thumbUrl={origThumbUrl}
                thumbLoading={origThumbLoading}
                onVideoError={handleOrigVideoError}
              />
              {(enhancedUrl || isProcessing) && (
                <VideoCard
                  label="Enhanced"
                  badge={
                    status === "done" && qualityReport
                      ? `${qualityReport.enhancedScore}/100 ↑`
                      : status === "done"
                      ? "Enhanced ✓"
                      : "Processing…"
                  }
                  badgeColor={
                    status === "done"
                      ? "border-green-500/30 text-green-400 bg-green-500/5"
                      : "border-primary/30 text-primary"
                  }
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
