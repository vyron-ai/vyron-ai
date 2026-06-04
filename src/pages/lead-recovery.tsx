import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Loader2, Copy, Check, Zap, TrendingUp,
  Users, DollarSign, Target, MessageSquare, Brain,
  Clock, AlertCircle, BarChart3, ChevronRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type LeadStatus = "interested" | "no_response" | "follow_up_needed" | "budget_concern" | "comparing" | "cold";
type Probability = "Low" | "Medium" | "High";

interface AnalysisResult {
  id:                 string;
  leadName:           string;
  companyName:        string;
  score:              number;
  probability:        Probability;
  objection:          string;
  revenueOpportunity: number;
  recoverable:        boolean;
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
  budget_concern:    "Price",
  cold:              "Timing",
};

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
  const diff = Date.now() - new Date(from).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function detectObjection(status: LeadStatus, notes: string): string {
  const n = notes.toLowerCase();
  if (/price|cost|expensive|afford|cheap|budget/.test(n))              return "Price";
  if (/time|busy|later|not now|wrong time|next quarter|next year/.test(n)) return "Timing";
  if (/trust|sure|guarantee|risk|proof|case study|evidence/.test(n))  return "Trust";
  if (/option|compar|looking at|another|other provider|competitor/.test(n)) return "Comparing Options";
  if (/confus|unclear|don.t understand|what is|not sure what/.test(n)) return "Unclear Offer";
  return STATUS_OBJECTION[status];
}

