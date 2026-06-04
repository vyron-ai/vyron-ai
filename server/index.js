import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createWriteStream, createReadStream,
  unlinkSync, writeFileSync, existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { randomBytes } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist", "public");

// ── FFmpeg binary — ffmpeg-static bundled path only, no env/shell fallback ───
const FFMPEG = ffmpegStatic ?? null;
console.log(`FFmpeg path: ${FFMPEG ?? "NOT FOUND — MP4 export will fail"}`);


const app = express();
app.use(express.json());


// ── MP4 export helpers ────────────────────────────────────────────────────────
function msToAssTime(ms) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const cs = Math.floor((ms % 1_000) / 10);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// ASS colour format: &HAABBGGRR  (AA=alpha 00=opaque FF=transparent)
// Preset colour mappings mirror the React preview exactly
const ASS_PRESET = {
  viral: {
    //  active: #fde047 (yellow)  inactive: rgba(255,255,255,0.5)
    activeColor:   "&H0047E0FD",  // yellow #fde047
    inactiveColor: "&H80FFFFFF",  // 50 % transparent white
    activeBold:    true,
    activeFs:      27,
    inactiveFs:    22,
    activeScale:   null,          // size change is enough
    // Style: base = inactive colours, bold off, outline+shadow
    styleDef: "Arial,22,&H80FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,1,2,20,20,55,1",
  },
  documentary: {
    //  active: #ffffff  inactive: rgba(255,255,255,0.38)
    activeColor:   "&H00FFFFFF",  // full white
    inactiveColor: "&H9EFFFFFF",  // 38 % opaque white  (alpha ≈ 0x9E)
    activeBold:    true,
    activeFs:      null,          // use scale instead
    inactiveFs:    null,
    activeScale:   107,           // scale(1.07)
    styleDef: "Arial,17,&H9EFFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,1,0,2,20,20,45,1",
  },
  podcast: {
    //  active: #ffffff  inactive: rgba(255,255,255,0.5)
    activeColor:   "&H00FFFFFF",  // full white
    inactiveColor: "&H80FFFFFF",  // 50 % transparent white
    activeBold:    true,
    activeFs:      null,
    inactiveFs:    null,
    activeScale:   105,           // scale(1.05)
    styleDef: "Arial,17,&H80FFFFFF,&H000000FF,&H00000000,&H90000000,0,0,0,0,100,100,0,0,3,1,0,2,20,20,45,1",
  },
};

// Base font sizes (inactive) and bottom margins at scale=1, positionPct=0
const ASS_BASE = {
  viral:       { fs: 22, marginV: 55 },
  documentary: { fs: 17, marginV: 45 },
  podcast:     { fs: 17, marginV: 45 },
};

// Build the ASS Style line with scale and position applied
function buildAssStyle(preset, scale, positionPct) {
  const base   = ASS_BASE[preset] ?? ASS_BASE.viral;
  const fs     = Math.max(8, Math.round(base.fs * scale));
  // positionPct 0–75 lifts the subtitle from its base position.
  // At 75% the subtitle is near the top of a 1280px-tall canvas.
  const marginV = Math.round(base.marginV + (positionPct / 100) * 1280);

  const templates = {
    viral:       `Arial,${fs},&H80FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,1,2,20,20,${marginV},1`,
    documentary: `Arial,${fs},&H9EFFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,1,0,2,20,20,${marginV},1`,
    podcast:     `Arial,${fs},&H80FFFFFF,&H000000FF,&H00000000,&H90000000,0,0,0,0,100,100,0,0,3,1,0,2,20,20,${marginV},1`,
  };
  return templates[preset] ?? templates.viral;
}

