import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useVyronSettings } from "@/contexts/settings-context";
import { BusinessSettings } from "@/components/business-settings";
import {
  Loader2, Copy, Check, Zap, Hash, Type, MessageSquare,
  Brain, AlertTriangle, TrendingUp, Heart, ShieldAlert,
  Frown, Sparkles, Users,
} from "lucide-react";

type HookType = "curiosity" | "pain" | "story" | "authority" | "mistake" | "opportunity" | "viral";
type Intensity = "soft" | "medium" | "aggressive";

interface ScriptResult {
  // Audience Intelligence
  desires:          string;
  fears:            string;
  pains:            string;
  transformation:   string;
  // Neuro Triggers
  sarTrigger:       string;
  painTrigger:      string;
  curiosityTrigger: string;
  // Script & Output
  script:           string;
  cta:              string;
  title:            string;
  hashtags:         string;
}

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
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );
}

// ── Script result card ─────────────────────────────────────────────────────────
function ResultCard({
  icon, label, content, accent = false, mono = false,
}: {
  icon:    React.ReactNode;
  label:   string;
  content: string;
  accent?: boolean;
  mono?:   boolean;
}) {
  return (
    <div className={`glass rounded-xl p-4 space-y-3 border ${accent ? "border-primary/40 bg-primary/5" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          {icon}
          {label}
        </div>
        <CopyButton text={content} />
      </div>
      <p className={`text-sm text-foreground/90 leading-relaxed whitespace-pre-line ${mono ? "font-mono text-xs tracking-wide" : ""}`}>
        {content}
      </p>
    </div>
  );
}

// ── Intelligence card (amber tint) ─────────────────────────────────────────────
function IntelCard({
  icon, label, content,
}: {
  icon:    React.ReactNode;
  label:   string;
  content: string;
}) {
  return (
    <div className="rounded-xl p-4 space-y-2 border border-amber-500/25 bg-amber-500/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
          {icon}
          {label}
        </div>
        <CopyButton text={content} />
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed">{content}</p>
    </div>
  );
}

// ── Pill selector ──────────────────────────────────────────────────────────────
function PillSelector<T extends string>({
  options, value, onChange,
}: {
  options:  { value: T; label: string; emoji?: string }[];
  value:    T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
            value === opt.value
              ? "bg-primary text-primary-foreground border-primary electric-glow"
              : "bg-background/40 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
          }`}
        >
          {opt.emoji && <span className="mr-1">{opt.emoji}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────
const HOOK_TYPES: { value: HookType; label: string; emoji: string }[] = [
  { value: "curiosity",   label: "Curiosity",   emoji: "🔍" },
  { value: "pain",        label: "Pain",        emoji: "⚡" },
  { value: "story",       label: "Story",       emoji: "📖" },
  { value: "authority",   label: "Authority",   emoji: "🏆" },
  { value: "mistake",     label: "Mistake",     emoji: "❌" },
  { value: "opportunity", label: "Opportunity", emoji: "🚀" },
  { value: "viral",       label: "Viral Trend", emoji: "🔥" },
];

const INTENSITIES: { value: Intensity; label: string; emoji: string }[] = [
  { value: "soft",       label: "Soft",       emoji: "🌊" },
  { value: "medium",     label: "Medium",     emoji: "⚡" },
  { value: "aggressive", label: "Aggressive", emoji: "🔥" },
];

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ScriptEnginePage() {
  const [niche,     setNiche]     = useState("");
  const [product,   setProduct]   = useState("");
  const [audience,  setAudience]  = useState("");
  const [hookType,  setHookType]  = useState<HookType>("curiosity");
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<ScriptResult | null>(null);
  const { toast } = useToast();

  const { language, businessStage } = useVyronSettings();
  const [topic, setTopic] = useState("");

  // Pre-populate from Content Planner deep-link — auto-generate if flagged
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n  = params.get("niche")    || "";
    const pr = params.get("product")  || "";
    const au = params.get("audience") || "";
    const h  = (params.get("hookType")  || "curiosity") as HookType;
    const it = (params.get("intensity") || "medium")    as Intensity;
    const t  = params.get("topic")    || "";
    const auto = params.get("autoGenerate") === "true";

    if (n)  setNiche(n);
    if (pr) setProduct(pr);
    if (au) setAudience(au);
    if (HOOK_TYPES.some((x) => x.value === h))   setHookType(h);
    if (INTENSITIES.some((x) => x.value === it)) setIntensity(it);
    if (t)  setTopic(t);

    // Auto-generate: call API directly with URL values (state updates are async)
    if (auto && n && pr && au) {
      setLoading(true);
      fetch("/api/script/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche:         n,
          product:       pr,
          audience:      au,
          hookType:      HOOK_TYPES.some((x) => x.value === h) ? h : "curiosity",
          intensity:     INTENSITIES.some((x) => x.value === it) ? it : "medium",
          language,
          businessStage,
        }),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => setResult(data))
        .catch(() => toast({ description: "Error al generar el script. Inténtalo de nuevo.", variant: "destructive" }))
        .finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGenerate = niche.trim() && product.trim() && audience.trim();

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/script/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche:    niche.trim(),
          product:  product.trim(),
          audience: audience.trim(),
          hookType,
          intensity,
          language,
          businessStage,
        }),
      });
      if (!res.ok) throw new Error("Server error");
      setResult(await res.json());
    } catch {
      toast({ description: "Failed to generate script. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout title="Script Engine">
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">
            Script Engine
            <span className="text-primary ml-2">v3</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Context-intelligent scripts built around audience psychology, not just niche keywords.
          </p>
        </div>

        <BusinessSettings />

        {/* Content Topic chip — shown when arriving from Content Planner */}
        {topic && (
          <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
            <Zap size={14} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Content Topic</p>
              <p className="text-sm text-foreground/90 font-medium leading-snug mt-0.5">{topic}</p>
            </div>
          </div>
        )}

        {/* Neuro Hook Engine */}
        <div className="glass border border-primary/30 rounded-xl p-4 md:p-5 space-y-5 bg-primary/5">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-primary" />
            <span className="text-sm font-bold text-primary uppercase tracking-wider">Neuro Hook Engine</span>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Hook Type</Label>
            <PillSelector options={HOOK_TYPES} value={hookType} onChange={setHookType} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Hook Intensity</Label>
            <PillSelector options={INTENSITIES} value={intensity} onChange={setIntensity} />
          </div>
        </div>

        {/* Input form */}
        <div className="glass border border-border rounded-xl p-4 md:p-6 space-y-4">
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
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || loading}
            className="w-full electric-glow font-semibold"
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin mr-2" />Generating…</>
              : <><Zap size={16} className="mr-2" />Generate Script</>
            }
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">

            {/* ── Audience Intelligence ─────────────────────────────── */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-amber-400" />
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Audience Intelligence</span>
              </div>
              <div className="space-y-3">
                <IntelCard
                  icon={<Heart size={12} />}
                  label="Desire Analysis"
                  content={result.desires}
                />
                <IntelCard
                  icon={<ShieldAlert size={12} />}
                  label="Fear Analysis"
                  content={result.fears}
                />
                <IntelCard
                  icon={<Frown size={12} />}
                  label="Pain Analysis"
                  content={result.pains}
                />
                <IntelCard
                  icon={<Sparkles size={12} />}
                  label="Transformation Analysis"
                  content={result.transformation}
                />
              </div>
            </div>

            {/* ── Neuro Triggers ────────────────────────────────────── */}
            <div className="px-1 pt-2 pb-1">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">— Neuro Triggers</span>
            </div>
            <ResultCard
              icon={<Brain size={14} />}
              label="SAR Trigger"
              content={result.sarTrigger}
              accent
            />
            <ResultCard
              icon={<AlertTriangle size={14} />}
              label="Pain Trigger"
              content={result.painTrigger}
            />
            <ResultCard
              icon={<TrendingUp size={14} />}
              label="Curiosity Trigger"
              content={result.curiosityTrigger}
            />

            {/* ── Script & Output ───────────────────────────────────── */}
            <div className="px-1 pt-2 pb-1">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">— Script & Output</span>
            </div>
            <ResultCard
              icon={<MessageSquare size={14} />}
              label="Main Script"
              content={result.script}
            />
            <ResultCard
              icon={<Zap size={14} />}
              label="Call to Action"
              content={result.cta}
            />
            <ResultCard
              icon={<Type size={14} />}
              label="Video Title"
              content={result.title}
            />
            <ResultCard
              icon={<Hash size={14} />}
              label="Hashtags"
              content={result.hashtags}
              mono
            />

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
              Regenerate
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
