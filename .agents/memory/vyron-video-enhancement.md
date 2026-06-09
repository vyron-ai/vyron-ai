---
name: VYRON Video Enhancement Engine
description: Critical decisions and calibration constants for the AI Video Enhancement system (noise detection, filter chain, scoring, auto-enable logic).
---

## Canvas size for pixel analysis
- Analysis canvas: 640px wide (NOT 320px). At 320px a 1080p source averages 36 pixels per canvas pixel → noise RMS attenuated by √36 = 6× → every video reads "Very Low".
- `noiseAmplifier = min(3.0, max(1.0, vid.videoWidth / W))` compensates for the remaining √9 = 3× attenuation.
- **Why:** 320px destroyed the noise signal completely; 640px + amplifier gives accurate readings.

## Noise detection algorithm (flat-pixel box-residual)
- Gradient mask: pixels with Chebyshev gradient ≥ 0.10 are skipped (edge pixels).
- Luma signal: deviation of flat pixel from 3×3 luma mean.
- Chroma signal: per-channel (R,G,B) deviation from 3×3 channel mean.
- noiseVar = max(lumRMS, chromaRMS × 0.85) — stored as RMS directly (NOT squared).
- noiseLevel = noiseVar × 4000 × noiseAmplifier (no sqrt since noiseVar is already RMS).
- **Why:** Previous flat-block threshold 0.06 excluded nearly all pixels in typical videos, giving 0 noise for everything.

## Sharpness: dual-signal (640px calibrated)
- lapScore = min(100, sqrt(lapVar) / 0.065 × 100) — divisor recalibrated for 640px canvas.
- edgeScore = min(100, edgeDensity / 0.30 × 100) — edge density (fraction of pixels with gradient ≥ 0.05).
- sharpnessScore = lapScore × 0.70 + edgeScore × 0.30.

## FFmpeg filter order (CRITICAL — never change this order)
1. hqdn3d (DENOISE FIRST — before sharpen/color, prevents grain amplification)
2. eq (brightness/contrast/saturation/gamma)
3. curves + vignette (cinematic only)
4. unsharp (SHARPEN LAST — after denoise, recovers micro-detail without halos)
5. scale=trunc(iw/2)*2:trunc(ih/2)*2 (always last)
- **Why:** Applying unsharp before denoise amplifies grain and creates halos on skin edges.

## hqdn3d strength tiers (luma_spatial:chroma_spatial:luma_tmp:chroma_tmp)
- "low" (noiseLabel Low/Very Low): 1.5:1.5:4:4
- "medium" (noiseLabel Medium): 2.5:2.5:6:6
- "high" (noiseLabel High): 3:3:8:8
- "extreme" (noiseLabel Extreme): 3:3:8:8 (same as high — avoids over-smoothing)
- low_light base pass (toggle off): 2.5:2.5:6:6 (medium — gamma lift amplifies grain)

## Auto-enable noise reduction rule
- clean_boost, low_light, social_sharp presets → noiseReduction ALWAYS auto-enabled.
- Also forced at enhance time via `smartToggles` in `handleEnhance()`.
- Cinematic and audio_cleaner presets do NOT auto-enable noise reduction.
- **Why:** "Low" and "Very Low" noise was never triggering denoise; `anyNoise` previously excluded those tiers and all clean_boost/social_sharp branches had `noiseReduction: false`.

## noiseStrength must be passed as parameter to buildEnhanceFilters
- buildEnhanceFilters(preset, toggles, noiseStrength) — third arg required.
- Previously was missing: noiseStrength was undefined inside the function → always used weakest fallback.
- Frontend sends: "low" | "medium" | "high" | "extreme" based on analysis.noiseLabel.
- Very Low and Low both map to "low" tier.

## Score weights (overallScore)
40% noise (100 - noiseLevel), 20% sharpness, 15% contrast, 15% exposure, 10% color.
- No bitrate or resolution component in the score formula.
- **Why:** Score should reflect perceptual visual quality, not encoding specs.

## computeQualityReport improvement weights
- noiseGap × 0.26 (noise effectiveness 65% × weight 40%)
- sharpnessGap × 0.11 (sharp effectiveness 55% × weight 20%)
- contrastGap × 0.07 (contrast effectiveness 45% × weight 15%)
- brightnessGap × 0.10 (brightness effectiveness 65% × weight 15%)
- colorCorrection: +5 pts flat; audioCleanup: +3 pts flat

## noiseReductionPct (displayed %)
- Uses denoiseRate based on noiseLabel: High/Extreme → 0.65, Medium → 0.50, Low → 0.25.
- noiseReductionPct = min(55, max(5, round(noiseGap × denoiseRate)))

## Deep Clean preset
- `preset === "deep_clean"` → always applies `hqdn3d=3:3:8:8` regardless of `noiseStrength` toggle (it's the defining feature).
- Unsharp always applied: `unsharp=3:3:0.3:3:3:0` (base); `unsharp=3:3:0.5:3:3:0` when sharpness toggle ON.
- EQ: `brightness=0.04, contrast=1.14, saturation=1.10` (conservative — preserves face tone).
- Recommendation routing: medium/high/extreme noise **without** darkness → `deep_clean`. Dark + noisy → still `low_light`.
- `forceDenoisePreset` includes `deep_clean` in both `computeRecommendation` post-process and `handleEnhance`.

## Smart Teeth Enhancement (FFmpeg curves — yellow cast correction)
- Implemented as selective warm-tone correction targeting luminance range 0.40–0.75 (teeth zone).
- Applied as step 3 in filter chain (after eq, before cinematic curves, before unsharp).
- Three levels:
  - LOW:    `curves=r='0/0 0.4/0.4 0.75/0.735 1/1':b='0/0 0.4/0.4 0.75/0.765 1/1'`
  - MEDIUM: `curves=r='0/0 0.4/0.4 0.75/0.720 1/1':b='0/0 0.4/0.4 0.75/0.780 1/1'`
  - HIGH:   `curves=r='0/0 0.4/0.4 0.75/0.705 1/1':b='0/0 0.4/0.4 0.75/0.795 1/1'`
- State: `teethWhitening: "off" | "low" | "medium" | "high"` (separate from Toggles, default "off").
- Display %: LOW=5–8%, MEDIUM=8–12%, HIGH=10–15% (based on `originalScore >= 65` tier).
- **Why:** True teeth/facial landmark detection requires ML (unavailable in this env). Professional NLEs implement dental correction the same way — selective yellow neutralization via curves, not pixel segmentation.
