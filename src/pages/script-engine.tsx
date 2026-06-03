import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Check, Zap, Hash, Type, Mic, MessageSquare } from "lucide-react";

interface ScriptResult {
  hook: string;
  script: string;
  cta: string;
  title: string;
  hashtags: string;
}

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

function ResultCard({
  icon,
  label,
  content,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  content: string;
  mono?: boolean;
}) {
  return (
    <div className="glass border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary text-sm font-semibold">
          {icon}
          {label}
        </div>
        <CopyButton text={content} />
      </div>
      <p
        className={`text-sm text-foreground/90 leading-relaxed whitespace-pre-line ${
          mono ? "font-mono text-xs tracking-wide" : ""
        }`}
      >
        {content}
      </p>
    </div>
  );
}

export default function ScriptEnginePage() {
  const [niche, setNiche] = useState("");
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const { toast } = useToast();

  const canGenerate = niche.trim() && product.trim() && audience.trim();

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/script/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: niche.trim(),
          product: product.trim(),
          audience: audience.trim(),
        }),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setResult(data);
    } catch {
      toast({ description: "Failed to generate script. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout title="Script Engine">
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">
            Script Engine
            <span className="text-primary ml-2">v1</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Generate hooks, scripts, CTAs, titles and hashtags for your short-form videos.
          </p>
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
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Generating…
              </>
            ) : (
              <>
                <Zap size={16} className="mr-2" />
                Generate Script
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
            <ResultCard
              icon={<Mic size={14} />}
              label="Hook"
              content={result.hook}
            />
            <ResultCard
              icon={<MessageSquare size={14} />}
              label="Short Script"
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
              {loading ? (
                <Loader2 size={14} className="animate-spin mr-2" />
              ) : (
                <Zap size={14} className="mr-2" />
              )}
              Regenerate
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
