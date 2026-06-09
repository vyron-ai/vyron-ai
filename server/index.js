import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
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

// ── probeVideo — parse codec + metadata from ffmpeg -i stderr ─────────────────
// ffmpeg always exits non-zero when no output is given; the info is in stderr.
async function probeVideo(filePath) {
  if (!FFMPEG) return null;
  let stderr = "";
  try {
    await execFileAsync(FFMPEG, ["-hide_banner", "-i", filePath], {
      maxBuffer: 2 * 1024 * 1024,
      timeout:   20_000,
    });
  } catch (err) {
    stderr = (err?.stderr ?? "").trim();
  }
  if (!stderr) return null;

  const fmtLine = stderr.match(/Input #\d+,\s*([^\n,]+)/);
  const vidLine = stderr.match(/Stream #\d+:\d+[^:]*:\s*Video: ([^\n]+)/);
  const audLine = stderr.match(/Stream #\d+:\d+[^:]*:\s*Audio: ([^\n]+)/);
  const durLine = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const brLine  = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/);

  const vidStr = vidLine?.[1] ?? "";
  const audStr = audLine?.[1] ?? "";

  const codecMatch   = vidStr.match(/^(\S+)/);
  const profileMatch = vidStr.match(/\(([A-Za-z0-9 .:]+)\)/);
  const pixFmtMatch  = vidStr.match(/\b(yuv\w+|rgb\w*|bgr\w*|gray\w*|nv\d+)\b/);
  const audioMatch   = audStr.match(/^(\S+)/);

  // Resolution: "1920x1080" or "1080x1920" from video stream line
  const resMatch = vidStr.match(/,\s*(\d{2,5})x(\d{2,5})/);
  const width    = resMatch ? parseInt(resMatch[1], 10) : 0;
  const height   = resMatch ? parseInt(resMatch[2], 10) : 0;

  // FPS: "30 fps", "29.97 tbr", "23.976 fps" — prefer fps over tbr
  const fpsMatchFps = vidStr.match(/(\d+(?:\.\d+)?)\s*fps/);
  const fpsMatchTbr = vidStr.match(/(\d+(?:\.\d+)?)\s*tbr/);
  const fpsRaw = fpsMatchFps
    ? parseFloat(fpsMatchFps[1])
    : fpsMatchTbr ? parseFloat(fpsMatchTbr[1]) : 0;
  const fps = Math.round(fpsRaw * 100) / 100;

  // Duration in seconds
  let durationSec = 0;
  if (durLine) {
    durationSec = parseInt(durLine[1], 10) * 3600
      + parseInt(durLine[2], 10) * 60
      + parseFloat(durLine[3]);
    durationSec = Math.round(durationSec * 100) / 100;
  }

  // Bitrate in kbps (overall container bitrate)
  const bitrate = brLine ? parseInt(brLine[1], 10) : 0;

  // FFmpeg always reports QuickTime/MP4 family as "mov,mp4,m4a,..." regardless
  // of whether the actual file is MOV or MP4. Use the file extension — which
  // we control for our own output files — as the authoritative container name.
  const ext = extname(filePath).slice(1).toLowerCase();
  const EXT_MAP = { mp4: "mp4", mov: "mov", mkv: "mkv", webm: "webm", avi: "avi", ts: "ts", m4v: "m4v" };
  const container = EXT_MAP[ext] ?? (fmtLine?.[1] ?? "unknown").trim().split(",")[0];

  return {
    container,
    videoCodec:   codecMatch?.[1]   ?? "unknown",
    videoProfile: profileMatch?.[1] ?? "—",
    pixFmt:       pixFmtMatch?.[1]  ?? "—",
    audioCodec:   audioMatch?.[1]   ?? "none",
    width,
    height,
    fps,
    durationSec,
    bitrate,
  };
}


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
    product = "",
    audience = "",
    goal = "brand_awareness",
    postingFrequency = "daily",
    duration = 30,
    language = "Español",
    businessStage = "Microempresa",
  } = req.body ?? {};
  if (!niche.trim()) return res.status(400).json({ error: "niche is required" });

  const n   = niche.trim();
  const pr  = product.trim();
  const au  = audience.trim();
  const dur = Math.min(Math.max(parseInt(duration) || 30, 7), 90);
  const isES = language !== "English";
  const tr   = buildTransformation(n, pr, isES);
  const si   = buildStageIntelligence(businessStage, n, pr, au, isES);
  const sp   = buildStagePlannerData(businessStage, n, pr, au, isES);

  const freqMap  = { daily: 7, "5x_week": 5, "3x_week": 3, "2x_week": 2 };
  const ppw      = freqMap[postingFrequency] ?? 7;
  const total    = Math.min(Math.ceil(dur * ppw / 7), 90);

  const contentTypesEN = [
    "Educational", "Listicle", "Behind the Scenes", "Social Proof",
    "Product Demo", "Q&A", "Trending", "Story", "Challenge", "Hot Take",
  ];
  const contentTypesES = [
    "Educativo", "Lista", "Detrás de Escena", "Prueba Social",
    "Demo del Producto", "Preguntas y Respuestas", "Tendencia", "Historia", "Desafío", "Opinión Fuerte",
  ];
  const contentTypes = isES ? contentTypesES : contentTypesEN;

  const hookTypes = ["curiosity", "pain", "story", "authority", "mistake", "opportunity", "viral"];

  const titleTemplatesEN = {
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

  const titleTemplatesES = {
    curiosity: [
      `La verdadera razón por la que en ${n} no llegan a ${tr.practicalOutcome} (y no es lo que piensas)`,
      `Lo que nadie te dice sobre cómo conseguir ${tr.hiddenDesire} en ${n}`,
      `El lado oculto de ${n} que separa a los que tienen ${tr.emotionalTransformation} de los que no`,
      `Por qué la mayoría de las opciones de ${n} no entregan ${tr.practicalOutcome}`,
    ],
    pain: [
      `Por qué en ${n} todavía no tienes ${tr.practicalOutcome} — y el arreglo exacto`,
      `La verdadera razón por la que ${tr.fearAvoided} en ${n}`,
      `¿Todavía sin ${tr.practicalOutcome} en ${n}? Aquí está la respuesta honesta`,
      `El problema de ${n} que impide ${tr.emotionalTransformation} y nadie quiere admitir`,
    ],
    story: [
      `Cómo pasé de querer ${tr.hiddenDesire} a tenerlo de verdad en ${n}`,
      `Lo que finalmente me dio ${tr.practicalOutcome} en ${n} cuando las otras opciones no lo hicieron`,
      `El punto de inflexión en ${n} que convierte a cualquiera en ${tr.identityShift}`,
      `Mi mayor error en ${n} — y cómo finalmente conseguí ${tr.emotionalTransformation}`,
    ],
    authority: [
      `El enfoque de ${n} que realmente entrega ${tr.practicalOutcome} de forma consistente`,
      `Lo que los que ya tienen ${tr.emotionalTransformation} en ${n} hacen diferente`,
      `${n} bien hecho: lo que separa a los que llegan a ${tr.socialTransformation}`,
      `Las claves no negociables para conseguir ${tr.practicalOutcome} en ${n}`,
    ],
    mistake: [
      `El error #1 de ${n} que te mantiene sin ${tr.practicalOutcome}`,
      `Deja de hacer esto en ${n} — está impidiendo ${tr.emotionalTransformation}`,
      `3 decisiones de ${n} que te cuestan ${tr.practicalOutcome} en silencio`,
      `Este movimiento común en ${n} es la razón por la que ${tr.fearAvoided}`,
    ],
    opportunity: [
      `La oportunidad de ${n} para tener ${tr.practicalOutcome} que la mayoría ignora ahora`,
      `Hay una ventana en ${n} ahora mismo para lograr ${tr.socialTransformation} — aprovéchala`,
      `Por qué ahora es el mejor momento para conseguir ${tr.practicalOutcome} en ${n}`,
      `El ángulo de ${n} para llegar a ${tr.emotionalTransformation} que tu competencia todavía no encontró`,
    ],
    viral: [
      `El estándar de ${n} que ya entrega ${tr.practicalOutcome} (la mayoría no se ha actualizado)`,
      `Por qué el enfoque antiguo de ${n} dejó de dar ${tr.emotionalTransformation}`,
      `Todos hablan de ${tr.practicalOutcome} en ${n} — aquí está la verdad`,
      `El cambio en ${n} que ya está produciendo ${tr.socialTransformation} tomó a todos por sorpresa`,
    ],
  };

  const objectiveMapEN = {
    brand_awareness:  ["Reach new audience", "Grow organic followers", "Build niche authority", "Increase brand recall"],
    lead_generation:  ["Drive link-in-bio clicks", "Generate DM inquiries", "Capture email subscribers", "Build prospect list"],
    sales:            ["Drive offer conversions", "Present product value", "Overcome objections", "Move warm leads to action"],
    engagement:       ["Maximize comments", "Encourage saves & shares", "Build community conversation", "Boost interaction rate"],
    community:        ["Deepen audience relationship", "Foster two-way conversation", "Build brand advocates", "Encourage participation"],
  };

  const objectiveMapES = {
    brand_awareness:  ["Llegar a nueva audiencia", "Crecer seguidores orgánicos", "Construir autoridad en el nicho", "Aumentar recordación de marca"],
    lead_generation:  ["Generar clics en el enlace de bio", "Conseguir consultas por DM", "Capturar suscriptores de email", "Construir lista de prospectos"],
    sales:            ["Impulsar conversiones de oferta", "Presentar el valor del producto", "Superar objeciones", "Mover prospectos tibios a acción"],
    engagement:       ["Maximizar comentarios", "Fomentar guardados y compartidos", "Generar conversación en comunidad", "Aumentar tasa de interacción"],
    community:        ["Profundizar relación con audiencia", "Fomentar conversación bidireccional", "Crear defensores de marca", "Estimular participación activa"],
  };

  const ctaTemplatesEN = {
    curiosity:   ["Comment 'HOW' and I'll send the full breakdown", "Follow for the answer in part 2", "Save this before it disappears"],
    pain:        ["Comment 'STUCK' if this is you right now", "DM me — I'll show you the first step", "Link in bio if you're ready to fix this"],
    story:       ["Comment 'ME TOO' if you've been here", "Follow for the next chapter", "Share this with someone who needs it"],
    authority:   ["Save this framework for later", "Follow if you want the full breakdown", "Comment 'FRAMEWORK' for the PDF version"],
    mistake:     ["Comment 'GUILTY' if you've done this", "Follow — I share the fix every week", "Save this before you make the same mistake"],
    opportunity: ["Comment 'IN' if you want the details", "Link in bio — the window won't stay open", "Follow to catch the next opportunity early"],
    viral:       ["Share this with one creator who needs it", "Follow for what's working right now", "Duet or stitch this — let me know your take"],
  };

  const ctaTemplatesES = {
    curiosity:   [`Comenta 'CÓMO' y te mando el desglose completo de cómo conseguir ${tr.practicalOutcome}`, "Sígueme para la respuesta en la parte 2", "Guarda esto antes de que desaparezca"],
    pain:        [`Comenta 'LISTO' si quieres ${tr.practicalOutcome} y todavía no lo tienes`, `Escríbeme por DM — te muestro el primer paso hacia ${tr.emotionalTransformation}`, "Enlace en bio si estás listo para solucionar esto"],
    story:       [`Comenta 'YO TAMBIÉN' si todavía no tienes ${tr.practicalOutcome}`, "Sígueme para el próximo capítulo", "Comparte esto con alguien que lo necesita"],
    authority:   [`Guarda esto si quieres ${tr.practicalOutcome} de forma consistente`, "Sígueme si quieres el desglose completo", `Comenta '${n.toUpperCase()}' para los detalles`],
    mistake:     [`Comenta 'CULPABLE' si esto te ha impedido ${tr.practicalOutcome}`, `Sígueme — publico cómo conseguir ${tr.emotionalTransformation} cada semana`, "Guarda esto antes de cometer el mismo error"],
    opportunity: [`Comenta 'DENTRO' si quieres ${tr.practicalOutcome} antes de que se cierre la ventana`, "Enlace en bio — la ventana no va a quedar abierta", "Sígueme para detectar la próxima oportunidad temprano"],
    viral:       [`Comparte esto con alguien que quiere ${tr.practicalOutcome} en ${n}`, `Sígueme para lo que realmente entrega ${tr.emotionalTransformation} ahora`, "Duplícalo o une — dime tu perspectiva"],
  };

  const titleTemplates = isES ? titleTemplatesES : titleTemplatesEN;
  const objectiveMap   = isES ? objectiveMapES   : objectiveMapEN;
  const ctaTemplates   = isES ? ctaTemplatesES   : ctaTemplatesEN;

  const intensityCycle = ["medium", "aggressive", "soft", "medium", "aggressive", "medium", "soft"];

  const goalKey    = (goal || "").toLowerCase().replace(/[\s-]+/g, "_");
  const objectives = objectiveMap[goalKey] ?? objectiveMap.brand_awareness;

  const entries = [];
  for (let i = 0; i < total; i++) {
    const dayNum      = total === 1 ? 1 : Math.round((i / (total - 1)) * (dur - 1)) + 1;
    const hookType    = hookTypes[i % hookTypes.length];
    const contentType = contentTypes[i % contentTypes.length];
    const intensity   = intensityCycle[i % intensityCycle.length];
    // Stage-specific topic map — every entry uses stage-calibrated topic for this hookType
    const stageTopics = sp.topicMap[hookType] ?? sp.topicMap.curiosity;
    const rawTitle    = stageTopics[i % stageTopics.length];
    // Stage CTA pool — stage psychology determines the right ask
    const rawCta      = si.ctaPool[i % si.ctaPool.length];
    // Stage-specific objective — replaces generic goal-based objective
    const rawObjective = sp.objectivePool[i % sp.objectivePool.length];
    entries.push({
      day:         dayNum,
      contentType,
      hookType,
      intensity,
      angle:       sp.angle,
      title:       ctxApply(rawTitle,      n, au, pr, isES),
      objective:   rawObjective,
      cta:         ctxApply(rawCta,        n, au, pr, isES),
    });
  }

  res.json({ entries, total, duration: dur, niche: n, product: pr, audience: au });
});

// ── VYRON Industry Intelligence Engine V1 ────────────────────────────────────
// Detects the industry from a niche string and returns domain-specific vocabulary,
// synonyms, and audience language. Makes every output sound like it was written
// by a strategist who knows that niche — not a generic content generator.

const _INDUSTRY_MAP = [
  {
    // ── Barbería / Salón / Grooming ─────────────────────────────────────────
    match: ["barberia","barbero","peluqueria","salon de belleza","salon de peluqueria","estetica","grooming","barbershop","barber","hair salon","beauty salon","hairstylist","shave","afeitado","corte de pelo","belleza masculina"],
    es: {
      synonyms:       ["la imagen personal","el cuidado personal","el grooming","la apariencia"],
      keywords:       ["imagen","presencia","apariencia","estilo","confianza","primera impresión","cuidado personal","autoridad visual"],
      phrases:        ["verte mejor","proyectar seguridad","mejorar tu imagen","causar una mejor impresión","presencia profesional"],
      desires:        "proyectar confianza, causar una primera impresión impactante y verse al nivel de quien ya son por dentro",
      fears:          "verse descuidados, no causar buena impresión o que su apariencia los ponga en desventaja antes de abrir la boca",
      pains:          "la desconexión entre cómo se sienten por dentro y cómo se presentan al mundo — una imagen que no refleja su nivel real",
      transformation: "de verse del montón a proyectar autoridad visual — de invisible a memorable, de descuidado a siempre impecable",
    },
    en: {
      synonyms:       ["personal image","personal care","grooming","appearance"],
      keywords:       ["image","presence","appearance","style","confidence","first impression","personal care"],
      phrases:        ["look better","project confidence","improve your image","make a great impression","professional presence"],
      desires:        "to project confidence, make a powerful first impression and look like the person they already are on the inside",
      fears:          "looking unkempt, making a bad first impression or letting their appearance put them at a disadvantage",
      pains:          "the gap between how they feel inside and how they present to the world — an image that doesn't match their actual level",
      transformation: "from blending in to projecting real authority — from overlooked to unforgettable, from inconsistent to always sharp",
    },
  },
  {
    // ── Gym / Fitness / Entrenamiento ───────────────────────────────────────
    match: ["gym","gimnasio","fitness","entrenamiento","personal trainer","crossfit","deporte","ejercicio","musculacion","atletismo","fuerza","cardio","nutricion deportiva","workout","weightlifting"],
    es: {
      synonyms:       ["el entrenamiento","el fitness","la disciplina física","la salud física"],
      keywords:       ["disciplina","energía","físico","rendimiento","hábitos","consistencia","fuerza","salud"],
      phrases:        ["transformar tu cuerpo","ganar consistencia","mejorar tu rendimiento","construir hábitos sólidos","progresar de forma sostenida"],
      desires:        "un físico que refleje su esfuerzo, hábitos que funcionen sin fuerza de voluntad heroica y el progreso visible que los mantenga motivados",
      fears:          "estancarse, perder el progreso acumulado o dedicar meses de esfuerzo sin ver resultados reales",
      pains:          "la inconsistencia que sabotea el progreso — empezar bien y abandonar, o esforzarse sin ver el físico que deberían tener",
      transformation: "de inconsistente a imparable — de empezar y abandonar a construir el físico y los hábitos que se sostienen solos",
    },
    en: {
      synonyms:       ["training","fitness","physical discipline","the gym"],
      keywords:       ["discipline","energy","physique","performance","habits","consistency","strength","health"],
      phrases:        ["transform your body","build consistency","improve performance","build solid habits","make real progress"],
      desires:        "a physique that reflects their effort, habits that work without heroic willpower, and visible progress that keeps them motivated",
      fears:          "plateauing, losing all accumulated progress, or putting in months of effort without seeing real results",
      pains:          "the inconsistency that sabotages any progress — starting strong and falling off, or grinding without seeing the results they should",
      transformation: "from inconsistent to unstoppable — from starting-and-quitting to building the physique and habits that sustain themselves",
    },
  },
  {
    // ── Dentista / Salud bucal ───────────────────────────────────────────────
    match: ["dentista","dental","odontologia","ortodoncia","blanqueamiento","clinica dental","salud bucal","implante","dentist","orthodontic","teeth whitening"],
    es: {
      synonyms:       ["la salud bucal","la estética dental","el cuidado dental","la sonrisa"],
      keywords:       ["sonrisa","confianza","estética dental","salud bucal","apariencia","autoestima","bienestar"],
      phrases:        ["sonreír con confianza","mejorar tu sonrisa","sentirte seguro al sonreír","salud dental impecable"],
      desires:        "sonreír sin inhibiciones, sentirse seguros en cualquier conversación y tener una sonrisa que los favorezca, no que los frene",
      fears:          "que su sonrisa los haga sentir inseguros, que los demás lo noten o que un problema menor se convierta en uno grave",
      pains:          "evitar sonreír libremente, cubrir la boca al reír o sentir que su sonrisa no refleja quiénes son en realidad",
      transformation: "de esconder la sonrisa a mostrarla sin pensarlo — de inseguridad e incomodidad a confianza plena en cada conversación",
    },
    en: {
      synonyms:       ["oral health","dental care","dental aesthetics","the smile"],
      keywords:       ["smile","confidence","dental aesthetics","oral health","appearance","self-esteem","wellbeing"],
      phrases:        ["smile with confidence","improve your smile","feel secure when smiling","flawless dental health"],
      desires:        "to smile without inhibition, feel confident in any conversation and have a smile that works for them, not against them",
      fears:          "that their smile makes them self-conscious, that others notice it, or that a small problem becomes a serious one",
      pains:          "hiding their smile, covering their mouth when laughing, or feeling like their smile doesn't reflect who they really are",
      transformation: "from hiding their smile to showing it without thinking — from insecurity to full confidence in every interaction",
    },
  },
  {
    // ── Restaurante / Gastronomía ────────────────────────────────────────────
    match: ["restaurante","cocina","chef","gastronomia","cafeteria","cafe","catering","comida","bar","bistro","panaderia","pasteleria","restaurant","food","dining"],
    es: {
      synonyms:       ["la experiencia gastronómica","el servicio","la propuesta culinaria","el local"],
      keywords:       ["experiencia","sabor","servicio","ambiente","fidelización","calidad","hospitalidad"],
      phrases:        ["crear experiencias memorables","fidelizar clientes","diferenciarse por el servicio","llenar el local","generar reseñas de 5 estrellas"],
      desires:        "un local lleno de clientes fieles que vuelven y refieren — no solo por la comida, sino por la experiencia que solo ellos ofrecen",
      fears:          "mesas vacías, clientes que no regresan o que la competencia los opaque sin entender por qué",
      pains:          "atraer clientes una vez pero no lograr que vuelvan — invertir en publicidad sin ver el retorno en ventas reales",
      transformation: "de depender del volumen a tener una base de clientes fieles — de transacciones a una comunidad gastronómica real",
    },
    en: {
      synonyms:       ["the dining experience","the service","the culinary offer","the venue"],
      keywords:       ["experience","flavor","service","atmosphere","loyalty","quality","hospitality"],
      phrases:        ["create memorable experiences","build customer loyalty","differentiate through service","fill tables","generate 5-star reviews"],
      desires:        "a full house of loyal regulars who return and refer — not just for the food, but for the experience only they offer",
      fears:          "empty tables, one-time visitors who never return, or competitors outshining them without understanding why",
      pains:          "attracting customers once but failing to bring them back — spending on ads without seeing it return in real revenue",
      transformation: "from volume-dependent to a loyal customer base — from transactions to a real dining community",
    },
  },
  {
    // ── Abogado / Legal ──────────────────────────────────────────────────────
    match: ["abogado","derecho","juridico","legal","asesoria legal","bufete","firma legal","litigio","contrato","notario","fiscal","lawyer","attorney","law firm","legal services"],
    es: {
      synonyms:       ["la asesoría legal","la protección jurídica","el servicio legal","la defensa"],
      keywords:       ["protección","seguridad jurídica","tranquilidad","defensa","riesgo legal","certeza","derechos"],
      phrases:        ["proteger tu patrimonio","evitar riesgos legales","tener certeza jurídica","resolver sin complicaciones","dormir tranquilo"],
      desires:        "certeza jurídica, protección real de lo que han construido y la tranquilidad de saber que están blindados ante cualquier riesgo",
      fears:          "perder lo que han construido por un error legal evitable o enfrentar una situación crítica sin la preparación necesaria",
      pains:          "la incertidumbre de no saber si están legalmente protegidos — operar con riesgo invisible o actuar tarde ante un problema crítico",
      transformation: "de expuestos a protegidos — de operar con incertidumbre jurídica a tener certeza total sobre lo que construyen y cómo lo defienden",
    },
    en: {
      synonyms:       ["legal advisory","legal protection","the legal service","the defense"],
      keywords:       ["protection","legal security","peace of mind","defense","legal risk","certainty","rights"],
      phrases:        ["protect your assets","avoid legal risks","have legal certainty","resolve without complications","sleep soundly"],
      desires:        "legal certainty, real protection of what they've built, and the peace of mind of knowing they're fully shielded against any risk",
      fears:          "losing what they've built through an avoidable legal mistake, or facing a critical situation without proper preparation",
      pains:          "not knowing if they're legally protected — operating with invisible risk or acting too late when a problem becomes critical",
      transformation: "from exposed to protected — from operating with legal uncertainty to having total clarity over what they're building and how it's defended",
    },
  },
  {
    // ── Marketing / Agencia / Digital ───────────────────────────────────────
    match: ["marketing","agencia","publicidad","branding","redes sociales","social media","digital marketing","seo","google ads","contenido digital","influencer","agency","advertising","growth hacking"],
    es: {
      synonyms:       ["la estrategia de marketing","el crecimiento digital","la visibilidad","el posicionamiento"],
      keywords:       ["crecimiento","posicionamiento","ventas","visibilidad","alcance","conversión","retorno","clientes"],
      phrases:        ["atraer clientes de forma consistente","posicionarse como referente","convertir seguidores en clientes","generar ventas predecibles"],
      desires:        "un flujo predecible de clientes calificados, posicionamiento claro y un sistema de ventas que funcione sin depender de su tiempo",
      fears:          "invertir en publicidad sin retorno, quedar invisible mientras la competencia crece o no saber qué está fallando en la estrategia",
      pains:          "tiempo y dinero invertido en marketing sin resultados claros — activos en redes pero sin clientes ni crecimiento real",
      transformation: "de invisible a referente — de publicar sin rumbo a tener un sistema que atrae, convierte y retiene clientes de forma sistemática",
    },
    en: {
      synonyms:       ["the marketing strategy","digital growth","visibility","positioning"],
      keywords:       ["growth","positioning","sales","visibility","reach","conversion","return","clients"],
      phrases:        ["attract clients consistently","position as a reference","convert followers into clients","generate predictable revenue"],
      desires:        "a predictable flow of qualified clients, clear positioning, and a sales system that works without depending on their time",
      fears:          "investing in ads without return, staying invisible while competitors grow, or not knowing what's broken in the strategy",
      pains:          "time and money in marketing with no clear results — active online but not generating clients or real growth",
      transformation: "from invisible to reference — from posting aimlessly to a system that attracts, converts and retains clients systematically",
    },
  },
  {
    // ── Inmobiliaria / Real Estate ───────────────────────────────────────────
    match: ["inmobiliaria","bienes raices","propiedades","agente inmobiliario","real estate","propiedad","arriendo","alquiler","inversion inmobiliaria","hipoteca","realtor","housing","realestate"],
    es: {
      synonyms:       ["la inversión inmobiliaria","el patrimonio","los bienes raíces","las propiedades"],
      keywords:       ["patrimonio","inversión","plusvalía","propiedad","rentabilidad","activos","estabilidad","independencia financiera"],
      phrases:        ["construir patrimonio real","invertir con certeza","generar rentabilidad","multiplicar activos","asegurar el futuro"],
      desires:        "patrimonio que se valorice, ingresos pasivos que den libertad y la certeza de haber tomado la decisión correcta antes de que sea tarde",
      fears:          "comprar mal, perder dinero en una inversión que parecía segura o que el mercado los deje atrás mientras otros construyen patrimonio",
      pains:          "la parálisis por análisis — saber que el ladrillo es buena inversión pero no tener claridad sobre cuándo, dónde ni cómo entrar correctamente",
      transformation: "de ahorrador pasivo a inversionista activo — de dinero inactivo a activos que crecen y generan rentabilidad predecible",
    },
    en: {
      synonyms:       ["real estate investment","wealth building","the property market","property"],
      keywords:       ["wealth","investment","appreciation","property","return","assets","stability","financial independence"],
      phrases:        ["build real wealth","invest with certainty","generate returns","multiply assets","secure the future"],
      desires:        "wealth that appreciates, passive income that gives freedom, and certainty of having made the right move at the right time",
      fears:          "buying wrong, losing money on an investment that seemed safe, or being left behind while others build wealth",
      pains:          "analysis paralysis — knowing real estate is a good investment but lacking clarity on when, where and how to enter correctly",
      transformation: "from passive saver to active investor — from idle money to assets that grow and generate predictable returns",
    },
  },
  {
    // ── Coaching / Educación / Desarrollo personal ───────────────────────────
    match: ["coach","coaching","mentor","mentoria","educacion","formacion","cursos","academia","aprendizaje","desarrollo personal","capacitacion","training program","life coach","business coach"],
    es: {
      synonyms:       ["el coaching","la formación","el desarrollo personal","el programa"],
      keywords:       ["transformación","crecimiento personal","claridad","enfoque","potencial","habilidades","mentoría","resultados"],
      phrases:        ["desbloquear tu potencial","acelerar tu crecimiento","obtener claridad","pasar al siguiente nivel","construir habilidades reales"],
      desires:        "transformación real y medible, claridad sobre su camino y la certeza de estar avanzando sistemáticamente hacia su mejor versión",
      fears:          "invertir en formación y no aplicarla, quedarse en el mismo punto después de haberlo intentado todo o ser la excepción",
      pains:          "saber qué necesitan cambiar pero no saber cómo — tener motivación sin el sistema que la convierta en resultados consistentes",
      transformation: "de saber pero no aplicar a ejecutar con claridad — de potencial sin activar a crecimiento medible y sostenido semana a semana",
    },
    en: {
      synonyms:       ["coaching","the training program","the development journey","the mentorship"],
      keywords:       ["transformation","personal growth","clarity","focus","potential","skills","mentorship","results"],
      phrases:        ["unlock your potential","accelerate your growth","gain clarity","move to the next level","build real skills"],
      desires:        "real and measurable transformation, clarity on their path, and the certainty they're consistently moving toward their best version",
      fears:          "investing in training and not applying it, staying in the same place after trying everything, or being the exception",
      pains:          "knowing what they need to change but not knowing how — having motivation without the system to convert it into consistent results",
      transformation: "from knowing but not applying to executing with clarity — from untapped potential to measurable, sustained growth every week",
    },
  },
  {
    // ── Finanzas / Inversiones / Dinero ──────────────────────────────────────
    match: ["finanzas","inversiones","ahorro","financiero","banca","credito","prestamo","trading","bolsa","cripto","libertad financiera","riqueza","finance","investment","crypto","wealth management","financial planning"],
    es: {
      synonyms:       ["las finanzas personales","la gestión financiera","el dinero","los ingresos"],
      keywords:       ["dinero","ingresos","ahorro","inversión","libertad financiera","flujo de caja","riqueza","independencia"],
      phrases:        ["hacer crecer tu dinero","generar ingresos pasivos","construir riqueza real","dejar de intercambiar tiempo por dinero"],
      desires:        "libertad financiera real — no preocuparse por el dinero, generar ingresos sin intercambiar tiempo y tener certeza sobre el futuro económico",
      fears:          "trabajar toda la vida sin construir riqueza, tomar malas decisiones financieras o depender de un ingreso que podría desaparecer",
      pains:          "ganar dinero pero no acumularlo — ingresos que llegan y se van sin construir el patrimonio que debería seguir de ese esfuerzo",
      transformation: "de intercambiar tiempo por dinero a construir activos — de vivir al día a un sistema financiero que trabaja mientras ellos descansan",
    },
    en: {
      synonyms:       ["personal finance","financial management","money","wealth"],
      keywords:       ["money","income","savings","investment","financial freedom","cash flow","wealth","independence"],
      phrases:        ["grow your money","generate passive income","build real wealth","stop trading time for money"],
      desires:        "real financial freedom — not worrying about money, generating income without trading time, and certainty about their financial future",
      fears:          "working their whole life without building wealth, making bad financial decisions, or depending on income that could disappear",
      pains:          "earning money but not accumulating it — income that comes and goes without building the wealth that should follow from their effort",
      transformation: "from trading time for money to building assets — from paycheck to paycheck to a financial system that works while they rest",
    },
  },
  {
    // ── Salud / Bienestar / Terapia ───────────────────────────────────────────
    match: ["salud","bienestar","medico","terapeuta","psicologia","terapia","nutricion","nutricionista","wellness","clinica","ansiedad","estres","health","therapy","nutrition","wellbeing","psycholog"],
    es: {
      synonyms:       ["el bienestar","la salud integral","el cuidado personal","el equilibrio"],
      keywords:       ["bienestar","salud","equilibrio","calidad de vida","energía","tranquilidad","vitalidad","salud mental"],
      phrases:        ["sentirte bien de verdad","recuperar tu energía","vivir con equilibrio","priorizar tu salud","cuidarte sin culpa"],
      desires:        "sentirse verdaderamente bien — con energía, equilibrio emocional y la certeza de estar cuidando su salud de forma proactiva",
      fears:          "que un problema menor se convierta en grave por no atenderlo a tiempo, o que su calidad de vida se deteriore sin poder hacer nada",
      pains:          "vivir con síntomas que afectan su calidad de vida sin saber exactamente qué los causa ni cómo resolverlos de forma definitiva",
      transformation: "de gestionar síntomas a tener salud de verdad — de sobrevivir el día a vivir con la energía y equilibrio que merecen",
    },
    en: {
      synonyms:       ["wellbeing","health","wellness","balance"],
      keywords:       ["wellbeing","health","balance","quality of life","energy","peace of mind","vitality","mental health"],
      phrases:        ["feel genuinely well","recover your energy","live in balance","prioritize your health","care for yourself without guilt"],
      desires:        "to feel truly well — with energy, emotional balance and the certainty they're caring for their health proactively",
      fears:          "a small problem becoming serious because they didn't address it in time, or their quality of life deteriorating",
      pains:          "living with symptoms that affect their quality of life without knowing exactly what causes them or how to resolve them definitively",
      transformation: "from managing symptoms to having real health — from surviving the day to living with the energy and balance they deserve",
    },
  },
  {
    // ── Tecnología / Software / Startups ──────────────────────────────────────
    match: ["tecnologia","software","tech","app","aplicacion","desarrollo web","programacion","saas","automatizacion","startup","producto digital","inteligencia artificial","erp","crm","plataforma digital"],
    es: {
      synonyms:       ["la solución tecnológica","la plataforma","la automatización","el software"],
      keywords:       ["eficiencia","automatización","escalabilidad","productividad","integración","datos","velocidad","innovación"],
      phrases:        ["automatizar procesos","escalar sin fricción","ahorrar tiempo y recursos","tomar decisiones con datos","operar más rápido"],
      desires:        "procesos automatizados que liberen su tiempo, capacidad de escalar sin añadir fricción y datos claros para mejores decisiones",
      fears:          "invertir en tecnología que no se adopta, implementaciones que generan más problemas de los que resuelven o quedar obsoleto rápido",
      pains:          "procesos manuales que consumen tiempo valioso, sistemas desconectados y decisiones tomadas sin datos reales o con información incompleta",
      transformation: "de operación manual a sistemas que trabajan solos — de reactividad y caos operativo a control total con automatización real",
    },
    en: {
      synonyms:       ["the tech solution","the platform","automation","the software"],
      keywords:       ["efficiency","automation","scalability","productivity","integration","data","speed","innovation"],
      phrases:        ["automate processes","scale without friction","save time and resources","make data-driven decisions","operate faster"],
      desires:        "automated processes that free their time, the ability to scale without friction, and clear data for better decisions",
      fears:          "investing in tech that doesn't get adopted, implementations that create more problems than they solve, or falling behind quickly",
      pains:          "manual processes consuming valuable time, disconnected systems, and decisions made without real or complete data",
      transformation: "from manual operations to systems that run themselves — from reactive chaos to total control with real automation",
    },
  },
  {
    // ── E-commerce / Tienda online ─────────────────────────────────────────────
    match: ["ecommerce","tienda online","tienda virtual","venta online","dropshipping","shopify","marketplace","woocommerce","tienda digital","online store"],
    es: {
      synonyms:       ["la tienda online","el e-commerce","las ventas digitales","el comercio digital"],
      keywords:       ["conversión","ventas","tráfico","retención","ingresos","ticket promedio","clientes recurrentes","escala"],
      phrases:        ["convertir visitas en ventas","aumentar el ticket promedio","fidelizar compradores","escalar ingresos de forma predecible"],
      desires:        "ventas predecibles, compradores que regresan solos y una tienda que genera ingresos sistemáticamente sin atención constante",
      fears:          "invertir en tráfico que no convierte, acumular inventario sin rotación o competir solo por precio sin poder ganar",
      pains:          "tráfico sin ventas — visitas que llegan pero no compran, o compradores que no vuelven a pesar de una buena primera experiencia",
      transformation: "de tienda activa a motor de ingresos — de picos de tráfico impredecibles a un sistema que convierte y retiene de forma sostenida",
    },
    en: {
      synonyms:       ["the online store","e-commerce","digital sales","the shop"],
      keywords:       ["conversion","sales","traffic","retention","revenue","average order","repeat customers","scale"],
      phrases:        ["convert visitors to sales","increase average order value","retain buyers","scale revenue predictably"],
      desires:        "predictable sales, customers who return on their own, and a store that generates income systematically without constant attention",
      fears:          "investing in traffic that doesn't convert, inventory piling up, or competing on price without a way to win",
      pains:          "traffic without sales — visitors who arrive but don't buy, or buyers who never return despite a good first experience",
      transformation: "from active store to revenue engine — from traffic spike dependency to a system that consistently converts and retains",
    },
  },
];

