import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Zap, BarChart3, Copy, Check, Brain,
  Users, TrendingUp, Calendar, MessageSquare, Sparkles,
  Clock, ChevronRight,
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

  const canGenerate = niche.trim().length > 0;

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
          </div>
        )}
      </div>
    </AppLayout>
  );
}
