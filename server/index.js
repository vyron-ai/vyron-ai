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

// ── POST /api/content-planner/generate ───────────────────────────────────────
app.post("/api/content-planner/generate", (req, res) => {
  const {
    niche = "",
    goal = "brand_awareness",
    postingFrequency = "daily",
    duration = 30,
  } = req.body ?? {};
  if (!niche.trim()) return res.status(400).json({ error: "niche is required" });

  const n   = niche.trim();
  const dur = Math.min(Math.max(parseInt(duration) || 30, 7), 90);

  const freqMap  = { daily: 7, "5x_week": 5, "3x_week": 3, "2x_week": 2 };
  const ppw      = freqMap[postingFrequency] ?? 7;
  const total    = Math.min(Math.ceil(dur * ppw / 7), 90);

  const contentTypes = [
    "Educational", "Listicle", "Behind the Scenes", "Social Proof",
    "Product Demo", "Q&A", "Trending", "Story", "Challenge", "Hot Take",
  ];

  const hookTypes = ["curiosity", "pain", "story", "authority", "mistake", "opportunity", "viral"];

  const titleTemplates = {
    curiosity: [
      `The ${n} secret high performers never share`,
      `What nobody tells you about ${n}`,
      `The hidden side of ${n} that changes everything`,
      `Why most ${n} advice is missing this one thing`,
    ],
    pain: [
      `Why your ${n} results keep disappointing you`,
      `The real reason ${n} feels so hard right now`,
      `Struggling with ${n}? Here's the honest answer`,
      `The ${n} problem nobody wants to admit`,
    ],
    story: [
      `How I rebuilt my ${n} from scratch`,
      `What ${n} taught me that no course ever could`,
      `The ${n} turning point I didn't see coming`,
      `My biggest ${n} failure — and what came after`,
    ],
    authority: [
      `The ${n} framework that actually holds up`,
      `What the data shows about ${n}`,
      `${n} done right: what separates the best`,
      `The non-negotiables of a strong ${n} strategy`,
    ],
    mistake: [
      `The #1 ${n} mistake you're probably making right now`,
      `Stop doing this in your ${n} immediately`,
      `3 ${n} habits that are quietly costing you`,
      `This common ${n} move is making things worse`,
    ],
    opportunity: [
      `The ${n} opportunity most people are sleeping on`,
      `There's a gap in ${n} right now — use it`,
      `Why right now is the best time to go all-in on ${n}`,
      `The untapped ${n} angle your competitors haven't found`,
    ],
    viral: [
      `The ${n} format blowing up right now (and why)`,
      `Why this ${n} trend is replacing everything else`,
      `Everyone's talking about this in ${n} — here's the truth`,
      `The ${n} shift that caught everyone off guard`,
    ],
  };

  const objectiveMap = {
    brand_awareness:  ["Reach new audience", "Grow organic followers", "Build niche authority", "Increase brand recall"],
    lead_generation:  ["Drive link-in-bio clicks", "Generate DM inquiries", "Capture email subscribers", "Build prospect list"],
    sales:            ["Drive offer conversions", "Present product value", "Overcome objections", "Move warm leads to action"],
    engagement:       ["Maximize comments", "Encourage saves & shares", "Build community conversation", "Boost interaction rate"],
    community:        ["Deepen audience relationship", "Foster two-way conversation", "Build brand advocates", "Encourage participation"],
  };

  const goalKey    = (goal || "").toLowerCase().replace(/[\s-]+/g, "_");
  const objectives = objectiveMap[goalKey] ?? objectiveMap.brand_awareness;

  const entries = [];
  for (let i = 0; i < total; i++) {
    const dayNum      = total === 1 ? 1 : Math.round((i / (total - 1)) * (dur - 1)) + 1;
    const hookType    = hookTypes[i % hookTypes.length];
    const contentType = contentTypes[i % contentTypes.length];
    const titles      = titleTemplates[hookType] ?? titleTemplates.curiosity;
    entries.push({
      day:         dayNum,
      contentType,
      hookType,
      title:       titles[i % titles.length],
      objective:   objectives[i % objectives.length],
    });
  }

  res.json({ entries, total, duration: dur, niche: n });
});