const _INDUSTRY_FALLBACK = {
  es: {
    synonyms:       ["este negocio","este servicio","tu propuesta"],
    keywords:       ["resultados","crecimiento","confianza","valor","posicionamiento","clientes"],
    phrases:        ["generar resultados consistentes","crear valor real","crecer de forma sostenida"],
    desires:        "resultados concretos, crecimiento sostenido y la certeza de que lo que hacen funciona de forma predecible",
    fears:          "invertir esfuerzo sin ver resultados claros o que la competencia avance mientras ellos se estancan",
    pains:          "la falta de un sistema que genere resultados de forma consistente — mucho esfuerzo, pocos resultados medibles",
    transformation: "de esfuerzo sin dirección a un sistema que genera resultados — del azar al control sobre los outcomes",
  },
  en: {
    synonyms:       ["this business","this service","your offer"],
    keywords:       ["results","growth","confidence","value","positioning","clients"],
    phrases:        ["generate consistent results","create real value","grow sustainably"],
    desires:        "concrete results, sustained growth, and the certainty that what they're doing works predictably",
    fears:          "investing effort without clear results, or watching competitors advance while they stagnate",
    pains:          "the lack of a system that generates results consistently — a lot of effort, few measurable outcomes",
    transformation: "from directionless effort to a system that generates results — from depending on luck to controlling outcomes",
  },
};

// Returns the industry profile for a niche string — falls back to generic vocabulary
function industryProfile(n, isES) {
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nn   = norm(n);
  for (const ind of _INDUSTRY_MAP) {
    if (ind.match.some(w => nn.includes(norm(w)))) return isES ? ind.es : ind.en;
  }
  return isES ? _INDUSTRY_FALLBACK.es : _INDUSTRY_FALLBACK.en;
}

// ── VYRON Audience Lock Engine V2 ────────────────────────────────────────────
// Prevents audience drift — keeps every generated field locked to the user's
// exact audience profile. Variants preserve the subject + semantic goal.
// Banned terms (empresarios, emprendedores, etc.) are blocked unless they
// appear in the original audience input.

const _AUDIENCE_BLACKLIST_ES = [
  "empresario","empresarios","emprendedor","emprendedores",
  "ejecutivo","ejecutivos","dueño de negocio","dueños de negocio",
  "director","directores","fundador","fundadores",
  "ceo","ceos","cliente ideal","clientes ideales",
  "inversor","inversores","gerente","gerentes",
];

const _AUDIENCE_BLACKLIST_EN = [
  "entrepreneur","entrepreneurs","business owner","business owners",
  "executive","executives","founder","founders",
  "ceo","ceos","ideal client","ideal clients",
  "manager","managers","investor","investors",
  "decision maker","decision makers",
];

// Subject-level safe synonym map — masculine/neutral only (safe after "los ___")
const _SUBJECT_SYNONYMS = {
  // Spanish
  "jovenes":        ["jóvenes","jóvenes profesionales"],
  "hombres":        ["hombres","hombres que buscan"],
  "mujeres":        ["mujeres","mujeres que buscan"],
  "madres":         ["madres","mamás"],
  "padres":         ["padres","papás"],
  "adultos":        ["adultos"],
  "profesionales":  ["profesionales"],
  "estudiantes":    ["estudiantes"],
  "creadores":      ["creadores","creadores de contenido"],
  "freelancers":    ["freelancers","independientes"],
  "coaches":        ["coaches","mentores"],
  "emprendedores":  ["emprendedores","dueños de negocio"],
  "empresarios":    ["empresarios","dueños de empresa"],
  // English
  "people":         ["people","individuals"],
  "men":            ["men","guys"],
  "women":          ["women","ladies"],
  "mothers":        ["mothers","moms"],
  "professionals":  ["professionals","people"],
  "students":       ["students","learners"],
  "creators":       ["creators","content creators"],
  "freelancers":    ["freelancers","independents"],
  "coaches":        ["coaches","mentors"],
};

// Parse audience string into { subject, goal } — delegates to existing ceSubject/ceGoal
function audienceLock(au, n, isES) {
  if (!au) {
    return { variants: [isES ? "tu audiencia" : "your audience"], subject: "", goal: "", blacklist: [] };
  }

  const normStr = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const auNorm  = normStr(au);

  // Extract structured components from the audience phrase
  const subject  = ceSubject(au, isES) || au;
  const goal     = ceGoal(au, isES)    || "";

  // Build per-input blacklist — only block terms NOT already in the original
  const rawBL    = isES ? _AUDIENCE_BLACKLIST_ES : _AUDIENCE_BLACKLIST_EN;
  const blacklist = rawBL.filter(term => !auNorm.includes(normStr(term)));

  // Industry profile provides domain-specific goal rephrasing
  const profile  = industryProfile(n, isES);

  // Convert industry phrases from 2nd-person to 3rd-person
  const to3rd = (ph) => (ph || "")
    .replace(/\bverte\b/gi, "verse")
    .replace(/\btu\b/gi,    "su")
    .replace(/\btus\b/gi,   "sus")
    .replace(/\bhacerte\b/gi, "hacerse")
    .replace(/\bsentirte\b/gi,"sentirse");

  const goalRephrases = (profile.phrases || []).slice(0, 5)
    .map(ph => isES ? to3rd(ph) : ph)
    .filter(Boolean);

  // Find subject synonyms from the map (key match on normalized subject)
  const subjNorm = normStr(subject);
  let subjVariants = [subject];
  for (const [key, vals] of Object.entries(_SUBJECT_SYNONYMS)) {
    if (subjNorm === normStr(key) || subjNorm.startsWith(normStr(key))) {
      subjVariants = vals;
      break;
    }
  }

  // Build variant pool — cross-product of subjects × connectors × goals (max 10)
  const variants  = [au];
  const notDupe   = (v) => !variants.some(x => normStr(x) === normStr(v));

  if (goal) {
    const connectors = isES
      ? ["que quieren","que buscan","que desean","que necesitan"]
      : ["who want to","who seek to","who want","looking to"];

    const goalPool = [goal, ...goalRephrases.filter(g => normStr(g) !== normStr(goal))].slice(0, 4);

    for (const s of subjVariants.slice(0, 3)) {
      for (const c of connectors) {
        for (const g of goalPool) {
          if (variants.length >= 10) break;
          const v = `${s} ${c} ${g}`;
          if (notDupe(v)) variants.push(v);
        }
        if (variants.length >= 10) break;
      }
      if (variants.length >= 10) break;
    }
  }

  return { variants: variants.slice(0, 10), subject, goal, blacklist };
}

// Post-generation purity scan — returns consistency score (0-100) and any violations
function audiencePurityScan(outputObj, blacklist) {
  const normStr = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const fullText = normStr(JSON.stringify(outputObj));
  let violations  = 0;
  const found     = [];
  for (const term of blacklist) {
    const t     = normStr(term).replace(/[\s-]+/g, "\\s+");
    const regex = new RegExp("\\b" + t + "\\b", "g");
    const count = (fullText.match(regex) || []).length;
    if (count > 0) { violations += count; found.push(`${term}(×${count})`); }
  }
  return { score: Math.max(0, 100 - violations * 15), violations, contamination: found };
}

// ── VYRON Context Engine V2 ───────────────────────────────────────────────────
// Generates rich semantic variations and enforces per-field + global phrase
// limits so every output reads like a human strategist, not a template engine.

function ceSubject(phrase, isES) {
  if (!phrase) return phrase;
  const re = isES ? /^(.*?)\s+que\s+/i : /^(.*?)\s+who\s+/i;
  const m  = phrase.match(re);
  return m ? m[1].trim() : phrase;
}

function ceGoal(phrase, isES) {
  const re = isES
    ? /(?:quieren?|buscan?|desean?|necesitan?|quiere|busca|desea|necesita)\s+(.+)$/i
    : /(?:want[s]?|seek[s]?|need[s]?|desire[s]?|look[s]?\s+to)\s+(.+)$/i;
  const m = phrase.match(re);
  return m ? m[1].trim() : null;
}

// Audience Lock Engine — returns only semantically safe variants of the original audience.
// Never introduces banned business archetypes (empresarios, emprendedores, etc.)
// unless the user typed them. Variants preserve the original subject + semantic goal.
function ceAuVars(au, n, isES) {
  const lock = audienceLock(au, n, isES);
  return lock.variants.length ? lock.variants : [au || (isES ? "tu audiencia" : "your audience")];
}

// Industry-aware niche variation pool — uses domain-specific synonyms, not generic "sector/espacio"
function ceNVars(n, isES) {
  if (!n) return [];
  const short   = n.split(/\s+/).length > 2 ? n.split(/\s+/).slice(0, 2).join(" ") : null;
  const profile = industryProfile(n, isES);
  const unique  = (arr) => [...new Set(arr.filter(Boolean))];
  return unique([n, short, ...profile.synonyms]);
}

// Rich product/service variation pool
function cePrVars(pr, isES) {
  if (!pr) return [];
  const short  = pr.split(/\s+/).length > 2 ? pr.split(/\s+/).slice(0, 2).join(" ") : null;
  const unique = (arr) => [...new Set(arr.filter(Boolean))];
  return unique(isES
    ? [pr, short, "esta experiencia", "este servicio", "esta solución", "el resultado", "este proceso", "este método"]
    : [pr, short, "this service", "this solution", "the result", "this experience", "this approach", "this method"]
  );
}

// Build a stateful applier for one full report.
// maxPerField = max times the ORIGINAL phrase is kept per field.
// maxGlobal   = max times the ORIGINAL phrase appears across ALL fields combined.
// After either limit is hit, the phrase is replaced with a cycling variation.
function ctxBuild(n, au, pr, isES, maxPerField = 1, maxGlobal = 3) {
  const auVars = ceAuVars(au, n, isES); // pass n so audienceLock can use industry profile
  const nVars  = ceNVars(n,  isES);
  const prVars = cePrVars(pr, isES);
  const s = { auG: 0, nG: 0, prG: 0, auVI: 1, nVI: 1, prVI: 1 };

  function applyOne(text, phrase, vars, gk, vik) {
    if (!phrase || !phrase.trim() || !text) return text;
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let fc = 0;
    return text.replace(new RegExp(esc, "gi"), () => {
      fc++; s[gk]++;
      if (fc <= maxPerField && s[gk] <= maxGlobal) return phrase;
      const r = vars[s[vik] % vars.length]; s[vik]++;
      return r || phrase;
    });
  }

  return {
    applyField(text) {
      if (!text || typeof text !== "string") return text;
      text = applyOne(text, au, auVars, "auG",  "auVI");
      text = applyOne(text, n,  nVars,  "nG",   "nVI");
      text = applyOne(text, pr, prVars, "prG",  "prVI");
      return text;
    },
  };
}

// Single-field application — fresh counter per call (used for Content Planner entries)
function ctxApply(text, n, au, pr, isES) {
  return ctxBuild(n, au, pr, isES, 1, 1).applyField(text || "");
}

// Batch application — one shared global counter across all fields in the object
function ctxBatch(fields, n, au, pr, isES, maxGlobal = 3) {
  const ctx = ctxBuild(n, au, pr, isES, 1, maxGlobal);
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = typeof v === "string" ? ctx.applyField(v) : v;
  }
  return out;
}

