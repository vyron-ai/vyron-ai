import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useVyronSettings } from "@/contexts/settings-context";
import { BusinessSettings } from "@/components/business-settings";
import {
  Loader2, Zap, BarChart3, Copy, Check, Brain,
  Users, TrendingUp, Calendar, MessageSquare, Sparkles,
  Clock, ChevronRight, Building2, Layers, Award, Flag,
  Target, ArrowRight, Globe, BookOpen, Crosshair,
} from "lucide-react";

type Goal = "sales" | "leads" | "brand_awareness" | "authority" | "engagement";
type HookType = "curiosity" | "pain" | "story" | "authority" | "mistake" | "opportunity" | "viral";
type Posting = "daily" | "5x_week" | "3x_week" | "2x_week";

interface MixItem   { type: HookType; pct: number }
interface WeekDay   { day: string; hookType: HookType; contentType: string; note: string }
interface Reasoning { whyMixWorks: string; audiencePsychology: string; contentDominant: string }
interface PostingRec { recommended: Posting; reason: string }
interface CTAs       { nicheSpecific: string; leadGen: string; sales: string }

interface StrategyResult {
  contentMix:     MixItem[];
  weeklySchedule: WeekDay[];
  reasoning:      Reasoning;
  posting:        PostingRec;
  ctas:           CTAs;
}

// ── Hook type colours ──────────────────────────────────────────────────────────
const HOOK_COLORS: Record<HookType, string> = {
  curiosity:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  pain:        "bg-red-500/15 text-red-400 border-red-500/30",
  story:       "bg-purple-500/15 text-purple-400 border-purple-500/30",
  authority:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  mistake:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  opportunity: "bg-green-500/15 text-green-400 border-green-500/30",
  viral:       "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

const HOOK_LABEL: Record<HookType, string> = {
  curiosity:   "🔍 Curiosity",
  pain:        "⚡ Pain",
  story:       "📖 Story",
  authority:   "🏆 Authority",
  mistake:     "❌ Mistake",
  opportunity: "🚀 Opportunity",
  viral:       "🔥 Viral Trend",
};

// Bar fill colour per hook type
const MIX_BAR_COLOR: Record<HookType, string> = {
  curiosity:   "bg-blue-500",
  pain:        "bg-red-500",
  story:       "bg-purple-500",
  authority:   "bg-amber-500",
  mistake:     "bg-orange-500",
  opportunity: "bg-green-500",
  viral:       "bg-pink-500",
};

const POSTING_OPTIONS: { value: Posting; label: string; sublabel: string }[] = [
  { value: "daily",   label: "Daily",    sublabel: "7×/week" },
  { value: "5x_week", label: "5×/week",  sublabel: "Weekdays" },
  { value: "3x_week", label: "3×/week",  sublabel: "M · W · F" },
  { value: "2x_week", label: "2×/week",  sublabel: "Min viable" },
];

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ description: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ description: "Failed to copy", variant: "destructive" });
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
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

// ── Insight card ───────────────────────────────────────────────────────────────
function InsightCard({ icon, label, content }: { icon: React.ReactNode; label: string; content: string }) {
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          {icon} {label}
        </div>
        <CopyButton text={content} />
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed">{content}</p>
    </div>
  );
}

