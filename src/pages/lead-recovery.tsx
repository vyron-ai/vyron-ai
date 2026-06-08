import { useState, useMemo } from "react";
import { useVyronSettings } from "@/contexts/settings-context";
import { BusinessSettings } from "@/components/business-settings";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Loader2, Copy, Check, Zap, TrendingUp, TrendingDown,
  Users, DollarSign, Target, MessageSquare, Brain,
  Clock, AlertCircle, BarChart3, ChevronRight,
  ShieldAlert, Timer, HandshakeIcon, Swords, BellOff, Gauge,
  Building2, Layers, Award, Flag, ArrowRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type LeadStatus   = "interested" | "no_response" | "follow_up_needed" | "budget_concern" | "comparing" | "cold";
type Probability  = "Low" | "Medium" | "High";
type SignalType   = "price_concern" | "timing_issue" | "trust_issue" | "competitor" | "no_follow_up" | "lack_of_urgency";

interface Signal {
  type:        SignalType;
  label:       string;
  description: string;
  icon:        React.ReactNode;
  color:       string;
  border:      string;
  bg:          string;
  scoreDelta:  number;
}

interface AnalysisResult {
  id:                 string;
  leadName:           string;
  companyName:        string;
  score:              number;
  probability:        Probability;
  objection:          string;
  revenueOpportunity: number;
  recoverable:        boolean;
  signals:            SignalType[];
}

// ── Signal definitions ─────────────────────────────────────────────────────────
const SIGNAL_DEFS: Record<SignalType, Omit<Signal, "type">> = {
  price_concern: {
    label:       "Price Concern",
    description: "Lead mentioned cost, budget, or pricing as an obstacle.",
    icon:        <DollarSign size={13} />,
    color:       "text-red-400",
    border:      "border-red-500/30",
    bg:          "bg-red-500/10",
    scoreDelta:  -8,
  },
  timing_issue: {
    label:       "Timing Issue",
    description: "Lead signalled the timing isn't right — not that the offer isn't right.",
    icon:        <Timer size={13} />,
    color:       "text-amber-400",
    border:      "border-amber-500/30",
    bg:          "bg-amber-500/10",
    scoreDelta:  -6,
  },
  trust_issue: {
    label:       "Trust Issue",
    description: "Lead expressed uncertainty, asked for proof, or indicated a credibility gap.",
    icon:        <ShieldAlert size={13} />,
    color:       "text-orange-400",
    border:      "border-orange-500/30",
    bg:          "bg-orange-500/10",
    scoreDelta:  -10,
  },
  competitor: {
    label:       "Competitor Mentioned",
    description: "Lead is actively evaluating or has mentioned a competing solution.",
    icon:        <Swords size={13} />,
    color:       "text-purple-400",
    border:      "border-purple-500/30",
    bg:          "bg-purple-500/10",
    scoreDelta:  -12,
  },
  no_follow_up: {
    label:       "No Follow-Up",
    description: "The conversation stalled because no follow-up was made on your end.",
    icon:        <BellOff size={13} />,
    color:       "text-blue-400",
    border:      "border-blue-500/30",
    bg:          "bg-blue-500/10",
    scoreDelta:  -3,
  },
  lack_of_urgency: {
    label:       "Lack of Urgency",
    description: "Lead is interested but has no perceived pressure to make a decision.",
    icon:        <Gauge size={13} />,
    color:       "text-slate-400",
    border:      "border-slate-500/30",
    bg:          "bg-slate-500/10",
    scoreDelta:  -7,
  },
};

const SIGNAL_PRIORITY: SignalType[] = [
  "competitor", "trust_issue", "price_concern",
  "timing_issue", "lack_of_urgency", "no_follow_up",
];

// ── Signal detection patterns ──────────────────────────────────────────────────
const SIGNAL_PATTERNS: Record<SignalType, RegExp> = {
  price_concern:   /\b(too expensive|price|cost|budget|afford|cheap|costly|not in .{0,10}budget|can.t afford|pricing|rate|fee|invoice)\b/i,
  timing_issue:    /\b(later|next month|not now|busy|wrong time|next quarter|next year|come back|not the right time|bad timing|timing|hold off|wait|pause|postpone|delay)\b/i,
  trust_issue:     /\b(not sure|reviews|guarantee|trust|proof|case study|evidence|risk|verified|credibility|seen it work|testimonial|reference|track record|sceptic|skeptic|worried)\b/i,
  competitor:      /\b(another company|competitor|other option|cheaper elsewhere|looking at others|other provider|alternative|comparing|different vendor|going with someone|already found)\b/i,
  no_follow_up:    /\b(no follow.?up|forgot|never replied|stopped responding|didn.t hear|no response|ghosted|fell through|dropped|lost touch|no contact|haven.t heard)\b/i,
  lack_of_urgency: /\b(thinking about it|maybe|not urgent|no rush|whenever|eventually|someday|considering|down the road|in the future|not a priority|low priority|not critical)\b/i,
};

function detectSignals(notes: string): SignalType[] {
  if (!notes.trim()) return [];
  return SIGNAL_PRIORITY.filter(sig => SIGNAL_PATTERNS[sig].test(notes));
}

function getStrongest(signals: SignalType[]): SignalType | null {
  return signals[0] ?? null;
}

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_BASE_SCORE: Record<LeadStatus, number> = {
  interested:        82,
  follow_up_needed:  68,
  comparing:         58,
  no_response:       44,
  budget_concern:    39,
  cold:              24,
};

const STATUS_REVENUE_BASE: Record<LeadStatus, number> = {
  interested:        11500,
  follow_up_needed:  8200,
  comparing:         7000,
  no_response:       5800,
  budget_concern:    4800,
  cold:              3200,
};

const STATUS_OBJECTION: Record<LeadStatus, string> = {
  interested:        "Unclear Offer",
  follow_up_needed:  "No Follow-Up",
  comparing:         "Comparing Options",
  no_response:       "No Follow-Up",
  budget_concern:    "Price Concern",
  cold:              "Timing Issue",
};

// ── Signal-driven content ──────────────────────────────────────────────────────
const SIGNAL_WHY_LOST: Record<SignalType, string> = {
  price_concern:
    "Your notes indicate a price objection — but a price objection is almost never actually about price. It's about unclear return on investment. This lead can't see a concrete enough connection between what they'd pay and what they'd gain. The conversation stalled because value was communicated in features, not in measurable outcomes specific to their situation.",
  timing_issue:
    "The lead indicated the timing wasn't right. This is the most recoverable objection in sales because it's not about the offer — it's about the calendar. Timing objections surface when a lead has real interest but a competing internal priority. The window reopens as soon as that priority resolves, and first to follow up at that moment wins.",
  trust_issue:
    "The lead expressed doubt or asked for proof — a clear signal that the credibility gap wasn't closed in the initial conversation. Trust objections don't mean disinterest. They mean the lead is interested enough to want to believe you but hasn't seen enough evidence to take the risk. Social proof, case studies, and specific outcomes for similar clients are what close this gap.",
  competitor:
    "Your notes show the lead is considering a competing solution. The sale is still alive — they haven't decided yet. This is a comparison, not a loss. What determines the outcome now is who follows up with the most specific and relevant value case for their exact situation. Generic features don't win comparison conversations. Specific outcomes do.",
  no_follow_up:
    "The conversation stalled because no follow-up was made — the ball was left in your court and the lead moved on to other priorities. This is the most preventable cause of lead loss. The lead didn't reject you; they simply filled their attention with whatever was in front of them. Re-engagement resets the conversation, and most leads in this category are receptive to a well-framed restart.",
  lack_of_urgency:
    "The lead is interested but has no perceived urgency to act. When there's no clear cost to waiting, waiting becomes the default. This lead needs to understand what the delay is actually costing them — not in abstract terms, but in specific, quantifiable impact. Urgency isn't manufactured pressure; it's the honest articulation of what inaction costs.",
};

const SIGNAL_ACTION: Record<SignalType, string> = {
  price_concern:
    "Reframe the conversation entirely around outcome, not cost. Lead with a specific case study or data point that makes the ROI concrete for someone in their situation. Never defend the price — instead, make the value so specific and measurable that the price becomes a secondary consideration. If available, offer a tiered entry point or a risk-reversal mechanism.",
  timing_issue:
    "Remove all pressure from the re-engagement message. Ask a single low-stakes question: has the original situation resolved itself, or is it still something on their radar? Your goal is to stay in their awareness without creating friction. When the timing shifts in their favour, you want to be the first person they think of — and that only happens through non-pressured, consistent presence.",
  trust_issue:
    "Lead with credibility, not pitch. Share a specific result you've achieved for someone in a comparable situation — name the category of client, the specific problem, and the measurable outcome. Offer a reference call, a case study, or a proof-of-concept if your offer allows it. Every element of your message should reduce perceived risk, not increase it.",
  competitor:
    "Differentiate without attacking. Acknowledge that they're doing due diligence — it's smart. Then make one specific, honest point about why your solution is the right fit for their particular situation that no competitor can match. Don't list features. Don't discount. One specific insight about their situation that positions you correctly is more persuasive than a full comparison deck.",
  no_follow_up:
    "Restart the conversation cleanly and without guilt. Reference the previous touchpoint briefly, acknowledge that you didn't follow up, and open the door without pressure. A simple yes/no question about whether the original problem has been solved is the most effective re-engagement pattern — it's easy to respond to and immediately reveals whether the lead is still relevant.",
  lack_of_urgency:
    "Make the cost of waiting concrete. Don't create artificial scarcity — instead, show what staying in the current situation is actually costing them over time. Frame the decision not as 'spend money now' but as 'continue paying the hidden cost of this problem.' A specific number, even an estimate, is dramatically more persuasive than abstract urgency language.",
};

const SIGNAL_TIMING: Record<SignalType, string> = {
  price_concern:    "Wait 3–5 days before following up with a ROI-focused message. Immediate follow-up on a price objection reads as pressure — give them space, then reframe.",
  timing_issue:     "Follow up every 2–3 weeks with a no-pressure check-in. Timing objections resolve on their own timeline — your job is to stay present until they do.",
  trust_issue:      "Follow up within 48 hours with a credibility piece — a case study, reference offer, or specific proof point. Trust gaps close fastest with evidence, not time.",
  competitor:       "Follow up within 24–48 hours. In an active comparison, delay signals low confidence. Move fast with a specific, tailored value case.",
  no_follow_up:     "Follow up today. No-follow-up leads are the most time-sensitive — the longer the silence continues, the harder the re-engagement becomes.",
  lack_of_urgency:  "Follow up within 1 week with a message focused on the cost of the current situation. Don't wait — urgency leads who feel no pressure will drift indefinitely.",
};

// ── Status fallback content (used when no signal is detected) ──────────────────
const STATUS_WHY_LOST: Record<LeadStatus, string> = {
  interested:
    "This lead expressed genuine interest but was never moved to the next step. The most common cause is an unclear offer or a missing follow-up that defined the specific next action. When leads feel interested but don't know exactly what happens next, they don't move — they wait, and eventually go cold.",
  follow_up_needed:
    "This lead required a follow-up that never arrived. The conversation created intent but the ball was left in your court. Without a structured follow-up sequence, high-intent leads like this drift into your competitors' pipelines while you're focused on new prospects.",
  comparing:
    "This lead is still evaluating their options — which means the sale is still alive. They weren't lost to disinterest; they were lost to a faster, more present competitor. The window is open but closing. First to follow up with the most specific value proposition wins.",
  no_response:
    "This lead went silent after initial contact. In most cases, non-response doesn't signal rejection — it signals inadequate follow-up or poorly timed outreach. The majority of 'no response' leads convert when contacted with a different channel, a different message angle, or a different time of day.",
  budget_concern:
    "A budget objection is almost never about money. It's about unclear return on investment. This lead can't justify the cost because the value equation hasn't been made concrete enough for their specific situation. The conversation needs to shift from price to outcome.",
  cold:
    "This lead has gone cold, which usually means the timing was wrong — not the person, not the offer. Life events, internal priorities, and budget cycles all pause buying decisions. Cold leads who matched your original qualification criteria are often the highest-converting re-engagement targets because the work of qualification is already done.",
};