// Keyword-based hashtag builder — never concatenates full audience/product phrases
function buildHashtags(n, au, pr, hookType, isES) {
  const stopES = new Set(["que","con","los","las","del","para","una","uno","por","quien","quienes","quieren","buscan","desean","hacia","desde","entre","sobre","pero","como","sus","son","han","hay","muy","sin","ser","fue"]);
  const stopEN = new Set(["the","and","for","who","that","with","are","from","want","seek","need","have","been","will","they","their","this","when","what","how","why","can","not","look","looks"]);
  const stop   = isES ? stopES : stopEN;
  const kw = (phrase) => (phrase || "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, ""))
    .filter(w => w.length > 2 && !stop.has(w));
  const tags = [...new Set([...kw(n).slice(0, 2), ...kw(pr).slice(0, 2), ...kw(au).slice(0, 1)])].map(t => "#" + t);
  const ctx  = isES
    ? ["#negocio","#estrategia","#contenido","#marketingdigital","#emprendimiento","#marca","#viral","#fyp"]
    : ["#business","#marketing","#content","#growth","#entrepreneur","#brand","#viral","#fyp"];
  for (const t of ctx) { if (tags.length >= 7) break; if (!tags.includes(t)) tags.push(t); }
  return tags.slice(0, 7).join(" ");
}

// ── VYRON Transformation Engine V1 ───────────────────────────────────────────
// People don't buy the product — they buy the transformation.
// Detects the transformation archetype from niche + product and returns 7 dimensions:
// visibleProduct, hiddenDesire, emotionalTransformation, socialTransformation,
// practicalOutcome, fearAvoided, identityShift.
function buildTransformation(n, pr, isES) {
  const text = ((n || "") + " " + (pr || "")).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const isAppearance = /corte|peluquer|barber|estilis|cabello|pelo|hair|nail|u[ñn]as|makeup|maquill|estetica|spa|aesthetic|lash|pest[aá]n|cejas?|brow|look|imagen personal/.test(text);
  const isPhysical   = /gym|gimnasio|entrena|fitness|nutri|dieta|diet|ejercici|workout|train|weight|peso|musculo|muscle|cardio|hiit|crossfit|tonific/.test(text);
  const isHealth     = /dent|sonris|blanque|whitening|cl[íi]nic|salud|health|limpieza dental|medic|doctor|odonto|mental|terapia|therapy|quiropract/.test(text);
  const isExperience = /restaur|food|comida|chef|cater|event|experienc|baker|pasteler|coffee|caf[eé]|\bbar\b|cocina|brunch|sushi|pizz|helad/.test(text);
  const isBusiness   = /marketing|publicidad|\bads\b|redes sociales|social media|contenido digital|\bcontent\b|\bbrand\b|agencia|agency|\bseo\b|\bemail\b|digital|ventas|sales|\bcrm\b|ecommerce|tienda/.test(text);
  const isLegal      = /abogad|lawyer|legal|contable|contador|account|consultor|asesor|auditor|fiscal|seguro|insurance|notari/.test(text);
  const isEducation  = /curso|course|coach|mentor[íi]a|mentor|escuela|school|academia|workshop|taller|certific|aprender|learn|formaci/.test(text);
  const isProperty   = /inmobi|real estate|\bcasa\b|piso|apartamento|propert|arrendar|renta|alquiler/.test(text);

  if (isES) {
    if (isAppearance) return {
      visibleProduct:          pr || n,
      hiddenDesire:            "verse bien y causar una primera impresión que no pide disculpas",
      emotionalTransformation: "seguridad, orgullo propio y sensación de control sobre su imagen",
      socialTransformation:    "respeto inmediato, autoridad visual, ser recordado por cómo se presenta",
      practicalOutcome:        "apariencia mejorada, presencia más fuerte, imagen profesional",
      fearAvoided:             "verse descuidado o invisible — perder oportunidades por mala presentación",
      identityShift:           "alguien que cuida su imagen con intención — visible en cada contexto",
    };
    if (isPhysical) return {
      visibleProduct:          pr || n,
      hiddenDesire:            "disciplina real, un cuerpo diferente, energía constante y atractivo renovado",
      emotionalTransformation: "confianza, fuerza mental y la sensación de poder sobre sí mismo",
      socialTransformation:    "presencia física notable, reconocimiento por el cambio visible, atractivo renovado",
      practicalOutcome:        "composición corporal mejorada, energía sostenida, rendimiento físico superior",
      fearAvoided:             "verse igual en un año — desperdiciar el potencial físico que ya tienen",
      identityShift:           "alguien disciplinado — la versión física que siempre supieron que podían ser",
    };
    if (isHealth) return {
      visibleProduct:          pr || n,
      hiddenDesire:            "sonrisa segura, confianza social y sentirse saludable y atractivo",
      emotionalTransformation: "seguridad, ligereza y ganas de mostrarse sin pensarlo dos veces",
      socialTransformation:    "primera impresión limpia, accesibilidad, bienestar que se nota a simple vista",
      practicalOutcome:        "salud mejorada, apariencia cuidada y sensación de bienestar real",
      fearAvoided:             "vergüenza en situaciones sociales — una apariencia que apaga su presencia",
      identityShift:           "alguien que cuida su salud y lo demuestra — sin excusas ni postergaciones",
    };
    if (isExperience) return {
      visibleProduct:          pr || n,
      hiddenDesire:            "un momento memorable, conexión real y sabor que queda en la memoria",
      emotionalTransformation: "placer, bienestar y nostalgia positiva que quieren repetir",
      socialTransformation:    "compartir algo especial, impresionar a quien invitan, crear recuerdos juntos",
      practicalOutcome:        "experiencia superior, recuerdos creados, momento que realmente vale la pena",
      fearAvoided:             "gastar en algo olvidable — decepcionar a quien llevan consigo",
      identityShift:           "alguien que sabe elegir experiencias que realmente valen la pena",
    };
    if (isBusiness) return {
      visibleProduct:          pr || n,
      hiddenDesire:            "clientes que llegan solos, ventas predecibles y visibilidad que posiciona",
      emotionalTransformation: "confianza en su negocio, claridad y alivio de saber que el sistema funciona",
      socialTransformation:    "autoridad de marca, reconocimiento en su mercado, liderazgo percibido",
      practicalOutcome:        "más clientes, más ventas y alcance que crece con cada publicación",
      fearAvoided:             "quedar invisible mientras competidores capturan la atención que merecen ellos",
      identityShift:           "un negocio que atrae — que no persigue clientes, sino que los recibe",
    };
    if (isLegal) return {
      visibleProduct:          pr || n,
      hiddenDesire:            "protección real, paz mental y certeza de que lo construido no está en riesgo",
      emotionalTransformation: "tranquilidad, control y la sensación de tener las bases bien puestas",
      socialTransformation:    "credibilidad, seriedad percibida y confianza que proyectan ante otros",
      practicalOutcome:        "riesgo minimizado, procesos en orden y cumplimiento garantizado",
      fearAvoided:             "perder lo construido — multas, problemas legales o fiscales evitables",
      identityShift:           "alguien que opera con seriedad — cubierto, protegido, en orden",
    };
    if (isEducation) return {
      visibleProduct:          pr || n,
      hiddenDesire:            "habilidades reales, resultados medibles y la versión más capaz de sí mismos",
      emotionalTransformation: "confianza, claridad y orgullo de dominar algo que antes parecía lejano",
      socialTransformation:    "reconocimiento por su progreso y autoridad en lo que saben hacer",
      practicalOutcome:        "habilidades aplicables, avance real y certificación que los respalda",
      fearAvoided:             "invertir tiempo y dinero en formación que no cambia nada concreto",
      identityShift:           "alguien que invirtió en sí mismo — y tiene resultados para demostrarlo",
    };
    if (isProperty) return {
      visibleProduct:          pr || n,
      hiddenDesire:            "estabilidad, un lugar propio y la sensación de haber llegado a algo sólido",
      emotionalTransformation: "seguridad, orgullo y la tranquilidad de tener algo que les pertenece",
      socialTransformation:    "estatus, independencia y ser propietario de algo que otros respetan",
      practicalOutcome:        "propiedad propia, inversión sólida y espacio que refleja quiénes son",
      fearAvoided:             "seguir pagando renta sin construir nada — dinero que se va sin retorno",
      identityShift:           "alguien que tomó la decisión que la mayoría solo habla — y tiene el título para probarlo",
    };
    return {
      visibleProduct:          pr || n,
      hiddenDesire:            "resultados reales, claridad y la certeza de que su inversión vale",
      emotionalTransformation: "confianza, alivio y la sensación de avanzar en la dirección correcta",
      socialTransformation:    "reconocimiento, credibilidad y posicionamiento entre quienes los rodean",
      practicalOutcome:        "resultados visibles, progreso medible y retorno real sobre su tiempo",
      fearAvoided:             "invertir tiempo y dinero y quedar en el mismo lugar — sin avance visible",
      identityShift:           "alguien que tomó acción cuando importaba — y tiene el progreso para mostrarlo",
    };
  }

  // English
  if (isAppearance) return {
    visibleProduct:          pr || n,
    hiddenDesire:            "looking great and making a first impression that doesn't need to apologize",
    emotionalTransformation: "confidence, self-pride and control over how they present themselves",
    socialTransformation:    "immediate respect, visual authority, being remembered for how they show up",
    practicalOutcome:        "improved appearance, stronger presence, professional-looking image",
    fearAvoided:             "looking careless or forgettable — losing opportunities because of poor presentation",
    identityShift:           "someone who takes care of their image intentionally — visible in every room",
  };
  if (isPhysical) return {
    visibleProduct:          pr || n,
    hiddenDesire:            "real discipline, a different body, sustained energy and renewed attractiveness",
    emotionalTransformation: "confidence, mental strength and the feeling of power over themselves",
    socialTransformation:    "physical presence, recognition for visible change, renewed attractiveness",
    practicalOutcome:        "improved body composition, sustained energy, real physical performance",
    fearAvoided:             "looking the same in a year — wasting the physical potential they already have",
    identityShift:           "someone disciplined — the physical version of themselves they always knew they could be",
  };
  if (isHealth) return {
    visibleProduct:          pr || n,
    hiddenDesire:            "a confident smile, social ease and feeling healthy and attractive",
    emotionalTransformation: "confidence, lightness and showing up without thinking twice",
    socialTransformation:    "clean first impression, approachability, visible wellbeing",
    practicalOutcome:        "improved health, cared-for appearance and real sense of wellbeing",
    fearAvoided:             "social embarrassment — an appearance that dims their presence",
    identityShift:           "someone who takes care of their health and shows it — no excuses",
  };
  if (isExperience) return {
    visibleProduct:          pr || n,
    hiddenDesire:            "a memorable moment, real connection and flavors that stay with them",
    emotionalTransformation: "pleasure, comfort and positive nostalgia they want to repeat",
    socialTransformation:    "sharing something special, impressing those they invite, creating memories together",
    practicalOutcome:        "superior experience, memories created, moment that truly delivers",
    fearAvoided:             "spending on something forgettable — disappointing the people they bring",
    identityShift:           "someone who knows how to choose experiences that are genuinely worth it",
  };
  if (isBusiness) return {
    visibleProduct:          pr || n,
    hiddenDesire:            "clients who arrive on their own, predictable sales and visibility that positions",
    emotionalTransformation: "confidence in their business, clarity and the relief of knowing the system works",
    socialTransformation:    "brand authority, recognition in their market, perceived leadership",
    practicalOutcome:        "more clients, more sales and reach that grows with every post",
    fearAvoided:             "staying invisible while competitors capture the attention that should be theirs",
    identityShift:           "a business that attracts — that doesn't chase clients, but receives them",
  };
  if (isLegal) return {
    visibleProduct:          pr || n,
    hiddenDesire:            "real protection, peace of mind and certainty that what they've built is secure",
    emotionalTransformation: "calm, control and the feeling of having solid foundations",
    socialTransformation:    "credibility, perceived seriousness and trust they project to others",
    practicalOutcome:        "risk minimized, processes in order and compliance guaranteed",
    fearAvoided:             "losing what they've built — fines, legal or tax issues they could have prevented",
    identityShift:           "someone who operates seriously — covered, protected, in order",
  };
  if (isEducation) return {
    visibleProduct:          pr || n,
    hiddenDesire:            "real skills, measurable results and the most capable version of themselves",
    emotionalTransformation: "confidence, clarity and pride in mastering something that once felt out of reach",
    socialTransformation:    "recognition for their progress and authority in what they know how to do",
    practicalOutcome:        "applicable skills, real advancement and credentials that back them up",
    fearAvoided:             "investing time and money in training that changes nothing",
    identityShift:           "someone who invested in themselves — and has results to prove it",
  };
  return {
    visibleProduct:          pr || n,
    hiddenDesire:            "real results, clarity and certainty that their investment delivers",
    emotionalTransformation: "confidence, relief and the feeling of moving in the right direction",
    socialTransformation:    "recognition, credibility and positioning among those around them",
    practicalOutcome:        "visible results, measurable progress and real return on their time",
    fearAvoided:             "investing time and money and ending up in the same place — no visible progress",
    identityShift:           "someone who took action when it mattered — and has the progress to show for it",
  };
}

// ── Business Stage Intelligence V1 ───────────────────────────────────────────
// Returns stage-specific psychology, vocabulary, script context, CTAs, content
// topics, and strategy notes. Produces clearly differentiated output per stage.
function buildStageIntelligence(stage, n, pr, au, isES) {
  const s = (stage || "Microempresa").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const isPrincipiante = /principiante|beginner|starter/.test(s);
  const isPequena      = /peque[ñn]|small/.test(s);
  const isMediana      = /mediana|medium/.test(s);
  const isGrande       = /grande|large|corp|enterprise/.test(s);

  if (isES) {
    if (isPrincipiante) return {
      label:      "Principiante",
      vocabulary: ["primeros clientes","claridad","empezar","confianza inicial","acción simple","primer resultado","primer paso"],
      scriptContext: `\nSi estás empezando en ${n}: el primer resultado real, conseguido con un paso simple y claro, vale más que semanas de preparación. ${pr || n} está diseñado para quien empieza — sin prerequisitos, sin teoría innecesaria. Solo el primer paso, ejecutable hoy, para conseguir tus primeros clientes con confianza inicial real.`,
      sarResolve:   `${pr || n} está diseñado para quien está empezando en ${n}. No necesitas experiencia previa. Solo el primer paso — este es.`,
      painContext:  `Para quien empieza en ${n}, la mayor fricción no es la habilidad — es la falta de claridad sobre el primer paso y cómo conseguir los primeros clientes.`,
      ctaPool: [
        `Comenta "INICIO" y te mando la guía de primer paso — gratis.`,
        `Da tu primer paso hoy. ${pr || n} — enlace en bio.`,
        `¿Empezando en ${n}? Comenta "GUÍA" y te muestro por dónde empezar.`,
        `Empieza con esto hoy. Enlace en bio para tus primeros clientes.`,
      ],
      plannerTopics: [
        `Cómo conseguir tus primeros clientes en ${n} desde cero`,
        `El primer paso en ${n} que nadie te dice`,
        `Empezando en ${n}: lo que de verdad necesitas (y lo que no)`,
        `Mi primer resultado en ${n} — y cómo repetirlo`,
        `La guía más simple para empezar en ${n} hoy`,
      ],
      strategyFocus: `Estrategia para Principiante: enfoque total en claridad y primeros resultados. Cada post debe reducir la barrera de entrada — lenguaje simple, primer paso concreto, resultado alcanzable sin experiencia previa. El objetivo no es construir autoridad todavía, sino generar confianza inicial y los primeros clientes con acción simple y directa.`,
      weeklyNote: `[Principiante] Lenguaje simple, primer paso claro, resultado alcanzable hoy sin experiencia previa.`,
    };

    if (isPequena) return {
      label:      "Pequeña empresa",
      vocabulary: ["sistema","calendario de contenido","reputación","posicionamiento","captación de leads","proceso repetible","diferenciación"],
      scriptContext: `\nSi ya tienes operación en ${n} pero los resultados son inconsistentes: el problema no es esfuerzo — es la falta de un sistema. ${pr || n} construye el proceso repetible que hace tu ${n} predecible: calendario de contenido, captación de leads, reputación que se construye sola. No más esfuerzo heroico — un sistema de posicionamiento y diferenciación que trabaja para ti consistentemente.`,
      sarResolve:   `${pr || n} convierte tu operación de ${n} en un sistema consistente: calendario, posicionamiento y captación de leads que funciona sin depender de ti todo el tiempo.`,
      painContext:  `Para pequeñas empresas en ${n}, el problema no es esfuerzo — es la falta de un sistema repetible que haga consistente lo que ya funciona a veces y los posicione como la referencia.`,
      ctaPool: [
        `Comenta "SISTEMA" y te envío la estructura de proceso repetible.`,
        `Convierte tu ${n} en un sistema consistente. Enlace en bio.`,
        `¿Operación en ${n} pero resultados inconsistentes? Comenta "CONSISTENCIA".`,
        `${pr || n} — el sistema que hace funcionar tu ${n} predeciblemente. Enlace en bio.`,
      ],
      plannerTopics: [
        `El sistema que hace funcionar tu ${n} sin esfuerzo heroico`,
        `Cómo construir un calendario de contenido que posiciona tu ${n}`,
        `De cliente casual a cliente recurrente en ${n}: el proceso`,
        `Reputación en ${n}: cómo construirla sistemáticamente`,
        `La diferencia entre un ${n} que depende de ti y uno que trabaja solo`,
      ],
      strategyFocus: `Estrategia para Pequeña empresa: sistemas y posicionamiento. El contenido debe demostrar proceso, consistencia y diferenciación — cómo el ${n} funciona de forma repetible, no solo resultados aislados. El objetivo es ser la referencia local: no el más barato, sino el más confiable y reconocible con un sistema claro de captación de leads.`,
      weeklyNote: `[Pequeña empresa] Muestra proceso o consistencia — cómo tu ${n} funciona sistemáticamente, no solo un resultado aislado.`,
    };

    if (isMediana) return {
      label:      "Mediana empresa",
      vocabulary: ["equipo","métricas","seguimiento","CRM","automatización","conversión","proceso de ventas","optimización operacional"],
      scriptContext: `\nSi tienes equipo en ${n} pero los números de conversión no reflejan la actividad: el problema está en el proceso de seguimiento y el CRM, no en el esfuerzo del equipo. ${pr || n} optimiza ese proceso — métricas claras, automatización que elimina pasos manuales, seguimiento que recupera oportunidades antes de perderlas. El resultado: el mismo equipo, mejor conversión, proceso de ventas que escala.`,
      sarResolve:   `${pr || n} optimiza el proceso de conversión en ${n}: CRM, seguimiento automatizado y métricas que muestran exactamente dónde se pierden las oportunidades.`,
      painContext:  `Para medianas empresas en ${n}, el problema suele estar en el seguimiento y la conversión — la actividad existe pero el CRM y la automatización no están optimizados para capturar todo el potencial.`,
      ctaPool: [
        `Audita tu proceso de ${n} antes de invertir más. Comenta "DIAGNÓSTICO".`,
        `Comenta "DIAGNÓSTICO" y revisamos dónde se pierden oportunidades en tu ${n}.`,
        `¿Tu equipo en ${n} tiene actividad pero baja conversión? Comenta "OPTIMIZAR".`,
        `${pr || n} optimiza la conversión en ${n}. Enlace en bio para el análisis.`,
      ],
      plannerTopics: [
        `El CRM que tu equipo de ${n} necesita (y cómo implementarlo sin resistencia)`,
        `Por qué tu equipo de ${n} trabaja mucho pero convierte poco`,
        `Automatización en ${n}: qué delegar primero para mejorar conversión`,
        `Las métricas de ${n} que realmente predicen el resultado del mes`,
        `Seguimiento en ${n}: el proceso que recupera el 30% de las oportunidades perdidas`,
      ],
      strategyFocus: `Estrategia para Mediana empresa: optimización operacional. El contenido debe demostrar conocimiento de proceso, métricas y conversión — no cómo empezar, sino cómo mejorar lo que ya existe. Métricas, CRM, automatización de seguimiento. El objetivo es posicionarse como el referente estratégico para equipos de ${n} que quieren mejorar sus números de conversión.`,
      weeklyNote: `[Mediana empresa] Habla de proceso, métricas o conversión — no de empezar, sino de optimizar lo que ya existe con CRM y automatización.`,
    };

    if (isGrande) return {
      label:      "Empresa grande",
      vocabulary: ["escalabilidad","departamentos","dashboards","campañas multicanal","consistencia de marca","rentabilidad","liderazgo ejecutivo","estrategia sistémica"],
      scriptContext: `\nPara empresas grandes en ${n}: el desafío no es ejecutar — es escalar la ejecución sin que la consistencia de marca y la rentabilidad se diluyan entre departamentos. ${pr || n} construye la infraestructura que hace posible esa escala — dashboards ejecutivos, estrategia multicanal coordinada y sistemas que permiten al liderazgo mantener visibilidad sin microgestionar. Escalabilidad real, control operativo, campañas que funcionan en todos los canales.`,
      sarResolve:   `${pr || n} construye la infraestructura de ${n} para escala: dashboards, consistencia entre departamentos y estrategia multicanal que el liderazgo ejecutivo puede supervisar sin microgestionar.`,
      painContext:  `Para empresas grandes en ${n}, el riesgo no es no crecer — es crecer de forma inconsistente entre departamentos y perder rentabilidad y consistencia de marca en la escala.`,
      ctaPool: [
        `Escala tu ${n} sin perder control operativo. Enlace en bio para auditoría ejecutiva.`,
        `Solicita una auditoría ejecutiva del sistema de ${n}. Enlace en bio.`,
        `Comenta "ESCALA" y te enviamos el diagnóstico de consistencia de marca para equipos grandes.`,
        `${pr || n} para ${n} que ya escalan y necesitan consistencia entre departamentos. Enlace en bio.`,
      ],
      plannerTopics: [
        `Dashboard de ${n}: las métricas ejecutivas que realmente importan`,
        `Consistencia de marca en ${n} a escala entre departamentos`,
        `Cómo coordinar campañas multicanal de ${n} sin perder coherencia`,
        `El modelo de liderazgo en ${n} que escala sin microgestión`,
        `Rentabilidad en ${n} a escala: dónde se pierde el margen y cómo recuperarlo`,
      ],
      strategyFocus: `Estrategia para Empresa grande: escalabilidad y liderazgo ejecutivo. El contenido debe hablar el lenguaje de dirección: escalabilidad, ROI, consistencia entre departamentos, campañas multicanal coordinadas. No cómo empezar — cómo escalar sin perder rentabilidad ni control operativo. Dashboards y sistemas que funcionan a nivel corporativo.`,
      weeklyNote: `[Empresa grande] Lenguaje ejecutivo — escalabilidad, departamentos, dashboards, consistencia de marca. Estrategia sistémica, no táctica individual.`,
    };

    // Default: Microempresa
    return {
      label:      "Microempresa",
      vocabulary: ["ventas locales","WhatsApp","clientes recurrentes","bajo presupuesto","visibilidad diaria","recomendación","cliente de la semana"],
      scriptContext: `\nSi tienes una microempresa en ${n}: la realidad es directa — necesitas clientes esta semana, no en seis meses. ${pr || n} está construido para eso — visibilidad local, WhatsApp que convierte, clientes recurrentes que vuelven sin que tengas que perseguirlos. Sin grandes presupuestos, sin estrategias complicadas. Solo lo que funciona con bajo presupuesto para una microempresa real que necesita ventas locales hoy.`,
      sarResolve:   `${pr || n} está construido para microempresas en ${n}: más clientes esta semana, bajo presupuesto, usando WhatsApp, referidos y visibilidad local diaria.`,
      painContext:  `Para microempresas en ${n}, el tiempo y el presupuesto son limitados — lo que funciona tiene que dar ventas locales esta semana con bajo presupuesto y sin infraestructura compleja.`,
      ctaPool: [
        `Escríbeme por WhatsApp y te muestro cómo atraer más clientes de ${n} esta semana.`,
        `Comenta "CLIENTES" y te mando el plan simple para tu microempresa de ${n}.`,
        `${pr || n} — más clientes locales esta semana. Enlace en bio.`,
        `¿Microempresa de ${n} con bajo presupuesto? Esto es para ti. Enlace en bio.`,
      ],
      plannerTopics: [
        `Cómo conseguir más clientes de ${n} esta semana sin gastar en publicidad`,
        `WhatsApp para ${n}: el mensaje que convierte clientes locales`,
        `Cómo hacer que tus clientes de ${n} vuelvan y te recomienden`,
        `Visibilidad local en ${n} con bajo presupuesto`,
        `El plan de ${n} para microempresas que necesitan resultados esta semana`,
      ],
      strategyFocus: `Estrategia para Microempresa: resultados rápidos y locales. WhatsApp, referidos, reactivación de clientes pasados, visibilidad diaria con bajo presupuesto. Cada post debe ser práctico y ejecutable el mismo día — nada teórico, nada que requiera inversión significativa. El objetivo es ventas locales esta semana, no posicionamiento a largo plazo todavía.`,
      weeklyNote: `[Microempresa] Práctico y ejecutable hoy — ventas locales, WhatsApp o clientes recurrentes. Sin teoría, sin presupuesto grande.`,
    };
  }

  // ── English ────────────────────────────────────────────────────────────────
  if (isPrincipiante) return {
    label:      "Beginner",
    vocabulary: ["first clients","clarity","getting started","initial confidence","simple action","first step","first result"],
    scriptContext: `\nIf you're starting out in ${n}: one real result, achieved with a clear simple step, is worth more than weeks of preparation. ${pr || n} is designed for beginners — no prerequisites, no unnecessary theory. Just the first step, executable today, to land your first clients with real initial confidence.`,
    sarResolve:   `${pr || n} is designed for people starting in ${n}. No prior experience needed. Just the first step — and this is it.`,
    painContext:  `For those starting in ${n}, the biggest friction isn't skill — it's lack of clarity on the first step and how to get the first clients.`,
    ctaPool: [
      `Comment "START" and I'll send you the beginner's first-step guide — free.`,
      `Take your first step today. ${pr || n} — link in bio.`,
      `Just starting in ${n}? Comment "GUIDE" and I'll show you where to begin.`,
      `Start with this today. Link in bio for your first clients.`,
    ],
    plannerTopics: [
      `How to get your first ${n} clients from scratch`,
      `The first step in ${n} nobody tells you`,
      `Starting ${n}: what you actually need (and what you don't)`,
      `My first result in ${n} — and how to repeat it`,
      `The simplest guide to start ${n} today`,
    ],
    strategyFocus: `Beginner strategy: complete focus on clarity and first results. Every post should lower the barrier to entry — simple language, concrete first step, result achievable without prior experience. The goal isn't authority yet, it's building initial confidence and landing the first clients with simple, direct action.`,
    weeklyNote: `[Beginner] Simple language, clear first step, result achievable today without prior experience.`,
  };

  if (isPequena) return {
    label:      "Small Business",
    vocabulary: ["system","content calendar","reputation","positioning","lead capture","repeatable process","differentiation"],
    scriptContext: `\nIf you have an existing ${n} operation but results are inconsistent: the problem isn't effort — it's the lack of a system. ${pr || n} builds the repeatable process that makes your ${n} predictable: content calendar, lead capture, reputation that builds itself. Not more heroic effort — a positioning and differentiation system that works for you consistently.`,
    sarResolve:   `${pr || n} turns your ${n} operation into a consistent system: calendar, positioning, and lead capture that doesn't depend entirely on you.`,
    painContext:  `For small businesses in ${n}, the problem isn't effort — it's the lack of a repeatable system that makes consistent what already works sometimes.`,
    ctaPool: [
      `Comment "SYSTEM" and I'll send you the repeatable process structure.`,
      `Turn your ${n} into a consistent system — link in bio.`,
      `Got a ${n} operation but inconsistent results? Comment "CONSISTENT".`,
      `${pr || n} — the system that makes your ${n} work predictably. Link in bio.`,
    ],
    plannerTopics: [
      `The system that makes your ${n} work without heroic effort`,
      `How to build a content calendar that positions your ${n}`,
      `From one-time to repeat client in ${n}: the process`,
      `Reputation in ${n}: how to build it systematically`,
      `The difference between a ${n} that depends on you and one that runs itself`,
    ],
    strategyFocus: `Small business strategy: systems and positioning. Content should demonstrate process, consistency, and differentiation — how the ${n} works repeatably, not just isolated results. The goal is to be the local reference: not the cheapest, but the most reliable and recognizable, with a clear lead capture system.`,
    weeklyNote: `[Small Business] Show process or consistency — how your ${n} works systematically, not just an isolated result.`,
  };

  if (isMediana) return {
    label:      "Medium Business",
    vocabulary: ["team","metrics","follow-up","CRM","automation","conversion","sales process","operational optimization"],
    scriptContext: `\nIf you have a team in ${n} but conversion numbers don't reflect the activity: the problem is in the follow-up process and CRM, not the team's effort. ${pr || n} optimizes that process — clear metrics, automation that eliminates manual steps, follow-up that recovers opportunities before they're lost. Result: the same team, better conversion, a sales process that scales.`,
    sarResolve:   `${pr || n} optimizes the conversion process in ${n}: CRM, automated follow-up, and metrics that show exactly where opportunities are being lost.`,
    painContext:  `For medium businesses in ${n}, the problem is usually follow-up and conversion — the activity is there but CRM and automation aren't optimized to capture the full potential.`,
    ctaPool: [
      `Audit your ${n} process before investing more. Comment "DIAGNOSIS".`,
      `Comment "DIAGNOSIS" and let's find where your ${n} process loses opportunities.`,
      `${n} team with activity but low conversion? Comment "OPTIMIZE".`,
      `${pr || n} optimizes ${n} conversion. Link in bio for the process audit.`,
    ],
    plannerTopics: [
      `The CRM your ${n} team needs (and how to implement it without resistance)`,
      `Why your ${n} team works hard but converts little`,
      `Automation in ${n}: what to delegate first to improve conversion`,
      `The ${n} metrics that actually predict this month's result`,
      `Follow-up in ${n}: the process that recovers 30% of lost opportunities`,
    ],
    strategyFocus: `Medium business strategy: operational optimization. Content should demonstrate process, metrics, and conversion knowledge — not how to start, but how to improve what already exists. CRM, automation, follow-up optimization. The goal is to be the strategic reference for ${n} teams that are already operating and want better conversion numbers.`,
    weeklyNote: `[Medium Business] Talk about process, metrics, or conversion — not how to start, but how to optimize what exists with CRM and automation.`,
  };

  if (isGrande) return {
    label:      "Large Enterprise",
    vocabulary: ["scalability","departments","dashboards","multi-channel campaigns","brand consistency","profitability","executive leadership","systemic strategy"],
    scriptContext: `\nFor large enterprises in ${n}: the challenge isn't execution — it's scaling execution without brand consistency and profitability diluting across departments. ${pr || n} builds the infrastructure for that scale — executive dashboards, coordinated multi-channel campaigns, and systems that let leadership maintain visibility without micromanaging. Real scalability, operational control, campaigns that work across all channels.`,
    sarResolve:   `${pr || n} builds the ${n} infrastructure for scale: dashboards, cross-department consistency, and multi-channel strategy that executive leadership can oversee without micromanaging.`,
    painContext:  `For large enterprises in ${n}, the risk isn't not growing — it's growing inconsistently across departments and losing brand consistency and profitability at scale.`,
    ctaPool: [
      `Scale your ${n} without losing operational control. Link in bio for executive audit.`,
      `Request an executive system audit for ${n}. Link in bio.`,
      `Comment "SCALE" and we'll send the brand consistency diagnostic for large teams.`,
      `${pr || n} for ${n} organizations scaling and needing cross-department consistency. Link in bio.`,
    ],
    plannerTopics: [
      `${n} executive dashboard: the metrics that actually matter`,
      `Brand consistency in ${n} at scale across departments`,
      `How to coordinate multi-channel ${n} campaigns without losing coherence`,
      `The ${n} leadership model that scales without micromanagement`,
      `Profitability in ${n} at scale: where margin is lost and how to recover it`,
    ],
    strategyFocus: `Large enterprise strategy: scalability and executive leadership. Content should speak executive language: scalability, ROI, cross-department consistency, coordinated multi-channel campaigns. Not how to start — how to scale without losing profitability or operational control. Dashboards and systems that work at corporate level.`,
    weeklyNote: `[Large Enterprise] Executive language — scalability, departments, dashboards, brand consistency. Systemic strategy, not individual tactics.`,
  };

  // Default: Micro Business
  return {
    label:      "Micro Business",
    vocabulary: ["local sales","WhatsApp","repeat clients","low budget","daily visibility","referrals","weekly client"],
    scriptContext: `\nIf you run a micro business in ${n}: you need clients this week, not in six months. ${pr || n} is built for that — local visibility, WhatsApp that converts, repeat clients that come back without you chasing them. No big budgets, no complicated strategies. Just what works on a low budget for a real micro business that needs local sales now.`,
    sarResolve:   `${pr || n} is built for micro businesses in ${n}: more clients this week, low budget, using WhatsApp, referrals, and daily local visibility.`,
    painContext:  `For micro businesses in ${n}, time and budget are limited — what works has to deliver local sales this week without significant investment.`,
    ctaPool: [
      `DM me and I'll show you how to attract more ${n} clients this week.`,
      `Comment "CLIENTS" and I'll send you the simple plan for your ${n} micro business.`,
      `${pr || n} — more local clients this week. Link in bio.`,
      `Running a ${n} micro business on a tight budget? This is for you. Link in bio.`,
    ],
    plannerTopics: [
      `How to get more ${n} clients this week without spending on ads`,
      `WhatsApp for ${n}: the message that converts local clients`,
      `How to make your ${n} clients come back and refer you`,
      `Local ${n} visibility on a low budget`,
      `The ${n} plan for micro businesses that need results this week`,
    ],
    strategyFocus: `Micro business strategy: fast, local results. WhatsApp, referrals, reactivating past clients, daily visibility on a low budget. Every post should be practical and executable the same day — nothing theoretical, nothing requiring significant budget. The goal is local sales this week, not long-term positioning yet.`,
    weeklyNote: `[Micro Business] Practical and executable today — local sales, WhatsApp, or repeat clients. No theory, no big budget required.`,
  };
}

// ── Business Stage Planner Intelligence ──────────────────────────────────────
// Per-hookType topic maps, stage objectives, and angle tag for Content Planner.
// Called alongside buildStageIntelligence — keeps each function focused.
function buildStagePlannerData(stage, n, pr, au, isES) {
  const s = (stage || "Microempresa").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const isPrincipiante = /principiante|beginner|starter/.test(s);
  const isPequena      = /peque[ñn]|small/.test(s);
  const isMediana      = /mediana|medium/.test(s);
  const isGrande       = /grande|large|corp|enterprise/.test(s);

  if (isES) {
    if (isPrincipiante) return {
      angle: "Primer cliente · Claridad · Confianza inicial",
      objectivePool: [
        "Generar confianza inicial con primeros clientes",
        "Reducir barrera de entrada al primer resultado",
        "Construir claridad sobre el primer paso concreto",
        "Conseguir el primer cliente con acción simple hoy",
      ],
      topicMap: {
        curiosity: [
          `Por qué conseguir el primer cliente de ${n} es más simple de lo que parece`,
          `El paso que nadie explica al empezar en ${n} desde cero`,
          `Lo que de verdad necesitas para empezar en ${n} (no es lo que supones)`,
          `El secreto de claridad para empezar hoy en ${n} sin experiencia`,
        ],
        pain: [
          `Por qué todavía no tienes tu primer cliente de ${n} — y el arreglo simple`,
          `El bloqueo de claridad que paraliza a quienes empiezan en ${n}`,
          `¿Sin clientes todavía? La causa más común al empezar en ${n}`,
          `La razón por la que empezar en ${n} parece difícil cuando en realidad no lo es`,
        ],
        story: [
          `Cómo conseguí mis primeros clientes de ${n} sin experiencia previa`,
          `De cero a primeros clientes en ${n}: lo que realmente funcionó`,
          `Mi primer error al empezar en ${n} — y lo que aprendí sobre claridad`,
          `El primer resultado de ${n} que me dio la confianza inicial para continuar`,
        ],
        authority: [
          `La guía más simple para empezar en ${n} y conseguir los primeros clientes`,
          `Lo que hacen los que consiguen su primer cliente de ${n} rápido`,
          `El proceso de primer cliente de ${n} que funciona desde el día uno`,
          `Cómo construir confianza inicial con los primeros clientes de ${n}`,
        ],
        mistake: [
          `El error #1 de los que empiezan en ${n} y no consiguen su primer cliente`,
          `Esto que hacen los principiantes en ${n} sabotea la confianza inicial`,
          `La decisión más común al empezar en ${n} que retrasa el primer resultado`,
          `Deja de hacer esto si estás empezando en ${n} — te está costando claridad`,
        ],
        opportunity: [
          `La ventana para conseguir tu primer cliente de ${n} está abierta ahora`,
          `Por qué ahora es el mejor momento para empezar en ${n} con claridad`,
          `El ángulo de ${n} para primeros clientes que tu competencia no está usando`,
          `La oportunidad de primer resultado en ${n} que los que empiezan no ven todavía`,
        ],
        viral: [
          `El primer paso en ${n} que todos los principiantes están empezando a usar`,
          `Por qué empezar en ${n} con este enfoque cambia los primeros resultados`,
          `Todos hablan de cómo empezar en ${n} — aquí está lo que realmente da primeros clientes`,
          `El cambio de mentalidad para empezar en ${n} que más claridad está dando ahora`,
        ],
      },
    };

    if (isPequena) return {
      angle: "Sistema · Posicionamiento · Proceso repetible",
      objectivePool: [
        "Posicionar la marca en el nicho local",
        "Construir captación de leads sistemática",
        "Establecer proceso de contenido repetible",
        "Reforzar reputación y diferenciación en el mercado",
      ],
      topicMap: {
        curiosity: [
          `El sistema de contenido que posiciona tu ${n} sin esfuerzo heroico`,
          `Lo que separa un ${n} con reputación sólida de uno que no consigue leads`,
          `Por qué tu ${n} necesita un proceso de captación, no más posts sueltos`,
          `El calendario de contenido de ${n} que captura prospectos cada semana`,
        ],
        pain: [
          `Por qué tu ${n} tiene visibilidad pero sin captación de leads real`,
          `La razón por la que tu ${n} funciona a veces pero no de forma consistente`,
          `El problema de posicionamiento que tienen los ${n} con potencial pero sin sistema`,
          `¿Reputación de ${n} inconsistente? Aquí está el sistema que lo corrige`,
        ],
        story: [
          `Cómo construí un sistema de contenido que posiciona mi ${n} consistentemente`,
          `El calendario de ${n} que convirtió mi operación en un proceso repetible`,
          `Cómo pasé de resultados aleatorios a captación de leads sistemática en ${n}`,
          `Lo que cambié en mi ${n} para tener reputación sin depender de mí todo el tiempo`,
        ],
        authority: [
          `El sistema de contenido de ${n} que funciona sin depender de ti`,
          `Cómo diseñar un proceso repetible de captación para tu ${n}`,
          `Lo que hacen los ${n} que tienen reputación sólida y leads constantes`,
          `El calendario de posicionamiento de ${n} que funciona 7 días a la semana`,
        ],
        mistake: [
          `El error de contenido que tienen los ${n} sin sistema de captación de leads`,
          `Por qué tu ${n} no tiene leads consistentes aunque generas buen contenido`,
          `La razón por la que tu ${n} no tiene reputación local sólida todavía`,
          `Deja de publicar sin calendario — está saboteando el posicionamiento de tu ${n}`,
        ],
        opportunity: [
          `La ventana de posicionamiento en ${n} que las pequeñas empresas no están usando`,
          `Por qué ahora es el momento de construir el sistema de captación de tu ${n}`,
          `El ángulo de diferenciación en ${n} que tu competencia no está usando todavía`,
          `La oportunidad de reputación en ${n} para pequeñas empresas que nadie está aprovechando`,
        ],
        viral: [
          `El sistema de ${n} que todas las pequeñas empresas están empezando a copiar`,
          `Por qué los ${n} con sistema de contenido tienen más leads que los que publican más`,
          `Todos hablan de contenido para ${n} — esto es lo que realmente construye reputación`,
          `El cambio de ${n} de resultados aleatorios a proceso repetible que todos deberían conocer`,
        ],
      },
    };

    if (isMediana) return {
      angle: "Conversión · CRM · Optimización de equipo",
      objectivePool: [
        "Optimizar conversión del equipo de ventas",
        "Mejorar seguimiento y CRM del proceso",
        "Identificar cuellos de botella en la conversión",
        "Automatizar pasos manuales que bloquean ventas",
      ],
      topicMap: {
        curiosity: [
          `Lo que el CRM de tu ${n} te está diciendo que no estás leyendo`,
          `Por qué tu equipo de ${n} tiene actividad pero baja conversión real`,
          `El dato de ${n} que revela dónde se pierden las oportunidades antes de verlo`,
          `Lo que separa el proceso de ventas de ${n} que convierte del que no`,
        ],
        pain: [
          `Por qué tu equipo de ${n} trabaja más pero convierte igual o menos`,
          `La razón por la que tu ${n} pierde oportunidades en el seguimiento`,
          `¿CRM de ${n} que no da datos útiles? Aquí está el problema real`,
          `El cuello de botella de conversión que tiene todo ${n} con equipo`,
        ],
        story: [
          `Cómo optimizamos el seguimiento de nuestra ${n} y la conversión subió significativamente`,
          `Lo que implementamos en el CRM de la ${n} que cambió los números del mes`,
          `Cómo automatizamos el seguimiento en ${n} y el equipo convirtió más sin más esfuerzo`,
          `El diagnóstico de conversión de ${n} que encontró dónde se perdía el 30% de las oportunidades`,
        ],
        authority: [
          `El proceso de CRM para ${n} con equipo que mejora conversión sin más esfuerzo`,
          `Cómo diseñar un sistema de seguimiento en ${n} que recupera oportunidades perdidas`,
          `Las métricas de ${n} que realmente predicen el resultado de conversión del mes`,
          `El flujo de automatización en ${n} que elimina los pasos manuales que bloquean ventas`,
        ],
        mistake: [
          `El error de CRM que cometen los ${n} con equipo y pierden conversión`,
          `Por qué tu equipo de ${n} no está haciendo el seguimiento en el momento correcto`,
          `La automatización que falta en tu proceso de ${n} está costando clientes cada semana`,
          `Deja de medir esto en tu ${n} — no predice conversión real del equipo`,
        ],
        opportunity: [
          `La automatización de ${n} que tu equipo puede implementar esta semana para mejorar conversión`,
          `Por qué ahora es el momento de auditar el proceso de seguimiento de tu ${n}`,
          `El ángulo de CRM en ${n} que tu competencia con equipo no está optimizando todavía`,
          `La ventana de optimización de conversión en ${n} que se cierra con cada semana que pasa`,
        ],
        viral: [
          `El proceso de ${n} que está cambiando cómo los equipos gestionan la conversión`,
          `Por qué los ${n} con equipos optimizados están convirtiendo más con el mismo esfuerzo`,
          `Todos hablan de CRM para ${n} — esto es lo que realmente mueve la conversión`,
          `El cambio de automatización en ${n} que mejoró los números de conversión del mes`,
        ],
      },
    };

    if (isGrande) return {
      angle: "Escala · Consistencia de marca · Liderazgo ejecutivo",
      objectivePool: [
        "Escalar con consistencia de marca entre departamentos",
        "Optimizar rentabilidad a escala operativa",
        "Mejorar coordinación de campañas multicanal",
        "Informar decisiones ejecutivas con métricas claras",
      ],
      topicMap: {
        curiosity: [
          `El dashboard ejecutivo de ${n} que revela dónde se pierde rentabilidad a escala`,
          `Lo que la consistencia de marca en ${n} entre departamentos realmente requiere`,
          `Por qué las campañas multicanal de ${n} pierden efectividad sin este sistema`,
          `El dato ejecutivo de ${n} que el liderazgo no está leyendo y cuesta margen`,
        ],
        pain: [
          `Por qué tu operación de ${n} crece pero la rentabilidad no escala igual`,
          `La razón por la que la consistencia de marca de ${n} se diluye entre departamentos`,
          `¿Campañas de ${n} sin coherencia entre canales? Aquí está la causa sistémica`,
          `El problema de escalabilidad que tienen los ${n} grandes con múltiples equipos`,
        ],
        story: [
          `Cómo rediseñamos el sistema de ${n} para escalar sin perder consistencia de marca`,
          `Lo que implementamos en el dashboard de ${n} que cambió las decisiones del equipo directivo`,
          `Cómo coordinamos las campañas de ${n} entre departamentos sin perder coherencia de marca`,
          `El diagnóstico ejecutivo de ${n} que reveló dónde se perdía rentabilidad a escala`,
        ],
        authority: [
          `El sistema de dashboard ejecutivo para ${n} que ya escalan con múltiples departamentos`,
          `Cómo diseñar la consistencia de marca de ${n} entre departamentos a escala`,
          `Las métricas ejecutivas de ${n} que realmente informan decisiones de liderazgo`,
          `El modelo de campañas multicanal de ${n} que mantiene coherencia a escala corporativa`,
        ],
        mistake: [
          `El error de escalabilidad que cometen los ${n} grandes y pierden rentabilidad`,
          `Por qué tu ${n} pierde consistencia de marca entre departamentos al escalar`,
          `La brecha de coordinación entre campañas de ${n} que cuesta margen cada mes`,
          `Deja de medir esto en tu ${n} a nivel ejecutivo — no informa decisiones reales`,
        ],
        opportunity: [
          `La ventana de optimización de rentabilidad en ${n} a escala que el liderazgo no está usando`,
          `Por qué ahora es el momento de auditar la consistencia de marca de tu ${n} entre departamentos`,
          `El sistema de dashboard de ${n} que tu competencia corporativa no ha implementado todavía`,
          `La oportunidad de eficiencia operativa en ${n} a escala que nadie está capitalizando`,
        ],
        viral: [
          `El modelo de ${n} corporativo que está cambiando cómo los ejecutivos gestionan la escala`,
          `Por qué los ${n} que escalan sin perder rentabilidad tienen este sistema en común`,
          `Todos hablan de escalabilidad en ${n} — esto es lo que realmente mantiene consistencia de marca`,
          `El cambio de liderazgo en ${n} que mejoró coherencia entre departamentos está redefiniendo la escala`,
        ],
      },
    };

    // Default: Microempresa ES
    return {
      angle: "Ventas locales · WhatsApp · Clientes esta semana",
      objectivePool: [
        "Conseguir clientes locales esta semana",
        "Activar WhatsApp como canal de ventas directas",
        "Convertir clientes puntuales en recurrentes",
        "Aumentar visibilidad local diaria con bajo presupuesto",
      ],
      topicMap: {
        curiosity: [
          `El canal que más clientes locales da a microempresas de ${n} por semana`,
          `Por qué WhatsApp convierte más que Instagram para tu ${n} local`,
          `Lo que tu competencia en ${n} no sabe sobre visibilidad local diaria`,
          `El secreto de los clientes recurrentes en ${n} que nadie explica`,
        ],
        pain: [
          `Por qué tu ${n} local tiene poco tráfico aunque haces las cosas bien`,
          `La razón por la que tus clientes de ${n} no vuelven sin que los persigas`,
          `¿Sin clientes esta semana? Lo que le pasa a la mayoría de ${n} locales`,
          `El problema de visibilidad diaria que bloquea a toda microempresa de ${n}`,
        ],
        story: [
          `Cómo conseguí más clientes de ${n} esta semana usando solo WhatsApp`,
          `Lo que cambié en mi ${n} para tener clientes recurrentes sin perseguirlos`,
          `El mensaje que me trajo nuevos clientes locales a mi ${n} esta semana`,
          `Cómo hice que mi ${n} local fuera la opción visible en el barrio`,
        ],
        authority: [
          `El sistema de WhatsApp para microempresas de ${n} que da clientes esta semana`,
          `Cómo construir visibilidad local en ${n} con bajo presupuesto diario`,
          `Lo que hacen los ${n} locales que siempre tienen clientes recurrentes`,
          `La estrategia de referidos de ${n} que funciona sin gastar en publicidad`,
        ],
        mistake: [
          `El error de WhatsApp que cometen los ${n} locales y pierden ventas esta semana`,
          `Por qué tu ${n} tiene seguidores pero no clientes esta semana`,
          `La razón por la que tus clientes de ${n} no te recomiendan solos`,
          `Deja de hacer esto en tu ${n} local — está bloqueando las ventas locales`,
        ],
        opportunity: [
          `La oportunidad de visibilidad local en ${n} que tu competencia no está aprovechando`,
          `El momento de capturar clientes de ${n} con WhatsApp que se cierra pronto`,
          `El nicho de ${n} local que nadie está dominando en tu zona todavía`,
          `La ventana de clientes recurrentes en ${n} que se cierra si no actúas esta semana`,
        ],
        viral: [
          `El mensaje de WhatsApp para ${n} local que todos están empezando a copiar`,
          `Por qué los ${n} locales están cambiando esto para conseguir más clientes`,
          `Todos hablan de marketing para ${n} — esto es lo que realmente da clientes locales`,
          `El cambio en ${n} local que más clientes recurrentes está generando con bajo presupuesto`,
        ],
      },
    };
  }

  // ── English ────────────────────────────────────────────────────────────────
  if (isPrincipiante) return {
    angle: "First Client · Clarity · Initial Confidence",
    objectivePool: ["Build initial confidence with first clients","Reduce barrier to first result","Create clarity around first concrete step","Land first client with simple action today"],
    topicMap: {
      curiosity:   [`Why getting your first ${n} client is simpler than it looks`,`The step nobody explains when starting ${n} from scratch`,`What you actually need to start ${n} (not what you think)`,`The clarity secret to start ${n} today without experience`],
      pain:        [`Why you still don't have your first ${n} client — the simple fix`,`The clarity block that paralyzes beginners in ${n}`,`Still no clients? The most common reason when starting ${n}`,`Why starting ${n} feels hard when it actually isn't`],
      story:       [`How I got my first ${n} clients without prior experience`,`From zero to first ${n} clients: what actually worked`,`My first mistake in ${n} — and what I learned about clarity`,`The first ${n} result that gave me confidence to continue`],
      authority:   [`The simplest guide to start ${n} and get your first clients`,`What people who land their first ${n} client fast do differently`,`The first-client ${n} process that works from day one`,`How to build initial trust with your first ${n} clients`],
      mistake:     [`The #1 mistake beginners make in ${n} that delays the first client`,`This thing beginners do in ${n} kills initial confidence`,`The most common ${n} decision that delays first results`,`Stop doing this in ${n} — it's costing you clarity`],
      opportunity: [`The window to land your first ${n} client is open right now`,`Why now is the best time to start ${n} with clarity`,`The ${n} angle for first clients your competition isn't using`,`The first-result opportunity in ${n} beginners don't see yet`],
      viral:       [`The first step in ${n} all beginners are starting to use`,`Why starting ${n} with this approach changes first results`,`Everyone's talking about starting ${n} — here's what actually gives first clients`,`The mindset shift for starting ${n} giving the most clarity right now`],
    },
  };

  if (isPequena) return {
    angle: "System · Positioning · Repeatable Process",
    objectivePool: ["Position brand in local niche","Build systematic lead capture","Establish repeatable content process","Strengthen reputation and differentiation"],
    topicMap: {
      curiosity:   [`The content system that positions your ${n} without heroic effort`,`What separates a ${n} with solid reputation from one that can't capture leads`,`Why your ${n} needs a capture process, not more random posts`,`The ${n} content calendar that captures prospects every week`],
      pain:        [`Why your ${n} has visibility but no real lead capture`,`Why your ${n} works sometimes but not consistently`,`The positioning problem ${n} businesses with potential have without a system`,`Inconsistent ${n} reputation? Here's the system that fixes it`],
      story:       [`How I built a content system that positions my ${n} consistently`,`The ${n} calendar that turned my operation into a repeatable process`,`How I went from random results to systematic lead capture in ${n}`,`What I changed in my ${n} to have reputation without depending on me`],
      authority:   [`The ${n} content system that runs without depending on you`,`How to design a repeatable capture process for your ${n}`,`What ${n} businesses with solid reputation and consistent leads do differently`,`The ${n} positioning calendar that works 7 days a week`],
      mistake:     [`The content mistake ${n} businesses without lead systems make`,`Why your ${n} doesn't have consistent leads even though you create content`,`Why your ${n} still doesn't have solid local reputation`,`Stop posting without a calendar — it's killing your ${n} positioning`],
      opportunity: [`The ${n} positioning window small businesses aren't using`,`Why now is the time to build your ${n} lead capture system`,`The ${n} differentiation angle your competition isn't using`,`The ${n} reputation opportunity for small businesses nobody's taking`],
      viral:       [`The ${n} system all small businesses are starting to copy`,`Why ${n} businesses with content systems get more leads than those who post more`,`Everyone talks about ${n} content — this is what actually builds solid reputation`,`The shift from random ${n} results to repeatable process everyone should know`],
    },
  };

  if (isMediana) return {
    angle: "Conversion · CRM · Team Optimization",
    objectivePool: ["Optimize team conversion rate","Improve follow-up and CRM process","Identify bottlenecks in conversion","Automate manual steps blocking sales"],
    topicMap: {
      curiosity:   [`What your ${n} CRM is telling you that you're not reading`,`Why your ${n} team has activity but low actual conversion`,`The ${n} data point that shows where opportunities are lost`,`What separates the ${n} sales process that converts from the one that doesn't`],
      pain:        [`Why your ${n} team works more but converts the same or less`,`Why your ${n} loses opportunities in the follow-up stage`,`${n} CRM not giving useful data? Here's the real problem`,`The conversion bottleneck every ${n} with a team has`],
      story:       [`How we optimized our ${n} follow-up and conversion rose significantly`,`What we implemented in our ${n} CRM that changed this month's numbers`,`How we automated ${n} follow-up and the team converted more without extra effort`,`The ${n} conversion diagnosis that found where 30% of opportunities were lost`],
      authority:   [`The CRM process for ${n} teams that improves conversion without more effort`,`How to design a ${n} follow-up system that recovers lost opportunities`,`The ${n} metrics that actually predict this month's conversion result`,`The ${n} automation flow that eliminates manual steps blocking sales`],
      mistake:     [`The CRM mistake ${n} teams make that loses conversion`,`Why your ${n} team isn't following up at the right moment`,`The automation missing from your ${n} process is costing clients every week`,`Stop measuring this in your ${n} — it doesn't predict real team conversion`],
      opportunity: [`The ${n} automation your team can implement this week to improve conversion`,`Why now is the time to audit your ${n} follow-up process`,`The ${n} CRM angle your competition with a team isn't optimizing yet`,`The ${n} conversion optimization window that closes with every passing week`],
      viral:       [`The ${n} process changing how teams manage conversion`,`Why ${n} businesses with optimized teams convert more with the same effort`,`Everyone talks about CRM for ${n} — this is what actually moves team conversion`,`The ${n} automation change that improved conversion numbers this month`],
    },
  };

  if (isGrande) return {
    angle: "Scale · Brand Consistency · Executive Leadership",
    objectivePool: ["Scale with brand consistency across departments","Optimize profitability at scale","Improve multi-channel campaign coordination","Inform executive decisions with clear metrics"],
    topicMap: {
      curiosity:   [`The ${n} executive dashboard that shows where profitability is lost at scale`,`What brand consistency in ${n} across departments actually requires`,`Why ${n} multi-channel campaigns lose effectiveness without this system`,`The ${n} executive data leadership isn't reading that's costing margin`],
      pain:        [`Why your ${n} operation grows but profitability doesn't scale equally`,`Why ${n} brand consistency dilutes across departments at scale`,`${n} campaigns without channel coherence? Here's the systemic cause`,`The scalability problem large ${n} organizations with multiple teams have`],
      story:       [`How we redesigned our ${n} system to scale without losing brand consistency`,`What we built into our ${n} dashboard that changed executive leadership decisions`,`How we coordinated ${n} campaigns across departments without losing brand coherence`,`The ${n} executive diagnosis that revealed where profitability was lost at scale`],
      authority:   [`The executive dashboard system for ${n} organizations already scaling`,`How to build ${n} brand consistency across departments at scale`,`The ${n} executive metrics that actually inform leadership decisions`,`The ${n} multi-channel model that maintains coherence at corporate scale`],
      mistake:     [`The scalability mistake large ${n} organizations make that loses profitability`,`Why your ${n} loses brand consistency across departments when scaling`,`The ${n} campaign coordination gap costing margin every month`,`Stop measuring this in your ${n} at the executive level — it doesn't inform real decisions`],
      opportunity: [`The ${n} profitability optimization window at scale leadership isn't using`,`Why now is the time to audit your ${n} brand consistency across departments`,`The ${n} dashboard system your corporate competition hasn't implemented yet`,`The ${n} operational efficiency opportunity at scale nobody is capitalizing on`],
      viral:       [`The ${n} corporate model changing how executives manage scale`,`Why ${n} organizations that scale without losing profitability have this system in common`,`Everyone talks about ${n} scalability — this is what actually maintains brand consistency`,`The ${n} leadership change that improved cross-department coherence is redefining scale`],
    },
  };

  // Default: Micro Business EN
  return {
    angle: "Local Sales · WhatsApp · Clients This Week",
    objectivePool: ["Get local clients this week","Activate WhatsApp as direct sales channel","Convert one-time clients into repeat customers","Increase daily local visibility on low budget"],
    topicMap: {
      curiosity:   [`The channel that gives ${n} micro businesses the most local clients per week`,`Why WhatsApp converts better than Instagram for your local ${n}`,`What your ${n} competition doesn't know about daily local visibility`,`The repeat client secret in ${n} nobody explains`],
      pain:        [`Why your local ${n} has low traffic even when you do things right`,`Why your ${n} clients don't come back without you chasing them`,`Still no clients this week? What happens to most local ${n} businesses`,`The daily visibility problem blocking every ${n} micro business`],
      story:       [`How I got more ${n} clients this week using only WhatsApp`,`What I changed in my ${n} to have repeat clients without chasing them`,`The message that brought new local clients to my ${n} this week`,`How I made my local ${n} the visible option in the neighborhood`],
      authority:   [`The WhatsApp system for ${n} micro businesses that delivers clients this week`,`How to build local ${n} visibility on a daily low budget`,`What local ${n} businesses that always have repeat clients do differently`,`The ${n} referral strategy that works without spending on advertising`],
      mistake:     [`The WhatsApp mistake local ${n} businesses make that loses weekly sales`,`Why your ${n} has followers but no clients this week`,`Why your ${n} clients don't refer you without being asked`,`Stop doing this in your local ${n} — it's blocking local sales`],
      opportunity: [`The local ${n} visibility opportunity your competition isn't taking`,`The window to capture ${n} clients with WhatsApp that closes soon`,`The local ${n} niche nobody is dominating in your area yet`,`The ${n} repeat client window that closes if you don't act this week`],
      viral:       [`The WhatsApp message for local ${n} everyone is starting to copy`,`Why local ${n} businesses are changing this to get more clients this week`,`Everyone talks about ${n} marketing — this is what actually gives local clients`,`The local ${n} change generating the most repeat clients on a low budget`],
    },
  };
}

// ── Context Intelligence Layer ────────────────────────────────────────────────
function buildAudienceIntelligence(n, au, au1, pr, hookType, intensity, isES = false, tr = null) {
  const pick    = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const profile = industryProfile(n, isES);
  const [k0 = "resultados", k1 = "confianza", k2 = "crecimiento"] = profile.keywords;

  // Use transformation profile; fall back to industry profile language if not provided
  const t = tr ?? {
    hiddenDesire:            profile.desires,
    emotionalTransformation: k1,
    socialTransformation:    profile.transformation,
    practicalOutcome:        profile.transformation,
    fearAvoided:             profile.fears,
    identityShift:           profile.desires,
  };

  if (isES) {
    const desireVariantsES = [
      `Los ${au} buscan algo más que un ${pr} — buscan ${t.hiddenDesire}. El resultado visible es ${t.practicalOutcome}, pero lo que realmente compran es ${t.emotionalTransformation}. El deseo de fondo es certeza: saber que tienen un servicio que les da ${k0} y ${k1} de forma predecible.`,
      `Lo que impulsa a los ${au} en ${n} no es solo el servicio — es lo que ese servicio representa: ${t.emotionalTransformation}. Detrás de cada decisión, hay un deseo más profundo: ${t.hiddenDesire}. Quieren que ${n} sea una fuente de ${k1}, no un recordatorio de lo que aún no han logrado.`,
      `En el fondo, lo que persiguen los ${au} en ${n} es ${t.hiddenDesire}. No buscan solo ${t.practicalOutcome}. Buscan la historia que podrán contar sobre sí mismos cuando lleguen: ${t.identityShift}.`,
      `Los ${au} buscan el momento en que ${n} deje de ser algo que tienen que empujar y empiece a entregarles ${t.practicalOutcome} sin esfuerzo heroico. Lo que quieren al final es ${t.emotionalTransformation} — y ${k2} que no requiera reiniciar desde cero cada vez.`,
    ];
    const fearVariantsES = [
      `El miedo más profundo de los ${au} no es gastar mal en ${n} — es ${t.fearAvoided}. Invierten en ${pr} sabiendo que la diferencia importa, pero temen que no sea suficiente para cambiar la percepción de quienes los rodean.`,
      `Los ${au} temen en silencio que ${t.fearAvoided}. El pensamiento de invertir en ${pr} y no ver la diferencia reflejada en cómo los perciben está en el fondo de cada decisión que posponen.`,
      `Lo que paraliza a los ${au} en ${n} es comprometerse con un cambio y que no sea suficientemente visible. Debajo de esa hesitación hay algo más personal: que su caso sea la excepción. Y debajo de eso: ${t.fearAvoided}.`,
      `Lo que los ${au} más quieren evitar es ${t.fearAvoided}. Y junto a eso: mirar atrás en un año y ver que la oportunidad estuvo frente a ellos — que ${pr} era accesible — y que no actuaron a tiempo.`,
    ];
    const painVariantsES = [
      `Ahora mismo, los ${au} viven una brecha: quieren ${t.practicalOutcome}, pero lo que ven cuando se presentan al mundo no refleja eso todavía. Tienen acceso a más opciones de ${n} que nunca, y menos claridad sobre cuál cambia algo real.`,
      `La frustración que viven los ${au} en ${n} ahora mismo es la distancia entre quiénes son por dentro y cómo se presentan al mundo — la brecha entre querer ${t.practicalOutcome} y no verlo reflejado todavía.`,
      `Lo que los ${au} enfrentan diariamente en ${n} es la brecha entre lo que saben que deberían tener — ${t.practicalOutcome} — y lo que realmente tienen hoy. Pueden describir cómo se vería el resultado ideal. Pero la ejecución consistente falla cuando más importa.`,
      `La situación actual de la mayoría de ${au} en ${n} es: están activos, ponen esfuerzo real — pero los resultados no reflejan lo que buscan. La frustración no es solo sobre ${t.practicalOutcome}. Es sobre la desconexión entre la inversión que hacen y ${t.emotionalTransformation} que debería seguir lógicamente.`,
    ];
    const transformationVariantsES = [
      `La transformación que buscan los ${au} no es solo un ${pr} — es pasar de ${t.fearAvoided} a ${t.practicalOutcome}. Al otro lado: ${t.emotionalTransformation}. Un cambio que van a notar ellos, y que van a notar los que los rodean. De cualquiera a ${t.identityShift}.`,
      `Si ${pr} entrega lo que los ${au} necesitan, terminan en: ${t.socialTransformation}. Un estado donde ${t.practicalOutcome} llega de forma predecible, donde saben exactamente qué esperar, y donde el impulso siempre avanza.`,
      `El estado final deseado por los ${au} en ${n} es: ${t.emotionalTransformation}. No a veces. No cuando las condiciones son perfectas. Como base — de forma consistente. ${pr} es el puente hacia esa versión: ${t.identityShift}.`,
      `Lo que los ${au} realmente quieren cuando invierten en ${n} es ${t.hiddenDesire} — y pasar de "creo que esto funciona" a "sé que esto funciona." Desde ahí, a los resultados acumulativos que siguen de esa claridad: ${t.practicalOutcome}.`,
    ];
    return {
      desires:        pick(desireVariantsES),
      fears:          pick(fearVariantsES),
      pains:          pick(painVariantsES),
      transformation: pick(transformationVariantsES),
    };
  }

  // English — same pattern
  const [e0 = "results", e1 = "confidence", e2 = "growth"] = profile.keywords;
  const desireVariants = [
    `${au} want more than a ${pr} — they want ${t.hiddenDesire}. The visible result is ${t.practicalOutcome}, but what they're really buying is ${t.emotionalTransformation}. The core desire is certainty: knowing they have ${pr} that gives them ${e0} and ${e1} predictably.`,
    `What drives ${au} in ${n} isn't just the service — it's what it represents: ${t.emotionalTransformation}. Behind every decision, there's a deeper desire: ${t.hiddenDesire}. They want ${n} to be a source of ${e1}, not a constant reminder of what they haven't cracked yet.`,
    `At the core of what ${au} are chasing in ${n} is ${t.hiddenDesire}. Not just ${t.practicalOutcome}. The story they get to tell about themselves once they arrive: ${t.identityShift}.`,
    `${au} are chasing the moment when ${n} stops being something they push through and starts delivering ${t.practicalOutcome} without heroic effort. What they want at the end is ${t.emotionalTransformation} — and ${e2} that doesn't require restarting from zero each time.`,
  ];
  const fearVariants = [
    `The deepest fear for ${au} isn't wasting money on ${n} — it's ${t.fearAvoided}. They invest in ${pr} knowing the difference matters, but fear it won't be enough to shift how those around them see them.`,
    `${au} are quietly afraid that ${t.fearAvoided}. The thought of investing in ${pr} and not seeing the difference reflected in how they're perceived sits in the background of every decision they postpone.`,
    `What keeps ${au} from fully committing in ${n} is the fear that the change won't be visible enough. And underneath that: ${t.fearAvoided}.`,
    `What ${au} most want to avoid is ${t.fearAvoided}. And alongside that: looking back in a year and realizing the opportunity was right in front of them — that ${pr} was within reach — and they didn't act.`,
  ];
  const painVariants = [
    `Right now, ${au} are living a gap: they want ${t.practicalOutcome}, but how they show up in the world doesn't reflect that yet. They have more ${n} options than ever, and less clarity about which one actually changes something real.`,
    `The frustration ${au} are living in ${n} right now is the distance between who they are on the inside and how they present to the world — the gap between wanting ${t.practicalOutcome} and not seeing it yet.`,
    `What ${au} face daily in ${n} is the gap between what they know they should have — ${t.practicalOutcome} — and what they actually have today. They can describe what the ideal result looks like. But consistent execution fails when it matters most.`,
    `The current situation for most ${au} in ${n} is: active, putting in real effort — but the results don't reflect what they're after. The frustration isn't just about ${t.practicalOutcome}. It's about the disconnect between the investment they make and ${t.emotionalTransformation} that should logically follow.`,
  ];
  const transformationVariants = [
    `The transformation ${au} are after isn't just a ${pr} — it's moving from ${t.fearAvoided} to ${t.practicalOutcome}. On the other side: ${t.emotionalTransformation}. A change they'll feel, and that those around them will notice. From anyone to ${t.identityShift}.`,
    `If ${pr} delivers what ${au} need, they end up with: ${t.socialTransformation}. A state where ${t.practicalOutcome} happens predictably, where they know exactly what to expect, and where the momentum keeps building.`,
    `The final state ${au} want from ${n} is: ${t.emotionalTransformation}. Not sometimes. Not when conditions are perfect. As a baseline — consistently. ${pr} is the bridge to that version: ${t.identityShift}.`,
    `What ${au} really want when they invest in ${n} is ${t.hiddenDesire} — and going from "I think this works" to "I know this works." From there, to the compounding results that follow that clarity: ${t.practicalOutcome}.`,
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
    language = "Español",
    businessStage = "Microempresa",
  } = req.body ?? {};
  if (!niche.trim() || !product.trim() || !audience.trim()) {
    return res.status(400).json({ error: "niche, product, and audience are required" });
  }

  const n    = niche.trim();
  const pr   = product.trim();
  const au   = audience.trim();
  const isES = language !== "English";
  // For "X que Y" phrases, au1 = the subject noun only; avoids "un jóvenes que quieren verse profesionale serio"
  const _auSubj = ceSubject(au, isES);
  const au1  = (_auSubj && _auSubj !== au) ? _auSubj.split(/\s+/)[0] : au.replace(/s$/i, "");

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Build audience intelligence first — everything downstream uses it
  const tr    = buildTransformation(n, pr, isES);
  const si    = buildStageIntelligence(businessStage, n, pr, au, isES);
  const intel = buildAudienceIntelligence(n, au, au1, pr, hookType, intensity, isES, tr);

  // ── SAR Triggers — intelligence-aware, hook-type-driven ──────────────────────
  const sarMap = {
    curiosity: [
      `STOP — you're about to scroll past what separates ${au} who've already achieved ${tr.practicalOutcome} from those still trying to figure out how.\nAGITATE — you already know you want ${tr.hiddenDesire}. That's not the problem. The problem is that most options in ${n} weren't built for your specific profile — and ${tr.fearAvoided} is exactly what happens when you follow the wrong path.\nRESOLVE — ${pr} is built to deliver ${tr.practicalOutcome} specifically for ${au}. Not in theory. In practice.`,
      `STOP — the next ${n} approach you try will probably fall short of ${tr.practicalOutcome}. Not because you'll execute it wrong, but because it wasn't built for someone in your situation.\nAGITATE — ${au} spend time looking for options that promise ${tr.hiddenDesire} and end up with something that doesn't show enough. Every attempt that doesn't deliver makes the next one harder to justify.\nRESOLVE — ${pr} breaks that cycle by delivering ${tr.practicalOutcome} in a way that's visible and consistent for ${au}.`,
    ],
    pain: [
      `STOP — if you're a ${au1} who wants ${tr.hiddenDesire} and you're still not seeing it reflected in how you're perceived, this is the conversation that reframes why.\nAGITATE — you're not lacking motivation. You're not lacking intent. You're lacking the service that's actually designed to deliver ${tr.practicalOutcome} to ${au} — not the generic version, but the one that produces the visible change.\nRESOLVE — ${pr} is built around that. Not around ${n} in general — around ${tr.practicalOutcome} for the ${au} who actually need it.`,
      `STOP — the loop ${au} stay stuck in has a specific name: effort without visible change. You invest. Nothing shifts enough. You look for something different.\nAGITATE — that loop persists because the option wasn't designed to produce ${tr.emotionalTransformation} for someone with your specific profile. Options built for everyone aren't optimized for anyone.\nRESOLVE — ${pr} was built for ${au} who want ${tr.hiddenDesire}. Here's what that changes.`,
    ],
    story: [
      `STOP — there was a moment I was a ${au1} who wanted ${tr.hiddenDesire} and tried option after option in ${n} without seeing the change I was after.\nAGITATE — the frustration isn't that options don't exist. It's that they're designed for a version of you that doesn't have your specific circumstances or your specific target: ${tr.practicalOutcome}.\nRESOLVE — building ${pr} was how I solved that for myself. Then I realized it worked for other ${au} who wanted the same thing.`,
      `STOP — the moment my ${n} results changed wasn't when I found more options. It was when I found the one actually designed to deliver ${tr.practicalOutcome} without compromise.\nAGITATE — most ${au} are using options that work for many — and that's precisely why they're not optimized to produce ${tr.emotionalTransformation} consistently.\nRESOLVE — ${pr} makes it visible. And once you see it, everything shifts.`,
    ],
    authority: [
      `STOP — after working deeply in ${n}, one pattern repeats with almost every group of ${au}: they don't achieve ${tr.practicalOutcome} not because they lack intent, but because the service they're using wasn't designed for their specific profile.\nAGITATE — the conventional approach in ${n} assumes conditions that don't apply to most ${au}. The result: ${tr.fearAvoided}, even when the effort is real.\nRESOLVE — ${pr} is built on what actually produces ${tr.socialTransformation} for ${au}.`,
      `STOP — I've watched ${au} fail to get ${tr.practicalOutcome} for the same preventable reason so many times it stopped feeling like coincidence.\nAGITATE — the gap isn't capability. It's that available options in ${n} were designed for a general audience — not for the specific needs that define what ${au} require to achieve ${tr.emotionalTransformation}.\nRESOLVE — ${pr} is built around those specific needs.`,
    ],
    mistake: [
      `STOP — ${au} are making a specific ${n} mistake right now that's preventing them from getting ${tr.practicalOutcome}.\nAGITATE — it's not the obvious mistake. It's subtler: choosing by price or convenience instead of by real result. It feels like a reasonable decision. The scorecard — still not having ${tr.emotionalTransformation} — says otherwise.\nRESOLVE — ${pr} starts by delivering ${tr.practicalOutcome} visibly. That distinction alone changes the trajectory.`,
      `STOP — there's a decision ${au} make consistently in ${n} that consistently keeps them from reaching ${tr.practicalOutcome}.\nAGITATE — it's not laziness. It's not lack of intent. It's choosing convenient over what actually produces ${tr.emotionalTransformation}. It compounds quietly until the gap is impossible to ignore.\nRESOLVE — ${pr} is built to deliver the real result from the start.`,
    ],
    opportunity: [
      `STOP — there's a specific window right now for ${au} who want ${tr.practicalOutcome} — and almost none of them are taking advantage of it yet.\nAGITATE — by the time this opportunity is obvious, the window will have closed. The ${au} who move now are the ones who will have ${tr.socialTransformation} in 12 months while others are still searching.\nRESOLVE — ${pr} maps exactly how to enter this window before it closes.`,
      `STOP — ${n} is changing in a way that creates a real advantage for ${au} who are paying attention.\nAGITATE — most ${au} are still waiting for results from options that aren't designed to deliver ${tr.practicalOutcome} consistently. Meanwhile, those who shifted approach already have ${tr.emotionalTransformation}.\nRESOLVE — ${pr} puts you in that group with a clear path.`,
    ],
    viral: [
      `STOP — the ${n} option ${au} still consider standard no longer produces ${tr.practicalOutcome} at the level it should. The standard has moved.\nAGITATE — what actually delivers ${tr.emotionalTransformation} now is built with different criteria, for different results. Staying with what everyone else is using is actively working against the goal.\nRESOLVE — ${pr} is built around what actually produces ${tr.practicalOutcome} right now.`,
      `STOP — the reason some ${au} achieve ${tr.socialTransformation} with less apparent effort isn't luck. There's a specific structural pattern behind it.\nAGITATE — most ${au} can see that something is working differently for those who've already achieved it, but can't figure out why. That gap between observation and understanding is exactly where the advantage sits.\nRESOLVE — ${pr} maps that pattern into something ${au} can actually replicate.`,
    ],
  };

  // ── Pain Triggers — grounded in the pain analysis, intensity-scaled ──────────
  const painMap = {
    soft: [
      `Most ${au} in ${n} are looking for ${tr.practicalOutcome} — and still feeling like something isn't quite landing. That feeling is real, and it usually points to the option they're using not being designed specifically to produce ${tr.emotionalTransformation}. The effort isn't the problem. The alignment between service and result is.`,
      `There's a specific moment most ${au} in ${n} recognize: you invest in something, you trust the process — and the results are inconsistent in a way you can't quite explain. That inconsistency isn't random. The cause is usually that the service wasn't optimized to deliver ${tr.practicalOutcome} for your specific situation.`,
    ],
    medium: [
      `You're a ${au1} who wants ${tr.hiddenDesire} — and you're still not seeing it reflected the way it should be. That's not a motivation problem or an intent problem. It's an alignment problem: the approach you're using was built for someone else with a different goal.`,
      `${au} spend time circling the same friction in ${n}: investments that don't produce ${tr.practicalOutcome} consistently, options that work until they don't, and results that are never visible enough to build on.`,
    ],
    aggressive: [
      `Here's what's actually happening for ${au} in ${n} right now: without ${tr.practicalOutcome}, every week that passes is a week where ${tr.fearAvoided}. There's no version of this where waiting produces a different result. The gap doesn't close on its own.`,
      `If you already had ${tr.practicalOutcome}, you wouldn't be watching this. You're at the point where ${au} recognize they need a different approach — not more effort on the same one. ${pr} is that different approach.`,
    ],
  };

  // ── Curiosity Triggers — grounded in desire and transformation ────────────────
  const curiosityMap = {
    curiosity: [
      `What if the reason you haven't achieved ${tr.practicalOutcome} yet has nothing to do with what you've been adjusting? Most ${au} are solving the visible problem. The real problem — why ${tr.fearAvoided} — is one layer underneath it.`,
      `There's a pattern that separates ${au} who already have ${tr.emotionalTransformation} from those still searching — and it has almost nothing to do with how many times they tried. The variable that actually matters is the one almost nobody mentions directly.`,
    ],
    pain: [
      `The real cost of another period without ${tr.practicalOutcome} isn't just time. For ${au}, it's the compounding effect of ${tr.fearAvoided} — growing quietly in the background while effort continues at the front.`,
      `What if what's keeping ${au} from reaching ${tr.identityShift} isn't missing information, but a structural decision they made early that's been shaping everything since?`,
    ],
    story: [
      `The shift that helped ${au} achieve ${tr.practicalOutcome} didn't happen when they found more options in ${n}. It happened when they found the right one — the one actually designed to produce ${tr.emotionalTransformation} in their specific situation.`,
      `I've had this conversation with dozens of ${au} who wanted ${tr.hiddenDesire} — and what surprises them every time isn't the solution. It's realizing the problem wasn't what they thought it was. That reframe alone changes everything.`,
    ],
    authority: [
      `Most ${n} options are built around assumptions that don't apply to ${au} looking for ${tr.practicalOutcome} — and the people who built them don't know it, because they've never operated inside the specific needs that define your situation.`,
      `I've tracked results in ${n} with enough ${au} to see a pattern that doesn't show up in any popular advice: those who achieve ${tr.socialTransformation} aren't doing more. They're doing one specific thing differently that makes everything else more efficient.`,
    ],
    mistake: [
      `The most expensive ${n} mistake ${au} make isn't the obvious one. It's the one that looks like discipline, looks like consistency, looks like the right move — and is actively preventing ${tr.practicalOutcome}.`,
      `${au} who still don't have ${tr.emotionalTransformation} usually have one thing in common: a decision they made early that made sense at the time and has been compounding in the wrong direction since.`,
    ],
    opportunity: [
      `The specific window to achieve ${tr.practicalOutcome} in ${n} is the kind that only makes sense in retrospect — when those who moved early are explaining why they did it, and everyone else wishes they'd paid attention when it mattered.`,
      `There's a space in ${n} right now that ${au} with the right approach can use to achieve ${tr.socialTransformation} before it gets crowded. The reason most won't isn't that they can't see it.`,
    ],
    viral: [
      `The pattern in ${n} that's already delivering ${tr.practicalOutcome} consistently — and most ${au} haven't figured out why yet. The gap between those who see it and those who don't is exactly where the advantage currently sits.`,
      `Why are some ${au} in ${n} achieving ${tr.socialTransformation} with less apparent effort? The answer isn't a secret. It's a structural pattern that looks obvious once someone shows it to you — and invisible until they do.`,
    ],
  };

  // ── Main Script — intelligence-grounded, hook-type-driven ─────────────────────
  const scriptMap = {
    curiosity: `Here's something that almost never gets said directly about ${n}:\n\nWhat ${au} who've already achieved ${tr.practicalOutcome} have in common isn't that they tried more — it's that they found the right approach. The curiosity gap in ${n} isn't between those who want it more and those who want it less. It's between those who found a service designed to deliver ${tr.emotionalTransformation} specifically for ${au}, and those who are still cycling through options that weren't built for their situation.\n\nWhat ${au} actually want — and what most ${n} options never deliver — is ${tr.hiddenDesire}. Not a generic result. ${tr.practicalOutcome} that holds up and compounds.\n\n${pr} is built around that. It starts with ${tr.hiddenDesire} — and delivers ${tr.emotionalTransformation} in a way that's visible to them and to everyone around them.`,
    pain: `If you're a ${au1} who wants ${tr.hiddenDesire} and you're still not seeing it reflected the way it should be — the problem isn't you.\n\nThe ${n} space is full of options that work for someone. Just not specifically designed to deliver ${tr.practicalOutcome} to ${au} with your profile, your expectations, and your awareness of the difference that actually matters.\n\nWhat that creates is the most frustrating kind of situation: you invest, you try, and the result isn't what you were after — and ${tr.fearAvoided}. The intent is real. The alignment between service and transformation just isn't there.\n\n${pr} was built to close that alignment. Not by being a generic option — by being designed around ${tr.practicalOutcome} for ${au} who know exactly what they're looking for.`,
    story: `There was a point when I was a ${au1} who wanted ${tr.hiddenDesire} — and kept trying options in ${n} that delivered something, but not ${tr.emotionalTransformation}.\n\nThe shift didn't happen when I found more options. It happened when I found one actually designed to deliver ${tr.practicalOutcome} — built around my specific situation, not around a general audience.\n\nThat's what became ${pr}. And what surprised me was that when other ${au} tried it, the same shift happened for them. Because the problem wasn't unique to me. Most ${au} who don't have ${tr.practicalOutcome} are in the same place — using options that weren't built to take them where they want to go.\n\nIf the description of where I was sounds familiar, here's what changed.`,
    authority: `After working deeply in ${n}, one thing becomes impossible to ignore:\n\n${au} who don't achieve ${tr.practicalOutcome} aren't failing because they lack drive. They're failing because the options they're using weren't designed for their specific profile — the specific version of ${tr.hiddenDesire} that defines what they're actually looking for.\n\nThat mismatch is invisible until you see it. And once you see it, every generic ${n} option starts to read differently.\n\n${pr} is built from the ground up around what ${au} actually need to achieve ${tr.emotionalTransformation}. The difference in results isn't because the underlying need in ${n} is different. It's because ${pr} is applied accurately, to the right version of the transformation, for the right person.`,
    mistake: `The most common ${n} mistake among ${au} isn't the obvious one.\n\nIt's subtler: choosing by convenience or familiarity instead of by what actually produces ${tr.practicalOutcome}. It feels like a reasonable decision. But options chosen for convenience weren't designed to deliver ${tr.emotionalTransformation} — and the gap becomes undeniable when ${tr.fearAvoided}.\n\nHere's how it compounds: you invest, you try, you decide it was close enough. The underlying transformation doesn't happen. Eventually the disconnect becomes impossible to ignore — and then you look for something different.\n\n${pr} starts by being designed around ${tr.practicalOutcome} specifically. That distinction alone changes the direction of everything that follows.`,
    opportunity: `Right now there's a real opportunity for ${au} who want ${tr.practicalOutcome} — and most of them haven't moved on it yet.\n\nThe ${n} options that were standard are no longer delivering ${tr.emotionalTransformation} at the level ${au} expect. The gap is real, and it's widening. In that gap, the advantage goes to ${au} who find the right approach before the window closes.\n\nThis is that moment. Not in theory. Specifically, right now.\n\n${pr} maps the exact path to ${tr.socialTransformation} for ${au} in ${n} — and why this is the right timing to make that move.`,
    viral: `The standard ${n} option ${au} were using to get ${tr.practicalOutcome} has shifted. What was delivering ${tr.emotionalTransformation} before isn't delivering it at the same level now.\n\nThe ${au} who've already made the shift are getting results that look different — ${tr.socialTransformation} that stands out. It's not luck. It's that they found the option designed for where the standard is now, not where it was.\n\nThat's what ${pr} is built around. Not the version of ${n} that was good enough before — the version that actually delivers ${tr.practicalOutcome} now. Here's what that looks like in practice.`,
  };

  // ── CTA — intensity-scaled ────────────────────────────────────────────────────
  const ctaMap = {
    soft: [
      `If this resonated, follow for more ${n} content built specifically for ${au} who want ${tr.practicalOutcome}. New posts every week.`,
      `Save this if you're a ${au1} looking for ${tr.hiddenDesire} — you'll want to come back to it.`,
      `Try ${pr} and see the difference for yourself. Link in bio.`,
    ],
    medium: [
      `Comment "${n.toUpperCase()}" below and I'll send you the full breakdown on how ${pr} delivers ${tr.practicalOutcome} — free.`,
      `Follow if you're a ${au1} who's serious about ${tr.emotionalTransformation}. I don't post filler.`,
      `${pr} is open right now. Link in bio — takes less than 2 minutes to get started.`,
    ],
    aggressive: [
      `${au} who book ${pr} today will have ${tr.practicalOutcome} before the month is over. Link in bio. Don't overthink it.`,
      `Stop searching. Start seeing the difference. ${pr} — link in bio. This is how ${tr.emotionalTransformation} happens.`,
      `Comment "READY" if you're done waiting for ${tr.practicalOutcome}. I'll send you the first step right now.`,
    ],
  };

  // ── Titles — hook-type-driven ─────────────────────────────────────────────────
  const titleMap = {
    curiosity: [
      `The real reason ${au} don't have ${tr.practicalOutcome} yet (it's not what you think)`,
      `Why most ${n} options fail to deliver ${tr.emotionalTransformation} — and what does`,
    ],
    pain: [
      `Why ${au} stay stuck without ${tr.practicalOutcome} — and the exact fix`,
      `Still missing ${tr.practicalOutcome}? The honest answer is here`,
    ],
    story: [
      `How I went from wanting ${tr.hiddenDesire} to actually having it — with ${pr}`,
      `What finally delivered ${tr.practicalOutcome} after options that didn't`,
    ],
    authority: [
      `What ${au} with ${tr.emotionalTransformation} know that most don't`,
      `The ${n} approach that actually delivers ${tr.practicalOutcome} consistently`,
    ],
    mistake: [
      `The #1 ${n} mistake that keeps ${au} from ${tr.practicalOutcome}`,
      `You're probably making this ${n} mistake right now — here's the fix`,
    ],
    opportunity: [
      `The ${n} window to achieve ${tr.socialTransformation} — most ${au} are missing it`,
      `${tr.practicalOutcome} is within reach for ${au} right now — here's how`,
    ],
    viral: [
      `The ${n} standard that's already shifted (most ${au} haven't caught up)`,
      `Why the old ${n} approach stopped delivering ${tr.emotionalTransformation} — new standard inside`,
    ],
  };

  // ── Hashtags — keyword-based, no full-phrase concatenation ──────────────────

  // ── Spanish templates ─────────────────────────────────────────────────────────
  const sarMapES = {
    curiosity: [
      `PARA — estás a punto de pasar por alto lo que separa a los ${au} que ya tienen ${tr.practicalOutcome} de los que todavía buscan cómo lograrlo.\nAGITA — ya sabes que quieres ${tr.hiddenDesire}. Ese no es el problema. El problema es que la mayoría de las opciones en ${n} no fueron construidas para tu perfil específico — y ${tr.fearAvoided} es exactamente lo que pasa cuando sigues el camino equivocado.\nRESOLUCIÓN — ${pr} está diseñado para entregar ${tr.practicalOutcome} específicamente a los ${au}. No en teoría. En la práctica.`,
      `PARA — la próxima opción de ${n} que pruebes probablemente no llegará a ${tr.practicalOutcome}. No porque la ejecutes mal, sino porque no fue construida para alguien en tu situación.\nAGITA — los ${au} pasan tiempo buscando opciones que prometen ${tr.hiddenDesire} y terminan con algo que no muestra suficiente. Cada intento que no entrega hace que el siguiente sea más difícil de justificar.\nRESOLUCIÓN — ${pr} rompe ese ciclo entregando ${tr.practicalOutcome} de una manera que es visible y consistente para los ${au}.`,
    ],
    pain: [
      `PARA — si eres un ${au1} que quiere ${tr.hiddenDesire} y todavía no lo ves reflejado en cómo te perciben, esta es la conversación que reencuadra el porqué.\nAGITA — no te falta motivación. No te falta intención. Te falta el servicio que está realmente diseñado para entregar ${tr.practicalOutcome} a los ${au} — no la versión genérica, sino la que produce el cambio visible.\nRESOLUCIÓN — ${pr} está construido alrededor de eso. No alrededor de ${n} en general — alrededor de ${tr.practicalOutcome} para los ${au} que realmente lo necesitan.`,
      `PARA — el ciclo en el que los ${au} se quedan atascados tiene un nombre específico: inversión sin cambio visible. Inviertes. Nada cambia suficiente. Buscas algo diferente.\nAGITA — ese ciclo persiste porque la opción no fue diseñada para producir ${tr.emotionalTransformation} para alguien con tu perfil específico. Las opciones construidas para todos no están optimizadas para nadie.\nRESOLUCIÓN — ${pr} fue construido para los ${au} que quieren ${tr.hiddenDesire}. Esto es lo que cambia.`,
    ],
    story: [
      `PARA — hubo un momento en que era un ${au1} que quería ${tr.hiddenDesire} y probó opción tras opción en ${n} sin ver el cambio que buscaba.\nAGITA — la frustración no es que las opciones no existan. Es que están diseñadas para una versión de ti que no tiene tus circunstancias específicas ni tu objetivo: ${tr.practicalOutcome}.\nRESOLUCIÓN — ${pr} fue cómo lo resolví para mí. Luego me di cuenta de que también funcionaba para otros ${au} que querían lo mismo.`,
      `PARA — el momento en que mis resultados en ${n} cambiaron no fue cuando encontré más opciones. Fue cuando encontré la que estaba realmente diseñada para entregar ${tr.practicalOutcome} sin compromiso.\nAGITA — la mayoría de los ${au} usan opciones que funcionan para muchos — y eso es exactamente por qué no están optimizadas para producir ${tr.emotionalTransformation} de forma consistente.\nRESOLUCIÓN — ${pr} lo hace visible. Y una vez que lo ves, todo cambia.`,
    ],
    authority: [
      `PARA — después de trabajar profundamente en ${n}, un patrón se repite casi con cada grupo de ${au}: no logran ${tr.practicalOutcome} no porque les falte intención, sino porque el servicio que están usando no fue diseñado para su perfil específico.\nAGITA — el enfoque convencional de ${n} asume condiciones que no aplican a la mayoría de ${au}. El resultado: ${tr.fearAvoided}, incluso cuando el esfuerzo es real.\nRESOLUCIÓN — ${pr} está construido sobre lo que realmente produce ${tr.socialTransformation} para los ${au}.`,
      `PARA — he visto a los ${au} no llegar a ${tr.practicalOutcome} por la misma razón prevenible tantas veces que dejó de parecer coincidencia.\nAGITA — la brecha no es capacidad. Es que las opciones disponibles en ${n} fueron diseñadas para una audiencia general — no para las necesidades específicas que definen lo que los ${au} necesitan para lograr ${tr.emotionalTransformation}.\nRESOLUCIÓN — ${pr} está construido alrededor de esas necesidades específicas.`,
    ],
    mistake: [
      `PARA — los ${au} están cometiendo un error específico en ${n} que les está impidiendo tener ${tr.practicalOutcome}.\nAGITA — no es el error obvio. Es más sutil: elegir por precio o conveniencia en lugar de por resultado real. Se siente como una decisión razonable. El marcador — no tener todavía ${tr.emotionalTransformation} — dice lo contrario.\nRESOLUCIÓN — ${pr} empieza entregando ${tr.practicalOutcome} de forma visible. Esa distinción sola cambia la trayectoria.`,
      `PARA — hay una decisión que los ${au} toman consistentemente en ${n} que consistentemente les impide llegar a ${tr.practicalOutcome}.\nAGITA — no es pereza. No es falta de intención. Es elegir lo conveniente sobre lo que realmente produce ${tr.emotionalTransformation}. Se acumula silenciosamente hasta que la brecha es imposible de ignorar.\nRESOLUCIÓN — ${pr} está construido para entregar el resultado real desde el inicio.`,
    ],
    opportunity: [
      `PARA — ahora mismo hay una ventana específica para los ${au} que quieren ${tr.practicalOutcome} — y casi ninguno de ellos la está aprovechando todavía.\nAGITA — cuando esta oportunidad sea obvia, la ventana ya se habrá cerrado. Los ${au} que se mueven ahora son los que en 12 meses tendrán ${tr.socialTransformation} mientras otros todavía buscan.\nRESOLUCIÓN — ${pr} mapea exactamente cómo entrar en esta ventana antes de que se cierre.`,
      `PARA — ${n} está cambiando de una manera que crea una ventaja real para los ${au} que están prestando atención.\nAGITA — la mayoría de los ${au} todavía esperan resultados de opciones que no están diseñadas para entregar ${tr.practicalOutcome} de forma consistente. Mientras tanto, los que ya cambiaron de enfoque tienen ${tr.emotionalTransformation}.\nRESOLUCIÓN — ${pr} te pone en ese grupo con un camino claro.`,
    ],
    viral: [
      `PARA — la opción de ${n} que los ${au} todavía consideran estándar ya no produce ${tr.practicalOutcome} al nivel que debería. El estándar se ha movido.\nAGITA — lo que realmente entrega ${tr.emotionalTransformation} ahora está construido con criterios diferentes, para resultados diferentes. Quedarse con lo que todos los demás usan está trabajando activamente en contra del objetivo.\nRESOLUCIÓN — ${pr} está construido alrededor de lo que realmente produce ${tr.practicalOutcome} ahora.`,
      `PARA — la razón por la que algunos ${au} logran ${tr.socialTransformation} con menos esfuerzo aparente no es suerte. Hay un patrón estructural específico detrás.\nAGITA — la mayoría de los ${au} puede ver que algo está funcionando diferente para quienes ya lo tienen, pero no puede entender por qué. Esa brecha entre observación y comprensión es exactamente donde se asienta la ventaja.\nRESOLUCIÓN — ${pr} mapea ese patrón en algo que los ${au} pueden replicar.`,
    ],
  };

  const painMapES = {
    soft: [
      `La mayoría de los ${au} en ${n} buscan ${tr.practicalOutcome} — y aun así sienten que algo no está aterrizando. Esa sensación es real, y generalmente señala que la opción que están usando no fue diseñada específicamente para producir ${tr.emotionalTransformation}. El esfuerzo no es el problema. El alineamiento entre servicio y resultado lo es.`,
      `Hay un momento específico que la mayoría de los ${au} en ${n} reconocen: inviertes en algo, confías en el proceso — y los resultados son inconsistentes de una manera que no puedes explicar. Esa inconsistencia no es aleatoria. La causa generalmente es que el servicio no estaba optimizado para entregar ${tr.practicalOutcome} para tu situación específica.`,
    ],
    medium: [
      `Eres un ${au1} que quiere ${tr.hiddenDesire} — y todavía no lo estás viendo reflejado como debería. No es un problema de motivación ni de intención. Es un problema de alineamiento: el enfoque que estás usando fue construido para otra persona con un objetivo diferente.`,
      `Los ${au} pasan tiempo girando alrededor de la misma fricción en ${n}: inversiones que no producen ${tr.practicalOutcome} de forma consistente, opciones que funcionan hasta que no funcionan, y resultados que nunca son suficientemente visibles para construir sobre ellos.`,
    ],
    aggressive: [
      `Esto es lo que realmente está pasando para los ${au} en ${n} ahora mismo: sin ${tr.practicalOutcome}, cada semana que pasa es una semana donde ${tr.fearAvoided}. No hay versión de esto donde esperar produzca un resultado diferente. La brecha no se cierra sola.`,
      `Si ya tuvieras ${tr.practicalOutcome}, no estarías viendo esto. Estás en el punto donde los ${au} reconocen que necesitan un enfoque diferente — no más esfuerzo en el mismo. ${pr} es ese enfoque diferente.`,
    ],
  };

  const curiosityMapES = {
    curiosity: [
      `¿Y si la razón por la que todavía no tienes ${tr.practicalOutcome} no tiene nada que ver con lo que has estado ajustando? La mayoría de los ${au} están resolviendo el problema visible. El problema real — por qué ${tr.fearAvoided} — está una capa por debajo.`,
      `Hay un patrón que separa a los ${au} que ya tienen ${tr.emotionalTransformation} de los que todavía buscan — y no tiene casi nada que ver con cuántas veces intentaron. La variable que realmente importa es la que casi nadie menciona directamente.`,
    ],
    pain: [
      `El costo real de otro período sin ${tr.practicalOutcome} no es solo tiempo. Para los ${au}, es el efecto acumulado de ${tr.fearAvoided} — creciendo silenciosamente en el fondo mientras el esfuerzo continúa al frente.`,
      `¿Y si lo que mantiene a los ${au} lejos de ${tr.identityShift} no es información que falta, sino una decisión estructural que tomaron al principio que ha estado dando forma a todo desde entonces?`,
    ],
    story: [
      `El cambio que llevó a los ${au} a tener ${tr.practicalOutcome} no ocurrió cuando encontraron más opciones en ${n}. Ocurrió cuando encontraron la correcta — la que realmente fue diseñada para producir ${tr.emotionalTransformation} en su situación específica.`,
      `He tenido esta conversación con decenas de ${au} que querían ${tr.hiddenDesire} — y lo que los sorprende cada vez no es la solución. Es darse cuenta de que el problema no era lo que pensaban que era. Solo ese reencuadre cambia todo.`,
    ],
    authority: [
      `La mayoría de las opciones de ${n} están construidas alrededor de suposiciones que no aplican a los ${au} que buscan ${tr.practicalOutcome} — y quienes las construyeron no lo saben, porque nunca operaron dentro de las necesidades específicas que definen tu situación.`,
      `He rastreado resultados en ${n} con suficientes ${au} para ver un patrón que no aparece en ningún consejo popular: los que logran ${tr.socialTransformation} no están haciendo más. Están haciendo una cosa específica diferente que hace que todo lo demás sea más eficiente.`,
    ],
    mistake: [
      `El error más costoso de ${n} que cometen los ${au} no es el obvio. Es el que parece disciplina, parece consistencia, parece el movimiento correcto — y está activamente impidiendo ${tr.practicalOutcome}.`,
      `Los ${au} que todavía no tienen ${tr.emotionalTransformation} típicamente tienen algo en común: una decisión que tomaron temprano que tenía sentido en ese momento y que ha estado acumulándose en la dirección equivocada desde entonces.`,
    ],
    opportunity: [
      `La ventana específica para lograr ${tr.practicalOutcome} en ${n} es el tipo que solo tiene sentido en retrospectiva — cuando los que se movieron temprano explican por qué lo hicieron, y todos los demás desearían haber prestado atención cuando importaba.`,
      `Hay un espacio en ${n} ahora mismo en el que los ${au} con el enfoque correcto pueden lograr ${tr.socialTransformation} antes de que se llene. La razón por la que la mayoría no lo hará no es que no puedan verlo.`,
    ],
    viral: [
      `El patrón en ${n} que ya está entregando ${tr.practicalOutcome} de forma consistente — y la mayoría de los ${au} aún no han entendido por qué. La brecha entre los que lo ven y los que no es exactamente donde se asienta la ventaja ahora mismo.`,
      `¿Por qué algunos ${au} en ${n} logran ${tr.socialTransformation} con menos esfuerzo aparente? La respuesta no es un secreto. Es un patrón estructural que parece obvio una vez que alguien te lo muestra — e invisible hasta que lo hace.`,
    ],
  };

  const scriptMapES = {
    curiosity: `Esto es algo que casi nunca se dice directamente sobre ${n}:\n\nLo que los ${au} que ya tienen ${tr.practicalOutcome} tienen en común no es que intentaron más — es que encontraron el enfoque correcto. La brecha en ${n} no está entre los que quieren más y los que quieren menos. Está entre los que encontraron un servicio diseñado para entregar ${tr.emotionalTransformation} específicamente a los ${au}, y los que siguen probando opciones que no fueron construidas para su situación.\n\nLo que los ${au} realmente quieren — y lo que la mayoría de las opciones de ${n} nunca les da — es ${tr.hiddenDesire}. No un resultado genérico. ${tr.practicalOutcome} que se sostiene y se nota.\n\n${pr} está construido alrededor de eso. Empieza con ${tr.hiddenDesire} — y entrega ${tr.emotionalTransformation} de una manera que es visible para ellos y para todos los que los rodean.`,
    pain: `Si eres un ${au1} que quiere ${tr.hiddenDesire} y todavía no lo estás viendo reflejado como debería — el problema no eres tú.\n\nEl espacio de ${n} está lleno de opciones que funcionan para alguien. Solo no específicamente diseñadas para entregar ${tr.practicalOutcome} a los ${au} con tu perfil, tus expectativas, y tu conciencia de la diferencia que realmente importa.\n\nLo que eso crea es la situación más frustrante: inviertes, pruebas, y el resultado no es lo que buscabas — y ${tr.fearAvoided}. La intención es real. El alineamiento entre servicio y transformación simplemente no está ahí.\n\n${pr} fue construido para cerrar ese alineamiento. No siendo una opción genérica — siendo diseñado alrededor de ${tr.practicalOutcome} para los ${au} que saben exactamente lo que buscan.`,
    story: `Hubo un punto en que era un ${au1} que quería ${tr.hiddenDesire} — y seguía probando opciones en ${n} que entregaban algo, pero no ${tr.emotionalTransformation}.\n\nEl cambio no ocurrió cuando encontré más opciones. Ocurrió cuando encontré una realmente diseñada para entregar ${tr.practicalOutcome} — construida alrededor de mi situación específica, no de una audiencia general.\n\nEso es lo que se convirtió en ${pr}. Y lo que me sorprendió fue que cuando otros ${au} lo probaron, el mismo cambio ocurrió para ellos. Porque el problema no era único para mí. La mayoría de los ${au} que no tienen ${tr.practicalOutcome} están en el mismo lugar — usando opciones que no fueron construidas para llevarlos a donde quieren ir.\n\nSi la descripción de dónde estaba te resulta familiar, esto es lo que cambió.`,
    authority: `Después de trabajar profundamente en ${n}, una cosa se vuelve imposible de ignorar:\n\nLos ${au} que no logran ${tr.practicalOutcome} no fallan porque les falte impulso. Fallan porque las opciones que están usando no fueron diseñadas para su perfil específico — la versión específica de ${tr.hiddenDesire} que define lo que realmente buscan.\n\nEsa discrepancia es invisible hasta que la ves. Y una vez que la ves, cada opción genérica de ${n} empieza a leerse diferente.\n\n${pr} está construido desde cero alrededor de lo que los ${au} realmente necesitan para lograr ${tr.emotionalTransformation}. La diferencia en resultados no es porque la necesidad subyacente en ${n} sea diferente. Es porque ${pr} se aplica con precisión, a la versión correcta de la transformación, para la persona correcta.`,
    mistake: `El error más común de ${n} entre los ${au} no es el obvio.\n\nEs más sutil: elegir por conveniencia o familiaridad en lugar de por lo que realmente produce ${tr.practicalOutcome}. Se siente como una decisión razonable. Pero las opciones elegidas por conveniencia no fueron diseñadas para entregar ${tr.emotionalTransformation} — y la brecha se vuelve innegable cuando ${tr.fearAvoided}.\n\nAsí es como se acumula: inviertes, pruebas, decides que estuvo suficientemente bien. La transformación subyacente no ocurre. Eventualmente la desconexión se vuelve imposible de ignorar — y entonces buscas algo diferente.\n\n${pr} empieza siendo diseñado alrededor de ${tr.practicalOutcome} específicamente. Esa distinción sola cambia la dirección de todo lo que sigue.`,
    opportunity: `Ahora mismo hay una oportunidad real para los ${au} que quieren ${tr.practicalOutcome} — y la mayoría de ellos todavía no se han movido.\n\nLas opciones de ${n} que eran estándar ya no están entregando ${tr.emotionalTransformation} al nivel que los ${au} esperan. La brecha es real, y se está ampliando. En esa brecha, la ventaja va para los ${au} que encuentran el enfoque correcto antes de que la ventana se cierre.\n\nEste es ese momento. No en teoría. Específicamente, ahora mismo.\n\n${pr} mapea el camino exacto hacia ${tr.socialTransformation} para los ${au} en ${n} — y por qué este es el momento correcto para hacer ese movimiento.`,
    viral: `La opción estándar de ${n} que los ${au} usaban para conseguir ${tr.practicalOutcome} ha cambiado. Lo que antes entregaba ${tr.emotionalTransformation} ya no lo entrega al mismo nivel.\n\nLos ${au} que ya hicieron el cambio están obteniendo resultados que se ven diferentes — ${tr.socialTransformation} que se nota. No es suerte. Es que encontraron la opción diseñada para donde está el estándar ahora, no donde estaba antes.\n\nEso es lo que ${pr} está construido alrededor. No la versión de ${n} que era suficientemente buena antes — la versión que realmente entrega ${tr.practicalOutcome} ahora.`,
  };

  const ctaMapES = {
    soft: [
      `Si esto resonó, sigue para más contenido de ${n} construido específicamente para ${au} que quieren ${tr.practicalOutcome}. Publicaciones nuevas cada semana.`,
      `Guarda esto si eres un ${au1} que busca ${tr.hiddenDesire} — querrás volver a verlo.`,
      `Prueba ${pr} y ve la diferencia por ti mismo. Enlace en bio.`,
    ],
    medium: [
      `Comenta "${n.toUpperCase()}" abajo y te envío el desglose completo de cómo ${pr} entrega ${tr.practicalOutcome} — gratis.`,
      `Sígueme si eres un ${au1} serio sobre ${tr.emotionalTransformation}. No publico relleno.`,
      `${pr} está disponible ahora. Enlace en bio — menos de 2 minutos para empezar.`,
    ],
    aggressive: [
      `Los ${au} que reservan ${pr} hoy van a tener ${tr.practicalOutcome} antes de que termine el mes. Enlace en bio. No lo pienses demasiado.`,
      `Deja de buscar. Empieza a ver la diferencia. ${pr} — enlace en bio. Así es como ocurre ${tr.emotionalTransformation}.`,
      `Comenta "LISTO" si ya terminaste de esperar ${tr.practicalOutcome}. Te envío el primer paso ahora mismo.`,
    ],
  };

  const titleMapES = {
    curiosity: [
      `La verdadera razón por la que los ${au} todavía no tienen ${tr.practicalOutcome} (y no es lo que piensas)`,
      `Por qué la mayoría de las opciones de ${n} no entregan ${tr.emotionalTransformation} — y cuál sí`,
    ],
    pain: [
      `Por qué los ${au} se quedan sin ${tr.practicalOutcome} — y el arreglo exacto`,
      `¿Todavía sin ${tr.practicalOutcome}? La respuesta honesta está aquí`,
    ],
    story: [
      `Cómo pasé de querer ${tr.hiddenDesire} a tenerlo de verdad — con ${pr}`,
      `Lo que finalmente entregó ${tr.practicalOutcome} cuando otras opciones no lo hicieron`,
    ],
    authority: [
      `Lo que los ${au} con ${tr.emotionalTransformation} saben que la mayoría no sabe`,
      `El enfoque de ${n} que realmente entrega ${tr.practicalOutcome} de forma consistente`,
    ],
    mistake: [
      `El error #1 en ${n} que mantiene a los ${au} sin ${tr.practicalOutcome}`,
      `Probablemente estás cometiendo este error de ${n} ahora mismo — aquí está el arreglo`,
    ],
    opportunity: [
      `La ventana en ${n} para lograr ${tr.socialTransformation} — la mayoría de ${au} la están perdiendo`,
      `${tr.practicalOutcome} está al alcance de los ${au} ahora mismo — así es cómo`,
    ],
    viral: [
      `El estándar de ${n} que ya cambió (la mayoría de ${au} no se han actualizado)`,
      `Por qué el enfoque antiguo de ${n} dejó de entregar ${tr.emotionalTransformation} — nuevo estándar adentro`,
    ],
  };

  const activeSarMap    = isES ? sarMapES    : sarMap;
  const activePainMap   = isES ? painMapES   : painMap;
  const activeCurMap    = isES ? curiosityMapES : curiosityMap;
  const activeScriptMap = isES ? scriptMapES : scriptMap;
  const activeCtaMap    = isES ? ctaMapES    : ctaMap;
  const activeTitleMap  = isES ? titleMapES  : titleMap;

  const rawOutput = {
    desires:          intel.desires,
    fears:            intel.fears,
    pains:            intel.pains,
    transformation:   intel.transformation,
    sarTrigger:       pick(activeSarMap[hookType]    ?? activeSarMap.curiosity),
    painTrigger:      pick(activePainMap[intensity]  ?? activePainMap.medium),
    curiosityTrigger: pick(activeCurMap[hookType]    ?? activeCurMap.curiosity),
    script:           (activeScriptMap[hookType]     ?? activeScriptMap.curiosity) + si.scriptContext,
  };
  // Apply Context Engine to body text — max 2 original occurrences globally across 8 fields
  const body     = ctxBatch(rawOutput, n, au, pr, isES, 2);
  // Title + CTA use independent counters so they always get the original phrase once
  // Stage CTA overrides generic CTA pool — stage psychology determines the right ask
  const cta      = ctxApply(pick(si.ctaPool),                                             n, au, pr, isES);
  const title    = ctxApply(pick(activeTitleMap[hookType]  ?? activeTitleMap.curiosity), n, au, pr, isES);
  const hashtags = buildHashtags(n, au, pr, hookType, isES);

  // ── Audience Lock Engine — purity scan + debug log ───────────────────────
  const lockInfo = audienceLock(au, n, isES);
  const purity   = audiencePurityScan({ ...body, cta, title }, lockInfo.blacklist);
  console.log([
    "╔══ AUDIENCE LOCK ENGINE ══════════════════════════════════════════",
    `║  Original Audience : ${au}`,
    `║  Detected Subject  : ${lockInfo.subject || "(plain)"}`,
    `║  Detected Goal     : ${lockInfo.goal     || "(none)"}`,
    `║  Safe Variants     : ${lockInfo.variants.length}`,
    `║  Blocked Terms     : ${lockInfo.blacklist.length}`,
    `║  Consistency Score : ${purity.score}/100`,
    purity.contamination.length
      ? `║  ⚠ Contamination   : ${purity.contamination.join(", ")}`
      : "║  ✓ No contamination detected",
    "╚══════════════════════════════════════════════════════════════════",
  ].join("\n"));

  res.json({ ...body, cta, title, hashtags, audienceConsistencyScore: purity.score, stageLabel: si.label, stageVocabulary: si.vocabulary });
});

