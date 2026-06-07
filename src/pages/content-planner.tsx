import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useVyronSettings } from "@/contexts/settings-context";
import { BusinessSettings } from "@/components/business-settings";
import {
  Loader2, Zap, CalendarDays, Sparkles, Target, MessageSquare,
} from "lucide-react";

type Frequency = "daily" | "5x_week" | "3x_week" | "2x_week";
type Duration  = 7 | 30 | 60 | 90;
type HookType  = "curiosity" | "pain" | "story" | "authority" | "mistake" | "opportunity" | "viral";
type Intensity = "soft" | "medium" | "aggressive";

interface CalendarEntry {
  day:         number;
  contentType: string;
  hookType:    HookType;
  intensity:   Intensity;
  angle?:      string;
  title:       string;
  objective:   string;
  cta:         string;
}

interface CalendarResult {
  entries:  CalendarEntry[];
  total:    number;
  duration: number;
  niche:    string;
  product:  string;
  audience: string;
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

// ── Colour maps ────────────────────────────────────────────────────────────────
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

const INTENSITY_COLORS: Record<Intensity, string> = {
  soft:       "bg-sky-500/15 text-sky-400 border-sky-500/30",
  medium:     "bg-violet-500/15 text-violet-400 border-violet-500/30",
  aggressive: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const INTENSITY_LABEL: Record<Intensity, string> = {
  soft:       "🌊 Soft",
  medium:     "⚡ Medium",
  aggressive: "🔥 Aggressive",
};

const CONTENT_PALETTE = [
  "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "bg-rose-500/15 text-rose-400 border-rose-500/30",
  "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  "bg-lime-500/15 text-lime-400 border-lime-500/30",
  "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
];

const ALL_CONTENT_TYPES = [
  "Educational", "Listicle", "Behind the Scenes", "Social Proof",
  "Product Demo", "Q&A", "Trending", "Story", "Challenge", "Hot Take",
];

function contentColor(type: string) {
  const idx = ALL_CONTENT_TYPES.indexOf(type);
  return CONTENT_PALETTE[(idx >= 0 ? idx : 0) % CONTENT_PALETTE.length];
}

// ── Day card ───────────────────────────────────────────────────────────────────
function DayCard({
  entry, onGenerateScript,
}: {
  entry:             CalendarEntry;
  onGenerateScript:  (e: CalendarEntry) => void;
}) {
  return (
    <div className="glass border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors">

      {/* Top row — day number + content topic */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex flex-col items-center justify-center">
          <span className="text-[10px] text-muted-foreground font-medium leading-none">DAY</span>
          <span className="text-lg font-bold text-primary leading-none mt-0.5">{entry.day}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Content Topic</p>
          <p className="text-sm font-semibold text-foreground leading-snug">{entry.title}</p>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${contentColor(entry.contentType)}`}>
          {entry.contentType}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${HOOK_COLORS[entry.hookType]}`}>
          {HOOK_LABEL[entry.hookType]}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${INTENSITY_COLORS[entry.intensity]}`}>
          {INTENSITY_LABEL[entry.intensity]}
        </span>
      </div>

      {/* Objective */}
      <div className="flex items-start gap-2">
        <Target size={12} className="text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Objective</p>
          <p className="text-xs text-foreground/80">{entry.objective}</p>
        </div>
      </div>

      {/* Suggested CTA */}
      <div className="flex items-start gap-2">
        <MessageSquare size={12} className="text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Suggested CTA</p>
          <p className="text-xs text-foreground/80">{entry.cta}</p>
        </div>
      </div>

      {/* Generate Script button */}
      <Button
        size="sm"
        variant="outline"
        className="w-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary text-xs font-semibold h-8"
        onClick={() => onGenerateScript(entry)}
      >
        <Zap size={12} className="mr-1.5" />
        Generate Script
      </Button>
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────
const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "daily",   label: "Daily" },
  { value: "5x_week", label: "5×/week" },
  { value: "3x_week", label: "3×/week" },
  { value: "2x_week", label: "2×/week" },
];

const DUR_OPTIONS: { value: Duration; label: string }[] = [
  { value: 7,  label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
];

const GOAL_OPTIONS = [
  { value: "brand_awareness", label: "Brand Awareness" },
  { value: "lead_generation", label: "Lead Generation" },
  { value: "sales",           label: "Sales" },
  { value: "engagement",      label: "Engagement" },
  { value: "community",       label: "Community Building" },
];

const STORAGE_KEY = "vyron_content_planner_state";

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ContentPlannerPage() {
  const [niche,     setNiche]     = useState("");
  const [product,   setProduct]   = useState("");
  const [audience,  setAudience]  = useState("");
  const [goal,      setGoal]      = useState("brand_awareness");
  const [frequency, setFrequency] = useState<Frequency>("3x_week");
  const [duration,  setDuration]  = useState<Duration>(30);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<CalendarResult | null>(null);
  const [, navigate] = useLocation();
  const { toast }    = useToast();

  const { language, businessStage } = useVyronSettings();
  const canGenerate = niche.trim().length > 0;

  // Restore state when returning from Script Engine
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.niche)     setNiche(s.niche);
      if (s.product)   setProduct(s.product);
      if (s.audience)  setAudience(s.audience);
      if (s.goal)      setGoal(s.goal);
      if (s.frequency) setFrequency(s.frequency);
      if (s.duration)  setDuration(s.duration);
      if (s.result)    setResult(s.result);
    } catch { /* ignore parse errors */ }
  }, []);

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/content-planner/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche:            niche.trim(),
          product:          product.trim(),
          audience:         audience.trim(),
          goal,
          postingFrequency: frequency,
          duration,
          language,
          businessStage,
        }),
      });
      if (!res.ok) throw new Error("Server error");
      setResult(await res.json());
    } catch {
      toast({ description: "Failed to generate calendar. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateScript = (entry: CalendarEntry) => {
    // Persist current planner state so it's restored when user navigates back
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        niche, product, audience, goal, frequency, duration, result,
      }));
    } catch { /* ignore storage errors */ }

    const params = new URLSearchParams({
      niche:         niche.trim(),
      product:       product.trim(),
      audience:      audience.trim(),
      hookType:      entry.hookType,
      intensity:     entry.intensity,
      topic:         entry.title,
      autoGenerate:  "true",
    });
    navigate(`/script-engine?${params.toString()}`);
  };

  return (
    <AppLayout title="Content Planner">
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays size={22} className="text-primary" />
            Content Planner
          </h2>
          <p className="text-muted-foreground text-sm">
            Generate a balanced content calendar — click any day to open Script Engine pre-filled and ready.
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

          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <select
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full h-10 rounded-md border border-border bg-background/50 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Posting Frequency</Label>
            <PillSelector options={FREQ_OPTIONS} value={frequency} onChange={setFrequency} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Duration</Label>
            <PillSelector
              options={DUR_OPTIONS}
              value={duration}
              onChange={(v) => setDuration(Number(v) as Duration)}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || loading}
            className="w-full electric-glow font-semibold"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin mr-2" />Generating…</>
            ) : (
              <><Sparkles size={16} className="mr-2" />Generate Calendar</>
            )}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">

            {/* Stats bar */}
            <div className="glass border border-primary/25 rounded-xl px-4 py-3 flex items-center justify-between bg-primary/5">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">{result.niche}</span>
                {result.product && (
                  <span className="text-xs text-muted-foreground">· {result.product}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span><span className="text-foreground font-bold">{result.total}</span> posts</span>
                <span className="text-border">·</span>
                <span><span className="text-foreground font-bold">{result.duration}</span> days</span>
              </div>
            </div>

            {/* Hook distribution legend */}
            <div className="flex flex-wrap gap-1.5 px-1">
              {(Object.keys(HOOK_LABEL) as HookType[]).map((h) => {
                const count = result.entries.filter((e) => e.hookType === h).length;
                if (!count) return null;
                return (
                  <span key={h} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${HOOK_COLORS[h]}`}>
                    {HOOK_LABEL[h]} <span className="opacity-70">×{count}</span>
                  </span>
                );
              })}
            </div>

            {/* Day cards */}
            <div className="space-y-3">
              {result.entries.map((entry, i) => (
                <DayCard
                  key={i}
                  entry={entry}
                  onGenerateScript={handleGenerateScript}
                />
              ))}
            </div>

            <Button
              variant="outline"
              className="w-full border-border text-muted-foreground hover:text-foreground"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading
                ? <Loader2 size={14} className="animate-spin mr-2" />
                : <Sparkles size={14} className="mr-2" />}
              Regenerate Calendar
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
