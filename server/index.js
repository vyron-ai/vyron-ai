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

// ── probeVideo — parse codec info from ffmpeg -i stderr ───────────────────────
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

  const vidStr = vidLine?.[1] ?? "";
  const audStr = audLine?.[1] ?? "";

  const codecMatch   = vidStr.match(/^(\S+)/);
  const profileMatch = vidStr.match(/\(([A-Za-z0-9 .:]+)\)/);
  const pixFmtMatch  = vidStr.match(/\b(yuv\w+|rgb\w*|bgr\w*|gray\w*|nv\d+)\b/);
  const audioMatch   = audStr.match(/^(\S+)/);

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
      `El secreto de ${n} que los mejores nunca comparten`,
      `Lo que nadie te dice sobre ${n}`,
      `El lado oculto de ${n} que cambia todo`,
      `Por qué la mayoría de los consejos de ${n} tienen este hueco`,
    ],
    pain: [
      `Por qué tus resultados en ${n} siguen decepcionándote`,
      `La verdadera razón por la que ${n} se siente tan difícil ahora`,
      `¿Luchando con ${n}? Aquí está la respuesta honesta`,
      `El problema de ${n} que nadie quiere admitir`,
    ],
    story: [
      `Cómo reconstruí mi ${n} desde cero`,
      `Lo que ${n} me enseñó que ningún curso pudo`,
      `El punto de inflexión en ${n} que no vi venir`,
      `Mi mayor fracaso en ${n} — y lo que vino después`,
    ],
    authority: [
      `El marco de ${n} que realmente aguanta`,
      `Lo que los datos muestran sobre ${n}`,
      `${n} bien hecho: lo que separa a los mejores`,
      `Las claves no negociables de una estrategia sólida de ${n}`,
    ],
    mistake: [
      `El error #1 de ${n} que probablemente estás cometiendo ahora`,
      `Deja de hacer esto en tu ${n} de inmediato`,
      `3 hábitos de ${n} que te están costando en silencio`,
      `Este movimiento común de ${n} está empeorando las cosas`,
    ],
    opportunity: [
      `La oportunidad de ${n} que la mayoría ignora ahora`,
      `Hay una brecha en ${n} ahora mismo — aprovéchala`,
      `Por qué ahora es el mejor momento para apostarlo todo a ${n}`,
      `El ángulo de ${n} que tu competencia todavía no encontró`,
    ],
    viral: [
      `El formato de ${n} que está explotando ahora (y por qué)`,
      `Por qué esta tendencia de ${n} está reemplazando todo lo demás`,
      `Todos hablan de esto en ${n} — aquí está la verdad`,
      `El cambio en ${n} que tomó a todos por sorpresa`,
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
    curiosity:   ["Comenta 'CÓMO' y te mando el desglose completo", "Sígueme para la respuesta en la parte 2", "Guarda esto antes de que desaparezca"],
    pain:        ["Comenta 'ESTANCADO' si esto eres tú ahora", "Escríbeme por DM — te muestro el primer paso", "Enlace en bio si estás listo para solucionar esto"],
    story:       ["Comenta 'YO TAMBIÉN' si has estado aquí", "Sígueme para el próximo capítulo", "Comparte esto con alguien que lo necesita"],
    authority:   ["Guarda este marco para después", "Sígueme si quieres el desglose completo", "Comenta 'MARCO' para la versión en PDF"],
    mistake:     ["Comenta 'CULPABLE' si lo has hecho", "Sígueme — publico el arreglo cada semana", "Guarda esto antes de cometer el mismo error"],
    opportunity: ["Comenta 'DENTRO' si quieres los detalles", "Enlace en bio — la ventana no va a quedar abierta", "Sígueme para detectar la próxima oportunidad temprano"],
    viral:       ["Comparte esto con un creador que lo necesita", "Sígueme para lo que está funcionando ahora", "Duplícalo o une — dime tu perspectiva"],
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
    const titles      = titleTemplates[hookType] ?? titleTemplates.curiosity;
    const ctas        = ctaTemplates[hookType]   ?? ctaTemplates.curiosity;
    const intensity   = intensityCycle[i % intensityCycle.length];
    entries.push({
      day:         dayNum,
      contentType,
      hookType,
      intensity,
      title:       ctxApply(titles[i % titles.length],     n, au, pr, isES),
      objective:   objectives[i % objectives.length],
      cta:         ctxApply(ctas[i % ctas.length],          n, au, pr, isES),
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

// Rich audience variation pool.
// IMPORTANT: all Spanish variants must be noun phrases compatible with "los ___"
// — never start with "quienes", "tu/su/mi", or feminine "personas" (causes "los quienes / los personas").
function ceAuVars(au, isES) {
  if (!au) return [isES ? "tu audiencia" : "your audience"];
  const subject = ceSubject(au, isES);
  const goal    = ceGoal(au, isES);
  const unique  = (arr) => [...new Set(arr.filter(Boolean))];
  if (isES) {
    if (goal) {
      const subj = (subject && subject !== au) ? subject : "clientes";
      return unique([au, subj,
        `clientes que quieren ${goal}`,
        `clientes que buscan ${goal}`,
        "clientes que cuidan su imagen",
        "emprendedores que priorizan resultados",
        "clientes ideales",
        "clientes que buscan un cambio real",
      ]);
    }
    const subj = (subject && subject !== au) ? subject : "clientes";
    return unique([au, subj,
      "clientes en este espacio",
      "clientes que buscan resultados",
      "clientes ideales",
      "clientes con este perfil",
      "clientes objetivo",
    ]);
  }
  if (goal) {
    const subj = (subject && subject !== au) ? subject : "clients";
    return unique([au, subj,
      `clients who want to ${goal}`,
      `clients looking to ${goal}`,
      `clients focused on ${goal}`,
      "ideal clients",
      "clients who care about results",
    ]);
  }
  return unique([au,
    "ideal clients",
    "clients in this space",
    "target clients",
    "clients you serve",
  ]);
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
  const auVars = ceAuVars(au, isES);
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

// ── Context Intelligence Layer ────────────────────────────────────────────────
function buildAudienceIntelligence(n, au, au1, pr, hookType, intensity, isES = false) {
  const pick    = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const profile = industryProfile(n, isES);
  const [k0 = "resultados", k1 = "confianza", k2 = "crecimiento"] = profile.keywords;

  if (isES) {
    const desireVariantsES = [
      `Los ${au} buscan algo más que mejores resultados en ${n} — buscan ${profile.desires}. El deseo de fondo es certeza: saber que tienen un proceso que les da ${k0} y ${k1} de forma predecible. Quieren ser la referencia en su entorno, no seguir buscando la fórmula.`,
      `Lo que impulsa a los ${au} en ${n} no es solo el resultado — es lo que ese resultado representa: ${k0}, ${k1} y la sensación de haber llegado a donde sabían que podían. Detrás hay un deseo más profundo: sentirse competentes y seguros. Quieren que ${n} sea una fuente de ${k1}, no un recordatorio de lo que aún no han logrado.`,
      `En el fondo, lo que persiguen los ${au} en ${n} es progreso visible — específicamente: ${profile.desires}. No buscan solo resultados. Buscan la historia que podrán contar sobre sí mismos cuando lleguen.`,
      `Los ${au} buscan el momento en que ${n} deje de ser algo que tienen que empujar y empiece a generar ${k0} sin esfuerzo heroico. Quieren el efecto acumulativo — ${k1} y ${k2} que no requieran reiniciar desde cero cada vez.`,
    ];
    const fearVariantsES = [
      `El miedo más profundo de los ${au} no es el fracaso aislado — es invertir tiempo real en ${n} y descubrir que estuvieron trabajando en las cosas equivocadas todo ese tiempo. Justo detrás: el miedo a ${profile.fears}. Quieren evitar ser esa historia.`,
      `Los ${au} temen en silencio que ${profile.fears}. El pensamiento de empezar de cero — abandonar el esfuerzo ya invertido — está en el fondo de cada decisión que posponen.`,
      `Lo que paraliza a los ${au} en ${n} es comprometerse visiblemente con un enfoque y que no funcione para su situación específica. Debajo de esa hesitación hay algo más personal: que su caso sea la excepción que confirma la regla.`,
      `Lo que los ${au} más quieren evitar es que ${profile.fears}. Y junto a eso: mirar atrás en un año y ver que la oportunidad estuvo frente a ellos — que el conocimiento era accesible — y que no actuaron a tiempo.`,
    ];
    const painVariantsES = [
      `Ahora mismo, los ${au} viven: ${profile.pains}. Tienen acceso a más información sobre ${n} que nunca, y menos claridad sobre qué hacer. Cada nuevo recurso agrega una decisión, cada consejo contradice algo que ya probaron.`,
      `La frustración que viven los ${au} en ${n} ahora mismo es la inconsistencia que no pueden explicar ni resolver: ${profile.pains}. Los resultados parecen depender de variables que no pueden identificar ni controlar.`,
      `Lo que los ${au} enfrentan diariamente en ${n} es la brecha entre lo que saben que deberían tener — ${k0}, ${k1} — y lo que realmente tienen hoy. Pueden describir cómo se vería el éxito. Pero la ejecución consistente falla cuando más importa.`,
      `La situación actual de la mayoría de ${au} en ${n} es: ${profile.pains}. Están activos, ponen esfuerzo real, y creen que progresan — pero los resultados no lo reflejan. La frustración no es solo sobre resultados. Es sobre la desconexión entre el trabajo que ponen y lo que debería seguir lógicamente.`,
    ];
    const transformationVariantsES = [
      `La transformación que buscan los ${au} no es solo mejores resultados en ${n} — es pasar a: ${profile.transformation}. Al otro lado, ${n} se siente diferente: ${k0} consistente, ${k1} real, y un proceso que no requiere empezar de cero constantemente.`,
      `Si ${pr} entrega lo que los ${au} necesitan, terminan en: ${profile.transformation}. Un estado donde ${k0} llega de forma predecible, donde saben exactamente qué hacer, y donde el impulso siempre avanza sin reiniciar.`,
      `El estado final deseado por los ${au} en ${n} es: ${profile.transformation}. No a veces. No cuando las condiciones son perfectas. Como base — de forma consistente, sin esfuerzo heroico. ${pr} es el puente hacia esa versión.`,
      `Lo que los ${au} realmente quieren cuando invierten en ${n} es ${profile.desires} — y pasar de "creo que esto funciona" a "sé que esto funciona." Desde ahí, a los resultados acumulativos que siguen de esa claridad.`,
    ];
    return {
      desires:        pick(desireVariantsES),
      fears:          pick(fearVariantsES),
      pains:          pick(painVariantsES),
      transformation: pick(transformationVariantsES),
    };
  }

  // English — same pattern with English profile keywords
  const [e0 = "results", e1 = "confidence", e2 = "growth"] = profile.keywords;
  const desireVariants = [
    `${au} want more than better ${n} results — they want ${profile.desires}. The real desire is certainty: knowing they have a system that gives them ${e0} and ${e1} predictably. They want to be the reference in their space, not still searching for the formula.`,
    `What drives ${au} in ${n} isn't just the outcome — it's what it represents: ${e0}, ${e1} and the feeling of having arrived where they knew they could. Underneath is a deeper desire: to feel capable and certain. They want ${n} to be a source of ${e1}, not a constant reminder of what they haven't cracked yet.`,
    `At the core of what ${au} are chasing in ${n} is visible, measurable progress — specifically: ${profile.desires}. Not just results. The story they get to tell about themselves once they arrive.`,
    `${au} are chasing the moment when ${n} stops being something they push through and starts generating ${e0} without heroic effort. They want the compounding effect — ${e1} and ${e2} that doesn't require restarting from zero each time.`,
  ];
  const fearVariants = [
    `The deepest fear for ${au} isn't isolated failure — it's investing real time in ${n} and discovering they were working on the wrong things the whole time. Close behind: the fear of ${profile.fears}. They want to avoid being that story.`,
    `${au} are quietly afraid that ${profile.fears}. The thought of starting over — abandoning invested effort — sits in the background of every decision they postpone or avoid.`,
    `What keeps ${au} in place is committing visibly to a ${n} approach and having it not work for their specific situation. Underneath that hesitation is something more personal: that their case is somehow the exception.`,
    `What ${au} most want to avoid is ${profile.fears}. And alongside that: looking back in a year seeing the opportunity was there — the knowledge was accessible — and they still didn't act in time.`,
  ];
  const painVariants = [
    `Right now, ${au} are living: ${profile.pains}. They have more ${n} information than ever, and less clarity on what to actually do. Every new resource adds a decision. Every piece of advice contradicts something they already tried.`,
    `The frustration ${au} live with in ${n} right now is inconsistency they can't explain or fix: ${profile.pains}. Results seem to depend on variables they can't identify or control.`,
    `What ${au} deal with daily in ${n} is the gap between what they know they should have — ${e0}, ${e1} — and what they actually have today. They can describe what success looks like. But consistent execution breaks down when it matters most.`,
    `The current situation for most ${au} in ${n} is: ${profile.pains}. They're active, putting in real effort, genuinely believing they're progressing — but the results don't reflect it. The frustration isn't just about outcomes. It's about the disconnect between their work and what should logically follow.`,
  ];
  const transformationVariants = [
    `The transformation ${au} are looking for isn't just better ${n} results — it's moving to: ${profile.transformation}. On the other side, ${n} feels different: consistent ${e0}, real ${e1}, a process that doesn't require restarting from zero.`,
    `If ${pr} delivers what ${au} actually need, they end up in: ${profile.transformation}. A state where ${e0} comes predictably, where they know exactly what to do, and where momentum is always moving forward.`,
    `The desired end state for ${au} in ${n} is: ${profile.transformation}. Not sometimes. Not when conditions are perfect. As a baseline — consistently, without heroic effort. ${pr} is the bridge.`,
    `What ${au} are really trying to buy when they invest in ${n} is ${profile.desires} — and moving from "I think this is working" to "I know this is working." From there, to the compounding results that follow from that clarity.`,
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
  const intel = buildAudienceIntelligence(n, au, au1, pr, hookType, intensity, isES);

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

  // ── Hashtags — keyword-based, no full-phrase concatenation ──────────────────

  // ── Spanish templates ─────────────────────────────────────────────────────────
  const sarMapES = {
    curiosity: [
      `PARA — estás a punto de pasar por alto el insight que explica por qué ${n} todavía no hace clic para ti.\nAGITA — ya sabes más sobre ${n} que la mayoría de ${au}. Ese no es el problema. El problema es que saber y ejecutar son cosas completamente distintas, y esa brecha es exactamente donde los ${au} se quedan estancados.\nRESOLUCIÓN — ${pr} cierra esa brecha. No con más información — con un sistema construido para la forma en que los ${au} realmente ejecutan.`,
      `PARA — el próximo método de ${n} que pruebes probablemente fallará. No porque lo ejecutes mal, sino porque no fue construido para alguien en tu situación.\nAGITA — los ${au} pasan meses probando enfoques que funcionan en teoría y se derrumban en la práctica. Cada intento fallido hace que el siguiente sea más difícil.\nRESOLUCIÓN — ${pr} rompe ese ciclo empezando por lo que realmente es verdad sobre cómo operan los ${au}.`,
    ],
    pain: [
      `PARA — si eres un ${au1} que pone esfuerzo real en ${n} y todavía no ves los resultados que deberían seguir, esta es la conversación que reencuadra el porqué.\nAGITA — no te falta motivación. No te falta información. Te falta un sistema que contemple la forma específica en que los ${au} experimentan ${n} — la fricción, la inconsistencia, la brecha entre saber y hacer.\nRESOLUCIÓN — ${pr} está construido alrededor de esa brecha. No alrededor del problema de ${n} en teoría — alrededor del que los ${au} realmente viven.`,
      `PARA — el ciclo de ${n} en el que los ${au} se quedan atascados tiene un nombre específico: esfuerzo sin acumulación. Trabajas. Nada se construye. Reinicias.\nAGITA — ese ciclo persiste porque el enfoque no encaja con la persona. La mayoría de los sistemas de ${n} fueron construidos para la vida de otra persona, las limitaciones de otra persona.\nRESOLUCIÓN — ${pr} fue construido para las tuyas. Esto es lo que cambia.`,
    ],
    story: [
      `PARA — hace seis meses era un ${au1} que había consumido todo el contenido de ${n} disponible y todavía no podía hacerlo funcionar de forma consistente.\nAGITA — la frustración no es que la información no exista. Es que toda está construida para una versión de ti que no tiene tus limitaciones específicas.\nRESOLUCIÓN — construir ${pr} fue cómo lo resolví para mí. Luego me di cuenta de que también funcionaba para otros ${au}.`,
      `PARA — el momento en que mis resultados en ${n} cambiaron no fue cuando aprendí algo nuevo. Fue cuando dejé de hacer algo que se sentía productivo pero no lo era.\nAGITA — la mayoría de los ${au} están haciendo una versión de eso ahora mismo — algo que parece progreso y no lo es. Es muy difícil verlo desde adentro.\nRESOLUCIÓN — ${pr} lo hace visible. Y una vez que es visible, todo cambia.`,
    ],
    authority: [
      `PARA — después de trabajar profundamente en ${n}, un patrón se repite casi con cada grupo de ${au}: fallan no porque les falta impulso, sino porque el método que siguen fue construido para otra persona.\nAGITA — el enfoque convencional de ${n} asume condiciones que no aplican a la mayoría de ${au}. Seguirlo produce resultados inconsistentes y una sensación creciente de que el problema es personal.\nRESOLUCIÓN — ${pr} está construido sobre lo que realmente funciona cuando quitas las suposiciones.`,
      `PARA — he visto a los ${au} fallar en ${n} por la misma razón prevenible tantas veces que dejó de parecer coincidencia.\nAGITA — la brecha no es capacidad. Es que las herramientas disponibles fueron diseñadas para una audiencia general — no para las realidades específicas que definen cómo operan los ${au} en ${n}.\nRESOLUCIÓN — ${pr} está construido alrededor de esas realidades. Esa es la diferencia.`,
    ],
    mistake: [
      `PARA — los ${au} están cometiendo un error específico en ${n} ahora mismo que parece el movimiento correcto desde adentro.\nAGITA — no es el error obvio. Es más sutil: optimizar para la métrica fácil de rastrear en lugar de la que realmente impulsa el resultado que quieren. Se siente como progreso. El marcador dice lo contrario.\nRESOLUCIÓN — ${pr} empieza revelando ese error, porque corregirlo cambia toda la trayectoria de tus resultados en ${n}.`,
      `PARA — hay una conducta en ${n} que los ${au} hacen constantemente, que constantemente socava sus resultados, y sobre la que casi nadie habla directamente.\nAGITA — no es pereza. No es falta de conocimiento. Es un desalineamiento estructural entre la acción y el resultado — y se acumula silenciosamente.\nRESOLUCIÓN — ${pr} está construido para detectarlo temprano. Antes de que meses de esfuerzo vayan en la dirección equivocada.`,
    ],
    opportunity: [
      `PARA — ahora mismo hay un cambio específico en ${n} del que la mayoría de ${au} están posicionados para beneficiarse — y casi ninguno de ellos lo sabe todavía.\nAGITA — cuando esta oportunidad sea obvia, la ventana ya estará llena. Los ${au} que se mueven ahora son los que en 12 meses parecerán clarividentes.\nRESOLUCIÓN — ${pr} mapea exactamente cómo entrar en esta ventana antes de que se cierre. Este es el momento.`,
      `PARA — el panorama de ${n} ha cambiado de una manera que crea una ventaja real y específica para los ${au} que están prestando atención.\nAGITA — la mayoría de los ${au} todavía usan el método de hace 18 meses. Ese método está saturado. El nuevo carril está completamente abierto — pero solo por una ventana limitada.\nRESOLUCIÓN — ${pr} te pone en ese carril con un camino claro.`,
    ],
    viral: [
      `PARA — el formato de contenido de ${n} que los ${au} todavía usan funcionaba hace 90 días. El algoritmo ha seguido adelante.\nAGITA — lo que está funcionando ahora tiene una estructura diferente. Está construido sobre señales y comportamientos distintos. Copiar el formato antiguo está trabajando activamente en tu contra.\nRESOLUCIÓN — ${pr} está construido alrededor de lo que está funcionando en ${n} ahora mismo — no lo que funcionó antes.`,
      `PARA — la razón por la que algunos ${au} en ${n} obtienen resultados que parecen desproporcionados a su esfuerzo no es suerte. Hay un patrón estructural específico detrás de eso.\nAGITA — la mayoría de los ${au} puede ver que algo está funcionando para otros en ${n} pero no pueden entender por qué. Esa brecha entre observación y comprensión es donde se asienta la oportunidad.\nRESOLUCIÓN — ${pr} mapea ese patrón en algo que los ${au} pueden replicar.`,
    ],
  };

  const painMapES = {
    soft: [
      `La mayoría de los ${au} en ${n} están haciendo todo lo que saben — y aun así sienten que algo no está aterrizando. Esa sensación es real, y generalmente señala una brecha en el sistema, no en la persona. El esfuerzo no es el problema. La estructura alrededor de él lo es.`,
      `Hay un momento específico que la mayoría de los ${au} en ${n} reconocen: pones trabajo real, sigues consejos reales, y los resultados siguen siendo inconsistentes de una manera que no puedes explicar del todo. Esa inconsistencia no es aleatoria. Tiene una causa — y generalmente no es la que se habla.`,
    ],
    medium: [
      `Eres un ${au1} que ha puesto esfuerzo genuino en ${n} — y los resultados no reflejan ese esfuerzo de la manera que deberían. No es un problema de motivación ni de conocimiento. Es un problema estructural. El enfoque que estás usando fue construido para la situación de otra persona.`,
      `Los ${au} pasan meses girando alrededor de la misma fricción en ${n}: esfuerzo que no se acumula, estrategias que funcionan hasta que no funcionan, y resultados que nunca son suficientemente consistentes para construir sobre ellos.`,
    ],
    aggressive: [
      `Esto es lo que realmente está pasando para los ${au} en ${n} ahora mismo: el enfoque no está funcionando, y cada semana que pasa es una semana que alguien más usa para avanzar más. No hay versión de esto donde esperar produzca un resultado diferente. La brecha no se cierra sola.`,
      `Si tus resultados en ${n} estuvieran donde deberían estar, no estarías viendo esto. Estás estancado — y el tipo específico de estancamiento que los ${au} experimentan en ${n} no se soluciona solo. Requiere un enfoque diferente, no más esfuerzo en el mismo.`,
    ],
  };

  const curiosityMapES = {
    curiosity: [
      `¿Y si la razón por la que ${n} no ha funcionado como esperabas es algo completamente diferente a lo que has estado intentando solucionar? La mayoría de los ${au} están resolviendo el problema visible. El problema real está una capa por debajo.`,
      `Hay un patrón que separa a los ${au} que obtienen resultados consistentes en ${n} de los que se quedan estancados — y no tiene casi nada que ver con las tácticas que están usando. La variable que realmente importa es la que casi nadie menciona directamente.`,
    ],
    pain: [
      `El costo real de otros 6 meses de los mismos resultados en ${n} no es solo tiempo. Para los ${au}, es el efecto acumulado del impulso que no se construye — de la confianza que se erosiona silenciosamente en el fondo mientras el esfuerzo continúa al frente.`,
      `¿Y si lo que mantiene a los ${au} estancados en ${n} no es una pieza de información que falta, sino una decisión estructural que tomaron al principio que ha estado dando forma a todo lo demás? Eso es lo que nadie quiere decir en voz alta — porque solucionar lo requiere reconocerlo primero.`,
    ],
    story: [
      `El cambio en mis resultados de ${n} no ocurrió cuando encontré una mejor estrategia. Ocurrió cuando dejé de hacer algo que parecía el movimiento correcto pero silenciosamente evitaba que todo lo demás funcionara. Guardé eso para mí durante meses antes de darme cuenta de que la mayoría de los ${au} estaban haciendo exactamente lo mismo.`,
      `He tenido esta conversación con decenas de ${au} que están estancados en ${n} — y lo que los sorprende cada vez no es la solución. Es darse cuenta de que el problema no era lo que pensaban que era. Solo ese reencuadre cambia todo.`,
    ],
    authority: [
      `La mayoría de los marcos de ${n} están construidos alrededor de suposiciones que no aplican a los ${au} — y las personas que los construyeron no lo saben, porque nunca han operado dentro de las limitaciones específicas que definen tu situación.`,
      `He rastreado resultados de ${n} en suficientes ${au} para ver un patrón que no aparece en ninguno de los consejos populares: los que ganan no están haciendo más. Están haciendo una cosa específica diferente que hace que todo lo demás sea más eficiente.`,
    ],
    mistake: [
      `El error más costoso de ${n} que cometen los ${au} no es el obvio. Es el que parece disciplina, parece consistencia, parece el movimiento correcto — y está activamente impidiendo el resultado hacia el que están trabajando.`,
      `Los ${au} que están estancados en ${n} típicamente tienen algo en común: una decisión que tomaron temprano que tenía sentido en ese momento y que ha estado acumulándose silenciosamente en la dirección equivocada desde entonces.`,
    ],
    opportunity: [
      `La ventana específica que acaba de abrirse en ${n} es el tipo que solo tiene sentido en retrospectiva — cuando las personas que se movieron temprano están hablando de por qué lo hicieron, y todos los demás desearían haber prestado más atención cuando importaba.`,
      `Hay una brecha en ${n} ahora mismo en la que los ${au} con el enfoque correcto pueden entrar antes de que se llene. La razón por la que la mayoría no lo hará no es que no puedan verla — es que actuar antes de que sea obvio requiere una relación diferente con la incertidumbre.`,
    ],
    viral: [
      `El patrón de contenido de ${n} que está reemplazando a la fórmula anterior ya la está superando consistentemente — y la mayoría de los ${au} aún no han entendido por qué. La brecha entre los que lo ven y los que no es exactamente donde se asienta la ventaja ahora mismo.`,
      `¿Por qué algunos ${au} en ${n} están generando resultados que parecen desproporcionados a su esfuerzo o su audiencia? La respuesta no es un secreto. Es un patrón estructural que parece obvio una vez que alguien te lo muestra — e invisible hasta que lo hace.`,
    ],
  };

  const scriptMapES = {
    curiosity: `Esto es algo que casi nunca se dice directamente sobre ${n}:\n\nLos ${au} que obtienen resultados consistentes no están haciendo más — están haciendo menos de las cosas equivocadas. La brecha en ${n} no está entre los que saben más y los que saben menos. Está entre los que han encontrado la pieza estructural que hace que todo lo demás sea eficiente, y los que todavía están trabajando alrededor de ella.\n\nLo que los ${au} realmente quieren — y lo que la mayoría de los consejos de ${n} nunca les da — es un proceso que se acumula sin requerir esfuerzo heroico para sostenerse. No una táctica nueva. Un sistema donde el esfuerzo que ya están poniendo en ${n} realmente aterriza.\n\n${pr} está construido alrededor de eso. Toma lo que ya estás haciendo en ${n} y lo reestructura alrededor de la variable que realmente impulsa resultados para los ${au} en tu situación.`,
    pain: `Si eres un ${au1} que ha puesto esfuerzo real en ${n} y los resultados todavía no reflejan ese esfuerzo — el problema no eres tú.\n\nEl espacio de ${n} está lleno de marcos y sistemas que funcionan para alguien. Solo no para los ${au} con tus limitaciones específicas, tus metas específicas, y la versión específica de ${n} que estás intentando hacer funcionar.\n\nLo que eso crea es el peor tipo de estancamiento: el tipo donde estás haciendo las cosas correctas en teoría, y el marcador todavía no se mueve. El esfuerzo es real. El enfoque simplemente no está calibrado para tu situación.\n\n${pr} fue construido para corregir esa calibración. No añadiendo más a tu proceso — alineando lo que ya estás haciendo con lo que realmente mueve la aguja para los ${au} como tú.`,
    story: `Hace seis meses era un ${au1} que tenía el conocimiento, el esfuerzo y las herramientas — y todavía no podía hacer que ${n} produjera resultados consistentes.\n\nLo que finalmente entendí no fue una nueva estrategia. Fue que las estrategias que estaba usando estaban construidas alrededor de un conjunto de suposiciones que no aplicaban a mi situación. Una vez que lo vi, reconstruí el enfoque desde cero — alrededor de las limitaciones reales de alguien que opera como yo.\n\nEso es lo que se convirtió en ${pr}. Y lo que me sorprendió fue que cuando se lo mostré a otros ${au}, también funcionó para ellos. Porque el problema estructural no era único para mí. Era la misma brecha que la mayoría de los ${au} encuentran en ${n} — y que casi nadie nombra directamente.\n\nSi la descripción de dónde estaba te resulta familiar, esto es lo que cambió.`,
    authority: `Después de trabajar profundamente en ${n}, una cosa se vuelve imposible de ignorar:\n\nLos ${au} que tienen dificultades no las tienen porque les falte impulso o información. Las tienen porque los marcos que están usando fueron construidos para una versión generalizada del problema — no para las limitaciones, metas y condiciones específicas que definen cómo los ${au} realmente experimentan ${n}.\n\nEsa discrepancia es invisible hasta que la ves. Y una vez que la ves, cada pieza de consejo genérico sobre ${n} empieza a leerse diferente.\n\n${pr} está construido desde cero alrededor de lo que los ${au} realmente necesitan — no lo que necesita una audiencia general. La diferencia en resultados no es porque los principios subyacentes de ${n} sean diferentes. Es porque se están aplicando con precisión, al problema correcto, en la secuencia correcta.`,
    mistake: `El error más común de ${n} entre los ${au} no es el obvio.\n\nEs más sutil: optimizar consistentemente para la métrica fácil de rastrear, mientras la métrica que realmente impulsa el resultado que quieres se mantiene plana en silencio. Se siente como progreso porque estás produciendo output. Pero output y resultado son cosas diferentes — y en ${n}, confundirlos es lo que mantiene a los ${au} en la misma posición mes tras mes.\n\nAsí es como se acumula: te vuelves mejor en la métrica visible. Sientes que las cosas están mejorando. El resultado subyacente no cambia. Eventualmente la desconexión se vuelve innegable — y entonces reinicias.\n\n${pr} empieza revelando cuál métrica está realmente moviendo tus resultados en ${n}, y cuál simplemente hace que el esfuerzo parezca que vale la pena. Esa distinción sola cambia la dirección de todo lo que sigue.`,
    opportunity: `Ahora mismo hay un cambio estructural ocurriendo en ${n} del que la mayoría de los ${au} están posicionados para beneficiarse — y la mayoría de ellos no lo saben todavía.\n\nEl método que funcionó hace 12 a 18 meses está saturado. Los retornos se están comprimiendo. Y en el espacio que se está abriendo, la ventaja va para los ${au} que se mueven antes de que la oportunidad sea obvia — antes de que se vuelva competitiva, antes de que se llene, antes de que la ventana se reduzca a una fracción de lo que es ahora.\n\nEste es ese momento. No en teoría. Específicamente, ahora mismo.\n\n${pr} mapea el camino exacto hacia esta ventana para los ${au} en ${n} — qué hacer, en qué orden, y por qué el momento lo hace funcionar.`,
    viral: `La fórmula de contenido de ${n} que los ${au} todavía están usando era la correcta — hace 90 días.\n\nEl algoritmo ha seguido adelante. El comportamiento de los espectadores ha seguido adelante. Lo que está produciendo resultados ahora parece estructuralmente diferente de lo que solía funcionar, y los ${au} que han hecho el cambio están obteniendo resultados que parecen desproporcionados a su tamaño o esfuerzo.\n\nNo es desproporcionado. Es que están trabajando con el modelo actual mientras todos los demás siguen ejecutando el anterior.\n\n${pr} está construido alrededor del modelo actual. No la teoría de lo que podría funcionar en ${n} — la estructura de lo que realmente está produciendo resultados para los ${au} ahora mismo.`,
  };

  const ctaMapES = {
    soft: [
      `Si esto resonó, sigue para más contenido de ${n} construido específicamente para ${au}. Publicaciones nuevas cada semana.`,
      `Guarda esto si eres un ${au1} trabajando en tu enfoque de ${n} — querrás volver a verlo.`,
      `Prueba ${pr} y ve si es el ajuste correcto para tus metas de ${n}. Enlace en bio.`,
    ],
    medium: [
      `Comenta "${n.toUpperCase()}" abajo y te envío el desglose completo — gratis.`,
      `Sígueme si eres un ${au1} serio sobre resultados en ${n}. No publico relleno.`,
      `${pr} está disponible ahora. Enlace en bio — menos de 2 minutos para empezar.`,
    ],
    aggressive: [
      `Los ${au} que actúan hoy van a estar en una posición completamente diferente en 90 días. Enlace en bio. No lo pienses demasiado.`,
      `Deja de ver. Empieza a hacer. ${pr} — enlace en bio. Este es el sistema.`,
      `Comenta "LISTO" si ya terminaste de dejar que ${n} se quede estancado. Te envío el primer paso ahora mismo.`,
    ],
  };

  const titleMapES = {
    curiosity: [
      `El método de ${n} que los ${au} siguen ignorando (y no es lo que piensas)`,
      `Por qué todo lo que sabes sobre ${n} puede estar trabajando en tu contra`,
    ],
    pain: [
      `Por qué los ${au} se quedan estancados en ${n} — y el arreglo exacto`,
      `La verdadera razón por la que tus resultados en ${n} no avanzan (respuesta honesta)`,
    ],
    story: [
      `Cómo pasé de ${au1} perdido a resultados consistentes en ${n} con ${pr}`,
      `Qué cambió mis resultados en ${n} después de meses sin avanzar`,
    ],
    authority: [
      `Lo que los expertos en ${n} saben que los ${au} no saben (conversación real)`,
      `El marco de ${n} que realmente aguanta cuando miras los datos`,
    ],
    mistake: [
      `El error #1 de ${n} que los ${au} cometen (y cómo parar de inmediato)`,
      `Probablemente estás cometiendo este error de ${n} ahora mismo — aquí está el arreglo`,
    ],
    opportunity: [
      `La oportunidad de ${n} que los ${au} están ignorando ahora mismo`,
      `Hay una brecha en ${n} que los ${au} todavía pueden aprovechar — así es cómo`,
    ],
    viral: [
      `El cambio de contenido en ${n} que ya está ocurriendo (la mayoría de ${au} van tarde)`,
      `Por qué la fórmula antigua de ${n} dejó de funcionar para los ${au} — nuevo enfoque adentro`,
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
    script:           activeScriptMap[hookType]      ?? activeScriptMap.curiosity,
  };
  // Apply Context Engine to body text — max 2 original occurrences globally across 8 fields
  const body = ctxBatch(rawOutput, n, au, pr, isES, 2);
  // Title + CTA use independent counters so they always get the original phrase once
  res.json({
    ...body,
    cta:      ctxApply(pick(activeCtaMap[intensity]   ?? activeCtaMap.medium),      n, au, pr, isES),
    title:    ctxApply(pick(activeTitleMap[hookType]  ?? activeTitleMap.curiosity), n, au, pr, isES),
    hashtags: buildHashtags(n, au, pr, hookType, isES),
  });
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
  };
  const rawCtas = {
    nicheSpecific: pick(activeCtaNiche[g] ?? activeCtaNiche.sales),
    leadGen:       pick(activeCtaLeadGen),
    sales:         pick(activeCtaSales),
  };
  const weeklyWithCtx = weeklySchedule.map(day => ({
    ...day,
    note: ctxApply(day.note, n, au, pr, isES, 1, 2, 1),
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
const ENHANCE_EQ = {
  clean_boost:  { brightness: 0.03,  contrast: 1.10, saturation: 1.15, gamma: 1.0  },
  cinematic:    { brightness: -0.02, contrast: 1.15, saturation: 0.82, gamma: 1.05 },
  social_sharp: { brightness: 0.05,  contrast: 1.20, saturation: 1.30, gamma: 1.0  },
  low_light:    { brightness: 0.12,  contrast: 1.10, saturation: 1.10, gamma: 1.30 },
  audio_cleaner:null,
};

function buildEnhanceFilters(preset, toggles) {
  if (preset === "audio_cleaner") return [];
  const eq = ENHANCE_EQ[preset] ?? ENHANCE_EQ.clean_boost;
  const filters = [];

  // EQ
  const eqParts = [];
  if (toggles.brightness)      eqParts.push(`brightness=${eq.brightness}`);
  if (toggles.contrast)        eqParts.push(`contrast=${eq.contrast}`);
  if (toggles.colorCorrection) {
    eqParts.push(`saturation=${eq.saturation}`);
    if (eq.gamma !== 1.0) eqParts.push(`gamma=${eq.gamma}`);
  }
  if (eqParts.length) filters.push(`eq=${eqParts.join(":")}`);

  // Sharpness
  if (toggles.sharpness) {
    const amt = preset === "social_sharp" ? 1.3 : 0.8;
    filters.push(`unsharp=5:5:${amt}:5:5:0`);
  }

  // Noise reduction
  if (toggles.noiseReduction) {
    const str = preset === "low_light" ? "2:2:8:8" : "1.5:1.5:6:6";
    filters.push(`hqdn3d=${str}`);
  }

  // Cinematic vignette
  if (preset === "cinematic") filters.push("vignette");

  return filters;
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
      preset         = "clean_boost",
      colorCorrection = "true",
      brightness     = "true",
      contrast       = "true",
      sharpness      = "false",
      noiseReduction = "false",
      audioCleanup   = "false",
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

      const vFilters = buildEnhanceFilters(preset, toggles);
      const args = ["-y", "-i", inputPath];

      // Map streams — make audio optional so it works on silent videos
      args.push("-map", "0:v:0", "-map", "0:a:0?");

      // Video — always re-encode to ensure browser-compatible H.264/yuv420p
      if (vFilters.length > 0) {
        args.push("-vf", vFilters.join(","));
      }
      // libx264 + yuv420p is required for in-browser playback across all browsers
      args.push(
        "-c:v",       "libx264",
        "-crf",       "20",
        "-preset",    "fast",
        "-pix_fmt",   "yuv420p",
        "-profile:v", "baseline",
        "-level",     "4.1"      // was 3.0 — too restrictive for HD content
      );
      // Ensure even pixel dimensions (required for yuv420p baseline)
      if (vFilters.length === 0) {
        args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2");
      }

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
