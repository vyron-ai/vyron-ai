import { useState } from "react";
import { useVyronSettings } from "@/contexts/settings-context";
import { BusinessSettings } from "@/components/business-settings";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Activity, TrendingDown, TrendingUp, AlertTriangle,
  DollarSign, Users, Target, Zap, Copy, Check,
  Clock, ArrowRight, BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function fmtCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${fmt(n, 0)}`;
}
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ description: "Copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch { toast({ description: "Copy failed", variant: "destructive" }); }
  };
  return (
    <button onClick={handle} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0">
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );
}

// ── Metric card ────────────────────────────────────────────────────────────────
function MetricCard({
  icon, label, value, sub, accent = "default",
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  accent?: "default" | "danger" | "warning" | "success" | "primary";
}) {
  const accents = {
    default: "border-border",
    danger:  "border-red-500/40 bg-red-500/5",
    warning: "border-amber-500/40 bg-amber-500/5",
    success: "border-green-500/40 bg-green-500/5",
    primary: "border-primary/40 bg-primary/5",
  };
  const textAccents = {
    default: "text-foreground",
    danger:  "text-red-400",
    warning: "text-amber-400",
    success: "text-green-400",
    primary: "text-primary",
  };
  return (
    <div className={`glass rounded-xl p-4 border ${accents[accent]} space-y-2`}>
      <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${accent === "default" ? "text-muted-foreground" : textAccents[accent]}`}>
        {icon}
        {label}
      </div>
      <p className={`text-2xl font-bold ${textAccents[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
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

// ── Priority badge ─────────────────────────────────────────────────────────────
const PRIORITY_STYLE: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
  High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Medium:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Low:      "bg-green-500/15 text-green-400 border-green-500/30",
};

interface Recommendation { priority: string; title: string; text: string }

// ── Response time options ──────────────────────────────────────────────────────
const RESPONSE_OPTIONS = [
  { label: "Under 5 minutes",  value: "0.083" },
  { label: "5–30 minutes",     value: "0.25"  },
  { label: "30 min – 1 hour",  value: "0.75"  },
  { label: "1–3 hours",        value: "2"     },
  { label: "3–12 hours",       value: "7"     },
  { label: "12–24 hours",      value: "18"    },
  { label: "Over 24 hours",    value: "36"    },
];

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SalesDiagnosticPage() {
  const { language, businessStage } = useVyronSettings();
  const t = (es: string, en: string) => language === "Español" ? es : en;

  const [businessName,   setBusinessName]   = useState("");
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [monthlyLeads,   setMonthlyLeads]   = useState("");
  const [closedClients,  setClosedClients]  = useState("");
  const [responseTime,   setResponseTime]   = useState("2");
  const [diagnosed,      setDiagnosed]      = useState(false);

  const revVal     = parseFloat(monthlyRevenue);
  const leadsVal   = parseFloat(monthlyLeads);
  const closedVal  = parseFloat(closedClients);

  const closedExceedsLeads =
    closedClients.trim() !== "" &&
    monthlyLeads.trim()  !== "" &&
    !isNaN(closedVal) && !isNaN(leadsVal) &&
    closedVal > leadsVal;

  const canDiagnose =
    monthlyRevenue.trim() !== "" &&
    monthlyLeads.trim()   !== "" &&
    closedClients.trim()  !== "" &&
    !isNaN(revVal)   && revVal   >= 0 &&
    !isNaN(leadsVal) && leadsVal  > 0 &&
    !isNaN(closedVal) && closedVal >= 0 &&
    !closedExceedsLeads;

  // ── Core calculations ────────────────────────────────────────────────────────
  const revenue     = Math.max(0, parseFloat(monthlyRevenue)  || 0);
  const leads       = Math.max(1, parseFloat(monthlyLeads)    || 1);
  const closed      = Math.max(0, parseFloat(closedClients)   || 0);
  const rtHours     = parseFloat(responseTime) || 2;

  const safeLeads  = Math.max(leads,  1);
  const safeClosed = Math.min(closed, leads);

  const closeRate          = (safeClosed / safeLeads) * 100;
  const lostLeads          = safeLeads - safeClosed;
  const avgClientValue     = safeClosed > 0 ? revenue / safeClosed : revenue;
  const revenueLostMonthly = lostLeads * avgClientValue;
  const annualOpptyCost    = revenueLostMonthly * 12;

  // Response time penalty on effective close rate
  const rtPenalty =
    rtHours <= 0.083  ? 1.0  : // <5 min — optimal
    rtHours <= 0.25   ? 0.95 :
    rtHours <= 0.75   ? 0.85 :
    rtHours <= 2      ? 0.72 :
    rtHours <= 7      ? 0.55 :
    rtHours <= 18     ? 0.38 :
                        0.22;  // >24h

  // Optimised scenario — 50% close rate improvement, capped at 60%
  const benchmarkRate     = 25;
  const optimisedCloseRate = Math.min(Math.max(closeRate / rtPenalty * 1.35, benchmarkRate), 60);
  const optimisedClosed    = Math.round((optimisedCloseRate / 100) * safeLeads);
  const additionalMonthly  = Math.max(0, (optimisedClosed - safeClosed) * avgClientValue);
  const additionalAnnual   = additionalMonthly * 12;
  const optimisedRevenue   = revenue + additionalMonthly;

  // ── AI Recommendations ────────────────────────────────────────────────────────
  const recommendations: Recommendation[] = [];

  if (rtHours > 0.75) {
    const recoverable = fmtCurrency(lostLeads * 0.15 * avgClientValue);
    const rtLabel = RESPONSE_OPTIONS.find(o => o.value === responseTime)?.label?.toLowerCase() ?? `${rtHours}h`;
    recommendations.push({
      priority: t(rtHours > 7 ? "Crítico" : "Alto", rtHours > 7 ? "Critical" : "High"),
      title: t(
        "La Velocidad de Respuesta Está Destruyendo Tu Pipeline",
        "Speed-to-Lead is Killing Your Pipeline",
      ),
      text: t(
        `Responder en ${rtLabel} te pone en una desventaja seria de conversión. Las investigaciones muestran consistentemente una caída de 9× en la conversión cuando el tiempo de respuesta supera los 5 minutos. Con tu volumen actual de ${fmt(safeLeads)} leads/mes, reducir el tiempo de respuesta a menos de 30 minutos podría recuperar de manera realista hasta ${recoverable}/mes en ingresos perdidos.`,
        `Responding in ${rtLabel} puts you at a serious conversion disadvantage. Research consistently shows a 9× drop in lead conversion when response time exceeds 5 minutes. At your current lead volume of ${fmt(safeLeads)}/month, reducing response time to under 30 minutes could realistically recover up to ${recoverable}/month in lost revenue.`,
      ),
    });
  }

  if (closeRate < 15) {
    recommendations.push({
      priority: t(closeRate < 8 ? "Crítico" : "Alto", closeRate < 8 ? "Critical" : "High"),
      title: t(
        "Tasa de Cierre Bajo Mínimo — Posible Brecha de Calificación",
        "Close Rate Is Below Baseline — Qualification Gap Likely",
      ),
      text: t(
        `Una tasa de cierre de ${fmtPct(closeRate)} indica que prospectos no calificados están llegando a tus conversaciones de venta. Implementar un paso de 3 preguntas de pre-calificación antes de cualquier llamada agendada típicamente eleva las tasas de cierre en 8–15 puntos porcentuales. Aplicado a tu pipeline actual de ${fmt(safeLeads)} leads mensuales, eso representa ${fmtCurrency(safeLeads * 0.1 * avgClientValue)} en ingresos mensuales adicionales del mismo volumen de leads.`,
        `A ${fmtPct(closeRate)} close rate signals that unqualified leads are reaching your sales conversations. Implementing a 3-question pre-qualification step before any scheduled call typically raises close rates by 8–15 percentage points. Applied to your current pipeline of ${fmt(safeLeads)} monthly leads, that's ${fmtCurrency(safeLeads * 0.1 * avgClientValue)} in additional monthly revenue from the same lead volume.`,
      ),
    });
  }

  if (lostLeads > safeLeads * 0.6) {
    recommendations.push({
      priority: t("Alto", "High"),
      title: t(
        "Sin Sistema de Seguimiento = Dejando Dinero Sobre la Mesa",
        "No Follow-Up System = Leaving Money on the Table",
      ),
      text: t(
        `Estás perdiendo ${fmt(lostLeads)} leads por mes. El 80% de los negocios se cierran después de 5 o más contactos de seguimiento, pero la mayoría de los negocios se detienen después de 1–2 intentos. Una secuencia estructurada de 5 pasos (Día 1 · 3 · 7 · 14 · 30) aplicada a tus leads perdidos podría recuperar de forma conservadora el 10–20% de ellos — eso es ${fmtCurrency(lostLeads * 0.15 * avgClientValue)}/mes sin un solo lead nuevo.`,
        `You're losing ${fmt(lostLeads)} leads per month. 80% of deals close after 5+ follow-up touches, but most businesses stop after 1–2 attempts. A structured 5-step follow-up sequence (Day 1 · 3 · 7 · 14 · 30) applied to your lost leads could conservatively recover 10–20% of them — that's ${fmtCurrency(lostLeads * 0.15 * avgClientValue)}/month without a single new lead.`,
      ),
    });
  }

  if (avgClientValue > 0) {
    recommendations.push({
      priority: t("Medio", "Medium"),
      title: t(
        "Aumenta el Valor Promedio de Cada Cliente Sin Más Leads",
        "Increase Average Deal Value Without More Leads",
      ),
      text: t(
        `El valor promedio de tu cliente es ${fmtCurrency(avgClientValue)}/mes. Un aumento del 20% a través de paquetes escalonados u ofertas de upsell sobre tus ${fmt(safeClosed)} clientes mensuales actuales agregaría ${fmtCurrency(safeClosed * avgClientValue * 0.2 * 12)}/año — sin adquirir un solo lead nuevo ni cambiar tu tasa de cierre.`,
        `Your average client value is ${fmtCurrency(avgClientValue)}/month. A 20% increase through tiered packaging or upsell offers on your existing ${fmt(safeClosed)} monthly clients would add ${fmtCurrency(safeClosed * avgClientValue * 0.2 * 12)}/year — without acquiring a single new lead or changing your close rate.`,
      ),
    });
  }

  if (closeRate >= 20 && rtHours <= 0.75) {
    recommendations.push({
      priority: t("Medio", "Medium"),
      title: t(
        "Base Sólida — Escala el Volumen de Leads Ahora",
        "Strong Foundation — Scale Lead Volume Now",
      ),
      text: t(
        `Con una tasa de cierre de ${fmtPct(closeRate)} y tiempo de respuesta rápido, tu operación de ventas está funcionando muy por encima del promedio. La acción de mayor apalancamiento es aumentar el volumen de leads. Un aumento del 25% en leads mensuales a tu tasa de cierre actual agregaría ${fmtCurrency(safeLeads * 0.25 * closeRate / 100 * avgClientValue * 12)}/año sin ningún cambio en tu proceso actual.`,
        `With a ${fmtPct(closeRate)} close rate and fast response time, your sales operation is performing well above average. The highest-leverage action is increasing lead volume. A 25% increase in monthly leads at your current close rate would add ${fmtCurrency(safeLeads * 0.25 * closeRate / 100 * avgClientValue * 12)}/year with no change to your current process.`,
      ),
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────────
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
            Enter your business metrics and get a data-driven revenue leak analysis with specific recommendations.
          </p>
        </div>

        <BusinessSettings />

        {/* Input form */}
        <div className="glass border border-border rounded-xl p-4 md:p-6 space-y-4">

          <div className="space-y-2">
            <Label htmlFor="biz">Business Name</Label>
            <Input
              id="biz"
              placeholder="e.g. Apex Marketing Agency"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="bg-background/50 border-border focus-visible:ring-primary/50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rev">Monthly Revenue ($)</Label>
              <Input
                id="rev"
                type="number"
                min="0"
                placeholder="e.g. 25000"
                value={monthlyRevenue}
                onChange={(e) => setMonthlyRevenue(e.target.value)}
                className="bg-background/50 border-border focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leads">Monthly Leads</Label>
              <Input
                id="leads"
                type="number"
                min="1"
                placeholder="e.g. 120"
                value={monthlyLeads}
                onChange={(e) => setMonthlyLeads(e.target.value)}
                className="bg-background/50 border-border focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closed" className={closedExceedsLeads ? "text-red-400" : ""}>
                Closed Clients / Month
              </Label>
              <Input
                id="closed"
                type="number"
                min="0"
                placeholder="e.g. 18"
                value={closedClients}
                onChange={(e) => { setClosedClients(e.target.value); setDiagnosed(false); }}
                className={
                  closedExceedsLeads
                    ? "bg-red-500/10 border-red-500 focus-visible:ring-red-500/50 text-red-400"
                    : "bg-background/50 border-border focus-visible:ring-primary/50"
                }
              />
              {closedExceedsLeads && (
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium pt-0.5">
                  <AlertTriangle size={12} className="shrink-0" />
                  Closed clients cannot be greater than monthly leads.
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rt">Avg Response Time to Leads</Label>
              <select
                id="rt"
                value={responseTime}
                onChange={(e) => setResponseTime(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-background/50 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {RESPONSE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <Button
            onClick={() => setDiagnosed(true)}
            disabled={!canDiagnose}
            className="w-full electric-glow font-semibold"
          >
            <Activity size={16} className="mr-2" />
            Run Diagnostic
          </Button>
        </div>

        {/* ── Results ───────────────────────────────────────────────────── */}
        {diagnosed && canDiagnose && (
          <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">

            {/* Business name banner */}
            {businessName && (
              <div className="glass border border-primary/25 rounded-xl px-4 py-3 flex items-center gap-3 bg-primary/5">
                <Activity size={16} className="text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Diagnostic Report for</p>
                  <p className="text-sm font-bold text-foreground">{businessName}</p>
                </div>
              </div>
            )}

            {/* ── Section 1: Business Metrics ───────────────────────── */}
            <SectionHeader icon={<BarChart3 size={14} />} label="Business Metrics" />
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                icon={<DollarSign size={12} />}
                label="Monthly Revenue"
                value={fmtCurrency(revenue)}
                sub={`${fmtCurrency(revenue * 12)} / year`}
              />
              <MetricCard
                icon={<Users size={12} />}
                label="Monthly Leads"
                value={fmt(safeLeads)}
                sub="incoming per month"
              />
              <MetricCard
                icon={<Target size={12} />}
                label="Closed Clients"
                value={fmt(safeClosed)}
                sub="converted per month"
              />
              <MetricCard
                icon={<DollarSign size={12} />}
                label="Avg Client Value"
                value={fmtCurrency(avgClientValue)}
                sub="revenue per client"
              />
            </div>

            {/* ── Section 2: Revenue Leakage Analysis ───────────────── */}
            <SectionHeader icon={<TrendingDown size={14} />} label="Revenue Leakage Analysis" />

            {/* Close rate with visual bar */}
            <div className={`glass border rounded-xl p-4 space-y-3 ${
              closeRate >= 25 ? "border-green-500/30 bg-green-500/5"
              : closeRate >= 15 ? "border-amber-500/30 bg-amber-500/5"
              : "border-red-500/30 bg-red-500/5"
            }`}>
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${
                  closeRate >= 25 ? "text-green-400" : closeRate >= 15 ? "text-amber-400" : "text-red-400"
                }`}>
                  <Target size={12} />
                  Close Rate
                </div>
                <span className={`text-2xl font-bold ${
                  closeRate >= 25 ? "text-green-400" : closeRate >= 15 ? "text-amber-400" : "text-red-400"
                }`}>
                  {fmtPct(closeRate)}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    closeRate >= 25 ? "bg-green-500" : closeRate >= 15 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(closeRate, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {closeRate >= 25
                  ? "Above industry average — strong pipeline management."
                  : closeRate >= 15
                  ? "Below average (25% benchmark). Significant improvement opportunity."
                  : "Critical: well below the 25% industry benchmark. Immediate action required."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MetricCard
                icon={<Users size={12} />}
                label="Lost Leads / Month"
                value={fmt(lostLeads)}
                sub="never converted"
                accent="danger"
              />
              <MetricCard
                icon={<DollarSign size={12} />}
                label="Revenue Lost / Month"
                value={fmtCurrency(revenueLostMonthly)}
                sub="at current close rate"
                accent="danger"
              />
              <MetricCard
                icon={<TrendingDown size={12} />}
                label="Annual Opportunity Cost"
                value={fmtCurrency(annualOpptyCost)}
                sub="left on the table yearly"
                accent="danger"
              />
            </div>

            {/* ── Section 3: Current Scenario ───────────────────────── */}
            <SectionHeader icon={<Activity size={14} />} label="Current Scenario" />
            <div className="glass border border-border rounded-xl p-4 space-y-4">
              <p className="text-sm text-foreground/85 leading-relaxed">
                {businessName ? `${businessName} is currently` : "Your business is currently"} closing{" "}
                <span className="text-foreground font-semibold">{fmtPct(closeRate)}</span> of incoming leads,
                generating <span className="text-foreground font-semibold">{fmtCurrency(revenue)}/month</span> from{" "}
                <span className="text-foreground font-semibold">{fmt(safeClosed)} clients</span>. Of the{" "}
                <span className="text-foreground font-semibold">{fmt(safeLeads)} leads</span> coming in monthly,{" "}
                <span className="text-red-400 font-semibold">{fmt(lostLeads)} are not converting</span>,
                representing <span className="text-red-400 font-semibold">{fmtCurrency(revenueLostMonthly)}/month</span> in
                unrealised revenue. Annualised, that gap is{" "}
                <span className="text-red-400 font-bold">{fmtCurrency(annualOpptyCost)}</span> walking out the door every year
                — with no additional lead generation required to close it.
              </p>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/50">
                {[
                  { label: "Close Rate",    value: fmtPct(closeRate) },
                  { label: "Lost Leads",    value: fmt(lostLeads) + "/mo" },
                  { label: "Revenue Gap",   value: fmtCurrency(revenueLostMonthly) + "/mo" },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-bold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section 4: Optimised Scenario ─────────────────────── */}
            <SectionHeader icon={<TrendingUp size={14} />} label="Optimized Scenario" />
            <div className="glass border border-green-500/30 rounded-xl p-4 space-y-4 bg-green-500/5">
              <p className="text-sm text-foreground/85 leading-relaxed">
                By improving your close rate to{" "}
                <span className="text-green-400 font-semibold">{fmtPct(optimisedCloseRate)}</span> — achievable through faster
                response times, a lead qualification process, and a structured follow-up sequence —{" "}
                {businessName || "your business"} would close{" "}
                <span className="text-green-400 font-semibold">{fmt(optimisedClosed)} clients/month</span> from
                the same lead volume. That's an additional{" "}
                <span className="text-green-400 font-bold">{fmtCurrency(additionalMonthly)}/month</span>, scaling to{" "}
                <span className="text-green-400 font-bold">{fmtCurrency(additionalAnnual)}/year</span> in recovered revenue
                without a single new lead.
              </p>

              {/* Before/After comparison */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-background/30 p-3 space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Current</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Close Rate",        value: fmtPct(closeRate) },
                      { label: "Clients / Month",   value: fmt(safeClosed) },
                      { label: "Monthly Revenue",   value: fmtCurrency(revenue) },
                    ].map((r) => (
                      <div key={r.label} className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">{r.label}</span>
                        <span className="text-xs font-semibold text-foreground">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-green-500/30 bg-green-500/8 p-3 space-y-2">
                  <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Optimized</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Close Rate",        value: fmtPct(optimisedCloseRate) },
                      { label: "Clients / Month",   value: fmt(optimisedClosed) },
                      { label: "Monthly Revenue",   value: fmtCurrency(optimisedRevenue) },
                    ].map((r) => (
                      <div key={r.label} className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">{r.label}</span>
                        <span className="text-xs font-bold text-green-400">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Uplift summary */}
              <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3">
                <ArrowRight size={16} className="text-green-400 shrink-0" />
                <div>
                  <p className="text-xs text-green-400 font-bold">Total Revenue Uplift</p>
                  <p className="text-sm text-foreground">
                    <span className="font-bold text-green-400">{fmtCurrency(additionalMonthly)}/month</span>
                    {" "}·{" "}
                    <span className="font-bold text-green-400">{fmtCurrency(additionalAnnual)}/year</span>
                    {" "}from existing lead volume
                  </p>
                </div>
              </div>
            </div>

            {/* ── Section 5: AI Recommendations ─────────────────────── */}
            <SectionHeader icon={<Zap size={14} />} label="AI Recommendations" />
            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <div key={i} className="glass border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_STYLE[rec.priority] ?? PRIORITY_STYLE.Medium}`}>
                          {rec.priority}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          #{i + 1}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-foreground">{rec.title}</p>
                    </div>
                    <CopyButton text={`${rec.title}\n\n${rec.text}`} />
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{rec.text}</p>
                </div>
              ))}
            </div>

            {/* Re-diagnose */}
            <Button
              variant="outline"
              className="w-full border-border text-muted-foreground hover:text-foreground"
              onClick={() => setDiagnosed(false)}
            >
              <Activity size={14} className="mr-2" />
              Edit Inputs & Re-Diagnose
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