// ── Context Intelligence Layer ────────────────────────────────────────────────
function buildAudienceIntelligence(n, au, au1, pr, hookType, intensity) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const desireVariants = [
    `${au} want more than better ${n} results — they want the identity shift that comes with having it handled. The real desire is confidence: knowing they have a system that works, knowing it compounds, and not having to second-guess every move. They want to become someone who has ${n} figured out, not someone who is still trying to figure it out. That distinction matters enormously to them.`,
    `What drives ${au} in ${n} isn't just the outcome — it's predictability. They want a process that produces results reliably, regardless of motivation or conditions. Underneath that is a deeper desire: to feel like a competent, credible person in their space. They want ${n} to be a source of confidence, not a constant reminder of what they haven't cracked yet.`,
    `At the core of what ${au} are chasing in ${n} is visible, measurable progress — the kind they can point to and say "this is working." They're not just pursuing results. They're pursuing the story they get to tell about themselves once those results arrive. They want to be the ${au1} who figured out ${n} while everyone else was still struggling with it.`,
    `${au} are chasing a specific feeling: the moment when ${n} stops being something they have to push through and starts being something that runs on its own. They want the compounding effect. They want momentum that doesn't require heroic effort to sustain. And quietly, they want to feel like they made the right decision before it became obvious to everyone else.`,
  ];

  const fearVariants = [
    `The deepest fear for ${au} isn't failure in isolation — it's wasted time followed by the realization that they were working on the wrong things in ${n} the entire time. Close behind that is the fear of being seen as naive: the person who followed advice that more experienced ${au} already knew didn't work. They want to avoid being that story.`,
    `${au} are quietly afraid of two things converging at once: that they're missing something fundamental about ${n} that everyone else already understands, and that their window to get ahead is closing while they're still in the learning phase. The thought of starting over — of abandoning invested effort — sits in the background of every decision they make.`,
    `The fear that keeps ${au} in place is the fear of committing visibly to a ${n} approach and failing publicly. They'd rather wait until they're certain, which means they often wait too long. Underneath that hesitation is a more personal fear: that their specific situation is somehow an exception, and that what works for other ${au} simply won't work for them.`,
    `What ${au} most want to avoid in ${n} is the feeling of being stuck while watching others move. They fear the version of events where they look back in a year and see that the opportunity was there, the knowledge was accessible, and they still didn't act on it in time. That future regret is more motivating — and more paralyzing — than the present challenge.`,
  ];

  const painVariants = [
    `Right now, ${au} are experiencing a specific and exhausting friction: they have access to more ${n} information than ever before, and less clarity on what to actually do. Every new resource adds a decision. Every piece of advice contradicts something they read last week. They're not stuck because they don't know enough — they're stuck because they know too much and can't filter it into action.`,
    `The frustration ${au} live with in ${n} right now is inconsistency that they can't explain or fix. They have good days and bad days, and no reliable understanding of why. Results seem to depend on variables they can't identify or control. They've tried multiple approaches, and none of them has stuck long enough to actually compound. The effort is real. The return isn't matching it.`,
    `What ${au} deal with daily in ${n} is the gap between what they know they should be doing and what they're actually executing on. They can describe the right approach. They've read about it. But when it comes to consistent implementation, something breaks down — motivation, clarity, structure, or all three. That execution gap is the real pain, and almost nobody names it directly.`,
    `The current situation for most ${au} in ${n} is one of invisible inefficiency. They're busy, they're producing effort, and they genuinely believe they're making progress — but the scoreboard doesn't reflect it. The frustration isn't just about results. It's about the disconnect between the work they're putting in and the outcome that should logically follow from it.`,
  ];

  const transformationVariants = [
    `The transformation ${au} are looking for isn't just better ${n} results — it's a different relationship with ${n} entirely. On the other side of that transformation, ${n} feels light. The process is clear. Progress is consistent and visible. The version of themselves they're working toward doesn't have to think hard about ${n} — it just works, reliably, because the system underneath it is solid.`,
    `If ${pr} delivers what ${au} actually need, they end up in a version of their life where ${n} is no longer a source of stress or uncertainty. The transformation they want is one where results come predictably, where they know exactly what to do when they sit down, and where the momentum is always moving forward — not restarting from zero every few weeks.`,
    `The desired end state for ${au} in ${n} is deceptively simple: they want to wake up and know their approach is working. Not sometimes. Not when conditions are perfect. Working as a baseline — consistently, quietly, without requiring heroic effort or constant course-correction. ${pr} is the bridge between the version of ${n} they're living now and that version.`,
    `What ${au} are really trying to buy when they invest in ${n} is time back and certainty forward. The transformation they want frees them from the constant loop of questioning whether they're doing the right things. They want to move from "I think this is working" to "I know this is working" — and from there, to the compounding results that follow from that clarity.`,
  ];

  return {
    desires:        pick(desireVariants),
    fears:          pick(fearVariants),
    pains:          pick(painVariants),
    transformation: pick(transformationVariants),
  };
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

  const n   = niche.trim();
  const pr  = product.trim();
  const au  = audience.trim();
  const au1 = au.replace(/s$/i, "");

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Build audience intelligence first — everything downstream uses it
  const intel = buildAudienceIntelligence(n, au, au1, pr, hookType, intensity);

  // ── SAR Triggers — intelligence-aware, hook-type-driven ──────────────────────
  const sarMap = {
    curiosity: [
      `STOP — you're about to scroll past the insight that answers why ${n} hasn't clicked for you yet.\nAGITATE — you already know more about ${n} than most ${au}. That's not the problem. The problem is that knowing and doing are completely different things, and the gap between them is exactly where ${au} stay stuck.\nRESOLVE — ${pr} closes that gap. Not with more information — with a system built for the way ${au} actually execute.`,
      `STOP — the next ${n} tactic you try will probably fail. Not because you'll execute it wrong, but because it wasn't built for someone in your situation.\nAGITATE — ${au} spend months cycling through approaches that work in theory and fall apart in practice. Every failed attempt makes the next one harder to commit to.\nRESOLVE — ${pr} breaks that cycle by starting with what's actually true about how ${au} operate — then building the system from there.`,
    ],
    pain: [
      `STOP — if you're a ${au1} putting real effort into ${n} and still not seeing the results that should follow, this is the conversation that reframes why.\nAGITATE — you're not lacking motivation. You're not lacking information. You're lacking a system that accounts for the specific way ${au} experience ${n} — the friction, the inconsistency, the gap between knowing and doing.\nRESOLVE — ${pr} is built around that gap. Not around the ${n} problem in theory — around the one ${au} actually live with.`,
      `STOP — the ${n} loop that ${au} stay stuck in has a specific name: effort without compounding. You work. Nothing builds. You restart.\nAGITATE — that loop persists because the approach doesn't fit the person. Most ${n} systems were built for someone else's life, someone else's constraints, someone else's version of the problem.\nRESOLVE — ${pr} was built for yours. Here's what that changes.`,
    ],
    story: [
      `STOP — six months ago I was a ${au1} who had consumed every piece of ${n} content available and still couldn't make it work consistently.\nAGITATE — the frustration isn't that the information doesn't exist. It's that all of it is built around a version of you that doesn't have your specific constraints, your specific goals, or your specific relationship with the problem.\nRESOLVE — building ${pr} was how I solved that for myself. Then I realized it solved it for other ${au} too.`,
      `STOP — the moment my ${n} results changed wasn't when I learned something new. It was when I stopped doing something that felt productive but wasn't.\nAGITATE — most ${au} are doing a version of that same thing right now — something that looks like progress and isn't. It's incredibly hard to see from the inside.\nRESOLVE — ${pr} makes it visible. And once it's visible, everything shifts.`,
    ],
    authority: [
      `STOP — after working deeply in ${n}, one pattern repeats itself with almost every group of ${au}: they fail not because they lack drive, but because the playbook they're following was built for someone else.\nAGITATE — the mainstream ${n} approach assumes a set of conditions that don't apply to most ${au}. Following it produces inconsistent results and a growing sense that the problem is somehow personal.\nRESOLVE — ${pr} is built on what actually works when you strip away the assumptions. The results are different because the starting point is accurate.`,
      `STOP — I've watched ${au} fail at ${n} for the same preventable reason so many times that it stopped feeling like coincidence.\nAGITATE — the gap isn't capability. It's that the tools and frameworks available were designed around a general audience — not around the specific realities that define how ${au} operate in ${n}.\nRESOLVE — ${pr} is built around those realities. That's the difference.`,
    ],
    mistake: [
      `STOP — ${au} are making a specific ${n} mistake right now that looks like the right move from the inside.\nAGITATE — it's not the obvious mistake. It's subtler: optimizing for the metric that's easy to track instead of the one that actually drives the result they want. It feels like progress. The scoreboard disagrees.\nRESOLVE — ${pr} starts by surfacing that mistake, because fixing it changes the entire trajectory of your ${n} results.`,
      `STOP — there's a ${n} behavior that ${au} do consistently, that consistently undercuts their results, that almost nobody talks about directly.\nAGITATE — it's not laziness. It's not lack of knowledge. It's a structural misalignment between the action and the outcome — and it compounds quietly until the results make it impossible to ignore.\nRESOLVE — ${pr} is built to catch it early. Before months of effort go in the wrong direction.`,
    ],
    opportunity: [
      `STOP — there's a specific shift happening in ${n} right now that most ${au} are positioned to benefit from — and almost none of them know it yet.\nAGITATE — by the time this shift is obvious, the window will be crowded. That's how it always works. The ${au} who move now are the ones who look prescient in 12 months.\nRESOLVE — ${pr} maps exactly how to enter this window before it closes. This is the timing.`,
      `STOP — the ${n} landscape has changed in a way that creates a real, specific advantage for ${au} who are paying attention.\nAGITATE — most ${au} are still using the playbook from 18 months ago. That playbook is saturating. The new lane is wide open — but only for a limited window.\nRESOLVE — ${pr} puts you in that lane with a clear path. Here's what that looks like.`,
    ],
    viral: [
      `STOP — the ${n} content format that ${au} are still using was performing 90 days ago. The algorithm has moved on.\nAGITATE — what's working now looks structurally different. It's built on different signals, different patterns, different viewer behavior. Copying the old format is actively working against you at this point.\nRESOLVE — ${pr} is built around what's working in ${n} right now — not what worked before, and not what everyone else is still copying.`,
      `STOP — the reason some ${au} in ${n} are getting results that seem disproportionate to their effort isn't luck. There's a specific structural pattern behind it.\nAGITATE — most ${au} can see that something is working for others in ${n} but can't reverse-engineer why. That gap between observation and understanding is where the opportunity is sitting.\nRESOLVE — ${pr} maps that pattern into something ${au} can actually replicate. Here's the structure.`,
    ],
  };

  // ── Pain Triggers — grounded in the pain analysis, intensity-scaled ──────────
  const painMap = {
    soft: [
      `Most ${au} in ${n} are doing everything they know to do — and still feeling like something isn't quite landing. That feeling is real, and it usually points to a gap in the system rather than a gap in the person. The effort isn't the problem. The structure around it is.`,
      `There's a specific moment that most ${au} in ${n} recognize: you put in real work, you follow real advice, and the results are still inconsistent in a way you can't fully explain. That inconsistency isn't random. It has a cause — and it's usually not the one that gets talked about.`,
    ],
    medium: [
      `You're a ${au1} who's been putting genuine effort into ${n} — and the results don't reflect that effort in the way they should. That's not a motivation problem or a knowledge problem. It's a structural problem. The approach you're using was built for someone else's version of this situation.`,
      `${au} spend months circling the same friction in ${n}: effort that doesn't compound, strategies that work until they don't, and results that are never quite consistent enough to build on. The content exists. The tools exist. Something is still missing — and it's not what most people think it is.`,
    ],
    aggressive: [
      `Here's what's actually happening for ${au} in ${n} right now: the approach isn't working, and every week that passes is a week someone else uses to pull further ahead. There's no version of this where waiting produces a different result. The gap doesn't close on its own.`,
      `If your ${n} results were where they should be, you wouldn't be watching this. You're stuck — and the specific kind of stuck that ${au} experience in ${n} doesn't fix itself. It requires a different approach, not more effort on the same one.`,
    ],
  };

  // ── Curiosity Triggers — grounded in desire and transformation ────────────────
  const curiosityMap = {
    curiosity: [
      `What if the reason ${n} hasn't worked the way you expected it to is something completely different from what you've been trying to fix? Most ${au} are solving the visible problem. The actual problem is one layer underneath it.`,
      `There's a pattern that separates ${au} who get consistent ${n} results from those who stay stuck — and it has almost nothing to do with the tactics they're using. The variable that actually matters is one almost nobody talks about directly.`,
    ],
    pain: [
      `The real cost of another 6 months of the same ${n} results isn't just time. For ${au}, it's the compounding effect of momentum not building — of confidence eroding quietly in the background while the effort continues at the front.`,
      `What if the thing keeping ${au} stuck in ${n} isn't a missing piece of information, but a specific structural decision they made early on that's been shaping everything since? That's what nobody wants to say out loud — because fixing it means acknowledging it first.`,
    ],
    story: [
      `The shift in my ${n} results didn't happen when I found a better strategy. It happened when I stopped doing something that felt like the right move but was quietly preventing everything else from working. I kept that to myself for months before I realized most ${au} were doing the exact same thing.`,
      `I've had this conversation with dozens of ${au} who are stuck in ${n} — and the thing that surprises them every time isn't the solution. It's realizing that the problem wasn't what they thought it was. That reframe alone changes everything.`,
    ],
    authority: [
      `Most ${n} frameworks are built around assumptions that don't apply to ${au} — and the people who built them don't know it, because they've never operated inside the specific constraints that define your situation. That's the data point that changes how everything else lands.`,
      `I've tracked ${n} outcomes across enough ${au} to see a pattern that doesn't show up in any of the popular advice: the ones who win aren't doing more. They're doing one specific thing differently that makes everything else more efficient. That thing is almost never what they credit publicly.`,
    ],
    mistake: [
      `The most expensive ${n} mistake ${au} make isn't the obvious one. It's the one that looks like discipline, looks like consistency, looks like the right move — and is actively preventing the result they're working toward.`,
      `${au} who are stuck in ${n} typically have one thing in common: a decision they made early that made sense at the time and has been quietly compounding in the wrong direction ever since. Seeing it is the hardest part. After that, fixing it is straightforward.`,
    ],
    opportunity: [
      `The specific window that just opened in ${n} is the kind that only makes sense in retrospect — when the people who moved early are talking about why they did it, and everyone else is wishing they'd paid closer attention when it mattered.`,
      `There's a gap in ${n} right now that ${au} with the right approach can step into before it gets crowded. The reason most won't is not that they can't see it — it's that acting before it's obvious requires a different relationship with uncertainty than most people have built.`,
    ],
    viral: [
      `The ${n} content pattern that's replacing the old formula is already outperforming it consistently — and most ${au} haven't reverse-engineered why yet. The gap between those who see it and those who don't is exactly where the advantage currently sits.`,
      `Why are some ${au} in ${n} generating results that seem disproportionate to their effort or their following? The answer isn't a secret. It's a structural pattern that looks obvious once someone shows it to you — and invisible until they do.`,
    ],
  };

  // ── Main Script — intelligence-grounded, hook-type-driven ─────────────────────
  const scriptMap = {
    curiosity: `Here's something that almost never gets said directly about ${n}:\n\nThe ${au} who get consistent results aren't doing more — they're doing less of the wrong things. The curiosity gap in ${n} isn't between those who know more and those who know less. It's between those who've found the one structural piece that makes everything else efficient, and those who are still solving around it.\n\nWhat ${au} actually want — and what most ${n} advice never gives them — is a process that compounds without requiring heroic effort to sustain. Not a new tactic. A system where the effort they're already putting in actually lands.\n\n${pr} is built around that. It takes what you're already doing in ${n} and restructures it around the variable that actually drives results for ${au} in your situation.`,
    pain: `If you're a ${au1} who's been putting real effort into ${n} and the results still don't reflect that effort — the problem isn't you.\n\nThe ${n} space is filled with frameworks and systems that work for someone. Just not for ${au} with your specific constraints, your specific goals, and the specific version of ${n} you're trying to make work.\n\nWhat that creates is the worst kind of stuck: the kind where you're doing the right things in theory, and the scoreboard still doesn't move. The effort is real. The approach just isn't calibrated for your situation.\n\n${pr} was built to fix that calibration. Not by adding more to your process — by aligning what you're already doing with what actually moves the needle for ${au} like you.`,
    story: `Six months ago I was a ${au1} who had the knowledge, the effort, and the tools — and still couldn't make ${n} produce consistent results.\n\nThe thing I eventually figured out wasn't a new strategy. It was that the strategies I was using were built around a set of assumptions that didn't apply to my situation. Once I saw that, I rebuilt the approach from scratch — around the actual constraints of someone who operates the way I do.\n\nThat's what became ${pr}. And what surprised me was that when I showed it to other ${au}, it worked for them too. Because the structural issue wasn't unique to me. It was the same gap that most ${au} hit in ${n} — and almost nobody names directly.\n\nIf the description of where I was sounds familiar, here's what changed.`,
    authority: `After working deeply in ${n}, one thing becomes impossible to ignore:\n\n${au} who struggle aren't struggling because they lack drive or information. They're struggling because the frameworks they're using were built for a generalized version of the problem — not for the specific constraints, goals, and conditions that define how ${au} actually experience ${n}.\n\nThat mismatch is invisible until you see it. And once you see it, every piece of generic ${n} advice starts to read differently.\n\n${pr} is built from the ground up around what ${au} actually need — not what a general audience needs. The difference in results isn't because the underlying ${n} principles are different. It's because they're being applied accurately, to the right version of the problem, in the right sequence.`,
    mistake: `The most common ${n} mistake among ${au} isn't the obvious one.\n\nIt's subtler: optimizing consistently for the metric that's easy to track, while the metric that actually drives the result you want quietly stays flat. It feels like progress because you're producing output. But output and outcome are different — and in ${n}, conflating them is what keeps ${au} in the same position month after month.\n\nHere's how it compounds: you get better at the visible metric. You feel like things are improving. The underlying result doesn't change. Eventually the disconnect becomes undeniable — and then you restart.\n\n${pr} starts by surfacing which metric is actually moving your ${n} results, and which one is just making the effort feel worthwhile. That distinction alone changes the direction of everything that follows.`,
    opportunity: `Right now there's a structural shift happening in ${n} that most ${au} are positioned to benefit from — and most of them don't know it yet.\n\nThe playbook that worked 12 to 18 months ago is saturating. The returns are compressing. And in the space that's opening up, the advantage goes to ${au} who move before the opportunity is obvious — before it gets competitive, before it gets crowded, before the window shrinks to a fraction of what it is right now.\n\nThis is that moment. Not in theory. Specifically, right now.\n\n${pr} maps the exact path into this window for ${au} in ${n} — what to do, in what order, and why the timing makes it work.`,
    viral: `The ${n} content formula that ${au} are still using was the right one — 90 days ago.\n\nThe algorithm has moved on. Viewer behavior has moved on. What's producing results now looks structurally different from what used to work, and the ${au} who've made the shift are getting results that look disproportionate to their size or effort.\n\nIt's not disproportionate. It's just that they're working with the current model while everyone else is still running the last one.\n\n${pr} is built around the current model. Not the theory of what might work in ${n} — the structure of what's actually producing results for ${au} right now. Here's what that looks like in practice.`,
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
    // Audience intelligence
    desires:          intel.desires,
    fears:            intel.fears,
    pains:            intel.pains,
    transformation:   intel.transformation,
    // Neuro triggers
    sarTrigger:       pick(sarMap[hookType]       ?? sarMap.curiosity),
    painTrigger:      pick(painMap[intensity]     ?? painMap.medium),
    curiosityTrigger: pick(curiosityMap[hookType] ?? curiosityMap.curiosity),
    // Script & output
    script:           scriptMap[hookType]         ?? scriptMap.curiosity,
    cta:              pick(ctaMap[intensity]      ?? ctaMap.medium),
    title:            pick(titleMap[hookType]     ?? titleMap.curiosity),
    hashtags:         pick(hashtagSets),
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
