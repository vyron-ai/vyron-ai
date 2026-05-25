import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { VideoProjectCard } from "@/components/projects/VideoProjectCard";
import { useProjects } from "@/hooks/useProjects";
import { VIDEO_PROJECTS_SQL } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import {
  FolderOpen, UploadCloud, RefreshCw, AlertCircle, Loader2,
  Database, Copy, CheckCheck, ExternalLink, Terminal, ChevronDown, ChevronUp,
} from "lucide-react";

// ── SQL copy banner shown when projects come from localStorage ────────────────
function LocalFallbackBanner() {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(VIDEO_PROJECTS_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const ref = (() => {
    try {
      const url = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
      const host = new URL(url).hostname;
      const m = host.match(/^([a-z0-9]+)\.supabase\.co$/);
      return m ? m[1] : null;
    } catch { return null; }
  })();

  const sqlEditorUrl = ref
    ? `https://supabase.com/dashboard/project/${ref}/sql/new`
    : "https://supabase.com/dashboard/project/_/sql/new";

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-300">Showing cached uploads</p>
            <p className="text-xs text-muted-foreground">
              The <code className="font-mono text-amber-400">video_projects</code> table doesn't exist yet.
              Create it to persist projects across devices.
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1"
          title={expanded ? "Hide SQL" : "Show setup SQL"}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expandable SQL section */}
      {expanded && (
        <div className="border-t border-amber-500/20 px-4 pb-4 pt-3 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Copy the SQL below and run it in your{" "}
            <a href={sqlEditorUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
              Supabase SQL Editor
            </a>{" "}
            — takes ~5 seconds.
          </p>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-card/80 border-b border-border">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-mono text-muted-foreground">video_projects migration</span>
              </div>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 border border-primary/20 transition-colors"
              >
                {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy SQL"}
              </button>
            </div>
            <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed p-3 overflow-x-auto max-h-56 bg-background/50 whitespace-pre">
              {VIDEO_PROJECTS_SQL}
            </pre>
          </div>

          <a
            href={sqlEditorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline py-0.5"
          >
            <ExternalLink className="w-4 h-4" />
            Open Supabase SQL Editor →
          </a>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const { projects, loading, error, isLocalFallback, reload, remove } = useProjects();

  return (
    <AppLayout title="Projects">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Video Projects</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {loading
                ? "Loading your projects…"
                : projects.length === 0
                ? "No projects yet — upload your first video to get started."
                : `${projects.length} project${projects.length !== 1 ? "s" : ""}${isLocalFallback ? " (cached)" : ""}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={reload}
              disabled={loading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Link href="/upload">
              <Button
                size="sm"
                className="gap-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90 electric-glow"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Upload Video
              </Button>
            </Link>
          </div>
        </div>

        {/* LocalStorage fallback banner */}
        {!loading && isLocalFallback && <LocalFallbackBanner />}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Loading your projects…</p>
          </div>
        )}

        {/* Error (non-table-missing errors only — table missing is handled by fallback) */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30 max-w-lg w-full">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">Failed to load projects</p>
                <p className="text-xs text-muted-foreground mt-0.5 break-words">{error}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={reload} className="shrink-0 text-xs">
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-6 text-muted-foreground">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <FolderOpen className="w-10 h-10 text-primary/40" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold text-foreground">No projects yet</p>
              <p className="text-sm">Upload your first video to see it here.</p>
            </div>
            <Link href="/upload">
              <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 electric-glow">
                <UploadCloud className="w-4 h-4" />
                Upload Your First Video
              </Button>
            </Link>
          </div>
        )}

        {/* Project grid */}
        {!loading && !error && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {projects.map((project) => (
              <VideoProjectCard
                key={project.id}
                project={project}
                onDelete={remove}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