const STATUS_ACTION: Record<LeadStatus, string> = {
  interested:
    "Send a direct, specific message that defines the exact next step — not a check-in, but a concrete proposal. Include one specific outcome your offer delivers and a single low-friction call to action. Eliminate ambiguity about what they're committing to.",
  follow_up_needed:
    "Initiate contact immediately with a clear next step. Reference your previous conversation specifically — not generically. Give them a reason to respond that's rooted in the value they'll receive, not in your need to close. Propose a specific time to reconnect.",
  comparing:
    "Differentiate rather than discount. Send a comparison-ready message that honestly addresses why your solution is the right fit for their specific situation — not why it's better in general. Specificity wins comparison conversations, not features.",
  no_response:
    "Switch channels and switch angles. If you emailed, try a voice message. If you called, try a brief text. Open with the outcome they were looking for, not a reminder of who you are. Keep it under 60 words. Add a simple yes/no question to lower the response barrier.",
  budget_concern:
    "Reframe the conversation around ROI, not cost. Share a specific case study or data point that makes the return concrete. Offer a payment structure or a smaller entry point if available. Never defend the price — instead, make the value undeniable.",
  cold:
    "Re-engage with a fresh angle, not a reminder. Lead with something new: a result you've achieved for someone in their situation, a relevant industry development, or a genuine question about whether the original problem has been solved. Make it easy to say yes by removing any implied pressure.",
};

const STATUS_TIMING: Record<LeadStatus, string> = {
  interested:        "Within 24 hours — high-intent leads deteriorate rapidly without a defined next step.",
  follow_up_needed:  "Today. Every additional day without contact reduces close probability by approximately 10%.",
  comparing:         "Within 48 hours — your competitor is likely already in contact. Urgency is justified.",
  no_response:       "Try a different channel within 48 hours. Then follow a Day 3 · 7 · 14 · 30 cadence.",
  budget_concern:    "Give 3–5 days after a ROI reframe. Pressure accelerates rejection on budget objections.",
  cold:              "Re-engage after 2–3 weeks with a fresh angle, not a follow-up reminder.",
};

// ── Spanish translations ────────────────────────────────────────────────────────
const SIGNAL_WHY_LOST_ES: Record<SignalType, string> = {
  price_concern:
    "Tus notas indican una objeción de precio — pero una objeción de precio casi nunca es realmente sobre el precio. Es sobre un retorno de inversión poco claro. Este lead no puede ver una conexión suficientemente concreta entre lo que pagaría y lo que ganaría. La conversación se detuvo porque el valor se comunicó en características, no en resultados medibles específicos para su situación.",
  timing_issue:
    "El lead indicó que el momento no era el adecuado. Esta es la objeción más recuperable en ventas porque no se trata de la oferta — se trata del calendario. Las objeciones de timing surgen cuando un lead tiene interés real pero una prioridad interna que compite. La ventana se vuelve a abrir tan pronto como esa prioridad se resuelve, y el primero en dar seguimiento en ese momento gana.",
  trust_issue:
    "El lead expresó duda o pidió pruebas — una señal clara de que la brecha de credibilidad no se cerró en la conversación inicial. Las objeciones de confianza no significan falta de interés. Significan que el lead está lo suficientemente interesado como para querer creer en ti, pero no ha visto suficiente evidencia para asumir el riesgo. La prueba social, los casos de estudio y los resultados específicos para clientes similares son lo que cierra esta brecha.",
  competitor:
    "Tus notas muestran que el lead está considerando una solución de la competencia. La venta sigue viva — todavía no han decidido. Esto es una comparación, no una pérdida. Lo que determina el resultado ahora es quién da seguimiento con el caso de valor más específico y relevante para su situación exacta. Las características genéricas no ganan en conversaciones de comparación. Los resultados específicos sí.",
  no_follow_up:
    "La conversación se detuvo porque no se hizo seguimiento — la pelota quedó en tu cancha y el lead siguió con otras prioridades. Esta es la causa más prevenible de pérdida de leads. El lead no te rechazó; simplemente llenó su atención con lo que tenía enfrente. La reactivación reinicia la conversación, y la mayoría de los leads en esta categoría son receptivos a un reinicio bien enmarcado.",
  lack_of_urgency:
    "El lead está interesado pero no percibe urgencia para actuar. Cuando no hay un costo claro por esperar, esperar se convierte en la opción predeterminada. Este lead necesita entender qué le está costando realmente el retraso — no en términos abstractos, sino en impacto específico y cuantificable. La urgencia no es presión artificial; es la articulación honesta de lo que cuesta la inacción.",
};

const SIGNAL_ACTION_ES: Record<SignalType, string> = {
  price_concern:
    "Reencuadra la conversación completamente alrededor del resultado, no del costo. Lidera con un caso de estudio específico o dato que haga el ROI concreto para alguien en su situación. Nunca defiendas el precio — en cambio, haz el valor tan específico y medible que el precio se convierta en una consideración secundaria. Si está disponible, ofrece un punto de entrada escalonado o un mecanismo de reversión de riesgo.",
  timing_issue:
    "Elimina toda presión del mensaje de reactivación. Haz una sola pregunta de bajo impacto: ¿se resolvió la situación original, o sigue siendo algo en su radar? Tu objetivo es mantenerte en su conciencia sin crear fricción. Cuando el momento cambie a su favor, quieres ser la primera persona en la que piensen — y eso solo ocurre a través de una presencia consistente y sin presión.",
  trust_issue:
    "Lidera con credibilidad, no con argumento de venta. Comparte un resultado específico que hayas logrado para alguien en una situación comparable — nombra la categoría de cliente, el problema específico y el resultado medible. Ofrece una llamada de referencia, un caso de estudio o una prueba de concepto si tu oferta lo permite. Cada elemento de tu mensaje debe reducir el riesgo percibido, no aumentarlo.",
  competitor:
    "Diferénciate sin atacar. Reconoce que está haciendo su diligencia debida — es inteligente. Luego haz un punto específico y honesto sobre por qué tu solución es el ajuste correcto para su situación particular que ningún competidor puede igualar. No listes características. No hagas descuentos. Un insight específico sobre su situación que te posicione correctamente es más persuasivo que toda una presentación comparativa.",
  no_follow_up:
    "Reinicia la conversación de manera limpia y sin culpa. Referencia el punto de contacto anterior brevemente, reconoce que no diste seguimiento, y abre la puerta sin presión. Una pregunta simple de sí/no sobre si el problema original fue resuelto es el patrón de reactivación más efectivo — es fácil de responder e inmediatamente revela si el lead sigue siendo relevante.",
  lack_of_urgency:
    "Haz concreto el costo de esperar. No crees escasez artificial — en cambio, muestra lo que permanecer en la situación actual les está costando con el tiempo. Enmarca la decisión no como 'gastar dinero ahora' sino como 'seguir pagando el costo oculto de este problema.' Un número específico, incluso una estimación, es dramáticamente más persuasivo que el lenguaje abstracto de urgencia.",
};

const SIGNAL_TIMING_ES: Record<SignalType, string> = {
  price_concern:    "Espera 3–5 días antes de dar seguimiento con un mensaje enfocado en ROI. El seguimiento inmediato en una objeción de precio se siente como presión — dale espacio y luego reencuadra.",
  timing_issue:     "Da seguimiento cada 2–3 semanas con un chequeo sin presión. Las objeciones de timing se resuelven a su propio ritmo — tu trabajo es mantenerte presente hasta que lo hagan.",
  trust_issue:      "Da seguimiento dentro de las 48 horas con una pieza de credibilidad — un caso de estudio, oferta de referencia o prueba específica. Las brechas de confianza se cierran más rápido con evidencia, no con tiempo.",
  competitor:       "Da seguimiento dentro de las 24–48 horas. En una comparación activa, el retraso señala baja confianza. Muévete rápido con un caso de valor específico y personalizado.",
  no_follow_up:     "Da seguimiento hoy. Los leads sin seguimiento son los más urgentes en tiempo — mientras más dure el silencio, más difícil se vuelve la reactivación.",
  lack_of_urgency:  "Da seguimiento dentro de 1 semana con un mensaje enfocado en el costo de la situación actual. No esperes — los leads sin urgencia que no sienten presión se alejan indefinidamente.",
};

const STATUS_WHY_LOST_ES: Record<LeadStatus, string> = {
  interested:
    "Este lead expresó interés genuino pero nunca fue llevado al siguiente paso. La causa más común es una oferta poco clara o un seguimiento que faltó y definiera el próximo paso específico. Cuando los leads se sienten interesados pero no saben exactamente qué ocurre después, no avanzan — esperan, y eventualmente se enfrían.",
  follow_up_needed:
    "Este lead requería un seguimiento que nunca llegó. La conversación creó intención pero la pelota quedó en tu cancha. Sin una secuencia estructurada de seguimiento, los leads de alta intención como este se deslizan hacia los pipelines de tu competencia mientras tú estás enfocado en nuevos prospectos.",
  comparing:
    "Este lead todavía está evaluando sus opciones — lo que significa que la venta sigue viva. No se perdió por falta de interés; se perdió ante un competidor más rápido y más presente. La ventana está abierta pero cerrándose. El primero en dar seguimiento con la propuesta de valor más específica gana.",
  no_response:
    "Este lead guardó silencio después del contacto inicial. En la mayoría de los casos, la no respuesta no señala rechazo — señala seguimiento inadecuado o contacto mal timed. La mayoría de los leads 'sin respuesta' convierten cuando se les contacta con un canal diferente, un ángulo de mensaje diferente o un horario diferente del día.",
  budget_concern:
    "Una objeción de presupuesto casi nunca es sobre dinero. Es sobre retorno de inversión poco claro. Este lead no puede justificar el costo porque la ecuación de valor no se ha hecho suficientemente concreta para su situación específica. La conversación necesita cambiar de precio a resultado.",
  cold:
    "Este lead se ha enfriado, lo que generalmente significa que el momento estaba mal — no la persona, no la oferta. Los eventos de vida, las prioridades internas y los ciclos de presupuesto pausan las decisiones de compra. Los leads fríos que coincidieron con tu criterio de calificación original son a menudo los objetivos de reactivación de mayor conversión porque el trabajo de calificación ya está hecho.",
};

const STATUS_ACTION_ES: Record<LeadStatus, string> = {
  interested:
    "Envía un mensaje directo y específico que defina el próximo paso exacto — no un chequeo, sino una propuesta concreta. Incluye un resultado específico que entrega tu oferta y un llamado a la acción único de baja fricción. Elimina la ambigüedad sobre a qué se están comprometiendo.",
  follow_up_needed:
    "Inicia contacto de inmediato con un próximo paso claro. Referencia tu conversación anterior de forma específica — no genérica. Dales una razón para responder arraigada en el valor que recibirán, no en tu necesidad de cerrar. Propón un horario específico para reconectarse.",
  comparing:
    "Diferénciate en lugar de hacer descuentos. Envía un mensaje listo para comparación que aborde honestamente por qué tu solución es el ajuste correcto para su situación específica — no por qué es mejor en general. La especificidad gana conversaciones de comparación, no las características.",
  no_response:
    "Cambia de canal y de ángulo. Si enviaste email, prueba un mensaje de voz. Si llamaste, prueba un texto breve. Empieza con el resultado que buscaban, no un recordatorio de quién eres. Mantenlo por debajo de 60 palabras. Agrega una pregunta simple de sí/no para reducir la barrera de respuesta.",
  budget_concern:
    "Reencuadra la conversación alrededor del ROI, no del costo. Comparte un caso de estudio específico o dato que haga el retorno concreto. Ofrece una estructura de pago o un punto de entrada más pequeño si está disponible. Nunca defiendas el precio — en cambio, haz el valor innegable.",
  cold:
    "Reactiva con un ángulo fresco, no con un recordatorio. Lidera con algo nuevo: un resultado que hayas logrado para alguien en su situación, un desarrollo relevante de la industria, o una pregunta genuina sobre si el problema original fue resuelto. Facilita el sí eliminando cualquier presión implícita.",
};

