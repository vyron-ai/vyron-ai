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

## VYRON Studio Clean Pipeline — full filter order (MANDATORY — do not reorder)
Filter chain inside `buildEnhanceFilters` (in execution order):
1. `pp=hb/vb` — deblock (needsHeavyClean gate)
2. `hqdn3d=0.5:1.5:3:6` — chroma NR (needsHeavyClean gate)
3. main hqdn3d — temporal denoise (preset/noiseStrength driven)
4. `hqdn3d=2:2:6:6` — face temporal denoise (faceDenoise gate) ← BEFORE any eq
5. `eq=saturation` only — color correction (chroma-safe, no luma change)
6. `eq=brightness:contrast:gamma` — exposure recovery (ALL denoise done first)
7. Studio Look (tone curves work on correctly-exposed values)
8. `unsharp=3:3:0.2` — face preserve / definition recovery (faceDenoise gate)
9. Cinematic curves+vignette (cinematic preset only)
10. `unsharp=X:X:Y:X:X:0` — sharpen localized (per-preset)
11. `scale=trunc(iw/2)*2:trunc(ih/2)*2`

**CRITICAL:** Steps 3+4 (ALL hqdn3d) MUST run before steps 5+6 (any eq luma change).
low_light has gamma=1.65, brightness=0.20 — applying these before denoise multiplies noise ×1.65.
Eq is split into two passes: saturation-only first (chroma safe), then brightness+contrast+gamma.
**Why deblock before NR:** block artifact edges would be amplified by hqdn3d if not removed first.
**Why chroma NR before main NR:** temporal chroma pass works on colour-clean frames.

## Smart Face Denoise (auto, noise >= Medium)
- Inserts `hqdn3d=2:2:6:6` + `unsharp=3:3:0.2` at step 2.2 inside `buildEnhanceFilters` — AFTER base eq, BEFORE Studio Look.
- Activated by `faceDenoise` query param (`"true"` / `"false"`). Frontend sends `faceDenoise=true` when `analysis.noiseLabel` is Medium / High / Extreme.
- `buildEnhanceFilters` 6th param: `faceDenoise = false`.
- No UI toggle — fully automatic. `QualityReport.faceDenoiseApplied: boolean` drives report display.
- Report shows "Applied" / "Not Applied" status metric + SummaryItem "Smart Face Denoise Applied" when active.
- **Why:** Separate lighter spatial denoise pass (different hqdn3d params than the main noise-reduction toggle) runs on the already-eq-corrected signal so tone corrections don't re-introduce chroma noise, and runs before Studio Look so tone curves get a clean input.

## Smart Studio Look (FFmpeg tone/colour portrait enhancement)
- Three modes passed as `studioLook` query param: "natural" | "creator" | "studio" (default "off").
- Implemented in `buildStudioLookFilters(studioLook)` — returns filter array inserted into `buildEnhanceFilters` AFTER the base eq block (step 2.5), BEFORE cinematic curves.
- Natural: `curves` toe lift (0→0.03), `unsharp=9:9:0.25:0:0:0` (clarity, luma-only), `eq=brightness=0.02:contrast=1.05:saturation=1.03`.
- Creator: stronger shadow lift (0→0.05), `unsharp=7:7:0.40`, `eq=brightness=0.03:contrast=1.09:saturation=1.06:gamma=1.05`.
- Studio: custom shadow-lift curve `curves=master='0/0.07 0.2/0.27 0.5/0.52 0.85/0.86 1/1'` + warm R/B skin-tone curve + `eq=brightness=0.04:contrast=1.12:saturation=1.08:gamma=1.07` + `unsharp=5:5:0.6`. Highlights protected (0.85→0.86, 1→1). NEVER use `curves=preset=lighter` — it burns highlights.
- **FFmpeg unsharp constraint:** NEVER pass explicit chroma params as 0 (e.g. `unsharp=9:9:0.5:0:0:0`). chroma_msize_x/y must be ≥3 and odd, or omitted entirely. `0` causes "Value out of range / chroma_size_x" crash. Safe forms: `unsharp=3:3:0.3` or `unsharp=5:5:0.6` (chroma omitted = defaults to luma values).
- Wide-radius unsharp = clarity effect (macro local contrast) — NOT edge sharpening; preserves beard, pores, skin texture.
- `buildEnhanceFilters` signature updated: 5th param `studioLook = "off"`. Route handler passes `studioLook` from query.
- Display %: Natural=8, Creator=14, Studio=20. Contributes `studioLookPct × 0.30` to overallScore improvement.
- `studioLookPct` added to `QualityReport` interface + `computeQualityReport`.
- UI: 4-button selector (Off/Natural/Creator/Studio) + mode description text. Appears ABOVE Teeth Enhancement section.
- **Why:** True per-region face analysis requires ML. Wide-radius clarity + shadow-lift curve + skin-tone R/B curve achieves professionally-lit portrait look reliably across all portrait content.
- `AIRecommendation.studioLookMode` computed in `computeRecommendation`: `isDark&&isFlat`→studio, `isDark`→natural, `isFlat&&exposureScore<52`→creator. Applied in `handleAutoEnhance` (never overrides manual user selection).
- Enhanced VideoCard gets `key={enhancedUrl ?? "enh-processing"}` to force full remount on new export — prevents stale `hasError` state causing "preview not appearing" bug.

## Smart Teeth Enhancement (FFmpeg filter_complex — lumakey masking)
- Uses `-filter_complex` + `lumakey` + `maskedmerge` NOT `-vf`. The old global `curves` approach produced visually identical output and was removed.
- `buildTeethWhiteningComplex(preFilters, teethLevel)` builds the graph. Pre-filters (hqdn3d, eq, etc.) are stripped of `scale=` and applied first, then split(3) into base/mask/effect streams.
- Masking: `lumakey=threshold=0.0:tolerance=0.50:softness=0.20,alphaextract` → pixels with luma < 0.50 become black in mask (skin/lips/gums untouched); bright pixels (luma > 0.50) become white (teeth zone gets correction).
- Correction applied to `src_effect` only: `hue=s=SAT,eq=brightness=BRIGHT` — never to dark pixels.
- Three levels (exact user spec): LOW={sat:0.92, bright:0.05}, MEDIUM={sat:0.85, bright:0.10}, HIGH={sat:0.75, bright:0.15}.
- Canvas teeth detection: `analyzeFramePixels` scans zone (30–70% x, 55–80% y) for pixels with luma > 0.53 AND luma < 0.93 AND sat < 0.28 AND r >= b. `teethDensity` stored as MAX across frames. `teethDetected = density > 0.030`.
- `teethDetected` passed as query param; if `"false"` → skip filter_complex entirely, server sets `X-Vyron-Teeth-Applied: none-detected`.
- Response header `X-Vyron-Teeth-Applied`: "true" | "none-detected" | "off". Frontend reads it to show "Not Detected" in QualityMetric and "No visible teeth detected" in Enhancement Summary.
- **Why:** Global curves affected lips/skin equally — visually identical across levels. lumakey masking restricts correction to bright near-white pixels only. Canvas zone heuristic works for portrait/talking-head video.