function buildWordText(words, activeIdx, p, scale) {
  return words.map((word, i) => {
    const isActive = i === activeIdx;
    const color  = isActive ? p.activeColor  : p.inactiveColor;
    const bold   = isActive && p.activeBold  ? "\\b1" : "\\b0";

    let sizeTag = "";
    if (p.activeFs && p.inactiveFs) {
      // Scale the explicit font sizes
      const aFs = Math.max(8, Math.round(p.activeFs   * scale));
      const iFs = Math.max(8, Math.round(p.inactiveFs * scale));
      sizeTag = isActive ? `\\fs${aFs}` : `\\fs${iFs}`;
    } else if (p.activeScale) {
      // Relative scale override (documentary / podcast)
      sizeTag = isActive
        ? `\\fscx${p.activeScale}\\fscy${p.activeScale}`
        : "\\fscx100\\fscy100";
    }

    return `{\\1c${color}&${bold}${sizeTag}}${word}`;
  }).join(" ");
}

function buildAssFile(subtitles, preset, scale = 1.0, positionPct = 0) {
  const p        = ASS_PRESET[preset] ?? ASS_PRESET.viral;
  const styleDef = buildAssStyle(preset, scale, positionPct);
  // Pre-compute the base MarginV so we can add per-segment line offsets.
  // Mirrors buildAssStyle's formula exactly.
  const base       = ASS_BASE[preset] ?? ASS_BASE.viral;
  const baseMarginV = Math.round(base.marginV + (positionPct / 100) * 1280);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${styleDef}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = [];

  for (const seg of subtitles) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    // Raise multi-line blocks to stay above platform UI chrome.
    // Mirrors the preview's estimatedLines heuristic (~4 words per line).
    const estimatedLines = words.length <= 4 ? 1 : words.length <= 8 ? 2 : 3;
    const lineOffset     = estimatedLines === 3 ? 128 : estimatedLines === 2 ? 64 : 0;
    // 5 % of 1280 ≈ 64 px, 10 % ≈ 128 px
    const segMarginV     = lineOffset > 0 ? baseMarginV + lineOffset : 0;
    // 0 means "use style default" (= baseMarginV); explicit value overrides it.

    if (words.length === 1) {
      const text = buildWordText(words, 0, p, scale);
      events.push(
        `Dialogue: 0,${msToAssTime(seg.start)},${msToAssTime(seg.end)},Default,,0,0,${segMarginV},,${text}`
      );
      continue;
    }

    // Mirror getActiveWordIndex: evenly divide segment duration across words
    const dur    = Math.max(seg.end - seg.start, 300);
    const slotMs = dur / words.length;

    for (let i = 0; i < words.length; i++) {
      const slotStart = seg.start + i * slotMs;
      const slotEnd   = i < words.length - 1
        ? seg.start + (i + 1) * slotMs
        : seg.end;

      const text = buildWordText(words, i, p, scale);
      events.push(
        `Dialogue: 0,${msToAssTime(slotStart)},${msToAssTime(slotEnd)},Default,,0,0,${segMarginV},,${text}`
      );
    }
  }

  return header + "\n" + events.join("\n") + "\n";
}