// ── POST /api/content-strategy/generate ──────────────────────────────────────
app.post("/api/content-strategy/generate", (req, res) => {
  const {
    niche    = "",
    product  = "",
    audience = "",
    goal     = "sales",
    language = "Español",
    businessStage = "Microempresa",
  } = req.body ?? {};
  if (!niche.trim()) return res.status(400).json({ error: "niche is required" });

  const n   = niche.trim();
  const pr   = product.trim();
  const au   = audience.trim();
  const g    = goal.toLowerCase().replace(/[\s-]+/g, "_");
  const isES = language !== "English";
  const _auSubj2 = ceSubject(au, isES);
  const au1  = (_auSubj2 && _auSubj2 !== au) ? _auSubj2.split(/\s+/)[0] : au.replace(/s$/i, "");
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ── 1. Content mix ────────────────────────────────────────────────────────
  const mixMap = {
    sales: [
      { type: "pain",        pct: 30 },
      { type: "authority",   pct: 25 },
      { type: "opportunity", pct: 20 },
      { type: "story",       pct: 15 },
      { type: "curiosity",   pct: 10 },
    ],
    leads: [
      { type: "curiosity",   pct: 30 },
      { type: "pain",        pct: 25 },
      { type: "authority",   pct: 20 },
      { type: "story",       pct: 15 },
      { type: "opportunity", pct: 10 },
    ],
    brand_awareness: [
      { type: "viral",       pct: 25 },
      { type: "curiosity",   pct: 25 },
      { type: "story",       pct: 20 },
      { type: "authority",   pct: 15 },
      { type: "opportunity", pct: 15 },
    ],
    authority: [
      { type: "authority",   pct: 35 },
      { type: "story",       pct: 25 },
      { type: "curiosity",   pct: 20 },
      { type: "mistake",     pct: 15 },
      { type: "pain",        pct: 5  },
    ],
    engagement: [
      { type: "viral",       pct: 30 },
      { type: "story",       pct: 25 },
      { type: "curiosity",   pct: 20 },
      { type: "mistake",     pct: 15 },
      { type: "opportunity", pct: 10 },
    ],
  };
  const contentMix = mixMap[g] ?? mixMap.sales;

  // ── 2. Weekly schedule ────────────────────────────────────────────────────
  const weeklyMap = {
    sales: [
      { day: "Monday",    hookType: "pain",        contentType: "Educational",       note: `Surface the core problem ${au || "your audience"} hasn't fully named yet — problem awareness unlocks purchase intent.` },
      { day: "Tuesday",   hookType: "authority",   contentType: "Social Proof",      note: "Establish credibility before the mid-week high-intent window with proof-driven content." },
      { day: "Wednesday", hookType: "opportunity", contentType: "Product Demo",      note: `Mid-week captures peak purchase intent — present ${pr || "your offer"} directly and clearly.` },
      { day: "Thursday",  hookType: "story",       contentType: "Story",             note: "Human narrative after direct sales content maintains trust and reduces resistance." },
      { day: "Friday",    hookType: "pain",        contentType: "Listicle",          note: "End-of-week pain reinforcement with a clear, low-friction CTA." },
      { day: "Saturday",  hookType: "curiosity",   contentType: "Q&A",              note: "Curiosity-driven community content keeps algorithm engagement warm over the weekend." },
      { day: "Sunday",    hookType: "authority",   contentType: "Educational",       note: `Pre-week authority content primes ${au || "your audience"} before Monday's peak intent window.` },
    ],
    leads: [
      { day: "Monday",    hookType: "curiosity",   contentType: "Educational",       note: `Open the week with an insight gap — ${au || "your audience"} in a learning mindset is most likely to follow a link.` },
      { day: "Tuesday",   hookType: "pain",        contentType: "Listicle",          note: "Name the specific pain before offering the solution. Problem-aware leads are the easiest to convert." },
      { day: "Wednesday", hookType: "authority",   contentType: "Social Proof",      note: "Proof mid-week reduces friction for link-in-bio clicks and DM inquiries." },
      { day: "Thursday",  hookType: "story",       contentType: "Story",             note: "Story builds emotional trust — Thursday is the strongest day for DM inquiries and opt-ins." },
      { day: "Friday",    hookType: "curiosity",   contentType: "Q&A",              note: "Engage the audience with an unresolved question that your lead magnet answers." },
      { day: "Saturday",  hookType: "opportunity", contentType: "Trending",          note: "Weekend trend content expands reach to cold audiences who haven't found you yet." },
      { day: "Sunday",    hookType: "pain",        contentType: "Educational",       note: "Sunday reflection content connects with problem-aware audiences planning their next move." },
    ],
    brand_awareness: [
      { day: "Monday",    hookType: "story",       contentType: "Behind the Scenes", note: "Start the week with authenticity — behind-the-scenes content builds long-term connection." },
      { day: "Tuesday",   hookType: "curiosity",   contentType: "Educational",       note: "Curiosity-driven value content earns shares from new audiences who didn't follow you yet." },
      { day: "Wednesday", hookType: "viral",       contentType: "Trending",          note: "Mid-week trend content maximizes algorithmic reach — peak sharing day for most niches." },
      { day: "Thursday",  hookType: "authority",   contentType: "Listicle",          note: `Establish ${n} credibility before the weekend engagement window with shareable frameworks.` },
      { day: "Friday",    hookType: "story",       contentType: "Challenge",         note: "Interactive challenge content drives community participation and profile visits." },
      { day: "Saturday",  hookType: "viral",       contentType: "Hot Take",          note: "Weekend hot takes generate comments and shares from audiences who don't follow you yet." },
      { day: "Sunday",    hookType: "curiosity",   contentType: "Q&A",              note: "Community Q&A deepens connection with existing followers and improves retention." },
    ],
    authority: [
      { day: "Monday",    hookType: "authority",   contentType: "Educational",       note: `Lead with expertise — Monday audiences are in a learning mindset and reward genuine ${n} insight.` },
      { day: "Tuesday",   hookType: "mistake",     contentType: "Listicle",          note: "Mistake content signals deep domain knowledge. Creates saves — the highest-trust engagement signal." },
      { day: "Wednesday", hookType: "story",       contentType: "Story",             note: "Personal narrative humanizes your expertise and creates emotional trust alongside intellectual credibility." },
      { day: "Thursday",  hookType: "authority",   contentType: "Social Proof",      note: "Case studies and outcome content on Thursday reinforce the credibility established earlier in the week." },
      { day: "Friday",    hookType: "curiosity",   contentType: "Educational",       note: "End-of-week insight creates anticipation and positions you as the go-to source before the weekend." },
      { day: "Saturday",  hookType: "mistake",     contentType: "Hot Take",          note: "Contrarian weekend content drives discussion and introduces your perspective to new audiences." },
      { day: "Sunday",    hookType: "story",       contentType: "Behind the Scenes", note: "Behind-the-scenes content builds relationship depth with your core authority audience." },
    ],
    engagement: [
      { day: "Monday",    hookType: "curiosity",   contentType: "Q&A",              note: `Start with a question — Monday audiences respond strongly to participation-driven content.` },
      { day: "Tuesday",   hookType: "mistake",     contentType: "Hot Take",          note: "Mistake content generates comments from people who've experienced the same situation." },
      { day: "Wednesday", hookType: "viral",       contentType: "Challenge",         note: "Mid-week challenges drive the highest participation rates of any content format." },
      { day: "Thursday",  hookType: "story",       contentType: "Story",             note: "Story content builds the emotional equity that drives saves, shares, and DMs." },
      { day: "Friday",    hookType: "viral",       contentType: "Trending",          note: "Trending content on Friday captures weekend sharing behavior at its peak." },
      { day: "Saturday",  hookType: "curiosity",   contentType: "Behind the Scenes", note: "Saturday audiences engage more deeply with authentic, unpolished content." },
      { day: "Sunday",    hookType: "story",       contentType: "Q&A",              note: "Community conversation on Sunday builds anticipation and strengthens following loyalty." },
    ],
  };
  const weeklyMapES = {
    sales: [
      { day: "Lunes",     hookType: "pain",        contentType: "Educativo",          note: `Expón el problema central que ${au || "tu audiencia"} todavía no ha nombrado del todo — la conciencia del problema desbloquea la intención de compra.` },
      { day: "Martes",    hookType: "authority",   contentType: "Prueba Social",      note: "Establece credibilidad antes de la ventana de alta intención de mitad de semana con contenido basado en pruebas." },
      { day: "Miércoles", hookType: "opportunity", contentType: "Demo del Producto",  note: `Mitad de semana captura el pico de intención de compra — presenta ${pr || "tu oferta"} directamente y con claridad.` },
      { day: "Jueves",    hookType: "story",       contentType: "Historia",           note: "La narrativa humana después del contenido de ventas directo mantiene la confianza y reduce la resistencia." },
      { day: "Viernes",   hookType: "pain",        contentType: "Lista",              note: "Refuerzo de dolor de fin de semana con un CTA claro y de baja fricción." },
      { day: "Sábado",    hookType: "curiosity",   contentType: "Preguntas y Respuestas", note: "Contenido de comunidad impulsado por curiosidad mantiene el engagement algorítmico activo durante el fin de semana." },
      { day: "Domingo",   hookType: "authority",   contentType: "Educativo",          note: `Contenido de autoridad de pre-semana prepara a ${au || "tu audiencia"} antes de la ventana de mayor intención del lunes.` },
    ],
    leads: [
      { day: "Lunes",     hookType: "curiosity",   contentType: "Educativo",          note: `Abre la semana con una brecha de insight — ${au || "tu audiencia"} en mentalidad de aprendizaje es más probable que haga clic en un enlace.` },
      { day: "Martes",    hookType: "pain",        contentType: "Lista",              note: "Nombra el dolor específico antes de ofrecer la solución. Los prospectos conscientes del problema son los más fáciles de convertir." },
      { day: "Miércoles", hookType: "authority",   contentType: "Prueba Social",      note: "La prueba a mitad de semana reduce la fricción para clics en bio y consultas por DM." },
      { day: "Jueves",    hookType: "story",       contentType: "Historia",           note: "La historia genera confianza emocional — el jueves es el día más fuerte para consultas y suscripciones." },
      { day: "Viernes",   hookType: "curiosity",   contentType: "Preguntas y Respuestas", note: "Involucra a la audiencia con una pregunta no resuelta que responde tu lead magnet." },
      { day: "Sábado",    hookType: "opportunity", contentType: "Tendencia",          note: "El contenido de tendencia del fin de semana expande el alcance a audiencias frías." },
      { day: "Domingo",   hookType: "pain",        contentType: "Educativo",          note: "El contenido de reflexión dominical conecta con audiencias conscientes del problema que planean su próximo movimiento." },
    ],
    brand_awareness: [
      { day: "Lunes",     hookType: "story",       contentType: "Detrás de Escena",   note: "Empieza la semana con autenticidad — el contenido detrás de escena construye conexión a largo plazo." },
      { day: "Martes",    hookType: "curiosity",   contentType: "Educativo",          note: "El contenido de valor impulsado por curiosidad gana compartidos de nuevas audiencias que aún no te siguen." },
      { day: "Miércoles", hookType: "viral",       contentType: "Tendencia",          note: "El contenido de tendencia de mitad de semana maximiza el alcance algorítmico — el día de mayor compartición en la mayoría de nichos." },
      { day: "Jueves",    hookType: "authority",   contentType: "Lista",              note: `Establece credibilidad en ${n} antes de la ventana de engagement del fin de semana con marcos compartibles.` },
      { day: "Viernes",   hookType: "story",       contentType: "Desafío",            note: "El contenido de desafío interactivo impulsa la participación de la comunidad y visitas al perfil." },
      { day: "Sábado",    hookType: "viral",       contentType: "Opinión Fuerte",     note: "Las opiniones fuertes del fin de semana generan comentarios y compartidos de audiencias que aún no te siguen." },
      { day: "Domingo",   hookType: "curiosity",   contentType: "Preguntas y Respuestas", note: "Las preguntas y respuestas de comunidad profundizan la conexión con seguidores existentes y mejoran la retención." },
    ],
    authority: [
      { day: "Lunes",     hookType: "authority",   contentType: "Educativo",          note: `Lidera con expertise — las audiencias del lunes están en mentalidad de aprendizaje y recompensan el insight genuino de ${n}.` },
      { day: "Martes",    hookType: "mistake",     contentType: "Lista",              note: "El contenido de errores señala conocimiento profundo del dominio. Genera guardados — la señal de engagement de mayor confianza." },
      { day: "Miércoles", hookType: "story",       contentType: "Historia",           note: "La narrativa personal humaniza tu expertise y genera confianza emocional junto a la credibilidad intelectual." },
      { day: "Jueves",    hookType: "authority",   contentType: "Prueba Social",      note: "Los casos de estudio del jueves refuerzan la credibilidad establecida a principios de semana." },
      { day: "Viernes",   hookType: "curiosity",   contentType: "Educativo",          note: "El insight de fin de semana genera anticipación y te posiciona como la fuente de referencia antes del fin de semana." },
      { day: "Sábado",    hookType: "mistake",     contentType: "Opinión Fuerte",     note: "El contenido contrario del fin de semana genera discusión e introduce tu perspectiva a nuevas audiencias." },
      { day: "Domingo",   hookType: "story",       contentType: "Detrás de Escena",   note: "El contenido detrás de escena construye profundidad de relación con tu audiencia central de autoridad." },
    ],
    engagement: [
      { day: "Lunes",     hookType: "curiosity",   contentType: "Preguntas y Respuestas", note: `Empieza con una pregunta — las audiencias del lunes responden fuerte al contenido participativo.` },
      { day: "Martes",    hookType: "mistake",     contentType: "Opinión Fuerte",     note: "El contenido de errores genera comentarios de personas que vivieron la misma situación." },
      { day: "Miércoles", hookType: "viral",       contentType: "Desafío",            note: "Los desafíos de mitad de semana generan las tasas de participación más altas de cualquier formato." },
      { day: "Jueves",    hookType: "story",       contentType: "Historia",           note: "El contenido de historia construye el capital emocional que impulsa guardados, compartidos y DMs." },
      { day: "Viernes",   hookType: "viral",       contentType: "Tendencia",          note: "El contenido de tendencia del viernes captura el comportamiento de compartición del fin de semana en su pico." },
      { day: "Sábado",    hookType: "curiosity",   contentType: "Detrás de Escena",   note: "Las audiencias del sábado se involucran más profundamente con contenido auténtico y sin pulir." },
      { day: "Domingo",   hookType: "story",       contentType: "Preguntas y Respuestas", note: "La conversación de comunidad del domingo construye anticipación y fortalece la lealtad de los seguidores." },
    ],
  };

  const weeklySchedule = isES
    ? (weeklyMapES[g] ?? weeklyMapES.sales)
    : (weeklyMap[g]   ?? weeklyMap.sales);

  // ── 3. Strategic reasoning ────────────────────────────────────────────────
  const whyMixWorks = {
    sales: [
      `A sales-oriented ${n} strategy front-loads pain content because purchase decisions are driven by problem awareness, not feature lists. ${au || "Your audience"} won't buy ${pr || "your offer"} until they've fully recognized the cost of their current situation. Pain content does that work. Authority content then creates the credibility required to make the solution believable. Opportunity content closes the loop by making the timing feel urgent and specific rather than abstract.`,
      `For ${n} creators focused on sales, the most common mistake is leading with product content before the audience is problem-aware. This mix corrects that: pain content creates the problem frame, authority content establishes trust in the solution, and story content makes the transformation feel achievable for ${au || "your specific audience"}.`,
    ],
    leads: [
      `Lead generation in ${n} depends on creating an information gap that only your lead magnet can close. Curiosity content is the engine — it creates the sense that you have answers ${au || "your audience"} hasn't found yet. Pain content identifies the specific problem your lead magnet solves. Authority content makes the opt-in feel like a low-risk decision rather than a commitment.`,
      `The most effective lead generation strategy for ${n} builds a sequential trust journey: curiosity hooks new audiences, pain content qualifies them as problem-aware, and story content makes them feel understood before the ask. This mix prioritizes that sequence over raw reach, producing leads that are significantly more likely to convert.`,
    ],
    brand_awareness: [
      `Brand awareness in ${n} is built through shareability and distinctiveness, not through consistency alone. Viral and curiosity content earns distribution from audiences who don't follow you yet — the algorithm rewards content that creates discovery behavior. Story content builds the emotional texture that makes your brand memorable once someone finds you.`,
      `For a brand awareness goal in ${n}, the mix prioritizes content that travels — viral formats, curiosity gaps, and story-driven content that ${au || "your audience"} wants to share or save. Authority content provides credibility for those who discover you through the viral pieces and want to understand who you are before following.`,
    ],
    authority: [
      `Authority in ${n} is built through a specific combination: deep expertise demonstrated consistently, mistake content that signals nuanced understanding of where ${au || "your audience"} struggles, and story content that humanizes the expertise. A pure authority approach without story becomes academic. Without mistake content, it lacks the specificity that signals genuine depth.`,
      `Building authority in ${n} requires content that demonstrates knowledge, not just states it. Mistake content is particularly powerful because it signals that you understand the terrain well enough to see where others get it wrong. Story content builds the parasocial trust that makes ${au || "your audience"} treat your authority as personally relevant rather than generically impressive.`,
    ],
    engagement: [
      `Engagement-focused ${n} content works through emotional resonance and participation design. Viral formats create sharing behavior, but they don't build community on their own. Story and mistake content generate the comments that signal genuine connection — the algorithm treats comment velocity as a stronger quality signal than likes or views for most content formats.`,
      `The engagement mix prioritizes content that invites a response: challenges, hot takes, Q&As, and stories that people recognize themselves in. For ${n} audiences, mistake content consistently outperforms educational content on engagement metrics because it creates the "that's me" reaction that makes people want to comment, share, and save.`,
    ],
  };

  const audiencePsychology = {
    sales: [
      `${au || "This audience"} moves through a predictable psychological sequence before purchasing in ${n}: problem recognition, solution awareness, trust formation, and urgency. Most ${n} creators skip straight to solution awareness, but ${au || "your audience"} won't move past it without first feeling that their problem has been fully seen. Pain content does the heavy lifting on problem recognition. Without it, even strong offers land flat.`,
      `The psychology of ${au || "this audience"} in ${n} is shaped by previous failed attempts. They've likely tried other approaches. What they're evaluating isn't just whether ${pr || "your product"} works — it's whether it works for someone in their specific situation. Authority and story content answers that question by making the transformation feel real and specific, not theoretical.`,
    ],
    leads: [
      `${au || "Your audience"} becomes a lead when they feel understood before they feel sold to. In ${n}, the curiosity-to-pain sequence works because curiosity attracts, but pain qualifies. Someone who watches a curiosity video about ${n} is interested. Someone who watches a pain video and feels it personally is a potential customer. The opt-in ask performs best after that emotional recognition moment.`,
      `Lead generation psychology for ${n} is rooted in reciprocity: ${au || "your audience"} will give you their contact information when they believe the value on the other side is real and specific. The content that creates that belief most effectively isn't the most polished — it's the most accurate. Content that correctly names the specific experience of being a ${au1 || "person in this audience"} creates an instant credibility signal that makes the opt-in feel obvious.`,
    ],
    brand_awareness: [
      `${au || "Your audience"} discovers new ${n} creators through two mechanisms: algorithmic push (trending and viral content) and peer sharing (story and curiosity content that people want to send to someone they know). Building brand awareness requires showing up in both channels. Viral content earns algorithmic distribution. Story and curiosity content earns the personal share that introduces you to a trusted friend's network.`,
      `For brand awareness in ${n}, the psychological driver is identity: ${au || "your audience"} shares content that reflects how they see themselves or how they want to be seen. Content that captures the specific experience of being a ${au1 || "person in this space"} gets shared as a form of self-expression. This is why niche specificity outperforms broad appeal for brand awareness — the more exactly right it is, the more strongly it activates sharing behavior.`,
    ],
    authority: [
      `${au || "Your audience"} in ${n} extends trust to authority figures through a specific mechanism: they need to feel that you've been where they are and understand what it costs. Pure credential-based authority is weaker in short-form video than experiential authority. Mistake content earns trust by demonstrating that you understand the exact shape of where people get stuck — which can only come from genuine expertise or direct experience.`,
      `The psychology of authority in ${n} is built on pattern recognition: ${au || "your audience"} is constantly evaluating whether you actually know what it's like to operate in their world. Authority content that uses the right language, names the right problems, and demonstrates the right level of specificity creates an instant recognition signal. Story content then adds the personal layer that makes expertise feel safe to trust rather than intimidating to engage with.`,
    ],
    engagement: [
      `${au || "Your audience"} engages most actively with content that creates the "that's exactly me" reaction. In ${n}, this means naming situations and feelings with enough specificity that people feel personally seen. Broad educational content informs but doesn't activate engagement. Specific mistake content, personal stories, and participation-designed formats (challenges, Q&As, hot takes) all work because they require the audience to place themselves in the scenario.`,
      `Engagement psychology in ${n} is driven by the need for community recognition — ${au || "your audience"} comments when they feel part of a shared experience. Viral content introduces them to the community. Story and mistake content makes them feel understood within it. Challenge content makes participation feel low-risk and socially rewarding. The mix is designed to activate each of these mechanisms in sequence throughout the week.`,
    ],
  };

  const contentDominant = {
    sales:           `Pain content should dominate your ${n} feed at 30%. It's the mechanism that makes everything else convert. Without it, even your strongest authority and opportunity content will generate passive engagement rather than purchase intent. Every pain post is doing pre-sales work that your product content can't do alone.`,
    leads:           `Curiosity content at 30% should lead your ${n} strategy. It creates the information gap that makes ${au || "your audience"} want what's behind your link. Every curiosity post is a lead generation mechanism — it builds a pipeline of people who believe you have answers they haven't found yet.`,
    brand_awareness: `Viral and curiosity content should dominate equally at 25% each. Viral earns reach from people who don't know you. Curiosity earns follows from people who just found you. Together they create a consistent flow of new audience exposure — which is the only mechanism that makes brand awareness scale.`,
    authority:       `Authority content at 35% should define your ${n} presence. Every educational post, framework, and insight is compounding your perceived expertise. ${au || "Your audience"} needs to encounter your depth multiple times before the trust required for authority status forms. Consistency in this category is the non-negotiable variable.`,
    engagement:      `Viral content at 30% sets the algorithmic baseline for your ${n} presence. Without consistent reach-driving content, even your best story and community posts reach a shrinking audience. Viral content is infrastructure — it keeps the distribution alive so that your higher-connection content actually reaches the people it's designed for.`,
  };

  // ── 4. Posting recommendation ─────────────────────────────────────────────
  const postingMap = {
    sales:           { recommended: "5x_week", reason: `Sales conversion requires consistent presence in the feed across the purchase decision window. 5x/week maintains visibility without overwhelming — ${au || "your audience"} needs 5–7 exposures to a solution before taking action.` },
    leads:           { recommended: "5x_week", reason: `Lead generation is a volume and consistency game. 5x/week gives you enough touchpoints to move ${au || "your audience"} from problem-aware to opt-in ready within a single week cycle.` },
    brand_awareness: { recommended: "daily",   reason: `Brand awareness scales with frequency. Daily posting in ${n} maximizes algorithmic surface area and creates the repetition that turns passive viewers into active followers.` },
    authority:       { recommended: "3x_week", reason: `Authority is built on depth, not volume. 3x/week gives you the production time to create content that genuinely demonstrates expertise — which is more valuable than daily shallow content for ${n} authority positioning.` },
    engagement:      { recommended: "daily",   reason: `Engagement compounds with frequency. Daily content gives ${au || "your audience"} more opportunities to participate, and the algorithm rewards engagement velocity, which requires consistent touchpoints.` },
  };
  const postingMapES = {
    sales:           { recommended: "5x_week", reason: `Las ventas requieren presencia consistente durante la ventana de decisión de compra. 5 veces/semana mantiene visibilidad sin saturar — ${au || "tu audiencia"} necesita entre 5 y 7 exposiciones a una solución antes de actuar.` },
    leads:           { recommended: "5x_week", reason: `La generación de prospectos es un juego de volumen y consistencia. 5 veces/semana da suficientes puntos de contacto para mover a ${au || "tu audiencia"} de consciente del problema a listo para optar dentro de un ciclo de semana.` },
    brand_awareness: { recommended: "daily",   reason: `La conciencia de marca escala con frecuencia. Publicar diariamente en ${n} maximiza la superficie algorítmica y crea la repetición que convierte espectadores pasivos en seguidores activos.` },
    authority:       { recommended: "3x_week", reason: `La autoridad se construye con profundidad, no con volumen. 3 veces/semana te da tiempo de producir contenido que realmente demuestra expertise — lo que vale más que contenido diario superficial para el posicionamiento de autoridad en ${n}.` },
    engagement:      { recommended: "daily",   reason: `El engagement se compone con frecuencia. El contenido diario da a ${au || "tu audiencia"} más oportunidades de participar, y el algoritmo recompensa la velocidad de engagement, que requiere puntos de contacto consistentes.` },
  };
  const postingRec = isES
    ? (postingMapES[g] ?? postingMapES.sales)
    : (postingMap[g]   ?? postingMap.sales);

  // ── 5. CTA recommendations ────────────────────────────────────────────────
  const ctaNicheMap = {
    sales: [
      `Comment "${n.toUpperCase()}" below and I'll send you the breakdown — no pitch, just the information.`,
      `Save this post. When you're ready to stop guessing in ${n}, the link in bio is where you start.`,
      `DM me "${n}" — I'll show ${au || "you"} the exact first step based on where you are right now.`,
    ],
    leads: [
      `Follow + comment "SEND IT" — I'll DM you the free ${n} framework I use with every ${au1 || "client"}.`,
      `The full ${n} guide is in my bio. It's free. ${au || "Your audience"} who grab it move faster than those who don't.`,
      `Comment "GUIDE" and I'll send you the ${n} resource that most ${au} spend months trying to find on their own.`,
    ],
    brand_awareness: [
      `If this landed, follow — I post ${n} content like this every week.`,
      `Share this with one ${au1 || "person"} who needs to hear it right now.`,
      `Save this for the next time you're stuck in ${n}. You'll thank yourself.`,
    ],
    authority: [
      `Follow if you want the kind of ${n} insight that most people charge for.`,
      `Save this framework — it took me years to figure out and 30 seconds to share.`,
      `Comment "FRAMEWORK" and I'll send you the full version — goes deeper than I could fit in this video.`,
    ],
    engagement: [
      `Comment your answer below — I read every single one and reply to the real ones.`,
      `Tag someone who needs to see this. Let's see who you're thinking of.`,
      `Agree or disagree? Comment your take — I'm genuinely curious where ${au || "this audience"} lands on this.`,
    ],
  };

  const ctaNicheMapES = {
    sales: [
      `Comenta "${n.toUpperCase()}" abajo y te mando el desglose completo — sin venta, solo la información.`,
      `Guarda esta publicación. Cuando estés listo para dejar de adivinar en ${n}, el enlace en bio es donde empiezas.`,
      `Escríbeme "${n}" por DM — te muestro el primer paso exacto según donde estás ahora mismo.`,
    ],
    leads: [
      `Sígueme + comenta "ENVÍAME" — te mando por DM el marco gratuito de ${n} que uso con cada cliente.`,
      `La guía completa de ${n} está en mi bio. Es gratuita. Los ${au || "que la usan"} avanzan más rápido que los que no.`,
      `Comenta "GUÍA" y te mando el recurso de ${n} que la mayoría de ${au} tarda meses en encontrar por su cuenta.`,
    ],
    brand_awareness: [
      `Si esto te llegó, sígueme — publico contenido de ${n} así cada semana.`,
      `Comparte esto con un ${au1 || "persona"} que lo necesita escuchar ahora mismo.`,
      `Guarda esto para la próxima vez que estés estancado en ${n}. Te lo agradecerás.`,
    ],
    authority: [
      `Sígueme si quieres el tipo de insight de ${n} por el que la mayoría cobra.`,
      `Guarda este marco — me tomó años entenderlo y 30 segundos compartirlo.`,
      `Comenta "MARCO" y te mando la versión completa — va más profundo de lo que cabe en este video.`,
    ],
    engagement: [
      `Comenta tu respuesta abajo — leo todas y respondo a las reales.`,
      `Etiqueta a alguien que necesita ver esto. A ver en quién piensas.`,
      `¿De acuerdo o en desacuerdo? Comenta tu opinión — tengo genuina curiosidad de dónde caen los ${au || "de esta audiencia"} en esto.`,
    ],
  };

  const ctaLeadGen = [
    `Comment "${n.toUpperCase()} GUIDE" and I'll DM you the free resource that covers this in full.`,
    `Follow + comment "SEND IT" and I'll send you the exact framework I use — free, no strings.`,
    `The free ${n} toolkit is linked in my bio. Grab it before I start charging for it.`,
    `DM me "START" and I'll walk you through the first step based on exactly where ${au || "you"} are right now.`,
  ];

  const ctaLeadGenES = [
    `Comenta "${n.toUpperCase()} GUÍA" y te mando por DM el recurso gratuito que cubre esto completo.`,
    `Sígueme + comenta "ENVÍAME" y te mando el marco exacto que uso — gratis, sin condiciones.`,
    `El kit gratuito de ${n} está en mi bio. Tómalo antes de que empiece a cobrarlo.`,
    `Escríbeme "EMPEZAR" y te guío por el primer paso según exactamente donde está ${au || "tu situación"} ahora mismo.`,
  ];

  const ctaSales = [
    `${pr || "The full system"} is open right now. Link in bio — 2 minutes to get started, results within a week.`,
    `If you're ready to stop circling this problem in ${n}, ${pr || "the solution"} is in my bio. Link is there.`,
    `Comment "READY" if you're done with the slow version of ${n}. I'll send you the direct link.`,
    `${pr || "It"} closes ${["soon", "this week", "in 48 hours"][Math.floor(Math.random() * 3)]}. Link in bio if ${au || "you"}'re serious about the result.`,
  ];

  const ctaSalesES = [
    `${pr || "El sistema completo"} está disponible ahora. Enlace en bio — 2 minutos para empezar, resultados dentro de una semana.`,
    `Si estás listo para dejar de dar vueltas a este problema en ${n}, ${pr || "la solución"} está en mi bio. El enlace está ahí.`,
    `Comenta "LISTO" si ya terminaste con la versión lenta de ${n}. Te mando el enlace directo.`,
    `${pr || "Cierra"} ${["pronto", "esta semana", "en 48 horas"][Math.floor(Math.random() * 3)]}. Enlace en bio si vas en serio con el resultado.`,
  ];

  const whyMixWorksES = {
    sales: [
      `Una estrategia de ${n} orientada a ventas pone el contenido de dolor al frente porque las decisiones de compra son impulsadas por la conciencia del problema, no por listas de características. ${au || "Tu audiencia"} no comprará ${pr || "tu oferta"} hasta que no haya reconocido completamente el costo de su situación actual. El contenido de dolor hace ese trabajo. El contenido de autoridad crea la credibilidad necesaria para que la solución sea creíble. El contenido de oportunidad cierra el ciclo haciendo que el momento se sienta urgente y específico.`,
      `Para creadores de ${n} enfocados en ventas, el error más común es liderar con contenido de producto antes de que la audiencia sea consciente del problema. Esta mezcla corrige eso: el contenido de dolor crea el marco del problema, el contenido de autoridad establece confianza en la solución, y el contenido de historia hace que la transformación se sienta alcanzable para ${au || "tu audiencia específica"}.`,
    ],
    leads: [
      `La generación de prospectos en ${n} depende de crear una brecha de información que solo tu lead magnet puede cerrar. El contenido de curiosidad es el motor — crea la sensación de que tienes respuestas que ${au || "tu audiencia"} aún no ha encontrado. El contenido de dolor identifica el problema específico que resuelve tu lead magnet. El contenido de autoridad hace que la suscripción se sienta como una decisión de bajo riesgo.`,
      `La estrategia de generación de prospectos más efectiva para ${n} construye un viaje de confianza secuencial: la curiosidad atrae nuevas audiencias, el contenido de dolor los califica como conscientes del problema, y el contenido de historia los hace sentir comprendidos antes del llamado a la acción.`,
    ],
    brand_awareness: [
      `La conciencia de marca en ${n} se construye a través de compartibilidad y distinción, no solo a través de consistencia. El contenido viral y de curiosidad gana distribución de audiencias que aún no te siguen — el algoritmo recompensa el contenido que crea comportamiento de descubrimiento. El contenido de historia construye la textura emocional que hace tu marca memorable.`,
      `Para una meta de conciencia de marca en ${n}, la mezcla prioriza contenido que viaja — formatos virales, brechas de curiosidad, y contenido narrativo que ${au || "tu audiencia"} quiere compartir o guardar. El contenido de autoridad proporciona credibilidad para quienes te descubren a través de las piezas virales.`,
    ],
    authority: [
      `La autoridad en ${n} se construye a través de una combinación específica: expertise profundo demostrado consistentemente, contenido de errores que señala comprensión matizada de donde ${au || "tu audiencia"} se complica, y contenido de historia que humaniza el expertise. Un enfoque de pura autoridad sin historia se vuelve académico. Sin contenido de errores, le falta la especificidad que señala profundidad genuina.`,
      `Construir autoridad en ${n} requiere contenido que demuestre conocimiento, no que solo lo declare. El contenido de errores es particularmente poderoso porque señala que entiendes el terreno lo suficientemente bien para ver dónde otros se equivocan. El contenido de historia construye la confianza parasocial que hace que tu autoridad se sienta personalmente relevante.`,
    ],
    engagement: [
      `El contenido de ${n} enfocado en engagement funciona a través de resonancia emocional y diseño de participación. Los formatos virales crean comportamiento de compartición, pero no construyen comunidad solos. El contenido de historia y de errores genera los comentarios que señalan conexión genuina — el algoritmo trata la velocidad de comentarios como una señal de calidad más fuerte que los me gusta o las vistas.`,
      `La mezcla de engagement prioriza contenido que invita a una respuesta: desafíos, opiniones fuertes, preguntas y respuestas, e historias en las que las personas se reconocen. Para audiencias de ${n}, el contenido de errores consistentemente supera al contenido educativo en métricas de engagement porque crea la reacción de "soy yo".`,
    ],
  };

  const audiencePsychologyES = {
    sales: [
      `${au || "Esta audiencia"} sigue una secuencia psicológica predecible antes de comprar en ${n}: reconocimiento del problema, conciencia de la solución, formación de confianza y urgencia. La mayoría de los creadores de ${n} saltan directamente a la conciencia de la solución, pero ${au || "tu audiencia"} no avanzará hasta sentir que su problema ha sido completamente visto. El contenido de dolor hace el trabajo pesado en el reconocimiento del problema.`,
      `La psicología de ${au || "esta audiencia"} en ${n} está moldeada por intentos fallidos anteriores. Lo que están evaluando no es solo si ${pr || "tu producto"} funciona — es si funciona para alguien en su situación específica. El contenido de autoridad e historia responde esa pregunta haciendo que la transformación se sienta real y específica, no teórica.`,
    ],
    leads: [
      `${au || "Tu audiencia"} se convierte en prospecto cuando se siente comprendida antes de sentirse vendida. En ${n}, la secuencia curiosidad-dolor funciona porque la curiosidad atrae, pero el dolor califica. Alguien que ve un video de curiosidad sobre ${n} está interesado. Alguien que ve un video de dolor y lo siente personalmente es un potencial cliente.`,
      `La psicología de generación de prospectos para ${n} está basada en reciprocidad: ${au || "tu audiencia"} dará su información de contacto cuando crea que el valor del otro lado es real y específico. El contenido que crea esa creencia más efectivamente no es el más pulido — es el más preciso. El contenido que nombra correctamente la experiencia específica de ser ${au1 || "una persona en esta audiencia"} crea una señal de credibilidad instantánea.`,
    ],
    brand_awareness: [
      `${au || "Tu audiencia"} descubre nuevos creadores de ${n} a través de dos mecanismos: empuje algorítmico (contenido de tendencia y viral) y compartición entre pares (contenido de historia y curiosidad que las personas quieren enviar a alguien que conocen). Construir conciencia de marca requiere aparecer en ambos canales.`,
      `Para la conciencia de marca en ${n}, el impulsor psicológico es la identidad: ${au || "tu audiencia"} comparte contenido que refleja cómo se ven a sí mismos o cómo quieren ser vistos. El contenido que captura la experiencia específica de ser ${au1 || "una persona en este espacio"} se comparte como forma de autoexpresión.`,
    ],
    authority: [
      `${au || "Tu audiencia"} en ${n} extiende confianza a figuras de autoridad a través de un mecanismo específico: necesitan sentir que has estado donde están ellos y entiendes lo que cuesta. La autoridad pura basada en credenciales es más débil en video de formato corto que la autoridad experiencial. El contenido de errores gana confianza demostrando que entiendes la forma exacta donde la gente se complica.`,
      `La psicología de la autoridad en ${n} se construye sobre el reconocimiento de patrones: ${au || "tu audiencia"} evalúa constantemente si realmente sabes cómo es operar en su mundo. El contenido de autoridad que usa el lenguaje correcto, nombra los problemas correctos y demuestra el nivel correcto de especificidad crea una señal de reconocimiento instantánea.`,
    ],
    engagement: [
      `${au || "Tu audiencia"} se involucra más activamente con contenido que crea la reacción de "eso soy exactamente yo". En ${n}, esto significa nombrar situaciones y sentimientos con suficiente especificidad para que las personas se sientan vistas personalmente. El contenido educativo amplio informa pero no activa el engagement.`,
      `La psicología del engagement en ${n} es impulsada por la necesidad de reconocimiento comunitario — ${au || "tu audiencia"} comenta cuando se siente parte de una experiencia compartida. El contenido viral los introduce a la comunidad. El contenido de historia y de errores los hace sentir comprendidos dentro de ella. El contenido de desafío hace que la participación se sienta de bajo riesgo y socialmente gratificante.`,
    ],
  };

  const contentDominantES = {
    sales:           `El contenido de dolor debe dominar tu feed de ${n} al 30%. Es el mecanismo que hace que todo lo demás convierta. Sin él, incluso tu contenido de autoridad y oportunidad más sólido generará engagement pasivo en lugar de intención de compra. Cada publicación de dolor es trabajo de pre-venta que tu contenido de producto no puede hacer solo.`,
    leads:           `El contenido de curiosidad al 30% debe liderar tu estrategia de ${n}. Crea la brecha de información que hace que ${au || "tu audiencia"} quiera lo que hay detrás de tu enlace. Cada publicación de curiosidad es un mecanismo de generación de prospectos — construye un pipeline de personas que creen que tienes respuestas que aún no han encontrado.`,
    brand_awareness: `El contenido viral y de curiosidad debe dominar igualmente al 25% cada uno. El viral gana alcance de personas que no te conocen. La curiosidad gana seguidores de personas que acaban de encontrarte. Juntos crean un flujo consistente de exposición a nueva audiencia — que es el único mecanismo que hace que la conciencia de marca escale.`,
    authority:       `El contenido de autoridad al 35% debe definir tu presencia en ${n}. Cada publicación educativa, marco e insight está componiendo tu expertise percibida. ${au || "Tu audiencia"} necesita encontrar tu profundidad múltiples veces antes de que la confianza necesaria para el estatus de autoridad se forme. La consistencia en esta categoría es la variable no negociable.`,
    engagement:      `El contenido viral al 30% establece la base algorítmica para tu presencia en ${n}. Sin contenido consistente que impulse el alcance, incluso tus mejores publicaciones de historia y comunidad llegan a una audiencia que se reduce. El contenido viral es infraestructura — mantiene la distribución activa para que tu contenido de mayor conexión realmente llegue a las personas para las que está diseñado.`,
  };

  const tr  = buildTransformation(n, pr, isES);
  const si  = buildStageIntelligence(businessStage, n, pr, au, isES);

  const activeWhyMix      = isES ? whyMixWorksES      : whyMixWorks;
  const activeAudPsych    = isES ? audiencePsychologyES: audiencePsychology;
  const activeContentDom  = isES ? contentDominantES   : contentDominant;
  const activeCtaNiche    = isES ? ctaNicheMapES       : ctaNicheMap;
  const activeCtaLeadGen  = isES ? ctaLeadGenES        : ctaLeadGen;
  const activeCtaSales    = isES ? ctaSalesES          : ctaSales;

  const rawReasoning = {
    whyMixWorks:        pick(activeWhyMix[g]     ?? activeWhyMix.sales),
    audiencePsychology: pick(activeAudPsych[g]   ?? activeAudPsych.sales),
    contentDominant:    activeContentDom[g]       ?? activeContentDom.sales,
    stageStrategy:      si.strategyFocus,
  };
  const rawCtas = {
    nicheSpecific: pick(activeCtaNiche[g] ?? activeCtaNiche.sales),
    stageSpecific: pick(si.ctaPool),
    leadGen:       pick(activeCtaLeadGen),
    sales:         pick(activeCtaSales),
  };
  const weeklyWithCtx = weeklySchedule.map((day, idx) => ({
    ...day,
    note: ctxApply(day.note, n, au, pr, isES, 1, 2, 1) + "  " + si.weeklyNote,
  }));
  res.json({
    contentMix,
    weeklySchedule: weeklyWithCtx,
    reasoning:      ctxBatch(rawReasoning, n, au, pr, isES, 2, 3, 2),
    posting:        postingRec,
    ctas:           ctxBatch(rawCtas,      n, au, pr, isES, 1, 2, 1),
  });
});