const STATUS_TIMING_ES: Record<LeadStatus, string> = {
  interested:        "Dentro de las 24 horas — los leads de alta intención se deterioran rápidamente sin un próximo paso definido.",
  follow_up_needed:  "Hoy. Cada día adicional sin contacto reduce la probabilidad de cierre en aproximadamente un 10%.",
  comparing:         "Dentro de las 48 horas — tu competidor probablemente ya está en contacto. La urgencia está justificada.",
  no_response:       "Prueba un canal diferente dentro de las 48 horas. Luego sigue una cadencia de Día 3 · 7 · 14 · 30.",
  budget_concern:    "Da 3–5 días después de un reencuadre de ROI. La presión acelera el rechazo en objeciones de presupuesto.",
  cold:              "Reactiva después de 2–3 semanas con un ángulo fresco, no con un recordatorio de seguimiento.",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function nameHash(s: string): number {
  return s.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}
function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function daysBetween(from: string): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000));
}

// ── Score computation (signal-aware) ──────────────────────────────────────────
function computeScore(status: LeadStatus, lastContact: string, notes: string, signals: SignalType[]): number {
  let score = STATUS_BASE_SCORE[status];
  const days = daysBetween(lastContact);
  if      (days < 7)   score -= 0;
  else if (days < 30)  score -= 8;
  else if (days < 90)  score -= 18;
  else if (days < 180) score -= 28;
  else                 score -= 38;

  const n = notes.toLowerCase();
  if (notes.length > 80)                                           score += 5;
  if (/interest|yes|love|excit|great|perfect|absolutely/.test(n)) score += 8;
  if (/not now|maybe|think|decide later|perhaps/.test(n))         score -= 5;

  for (const sig of signals) {
    score += SIGNAL_DEFS[sig].scoreDelta;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreToProbability(score: number): Probability {
  if (score >= 60) return "High";
  if (score >= 38) return "Medium";
  return "Low";
}

function computeRevenue(status: LeadStatus, leadName: string, companyName: string): number {
  const base      = STATUS_REVENUE_BASE[status];
  const variation = (nameHash(leadName + companyName) % 40) / 100;
  return Math.round(base * (1 + variation));
}

function resolveObjection(signals: SignalType[], status: LeadStatus): string {
  if (signals.length > 0) return SIGNAL_DEFS[signals[0]].label;
  return STATUS_OBJECTION[status];
}

// ── Spanish recovery message ──────────────────────────────────────────────────
function buildRecoveryMessageES(
  leadName:    string,
  companyName: string,
  status:      LeadStatus,
  signals:     SignalType[],
  lastContact: string,
): string {
  const first   = leadName.split(" ")[0] || leadName;
  const company = companyName ? ` en ${companyName}` : "";
  const days    = daysBetween(lastContact);
  const timeRef =
    days === 0 ? "más temprano hoy" :
    days === 1 ? "ayer" :
    days < 7   ? `hace ${days} días` :
    days < 30  ? `hace aproximadamente ${Math.round(days / 7)} semana${Math.round(days / 7) !== 1 ? "s" : ""}` :
    days < 365 ? `hace aproximadamente ${Math.round(days / 30)} mes${Math.round(days / 30) !== 1 ? "es" : ""}` :
                 "hace un tiempo";

  const strongest = getStrongest(signals);

  if (strongest === "price_concern") return (
    `Hola ${first},\n\nEstuve pensando en nuestra conversación de ${timeRef}${company}, y me di cuenta de que probablemente lideré demasiado con lo que cuesta en lugar de lo que realmente entrega.\n\nDéjame intentarlo de otra manera: [cliente en situación similar] logró [resultado específico y medible] en [plazo]. Eso es lo que se ve en la práctica — no una característica, un resultado real.\n\n¿Valdría la pena 10 minutos para ver cuál sería el retorno realista para tu situación específica? Sin venta — solo los números.`
  );

  if (strongest === "timing_issue") return (
    `Hola ${first},\n\nSé que cuando hablamos ${timeRef} el momento no era del todo el adecuado — lo entiendo completamente.\n\nNo me comunico para presionarte a nada. Solo quería chequear: ¿cambió la situación, o sigue siendo algo que planeas retomar cuando el momento sea el correcto?\n\nCualquier respuesta está bien. Un sí o no — y sabré exactamente cómo estamos.`
  );

  if (strongest === "trust_issue") return (
    `Hola ${first},\n\nEstuve pensando en nuestra conversación de ${timeRef}. Entiendo que necesitabas más confianza antes de avanzar — es una posición completamente razonable.\n\nMe gustaría ofrecerte algo concreto: [resultado específico para un cliente comparable en su situación — nombra el problema, la solución, el resultado]. También puedo organizar una llamada de referencia con alguien que haya pasado por el proceso si eso ayudaría.\n\nSin compromiso — solo claridad. ¿Te sería útil?`
  );

  if (strongest === "competitor") return (
    `Hola ${first},\n\nSé que estás haciendo tu diligencia debida y mirando tus opciones — ese es exactamente el enfoque correcto.\n\nNo voy a darte otro argumento de venta. En cambio, solo quiero hacer una pregunta honesta: ¿hay una razón específica por la que la otra opción se siente más adecuada para tu situación, o todavía es una comparación abierta?\n\nSi hay algo específico que pueda aclarar sobre lo que hacemos diferente para [su tipo de situación], prefiero tener esa conversación directamente que dejarlo a las suposiciones.`
  );

  if (strongest === "no_follow_up") return (
    `Hola ${first},\n\nTe debo un seguimiento — hablamos ${timeRef}${company} y no volví contigo de la manera que debería. Eso es responsabilidad mía.\n\nNo quería dejar pasar más tiempo sin comunicarme apropiadamente. ¿Todavía estás trabajando en [el desafío original], o ya fue resuelto?\n\nDe cualquier manera — con gusto retomamos donde lo dejamos, o te doy una respuesta clara si el momento ha cambiado.`
  );

  if (strongest === "lack_of_urgency") return (
    `Hola ${first},\n\nEstuve pensando en nuestra conversación de ${timeRef}. Quiero ser directo contigo: no voy a crear urgencia artificial.\n\nLo que sí diré es esto — los clientes con los que trabajo que avanzan en [el problema original] temprano consistentemente ven [resultado específico] que los que esperan no ven. La brecha se acumula con el tiempo, y generalmente no es visible hasta que lo es.\n\nPrefiero que tomes esta decisión con información completa que sin ella. ¿Vale 15 minutos ver cuál es el costo real de esperar en tu situación?`
  );

  const fallbacks: Record<LeadStatus, string> = {
    interested:
      `Hola ${first},\n\nEstaba revisando nuestra conversación de ${timeRef} y me di cuenta de que nunca te di un próximo paso claro — eso es responsabilidad mía.\n\nHabías expresado interés en [resultado específico]. Me gustaría hacerlo simple: aquí está exactamente lo que pasaría si avanzamos, y aquí está lo que se necesita.\n\n¿Tendría sentido retomar esto? Una llamada rápida de 15 minutos esta semana sería suficiente para darte claridad completa.`,
    follow_up_needed:
      `Hola ${first},\n\nFallé en dar seguimiento después de que hablamos ${timeRef}${company} — no quería dejar las cosas abiertas.\n\nTodavía me gustaría ayudarte con [meta específica de la conversación original]. ¿Sigues explorando esto, o cambió la situación?\n\nCon gusto retomamos exactamente donde lo dejamos — no es necesario empezar desde cero.`,
    comparing:
      `Hola ${first},\n\nSé que ahora mismo estás mirando tus opciones, y lo respeto. Solo quería comunicarme directamente.\n\nEn lugar de presentarte el argumento nuevamente, me gustaría preguntar: ¿qué haría que esta decisión fuera sencilla para ti? Prefiero saber lo que realmente necesitas que adivinarlo.\n\n¿Vale una conversación rápida?`,
    no_response:
      `Hola ${first},\n\nSé que el momento puede no haber sido el adecuado cuando hablamos ${timeRef} — está completamente bien.\n\nSolo quería chequear: ¿el [problema original] ya fue resuelto, o es algo en lo que todavía estás trabajando?\n\nSolo un sí o no — yo sigo desde ahí.`,
    budget_concern:
      `Hola ${first},\n\nEstuve pensando en nuestra última conversación de ${timeRef}. Me di cuenta de que probablemente me enfoqué demasiado en el costo en lugar del resultado.\n\nDéjame compartir algo concreto: [resultado específico para cliente similar en su situación]. Eso es lo que se ve en la práctica.\n\n¿Valdría la pena 10 minutos ver cuál sería el retorno real para ti específicamente?`,
    cold:
      `Hola ${first},\n\nHa pasado un tiempo desde que conectamos. No voy a pretender lo contrario.\n\nRecientemenente me topé con algo que me hizo pensar en [su empresa/situación] y pensé que valía una nota rápida. [Insight relevante o resultado].\n\n¿El [desafío original] sigue en tu radar, o ya fue resuelto?`,
  };
  return fallbacks[status];
}

// ── Recovery message (signal-driven, status fallback) ─────────────────────────
function buildRecoveryMessage(
  leadName:    string,
  companyName: string,
  status:      LeadStatus,
  signals:     SignalType[],
  lastContact: string,
): string {
  const first   = leadName.split(" ")[0] || leadName;
  const company = companyName ? ` at ${companyName}` : "";
  const days    = daysBetween(lastContact);
  const timeRef =
    days === 0 ? "earlier today" :
    days === 1 ? "yesterday" :
    days < 7   ? `${days} days ago` :
    days < 30  ? `about ${Math.round(days / 7)} week${Math.round(days / 7) !== 1 ? "s" : ""} ago` :
    days < 365 ? `about ${Math.round(days / 30)} month${Math.round(days / 30) !== 1 ? "s" : ""} ago` :
                 "a while back";

  const strongest = getStrongest(signals);

  // Signal-specific messages take priority
  if (strongest === "price_concern") return (
    `Hi ${first},\n\nI was reflecting on our conversation from ${timeRef}${company}, and I realised I probably led too much with what it costs rather than what it actually delivers.\n\nLet me try again differently: [specific client situation similar to theirs] saw [specific measurable result] within [timeframe]. That's what this looks like in practice — not a feature, an actual outcome.\n\nWould it be worth 10 minutes to look at what the return would realistically be for your specific situation? No pitch — just the numbers.`
  );

  if (strongest === "timing_issue") return (
    `Hi ${first},\n\nI know when we spoke ${timeRef} the timing wasn't quite right — and I completely understand that.\n\nI'm not reaching out to pressure you into anything. I just wanted to check in: has the situation shifted at all, or is it still something you're planning to revisit when the time is right?\n\nEither answer is fine. Just a yes or no — and I'll know exactly where we stand.`
  );

  if (strongest === "trust_issue") return (
    `Hi ${first},\n\nI've been thinking about our conversation from ${timeRef}. I understand you needed more confidence before moving forward — that's a completely reasonable position.\n\nI'd like to offer something concrete: [specific result for a comparable client in their situation — name the problem, the solution, the outcome]. I can also arrange a quick reference call with someone who's been through the process if that would help.\n\nNo commitment required — just clarity. Would that be useful?`
  );

  if (strongest === "competitor") return (
    `Hi ${first},\n\nI know you're doing your due diligence and looking at your options — that's exactly the right approach.\n\nI'm not going to pitch you. Instead, I just want to ask one honest question: is there a specific reason the other option feels like a better fit for your situation, or is it still an open comparison?\n\nIf there's something specific I can address or clarify about what we do differently for [their type of situation], I'd rather have that conversation directly than leave it to assumptions.`
  );

  if (strongest === "no_follow_up") return (
    `Hi ${first},\n\nI owe you a follow-up — we spoke ${timeRef}${company} and I didn't come back to you the way I should have. That's on me.\n\nI didn't want to let more time pass without reaching out properly. Are you still working through [the original challenge], or has that already been handled?\n\nEither way — happy to pick up where we left off, or to give you a clean answer if the timing's changed.`
  );

  if (strongest === "lack_of_urgency") return (
    `Hi ${first},\n\nI've been thinking about our conversation from ${timeRef}. I want to be straightforward with you: I'm not going to create artificial urgency.\n\nWhat I will say is this — the clients I work with who move on [the original problem] early consistently see [specific outcome] that those who wait don't. The gap compounds over time, and it's usually not visible until it is.\n\nI'd rather you make this decision with complete information than without it. Worth 15 minutes to look at what the actual cost of waiting looks like in your situation?`
  );

  // Fallback to status-based messages
  const fallbacks: Record<LeadStatus, string> = {
    interested:
      `Hi ${first},\n\nI was reviewing our conversation from ${timeRef} and realised I never gave you a clear next step — that's on me.\n\nYou'd expressed interest in [specific outcome]. I'd like to make it simple: here's exactly what would happen if we moved forward, and here's what it would take.\n\nWould it make sense to pick this back up? A quick 15-minute call this week would be enough to get you full clarity.`,
    follow_up_needed:
      `Hi ${first},\n\nI dropped the ball on following up after we spoke ${timeRef}${company} — I didn't want to leave things open-ended.\n\nI'd still like to help you [specific goal from original conversation]. Are you still exploring this, or has the situation changed?\n\nHappy to pick up exactly where we left off — no need to start from scratch.`,
    comparing:
      `Hi ${first},\n\nI know you're looking at your options right now, and I respect that. I just wanted to reach out directly.\n\nRather than pitch you again, I'd like to ask: what would make this decision straightforward for you? I'd rather know what you actually need than guess.\n\nWorth a quick conversation?`,
    no_response:
      `Hi ${first},\n\nI know the timing might not have been right when we last spoke ${timeRef} — that's completely fine.\n\nI wanted to check in simply: has the [original problem] already been solved, or is it still something you're working through?\n\nJust a yes or no — I'll take it from there.`,
    budget_concern:
      `Hi ${first},\n\nI've been thinking about our last conversation ${timeRef}. I realise I probably focused too much on cost rather than outcome.\n\nLet me share something concrete: [specific result for similar client in their situation]. That's what this looks like in practice.\n\nWould it be worth 10 minutes to look at what the actual return would be for you specifically?`,
    cold:
      `Hi ${first},\n\nIt's been a while since we connected. I'm not going to pretend otherwise.\n\nI came across something recently that made me think of [their company/situation] and I thought it was worth a quick note. [Relevant insight or result].\n\nIs the [original challenge] still something on your radar, or has it been handled?`,
  };
  return fallbacks[status];
}

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ description: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch { toast({ description: "Copy failed", variant: "destructive" }); }
  };
  return (
    <button onClick={handle} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0">
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-2 pb-1">
      <span className="text-primary">{icon}</span>
      <span className="text-xs font-bold text-primary uppercase tracking-wider">— {label}</span>
    </div>
  );
}