// ── POST /api/script/generate ─────────────────────────────────────────────────
app.post("/api/script/generate", (req, res) => {
  const {
    niche = "",
    product = "",
    audience = "",
    hookType = "curiosity",
    intensity = "medium",
  } = req.body ?? {};
  if (!niche.trim() || !product.trim() || !audience.trim()) {
    return res.status(400).json({ error: "niche, product, and audience are required" });
  }

  const n  = niche.trim();
  const pr = product.trim();
  const au = audience.trim();
  const au1 = au.replace(/s$/i, ""); // singular form best-effort

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ── SAR Triggers (Stop · Agitate · Resolve) — unique per hook type ──────────
  const sarMap = {
    curiosity: [
      `STOP — you're about to scroll past the one ${n} insight that's been hiding in plain sight for ${au}.\nAGITATE — you've tried the popular methods. They worked for someone else. Not for you.\nRESOLVE — ${pr} gives you the exact framework built for how ${au} actually think and work.`,
      `STOP — before you try another ${n} tactic, ask yourself: why hasn't anything stuck yet?\nAGITATE — it's not your effort. It's that nobody's shown you what actually works for ${au}.\nRESOLVE — ${pr} closes that gap with a system built specifically for your situation.`,
    ],
    pain: [
      `STOP — if you're a ${au1} stuck in the same ${n} loop, this is your pattern-break moment.\nAGITATE — you're putting in the work. You're watching the videos. Nothing is changing.\nRESOLVE — ${pr} replaces the guesswork with a repeatable system that moves the needle.`,
      `STOP — ${au} are burning hours on ${n} and getting nowhere. That ends today.\nAGITATE — the problem isn't your niche. It's that you're missing the core mechanism.\nRESOLVE — ${pr} installs that mechanism in under 30 minutes.`,
    ],
    story: [
      `STOP — I was exactly where you are 6 months ago — a ${au1} drowning in ${n} advice.\nAGITATE — I tried everything. Courses, coaches, YouTube rabbit holes. Nothing clicked.\nRESOLVE — then I built ${pr}, and everything changed. Here's the short version.`,
      `STOP — three months ago I was ready to quit ${n} entirely. This is what saved it.\nAGITATE — the thing nobody tells ${au}: the advice online is built for someone else.\nRESOLVE — ${pr} is built for people exactly like you. This is what I wish I had.`,
    ],
    authority: [
      `STOP — after working in ${n} for years, I can tell you most of what ${au} believe is wrong.\nAGITATE — the standard playbook was built for a different era. It's costing you time and money.\nRESOLVE — ${pr} is built on what actually works in ${n} right now. Let me show you.`,
      `STOP — I've seen hundreds of ${au} fail at ${n} for the same preventable reasons.\nAGITATE — it's not about trying harder. It's about using the right leverage points.\nRESOLVE — ${pr} puts those leverage points directly in your hands.`,
    ],
    mistake: [
      `STOP — ${au} make this ${n} mistake constantly and it's quietly killing their results.\nAGITATE — you've probably made it too. And nobody in your space is talking about it.\nRESOLVE — ${pr} is designed to eliminate this mistake at the root. Not patch it.`,
      `STOP — there are 3 ${n} mistakes that keep ${au} stuck for months. You're likely making at least one.\nAGITATE — the frustrating part is that they feel like the right moves when you're making them.\nRESOLVE — ${pr} shows you exactly what to stop, and what to do instead.`,
    ],
    opportunity: [
      `STOP — right now there's a specific window in ${n} that ${au} are completely missing.\nAGITATE — by the time everyone talks about it, it'll be too competitive. That's how it always works.\nRESOLVE — ${pr} puts you in position to take advantage before the window closes.`,
      `STOP — ${n} has shifted. What worked for ${au} 12 months ago is fading — and a new lane just opened.\nAGITATE — most people are still using the old playbook. That's your edge.\nRESOLVE — ${pr} maps out exactly how to enter this opportunity and own it.`,
    ],
    viral: [
      `STOP — everyone's copying the same ${n} content format. And it's all starting to blur together.\nAGITATE — ${au} are scrolling past it because they've seen it a hundred times.\nRESOLVE — ${pr} gives you a content system that actually stands out in a saturated feed.`,
      `STOP — the trending ${n} formula is already dead. Here's what's replacing it for ${au}.\nAGITATE — if you're still doing what went viral 90 days ago, you're already late.\nRESOLVE — ${pr} keeps you on the front edge of what works right now.`,
    ],
  };

  // ── Pain Triggers — intensity-scaled ────────────────────────────────────────
  const painMap = {
    soft: [
      `${au} often feel like they're doing all the right things in ${n}, but the results just aren't showing up yet. That gap is frustrating — and it's more common than you think.`,
      `If you've been trying to figure out ${n} and still feel stuck, it's not a lack of effort. Most ${au} are missing one specific piece that changes everything.`,
    ],
    medium: [
      `You're a ${au1} who's been putting real effort into ${n} — and you still don't have the results to show for it. That's not a motivation problem. That's a system problem.`,
      `${au} spend months — sometimes years — circling the same ${n} problems. The content is out there. The tools exist. So what's actually blocking you?`,
    ],
    aggressive: [
      `${au} are getting left behind in ${n} while they wait for the right moment. There is no right moment. Every day you wait is a day someone else pulls ahead.`,
      `Let's be honest: if your ${n} results were working, you wouldn't be here. You're stuck, and the approach you're using is the reason why.`,
    ],
  };

  // ── Curiosity Triggers — unique per hook type ────────────────────────────────
  const curiosityMap = {
    curiosity: [
      `What if the one thing you haven't tried in ${n} is the exact thing that works best for ${au}? Most people skip it because it sounds too simple.`,
      `There's a pattern in ${n} that high-performing ${au} share — and it's almost never what gets talked about in the popular content.`,
    ],
    pain: [
      `The reason ${au} stay stuck in ${n} longer than they should isn't a secret. It's just something nobody wants to say out loud.`,
      `What's the real cost of another 6 months of the same ${n} results? For ${au}, it's not just time — it's confidence, momentum, and opportunity.`,
    ],
    story: [
      `I kept this ${n} approach to myself for months because I wasn't sure it would work for other ${au}. Then five people tried it. Same result every time.`,
      `The moment my ${n} results changed wasn't when I found a better strategy. It was when I stopped doing this one thing that most ${au} still do.`,
    ],
    authority: [
      `Most ${n} advice is built on assumptions that don't hold for ${au}. Here's what the data actually shows when you strip away the noise.`,
      `I've tracked ${n} outcomes across dozens of ${au} and the pattern is undeniable — the ones who win all do one thing differently.`,
    ],
    mistake: [
      `The most damaging ${n} mistake isn't the obvious one. It's the one that feels productive while it's quietly costing you.`,
      `${au} who make this ${n} mistake don't know they're making it. It looks like good strategy from the inside.`,
    ],
    opportunity: [
      `Most ${au} will look back in 12 months and realize this was the exact moment the ${n} landscape shifted — and they missed it.`,
      `There's a specific gap in ${n} right now that ${au} with the right approach can walk straight into. It won't stay open long.`,
    ],
    viral: [
      `The ${n} content format that's dominating right now has a shelf life — and a replacement is already outperforming it for ${au}.`,
      `Why are some ${au} in ${n} getting 10x the reach with half the effort? It's not luck. There's a replicable structure behind it.`,
    ],
  };

  // ── Main Script — hook-type-driven body ──────────────────────────────────────
  const scriptMap = {
    curiosity: `Here's something that most ${n} content never covers:\n\n${au} who consistently get results aren't using more complex strategies — they're using simpler ones, applied more precisely.\n\nThe curiosity gap in ${n} isn't about what you don't know. It's about what you're not yet doing with what you already know.\n\n${pr} is built on that principle. It takes your inputs and turns them into a clear, repeatable process — no guesswork, no content rabbit holes.\n\nThe results aren't magic. They're just the result of doing the right things in the right order.`,
    pain: `If you're a ${au1} who's been putting effort into ${n} without the results to match — the problem isn't your work ethic.\n\nThe ${n} space is full of generic advice that isn't built for how ${au} actually operate. And following it keeps you stuck in cycles that feel productive but aren't moving you forward.\n\n${pr} was built specifically to break that pattern. It replaces the cycle with a direct path — one that's been refined for the exact problems ${au} face in ${n}.\n\nYou don't need to work harder. You need to work on the right things.`,
    story: `Six months ago, I was a ${au1} with no clear path forward in ${n}.\n\nI'd consumed more content than I can count. I had the theory. What I didn't have was a system that worked for someone in my situation.\n\nI built ${pr} out of frustration — and then kept using it because it actually worked.\n\nNow I share it with ${au} who are where I was: capable, informed, and stuck. If that's you, here's the short version of what changed everything for me.`,
    authority: `After deep experience in ${n}, one pattern is impossible to ignore:\n\n${au} who fail aren't failing because they lack information. They're failing because the information they have wasn't designed for them.\n\nThe mainstream ${n} playbook is built for a general audience. ${au} have specific constraints, specific goals, and a specific context that most strategies ignore.\n\n${pr} applies a framework that accounts for all of that. It's not another set of generic tips — it's a system that actually fits.`,
    mistake: `The most common ${n} mistake among ${au} is this: optimizing the wrong metric.\n\nYou track what's easy to measure and ignore what actually drives results. It feels productive. It isn't.\n\nHere's how it plays out: you put effort into visibility, consistency, or volume — and none of it compounds. Because the foundation isn't set.\n\n${pr} starts at the foundation. It diagnoses what's actually blocking your ${n} results before suggesting any action.`,
    opportunity: `Right now, ${n} is in a transition. The old playbook is saturating. A new approach is outperforming it — and most ${au} haven't made the shift yet.\n\nThat gap is the opportunity. It won't stay open forever.\n\n${pr} is built for this moment. It puts ${au} on the right side of the shift before the window closes and the new approach becomes the new crowded lane.\n\nTiming matters in ${n}. This is the timing.`,
    viral: `The ${n} content formats that dominated 6 months ago are losing their edge. ${au} are scrolling past them without stopping.\n\nWhat's working now looks different. It's built on pattern interrupts, niche specificity, and a structure that creates a genuine reason to keep watching.\n\n${pr} is built around what's working right now for ${au} in ${n} — not what worked before, and not what everyone else is still copying.\n\nIf you want reach, you need to be where the algorithm is paying attention today.`,
  };

  // ── CTA — intensity-scaled ────────────────────────────────────────────────────
  const ctaMap = {
    soft: [
      `If this resonated, follow for more ${n} content built specifically for ${au}. New posts every week.`,
      `Save this if you're a ${au1} working on your ${n} approach — you'll want to come back to it.`,
      `Try ${pr} and see if it's the right fit for your ${n} goals. Link in bio.`,
    ],
    medium: [
      `Comment "${n.toUpperCase()}" below and I'll send you the full breakdown — free.`,
      `Follow if you're a ${au1} who's serious about ${n} results. I don't post filler.`,
      `${pr} is open right now. Link in bio — takes less than 2 minutes to get started.`,
    ],
    aggressive: [
      `${au} who act on this today will be in a completely different position in 90 days. Link in bio. Don't overthink it.`,
      `Stop watching. Start doing. ${pr} — link in bio. This is the system.`,
      `Comment "READY" if you're done letting ${n} stay stuck. I'll send you the first step right now.`,
    ],
  };

  // ── Titles — hook-type-driven ─────────────────────────────────────────────────
  const titleMap = {
    curiosity: [
      `The ${n} method ${au} keep overlooking (it's not what you think)`,
      `Why everything you know about ${n} might be working against you`,
    ],
    pain: [
      `Why ${au} stay stuck in ${n} — and the exact fix`,
      `The real reason your ${n} results aren't moving (honest answer)`,
    ],
    story: [
      `How I went from lost ${au1} to consistent ${n} results using ${pr}`,
      `What changed my ${n} results after months of going nowhere`,
    ],
    authority: [
      `What ${n} experts know that ${au} don't (real talk)`,
      `The ${n} framework that actually holds up when you look at the data`,
    ],
    mistake: [
      `The #1 ${n} mistake ${au} make (and how to stop immediately)`,
      `You're probably making this ${n} mistake right now — here's the fix`,
    ],
    opportunity: [
      `The ${n} opportunity ${au} are sleeping on right now`,
      `There's a gap in ${n} that ${au} can still enter — here's how`,
    ],
    viral: [
      `The ${n} content shift that's already happening (most ${au} are late)`,
      `Why the old ${n} formula stopped working for ${au} — new approach inside`,
    ],
  };

  // ── Hashtags ──────────────────────────────────────────────────────────────────
  const tag  = (s) => "#" + s.replace(/\s+/g, "").toLowerCase();
  const hashtagSets = [
    `${tag(n)} ${tag(pr)} ${tag(au)} #contentcreator #${hookType}marketing #viral2025 #shortsvideo #fyp`,
    `${tag(n)}tips ${tag(au)}life ${tag(pr)} #reels #tiktoktips #fyp #creatoreconomy #${intensity}hook`,
    `${tag(n)}hacks ${tag(au)} #contentmarketing ${tag(pr)} #foryoupage #viral #shorts #neurohook`,
  ];

  res.json({
    sarTrigger:      pick(sarMap[hookType]    ?? sarMap.curiosity),
    painTrigger:     pick(painMap[intensity]  ?? painMap.medium),
    curiosityTrigger: pick(curiosityMap[hookType] ?? curiosityMap.curiosity),
    script:          scriptMap[hookType]      ?? scriptMap.curiosity,
    cta:             pick(ctaMap[intensity]   ?? ctaMap.medium),
    title:           pick(titleMap[hookType]  ?? titleMap.curiosity),
    hashtags:        pick(hashtagSets),
  });
});