// ── Video enhancement helpers ─────────────────────────────────────────────────
// Stronger values make a clearly visible before/after difference while staying
// within perceptually natural limits (no clipping, no cartoon look).
const ENHANCE_EQ = {
  //              brightness  contrast  saturation  gamma
  clean_boost:  { brightness:  0.06,  contrast: 1.18, saturation: 1.25, gamma: 1.0  },
  deep_clean:   { brightness:  0.04,  contrast: 1.14, saturation: 1.10, gamma: 1.0  },
  cinematic:    { brightness: -0.03,  contrast: 1.28, saturation: 0.78, gamma: 1.10 },
  social_sharp: { brightness:  0.08,  contrast: 1.32, saturation: 1.42, gamma: 1.0  },
  low_light:    { brightness:  0.20,  contrast: 1.22, saturation: 1.15, gamma: 1.65 },
  audio_cleaner: null,
};

// noiseStrength tiers map directly to the user-facing noise analysis label:
//   "low"     → noiseLabel "Low"/"Very Low"  → hqdn3d=1.5:1.5:4:4  (gentle — preserves skin texture)
//   "medium"  → noiseLabel "Medium"          → hqdn3d=2.5:2.5:6:6  (balanced — clears flat-area grain)
//   "high"    → noiseLabel "High"            → hqdn3d=3:3:8:8      (strong — removes shadow/wall grain)
//   "extreme" → noiseLabel "Extreme"         → hqdn3d=3:3:8:8      (same as high — avoids over-smoothing)
const HQDN3D = {
  low:     "1.5:1.5:4:4",
  medium:  "2.5:2.5:6:6",
  high:    "3:3:8:8",
  extreme: "3:3:8:8",
};

