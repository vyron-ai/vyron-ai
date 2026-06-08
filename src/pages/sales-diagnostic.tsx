import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVyronSettings } from "@/contexts/settings-context";
import { BusinessSettings } from "@/components/business-settings";
import {
  Activity, TrendingDown, TrendingUp, AlertTriangle, AlertCircle,
  DollarSign, Users, Target, Zap, ArrowRight, BarChart3,
  ShieldAlert, CheckCircle2, CircleDot, Lightbulb, Clock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type TrafficSource = "Facebook" | "Instagram" | "TikTok" | "Google" | "Referidos" | "WhatsApp" | "Mixto";
type ResponseTime  = "menos5min" | "menos1h" | "menos24h" | "mas24h";
type FollowUp      = "ninguno" | "manual" | "crmBasico" | "crmAvanzado";
type YesNo         = "si" | "no";

interface Bottleneck {
  rank:        1 | 2 | 3;
  label:       string;
  description: string;
  impact:      number;
  severity:    "critical" | "high" | "medium" | "low";
}

interface DiagnosticResult {
  score:       number;
  scoreLabel:  string;
  scoreColor:  string;
  bottlenecks: Bottleneck[];
  actions:     { priority: number; title: string; text: string }[];
  opportunity: string;
  convRate:    number;
  lostSales:   number;
  potentialRevenue: number;
}

// ── Pill selector ──────────────────────────────────────────────────────────────
function PillSelector<T extends string>({
  options, value, onChange,
}: {
  options:  { value: T; label: string }[];
  value:    T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            value === o.value
              ? "bg-primary text-primary-foreground border-primary electric-glow"
              : "bg-background/40 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
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

// ── Severity config ─────────────────────────────────────────────────────────────
const SEV: Record<string, { border: string; bg: string; text: string; badge: string; icon: React.ReactNode }> = {
  critical: {
    border: "border-red-500/40",
    bg:     "bg-red-500/5",
    text:   "text-red-400",
    badge:  "bg-red-500/15 text-red-400 border-red-500/30",
    icon:   <AlertCircle size={14} className="text-red-400 shrink-0" />,
  },
  high: {
    border: "border-orange-500/40",
    bg:     "bg-orange-500/5",
    text:   "text-orange-400",
    badge:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
    icon:   <ShieldAlert size={14} className="text-orange-400 shrink-0" />,
  },
  medium: {
    border: "border-amber-500/40",
    bg:     "bg-amber-500/5",
    text:   "text-amber-400",
    badge:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon:   <AlertTriangle size={14} className="text-amber-400 shrink-0" />,
  },
  low: {
    border: "border-green-500/40",
    bg:     "bg-green-500/5",
    text:   "text-green-400",
    badge:  "bg-green-500/15 text-green-400 border-green-500/30",
    icon:   <CheckCircle2 size={14} className="text-green-400 shrink-0" />,
  },
};

// ── Score arc component ────────────────────────────────────────────────────────
function ScoreGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const radius = 54;
  const circumference = Math.PI * radius;
  const filled = (score / 100) * circumference;
  const arcColor =
    score >= 80 ? "#22c55e" :
    score >= 60 ? "#6366f1" :
    score >= 40 ? "#f59e0b" :
                  "#ef4444";

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="140" height="80" viewBox="0 0 140 80">
        <path
          d="M 14 76 A 56 56 0 0 1 126 76"
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12" strokeLinecap="round"
        />
        <path
          d="M 14 76 A 56 56 0 0 1 126 76"
          fill="none"
          stroke={arcColor}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 6px ${arcColor})`, transition: "stroke-dasharray 1s ease" }}
        />
        <text x="70" y="68" textAnchor="middle" fontSize="26" fontWeight="800" fill={arcColor}>{score}</text>
      </svg>
      <div className="text-center space-y-0.5">
        <p className={`text-sm font-bold ${color}`}>{label}</p>
        <p className="text-xs text-muted-foreground">Sales Health Score</p>
      </div>
    </div>
  );
}

// ── Diagnostic engine ─────────────────────────────────────────────────────────
function runDiagnostic(
  niche: string,
  product: string,
  precioPromedio: number,
  leads: number,
  ventas: number,
  trafico: TrafficSource,
  respuesta: ResponseTime,
  seguimiento: FollowUp,
  contenido: YesNo,
  oferta: YesNo,
): DiagnosticResult {
  const convRate   = leads > 0 ? (ventas / leads) * 100 : 0;
  const lostSales  = Math.max(0, leads - ventas);
  const ingresos   = ventas * precioPromedio;

  // ── Penalty table ──────────────────────────────────────────────────────────
  type BotCandidate = {
    id:          string;
    label:       string;
    description: string;
    impact:      number;
    severity:    "critical" | "high" | "medium" | "low";
    penaltyPts:  number;
    action:      string;
  };

  const candidates: BotCandidate[] = [];

  // 1. Tasa de conversión
  if (convRate < 5) {
    candidates.push({
      id: "conv",
      label: "Tasa de cierre crítica",
      description: `Solo ${convRate.toFixed(1)}% de tus leads se convierten en clientes. El estándar de mercado es 15–25%. Esto indica una brecha grave en calificación, presentación de oferta o proceso de venta.`,
      impact: -28,
      severity: "critical",
      penaltyPts: 28,
      action: `Implementa un script de calificación de 3 preguntas antes de cualquier conversación. Revisa la presentación de ${product || "tu oferta"} y agrega prueba social específica al nicho ${niche || "de tu negocio"}.`,
    });
  } else if (convRate < 10) {
    candidates.push({
      id: "conv",
      label: "Tasa de cierre deficiente",
      description: `${convRate.toFixed(1)}% de conversión está por debajo del mínimo competitivo (15%). Probablemente tus leads no están suficientemente calificados o la oferta no está clara en el momento de la venta.`,
      impact: -18,
      severity: "high",
      penaltyPts: 18,
      action: `Agrega una etapa de pre-calificación con 3 criterios clave antes de presentar ${product || "tu servicio"}. Usa testimonios y resultados concretos de clientes anteriores.`,
    });
  } else if (convRate < 20) {
    candidates.push({
      id: "conv",
      label: "Tasa de cierre mejorable",
      description: `${convRate.toFixed(1)}% de conversión está por debajo del benchmark (25%). Hay margen significativo de mejora en la calidad del lead o en el proceso de cierre.`,
      impact: -10,
      severity: "medium",
      penaltyPts: 10,
      action: `Refina el mensaje de cierre y agrega una garantía o elemento de riesgo cero para aumentar la confianza en el momento de decisión.`,
    });
  }

  // 2. Tiempo de respuesta
  if (respuesta === "mas24h") {
    candidates.push({
      id: "respuesta",
      label: "Velocidad de respuesta crítica",
      description: `Responder en más de 24 horas es devastador para la conversión. Los estudios muestran una caída de 9× cuando el tiempo supera los 5 minutos. A tu ritmo actual, estás perdiendo la mayoría de leads antes de iniciar la conversación.`,
      impact: -30,
      severity: "critical",
      penaltyPts: 25,
      action: `Implementa respuesta automática por WhatsApp o email en menos de 5 minutos (bot o plantilla). Establece horario de atención visible. Considera asignar a alguien exclusivo para primera respuesta.`,
    });
  } else if (respuesta === "menos24h") {
    candidates.push({
      id: "respuesta",
      label: "Respuesta lenta a leads",
      description: `Responder en menos de 24 horas te pone en desventaja. Los leads que no reciben respuesta en la primera hora tienen 60% menos probabilidad de convertir. Tu pipeline está perdiendo oportunidades por velocidad.`,
      impact: -22,
      severity: "high",
      penaltyPts: 18,
      action: `Configura respuesta automática en menos de 1 hora con plantilla de WhatsApp. Crea una secuencia de bienvenida inmediata que caliente el lead mientras preparas la respuesta personalizada.`,
    });
  } else if (respuesta === "menos1h") {
    candidates.push({
      id: "respuesta",
      label: "Velocidad de respuesta mejorable",
      description: `Menos de 1 hora es aceptable, pero el estándar de alto rendimiento es menos de 5 minutos. Una reducción en el tiempo de respuesta podría mejorar tu tasa de conversión entre 15% y 30%.`,
      impact: -8,
      severity: "medium",
      penaltyPts: 8,
      action: `Automatiza la primera respuesta con un mensaje de valor inmediato que mantenga el interés del lead mientras preparas la respuesta personalizada.`,
    });
  }

  // 3. Sistema de seguimiento
  if (seguimiento === "ninguno") {
    candidates.push({
      id: "seguimiento",
      label: "Sin sistema de seguimiento",
      description: `Sin un sistema de seguimiento, el 80% de tus leads que no convierten en el primer contacto se pierden para siempre. El 80% de las ventas ocurren entre el 5° y 12° contacto — sin sistema, no llegas a ese punto.`,
      impact: -22,
      severity: "critical",
      penaltyPts: 22,
      action: `Implementa una secuencia básica de 5 pasos: Día 1 (primer contacto), Día 3 (seguimiento con valor), Día 7 (caso de éxito), Día 14 (oferta especial), Día 30 (reactivación). Usa WhatsApp o email según tu canal principal.`,
    });
  } else if (seguimiento === "manual") {
    candidates.push({
      id: "seguimiento",
      label: "Seguimiento manual sin estructura",
      description: `El seguimiento manual sin sistema genera inconsistencia. Inevitablemente pierdes leads en el proceso porque depende de la memoria o del tiempo disponible, no de un sistema automático.`,
      impact: -14,
      severity: "medium",
      penaltyPts: 12,
      action: `Migra de seguimiento manual a un CRM básico (HubSpot Free, Notion CRM o similar). Establece recordatorios automáticos y plantillas de mensaje para cada etapa del proceso.`,
    });
  } else if (seguimiento === "crmBasico") {
    candidates.push({
      id: "seguimiento",
      label: "CRM básico sin automatización",
      description: `Tienes CRM básico, lo que es positivo, pero sin automatización el potencial está limitado. La mayoría de los seguimientos siguen dependiendo de acción manual, lo que genera inconsistencia a escala.`,
      impact: -6,
      severity: "low",
      penaltyPts: 5,
      action: `Agrega automatizaciones básicas a tu CRM: secuencia de bienvenida automática, recordatorio de seguimiento y notificación cuando un lead no ha tenido contacto en 7 días.`,
    });
  }

  // 4. Sin oferta clara
  if (oferta === "no") {
    candidates.push({
      id: "oferta",
      label: "Oferta sin claridad",
      description: `Una oferta poco clara hace que el cliente no entienda qué está comprando, qué resultado obtendrá ni por qué elegirte a ti. Esto solo puede significar una cosa: tasas de conversión bajas sin importar la calidad del lead.`,
      impact: -16,
      severity: "high",
      penaltyPts: 15,
      action: `Define tu oferta en una sola oración: "Ayudo a [audiencia] a lograr [resultado específico] en [tiempo] sin [obstáculo principal]." Luego estructura el precio, el entregable y la garantía de forma visible en todos los puntos de contacto.`,
    });
  }

  // 5. Sin contenido constante
  if (contenido === "no") {
    candidates.push({
      id: "contenido",
      label: "Ausencia de contenido constante",
      description: `Sin contenido constante, tus leads fríos no tienen forma de calentarse antes de la conversación de venta. Esto aumenta la fricción en el cierre y eleva el costo de adquisición de cada cliente.`,
      impact: -12,
      severity: "medium",
      penaltyPts: 10,
      action: `Publica mínimo 3 piezas de contenido por semana que eduquen, generen confianza y muestren resultados. Usa el Content Planner de VYRON para generar un calendario estratégico de 30 días.`,
    });
  }

  // 6. Tráfico concentrado
  if (trafico !== "Mixto") {
    const singleChannelImpact =
      trafico === "TikTok" || trafico === "WhatsApp" ? -10 :
      trafico === "Facebook" || trafico === "Instagram" ? -8 : -5;
    const singleChannelSeverity =
      Math.abs(singleChannelImpact) >= 10 ? "medium" : "low";
    candidates.push({
      id: "trafico",
      label: `Dependencia de canal único (${trafico})`,
      description: `Depender de una sola fuente de tráfico te hace vulnerable. Si ${trafico} cambia su algoritmo, sube sus costos o baja el alcance, tu negocio pierde su principal fuente de leads de forma inmediata.`,
      impact: singleChannelImpact,
      severity: singleChannelSeverity,
      penaltyPts: Math.abs(singleChannelImpact),
      action: `Agrega al menos un segundo canal de adquisición. Si tu canal principal es orgánico, complementa con WhatsApp o email marketing. Si es pagado, agrega un componente de referidos o contenido orgánico.`,
    });
  }

  // ── Sort by penaltyPts descending ─────────────────────────────────────────
  const sorted = [...candidates].sort((a, b) => b.penaltyPts - a.penaltyPts);
  const top3   = sorted.slice(0, 3);

  const bottlenecks: Bottleneck[] = top3.map((b, i) => ({
    rank:        (i + 1) as 1 | 2 | 3,
    label:       b.label,
    description: b.description,
    impact:      b.impact,
    severity:    b.severity,
  }));

  // ── Health Score ────────────────────────────────────────────────────────────
  const totalPenalty = sorted.reduce((acc, c) => acc + c.penaltyPts, 0);
  const rawScore     = Math.max(0, Math.min(100, 100 - totalPenalty));
  const score        = Math.round(rawScore);

  const scoreLabel =
    score >= 80 ? "Negocio Saludable" :
    score >= 60 ? "Funcionando con Brechas" :
    score >= 40 ? "Proceso con Problemas Graves" :
                  "Sistema en Crisis";
  const scoreColor =
    score >= 80 ? "text-green-400" :
    score >= 60 ? "text-primary" :
    score >= 40 ? "text-amber-400" :
                  "text-red-400";

  // ── Action Plan ─────────────────────────────────────────────────────────────
  const actions = top3.map((b, i) => ({
    priority: i + 1,
    title:    b.label,
    text:     b.action,
  }));

  // ── Growth Opportunity ──────────────────────────────────────────────────────
  const maxImpact = Math.abs(top3.reduce((acc, b) => acc + b.impact, 0));
  const minRecovery = Math.round(maxImpact * 0.4);
  const maxRecovery = Math.round(maxImpact * 0.85);
  const potentialRevenue = Math.round(ingresos * (maxRecovery / 100));

  const opportunity =
    top3.length === 0
      ? `Tu negocio está funcionando a un nivel de alto rendimiento. El siguiente paso es escalar el volumen de leads manteniendo el proceso actual.`
      : `Corrigiendo los ${top3.length} cuellos de botella detectados, tu negocio podría recuperar entre ${minRecovery}% y ${maxRecovery}% de ingresos potenciales que actualmente se están perdiendo en el proceso${potentialRevenue > 0 ? ` — un potencial de +$${potentialRevenue.toLocaleString()} adicionales por mes` : ""}.`;

  return {
    score,
    scoreLabel,
    scoreColor,
    bottlenecks,
    actions,
    opportunity,
    convRate,
    lostSales,
    potentialRevenue,
  };
}

// ── Option constants ───────────────────────────────────────────────────────────
const TRAFFIC_OPTIONS: { value: TrafficSource; label: string }[] = [
  { value: "Facebook",  label: "Facebook" },
  { value: "Instagram", label: "Instagram" },
  { value: "TikTok",    label: "TikTok" },
  { value: "Google",    label: "Google" },
  { value: "Referidos", label: "Referidos" },
  { value: "WhatsApp",  label: "WhatsApp" },
  { value: "Mixto",     label: "Mixto" },
];

const RESPONSE_OPTIONS: { value: ResponseTime; label: string }[] = [
  { value: "menos5min", label: "Menos de 5 min" },
  { value: "menos1h",   label: "Menos de 1 hora" },
  { value: "menos24h",  label: "Menos de 24 horas" },
  { value: "mas24h",    label: "Más de 24 horas" },
];

const FOLLOWUP_OPTIONS: { value: FollowUp; label: string }[] = [
  { value: "ninguno",     label: "Ninguno" },
  { value: "manual",      label: "Manual" },
  { value: "crmBasico",   label: "CRM Básico" },
  { value: "crmAvanzado", label: "CRM Avanzado" },
];

const YESNO_OPTIONS: { value: YesNo; label: string }[] = [
  { value: "si", label: "Sí" },
  { value: "no", label: "No" },
];

const RANK_LABEL: Record<number, string> = {
  1: "Cuello de Botella Principal",
  2: "Cuello de Botella Secundario",
  3: "Cuello de Botella Terciario",
};

const RANK_ICON: Record<number, React.ReactNode> = {
  1: <CircleDot size={14} className="text-red-400" />,
  2: <CircleDot size={14} className="text-orange-400" />,
  3: <CircleDot size={14} className="text-amber-400" />,
};

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SalesDiagnosticPage() {
  const { language } = useVyronSettings();

  const [niche,      setNiche]      = useState("");
  const [product,    setProduct]    = useState("");
  const [precio,     setPrecio]     = useState("");
  const [leads,      setLeads]      = useState("");
  const [ventas,     setVentas]     = useState("");
  const [trafico,    setTrafico]    = useState<TrafficSource>("Instagram");
  const [respuesta,  setRespuesta]  = useState<ResponseTime>("menos1h");
  const [seguimiento, setSeguimiento] = useState<FollowUp>("manual");
  const [contenido,  setContenido]  = useState<YesNo>("no");
  const [oferta,     setOferta]     = useState<YesNo>("no");
  const [result,     setResult]     = useState<DiagnosticResult | null>(null);

  const leadsNum  = parseFloat(leads)  || 0;
  const ventasNum = parseFloat(ventas) || 0;
  const precioNum = parseFloat(precio) || 0;

  const ventasExcedeLeads = leads.trim() !== "" && ventas.trim() !== "" && ventasNum > leadsNum;
  const canDiagnose =
    niche.trim()   !== "" &&
    precio.trim()  !== "" && precioNum > 0 &&
    leads.trim()   !== "" && leadsNum  > 0 &&
    ventas.trim()  !== "" && ventasNum >= 0 &&
    !ventasExcedeLeads;

  const handleDiagnose = () => {
    if (!canDiagnose) return;
    setResult(runDiagnostic(
      niche, product, precioNum, leadsNum, ventasNum,
      trafico, respuesta, seguimiento, contenido, oferta,
    ));
    setTimeout(() => {
      document.getElementById("diag-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  return (
    <AppLayout title="Sales Diagnostic">
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity size={22} className="text-primary" />
            Sales Diagnostic AI
          </h2>
          <p className="text-muted-foreground text-sm">
            Ingresa los datos de tu negocio y obtén un diagnóstico completo de cuellos de botella, impacto estimado y plan de acción priorizado.
          </p>
        </div>

        <BusinessSettings />

        {/* Form */}
        <div className="glass border border-border rounded-xl p-4 md:p-6 space-y-5">

          {/* Niche */}
          <div className="space-y-2">
            <Label htmlFor="niche">Nicho</Label>
            <Input
              id="niche"
              placeholder="ej. Barbería, Consultoría, Fitness…"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="bg-background/50 border-border focus-visible:ring-primary/50"
            />
          </div>

          {/* Product */}
          <div className="space-y-2">
            <Label htmlFor="product">Producto o Servicio</Label>
            <Input
              id="product"
              placeholder="ej. Corte premium, Coaching 1:1, Membresía…"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="bg-background/50 border-border focus-visible:ring-primary/50"
            />
          </div>

          {/* Precio */}
          <div className="space-y-2">
            <Label htmlFor="precio">Precio Promedio ($)</Label>
            <Input
              id="precio"
              type="number"
              min="1"
              placeholder="ej. 150"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className="bg-background/50 border-border focus-visible:ring-primary/50"
            />
          </div>

          {/* Leads / Ventas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="leads">Leads por mes</Label>
              <Input
                id="leads"
                type="number"
                min="1"
                placeholder="ej. 80"
                value={leads}
                onChange={(e) => setLeads(e.target.value)}
                className="bg-background/50 border-border focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ventas" className={ventasExcedeLeads ? "text-red-400" : ""}>
                Ventas por mes
              </Label>
              <Input
                id="ventas"
                type="number"
                min="0"
                placeholder="ej. 12"
                value={ventas}
                onChange={(e) => setVentas(e.target.value)}
                className={
                  ventasExcedeLeads
                    ? "bg-red-500/10 border-red-500 focus-visible:ring-red-500/50 text-red-400"
                    : "bg-background/50 border-border focus-visible:ring-primary/50"
                }
              />
              {ventasExcedeLeads && (
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
                  <AlertTriangle size={11} />
                  Las ventas no pueden superar los leads.
                </div>
              )}
            </div>
          </div>

          {/* Traffic source */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Fuente principal de tráfico</Label>
            <PillSelector options={TRAFFIC_OPTIONS} value={trafico} onChange={setTrafico} />
          </div>

          {/* Response time */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Tiempo promedio de respuesta</Label>
            <PillSelector options={RESPONSE_OPTIONS} value={respuesta} onChange={setRespuesta} />
          </div>

          {/* Follow-up system */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Sistema de seguimiento</Label>
            <PillSelector options={FOLLOWUP_OPTIONS} value={seguimiento} onChange={setSeguimiento} />
          </div>

          {/* Content + Offer */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Contenido constante</Label>
              <PillSelector options={YESNO_OPTIONS} value={contenido} onChange={setContenido} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Oferta clara</Label>
              <PillSelector options={YESNO_OPTIONS} value={oferta} onChange={setOferta} />
            </div>
          </div>

          <Button
            onClick={handleDiagnose}
            disabled={!canDiagnose}
            className="w-full electric-glow font-semibold"
          >
            <Activity size={16} className="mr-2" />
            Diagnosticar Negocio
          </Button>
        </div>

        {/* ── Results ───────────────────────────────────────────────────────── */}
        {result && (
          <div id="diag-results" className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">

            {/* ── Sales Health Score ───────────────────────────────────── */}
            <SectionHeader icon={<BarChart3 size={14} />} label="Sales Health Score" />
            <div className="glass border border-border rounded-xl p-5 flex flex-col items-center gap-2">
              <ScoreGauge score={result.score} label={result.scoreLabel} color={result.scoreColor} />

              {/* Score bar */}
              <div className="w-full max-w-xs space-y-1.5 mt-1">
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${result.score}%`,
                      background: result.score >= 80 ? "#22c55e" : result.score >= 60 ? "#6366f1" : result.score >= 40 ? "#f59e0b" : "#ef4444",
                      boxShadow: `0 0 8px ${result.score >= 80 ? "#22c55e" : result.score >= 60 ? "#6366f1" : result.score >= 40 ? "#f59e0b" : "#ef4444"}`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0 — Crisis</span>
                  <span>100 — Óptimo</span>
                </div>
              </div>

              {/* Key metrics row */}
              <div className="w-full grid grid-cols-3 gap-2 mt-3">
                <div className="rounded-lg bg-white/5 border border-border p-3 text-center space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Conversión</p>
                  <p className={`text-lg font-bold ${result.convRate >= 20 ? "text-green-400" : result.convRate >= 10 ? "text-amber-400" : "text-red-400"}`}>
                    {result.convRate.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 border border-border p-3 text-center space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Leads Perdidos</p>
                  <p className="text-lg font-bold text-red-400">{result.lostSales}</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-border p-3 text-center space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Cuellos</p>
                  <p className="text-lg font-bold text-amber-400">{result.bottlenecks.length}</p>
                </div>
              </div>
            </div>

            {/* ── Bottlenecks ───────────────────────────────────────────── */}
            {result.bottlenecks.length > 0 && (
              <>
                <SectionHeader icon={<TrendingDown size={14} />} label="Cuellos de Botella Detectados" />
                <div className="space-y-3">
                  {result.bottlenecks.map((b) => {
                    const s = SEV[b.severity];
                    return (
                      <div key={b.rank} className={`glass border ${s.border} ${s.bg} rounded-xl p-4 space-y-3`}>
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {RANK_ICON[b.rank]}
                            <div>
                              <p className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}>
                                {RANK_LABEL[b.rank]}
                              </p>
                              <p className="text-sm font-bold text-foreground leading-snug mt-0.5">{b.label}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${s.badge}`}>
                            {b.severity === "critical" ? "Crítico" : b.severity === "high" ? "Alto" : b.severity === "medium" ? "Medio" : "Bajo"}
                          </span>
                        </div>
                        {/* Description */}
                        <p className="text-xs text-foreground/80 leading-relaxed">{b.description}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── Impacto Estimado ──────────────────────────────────────── */}
            {result.bottlenecks.length > 0 && (
              <>
                <SectionHeader icon={<DollarSign size={14} />} label="Impacto Estimado en Conversión" />
                <div className="glass border border-border rounded-xl p-4 space-y-3">
                  {result.bottlenecks.map((b) => (
                    <div key={b.rank} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground/80 font-medium">{b.label}</span>
                        <span className="font-bold text-red-400">{b.impact}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-500/60"
                          style={{ width: `${Math.min(Math.abs(b.impact), 100)}%`, transition: "width 0.7s ease" }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground pt-1">
                    * Impacto estimado en tasa de conversión relativa al estado actual del negocio.
                  </p>
                </div>
              </>
            )}

            {/* ── Plan de Acción ────────────────────────────────────────── */}
            {result.actions.length > 0 && (
              <>
                <SectionHeader icon={<Target size={14} />} label="Plan de Acción" />
                <div className="space-y-3">
                  {result.actions.map((a) => (
                    <div key={a.priority} className="glass border border-primary/25 rounded-xl p-4 space-y-2 bg-primary/5">
                      <div className="flex items-center gap-2">
                        <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                          <span className="text-[11px] font-bold text-primary">{a.priority}</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Prioridad #{a.priority}</p>
                          <p className="text-sm font-bold text-foreground leading-snug">{a.title}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 pl-8">
                        <ArrowRight size={12} className="text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-foreground/80 leading-relaxed">{a.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Oportunidad de Crecimiento ─────────────────────────────── */}
            <SectionHeader icon={<TrendingUp size={14} />} label="Oportunidad de Crecimiento" />
            <div className="glass border border-green-500/30 bg-green-500/5 rounded-xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <Lightbulb size={18} className="text-green-400 shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/90 leading-relaxed font-medium">{result.opportunity}</p>
              </div>
              {result.potentialRevenue > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
                  <DollarSign size={14} className="text-green-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Potencial recuperable / mes</p>
                    <p className="text-xl font-bold text-green-400">+${result.potentialRevenue.toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── No bottlenecks state ──────────────────────────────────── */}
            {result.bottlenecks.length === 0 && (
              <div className="glass border border-green-500/30 bg-green-500/5 rounded-xl p-5 flex items-start gap-3">
                <CheckCircle2 size={20} className="text-green-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-green-400">Proceso de ventas optimizado</p>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    Tu negocio tiene un proceso de ventas sólido. El siguiente paso de alto impacto es escalar el volumen de leads manteniendo los sistemas actuales.
                  </p>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </AppLayout>
  );
}