// ── POST /api/export/mp4 ──────────────────────────────────────────────────────
app.post("/api/export/mp4", async (req, res) => {
  const { videoUrl, subtitles, preset = "viral", subtitleScale = 1.0, subtitlePosition = 0 } = req.body ?? {};

  if (!FFMPEG) {
    return res.status(500).json({
      error: "FFmpeg not found on this server. Set the FFMPEG_PATH environment variable to the absolute path of the ffmpeg binary.",
    });
  }
  if (!videoUrl?.trim()) {
    return res.status(400).json({ error: "videoUrl is required" });
  }
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return res.status(400).json({ error: "subtitles array is required" });
  }

  const id = randomBytes(8).toString("hex");
  const inputPath  = join(tmpdir(), `vyron-in-${id}.mp4`);
  const assPath    = join(tmpdir(), `vyron-subs-${id}.ass`);
  const outputPath = join(tmpdir(), `vyron-out-${id}.mp4`);

  const cleanup = () => {
    for (const p of [inputPath, assPath, outputPath]) {
      try { if (existsSync(p)) unlinkSync(p); } catch {}
    }
  };

  try {
    // 1. Download source video → temp file
    const videoRes = await fetch(videoUrl.trim());
    if (!videoRes.ok || !videoRes.body) {
      throw new Error(`Could not download video: HTTP ${videoRes.status}`);
    }
    await pipeline(Readable.fromWeb(videoRes.body), createWriteStream(inputPath));

    // 2. Write ASS subtitle file
    writeFileSync(assPath, buildAssFile(subtitles, preset, Number(subtitleScale) || 1.0, Number(subtitlePosition) || 0), "utf-8");

    // 3. FFmpeg — burn subtitles, re-encode video, copy audio
    await execFileAsync(
      FFMPEG,
      [
        "-y",
        "-i", inputPath,
        "-vf", `ass=${assPath}`,
        "-c:v", "libx264", "-crf", "23", "-preset", "fast",
        "-c:a", "copy",
        "-movflags", "+faststart",
        outputPath,
      ],
      { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 }
    );

    // 4. Stream MP4 back as attachment
    const today = new Date();
    const ymd =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="subtitles-${ymd}.mp4"`);

    const readStream = createReadStream(outputPath);
    readStream.on("end", cleanup);
    readStream.on("error", cleanup);
    readStream.pipe(res);
  } catch (err) {
    cleanup();
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message ?? "MP4 export failed" });
    }
  }
});

// ── POST /api/subtitles/generate ──────────────────────────────────────────────
app.post("/api/subtitles/generate", async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  const apiKey = process.env.ASSEMBLYAI_API_KEY ?? "";
  if (!apiKey || apiKey.includes("placeholder")) {
    return res.status(400).json({
      success: false,
      error:
        "ASSEMBLYAI_API_KEY is not set. Add it to Replit Secrets " +
        "(no VITE_ prefix — it must stay server-only), then restart the app.",
    });
  }

  const { videoUrl } = req.body ?? {};
  if (!videoUrl?.trim()) {
    return res.status(400).json({ success: false, error: "videoUrl is required" });
  }

  const AAI_BASE = "https://api.assemblyai.com/v2";
  const headers = {
    Authorization: apiKey,
    "Content-Type": "application/json",
  };

  try {
    // 1. Submit transcription job
    const submitRes = await fetch(`${AAI_BASE}/transcript`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        audio_url: videoUrl.trim(),
        punctuate: true,
        format_text: true,
        language_detection: true,
        speech_models: ["universal-3-pro"],
      }),
    });

    const submitData = await submitRes.json();
    if (!submitRes.ok || submitData.error) {
      throw new Error(
        submitData.error ?? `AssemblyAI submit failed: HTTP ${submitRes.status}`
      );
    }

    const transcriptId = submitData.id;

    // 2. Poll until completed or error (max 60 × 3s = 3 min)
    let result = null;
    const MAX_POLLS = 60;

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`${AAI_BASE}/transcript/${transcriptId}`, { headers });
      result = await pollRes.json();
      if (result.status === "completed") break;
      if (result.status === "error") {
        throw new Error(result.error ?? "AssemblyAI transcription error");
      }
    }

    if (!result || result.status !== "completed") {
      throw new Error("Transcription timed out after 3 minutes. Try a shorter video.");
    }

    // 3. Group words → natural subtitle phrases
    const words = result.words ?? [];

    if (words.length === 0) {
      return res.json({
        success: true,
        subtitles: [],
        warning: "No words detected in the audio.",
      });
    }

    const WEAK = new Set([
      "a","de","que","y","o","para","con","en","la","el","los","las",
      "al","del","un","una","lo","se","su","por","sin","ni","le","les",
      "me","te","nos","si","e","u","its","the","of","to","and",
      "or","for","in","on","at","by","an","is","as","be","we","he",
      "she","it","up","do","if","my","so","no","but","not","are","was",
    ]);

    function endsWeak(wordText) {
      const bare = wordText.toLowerCase().replace(/[.,!?;:\u00bf\u00a1"""']+/g, "").trim();
      return WEAK.has(bare);
    }

    const subtitles = [];
    let segId = 0;
    let i = 0;

    while (i < words.length) {
      const chunk = [];
      while (i < words.length) {
        chunk.push(words[i]);
        i++;
        const last = chunk[chunk.length - 1];
        const w = last.text;
        const n = chunk.length;
        if (n >= 9) break;
        if (n >= 2 && /[.!?\u00bf\u00a1]$/.test(w)) break;
        if (n >= 4 && /[,;:]$/.test(w)) break;
        if (n >= 5 && !endsWeak(w)) break;
        if (n >= 8) break;
      }
      if (chunk.length > 0) {
        subtitles.push({
          id: segId++,
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
          text: chunk.map((w) => w.text).join(" "),
        });
      }
    }

    return res.json({ success: true, subtitles });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Unexpected server error",
    });
  }
});

// ── Serve built React app (SPA) ───────────────────────────────────────────────
app.use(express.static(distDir));

app.get("/{*path}", (_req, res) => {
  res.sendFile(join(distDir, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 5000);
createServer(app).listen(PORT, "0.0.0.0", () => {
  console.log(`VYRON AI server running on http://0.0.0.0:${PORT}`);
});