function buildEnhanceFilters(preset, toggles, noiseStrength = "medium", teethWhitening = "off") {
  if (preset === "audio_cleaner") return [];
  const eq = ENHANCE_EQ[preset] ?? ENHANCE_EQ.clean_boost;
  const filters = [];

  // ── 1. DENOISE FIRST ─────────────────────────────────────────────────────
  // Noise must be removed before sharpening: applying unsharp to a noisy frame
  // amplifies grain, creates halos around skin edges, and destroys fine texture.
  // Denoising first lets the sharpener work only on genuine content structure.
  if (preset === "deep_clean") {
    // Deep Clean always uses strong denoise — it is the defining feature of the preset.
    // Fixed at hqdn3d=3:3:8:8 regardless of noiseStrength for consistent heavy removal.
    filters.push("hqdn3d=3:3:8:8");
  } else if (toggles.noiseReduction) {
    filters.push(`hqdn3d=${HQDN3D[noiseStrength] ?? HQDN3D.medium}`);
  } else if (preset === "low_light") {
    // low_light always needs a medium-strength base pass: gamma lift amplifies grain
    // so the "low" tier is not enough to suppress it visibly
    filters.push(`hqdn3d=${HQDN3D.medium}`);
  }

  // ── 2. EQ (brightness / contrast / saturation / gamma) ───────────────────
  const eqParts = [];
  if (toggles.brightness)      eqParts.push(`brightness=${eq.brightness}`);
  if (toggles.contrast)        eqParts.push(`contrast=${eq.contrast}`);
  if (toggles.colorCorrection) {
    eqParts.push(`saturation=${eq.saturation}`);
    if (eq.gamma !== 1.0) eqParts.push(`gamma=${eq.gamma}`);
  }
  if (eqParts.length) filters.push(`eq=${eqParts.join(":")}`);

  // ── 3. Cinematic colour grade + vignette ─────────────────────────────────
  // NOTE: Teeth whitening is now handled via filter_complex (lumakey masking)
  // in buildTeethWhiteningComplex() — NOT inside this simple filter chain.
  if (preset === "cinematic") {
    filters.push(
      "curves=r='0/0 0.45/0.48 1/0.97':g='0/0 0.5/0.5 1/1':b='0/0.04 0.5/0.53 1/1.04'"
    );
    filters.push("vignette=angle=PI/5:mode=forward");
  }

  // ── 5. SHARPEN LAST ───────────────────────────────────────────────────────
  // Applied after denoise + colour grade so it recovers micro-detail without
  // creating halos or amplifying noise. Amounts are intentionally moderate to
  // avoid clipping-induced ringing on skin and facial texture.
  if (preset === "deep_clean") {
    // Always apply gentle facial detail recovery after the strong denoise.
    // unsharp=3:3:0.3 recovers subtle edge structure without over-sharpening skin.
    const amt = toggles.sharpness ? 0.5 : 0.3;
    filters.push(`unsharp=3:3:${amt}:3:3:0`);
  } else if (toggles.sharpness) {
    const amt = preset === "social_sharp" ? 2.0 : 1.2;
    filters.push(`unsharp=5:5:${amt}:5:5:0`);
  } else if (preset === "social_sharp") {
    filters.push("unsharp=3:3:0.8:3:3:0");
  }

  // ── 6. Ensure even pixel dimensions (required for yuv420p / libx264) ─────
  filters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");

  return filters;
}