// ── Score ring ─────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 36, circ = 2 * Math.PI * r, fill = (score / 100) * circ;
  const color = score >= 60 ? "#22c55e" : score >= 38 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div className="-mt-14 flex flex-col items-center">
        <span className="text-2xl font-bold text-foreground">{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

// ── Probability badge ──────────────────────────────────────────────────────────
const PROB_STYLE: Record<Probability, string> = {
  High:   "bg-green-500/15 text-green-400 border-green-500/30",
  Medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Low:    "bg-red-500/15 text-red-400 border-red-500/30",
};

// ── Metric card ────────────────────────────────────────────────────────────────
function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Insight card ───────────────────────────────────────────────────────────────
function InsightCard({ icon, label, content, copyable = true }: { icon: React.ReactNode; label: string; content: string; copyable?: boolean }) {
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">{icon}{label}</div>
        {copyable && <CopyButton text={content} />}
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed">{content}</p>
    </div>
  );
}

// ── Enterprise: stage detection ───────────────────────────────────────────────
function resolveIsEnterprise(businessStage: string): boolean {
  const s = (businessStage || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /grande|large|corp|enterprise/.test(s);
}

// ── Enterprise: types ─────────────────────────────────────────────────────────
interface EnterpriseResult {
  revenueAtRisk:       number;
  recoverablePipeline: number;
  recoveryProbability: number;
  pipelineLeakagePct:  number;
  rootCause:           string;
  processFailure:      string;
  teamFailurePoint:    string;
  currentDealValue:    number;
  optimizedDealValue:  number;
  revenueUplift:       number;
  recommendations:     { priority: number; title: string; text: string }[];
  touchpoints:         { day: number; channel: string; objective: string; action: string }[];
}

// ── Enterprise: revenue scale (larger deal sizes) ─────────────────────────────
const ENTERPRISE_REV: Record<LeadStatus, number> = {
  interested:       125_000,
  follow_up_needed:  88_000,
  comparing:         72_000,
  no_response:       58_000,
  budget_concern:    48_000,
  cold:              32_000,
};

// ── Enterprise text maps (ES/EN) ──────────────────────────────────────────────
const ENT_ROOT_CAUSE: Record<"es"|"en", Record<SignalType, string>> = {
  es: {
    price_concern:   "Fallo en la articulación del ROI — la propuesta de valor no fue cuantificada en los términos que requería el tomador de decisión económico para justificar la aprobación del presupuesto.",
    timing_issue:    "Desalineación de timing de pipeline — la cuenta entró en un ciclo de congelamiento de presupuesto o de prioridades internas que no fue capturado en el CRM ni previsto en el forecast.",
    trust_issue:     "Brecha de credibilidad en el ciclo de evaluación — la cuenta requirió validación a nivel de referencia y prueba social que no fue entregada antes de que la evaluación se detuviera.",
    competitor:      "Desplazamiento competitivo — la cuenta entró en un ciclo activo de RFP/comparación y un competidor estableció presencia antes o se posicionó de forma más específica para su situación.",
    no_follow_up:    "Fallo de ejecución de pipeline — la cuenta no fue avanzada a través de la etapa de seguimiento debido a una brecha en la cadencia de ventas o en la gestión de actividades del CRM.",
    lack_of_urgency: "Desplazamiento de prioridad — el business case no fue suficientemente convincente para competir con las prioridades internas de la cuenta por presupuesto y atención ejecutiva.",
  },
  en: {
    price_concern:   "ROI articulation failure — the value proposition was not quantified in terms the economic buyer required for budget approval.",
    timing_issue:    "Pipeline timing misalignment — the account entered a budget freeze or priority cycle that was not captured in the CRM or reflected in the forecast.",
    trust_issue:     "Credibility gap in the evaluation cycle — the account required reference-level validation and social proof that was not delivered before the evaluation stalled.",
    competitor:      "Competitive displacement — the account entered an active RFP cycle and a competing vendor established positioning before your team could differentiate.",
    no_follow_up:    "Pipeline execution failure — the account was not progressed due to a gap in the sales cadence or a CRM activity management breakdown.",
    lack_of_urgency: "Priority displacement — the business case was not compelling enough to compete with the account's internal priorities for budget and executive attention.",
  },
};

const ENT_ROOT_CAUSE_STATUS: Record<"es"|"en", Record<LeadStatus, string>> = {
  es: {
    interested:       "Fallo en la definición del próximo paso — el lead expresó interés pero el equipo no concretó un compromiso de avance específico y el deal quedó en una etapa indefinida del pipeline.",
    follow_up_needed: "Brecha en la ejecución del pipeline — el deal requería seguimiento estructurado que no fue activado, lo que permitió que la cuenta perdiera prioridad y se enfriara.",
    comparing:        "Pérdida de posicionamiento en evaluación activa — la cuenta está en un ciclo de comparación y el equipo no mantuvo el ritmo de engagement necesario para mantener la posición de liderazgo.",
    no_response:      "Fallo de re-engagement — la cuenta entró en silencio después del contacto inicial y no se activó un protocolo de multi-canal para recuperar la conversación.",
    budget_concern:   "Fallo en la construcción del business case — la objeción de presupuesto indica que la propuesta de valor no fue conectada al retorno financiero de forma que justificara la inversión internamente.",
    cold:             "Deterioro de pipeline sin intervención — la cuenta se enfrió sin que se activara un protocolo de nurturing o re-engagement estructurado en el ciclo correspondiente.",
  },
  en: {
    interested:       "Next-step definition failure — the lead expressed interest but the team did not secure a specific commitment and the deal stalled in an undefined pipeline stage.",
    follow_up_needed: "Pipeline execution gap — the deal required structured follow-up that was not activated, allowing the account to deprioritize and go cold.",
    comparing:        "Positioning loss in active evaluation — the account is in a comparison cycle and the team did not maintain the engagement cadence required to hold the leading position.",
    no_response:      "Re-engagement failure — the account went silent after initial contact and no multi-channel re-engagement protocol was activated.",
    budget_concern:   "Business case construction failure — the budget objection indicates the value proposition was not connected to financial return in a way that justified internal approval.",
    cold:             "Pipeline deterioration without intervention — the account went cold without a structured nurturing or re-engagement protocol being activated.",
  },
};

const ENT_PROCESS_FAIL: Record<"es"|"en", Record<SignalType, string>> = {
  es: {
    price_concern:   "La documentación del business case no fue presentada en la etapa correcta del ciclo de evaluación, permitiendo que el costo se convirtiera en el criterio de decisión principal antes de que el ROI quedara establecido.",
    timing_issue:    "No existe un protocolo de monitoreo de salud de pipeline para detectar cuentas que entran en estado de congelamiento — estas cuentas caen del pipeline activo sin que se active un trigger de re-engagement.",
    trust_issue:     "Los activos de referencia y prueba social no fueron desplegados durante la etapa de evaluación mid-funnel, dejando la brecha de credibilidad abierta hasta que la cuenta se enfrió.",
    competitor:      "El proceso de inteligencia competitiva no detectó al competidor con suficiente anticipación para ajustar el posicionamiento y el mensaje antes de que la etapa de evaluación cristalizara.",
    no_follow_up:    "La gestión de actividades en el CRM falló — la tarea de seguimiento no fue creada, no fue asignada, o no fue escalada cuando superó el SLA estándar de follow-up.",
    lack_of_urgency: "El proceso de desarrollo del business case no cuantificó el costo de inacción para esta cuenta específica, permitiendo que el status quo pareciera financieramente neutro.",
  },
  en: {
    price_concern:   "Business case documentation was not presented at the right stage of the evaluation cycle, allowing cost to become the primary decision criterion before ROI was established.",
    timing_issue:    "No pipeline health monitoring protocol exists to detect accounts entering a freeze state — these accounts fall off the active pipeline without triggering a re-engagement response.",
    trust_issue:     "Reference and social proof assets were not deployed during the mid-funnel evaluation stage, leaving the credibility gap open until the account went cold.",
    competitor:      "The competitive intelligence process did not surface the competing vendor early enough to adjust positioning before the evaluation stage crystallized.",
    no_follow_up:    "CRM activity management failed — the follow-up task was not created, not assigned, or not escalated when it exceeded the standard follow-up SLA.",
    lack_of_urgency: "The business case development process did not quantify the cost of inaction for this specific account, allowing the status quo to appear cost-neutral.",
  },
};

const ENT_PROCESS_FAIL_STATUS: Record<"es"|"en", Record<LeadStatus, string>> = {
  es: {
    interested:       "El proceso de avance de pipeline no define un SLA de próximo paso para leads interesados — la ausencia de un compromiso concreto permite que los deals de alta intención se deterioren sin señal de alerta.",
    follow_up_needed: "El proceso de seguimiento no tiene automatización de actividades ni escalación cuando un deal no tiene actividad dentro del SLA establecido.",
    comparing:        "El proceso de gestión de deals en comparación no tiene un playbook de diferenciación activo ni un SLA de frecuencia de contacto para cuentas en evaluación competitiva.",
    no_response:      "No existe un protocolo de re-engagement multi-canal estructurado para cuentas en silencio — el proceso actual depende de acción manual no escalada.",
    budget_concern:   "El proceso de qualificación no validó la autoridad presupuestaria ni el proceso interno de aprobación de la cuenta antes de avanzar la oportunidad en el pipeline.",
    cold:             "El pipeline no tiene una etapa formal de nurturing con criterios de re-activación — los deals fríos son archivados sin un proceso de recuperación estructurado.",
  },
  en: {
    interested:       "The pipeline advancement process does not define a next-step SLA for interested leads — the absence of a concrete commitment allows high-intent deals to deteriorate without an alert.",
    follow_up_needed: "The follow-up process lacks activity automation and escalation when a deal has no activity within the established SLA.",
    comparing:        "The deal management process for accounts in comparison does not have an active differentiation playbook or a contact frequency SLA for competitive evaluations.",
    no_response:      "No structured multi-channel re-engagement protocol exists for silent accounts — the current process relies on unescalated manual action.",
    budget_concern:   "The qualification process did not validate budget authority or the account's internal approval process before advancing the opportunity in the pipeline.",
    cold:             "The pipeline has no formal nurturing stage with re-activation criteria — cold deals are archived without a structured recovery process.",
  },
};

const ENT_TEAM_FAIL: Record<"es"|"en", Record<SignalType, string>> = {
  es: {
    price_concern:   "Account Executive — no navegó la conversación de costo a valor antes de que la etapa de evaluación cerrara. Sales Manager — la revisión de pipeline no detectó la objeción de precio como señal de riesgo de deal.",
    timing_issue:    "Sales Manager — la revisión de pipeline no identificó el riesgo de timing y no activó un protocolo de nurturing para esta cuenta. CRM/Ops — no existe trigger automático para deals en estado de espera.",
    trust_issue:     "Account Executive + Marketing — el despliegue de activos de referencia y casos de estudio no fue activado en la etapa correcta del ciclo de evaluación.",
    competitor:      "Sales Development + Account Executive — el desplazamiento competitivo no fue identificado temprano en el pipeline para montar una respuesta de contra-posicionamiento.",
    no_follow_up:    "Account Executive + Sales Operations — el SLA de follow-up fue incumplido sin escalación ni re-asignación automática. La brecha es de proceso y de supervisión.",
    lack_of_urgency: "Account Executive + Sales Enablement — el business case para esta cuenta no fue personalizado con un análisis de costo de inacción específico para su situación.",
  },
  en: {
    price_concern:   "Account Executive — failed to navigate from cost to value before the evaluation stage closed. Sales Manager — pipeline review did not flag the price objection as a deal risk signal.",
    timing_issue:    "Sales Manager — pipeline review did not identify the timing risk and activate a nurture protocol. CRM/Ops — no automatic trigger exists for deals in a hold state.",
    trust_issue:     "Account Executive + Marketing — the reference and case study deployment process did not activate at the correct stage of the evaluation cycle.",
    competitor:      "Sales Development + Account Executive — competitive displacement was not identified early enough in the pipeline to mount a counter-positioning response.",
    no_follow_up:    "Account Executive + Sales Operations — the follow-up SLA was breached without escalation or automatic re-assignment. The failure is in both process and oversight.",
    lack_of_urgency: "Account Executive + Sales Enablement — the business case for this account was not customized with a cost-of-inaction analysis specific to their situation.",
  },
};

const ENT_TEAM_FAIL_STATUS: Record<"es"|"en", Record<LeadStatus, string>> = {
  es: {
    interested:       "Account Executive — responsable del avance del deal sin un compromiso de próximo paso específico. Sales Manager — la revisión de pipeline no detectó el deal estancado a tiempo.",
    follow_up_needed: "Account Executive — la actividad de seguimiento no fue ejecutada dentro del SLA. Sales Operations — el sistema de alertas de pipeline no escaló la inactividad.",
    comparing:        "Account Executive — frecuencia de contacto insuficiente durante el ciclo de evaluación competitiva. Sales Manager — la cadencia de competencia no fue aplicada.",
    no_response:      "Account Executive — sin actividad de re-engagement multi-canal. Sales Operations — no se activó el protocolo de cuentas en silencio.",
    budget_concern:   "Account Executive — calificación presupuestaria incompleta en etapa temprana. Sales Manager — el deal avanzó sin confirmar la autoridad de compra.",
    cold:             "Account Executive — ausencia de actividad de nurturing durante el período de enfriamiento. Sales Manager — el deal pasó a estado frío sin revisión ni acción.",
  },
  en: {
    interested:       "Account Executive — responsible for deal advancement without securing a specific next-step commitment. Sales Manager — pipeline review did not flag the stalled deal.",
    follow_up_needed: "Account Executive — follow-up activity was not executed within the SLA. Sales Operations — the pipeline alert system did not escalate the inactivity.",
    comparing:        "Account Executive — insufficient contact frequency during the competitive evaluation cycle. Sales Manager — the competitive cadence was not enforced.",
    no_response:      "Account Executive — no multi-channel re-engagement activity. Sales Operations — the silent-account protocol was not activated.",
    budget_concern:   "Account Executive — incomplete budget qualification at an early stage. Sales Manager — the deal advanced without confirming purchase authority.",
    cold:             "Account Executive — absence of nurturing activity during the cooling period. Sales Manager — the deal transitioned to cold status without review or action.",
  },
};

// Enterprise recommendations (per signal, top 3)
const ENT_RECS: Record<"es"|"en", Record<SignalType, { title: string; text: string }[]>> = {
  es: {
    price_concern: [
      { title:"Construir análisis de ROI personalizado", text:"Desarrolla un modelo financiero de una página específico para esta cuenta: inversión, retorno proyectado en 12 meses, y costo de inacción. Preséntalo con el tomador de decisión económico, no con el champion técnico." },
      { title:"Estructurar propuesta con opciones de entrada", text:"Rediseña la propuesta con una opción de piloto o entrada escalonada que reduzca el riesgo percibido inicial. La barrera no es el precio — es la relación riesgo/retorno percibida." },
      { title:"Implementar SLA de construcción de business case", text:"Establece que ningún deal supere la etapa de propuesta sin un business case documentado y validado por el champion interno. Ese documento será el que justifique la inversión internamente." },
    ],
    timing_issue: [
      { title:"Activar protocolo de nurturing de timing", text:"Mueve el deal a una etapa específica de 'timing hold' en el CRM con un trigger de re-activación automático en 30/60/90 días. El deal no debe ser archivado — debe ser gestionado activamente en modo latente." },
      { title:"Establecer cadencia de presencia ejecutiva", text:"El Account Executive senior o el Sales Manager contacta la cuenta cada 3 semanas con un insight relevante del sector — sin argumento de venta. El objetivo es mantener visibilidad de marca hasta que el timing se libere." },
      { title:"Mapear el calendario de decisión interno", text:"Solicita una conversación de 15 minutos con el champion para mapear el proceso interno de aprobación presupuestaria: ¿cuándo abre el próximo ciclo? ¿qué necesita estar listo para esa ventana?" },
    ],
    trust_issue: [
      { title:"Desplegar activos de referencia en 48 horas", text:"Organiza una llamada de referencia con un cliente actual en situación comparable. Complementa con un caso de estudio escrito y datos específicos de resultado. La brecha de credibilidad se cierra con evidencia concreta, no con argumentos de venta." },
      { title:"Ofrecer prueba de concepto de bajo riesgo", text:"Propón un piloto acotado (1 departamento, 30 días) que permita validar resultados antes del compromiso total. Eliminar el riesgo percibido convierte una evaluación paralizada en un cierre progresivo." },
      { title:"Involucrar liderazgo ejecutivo en la conversación", text:"Una llamada de 20 minutos con el VP o Director de tu organización hacia el tomador de decisión de la cuenta envía una señal de compromiso y seriedad que ningún material de marketing puede replicar." },
    ],
    competitor: [
      { title:"Ejecutar análisis de diferenciación específica", text:"Identifica los 3 puntos donde tu solución es superior para la situación específica de esta cuenta — no en general, sino para sus casos de uso, su industria y su escala. Esos 3 puntos son la única conversación que importa." },
      { title:"Acelerar la cadencia de contacto inmediatamente", text:"En una evaluación activa, retraso equivale a pérdida de posición. Contacto de alto valor cada 48 horas con el champion y cada semana con el tomador de decisión económico hasta que el proceso cierre." },
      { title:"Solicitar criterios de evaluación formales", text:"Pide una reunión para entender los criterios de decisión del comité de evaluación. Esa conversación te permite ajustar el posicionamiento en tiempo real y posiblemente influenciar los criterios antes de que cristalicen." },
    ],
    no_follow_up: [
      { title:"Auditar el protocolo de SLA de seguimiento", text:"Revisa el proceso: ¿quién es responsable del follow-up? ¿cuál es el SLA de tiempo de respuesta? ¿qué alerta se activa cuando se supera? Este deal es un síntoma — necesitas el diagnóstico del proceso para prevenir la recurrencia." },
      { title:"Reactivar el deal con nivel ejecutivo", text:"El primer re-contacto debe venir de un nivel ejecutivo superior al que tuvo la conversación original. Eso señala seriedad institucional y compensa el silencio anterior con autoridad." },
      { title:"Implementar automatización de actividades en CRM", text:"Ningún deal en pipeline activo debería quedar sin actividad por más de 5 días hábiles sin una alerta y escalación automática. Esa regla de negocio debe estar configurada en el CRM antes de la próxima semana." },
    ],
    lack_of_urgency: [
      { title:"Desarrollar análisis de costo de inacción", text:"Cuantifica lo que le está costando a esta cuenta estar en la situación actual: pérdida mensual, ineficiencia operativa, riesgo acumulado. Un número específico de costo de espera es la única forma honesta de crear urgencia real." },
      { title:"Conectar el deal a un evento de negocio con plazo", text:"Identifica si hay un evento interno (lanzamiento, fin de año fiscal, reorganización) que haga que resolver este problema antes de esa fecha tenga valor estratégico. La urgencia natural supera cualquier urgencia artificial." },
      { title:"Estructurar una propuesta con ventana de decisión", text:"Presenta dos opciones con diferencias concretas: avanzar esta semana vs. avanzar el próximo trimestre — con el impacto financiero real de cada opción claramente documentado." },
    ],
  },
  en: {
    price_concern: [
      { title:"Build a personalised ROI analysis", text:"Develop a one-page financial model specific to this account: investment, projected 12-month return, and cost of inaction. Present it with the economic buyer, not the technical champion." },
      { title:"Restructure the proposal with entry options", text:"Redesign the proposal with a pilot or tiered entry option that reduces the perceived initial risk. The barrier is not price — it is the perceived risk-to-return ratio." },
      { title:"Implement a business case SLA", text:"Establish that no deal advances past the proposal stage without a documented business case validated by the internal champion. That document is what justifies the investment internally." },
    ],
    timing_issue: [
      { title:"Activate a timing nurture protocol", text:"Move the deal to a specific 'timing hold' stage in the CRM with an auto re-activation trigger at 30/60/90 days. The deal should not be archived — it should be actively managed in a latent mode." },
      { title:"Establish an executive presence cadence", text:"The senior AE or Sales Manager contacts the account every 3 weeks with a relevant industry insight — no sales pitch. The goal is to maintain brand visibility until the timing clears." },
      { title:"Map the internal decision calendar", text:"Request a 15-minute conversation with the champion to map the internal budget approval process: when does the next cycle open? What needs to be ready for that window?" },
    ],
    trust_issue: [
      { title:"Deploy reference assets within 48 hours", text:"Arrange a reference call with a current client in a comparable situation. Complement with a written case study and specific outcome data. Credibility gaps close with concrete evidence, not sales arguments." },
      { title:"Offer a low-risk proof of concept", text:"Propose a scoped pilot (1 department, 30 days) that validates results before full commitment. Eliminating perceived risk converts a stalled evaluation into a progressive close." },
      { title:"Involve executive leadership in the conversation", text:"A 20-minute call from your VP or Director to the account's decision maker signals institutional commitment and seriousness that no marketing material can replicate." },
    ],
    competitor: [
      { title:"Execute a specific differentiation analysis", text:"Identify the 3 points where your solution is superior for this account's specific situation — not in general, but for their use cases, industry, and scale. Those 3 points are the only conversation that matters." },
      { title:"Accelerate contact cadence immediately", text:"In an active evaluation, delay equals loss of position. High-value contact every 48 hours with the champion and weekly with the economic buyer until the process closes." },
      { title:"Request formal evaluation criteria", text:"Ask for a meeting to understand the evaluation committee's decision criteria. That conversation lets you adjust positioning in real time and potentially influence the criteria before they crystallize." },
    ],
    no_follow_up: [
      { title:"Audit the follow-up SLA protocol", text:"Review the process: who owns the follow-up? What is the response time SLA? What alert fires when it is exceeded? This deal is a symptom — you need a process diagnosis to prevent recurrence." },
      { title:"Re-engage at executive level", text:"The first re-contact should come from a senior executive level above whoever had the original conversation. That signals institutional seriousness and compensates for the previous silence with authority." },
      { title:"Implement CRM activity automation", text:"No deal in the active pipeline should have zero activity for more than 5 business days without an automatic alert and escalation. That business rule must be configured in the CRM before next week." },
    ],
    lack_of_urgency: [
      { title:"Develop a cost-of-inaction analysis", text:"Quantify what staying in the current situation is costing this account: monthly loss, operational inefficiency, accumulated risk. A specific cost-of-waiting number is the only honest way to create real urgency." },
      { title:"Connect the deal to a time-bound business event", text:"Identify whether there is an internal event (launch, fiscal year-end, reorganisation) that makes solving this problem before that date strategically valuable. Natural urgency outperforms any artificial urgency." },
      { title:"Structure a proposal with a decision window", text:"Present two options with concrete differences: advancing this week vs. next quarter — with the real financial impact of each option clearly documented." },
    ],
  },
};

const ENT_RECS_STATUS: Record<"es"|"en", Record<LeadStatus, { title: string; text: string }[]>> = {
  es: {
    interested: [
      { title:"Concretar el compromiso de próximo paso hoy", text:"Contacta al champion hoy con una agenda de próximos pasos específica: qué sucede, cuándo y quién está involucrado. La ausencia de un próximo paso definido es la causa de muerte más común de los deals de alta intención." },
      { title:"Validar autoridad de compra y proceso interno", text:"Confirma con el champion: ¿quién más necesita estar involucrado en la decisión? ¿cuál es el proceso interno de aprobación? Sin esa visibilidad, el deal puede bloquearse en una etapa que el equipo no ve." },
      { title:"Activar cadencia ejecutiva de cierre", text:"El Sales Manager se involucra directamente con un mensaje de alto nivel que refuerce la seriedad institucional y establezca una fecha de decisión con el tomador de decisión económico." },
    ],
    follow_up_needed: [
      { title:"Recuperar el deal con re-engagement de alto nivel", text:"El primer contacto de re-activación debe ser personal, específico y de nivel ejecutivo. Referencia la conversación original, reconoce el silencio y propón un próximo paso concreto con fecha." },
      { title:"Revisar y fortalecer el business case", text:"Antes del re-engagement, actualiza el business case con información reciente del sector o nuevos datos de resultado. El re-contacto debe tener algo nuevo de valor, no ser una repetición de la propuesta original." },
      { title:"Automatizar el SLA de seguimiento en CRM", text:"Configura una alerta de actividad en el CRM que escale automáticamente cuando un deal en pipeline activo supere 5 días hábiles sin actividad registrada. Este deal es el caso de uso de esa regla." },
    ],
    comparing: [
      { title:"Solicitar reunión de diferenciación inmediata", text:"Pide una reunión de 30 minutos específicamente para mostrar cómo tu solución aborda los casos de uso concretos de esta cuenta — no una demo genérica, sino una presentación de su situación específica." },
      { title:"Identificar y fortalecer al champion interno", text:"Asegúrate de que el champion interno tiene los argumentos y el material necesario para defendertu solución ante el comité de evaluación. Tu éxito depende de la calidad de tu representación cuando no estás en la sala." },
      { title:"No reducir precio — aumentar valor percibido", text:"En una comparación activa, el descuento señala inseguridad y reduce el valor percibido. En cambio, agrega elementos de valor: soporte, implementación, garantía, o acceso a recursos que el competidor no ofrece." },
    ],
    no_response: [
      { title:"Activar protocolo multi-canal en 24 horas", text:"Si el canal actual no funciona, cambia el canal hoy: email → llamada → LinkedIn → WhatsApp/SMS según el perfil del contacto. El silencio en un canal no es rechazo — es falta de visibilidad en el canal correcto." },
      { title:"Enviar insight de valor antes del pitch", text:"El primer mensaje de re-contacto no debe mencionar la propuesta. Envía algo de valor directo: un insight del sector, un caso relevante, o una pregunta genuina sobre el estado del problema original." },
      { title:"Involucrar contacto alternativo en la organización", text:"Si el contacto principal no responde, identifica un segundo contacto en la organización — mismo nivel o superior. Una conversación paralela puede desbloquear el acceso al contacto primario." },
    ],
    budget_concern: [
      { title:"Reconstruir el business case con datos duros", text:"Desarrolla un análisis financiero de una página con el ROI específico para esta cuenta: inversión vs. retorno proyectado vs. costo de inacción. Ese documento convierte la conversación de 'gasto' a 'inversión con retorno definido'." },
      { title:"Validar el proceso interno de aprobación", text:"Entiende cómo se aprueba un presupuesto de este tamaño en la organización: ¿quién firma? ¿qué documentación se necesita? ¿cuándo es el próximo ciclo de aprobación? Esa información define el siguiente paso real." },
      { title:"Explorar estructura de pago alternativa", text:"Si el problema es flujo de caja y no ROI, propón opciones de estructura de pago que alineen los desembolsos con los resultados: pago en hitos, financiamiento, o un piloto que convierte en deal completo." },
    ],
    cold: [
      { title:"Re-activación con ángulo completamente nuevo", text:"No envíes un recordatorio de la propuesta anterior. Llega con algo completamente nuevo: un resultado relevante logrado para una cuenta en situación similar, un cambio en el mercado que hace el problema más urgente, o una pregunta genuina sobre el estado actual." },
      { title:"Revisar calificación del deal antes de invertir recursos", text:"Antes de re-activar el deal, valida que la cuenta sigue calificada: ¿tienen el problema? ¿tienen presupuesto? ¿el champion sigue en la organización? Invertir recursos en un deal descalificado es el error más caro del pipeline." },
      { title:"Activar secuencia de nurturing de largo plazo", text:"Si la cuenta no está lista ahora pero sigue calificada, muévela a una secuencia de nurturing de 90 días con contactos de valor cada 3 semanas. El objetivo no es cerrar — es estar presente cuando el momento cambie." },
    ],
  },
  en: {
    interested: [
      { title:"Secure a next-step commitment today", text:"Contact the champion today with a specific next-steps agenda: what happens, when, and who is involved. The absence of a defined next step is the most common cause of death for high-intent deals." },
      { title:"Validate purchase authority and internal process", text:"Confirm with the champion: who else needs to be involved in the decision? What is the internal approval process? Without that visibility, the deal can stall in a stage the team cannot see." },
      { title:"Activate an executive closing cadence", text:"The Sales Manager gets involved directly with a high-level message reinforcing institutional seriousness and establishing a decision date with the economic buyer." },
    ],
    follow_up_needed: [
      { title:"Recover the deal with high-level re-engagement", text:"The first re-activation contact must be personal, specific, and at executive level. Reference the original conversation, acknowledge the silence, and propose a concrete next step with a date." },
      { title:"Review and strengthen the business case", text:"Before re-engagement, update the business case with recent industry data or new outcome figures. The re-contact must bring something new of value, not repeat the original proposal." },
      { title:"Automate the follow-up SLA in CRM", text:"Configure a CRM activity alert that auto-escalates when a deal in the active pipeline exceeds 5 business days with no recorded activity. This deal is the use case for that rule." },
    ],
    comparing: [
      { title:"Request an immediate differentiation meeting", text:"Ask for a 30-minute meeting specifically to show how your solution addresses this account's concrete use cases — not a generic demo, but a presentation of their specific situation." },
      { title:"Identify and strengthen the internal champion", text:"Ensure the internal champion has the arguments and material needed to defend your solution in front of the evaluation committee. Your success depends on the quality of your representation when you are not in the room." },
      { title:"Do not discount — increase perceived value", text:"In an active comparison, discounting signals insecurity and reduces perceived value. Instead, add value elements: support, implementation, guarantee, or access to resources the competitor does not offer." },
    ],
    no_response: [
      { title:"Activate multi-channel protocol within 24 hours", text:"If the current channel is not working, switch channels today: email → call → LinkedIn → WhatsApp/SMS based on the contact's profile. Silence on one channel is not rejection — it is lack of visibility on the right channel." },
      { title:"Send a value insight before the pitch", text:"The first re-contact message should not mention the proposal. Send something of direct value: an industry insight, a relevant case, or a genuine question about the current state of the original problem." },
      { title:"Engage an alternative contact in the organisation", text:"If the primary contact is unresponsive, identify a second contact in the organisation at the same or higher level. A parallel conversation can unblock access to the primary contact." },
    ],
    budget_concern: [
      { title:"Rebuild the business case with hard data", text:"Develop a one-page financial analysis with the specific ROI for this account: investment vs. projected return vs. cost of inaction. That document converts the conversation from 'expense' to 'investment with defined return'." },
      { title:"Validate the internal approval process", text:"Understand how a budget of this size gets approved in the organisation: who signs? What documentation is required? When is the next approval cycle? That information defines the real next step." },
      { title:"Explore an alternative payment structure", text:"If the issue is cash flow rather than ROI, propose payment structure options that align disbursements with outcomes: milestone payments, financing, or a pilot that converts to a full deal." },
    ],
    cold: [
      { title:"Re-activate with a completely new angle", text:"Do not send a reminder about the previous proposal. Come with something entirely new: a relevant result achieved for an account in a similar situation, a market change that makes the problem more urgent, or a genuine question about the current state." },
      { title:"Re-qualify the deal before investing resources", text:"Before re-activating the deal, validate that the account is still qualified: do they still have the problem? Do they have budget? Is the champion still at the organisation? Investing resources in a disqualified deal is the most expensive pipeline mistake." },
      { title:"Activate a long-term nurturing sequence", text:"If the account is not ready now but remains qualified, move it to a 90-day nurturing sequence with value touchpoints every 3 weeks. The goal is not to close — it is to be present when the moment changes." },
    ],
  },
};

// ── Enterprise: build analysis ─────────────────────────────────────────────────
function buildEnterpriseAnalysis(
  score:    number,
  status:   LeadStatus,
  signals:  SignalType[],
  leadName: string,
  companyName: string,
  days:     number,
  lang:     "es" | "en",
): EnterpriseResult {
  const strongest = signals[0] ?? null;

  // Revenue at risk — enterprise scale
  const baseRev   = ENTERPRISE_REV[status];
  const variation = (nameHash(leadName + companyName) % 40) / 100;
  const revenueAtRisk = Math.round(baseRev * (1 + variation));

  // Pipeline leakage: driven by days elapsed + signals
  const signalLeakage = signals.reduce((acc, s) => acc + Math.abs(SIGNAL_DEFS[s].scoreDelta) * 1.5, 0);
  const ageLeakage    = days < 7 ? 0 : days < 30 ? 8 : days < 90 ? 18 : days < 180 ? 28 : 40;
  const pipelineLeakagePct = Math.min(95, Math.round(signalLeakage + ageLeakage + (100 - score) * 0.3));

  // Recovery probability & recoverable pipeline
  const recoveryProbability   = score;
  const recoverablePipeline   = Math.round(revenueAtRisk * (score / 100) * 0.80);

  // Recovery forecast
  const currentDealValue  = Math.round(revenueAtRisk * (1 - pipelineLeakagePct / 100));
  const recoveryBoost     = Math.min(0.30, score / 100 * 0.35);
  const optimizedDealValue = Math.round(revenueAtRisk * (1 - pipelineLeakagePct / 100 + recoveryBoost));
  const revenueUplift      = Math.max(0, optimizedDealValue - currentDealValue);

  // Text content
  const rc   = strongest ? ENT_ROOT_CAUSE[lang][strongest]        : ENT_ROOT_CAUSE_STATUS[lang][status];
  const pf   = strongest ? ENT_PROCESS_FAIL[lang][strongest]      : ENT_PROCESS_FAIL_STATUS[lang][status];
  const tf   = strongest ? ENT_TEAM_FAIL[lang][strongest]         : ENT_TEAM_FAIL_STATUS[lang][status];
  const recs = strongest ? ENT_RECS[lang][strongest]              : ENT_RECS_STATUS[lang][status];

  // Recovery campaign touchpoints
  const tp1Obj = strongest
    ? (lang === "es"
        ? `Re-engagement específico — señal primaria: ${SIGNAL_DEFS[strongest].label}`
        : `Targeted re-engagement — primary signal: ${SIGNAL_DEFS[strongest].label}`)
    : (lang === "es" ? "Reinicio de conversación ejecutiva" : "Executive conversation restart");

  const touchpoints = [
    {
      day: 1,
      channel: lang === "es" ? "Email directo + llamada de seguimiento" : "Direct email + follow-up call",
      objective: tp1Obj,
      action: lang === "es"
        ? "Enviar mensaje personalizado de re-activación de nivel ejecutivo. Sin argumento de venta — solo reconocimiento, valor y próximo paso específico."
        : "Send a personalised executive-level re-activation message. No pitch — just acknowledgement, value, and a specific next step.",
    },
    {
      day: 3,
      channel: lang === "es" ? "LinkedIn + material de apoyo" : "LinkedIn + supporting material",
      objective: lang === "es" ? "Entrega de activo de valor — caso de estudio o insight de sector" : "Value asset delivery — case study or sector insight",
      action: lang === "es"
        ? "Compartir un caso de éxito relevante o un insight de sector que conecte directamente con el problema original de la cuenta. No mencionar la propuesta."
        : "Share a relevant success case or sector insight that directly connects to the account's original problem. Do not reference the proposal.",
    },
    {
      day: 7,
      channel: lang === "es" ? "Llamada ejecutiva o video" : "Executive call or video",
      objective: lang === "es" ? "Calificación de estado actual y re-evaluación de criterios" : "Current state qualification and criteria re-evaluation",
      action: lang === "es"
        ? "Llamada de 15 minutos para entender si el problema sigue siendo prioritario, si el proceso de decisión cambió, y si hay una ventana para avanzar."
        : "15-minute call to understand whether the problem remains a priority, whether the decision process has changed, and whether there is a window to advance.",
    },
    {
      day: 14,
      channel: lang === "es" ? "Propuesta actualizada o business case" : "Updated proposal or business case",
      objective: lang === "es" ? "Presentación de valor ajustada con nuevos datos" : "Adjusted value presentation with new data",
      action: lang === "es"
        ? "Si la cuenta re-calificó, presentar propuesta actualizada con business case personalizado e incluir análisis de costo de inacción. Establecer fecha de decisión."
        : "If the account re-qualified, present an updated proposal with a personalised business case including a cost-of-inaction analysis. Establish a decision date.",
    },
    {
      day: 30,
      channel: lang === "es" ? "Revisión ejecutiva de pipeline" : "Executive pipeline review",
      objective: lang === "es" ? "Decisión o protocolo de nurturing de largo plazo" : "Decision or long-term nurturing protocol",
      action: lang === "es"
        ? "Si no cerró: mover el deal a nurturing estructurado con contactos de valor cada 3 semanas. Si cerró: documentar el proceso de recuperación como playbook para el equipo."
        : "If not closed: move the deal to structured nurturing with value touchpoints every 3 weeks. If closed: document the recovery process as a team playbook.",
    },
  ];

  return {
    revenueAtRisk,
    recoverablePipeline,
    recoveryProbability,
    pipelineLeakagePct,
    rootCause:        rc,
    processFailure:   pf,
    teamFailurePoint: tf,
    currentDealValue,
    optimizedDealValue,
    revenueUplift,
    recommendations: recs.map((r, i) => ({ priority: i + 1, ...r })),
    touchpoints,
  };
}

// ── Enterprise UI components ───────────────────────────────────────────────────
function ExecKPI({
  label, value, sub, accent = "default",
}: {
  label:  string;
  value:  string;
  sub?:   string;
  accent?: "red" | "green" | "amber" | "primary" | "default";
}) {
  const colorMap = {
    red:     "text-red-400",
    green:   "text-green-400",
    amber:   "text-amber-400",
    primary: "text-primary",
    default: "text-foreground",
  };
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[accent]}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ExecBlock({
  icon, label, content,
}: {
  icon:    React.ReactNode;
  label:   string;
  content: string;
}) {
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
        {icon}
        {label}
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed">{content}</p>
    </div>
  );
}