function computeScore(status: LeadStatus, lastContact: string, notes: string): number {
  let score = STATUS_BASE_SCORE[status];
  const days = daysBetween(lastContact);
  if (days < 7)        score -= 0;
  else if (days < 30)  score -= 8;
  else if (days < 90)  score -= 18;
  else if (days < 180) score -= 28;
  else                 score -= 38;

  const n = notes.toLowerCase();
  if (notes.length > 80)                                  score += 5;
  if (/interest|yes|love|excit|great|perfect|absolutely/.test(n)) score += 8;
  if (/not now|maybe|think|decide later|perhaps/.test(n)) score -= 5;
  if (/price|cost|expensive/.test(n) && status !== "budget_concern") score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreToProbability(score: number): Probability {
  if (score >= 60) return "High";
  if (score >= 38) return "Medium";
  return "Low";
}

function computeRevenue(status: LeadStatus, leadName: string, companyName: string): number {
  const base      = STATUS_REVENUE_BASE[status];
  const variation = (nameHash(leadName + companyName) % 40) / 100; // 0–40% variation
  return Math.round(base * (1 + variation));
}

function buildRecoveryMessage(
  leadName:    string,
  companyName: string,
  status:      LeadStatus,
  objection:   string,
  lastContact: string,
  notes:       string,
): string {
  const first      = leadName.split(" ")[0] || leadName;
  const company    = companyName ? ` at ${companyName}` : "";
  const days       = daysBetween(lastContact);
  const timeRef    =
    days === 0 ? "earlier today" :
    days === 1 ? "yesterday" :
    days < 7   ? `${days} days ago` :
    days < 30  ? `about ${Math.round(days / 7)} week${Math.round(days / 7) !== 1 ? "s" : ""} ago` :
    days < 365 ? `about ${Math.round(days / 30)} month${Math.round(days / 30) !== 1 ? "s" : ""} ago` :
                 "a while back";

  const openings: Record<LeadStatus, string> = {
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

  return openings[status];
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
  const r    = 36;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 60 ? "#22c55e" : score >= 38 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
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
  const [leadName,     setLeadName]     = useState("");
  const [companyName,  setCompanyName]  = useState("");
  const [lastContact,  setLastContact]  = useState("");
  const [status,       setStatus]       = useState<LeadStatus>("no_response");
  const [notes,        setNotes]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [result,       setResult]       = useState<AnalysisResult | null>(null);
  const [analyses,     setAnalyses]     = useState<AnalysisResult[]>([]);
  const { toast } = useToast();

  const canAnalyze = leadName.trim().length > 0 && lastContact !== "";

  // ── Dashboard aggregates ───────────────────────────────────────────────────
  const dashboard = useMemo(() => ({
    analyzed:    analyses.length,
    recoverable: analyses.filter(a => a.recoverable).length,
    revPotential: analyses.reduce((s, a) => s + a.revenueOpportunity, 0),
    reactivated:  analyses.filter(a => a.probability === "High").length,
  }), [analyses]);

  // ── Analysis ───────────────────────────────────────────────────────────────
  const handleAnalyze = () => {
    if (!canAnalyze) return;
    setLoading(true);
    setTimeout(() => {
      const score    = computeScore(status, lastContact, notes);
      const prob     = scoreToProbability(score);
      const obj      = detectObjection(status, notes);
      const revenue  = computeRevenue(status, leadName.trim(), companyName.trim());
      const newResult: AnalysisResult = {
        id:                 Date.now().toString(),
        leadName:           leadName.trim(),
        companyName:        companyName.trim(),
        score,
        probability:        prob,
        objection:          obj,
        revenueOpportunity: revenue,
        recoverable:        prob !== "Low",
      };
      setResult(newResult);
      setAnalyses(prev => {
        const exists = prev.find(a => a.leadName === newResult.leadName && a.companyName === newResult.companyName);
        if (exists) return prev.map(a => (a.id === exists.id ? newResult : a));
        return [...prev, newResult];
      });
      setLoading(false);
    }, 900);
  };

  const recoveryMessage = result
    ? buildRecoveryMessage(result.leadName, result.companyName, status, result.objection, lastContact, notes)
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
            Turn inactive leads into revenue opportunities with data-driven recovery strategies.
          </p>
        </div>

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
              <Input
                id="lead-name"
                placeholder="e.g. Sarah Johnson"
                value={leadName}
                onChange={(e) => { setLeadName(e.target.value); setResult(null); }}
                className="bg-background/50 border-border focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                placeholder="e.g. Apex Solutions"
                value={companyName}
                onChange={(e) => { setCompanyName(e.target.value); setResult(null); }}
                className="bg-background/50 border-border focus-visible:ring-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="last-contact">Last Contact Date</Label>
              <Input
                id="last-contact"
                type="date"
                value={lastContact}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => { setLastContact(e.target.value); setResult(null); }}
                className="bg-background/50 border-border focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-status">Lead Status</Label>
              <select
                id="lead-status"
                value={status}
                onChange={(e) => { setStatus(e.target.value as LeadStatus); setResult(null); }}
                className="w-full h-10 rounded-md border border-border bg-background/50 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Conversation Notes</Label>
            <textarea
              id="notes"
              rows={4}
              placeholder="Summarise the previous conversation, objections raised, what was discussed, and where things were left…"
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setResult(null); }}
              className="w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={!canAnalyze || loading}
            className="w-full electric-glow font-semibold"
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin mr-2" />Analyzing Lead…</>
              : <><RefreshCw size={16} className="mr-2" />Analyze Lead</>
            }
          </Button>
        </div>

        {/* ── Results ──────────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">

            {/* ── AI Analysis Results ──────────────────────────────────── */}
            <SectionHeader icon={<Brain size={14} />} label="AI Analysis Results" />

            {/* Score + Probability + Objection + Revenue in one card */}
            <div className="glass border border-border rounded-xl p-5 space-y-5">

              {/* Top row: score ring + probability + objection */}
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
                        <span key={p} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                          result.probability === p ? PROB_STYLE[p] : "border-border bg-background/20 text-muted-foreground/40"
                        }`}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Main Objection Detected</p>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-amber-500/30 bg-amber-500/10 text-amber-400">
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

              {/* Days since contact */}
              {lastContact && (
                <div className="flex items-center gap-2 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                  <Clock size={12} className="text-primary shrink-0" />
                  Last contact: <span className="text-foreground font-semibold">
                    {daysBetween(lastContact) === 0
                      ? "today"
                      : `${daysBetween(lastContact)} day${daysBetween(lastContact) !== 1 ? "s" : ""} ago`}
                  </span>
                  {daysBetween(lastContact) > 30 && (
                    <span className="text-amber-400 font-medium">— re-engagement urgency is high</span>
                  )}
                </div>
              )}
            </div>

            {/* ── Recovery Strategy ────────────────────────────────────── */}
            <SectionHeader icon={<Target size={14} />} label="Recovery Strategy" />

            <InsightCard
              icon={<AlertCircle size={14} />}
              label="Why This Lead Was Lost"
              content={STATUS_WHY_LOST[status]}
            />
            <InsightCard
              icon={<ChevronRight size={14} />}
              label="What Action to Take"
              content={STATUS_ACTION[status]}
            />
            <InsightCard
              icon={<Clock size={14} />}
              label="Best Timing for Follow-Up"
              content={STATUS_TIMING[status]}
              copyable={false}
            />

            {/* ── Recommended Message ──────────────────────────────────── */}
            <SectionHeader icon={<MessageSquare size={14} />} label="Recommended Message" />
            <div className="glass border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Personalised Recovery Message</p>
                  <p className="text-xs text-muted-foreground">
                    Tailored to {result.leadName}{result.companyName ? ` · ${result.companyName}` : ""} · {STATUS_OPTIONS.find(o => o.value === status)?.label}
                  </p>
                </div>
                <CopyButton text={recoveryMessage} />
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <pre className="text-sm text-foreground/90 leading-relaxed font-sans whitespace-pre-wrap">
                  {recoveryMessage}
                </pre>
              </div>
            </div>

            {/* Re-analyze */}
            <Button
              variant="outline"
              className="w-full border-border text-muted-foreground hover:text-foreground"
              onClick={handleAnalyze}
              disabled={loading}
            >
              {loading
                ? <Loader2 size={14} className="animate-spin mr-2" />
                : <Zap size={14} className="mr-2" />
              }
              Re-Analyze This Lead
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