// ── Teeth whitening via lumakey masking ───────────────────────────────────────
// Applies brightness boost + saturation reduction ONLY to bright, near-white
// pixels (luma > 0.50) using FFmpeg filter_complex with lumakey + maskedmerge.
// This targets teeth/whites while leaving lips, skin, gums, and shadows intact.
//
// Exact adjustments match user spec:
//   LOW:    brightness +5%, saturation -8%
//   MEDIUM: brightness +10%, saturation -15%
//   HIGH:   brightness +15%, saturation -25%
function buildTeethWhiteningComplex(preFilters, teethLevel) {
  const scaleFilter  = "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  const chainFilters = preFilters.filter(f => !f.startsWith("scale="));

  const TW = {
    low:    { sat: 0.92, bright: 0.05 },
    medium: { sat: 0.85, bright: 0.10 },
    high:   { sat: 0.75, bright: 0.15 },
  };
  const { sat, bright } = TW[teethLevel] ?? TW.low;

  // Flow:
  //   [0:v] → pre-filters → split(3) → [base], [src_mask], [src_effect]
  //   [src_effect] → hue(s=SAT) + eq(brightness=BRIGHT) → [whitened]
  //   [src_mask] → lumakey(select bright pixels) + alphaextract → [mask]
  //   [base][whitened][mask] → maskedmerge → [twout]
  //   [twout] → scale → [v]
  //
  // lumakey threshold=0.0 tolerance=0.50: pixels with luma < 0.50 become
  // transparent (alpha=0); bright pixels (luma > 0.50) stay opaque (alpha=255).
  // alphaextract converts this to grayscale: teeth zone = white, rest = black.
  // maskedmerge applies [whitened] only where mask is white (teeth/whites area).
  let graph = "";
  if (chainFilters.length > 0) {
    graph += `[0:v]${chainFilters.join(",")}[_prefilt];`;
    graph += `[_prefilt]split=3[_base][_src_mask][_src_effect];`;
  } else {
    graph += `[0:v]split=3[_base][_src_mask][_src_effect];`;
  }
  graph += `[_src_effect]hue=s=${sat},eq=brightness=${bright}[_whitened];`;
  graph += `[_src_mask]lumakey=threshold=0.0:tolerance=0.50:softness=0.20,alphaextract[_mask];`;
  graph += `[_base][_whitened][_mask]maskedmerge[_twout];`;
  graph += `[_twout]${scaleFilter}[v]`;

  return graph;
}