function ExecRec({ priority, title, text }: { priority: number; title: string; text: string }) {
  const color = priority === 1 ? "text-red-400 border-red-500/30 bg-red-500/10"
              : priority === 2 ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
              :                   "text-primary border-primary/30 bg-primary/10";
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded-full border text-[10px] font-black ${color}`}>
          {priority}
        </span>
        <div className="space-y-1 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}

function CampaignTimeline({ touchpoints, lang }: {
  touchpoints: { day: number; channel: string; objective: string; action: string }[];
  lang: "es"|"en";
}) {
  return (
    <div className="space-y-2">
      {touchpoints.map((tp, i) => (
        <div key={tp.day} className="flex gap-3">
          {/* Day pill + connector */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-10 h-10 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center flex-col">
              <span className="text-[8px] font-bold text-primary/70 uppercase leading-none">{lang === "es" ? "DÍA" : "DAY"}</span>
              <span className="text-sm font-black text-primary leading-none">{tp.day}</span>
            </div>
            {i < touchpoints.length - 1 && (
              <div className="w-px flex-1 my-1 bg-border" style={{ minHeight: 16 }} />
            )}
          </div>
          {/* Content */}
          <div className="glass border border-border rounded-xl p-3 mb-2 flex-1 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80">{tp.channel}</span>
            </div>
            <p className="text-xs font-semibold text-foreground">{tp.objective}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{tp.action}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "interested",        label: "Interested" },
  { value: "no_response",       label: "No Response" },
  { value: "follow_up_needed",  label: "Follow Up Needed" },
  { value: "budget_concern",    label: "Budget Concern" },
  { value: "comparing",         label: "Comparing Options" },
  { value: "cold",              label: "Cold Lead" },
];

// ── Page ───────────────────────────────────────────────────────────────────────
export default function LeadRecoveryPage() {
  const { language, businessStage } = useVyronSettings();
  const t = (es: string, en: string) => language === "Español" ? es : en;

  const [leadName,    setLeadName]    = useState("");
  const [companyName, setCompanyName] = useState("");
  const [lastContact, setLastContact] = useState("");
  const [status,      setStatus]      = useState<LeadStatus>("no_response");
  const [notes,       setNotes]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState<AnalysisResult | null>(null);
  const [detectedSig, setDetectedSig] = useState<SignalType[]>([]);
  const [analyses,    setAnalyses]    = useState<AnalysisResult[]>([]);
  const { toast } = useToast();

  const canAnalyze = leadName.trim().length > 0 && lastContact !== "";

  // ── Dashboard aggregates ────────────────────────────────────────────────────
  const dashboard = useMemo(() => ({
    analyzed:     analyses.length,
    recoverable:  analyses.filter(a => a.recoverable).length,
    revPotential: analyses.reduce((s, a) => s + a.revenueOpportunity, 0),
    reactivated:  analyses.filter(a => a.probability === "High").length,
  }), [analyses]);

  // ── Analyze ─────────────────────────────────────────────────────────────────
  const handleAnalyze = () => {
    if (!canAnalyze) return;
    setLoading(true);
    setTimeout(() => {
      const signals  = detectSignals(notes);
      const score    = computeScore(status, lastContact, notes, signals);
      const prob     = scoreToProbability(score);
      const objection = resolveObjection(signals, status);
      const revenue  = computeRevenue(status, leadName.trim(), companyName.trim());
      const newResult: AnalysisResult = {
        id:                 Date.now().toString(),
        leadName:           leadName.trim(),
        companyName:        companyName.trim(),
        score,
        probability:        prob,
        objection,
        revenueOpportunity: revenue,
        recoverable:        prob !== "Low",
        signals,
      };
      setResult(newResult);
      setDetectedSig(signals);
      setAnalyses(prev => {
        const exists = prev.find(a => a.leadName === newResult.leadName && a.companyName === newResult.companyName);
        if (exists) return prev.map(a => (a.id === exists.id ? newResult : a));
        return [...prev, newResult];
      });
      setLoading(false);
    }, 900);
  };

  const isEnterprise = resolveIsEnterprise(businessStage || "");
  const entLang: "es"|"en" = language === "Español" ? "es" : "en";

  const enterpriseResult: EnterpriseResult | null = (result && isEnterprise)
    ? buildEnterpriseAnalysis(
        result.score, status, result.signals,
        result.leadName, result.companyName,
        daysBetween(lastContact), entLang,
      )
    : null;

  const strongest       = result ? getStrongest(result.signals) : null;
  const recoveryMessage = result
    ? (language === "Español"
        ? buildRecoveryMessageES(result.leadName, result.companyName, status, result.signals, lastContact)
        : buildRecoveryMessage(result.leadName, result.companyName, status, result.signals, lastContact))
    : "";
  const activeSignalWhyLost = language === "Español" ? SIGNAL_WHY_LOST_ES : SIGNAL_WHY_LOST;
  const activeSignalAction  = language === "Español" ? SIGNAL_ACTION_ES   : SIGNAL_ACTION;
  const activeSignalTiming  = language === "Español" ? SIGNAL_TIMING_ES   : SIGNAL_TIMING;
  const activeStatusWhyLost = language === "Español" ? STATUS_WHY_LOST_ES : STATUS_WHY_LOST;
  const activeStatusAction  = language === "Español" ? STATUS_ACTION_ES   : STATUS_ACTION;
  const activeStatusTiming  = language === "Español" ? STATUS_TIMING_ES   : STATUS_TIMING;
  const whyLost = result
    ? (strongest ? activeSignalWhyLost[strongest] : activeStatusWhyLost[status])
    : "";
  const action = result
    ? (strongest ? activeSignalAction[strongest] : activeStatusAction[status])
    : "";
  const timing = result
    ? (strongest ? activeSignalTiming[strongest] : activeStatusTiming[status])
    : "";

  return (
    <AppLayout title="Lead Recovery">
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <RefreshCw size={22} className="text-primary" />
            Lead Recovery AI
          </h2>
          <p className="text-muted-foreground text-sm">
            {t(
              "Convierte leads inactivos en oportunidades de ingresos con estrategias de recuperación basadas en datos.",
              "Turn inactive leads into revenue opportunities with data-driven recovery strategies.",
            )}
          </p>
        </div>

        <BusinessSettings />

        {/* Executive Dashboard */}
        {analyses.length > 0 && (
          <>
            <SectionHeader icon={<BarChart3 size={14} />} label="Executive Dashboard" />
            <div className="grid grid-cols-2 gap-3">
              <MetricCard icon={<Users size={12} />}      label="Leads Analyzed"    value={String(dashboard.analyzed)}    sub="this session" />
              <MetricCard icon={<Target size={12} />}     label="Recoverable Leads" value={String(dashboard.recoverable)} sub="Medium or High probability" />
              <MetricCard icon={<DollarSign size={12} />} label="Revenue Potential" value={fmtCurrency(dashboard.revPotential)} sub="total opportunity" />
              <MetricCard icon={<TrendingUp size={12} />} label="High-Value Leads"  value={String(dashboard.reactivated)} sub="scored High probability" />
            </div>
          </>
        )}

        {/* Input form */}
        <div className="glass border border-border rounded-xl p-4 md:p-6 space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lead-name">Lead Name</Label>
              <Input id="lead-name" placeholder="e.g. Sarah Johnson" value={leadName}
                onChange={e => { setLeadName(e.target.value); setResult(null); }}
                className="bg-background/50 border-border focus-visible:ring-primary/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input id="company-name" placeholder="e.g. Apex Solutions" value={companyName}
                onChange={e => { setCompanyName(e.target.value); setResult(null); }}
                className="bg-background/50 border-border focus-visible:ring-primary/50" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="last-contact">Last Contact Date</Label>
              <Input id="last-contact" type="date" value={lastContact}
                max={new Date().toISOString().split("T")[0]}
                onChange={e => { setLastContact(e.target.value); setResult(null); }}
                className="bg-background/50 border-border focus-visible:ring-primary/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-status">Lead Status</Label>
              <select id="lead-status" value={status}
                onChange={e => { setStatus(e.target.value as LeadStatus); setResult(null); }}
                className="w-full h-10 rounded-md border border-border bg-background/50 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">
              Conversation Notes
              <span className="ml-2 text-[10px] text-muted-foreground font-normal normal-case">
                — the more detail you add, the more accurate the signal detection
              </span>
            </Label>
            <textarea id="notes" rows={4}
              placeholder="Summarise the previous conversation, objections raised, what was discussed, and where things were left… e.g. 'She said the price was too expensive and wanted to think about it. Mentioned she was also looking at another provider.'"
              value={notes}
              onChange={e => { setNotes(e.target.value); setResult(null); }}
              className="w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
          </div>

          <Button onClick={handleAnalyze} disabled={!canAnalyze || loading} className="w-full electric-glow font-semibold">
            {loading
              ? <><Loader2 size={16} className="animate-spin mr-2" />Analyzing Lead…</>
              : <><RefreshCw size={16} className="mr-2" />Analyze Lead</>}
          </Button>
        </div>

        {/* ── Results ────────────────────────────────────────────────── */}
        {/* ── ENTERPRISE RESULTS ──────────────────────────────────────── */}
        {result && isEnterprise && enterpriseResult && (
          <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">

            {/* Enterprise badge */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <Building2 size={13} className="text-primary shrink-0" />
              <div>
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Enterprise Pipeline Analysis</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {result.leadName}{result.companyName ? ` · ${result.companyName}` : ""} · {STATUS_OPTIONS.find(o => o.value === status)?.label}
                  {strongest && <> · <span className={SIGNAL_DEFS[strongest].color}>{SIGNAL_DEFS[strongest].label}</span></>}
                </span>
              </div>
            </div>

            {/* ── Executive Recovery Dashboard ──────────────────────── */}
            <SectionHeader icon={<BarChart3 size={14} />} label={entLang === "es" ? "Executive Recovery Dashboard" : "Executive Recovery Dashboard"} />
            <div className="grid grid-cols-2 gap-3">
              <ExecKPI
                label={entLang === "es" ? "Revenue at Risk" : "Revenue at Risk"}
                value={fmtCurrency(enterpriseResult.revenueAtRisk)}
                sub={entLang === "es" ? "exposición total del deal" : "total deal exposure"}
                accent="red"
              />
              <ExecKPI
                label={entLang === "es" ? "Recoverable Pipeline" : "Recoverable Pipeline"}
                value={fmtCurrency(enterpriseResult.recoverablePipeline)}
                sub={entLang === "es" ? "valor recuperable estimado" : "estimated via strategy"}
                accent="green"
              />
              <ExecKPI
                label={entLang === "es" ? "Recovery Probability" : "Recovery Probability"}
                value={`${enterpriseResult.recoveryProbability}%`}
                sub={entLang === "es" ? "índice de confianza" : "confidence index"}
                accent="primary"
              />
              <ExecKPI
                label={entLang === "es" ? "Pipeline Leakage" : "Pipeline Leakage"}
                value={`${enterpriseResult.pipelineLeakagePct}%`}
                sub={entLang === "es" ? "del valor del deal en riesgo" : "of deal value at risk"}
                accent="amber"
              />
            </div>

            {/* ── Lead Loss Analysis ────────────────────────────────── */}
            <SectionHeader icon={<AlertCircle size={14} />} label={entLang === "es" ? "Lead Loss Analysis" : "Lead Loss Analysis"} />
            <ExecBlock
              icon={<Target size={13} />}
              label={entLang === "es" ? "Root Cause" : "Root Cause"}
              content={enterpriseResult.rootCause}
            />
            <ExecBlock
              icon={<Layers size={13} />}
              label={entLang === "es" ? "Process Failure" : "Process Failure"}
              content={enterpriseResult.processFailure}
            />
            <ExecBlock
              icon={<Users size={13} />}
              label={entLang === "es" ? "Team Failure Point" : "Team Failure Point"}
              content={enterpriseResult.teamFailurePoint}
            />

            {/* ── Recovery Forecast ─────────────────────────────────── */}
            <SectionHeader icon={<TrendingUp size={14} />} label={entLang === "es" ? "Recovery Forecast" : "Recovery Forecast"} />
            <div className="glass border border-border rounded-xl p-4">
              <div className="flex items-stretch gap-2">
                {/* Current */}
                <div className="flex-1 rounded-lg bg-white/5 p-3 space-y-1 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {entLang === "es" ? "Current Revenue" : "Current Revenue"}
                  </p>
                  <p className="text-lg font-bold text-foreground">{fmtCurrency(enterpriseResult.currentDealValue)}</p>
                  <p className="text-[10px] text-muted-foreground">{entLang === "es" ? "valor actual del deal" : "current deal value"}</p>
                </div>
                <div className="flex items-center shrink-0">
                  <ArrowRight size={16} className="text-muted-foreground" />
                </div>
                {/* Optimized */}
                <div className="flex-1 rounded-lg bg-primary/10 border border-primary/20 p-3 space-y-1 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
                    {entLang === "es" ? "Optimized Revenue" : "Optimized Revenue"}
                  </p>
                  <p className="text-lg font-bold text-primary">{fmtCurrency(enterpriseResult.optimizedDealValue)}</p>
                  <p className="text-[10px] text-primary/60">{entLang === "es" ? "post-recuperación" : "post-recovery"}</p>
                </div>
                <div className="flex items-center shrink-0">
                  <ArrowRight size={16} className="text-muted-foreground" />
                </div>
                {/* Uplift */}
                <div className="flex-1 rounded-lg bg-green-500/10 border border-green-500/20 p-3 space-y-1 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-green-400/70">
                    {entLang === "es" ? "Revenue Uplift" : "Revenue Uplift"}
                  </p>
                  <p className="text-lg font-bold text-green-400">+{fmtCurrency(enterpriseResult.revenueUplift)}</p>
                  <p className="text-[10px] text-green-400/60">{entLang === "es" ? "potencial adicional" : "potential uplift"}</p>
                </div>
              </div>
            </div>

            {/* ── Executive Recommendations ─────────────────────────── */}
            <SectionHeader icon={<Award size={14} />} label={entLang === "es" ? "Executive Recommendations" : "Executive Recommendations"} />
            {enterpriseResult.recommendations.map(r => (
              <ExecRec key={r.priority} priority={r.priority} title={r.title} text={r.text} />
            ))}

            {/* ── Recovery Campaign Plan ────────────────────────────── */}
            <SectionHeader icon={<Flag size={14} />} label={entLang === "es" ? "Recovery Campaign Plan" : "Recovery Campaign Plan"} />
            <CampaignTimeline touchpoints={enterpriseResult.touchpoints} lang={entLang} />

            {/* Re-analyze */}
            <Button variant="outline" className="w-full border-border text-muted-foreground hover:text-foreground"
              onClick={handleAnalyze} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : <Zap size={14} className="mr-2" />}
              {entLang === "es" ? "Re-Analizar Deal" : "Re-Analyze Deal"}
            </Button>
          </div>
        )}

        {/* ── STANDARD RESULTS (all non-enterprise stages) ─────────────── */}
        {result && !isEnterprise && (
          <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">

            {/* ── Detected Lead Signals ──────────────────────────────── */}
            <SectionHeader icon={<Brain size={14} />} label="Detected Lead Signals" />
            <div className="glass border border-border rounded-xl p-4 space-y-3">
              {detectedSig.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle size={14} className="text-primary shrink-0" />
                  No strong objection detected — use a soft re-engagement approach.
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {detectedSig.length} signal{detectedSig.length !== 1 ? "s" : ""} detected from conversation notes.
                    {detectedSig.length > 1 && " The strongest signal drives the recovery strategy."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {detectedSig.map((sig, i) => {
                      const def = SIGNAL_DEFS[sig];
                      return (
                        <div key={sig}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${def.color} ${def.border} ${def.bg} ${i === 0 ? "ring-1 ring-current ring-offset-1 ring-offset-background" : ""}`}>
                          {def.icon}
                          {def.label}
                          {i === 0 && <span className="text-[9px] opacity-70 font-bold ml-0.5">PRIMARY</span>}
                        </div>
                      );
                    })}
                  </div>
                  {detectedSig.length > 1 && (
                    <div className="space-y-2 pt-1 border-t border-border/50">
                      {detectedSig.map(sig => (
                        <div key={sig} className="flex items-start gap-2">
                          <span className={`mt-0.5 shrink-0 ${SIGNAL_DEFS[sig].color}`}>{SIGNAL_DEFS[sig].icon}</span>
                          <div>
                            <span className={`text-xs font-semibold ${SIGNAL_DEFS[sig].color}`}>{SIGNAL_DEFS[sig].label}: </span>
                            <span className="text-xs text-muted-foreground">{SIGNAL_DEFS[sig].description}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── AI Analysis Results ────────────────────────────────── */}
            <SectionHeader icon={<Target size={14} />} label="AI Analysis Results" />
            <div className="glass border border-border rounded-xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <ScoreRing score={result.score} />
                  <p className="text-xs text-muted-foreground font-medium">Opportunity Score</p>
                </div>
                <div className="flex-1 min-w-0 space-y-3 w-full">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Recovery Probability</p>
                    <div className="flex gap-2">
                      {(["Low", "Medium", "High"] as Probability[]).map(p => (
                        <span key={p} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border transition-all ${result.probability === p ? PROB_STYLE[p] : "border-border bg-background/20 text-muted-foreground/40"}`}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Main Objection Detected</p>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                      strongest ? `${SIGNAL_DEFS[strongest].border} ${SIGNAL_DEFS[strongest].bg} ${SIGNAL_DEFS[strongest].color}` : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    }`}>
                      <AlertCircle size={11} />
                      {result.objection}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Estimated Revenue Opportunity</p>
                    <p className="text-xl font-bold text-primary">{fmtCurrency(result.revenueOpportunity)}</p>
                    <p className="text-xs text-muted-foreground">based on lead status and engagement signals</p>
                  </div>
                </div>
              </div>
              {lastContact && (
                <div className="flex items-center gap-2 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                  <Clock size={12} className="text-primary shrink-0" />
                  Last contact: <span className="text-foreground font-semibold">
                    {daysBetween(lastContact) === 0 ? "today" : `${daysBetween(lastContact)} day${daysBetween(lastContact) !== 1 ? "s" : ""} ago`}
                  </span>
                  {daysBetween(lastContact) > 30 && <span className="text-amber-400 font-medium">— re-engagement urgency is high</span>}
                </div>
              )}
            </div>

            {/* ── Recovery Strategy ──────────────────────────────────── */}
            <SectionHeader icon={<ChevronRight size={14} />} label="Recovery Strategy" />
            {strongest && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${SIGNAL_DEFS[strongest].color} ${SIGNAL_DEFS[strongest].border} ${SIGNAL_DEFS[strongest].bg}`}>
                {SIGNAL_DEFS[strongest].icon}
                Strategy adapted for primary signal: <span className="font-bold">{SIGNAL_DEFS[strongest].label}</span>
              </div>
            )}
            <InsightCard icon={<AlertCircle size={14} />}   label="Why This Lead Was Lost"    content={whyLost} />
            <InsightCard icon={<ChevronRight size={14} />}  label="What Action to Take"       content={action} />
            <InsightCard icon={<Clock size={14} />}         label="Best Timing for Follow-Up" content={timing} copyable={false} />

            {/* ── Recommended Message ────────────────────────────────── */}
            <SectionHeader icon={<MessageSquare size={14} />} label="Recommended Message" />
            <div className="glass border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Personalised Recovery Message</p>
                  <p className="text-xs text-muted-foreground">
                    {result.leadName}{result.companyName ? ` · ${result.companyName}` : ""} ·{" "}
                    {strongest ? SIGNAL_DEFS[strongest].label : STATUS_OPTIONS.find(o => o.value === status)?.label}
                  </p>
                </div>
                <CopyButton text={recoveryMessage} />
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <pre className="text-sm text-foreground/90 leading-relaxed font-sans whitespace-pre-wrap">{recoveryMessage}</pre>
              </div>
            </div>

            {/* Re-analyze */}
            <Button variant="outline" className="w-full border-border text-muted-foreground hover:text-foreground"
              onClick={handleAnalyze} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : <Zap size={14} className="mr-2" />}
              Re-Analyze This Lead
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