// ── CTA card ───────────────────────────────────────────────────────────────────
function CTACard({ label, sublabel, content }: { label: string; sublabel: string; content: string }) {
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        </div>
        <CopyButton text={content} />
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed border-l-2 border-primary/30 pl-3 italic">
        "{content}"
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE STRATEGY ENGINE
// ══════════════════════════════════════════════════════════════════════════════

function resolveIsEnterprise(businessStage: string): boolean {
  const s = (businessStage || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /grande|large|corp|enterprise/.test(s);
}

// ── Enterprise types ──────────────────────────────────────────────────────────
interface ChannelRole {
  channel:      string;
  role:         string;
  contentTypes: string[];
  frequency:    string;
  kpi:          string;
}
interface FunnelStageData {
  stage:             "TOFU" | "MOFU" | "BOFU";
  label:             string;
  objective:         string;
  contentTypes:      string[];
  keyTactic:         string;
  conversionMetric:  string;
  pct:               number;
}
interface AuthorityAsset {
  type:        string;
  description: string;
  timeline:    string;
  impact:      "Critical" | "High" | "Medium";
}
interface DominancePlan {
  marketGap:            string;
  differentiationAngle: string;
  phases:               { phase: string; duration: string; focus: string; actions: string[] }[];
  kpisToOwn:            string[];
}
interface EnterpriseStrategy {
  positioningStatement:    string;
  differentiationPillars:  { title: string; description: string }[];
  brandVoice:              string;
  uvp:                     string;
  channels:                ChannelRole[];
  funnel:                  FunnelStageData[];
  authorityAssets:         AuthorityAsset[];
  dominancePlan:           DominancePlan;
}

// ── Channel ecosystems per goal ───────────────────────────────────────────────
const CHANNELS: Record<Goal, Record<"es"|"en", ChannelRole[]>> = {
  sales: {
    es: [
      { channel:"LinkedIn", role:"Canal de conversión primario", contentTypes:["Casos de éxito con resultados específicos","Video testimoniales de clientes","Demostraciones de producto en carrusel"], frequency:"Diario", kpi:"Reuniones agendadas / solicitudes de demo" },
      { channel:"Email Marketing", role:"Nurturing y cierre de pipeline", contentTypes:["Secuencias de seguimiento post-demo","Ofertas exclusivas con urgencia real","Historias de transformación de clientes"], frequency:"3× por semana", kpi:"CTR a propuesta + tasa de apertura" },
      { channel:"YouTube", role:"Educación de producto y manejo de objeciones", contentTypes:["Tutoriales de producto paso a paso","Comparativas de alternativas","Q&A de ventas con objeciones reales"], frequency:"Semanal", kpi:"Visualizaciones de páginas de producto + retención" },
      { channel:"Blog / SEO", role:"Captura de demanda de búsqueda comercial", contentTypes:["Artículos de comparación directa","Guías de decisión de compra","Landing pages de casos de uso"], frequency:"2× por semana", kpi:"Tráfico orgánico comercial + conversión de landing" },
      { channel:"Webinar / Live", role:"Demostración en vivo y cierre grupal", contentTypes:["Demo en vivo con Q&A","Presentación de casos de estudio","Sesión de preguntas de compra"], frequency:"Quincenal", kpi:"Asistentes → tasa de conversión en sala" },
    ],
    en: [
      { channel:"LinkedIn", role:"Primary conversion channel", contentTypes:["Success stories with hard numbers","Video client testimonials","Product demos in carousel format"], frequency:"Daily", kpi:"Meetings booked / demo requests" },
      { channel:"Email Marketing", role:"Pipeline nurturing and closing", contentTypes:["Post-demo follow-up sequences","Exclusive time-bound offers","Client transformation stories"], frequency:"3× per week", kpi:"CTR to proposal + open rate" },
      { channel:"YouTube", role:"Product education and objection handling", contentTypes:["Step-by-step product tutorials","Competitor comparisons","Sales Q&A with real objections"], frequency:"Weekly", kpi:"Product page view-through rate + retention" },
      { channel:"Blog / SEO", role:"Commercial search demand capture", contentTypes:["Head-to-head comparison articles","Buying decision guides","Use-case landing pages"], frequency:"2× per week", kpi:"Commercial organic traffic + landing conversion" },
      { channel:"Webinar / Live", role:"Live demo and group closing", contentTypes:["Live demo with Q&A","Case study presentation","Buying Q&A session"], frequency:"Bi-weekly", kpi:"Attendees → in-session conversion rate" },
    ],
  },
  leads: {
    es: [
      { channel:"Blog / SEO", role:"Motor de captura de leads orgánicos", contentTypes:["Guías prácticas con descargable","Artículos de problema/solución","Posts de lista con lead magnet integrado"], frequency:"3× por semana", kpi:"Tráfico orgánico + tasa de opt-in" },
      { channel:"LinkedIn", role:"Generación de leads B2B y nurturing", contentTypes:["Posts educativos con CTA a recurso gratuito","Encuestas de dolor con seguimiento","Artículos de liderazgo con formulario"], frequency:"Diario", kpi:"Conexiones calificadas + tasa de respuesta a DM" },
      { channel:"YouTube", role:"Educación de alta intención y captura SEO", contentTypes:["Tutoriales de solución de problema","Webinars grabados con opt-in","Reviews y comparativas educativas"], frequency:"Semanal", kpi:"Suscriptores + leads por video" },
      { channel:"Email Marketing", role:"Nurturing de leads hasta calificación", contentTypes:["Secuencia de bienvenida + educación","Newsletter de valor semanal","Contenido de segmentación por interés"], frequency:"2× por semana", kpi:"Tasa de apertura + leads MQL generados" },
      { channel:"Podcast", role:"Construcción de audiencia comprometida", contentTypes:["Entrevistas con expertos del nicho","Episodios tácticos con recursos","Q&A con la audiencia"], frequency:"Semanal", kpi:"Oyentes recurrentes + leads por episodio" },
    ],
    en: [
      { channel:"Blog / SEO", role:"Organic lead capture engine", contentTypes:["Practical guides with downloadable","Problem/solution articles","List posts with integrated lead magnet"], frequency:"3× per week", kpi:"Organic traffic + opt-in rate" },
      { channel:"LinkedIn", role:"B2B lead generation and nurturing", contentTypes:["Educational posts with free resource CTA","Pain polls with follow-up","Thought leadership articles with form"], frequency:"Daily", kpi:"Qualified connections + DM reply rate" },
      { channel:"YouTube", role:"High-intent education and SEO capture", contentTypes:["Problem-solving tutorials","Recorded webinars with opt-in","Educational reviews and comparisons"], frequency:"Weekly", kpi:"Subscribers + leads per video" },
      { channel:"Email Marketing", role:"Lead nurturing to qualification", contentTypes:["Welcome + education sequence","Weekly value newsletter","Interest-based segmentation content"], frequency:"2× per week", kpi:"Open rate + MQL leads generated" },
      { channel:"Podcast", role:"Engaged audience building", contentTypes:["Niche expert interviews","Tactical episodes with resources","Audience Q&A"], frequency:"Weekly", kpi:"Recurring listeners + leads per episode" },
    ],
  },
  authority: {
    es: [
      { channel:"LinkedIn", role:"Plataforma de posicionamiento de pensamiento líder", contentTypes:["Marcos originales y metodologías propias","Opiniones contraintuitivas con argumentación profunda","Análisis de tendencias con perspectiva única"], frequency:"Diario", kpi:"Impresiones de perfil + guardados + citas" },
      { channel:"Podcast", role:"Formato largo para establecer expertise profundo", contentTypes:["Entrevistas con líderes del sector","Episodios de análisis de primera persona","Debates y perspectivas contrarias"], frequency:"Semanal", kpi:"Posición en charts + reproducciones + invitaciones a hablar" },
      { channel:"Blog / SEO", role:"Biblioteca de autoridad permanente", contentTypes:["Guías definitivas de referencia del sector","Estudios originales con datos propios","Análisis de caso en profundidad"], frequency:"Semanal", kpi:"Backlinks orgánicos + tiempo en página + citas de prensa" },
      { channel:"YouTube", role:"Educación de alta profundidad y credibilidad visual", contentTypes:["Masterclasses grabadas","Análisis de casos reales","Videos de metodología propia"], frequency:"Quincenal", kpi:"Retención de audiencia + suscriptores de alta intención" },
      { channel:"Twitter / X", role:"Distribución de ideas y conversación de alto perfil", contentTypes:["Hilos de análisis profundo","Opiniones en tiempo real sobre noticias del sector","Citas y reflexiones de posicionamiento"], frequency:"Diario", kpi:"Impresiones + respuestas de referentes + menciones" },
    ],
    en: [
      { channel:"LinkedIn", role:"Thought leadership positioning platform", contentTypes:["Original frameworks and proprietary methodologies","Counter-intuitive opinions with deep argumentation","Trend analysis with unique perspective"], frequency:"Daily", kpi:"Profile impressions + saves + quote-shares" },
      { channel:"Podcast", role:"Long-format channel for deep expertise", contentTypes:["Industry leader interviews","First-person analysis episodes","Debates and counter-perspectives"], frequency:"Weekly", kpi:"Chart position + plays + speaking invitations" },
      { channel:"Blog / SEO", role:"Permanent authority library", contentTypes:["Definitive industry reference guides","Original studies with proprietary data","In-depth case analyses"], frequency:"Weekly", kpi:"Organic backlinks + time on page + press citations" },
      { channel:"YouTube", role:"High-depth education and visual credibility", contentTypes:["Recorded masterclasses","Real case analyses","Proprietary methodology videos"], frequency:"Bi-weekly", kpi:"Audience retention + high-intent subscribers" },
      { channel:"Twitter / X", role:"Idea distribution and high-profile conversation", contentTypes:["Deep-analysis threads","Real-time takes on industry news","Positioning quotes and reflections"], frequency:"Daily", kpi:"Impressions + peer replies + mentions" },
    ],
  },
  brand_awareness: {
    es: [
      { channel:"Instagram", role:"Canal de identidad de marca y alcance masivo", contentTypes:["Contenido de valores y cultura de marca","Campañas visuales de alto impacto","Colaboraciones con creadores afines"], frequency:"Diario", kpi:"Alcance + impresiones + tasa de guardado" },
      { channel:"TikTok", role:"Motor de viralidad y audiencia nueva", contentTypes:["Contenido nativo de tendencias adaptado a la marca","Series de formato corto con gancho de marca","Challenges y participación en trends"], frequency:"Diario", kpi:"Visualizaciones + tasa de seguimiento + shares" },
      { channel:"YouTube Shorts", role:"Distribución multiplataforma de contenido corto", contentTypes:["Clips de mayor alcance de formato largo","Contenido de marca condensado","Behind-the-scenes de 60 segundos"], frequency:"5× por semana", kpi:"Visualizaciones + tasa de conversión a suscriptor largo" },
      { channel:"Twitter / X", role:"Conversación pública y posicionamiento cultural", contentTypes:["Participación en conversaciones virales","Opiniones de marca con voz propia","Humor y personalidad de marca"], frequency:"Diario", kpi:"Impresiones + menciones + volumen de conversación" },
      { channel:"LinkedIn", role:"Credibilidad institucional y alcance B2B", contentTypes:["Historia y cultura organizacional","Logros y reconocimientos de marca","Perspectivas del sector con voz de empresa"], frequency:"3× por semana", kpi:"Alcance orgánico + impresiones de marca" },
    ],
    en: [
      { channel:"Instagram", role:"Brand identity and mass reach channel", contentTypes:["Brand values and culture content","High-impact visual campaigns","Creator collaborations"], frequency:"Daily", kpi:"Reach + impressions + save rate" },
      { channel:"TikTok", role:"Virality engine and new audience acquisition", contentTypes:["Native trend content adapted to brand","Short-format series with brand hook","Challenges and trend participation"], frequency:"Daily", kpi:"Views + follow-through rate + shares" },
      { channel:"YouTube Shorts", role:"Multi-platform short content distribution", contentTypes:["High-reach clips from long-format","Condensed brand content","60-second behind-the-scenes"], frequency:"5× per week", kpi:"Views + conversion rate to long-form subscriber" },
      { channel:"Twitter / X", role:"Public conversation and cultural positioning", contentTypes:["Viral conversation participation","Brand takes with own voice","Brand humour and personality"], frequency:"Daily", kpi:"Impressions + mentions + conversation volume" },
      { channel:"LinkedIn", role:"Institutional credibility and B2B reach", contentTypes:["Organisational history and culture","Brand achievements and recognition","Industry perspectives from company voice"], frequency:"3× per week", kpi:"Organic reach + brand impressions" },
    ],
  },
  engagement: {
    es: [
      { channel:"Instagram", role:"Centro de comunidad y conversación diaria", contentTypes:["Stories interactivas con encuestas y preguntas","Posts de conversación con preguntas abiertas","Reels de respuesta a comentarios de la comunidad"], frequency:"Diario", kpi:"Tasa de respuesta a Stories + comentarios por post" },
      { channel:"TikTok", role:"Generación de participación y co-creación", contentTypes:["Duets y respuestas a comentarios en video","Challenges con participación de audiencia","Series donde la audiencia elige el contenido"], frequency:"Diario", kpi:"Tasa de duet + comentarios creativos + shares" },
      { channel:"Twitter / X", role:"Conversación en tiempo real y comunidad verbal", contentTypes:["Espacios de audio con la audiencia","Hilos de debate participativo","Polls y encuestas de decisión comunitaria"], frequency:"Diario", kpi:"Respuestas + impresiones de conversación + RT" },
      { channel:"Discord / Comunidad", role:"Ecosistema de comunidad profunda", contentTypes:["Canales temáticos de discusión","Eventos exclusivos para miembros","AMAs y sesiones de acceso directo"], frequency:"Continuo", kpi:"DAU + tasa de retención de miembros + participación en eventos" },
      { channel:"YouTube", role:"Contenido de valor para miembros leales", contentTypes:["Videos de miembros y comunidad detrás de cámaras","Livestreams con participación activa","Series co-creadas con la audiencia"], frequency:"Semanal", kpi:"Horas de visualización + comentarios de alta calidad + membresías" },
    ],
    en: [
      { channel:"Instagram", role:"Community hub and daily conversation", contentTypes:["Interactive Stories with polls and questions","Conversation posts with open questions","Reels responding to community comments"], frequency:"Daily", kpi:"Story reply rate + comments per post" },
      { channel:"TikTok", role:"Participation generation and co-creation", contentTypes:["Duets and video comment replies","Challenges with audience participation","Series where audience chooses the content"], frequency:"Daily", kpi:"Duet rate + creative comments + shares" },
      { channel:"Twitter / X", role:"Real-time conversation and verbal community", contentTypes:["Audio spaces with the audience","Participative debate threads","Community decision polls"], frequency:"Daily", kpi:"Replies + conversation impressions + RTs" },
      { channel:"Discord / Community", role:"Deep community ecosystem", contentTypes:["Themed discussion channels","Exclusive member events","AMAs and direct-access sessions"], frequency:"Continuous", kpi:"DAU + member retention rate + event participation" },
      { channel:"YouTube", role:"Value content for loyal members", contentTypes:["Behind-the-scenes community member videos","Active-participation livestreams","Co-created audience series"], frequency:"Weekly", kpi:"Watch hours + high-quality comments + memberships" },
    ],
  },
};

// ── TOFU/MOFU/BOFU funnel per goal ────────────────────────────────────────────
const FUNNELS: Record<Goal, Record<"es"|"en", FunnelStageData[]>> = {
  sales: {
    es: [
      { stage:"TOFU", label:"Conciencia", objective:"Atraer prospectos con intención de compra latente", contentTypes:["Contenido de problema reconocido","Comparativas de soluciones","Casos del sector"], keyTactic:"SEO + paid para búsquedas de intención comercial", conversionMetric:"CTR a contenido de consideración", pct:30 },
      { stage:"MOFU", label:"Consideración", objective:"Posicionar la solución como la opción más relevante", contentTypes:["Demos de producto","Casos de éxito con ROI","Webinars de evaluación"], keyTactic:"Retargeting de visitantes + nurturing por email", conversionMetric:"Tasa de solicitud de demo / reunión", pct:40 },
      { stage:"BOFU", label:"Conversión", objective:"Cerrar la decisión de compra con la menor fricción posible", contentTypes:["Propuestas personalizadas","Testimoniales de cierre","Garantías y comparativas finales"], keyTactic:"Seguimiento 1:1 + oferta con urgencia real", conversionMetric:"Tasa de cierre + ticket promedio", pct:30 },
    ],
    en: [
      { stage:"TOFU", label:"Awareness", objective:"Attract prospects with latent purchase intent", contentTypes:["Pain-recognised content","Solution comparisons","Industry cases"], keyTactic:"SEO + paid for commercial intent searches", conversionMetric:"CTR to consideration content", pct:30 },
      { stage:"MOFU", label:"Consideration", objective:"Position the solution as the most relevant option", contentTypes:["Product demos","ROI-led success stories","Evaluation webinars"], keyTactic:"Visitor retargeting + email nurturing", conversionMetric:"Demo / meeting request rate", pct:40 },
      { stage:"BOFU", label:"Conversion", objective:"Close the purchase decision with minimum friction", contentTypes:["Personalised proposals","Closing testimonials","Guarantees and final comparisons"], keyTactic:"1:1 follow-up + offer with real urgency", conversionMetric:"Close rate + average ticket", pct:30 },
    ],
  },
  leads: {
    es: [
      { stage:"TOFU", label:"Descubrimiento", objective:"Llegar a la audiencia correcta con el problema correcto", contentTypes:["Artículos de problema + solución","Contenido de lista con gancho","Videos educativos de entrada"], keyTactic:"SEO orgánico + social orgánico con gancho de problema", conversionMetric:"Tráfico + tasa de clics a opt-in", pct:50 },
      { stage:"MOFU", label:"Captura", objective:"Convertir visitantes en leads calificados", contentTypes:["Lead magnets de alto valor","Webinars de solución","Quiz / diagnóstico interactivo"], keyTactic:"Páginas de aterrizaje optimizadas + A/B testing continuo", conversionMetric:"Tasa de opt-in + calidad de lead (MQL %)", pct:35 },
      { stage:"BOFU", label:"Calificación", objective:"Elevar el lead a oportunidad de venta o activación", contentTypes:["Email de nutrición de cierre","Oferta de prueba / piloto","Llamada de diagnóstico gratuita"], keyTactic:"Secuencia de correo de calificación + score conductual", conversionMetric:"Leads MQL → SQL + costo por lead calificado", pct:15 },
    ],
    en: [
      { stage:"TOFU", label:"Discovery", objective:"Reach the right audience with the right problem", contentTypes:["Problem + solution articles","Hook-led list content","Entry-level educational videos"], keyTactic:"Organic SEO + social organic with problem hook", conversionMetric:"Traffic + opt-in click-through rate", pct:50 },
      { stage:"MOFU", label:"Capture", objective:"Convert visitors into qualified leads", contentTypes:["High-value lead magnets","Solution webinars","Interactive quiz / diagnostic"], keyTactic:"Optimised landing pages + continuous A/B testing", conversionMetric:"Opt-in rate + lead quality (MQL %)", pct:35 },
      { stage:"BOFU", label:"Qualification", objective:"Elevate the lead to a sales opportunity or activation", contentTypes:["Closing nurture email","Trial / pilot offer","Free diagnostic call"], keyTactic:"Qualification email sequence + behavioural scoring", conversionMetric:"MQL → SQL + cost per qualified lead", pct:15 },
    ],
  },
  authority: {
    es: [
      { stage:"TOFU", label:"Descubrimiento de perspectiva", objective:"Hacer llegar el punto de vista único a la audiencia correcta", contentTypes:["Opiniones contraintuitivas del sector","Marcos conceptuales originales","Análisis críticos de tendencias"], keyTactic:"Distribución en LinkedIn + SEO de ideas propias", conversionMetric:"Alcance + tasa de guardado + citas de otros creadores", pct:35 },
      { stage:"MOFU", label:"Construcción de credibilidad", objective:"Demostrar expertise profundo con evidencia sostenida", contentTypes:["Estudios propios y datos originales","Casos de análisis en profundidad","Guías de referencia permanente"], keyTactic:"Publicación cruzada + apariciones en medios del sector", conversionMetric:"Backlinks + invitaciones a hablar + menciones en prensa", pct:45 },
      { stage:"BOFU", label:"Reconocimiento y acción", objective:"Convertir autoridad en oportunidades concretas", contentTypes:["Oferta de consultoría / programa exclusivo","Masterclass de acceso cerrado","Mentoring o comunidad premium"], keyTactic:"Lista de espera + comunidad de alta intención", conversionMetric:"Ingresos de autoridad + partnerships generados", pct:20 },
    ],
    en: [
      { stage:"TOFU", label:"Perspective Discovery", objective:"Get the unique point of view to the right audience", contentTypes:["Counter-intuitive industry opinions","Original conceptual frameworks","Critical trend analyses"], keyTactic:"LinkedIn distribution + own-idea SEO", conversionMetric:"Reach + save rate + peer creator citations", pct:35 },
      { stage:"MOFU", label:"Credibility Building", objective:"Demonstrate deep expertise with sustained evidence", contentTypes:["Own studies and original data","In-depth case analyses","Permanent reference guides"], keyTactic:"Cross-publishing + industry media appearances", conversionMetric:"Backlinks + speaking invitations + press mentions", pct:45 },
      { stage:"BOFU", label:"Recognition and Action", objective:"Convert authority into concrete opportunities", contentTypes:["Consulting / exclusive programme offer","Closed-access masterclass","Premium mentoring or community"], keyTactic:"Waitlist + high-intent community", conversionMetric:"Authority revenue + partnerships generated", pct:20 },
    ],
  },
  brand_awareness: {
    es: [
      { stage:"TOFU", label:"Descubrimiento de marca", objective:"Maximizar el alcance y las primeras impresiones de marca", contentTypes:["Contenido viral de valores de marca","Campañas visuales de impacto","Participación en tendencias culturales"], keyTactic:"Paid social de alcance + contenido nativo por plataforma", conversionMetric:"Alcance total + frecuencia de impresión + tasa de seguimiento", pct:60 },
      { stage:"MOFU", label:"Familiaridad y afinidad", objective:"Construir conexión emocional y reconocimiento profundo", contentTypes:["Historias de marca y comunidad","Contenido educativo de valor","Colaboraciones con creadores"], keyTactic:"Frecuencia de contenido sostenida + contenido de comunidad", conversionMetric:"Tasa de engagement + guardados + menciones espontáneas", pct:30 },
      { stage:"BOFU", label:"Consideración de marca", objective:"Convertir familiaridad en preferencia activa de marca", contentTypes:["Testimoniales y prueba social","Comparativas de marca","Contenido de oferta directa"], keyTactic:"Retargeting de audiencia caliente + email de lista", conversionMetric:"Share of voice + búsquedas de marca + conversión directa", pct:10 },
    ],
    en: [
      { stage:"TOFU", label:"Brand Discovery", objective:"Maximise brand reach and first impressions", contentTypes:["Viral brand values content","High-impact visual campaigns","Cultural trend participation"], keyTactic:"Reach-focused paid social + native content per platform", conversionMetric:"Total reach + impression frequency + follow-through rate", pct:60 },
      { stage:"MOFU", label:"Familiarity and Affinity", objective:"Build emotional connection and deep recognition", contentTypes:["Brand and community stories","Value-driven educational content","Creator collaborations"], keyTactic:"Sustained content frequency + community content", conversionMetric:"Engagement rate + saves + spontaneous mentions", pct:30 },
      { stage:"BOFU", label:"Brand Consideration", objective:"Convert familiarity into active brand preference", contentTypes:["Testimonials and social proof","Brand comparisons","Direct offer content"], keyTactic:"Warm audience retargeting + list email", conversionMetric:"Share of voice + brand searches + direct conversion", pct:10 },
    ],
  },
  engagement: {
    es: [
      { stage:"TOFU", label:"Atracción de comunidad", objective:"Traer a las personas correctas al ecosistema", contentTypes:["Contenido de identidad compartida","Posts de preguntas de alta respuesta","Contenido de pertenencia y tribu"], keyTactic:"Social orgánico + programa de referidos comunitarios", conversionMetric:"Nuevos seguidores de alta calidad + tasa de seguimiento por interacción", pct:50 },
      { stage:"MOFU", label:"Activación de participación", objective:"Convertir seguidores en participantes activos", contentTypes:["Challenges con participación","Encuestas y decisiones comunitarias","Co-creación de contenido"], keyTactic:"Stories interactivas + rituales de comunidad semanales", conversionMetric:"Tasa de respuesta activa + % de miembros que publican", pct:35 },
      { stage:"BOFU", label:"Comunidad profunda", objective:"Construir el núcleo de miembros altamente comprometidos", contentTypes:["Acceso exclusivo a miembros VIP","Eventos privados de comunidad","Contenido co-creado con líderes"], keyTactic:"Programa de miembros premium + reconocimiento de contribuidores", conversionMetric:"Retención mensual + ingresos por comunidad + NPS", pct:15 },
    ],
    en: [
      { stage:"TOFU", label:"Community Attraction", objective:"Bring the right people into the ecosystem", contentTypes:["Shared-identity content","High-reply question posts","Belonging and tribe content"], keyTactic:"Organic social + community referral programme", conversionMetric:"High-quality new followers + follow-through rate per interaction", pct:50 },
      { stage:"MOFU", label:"Participation Activation", objective:"Convert followers into active participants", contentTypes:["Participation challenges","Community polls and decisions","Content co-creation"], keyTactic:"Interactive Stories + weekly community rituals", conversionMetric:"Active reply rate + % of members who post", pct:35 },
      { stage:"BOFU", label:"Deep Community", objective:"Build the highly committed core member base", contentTypes:["VIP member exclusive access","Private community events","Co-created content with leaders"], keyTactic:"Premium member programme + contributor recognition", conversionMetric:"Monthly retention + community revenue + NPS", pct:15 },
    ],
  },
};

// ── Authority assets per goal ─────────────────────────────────────────────────
const AUTHORITY_ASSETS: Record<Goal, Record<"es"|"en", AuthorityAsset[]>> = {
  sales: {
    es: [
      { type:"Biblioteca de casos de éxito", description:"5–10 casos de clientes con estructura problema → solución → resultado medible. Cada caso debe incluir métricas específicas y debe estar diseñado como herramienta de ventas, no como contenido de marketing.", timeline:"Mes 1–2", impact:"Critical" },
      { type:"Informe de ROI comparativo", description:"Análisis documentado del retorno sobre la inversión típico de clientes, incluyendo rangos de resultado por industria, tamaño de empresa y caso de uso. Convierte la conversación de costo en conversación de inversión.", timeline:"Mes 2", impact:"Critical" },
      { type:"Serie de demos de producto", description:"3–5 demos en video de producto para los casos de uso más frecuentes, cada uno de 8–12 minutos, diseñados para eliminar objeciones específicas en la etapa de evaluación.", timeline:"Mes 1–3", impact:"High" },
      { type:"Guía de decisión de compra del sector", description:"Guía educativa (no de venta) que enseña a la audiencia cómo evaluar y comprar la categoría de producto. Posiciona la marca como fuente de autoridad neutral en el proceso de decisión.", timeline:"Mes 3", impact:"High" },
    ],
    en: [
      { type:"Success story library", description:"5–10 client cases with problem → solution → measurable result structure. Each case must include specific metrics and be designed as a sales tool, not marketing content.", timeline:"Month 1–2", impact:"Critical" },
      { type:"ROI comparison report", description:"Documented analysis of typical client return on investment, including result ranges by industry, company size, and use case. Converts the cost conversation into an investment conversation.", timeline:"Month 2", impact:"Critical" },
      { type:"Product demo series", description:"3–5 product video demos for the most frequent use cases, each 8–12 minutes, designed to eliminate specific objections at the evaluation stage.", timeline:"Month 1–3", impact:"High" },
      { type:"Industry buying decision guide", description:"Educational (not sales) guide that teaches the audience how to evaluate and buy the product category. Positions the brand as a neutral authority source in the decision process.", timeline:"Month 3", impact:"High" },
    ],
  },
  leads: {
    es: [
      { type:"Biblioteca de lead magnets", description:"3–5 recursos descargables de alta percepción de valor (plantillas, checklists, calculadoras, guías) directamente conectados a los problemas más frecuentes de la audiencia. Cada recurso tiene su propia página de aterrizaje.", timeline:"Mes 1–2", impact:"Critical" },
      { type:"Serie de webinars de solución", description:"4–6 webinars grabados que abordan los problemas más urgentes de la audiencia, cada uno con su propio formulario de registro y secuencia de email de seguimiento.", timeline:"Mes 2–3", impact:"Critical" },
      { type:"Herramienta o calculadora interactiva", description:"Herramienta web gratuita que entrega un resultado personalizado al usuario a cambio de su email. El valor percibido es alto y la tasa de opt-in es significativamente superior al lead magnet estático promedio.", timeline:"Mes 3–4", impact:"High" },
      { type:"Curso gratuito por email", description:"Secuencia de 5–7 emails educativos que resuelven un problema específico de la audiencia. Genera leads de alta intención y establece autoridad antes de cualquier propuesta de venta.", timeline:"Mes 2", impact:"High" },
    ],
    en: [
      { type:"Lead magnet library", description:"3–5 high-perceived-value downloadable resources (templates, checklists, calculators, guides) directly connected to the audience's most frequent problems. Each resource has its own landing page.", timeline:"Month 1–2", impact:"Critical" },
      { type:"Solution webinar series", description:"4–6 recorded webinars addressing the audience's most urgent problems, each with its own registration form and email follow-up sequence.", timeline:"Month 2–3", impact:"Critical" },
      { type:"Interactive tool or calculator", description:"Free web tool that delivers a personalised result to the user in exchange for their email. Perceived value is high and opt-in rate significantly exceeds the average static lead magnet.", timeline:"Month 3–4", impact:"High" },
      { type:"Free email course", description:"Sequence of 5–7 educational emails that solve a specific audience problem. Generates high-intent leads and establishes authority before any sales proposal.", timeline:"Month 2", impact:"High" },
    ],
  },
  authority: {
    es: [
      { type:"Informe de investigación original", description:"Estudio anual con datos propios del sector basado en encuestas a la audiencia o análisis de datos del nicho. Este activo es la fuente de mayor cantidad de backlinks, menciones en prensa y citaciones de pares en la industria.", timeline:"Mes 3–6", impact:"Critical" },
      { type:"Marco conceptual o metodología propia", description:"Un sistema nombrado y visual que organiza el conocimiento del tema de forma propia y diferenciada. El marco se convierte en la unidad de referencia en conversaciones del sector.", timeline:"Mes 1–2", impact:"Critical" },
      { type:"Guía definitiva de referencia del sector", description:"La guía más completa disponible sobre el tema central del nicho — 5,000–15,000 palabras, actualizada anualmente. Se convierte en la referencia de primera búsqueda y fuente de backlinks editoriales.", timeline:"Mes 2–4", impact:"High" },
      { type:"Serie de entrevistas con referentes", description:"8–12 entrevistas en profundidad con los líderes más reconocidos del sector. El efecto de asociación con los referentes entrevistados transfiere credibilidad y genera distribución orgánica.", timeline:"Mes 1–6 (en curso)", impact:"High" },
    ],
    en: [
      { type:"Original research report", description:"Annual industry study based on own data from audience surveys or niche data analysis. This asset generates the highest volume of backlinks, press mentions, and peer citations in the industry.", timeline:"Month 3–6", impact:"Critical" },
      { type:"Proprietary framework or methodology", description:"A named and visual system that organises knowledge of the topic in a unique and differentiated way. The framework becomes the reference unit in industry conversations.", timeline:"Month 1–2", impact:"Critical" },
      { type:"Definitive industry reference guide", description:"The most comprehensive guide available on the niche's central topic — 5,000–15,000 words, updated annually. Becomes the first-search reference and editorial backlink source.", timeline:"Month 2–4", impact:"High" },
      { type:"Peer interview series", description:"8–12 in-depth interviews with the most recognised leaders in the sector. The association effect with the interviewed peers transfers credibility and generates organic distribution.", timeline:"Month 1–6 (ongoing)", impact:"High" },
    ],
  },
  brand_awareness: {
    es: [
      { type:"Documental de marca o historia de origen", description:"Pieza de video de 10–20 minutos que narra la historia, los valores y el propósito de la marca con producción de alta calidad. Genera el mayor volumen de contenido compartido orgánicamente y es la pieza de mayor alcance de marca a largo plazo.", timeline:"Mes 2–4", impact:"Critical" },
      { type:"Serie de colaboraciones con creadores", description:"Alianzas estratégicas con 5–10 creadores de contenido con audiencias alineadas para co-crear contenido de alcance. El efecto multiplicador de audiencias cruzadas es el método más eficiente de expansión de awareness sin paid.", timeline:"Mes 1–3", impact:"Critical" },
      { type:"Sistema de identidad visual de marca", description:"Guía de marca completa, templates de contenido y activos visuales coherentes que permiten producir contenido de marca a escala con consistencia visual profesional.", timeline:"Mes 1", impact:"High" },
      { type:"Campaña de contenido de valores", description:"Serie de 6–12 piezas de contenido que comunican los valores y la cultura de la marca de forma narrativa y emocional. Este contenido genera el mayor engagement orgánico y la mayor afinidad de audiencia.", timeline:"Mes 2–5", impact:"High" },
    ],
    en: [
      { type:"Brand documentary or origin story", description:"A 10–20 minute video piece narrating the brand's story, values, and purpose with high production quality. Generates the highest volume of organic content sharing and is the highest long-term brand reach asset.", timeline:"Month 2–4", impact:"Critical" },
      { type:"Creator collaboration series", description:"Strategic alliances with 5–10 content creators with aligned audiences to co-create reach content. The cross-audience multiplier effect is the most efficient awareness expansion method without paid media.", timeline:"Month 1–3", impact:"Critical" },
      { type:"Brand visual identity system", description:"Complete brand guide, content templates, and coherent visual assets that enable producing brand content at scale with professional visual consistency.", timeline:"Month 1", impact:"High" },
      { type:"Brand values content campaign", description:"A series of 6–12 content pieces that communicate the brand's values and culture in a narrative and emotional way. This content generates the highest organic engagement and greatest audience affinity.", timeline:"Month 2–5", impact:"High" },
    ],
  },
  engagement: {
    es: [
      { type:"Comunidad privada (Discord / Slack / Circle)", description:"Espacio de comunidad exclusivo con canales temáticos, rituales de participación y eventos regulares. El índice de retención de una comunidad activa supera al de cualquier otro formato de contenido en un 3–5×.", timeline:"Mes 1–2", impact:"Critical" },
      { type:"Challenge de participación de 30 días", description:"Reto de 30 días diseñado específicamente para el problema central de la audiencia, con estructura de participación diaria y sistema de reconocimiento de progreso. Genera el mayor volumen de UGC y participación activa de cualquier formato.", timeline:"Mes 2–3", impact:"Critical" },
      { type:"Formato de live semanal", description:"Sesión en vivo semanal con estructura fija (Q&A, debate, tutorial) que crea un ritual de comunidad. Los formatos en vivo recurrentes son el mecanismo más efectivo de retención de audiencia a largo plazo.", timeline:"Mes 1 (en curso)", impact:"High" },
      { type:"Serie co-creada con la audiencia", description:"Formato de contenido donde la audiencia elige el tema, participa en la producción o aparece como protagonista. La co-creación convierte a seguidores en evangelizadores y multiplica el alcance orgánico.", timeline:"Mes 3–5", impact:"High" },
    ],
    en: [
      { type:"Private community (Discord / Slack / Circle)", description:"Exclusive community space with themed channels, participation rituals, and regular events. The retention index of an active community exceeds that of any other content format by 3–5×.", timeline:"Month 1–2", impact:"Critical" },
      { type:"30-day participation challenge", description:"A 30-day challenge specifically designed around the audience's core problem, with daily participation structure and progress recognition system. Generates the highest volume of UGC and active engagement of any format.", timeline:"Month 2–3", impact:"Critical" },
      { type:"Weekly live format", description:"Weekly live session with a fixed structure (Q&A, debate, tutorial) that creates a community ritual. Recurring live formats are the most effective long-term audience retention mechanism.", timeline:"Month 1 (ongoing)", impact:"High" },
      { type:"Audience co-created series", description:"Content format where the audience chooses the topic, participates in production, or appears as the protagonist. Co-creation converts followers into evangelists and multiplies organic reach.", timeline:"Month 3–5", impact:"High" },
    ],
  },
};

// ── Market dominance plan per goal ────────────────────────────────────────────
const DOMINANCE_PLANS: Record<Goal, Record<"es"|"en", {
  marketGap: string;
  differentiationAngle: string;
  phases: { phase: string; duration: string; focus: string; actions: string[] }[];
  kpisToOwn: string[];
}>> = {
  sales: {
    es: {
      marketGap: "La mayoría de los creadores en este nicho producen contenido educativo o de valor pero no conectan sistemáticamente ese contenido con la conversación de compra. El gap es la ausencia de contenido que cierre la brecha entre 'quiero aprender' y 'quiero comprar'.",
      differentiationAngle: "Posicionarse como la marca que demuestra resultados específicos medibles antes de que el prospecto haga una sola pregunta — el estándar de prueba más alto del nicho.",
      phases: [
        { phase:"Fase 1: Infraestructura de conversión", duration:"Días 1–30", focus:"Construir los activos de conversión que no existen aún", actions:["Producir los primeros 3 casos de éxito con métricas reales","Configurar la secuencia de nurturing de email post-interacción","Lanzar el canal de LinkedIn con frecuencia diaria orientada a resultados","Establecer el protocolo de seguimiento comercial basado en contenido"] },
        { phase:"Fase 2: Distribución y calificación", duration:"Días 31–60", focus:"Llevar el contenido de conversión a la audiencia correcta a escala", actions:["Activar paid social dirigido a audiencia de compra activa","Lanzar el primer webinar de demo en vivo con seguimiento de cierre","Publicar el informe de ROI comparativo como activo de ancla","Iniciar el protocolo de alianzas con referidores del nicho"] },
        { phase:"Fase 3: Dominación del ciclo de compra", duration:"Días 61–90", focus:"Ser la marca de referencia en el momento de decisión de compra", actions:["Optimizar el funnel de conversión con datos de las fases 1–2","Lanzar la biblioteca completa de casos de éxito en el sitio","Escalar el canal de email con segmentación por etapa de compra","Establecer el sistema de referidos de clientes activos"] },
      ],
      kpisToOwn:["Tasa de cierre de demos (objetivo: >30%)","Costo por oportunidad calificada (objetivo: reducir 40% en 90d)","Tiempo promedio de ciclo de venta (objetivo: reducir 25%)","Volumen de búsqueda de marca (objetivo: crecer 3× en 90d)"],
    },
    en: {
      marketGap: "Most creators in this niche produce educational or value content but do not systematically connect that content to the buying conversation. The gap is the absence of content that closes the bridge between 'I want to learn' and 'I want to buy'.",
      differentiationAngle: "Position as the brand that demonstrates specific measurable results before the prospect asks a single question — the highest proof standard in the niche.",
      phases: [
        { phase:"Phase 1: Conversion Infrastructure", duration:"Days 1–30", focus:"Build the conversion assets that do not exist yet", actions:["Produce the first 3 success stories with real metrics","Set up the post-interaction email nurturing sequence","Launch LinkedIn channel with daily result-oriented frequency","Establish the content-based commercial follow-up protocol"] },
        { phase:"Phase 2: Distribution and Qualification", duration:"Days 31–60", focus:"Take conversion content to the right audience at scale", actions:["Activate paid social targeting active buying audience","Launch first live demo webinar with closing follow-up","Publish the ROI comparison report as anchor asset","Initiate niche referrer partnership protocol"] },
        { phase:"Phase 3: Purchase Cycle Domination", duration:"Days 61–90", focus:"Be the reference brand at the purchase decision moment", actions:["Optimise conversion funnel with data from phases 1–2","Launch complete success story library on site","Scale email channel with purchase-stage segmentation","Establish active client referral system"] },
      ],
      kpisToOwn:["Demo close rate (target: >30%)","Cost per qualified opportunity (target: reduce 40% in 90d)","Average sales cycle time (target: reduce 25%)","Brand search volume (target: 3× growth in 90d)"],
    },
  },
  leads: {
    es: {
      marketGap: "El nicho está saturado de contenido educativo gratuito de baja barrera, pero la mayoría de los creadores no tienen un sistema de captura estructurado que convierta ese contenido en leads calificados. El gap es la ausencia de un embudo de captura de alta conversión.",
      differentiationAngle: "Ser la marca que entrega el recurso gratuito de mayor valor percibido del nicho — el lead magnet que la audiencia comparte porque genera resultados inmediatos.",
      phases: [
        { phase:"Fase 1: Motor de captura", duration:"Días 1–30", focus:"Construir el sistema de captura de leads que funciona sin paid", actions:["Lanzar el lead magnet principal con página de aterrizaje optimizada","Publicar 8 artículos SEO de alta intención con CTA integrado","Configurar la secuencia de bienvenida de 5 emails de valor","Activar LinkedIn con 2 posts diarios orientados a opt-in"] },
        { phase:"Fase 2: Escala y optimización", duration:"Días 31–60", focus:"Escalar los canales de captura que ya demuestran tracción", actions:["Lanzar el primer webinar grabado con formulario de registro","Activar paid social en el lead magnet con mayor tasa de conversión","Publicar 2 lead magnets adicionales para segmentos de audiencia diferentes","Lanzar la herramienta interactiva o calculadora gratuita"] },
        { phase:"Fase 3: Ecosistema de captura", duration:"Días 61–90", focus:"Convertir cada canal en un punto de entrada al embudo", actions:["Integrar lead magnets en todos los artículos existentes de mayor tráfico","Lanzar el curso gratuito por email como canal de captura de alta intención","Establecer el programa de referidos de leads entre suscriptores","Implementar la segmentación de leads por interés para personalizar nurturing"] },
      ],
      kpisToOwn:["Tasa de opt-in de landing page (objetivo: >25%)","Costo por lead calificado (objetivo: <$15 en 90d)","Tasa de apertura de email de bienvenida (objetivo: >50%)","Volumen de leads MQL mensuales (objetivo: 3× en 90d)"],
    },
    en: {
      marketGap: "The niche is saturated with free low-barrier educational content, but most creators do not have a structured capture system that converts that content into qualified leads. The gap is the absence of a high-conversion capture funnel.",
      differentiationAngle: "Be the brand that delivers the highest-perceived-value free resource in the niche — the lead magnet the audience shares because it generates immediate results.",
      phases: [
        { phase:"Phase 1: Capture Engine", duration:"Days 1–30", focus:"Build the lead capture system that works without paid", actions:["Launch primary lead magnet with optimised landing page","Publish 8 high-intent SEO articles with integrated CTA","Set up 5-email value welcome sequence","Activate LinkedIn with 2 daily opt-in-oriented posts"] },
        { phase:"Phase 2: Scale and Optimisation", duration:"Days 31–60", focus:"Scale the capture channels that already show traction", actions:["Launch first recorded webinar with registration form","Activate paid social on the highest-converting lead magnet","Publish 2 additional lead magnets for different audience segments","Launch the interactive tool or free calculator"] },
        { phase:"Phase 3: Capture Ecosystem", duration:"Days 61–90", focus:"Convert every channel into a funnel entry point", actions:["Integrate lead magnets into all existing high-traffic articles","Launch free email course as high-intent capture channel","Establish subscriber-to-subscriber lead referral programme","Implement lead segmentation by interest to personalise nurturing"] },
      ],
      kpisToOwn:["Landing page opt-in rate (target: >25%)","Cost per qualified lead (target: <$15 in 90d)","Welcome email open rate (target: >50%)","Monthly MQL lead volume (target: 3× in 90d)"],
    },
  },
  authority: {
    es: {
      marketGap: "La mayoría de los referentes del nicho construyeron su autoridad con contenido de valor genérico. El gap actual es la ausencia de una figura que respalde su posicionamiento con datos originales, marcos propios y un punto de vista inequívocamente diferenciado.",
      differentiationAngle: "Ser el único creador del nicho con un marco conceptual nombrado y propio que organiza la conversación del sector — la referencia que todos los demás citan.",
      phases: [
        { phase:"Fase 1: Establecimiento del marco propio", duration:"Días 1–30", focus:"Lanzar y distribuir el marco conceptual original", actions:["Publicar el marco conceptual propio en formato artículo + infografía + LinkedIn","Iniciar la serie de entrevistas con referentes del sector","Lanzar el canal de LinkedIn con opiniones de posicionamiento diarias","Presentar el marco en 2–3 podcasts del sector como invitado"] },
        { phase:"Fase 2: Construcción de activos de credibilidad", duration:"Días 31–60", focus:"Producir la evidencia que sustenta el posicionamiento de autoridad", actions:["Lanzar la guía definitiva del tema central del nicho","Iniciar la encuesta para el informe de investigación original","Publicar los primeros 3 análisis de casos en profundidad","Conseguir las primeras citas de pares e incluirlas en activos de distribución"] },
        { phase:"Fase 3: Monetización de la autoridad", duration:"Días 61–90", focus:"Convertir el posicionamiento de autoridad en oportunidades económicas concretas", actions:["Lanzar la oferta premium de autoridad (programa, consultoría o membresía)","Publicar el informe de investigación original y distribuir a medios del sector","Confirmar las primeras apariciones en eventos o medios de alto perfil","Establecer el proceso de lista de espera para la oferta de autoridad"] },
      ],
      kpisToOwn:["Menciones orgánicas del marco propio por pares (objetivo: 50 en 90d)","Invitaciones como ponente o entrevistado (objetivo: 10 en 90d)","Backlinks orgánicos a activos propios (objetivo: 40 en 90d)","Ingresos de autoridad directa (objetivo: primer deal en 60d)"],
    },
    en: {
      marketGap: "Most niche thought leaders built their authority with generic value content. The current gap is the absence of a figure who backs their positioning with original data, proprietary frameworks, and an unambiguously differentiated point of view.",
      differentiationAngle: "Be the only creator in the niche with a named proprietary conceptual framework that organises the industry conversation — the reference everyone else cites.",
      phases: [
        { phase:"Phase 1: Proprietary Framework Launch", duration:"Days 1–30", focus:"Launch and distribute the original conceptual framework", actions:["Publish the proprietary framework as article + infographic + LinkedIn","Start the industry peer interview series","Launch LinkedIn channel with daily positioning opinions","Present the framework on 2–3 niche podcasts as a guest"] },
        { phase:"Phase 2: Credibility Asset Building", duration:"Days 31–60", focus:"Produce the evidence that underpins the authority positioning", actions:["Launch the definitive guide on the niche's central topic","Start the survey for the original research report","Publish the first 3 in-depth case analyses","Secure the first peer citations and include them in distribution assets"] },
        { phase:"Phase 3: Authority Monetisation", duration:"Days 61–90", focus:"Convert the authority positioning into concrete economic opportunities", actions:["Launch the premium authority offer (programme, consulting, or membership)","Publish the original research report and distribute to niche media","Confirm first appearances at high-profile events or media","Establish the waitlist process for the authority offer"] },
      ],
      kpisToOwn:["Organic peer citations of proprietary framework (target: 50 in 90d)","Speaker or interviewee invitations (target: 10 in 90d)","Organic backlinks to own assets (target: 40 in 90d)","Direct authority revenue (target: first deal in 60d)"],
    },
  },
  brand_awareness: {
    es: {
      marketGap: "Las marcas en este nicho invierten en paid sin construir activos de brand equity orgánico. El gap es la ausencia de una marca con una historia y unos valores tan claros que la audiencia los comparta espontáneamente.",
      differentiationAngle: "Ser la marca con la historia más poderosa del nicho — el referente de valores que la audiencia usa como señal de identidad propia.",
      phases: [
        { phase:"Fase 1: Construcción de identidad", duration:"Días 1–30", focus:"Establecer la identidad visual y narrativa de la marca en todos los canales", actions:["Publicar el documental de marca o video de historia de origen","Lanzar el sistema de identidad visual en todos los canales activos","Iniciar la producción de la primera campaña de valores de marca","Identificar y contactar a los primeros 5 creadores para colaboración"] },
        { phase:"Fase 2: Amplificación de alcance", duration:"Días 31–60", focus:"Llevar la identidad de marca a audiencias nuevas a escala", actions:["Lanzar las primeras 3 colaboraciones con creadores","Activar paid social de awareness con creativos de la campaña de valores","Publicar la serie de contenido de comunidad y pertenencia","Iniciar la participación activa en tendencias culturales del nicho"] },
        { phase:"Fase 3: Posicionamiento de marca dominante", duration:"Días 61–90", focus:"Ser la marca de referencia cultural del nicho", actions:["Lanzar la campaña de mayor alcance del período con distribución paid + orgánica","Medir y publicar las métricas de reconocimiento de marca","Escalar el programa de colaboraciones a 10+ creadores","Establecer el ritual de comunidad mensual que represente la marca"] },
      ],
      kpisToOwn:["Volumen de búsqueda de marca (objetivo: 3× en 90d)","Tasa de seguimiento en canales primarios (objetivo: +40% en 90d)","Alcance total mensual (objetivo: 5× en 90d)","Menciones espontáneas de marca sin paid (objetivo: 100+ en mes 3)"],
    },
    en: {
      marketGap: "Brands in this niche invest in paid without building organic brand equity assets. The gap is the absence of a brand with a story and values so clear that the audience shares them spontaneously.",
      differentiationAngle: "Be the brand with the most powerful story in the niche — the values reference that the audience uses as a signal of their own identity.",
      phases: [
        { phase:"Phase 1: Identity Construction", duration:"Days 1–30", focus:"Establish the brand's visual and narrative identity across all channels", actions:["Publish the brand documentary or origin story video","Launch the visual identity system on all active channels","Start production of the first brand values campaign","Identify and contact the first 5 creators for collaboration"] },
        { phase:"Phase 2: Reach Amplification", duration:"Days 31–60", focus:"Take the brand identity to new audiences at scale", actions:["Launch the first 3 creator collaborations","Activate awareness paid social with brand values campaign creatives","Publish the community and belonging content series","Start active participation in niche cultural trends"] },
        { phase:"Phase 3: Dominant Brand Positioning", duration:"Days 61–90", focus:"Be the niche's dominant cultural reference brand", actions:["Launch the period's highest-reach campaign with paid + organic distribution","Measure and publish brand recognition metrics","Scale the collaboration programme to 10+ creators","Establish the monthly community ritual that represents the brand"] },
      ],
      kpisToOwn:["Brand search volume (target: 3× in 90d)","Follow-through rate on primary channels (target: +40% in 90d)","Total monthly reach (target: 5× in 90d)","Spontaneous brand mentions without paid (target: 100+ in month 3)"],
    },
  },
  engagement: {
    es: {
      marketGap: "La mayoría de los creadores del nicho tienen seguidores pasivos. El gap es la ausencia de una comunidad activa con rituales propios, identidad compartida y miembros que crean contenido y traen a otros miembros.",
      differentiationAngle: "Ser la marca con la comunidad más activa e identificable del nicho — donde los miembros se presentan como parte de la comunidad antes de presentar el producto.",
      phases: [
        { phase:"Fase 1: Lanzamiento de comunidad", duration:"Días 1–30", focus:"Construir la base de la comunidad con los miembros fundadores correctos", actions:["Lanzar la comunidad privada con los primeros 50–100 miembros fundadores","Establecer el ritual de comunidad semanal (live, Q&A, o debate)","Lanzar el primer challenge de 30 días con estructura de participación","Publicar el manifiesto de comunidad con valores y reglas de participación"] },
        { phase:"Fase 2: Activación masiva", duration:"Días 31–60", focus:"Convertir la comunidad en el eje central de toda la estrategia de contenido", actions:["Lanzar el primer ciclo completo del challenge de 30 días","Iniciar el programa de reconocimiento de miembros más activos","Activar el formato co-creado donde la audiencia elige el contenido","Publicar los primeros casos de transformación de miembros de la comunidad"] },
        { phase:"Fase 3: Flywheel de comunidad", duration:"Días 61–90", focus:"Convertir la comunidad en un motor auto-sustentable de crecimiento", actions:["Lanzar el programa de miembros premium con acceso exclusivo","Establecer el programa de embajadores / líderes de comunidad","Iniciar el modelo de co-creación donde miembros producen contenido para el canal","Medir y publicar las métricas de salud de comunidad (retención, DAU, NPS)"] },
      ],
      kpisToOwn:["Tasa de participación activa mensual (objetivo: >30% de miembros)","Retención de miembros a 90 días (objetivo: >70%)","UGC generado por la comunidad (objetivo: 50+ piezas en mes 3)","NPS de comunidad (objetivo: >60)"],
    },
    en: {
      marketGap: "Most creators in the niche have passive followers. The gap is the absence of an active community with its own rituals, shared identity, and members who create content and bring in other members.",
      differentiationAngle: "Be the brand with the most active and identifiable community in the niche — where members introduce themselves as part of the community before mentioning the product.",
      phases: [
        { phase:"Phase 1: Community Launch", duration:"Days 1–30", focus:"Build the community foundation with the right founding members", actions:["Launch the private community with the first 50–100 founding members","Establish the weekly community ritual (live, Q&A, or debate)","Launch the first 30-day challenge with participation structure","Publish the community manifesto with values and participation rules"] },
        { phase:"Phase 2: Mass Activation", duration:"Days 31–60", focus:"Convert the community into the central axis of the entire content strategy", actions:["Launch the first complete 30-day challenge cycle","Start the most active member recognition programme","Activate the co-created format where the audience chooses the content","Publish the first member transformation cases from the community"] },
        { phase:"Phase 3: Community Flywheel", duration:"Days 61–90", focus:"Convert the community into a self-sustaining growth engine", actions:["Launch the premium member programme with exclusive access","Establish the ambassador / community leader programme","Start the co-creation model where members produce content for the channel","Measure and publish community health metrics (retention, DAU, NPS)"] },
      ],
      kpisToOwn:["Monthly active participation rate (target: >30% of members)","90-day member retention (target: >70%)","Community-generated UGC (target: 50+ pieces in month 3)","Community NPS (target: >60)"],
    },
  },
};

// ── Brand positioning per goal ────────────────────────────────────────────────
const BRAND_POSITIONING: Record<Goal, Record<"es"|"en", {
  positioningTemplate: string;
  pillars:             { title: string; description: string }[];
  brandVoice:          string;
  uvpTemplate:         string;
}>> = {
  sales: {
    es: {
      positioningTemplate: "Para {audience} que necesita resultados medibles en {niche}, somos la única opción que demuestra el retorno real de la inversión antes de pedir un compromiso — no promesas, evidencia.",
      pillars: [
        { title:"Prueba antes que argumento", description:"Cada afirmación de valor se respalda con un caso de éxito real con métricas específicas. El estándar de prueba de la marca es el más alto del nicho." },
        { title:"Claridad de resultado, no de proceso", description:"La comunicación de la marca habla en el idioma del comprador: retorno sobre inversión, tiempo hasta resultado, reducción de riesgo — no en el idioma del producto." },
        { title:"Acompañamiento post-venta como diferenciador", description:"La experiencia de cliente después de la compra es el activo de marketing más poderoso — cada cliente convertido en caso de éxito es contenido de ventas de alto impacto." },
      ],
      brandVoice: "Directa, orientada a resultados y sin hipérboles. La voz de la marca habla como el mejor asesor comercial del sector: honesto sobre el esfuerzo requerido, específico sobre los resultados posibles y siempre anclado en evidencia real.",
      uvpTemplate: "Ayudamos a {audience} en {niche} a {resultado específico} en {tiempo}, sin {objeción principal}.",
    },
    en: {
      positioningTemplate: "For {audience} who need measurable results in {niche}, we are the only option that demonstrates the real return on investment before asking for a commitment — not promises, evidence.",
      pillars: [
        { title:"Proof before argument", description:"Every value claim is backed by a real success story with specific metrics. The brand's proof standard is the highest in the niche." },
        { title:"Outcome clarity, not process clarity", description:"The brand communicates in the buyer's language: return on investment, time to result, risk reduction — not in the product's language." },
        { title:"Post-sale support as differentiator", description:"The customer experience after purchase is the most powerful marketing asset — every converted customer as a success story is high-impact sales content." },
      ],
      brandVoice: "Direct, result-oriented, and hyperbole-free. The brand voice speaks like the best commercial advisor in the sector: honest about the effort required, specific about the possible results, and always anchored in real evidence.",
      uvpTemplate: "We help {audience} in {niche} to {specific result} in {time}, without {main objection}.",
    },
  },
  leads: {
    es: {
      positioningTemplate: "Para {audience} que quiere hacer crecer su lista y su pipeline en {niche}, somos la fuente de recursos gratuitos de mayor valor real del sector — diseñados para generar resultados inmediatos y construir confianza antes de cualquier conversación de venta.",
      pillars: [
        { title:"Valor gratuito excepcional como estándar", description:"Los recursos gratuitos de la marca deben ser mejores que los productos de pago de los competidores. Ese estándar convierte a los leads en seguidores incondicionales antes de que hagan una sola compra." },
        { title:"Sistema de captura, no solo contenido", description:"Cada pieza de contenido tiene un paso siguiente definido que mueve al lector hacia el embudo. El contenido sin captura es solo entretenimiento." },
        { title:"Confianza construida antes de la oferta", description:"La marca establece autoridad y genera confianza a través del valor del contenido antes de presentar cualquier propuesta de venta. Los leads fríos no existen en un sistema de captura bien diseñado." },
      ],
      brandVoice: "Educativa, generosa y orientada a la acción. La voz de la marca enseña con especificidad, da antes de pedir y siempre tiene el próximo paso claro. La audiencia siente que la marca está de su lado.",
      uvpTemplate: "Damos a {audience} en {niche} las herramientas exactas para {resultado de lead gen}, completamente gratis — porque los mejores clientes primero son los mejores estudiantes.",
    },
    en: {
      positioningTemplate: "For {audience} who want to grow their list and pipeline in {niche}, we are the source of the highest real-value free resources in the sector — designed to generate immediate results and build trust before any sales conversation.",
      pillars: [
        { title:"Exceptional free value as standard", description:"The brand's free resources must be better than competitors' paid products. That standard converts leads into unconditional followers before they make a single purchase." },
        { title:"Capture system, not just content", description:"Every piece of content has a defined next step that moves the reader toward the funnel. Content without capture is just entertainment." },
        { title:"Trust built before the offer", description:"The brand establishes authority and generates trust through content value before presenting any sales proposal. Cold leads do not exist in a well-designed capture system." },
      ],
      brandVoice: "Educational, generous, and action-oriented. The brand voice teaches with specificity, gives before asking, and always has the next step clear. The audience feels the brand is on their side.",
      uvpTemplate: "We give {audience} in {niche} the exact tools to {lead gen result}, completely free — because the best clients are first the best students.",
    },
  },
  authority: {
    es: {
      positioningTemplate: "Para {audience} en {niche} que quiere aprender de los mejores, somos la fuente de perspectivas más rigurosas, mejor sustentadas y más diferenciadas del sector — no seguimos la conversación, la definimos.",
      pillars: [
        { title:"Marco propio como unidad de referencia", description:"La marca tiene un sistema conceptual propio que organiza el conocimiento del nicho de forma diferenciada. Ese marco es la firma intelectual que hace que cada pieza de contenido sea reconociblemente nuestra." },
        { title:"Opinión con argumentación, no solo perspectiva", description:"La marca no solo tiene puntos de vista — los defiende con datos, casos y razonamiento profundo. La diferencia entre un comentarista y una autoridad es la calidad del argumento." },
        { title:"Evidencia original, no contenido curado", description:"La autoridad real se construye produciendo conocimiento nuevo, no redistribuyendo el conocimiento de otros. Los estudios propios, los datos originales y los marcos conceptuales son los únicos activos de autoridad que no se pueden copiar." },
      ],
      brandVoice: "Rigurosa, contraintuitiva y sin condescendencia. La voz de la marca habla de igual a igual con los mejores del sector, desafía el pensamiento convencional con argumentos sólidos y nunca simplifica hasta el punto de perder la verdad.",
      uvpTemplate: "Para {audience} en {niche}, somos la referencia que combina {expertise diferenciado} con {metodología propia} para producir perspectivas que ningún otro en el sector puede ofrecer.",
    },
    en: {
      positioningTemplate: "For {audience} in {niche} who want to learn from the best, we are the source of the most rigorous, best-substantiated, and most differentiated perspectives in the sector — we do not follow the conversation, we define it.",
      pillars: [
        { title:"Proprietary framework as reference unit", description:"The brand has its own conceptual system that organises niche knowledge in a differentiated way. That framework is the intellectual signature that makes every piece of content recognisably ours." },
        { title:"Opinion with argumentation, not just perspective", description:"The brand does not just have points of view — it defends them with data, cases, and deep reasoning. The difference between a commentator and an authority is the quality of the argument." },
        { title:"Original evidence, not curated content", description:"Real authority is built by producing new knowledge, not redistributing others' knowledge. Own studies, original data, and conceptual frameworks are the only authority assets that cannot be copied." },
      ],
      brandVoice: "Rigorous, counter-intuitive, and without condescension. The brand voice speaks as an equal with the best in the sector, challenges conventional thinking with solid arguments, and never simplifies to the point of losing the truth.",
      uvpTemplate: "For {audience} in {niche}, we are the reference that combines {differentiated expertise} with {proprietary methodology} to produce perspectives no one else in the sector can offer.",
    },
  },
  brand_awareness: {
    es: {
      positioningTemplate: "Para {audience} que busca una marca en {niche} que represente algo más que un producto, somos la marca con la historia y los valores más claros del sector — la que la audiencia elige como señal de identidad propia.",
      pillars: [
        { title:"Identidad como producto", description:"La marca no solo vende un producto o servicio — vende pertenencia a una tribu y adhesión a unos valores. La identidad de la marca es tan distintiva que los clientes la exhiben como parte de su identidad personal." },
        { title:"Historia como ventaja competitiva", description:"La historia de la marca, su origen y su propósito son activos estratégicos que ningún competidor puede copiar. La narrativa de por qué existimos importa más que la descripción de lo que vendemos." },
        { title:"Consistencia visual como reconocimiento instantáneo", description:"La identidad visual de la marca es tan coherente que la audiencia reconoce el contenido antes de ver el nombre. Esa consistencia convierte cada pieza de contenido en publicidad de marca." },
      ],
      brandVoice: "Auténtica, visual y emocionalmente resonante. La voz de la marca habla con la sinceridad de un fundador que cree profundamente en lo que hace, la calidez de una comunidad que incluye y la claridad de alguien que sabe exactamente quién es.",
      uvpTemplate: "Somos la marca de {niche} para {audience} que cree que {valor central} — no solo compramos un producto, compartimos una forma de ver el mundo.",
    },
    en: {
      positioningTemplate: "For {audience} looking for a brand in {niche} that represents more than a product, we are the brand with the clearest story and values in the sector — the one the audience chooses as a signal of their own identity.",
      pillars: [
        { title:"Identity as product", description:"The brand does not just sell a product or service — it sells belonging to a tribe and adherence to values. The brand identity is so distinctive that customers display it as part of their personal identity." },
        { title:"Story as competitive advantage", description:"The brand's story, its origin, and its purpose are strategic assets no competitor can copy. The narrative of why we exist matters more than the description of what we sell." },
        { title:"Visual consistency as instant recognition", description:"The brand's visual identity is so coherent that the audience recognises the content before seeing the name. That consistency converts every piece of content into brand advertising." },
      ],
      brandVoice: "Authentic, visual, and emotionally resonant. The brand voice speaks with the sincerity of a founder who deeply believes in what they do, the warmth of a community that includes, and the clarity of someone who knows exactly who they are.",
      uvpTemplate: "We are the {niche} brand for {audience} who believe that {core value} — we don't just buy a product, we share a way of seeing the world.",
    },
  },
  engagement: {
    es: {
      positioningTemplate: "Para {audience} en {niche} que quiere más que contenido — que quiere una comunidad real — somos el espacio donde los miembros se transforman, se conectan y construyen juntos lo que ninguno podría construir solo.",
      pillars: [
        { title:"Comunidad como producto principal", description:"El producto de la marca no es el contenido — es la experiencia de pertenencia a la comunidad. El contenido es el mecanismo de atracción; la comunidad es el mecanismo de retención y valor real." },
        { title:"Co-creación como motor de crecimiento", description:"Los miembros de la comunidad no son consumidores pasivos — son co-creadores activos. Esa participación convierte a cada miembro en un distribuidor orgánico de la marca." },
        { title:"Rituales como pegamento de identidad", description:"Los rituales de comunidad (eventos recurrentes, formatos fijos, tradiciones propias) son lo que convierte a un grupo de seguidores en una tribu cohesionada con identidad propia." },
      ],
      brandVoice: "Cercana, participativa y genuinamente interesada en las personas. La voz de la marca hace preguntas reales, escucha las respuestas, celebra los logros de los miembros y crea el espacio para que otros brillen. Es una voz de facilitador, no de presentador.",
      uvpTemplate: "Somos la comunidad de {niche} para {audience} donde {transformación específica} ocurre porque hacemos {práctica diferenciadora} que nadie más en el sector hace.",
    },
    en: {
      positioningTemplate: "For {audience} in {niche} who want more than content — who want a real community — we are the space where members transform, connect, and build together what none could build alone.",
      pillars: [
        { title:"Community as the core product", description:"The brand's product is not the content — it is the experience of belonging to the community. Content is the attraction mechanism; community is the retention mechanism and real value." },
        { title:"Co-creation as growth engine", description:"Community members are not passive consumers — they are active co-creators. That participation converts every member into an organic brand distributor." },
        { title:"Rituals as identity glue", description:"Community rituals (recurring events, fixed formats, own traditions) are what converts a group of followers into a cohesive tribe with its own identity." },
      ],
      brandVoice: "Close, participative, and genuinely interested in people. The brand voice asks real questions, listens to the answers, celebrates member achievements, and creates the space for others to shine. It is a facilitator's voice, not a presenter's.",
      uvpTemplate: "We are the {niche} community for {audience} where {specific transformation} happens because we do {differentiating practice} that no one else in the sector does.",
    },
  },
};

// ── Build enterprise strategy ────────────────────────────────────────────────
function buildEnterpriseStrategy(
  niche:    string,
  goal:     Goal,
  audience: string,
  lang:     "es" | "en",
): EnterpriseStrategy {
  const bp        = BRAND_POSITIONING[goal][lang];
  const channels  = CHANNELS[goal][lang];
  const funnel    = FUNNELS[goal][lang];
  const assets    = AUTHORITY_ASSETS[goal][lang];
  const dominance = DOMINANCE_PLANS[goal][lang];

  const aud = audience.trim() || (lang === "es" ? "tu audiencia objetivo" : "your target audience");
  const n   = niche.trim()    || (lang === "es" ? "tu nicho"              : "your niche");

  const positioningStatement = bp.positioningTemplate
    .replace(/{audience}/g, aud)
    .replace(/{niche}/g, n);
  const uvp = bp.uvpTemplate
    .replace(/{audience}/g, aud)
    .replace(/{niche}/g, n);

  return {
    positioningStatement,
    differentiationPillars: bp.pillars,
    brandVoice:             bp.brandVoice,
    uvp,
    channels,
    funnel,
    authorityAssets: assets,
    dominancePlan:   dominance,
  };
}

// ── Enterprise UI components ──────────────────────────────────────────────────
function EntStratBlock({ icon, label, content }: { icon: React.ReactNode; label: string; content: string }) {
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
        {icon}{label}
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed">{content}</p>
    </div>
  );
}

function PillarCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="glass border border-border rounded-xl p-3 space-y-1">
      <p className="text-xs font-bold text-primary">{title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function ChannelCard({ channel, role, contentTypes, frequency, kpi }: ChannelRole) {
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-bold text-foreground">{channel}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">{frequency}</span>
      </div>
      <p className="text-xs text-primary font-semibold">{role}</p>
      <div className="flex flex-wrap gap-1">
        {contentTypes.map((ct, i) => (
          <span key={i} className="text-[10px] bg-white/5 border border-border rounded-md px-2 py-0.5 text-muted-foreground">{ct}</span>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-1.5">
        <span className="font-bold text-foreground/60">KPI: </span>{kpi}
      </p>
    </div>
  );
}

const FUNNEL_COLORS = {
  TOFU: { bg:"bg-blue-500/10", border:"border-blue-500/30", text:"text-blue-400", bar:"bg-blue-500" },
  MOFU: { bg:"bg-amber-500/10", border:"border-amber-500/30", text:"text-amber-400", bar:"bg-amber-500" },
  BOFU: { bg:"bg-green-500/10", border:"border-green-500/30", text:"text-green-400", bar:"bg-green-500" },
};

function FunnelRow({ stage, label, objective, contentTypes, keyTactic, conversionMetric, pct }: FunnelStageData) {
  const c = FUNNEL_COLORS[stage];
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${c.bg} ${c.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-black uppercase tracking-widest ${c.text}`}>{stage}</span>
          <span className="text-xs font-semibold text-foreground">— {label}</span>
        </div>
        <span className={`text-sm font-black ${c.text}`}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5">
        <div className={`h-full rounded-full ${c.bar} opacity-60`} style={{ width:`${pct}%` }} />
      </div>
      <p className="text-xs text-foreground/80 font-medium">{objective}</p>
      <div className="flex flex-wrap gap-1">
        {contentTypes.map((ct, i) => (
          <span key={i} className="text-[10px] bg-white/5 border border-white/10 rounded-md px-2 py-0.5 text-muted-foreground">{ct}</span>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-white/10">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Key Tactic</p>
          <p className="text-[11px] text-foreground/70">{keyTactic}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Conversion Metric</p>
          <p className="text-[11px] text-foreground/70">{conversionMetric}</p>
        </div>
      </div>
    </div>
  );
}

const IMPACT_STYLE = {
  Critical: "text-red-400 border-red-500/30 bg-red-500/10",
  High:     "text-amber-400 border-amber-500/30 bg-amber-500/10",
  Medium:   "text-primary border-primary/30 bg-primary/10",
};

function AssetRow({ type, description, timeline, impact }: AuthorityAsset) {
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-foreground">{type}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 uppercase tracking-wider ${IMPACT_STYLE[impact]}`}>{impact}</span>
          <span className="text-[10px] text-muted-foreground bg-white/5 border border-border rounded-full px-2 py-0.5">{timeline}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function PhaseCard({ phase, duration, focus, actions }: {
  phase: string; duration: string; focus: string; actions: string[];
}) {
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold text-foreground">{phase}</p>
        <span className="text-[10px] font-bold bg-primary/10 border border-primary/20 text-primary rounded-full px-2 py-0.5 whitespace-nowrap">{duration}</span>
      </div>
      <p className="text-xs text-primary font-medium">{focus}</p>
      <ul className="space-y-1">
        {actions.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <ArrowRight size={11} className="text-primary shrink-0 mt-0.5" />
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Goal options ───────────────────────────────────────────────────────────────
const GOAL_OPTIONS: { value: Goal; label: string; desc: string }[] = [
  { value: "sales",           label: "Sales",           desc: "Drive conversions" },
  { value: "leads",           label: "Leads",           desc: "Build your list" },
  { value: "brand_awareness", label: "Brand Awareness", desc: "Expand reach" },
  { value: "authority",       label: "Authority",       desc: "Own the niche" },
  { value: "engagement",      label: "Engagement",      desc: "Grow community" },
];

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ContentStrategyPage() {
  const [niche,    setNiche]    = useState("");
  const [product,  setProduct]  = useState("");
  const [audience, setAudience] = useState("");
  const [goal,     setGoal]     = useState<Goal>("sales");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<StrategyResult | null>(null);
  const { toast } = useToast();

  const { language, businessStage } = useVyronSettings();
  const canGenerate  = niche.trim().length > 0;
  const isEnterprise = resolveIsEnterprise(businessStage || "");
  const entLang: "es"|"en" = language === "Español" ? "es" : "en";
  const enterpriseStrategy: EnterpriseStrategy | null = (result && isEnterprise)
    ? buildEnterpriseStrategy(niche, goal, audience, entLang)
    : null;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/content-strategy/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche:    niche.trim(),
          product:  product.trim(),
          audience: audience.trim(),
          goal,
          language,
          businessStage,
        }),
      });
      if (!res.ok) throw new Error("Server error");
      setResult(await res.json());
    } catch {
      toast({ description: "Failed to generate strategy. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout title="Content Strategy">
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 size={22} className="text-primary" />
            Content Strategy AI
          </h2>
          <p className="text-muted-foreground text-sm">
            A full content strategy built around your goal, niche, and audience — not generic templates.
          </p>
        </div>

        <BusinessSettings />

        {/* Form */}
        <div className="glass border border-border rounded-xl p-4 md:p-6 space-y-5">

          <div className="space-y-2">
            <Label htmlFor="niche">Niche</Label>
            <Input
              id="niche"
              placeholder="e.g. fitness, personal finance, skincare…"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="bg-background/50 border-border focus-visible:ring-primary/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product">Product / Service</Label>
            <Input
              id="product"
              placeholder="e.g. online coaching, Notion template, SaaS app…"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="bg-background/50 border-border focus-visible:ring-primary/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="audience">Target Audience</Label>
            <Input
              id="audience"
              placeholder="e.g. busy moms, college students, small business owners…"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="bg-background/50 border-border focus-visible:ring-primary/50"
            />
          </div>

          {/* Goal selector */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Goal</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GOAL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setGoal(o.value)}
                  className={`flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-all ${
                    goal === o.value
                      ? "bg-primary/15 border-primary text-primary electric-glow"
                      : "bg-background/40 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <span className="text-xs font-bold">{o.label}</span>
                  <span className={`text-[11px] ${goal === o.value ? "text-primary/80" : "text-muted-foreground"}`}>{o.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || loading}
            className="w-full electric-glow font-semibold"
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin mr-2" />Generating Strategy…</>
              : <><Sparkles size={16} className="mr-2" />Generate Strategy</>
            }
          </Button>
        </div>

        {/* ── Results ──────────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">

            {/* ── 1. Content Mix ──────────────────────────────────────── */}
            <SectionHeader icon={<BarChart3 size={14} />} label="Recommended Content Mix" />
            <div className="glass border border-border rounded-xl p-4 space-y-3">
              {result.contentMix.map((item) => (
                <div key={item.type} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${HOOK_COLORS[item.type]}`}>
                      {HOOK_LABEL[item.type]}
                    </span>
                    <span className="text-sm font-bold text-foreground tabular-nums">{item.pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${MIX_BAR_COLOR[item.type]} opacity-70`}
                      style={{ width: `${item.pct}%`, transition: "width 0.6s ease" }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* ── 2. Weekly Schedule ──────────────────────────────────── */}
            <SectionHeader icon={<Calendar size={14} />} label="Weekly Strategy" />
            <div className="space-y-2">
              {result.weeklySchedule.map((d) => (
                <div
                  key={d.day}
                  className="glass border border-border rounded-xl px-4 py-3 flex items-start gap-3 hover:border-primary/20 transition-colors"
                >
                  <div className="shrink-0 w-24 pt-0.5">
                    <p className="text-sm font-bold text-foreground">{d.day}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{d.contentType}</p>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${HOOK_COLORS[d.hookType]}`}>
                      {HOOK_LABEL[d.hookType]}
                    </span>
                    <p className="text-xs text-foreground/70 leading-relaxed">{d.note}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── 3. Strategic Reasoning ──────────────────────────────── */}
            <SectionHeader icon={<Brain size={14} />} label="Strategic Reasoning" />
            <InsightCard
              icon={<TrendingUp size={14} />}
              label="Why This Mix Works"
              content={result.reasoning.whyMixWorks}
            />
            <InsightCard
              icon={<Users size={14} />}
              label="Audience Psychology"
              content={result.reasoning.audiencePsychology}
            />
            <InsightCard
              icon={<ChevronRight size={14} />}
              label="What Should Dominate"
              content={result.reasoning.contentDominant}
            />

            {/* ── 4. Posting Recommendation ───────────────────────────── */}
            <SectionHeader icon={<Clock size={14} />} label="Posting Recommendation" />
            <div className="glass border border-border rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {POSTING_OPTIONS.map((o) => {
                  const isRec = o.value === result.posting.recommended;
                  return (
                    <div
                      key={o.value}
                      className={`relative flex flex-col items-center justify-center rounded-lg border px-3 py-3 text-center transition-all ${
                        isRec
                          ? "border-primary bg-primary/10 electric-glow"
                          : "border-border bg-background/30 opacity-50"
                      }`}
                    >
                      {isRec && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wider whitespace-nowrap">
                          Recommended
                        </span>
                      )}
                      <p className={`text-sm font-bold mt-1 ${isRec ? "text-primary" : "text-foreground"}`}>{o.label}</p>
                      <p className="text-[11px] text-muted-foreground">{o.sublabel}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{result.posting.reason}</p>
            </div>

            {/* ── 5. CTA Recommendations ──────────────────────────────── */}
            <SectionHeader icon={<MessageSquare size={14} />} label="CTA Recommendations" />
            <CTACard
              label="Best CTA for This Niche"
              sublabel="Highest engagement for your specific audience"
              content={result.ctas.nicheSpecific}
            />
            <CTACard
              label="Best Lead Gen CTA"
              sublabel="Optimised for opt-ins and DM inquiries"
              content={result.ctas.leadGen}
            />
            <CTACard
              label="Best Sales CTA"
              sublabel="Optimised for link-in-bio clicks and conversions"
              content={result.ctas.sales}
            />

            {/* Regenerate */}
            <Button
              variant="outline"
              className="w-full border-border text-muted-foreground hover:text-foreground"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading
                ? <Loader2 size={14} className="animate-spin mr-2" />
                : <Zap size={14} className="mr-2" />
              }
              Regenerate Strategy
            </Button>

            {/* ── ENTERPRISE STRATEGIC LAYERS ───────────────────────────── */}
            {isEnterprise && enterpriseStrategy && (
              <div className="space-y-3 pt-2">

                {/* Enterprise badge */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                  <Building2 size={13} className="text-primary shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Enterprise Strategy Layers</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {niche.trim()} · {GOAL_OPTIONS.find(o => o.value === goal)?.label}
                      {audience.trim() && <> · {audience.trim()}</>}
                    </span>
                  </div>
                </div>

                {/* ── 1. Brand Positioning ───────────────────────────────── */}
                <SectionHeader icon={<Target size={14} />} label={entLang === "es" ? "Brand Positioning" : "Brand Positioning"} />
                <EntStratBlock
                  icon={<Crosshair size={13} />}
                  label={entLang === "es" ? "Positioning Statement" : "Positioning Statement"}
                  content={enterpriseStrategy.positioningStatement}
                />
                <EntStratBlock
                  icon={<MessageSquare size={13} />}
                  label={entLang === "es" ? "Unique Value Proposition" : "Unique Value Proposition"}
                  content={enterpriseStrategy.uvp}
                />
                <div className="grid grid-cols-1 gap-2">
                  {enterpriseStrategy.differentiationPillars.map((p, i) => (
                    <PillarCard key={i} title={p.title} description={p.description} />
                  ))}
                </div>
                <EntStratBlock
                  icon={<Users size={13} />}
                  label={entLang === "es" ? "Brand Voice" : "Brand Voice"}
                  content={enterpriseStrategy.brandVoice}
                />

                {/* ── 2. Multi-Channel Content Ecosystem ────────────────── */}
                <SectionHeader icon={<Globe size={14} />} label={entLang === "es" ? "Multi-Channel Content Ecosystem" : "Multi-Channel Content Ecosystem"} />
                <div className="space-y-2">
                  {enterpriseStrategy.channels.map((ch, i) => (
                    <ChannelCard key={i} {...ch} />
                  ))}
                </div>

                {/* ── 3. TOFU / MOFU / BOFU Funnel Strategy ─────────────── */}
                <SectionHeader icon={<Layers size={14} />} label={entLang === "es" ? "TOFU / MOFU / BOFU Funnel Strategy" : "TOFU / MOFU / BOFU Funnel Strategy"} />
                <div className="space-y-2">
                  {enterpriseStrategy.funnel.map((f, i) => (
                    <FunnelRow key={i} {...f} />
                  ))}
                </div>

                {/* ── 4. Authority Assets Roadmap ───────────────────────── */}
                <SectionHeader icon={<BookOpen size={14} />} label={entLang === "es" ? "Authority Assets Roadmap" : "Authority Assets Roadmap"} />
                <div className="space-y-2">
                  {enterpriseStrategy.authorityAssets.map((a, i) => (
                    <AssetRow key={i} {...a} />
                  ))}
                </div>

                {/* ── 5. Market Dominance Plan ──────────────────────────── */}
                <SectionHeader icon={<Flag size={14} />} label={entLang === "es" ? "Market Dominance Plan" : "Market Dominance Plan"} />
                <EntStratBlock
                  icon={<Crosshair size={13} />}
                  label={entLang === "es" ? "Market Gap" : "Market Gap"}
                  content={enterpriseStrategy.dominancePlan.marketGap}
                />
                <EntStratBlock
                  icon={<Award size={13} />}
                  label={entLang === "es" ? "Differentiation Angle" : "Differentiation Angle"}
                  content={enterpriseStrategy.dominancePlan.differentiationAngle}
                />
                <div className="space-y-2">
                  {enterpriseStrategy.dominancePlan.phases.map((ph, i) => (
                    <PhaseCard key={i} {...ph} />
                  ))}
                </div>
                <div className="glass border border-border rounded-xl p-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">
                    {entLang === "es" ? "KPIs to Own — 90 días" : "KPIs to Own — 90 days"}
                  </p>
                  <ul className="space-y-1.5">
                    {enterpriseStrategy.dominancePlan.kpisToOwn.map((kpi, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                        <TrendingUp size={11} className="text-green-400 shrink-0 mt-0.5" />
                        {kpi}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