// ── POST /api/preview/video — transcode any input to browser-safe H.264 ───────
app.post(
  "/api/preview/video",
  express.raw({ type: "*/*", limit: "500mb" }),
  async (req, res) => {
    if (!FFMPEG) {
      return res.status(500).json({ error: "FFmpeg not available on this server." });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "No video data received." });
    }

    const id         = randomBytes(8).toString("hex");
    const inputPath  = join(tmpdir(), `vyron-prev-in-${id}`);
    const outputPath = join(tmpdir(), `vyron-prev-out-${id}.mp4`);

    const cleanup = () => {
      for (const p of [inputPath, outputPath]) {
        try { if (existsSync(p)) unlinkSync(p); } catch {}
      }
    };

    try {
      writeFileSync(inputPath, req.body);

      await execFileAsync(FFMPEG, [
        "-y", "-i", inputPath,
        "-map",       "0:v:0",
        "-map",       "0:a:0?",
        // Video — H.264 Baseline Level 4.1 (supports up to 1080p; Level 3.0 is
        // too restrictive for HD content and causes Android WebView rejection)
        "-c:v",       "libx264",
        "-crf",       "23",
        "-preset",    "fast",
        "-vf",        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-pix_fmt",   "yuv420p",
        "-profile:v", "baseline",
        "-level",     "4.1",
        // Audio — normalise to stereo 44.1 kHz AAC
        "-c:a",       "aac",
        "-b:a",       "128k",
        "-ar",        "44100",
        "-ac",        "2",
        // Container
        "-movflags",  "+faststart",
        "-f",         "mp4",
        "-map_metadata", "-1",
        outputPath,
      ], { maxBuffer: 100 * 1024 * 1024, timeout: 300_000 });

      // Probe INPUT (source file info) and OUTPUT (preview MP4 info)
      const srcProbe     = await probeVideo(inputPath);
      const previewProbe = await probeVideo(outputPath);

      // Abort if output is not a real MP4 container
      if (previewProbe && previewProbe.container !== "mp4") {
        throw new Error(
          `Container validation failed: expected mp4, got "${previewProbe.container}". ` +
          `FFmpeg did not produce a valid MP4 file.`
        );
      }

      if (srcProbe) {
        res.setHeader("X-Vyron-Src-Container",   srcProbe.container);
        res.setHeader("X-Vyron-Src-Video-Codec", srcProbe.videoCodec);
        res.setHeader("X-Vyron-Src-Profile",     srcProbe.videoProfile);
        res.setHeader("X-Vyron-Src-Pix-Fmt",     srcProbe.pixFmt);
        res.setHeader("X-Vyron-Src-Audio-Codec", srcProbe.audioCodec);
        // Real metadata headers for the analysis engine
        res.setHeader("X-Vyron-Src-Width",       String(srcProbe.width    ?? 0));
        res.setHeader("X-Vyron-Src-Height",      String(srcProbe.height   ?? 0));
        res.setHeader("X-Vyron-Src-Fps",         String(srcProbe.fps      ?? 0));
        res.setHeader("X-Vyron-Src-Duration",    String(srcProbe.durationSec ?? 0));
        res.setHeader("X-Vyron-Src-Bitrate",     String(srcProbe.bitrate  ?? 0));
      }
      if (previewProbe) {
        res.setHeader("X-Vyron-Preview-Container",   previewProbe.container);
        res.setHeader("X-Vyron-Preview-Video-Codec", previewProbe.videoCodec);
        res.setHeader("X-Vyron-Preview-Profile",     previewProbe.videoProfile);
        res.setHeader("X-Vyron-Preview-Pix-Fmt",     previewProbe.pixFmt);
        res.setHeader("X-Vyron-Preview-Audio-Codec", previewProbe.audioCodec);
      }

      res.setHeader("Content-Type", "video/mp4");
      const stream = createReadStream(outputPath);
      stream.on("end", cleanup);
      stream.on("error", cleanup);
      stream.pipe(res);
    } catch (err) {
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message ?? "Preview conversion failed" });
      }
    }
  }
);

// ── POST /api/thumbnail/video — extract a JPEG frame for preview fallback ─────
app.post(
  "/api/thumbnail/video",
  express.raw({ type: "*/*", limit: "500mb" }),
  async (req, res) => {
    if (!FFMPEG) return res.status(500).json({ error: "FFmpeg not available." });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0)
      return res.status(400).json({ error: "No video data received." });

    const id         = randomBytes(8).toString("hex");
    const inputPath  = join(tmpdir(), `vyron-thumb-in-${id}`);
    const outputPath = join(tmpdir(), `vyron-thumb-${id}.jpg`);
    const cleanup    = () => {
      for (const p of [inputPath, outputPath]) try { if (existsSync(p)) unlinkSync(p); } catch {}
    };

    try {
      writeFileSync(inputPath, req.body);
      await execFileAsync(FFMPEG, [
        "-y",
        "-ss", "1",             // fast-seek to 1 s (avoids black frames at start)
        "-i", inputPath,
        "-frames:v", "1",       // extract exactly one frame
        "-vf", "scale=640:-2",  // max 640 px wide, even height
        "-f", "image2",
        "-q:v", "3",            // good JPEG quality
        outputPath,
      ], { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 });

      res.setHeader("Content-Type", "image/jpeg");
      const stream = createReadStream(outputPath);
      stream.on("end",   cleanup);
      stream.on("error", cleanup);
      stream.pipe(res);
    } catch {
      cleanup();
      if (!res.headersSent) res.status(500).json({ error: "Thumbnail extraction failed." });
    }
  }
);

// ── POST /api/enhance/video ───────────────────────────────────────────────────
app.post(
  "/api/enhance/video",
  express.raw({ type: "*/*", limit: "500mb" }),
  async (req, res) => {
    if (!FFMPEG) {
      return res.status(500).json({ error: "FFmpeg not available on this server." });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "No video data received." });
    }

    const {
      preset          = "clean_boost",
      colorCorrection = "true",
      brightness      = "true",
      contrast        = "true",
      sharpness       = "false",
      noiseReduction  = "false",
      audioCleanup    = "false",
      noiseStrength   = "medium",   // "low" | "medium" | "high" | "extreme"
      teethWhitening  = "off",      // "off" | "low" | "medium" | "high"
      teethDetected   = "false",    // "true" | "false" — from canvas analysis
    } = req.query ?? {};

    const toggles = {
      colorCorrection: colorCorrection !== "false",
      brightness:      brightness      !== "false",
      contrast:        contrast        !== "false",
      sharpness:       sharpness       === "true",
      noiseReduction:  noiseReduction  === "true",
      audioCleanup:    audioCleanup    === "true",
    };

    const id         = randomBytes(8).toString("hex");
    const inputPath  = join(tmpdir(), `vyron-enh-in-${id}.mp4`);
    const outputPath = join(tmpdir(), `vyron-enh-out-${id}.mp4`);

    const cleanup = () => {
      for (const p of [inputPath, outputPath]) {
        try { if (existsSync(p)) unlinkSync(p); } catch {}
      }
    };

    try {
      writeFileSync(inputPath, req.body);

      // Build base filter chain (teeth whitening handled separately via filter_complex)
      const baseFilters   = buildEnhanceFilters(preset, toggles, noiseStrength, "off");
      const teethActive   = teethWhitening !== "off" && teethDetected === "true";
      const args = ["-y", "-i", inputPath];

      if (teethActive) {
        // Use filter_complex: lumakey mask ensures correction only hits bright
        // near-white pixels (teeth zone). Lips, skin, gums, shadows are untouched.
        const complexGraph = buildTeethWhiteningComplex(baseFilters, teethWhitening);
        args.push("-filter_complex", complexGraph);
        // [v] is the labelled output from buildTeethWhiteningComplex
        args.push("-map", "[v]", "-map", "0:a:0?");
        res.setHeader("X-Vyron-Teeth-Applied", "true");
      } else {
        // Standard simple filter chain
        args.push("-map", "0:v:0", "-map", "0:a:0?");
        const vFilterChain = baseFilters.length > 0
          ? baseFilters.join(",")
          : "scale=trunc(iw/2)*2:trunc(ih/2)*2";
        args.push("-vf", vFilterChain);
        res.setHeader(
          "X-Vyron-Teeth-Applied",
          teethWhitening !== "off" ? "none-detected" : "off"
        );
      }
      // libx264 + yuv420p is required for in-browser playback across all browsers
      args.push(
        "-c:v",       "libx264",
        "-crf",       "20",
        "-preset",    "fast",
        "-pix_fmt",   "yuv420p",
        "-profile:v", "baseline",
        "-level",     "4.1"
      );

      // Audio — always normalise to stereo 44.1 kHz AAC
      if (toggles.audioCleanup) {
        args.push("-af", "loudnorm=I=-14:TP=-1:LRA=11");
      }
      args.push("-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2");

      args.push("-movflags", "+faststart", "-f", "mp4", outputPath);

      await execFileAsync(FFMPEG, args, {
        maxBuffer: 100 * 1024 * 1024,
        timeout:   360_000,
      });

      // Probe enhanced output — abort if container is not mp4
      const outProbe = await probeVideo(outputPath);
      if (outProbe && outProbe.container !== "mp4") {
        throw new Error(
          `Container validation failed: expected mp4, got "${outProbe.container}". ` +
          `FFmpeg did not produce a valid MP4 file.`
        );
      }
      if (outProbe) {
        res.setHeader("X-Vyron-Out-Container",   outProbe.container);
        res.setHeader("X-Vyron-Out-Video-Codec", outProbe.videoCodec);
        res.setHeader("X-Vyron-Out-Profile",     outProbe.videoProfile);
        res.setHeader("X-Vyron-Out-Pix-Fmt",     outProbe.pixFmt);
        res.setHeader("X-Vyron-Out-Audio-Codec", outProbe.audioCodec);
      }

      const today = new Date();
      const ymd =
        today.getFullYear().toString() +
        String(today.getMonth() + 1).padStart(2, "0") +
        String(today.getDate()).padStart(2, "0");

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="vyron-enhanced-${ymd}.mp4"`
      );

      const stream = createReadStream(outputPath);
      stream.on("end", cleanup);
      stream.on("error", cleanup);
      stream.pipe(res);
    } catch (err) {
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message ?? "Enhancement failed" });
      }
    }
  }
);

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
