import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { VideoProjectCard } from "@/components/projects/VideoProjectCard";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import {
  FolderOpen, UploadCloud, RefreshCw, AlertCircle, Loader2,
} from "lucide-react";

export default function ProjectsPage() {
  const { projects, loading, error, reload, remove } = useProjects();

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
                : `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
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

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Loading your projects…</p>
          </div>
        )}

        {/* Error */}
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

            {/* Supabase setup hint */}
            {error.toLowerCase().includes("relation") || error.toLowerCase().includes("table") ? (
              <div className="max-w-lg w-full p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm space-y-2">
                <p className="font-semibold text-amber-300">Database table not found</p>
                <p className="text-muted-foreground text-xs">
                  Run the SQL in <code className="text-primary">supabase/video_projects.sql</code> in
                  your Supabase project's SQL Editor to create the required table.
                </p>
              </div>
            ) : null}
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
