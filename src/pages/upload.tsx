import { useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  UploadCloud, Info, Check, X, CircleDashed,
  AlertCircle, Copy, CheckCheck, ExternalLink, FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVideoUpload, UploadJob } from "@/hooks/useVideoUpload";

const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"];
const ACCEPT_ATTR = ".mp4,.mov,.mkv,.webm,video/mp4,video/quicktime,video/x-matroska,video/webm";

function statusBadge(job: UploadJob) {
  if (job.status === "done")
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-400 bg-green-400/10 px-2 py-1 rounded">
        <Check className="w-3 h-3" /> Uploaded
      </span>
    );
  if (job.status === "error")
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded">
        <AlertCircle className="w-3 h-3" /> Failed
      </span>
    );
  if (job.status === "aborted")
    return (
      <span className="text-xs font-medium text-muted-foreground bg-card px-2 py-1 rounded border border-border">
        Cancelled
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20">
      <CircleDashed className="w-3 h-3 animate-spin" /> {job.progress}%
    </span>
  );
}

function progressBar(job: UploadJob) {
  if (job.status === "done") return <div className="h-full bg-green-400 w-full transition-all" />;
  if (job.status === "error") return <div className="h-full bg-destructive w-full" />;
  if (job.status === "aborted") return null;
  return (
    <div
      className="h-full bg-primary transition-all duration-300"
      style={{ width: `${job.progress}%` }}
    />
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
      title="Copy URL"
    >
      {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy URL"}
    </button>
  );
}

export default function UploadPage() {
  const [, navigate] = useLocation();
  const [quality, setQuality] = useState("1080p HD");
  const [settings, setSettings] = useState({
    noise: true, sharpness: true, color: true, framerate: false,
  });
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { jobs, addFiles, cancelJob, removeJob, activeCount, doneCount } = useVideoUpload();

  const toggleSetting = (key: keyof typeof settings) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const valid = Array.from(files).filter((f) => {
        if (!ACCEPTED.includes(f.type) && !f.name.match(/\.(mp4|mov|mkv|webm)$/i)) return false;
        if (f.size > 2 * 1024 * 1024 * 1024) return false;
        return true;
      });
      if (valid.length) addFiles(valid);
    },
    [addFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = "";
  };

  const hasError = jobs.some((j) => j.status === "error");
  const hasUploaded = jobs.some((j) => j.status === "done");

  return (
    <AppLayout title="Video AI">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Left Column */}
        <div className="flex flex-col gap-6">

          {/* Dropzone */}
          <div
            className={`glass-strong border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 transition-colors cursor-pointer group relative overflow-hidden
              ${dragging ? "border-primary bg-primary/10" : "border-primary/40 hover:bg-primary/5"}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            data-testid="upload-zone"
          >
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-2 transition-colors ${dragging ? "bg-primary/40" : "bg-primary/20"}`}>
              <UploadCloud className={`w-8 h-8 text-primary ${dragging ? "" : "animate-float"}`} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {dragging ? "Release to upload" : "Drop your video file here"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
            </div>
            <div className="flex gap-2 text-xs font-mono text-muted-foreground bg-background/50 px-3 py-1 rounded border border-border">
              <span>MP4</span><span>MOV</span><span>MKV</span><span>WebM</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Max file size: 2 GB · Up to 4K resolution</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              className="sr-only"
              onChange={onInputChange}
              data-testid="file-input"
            />
          </div>

          {/* Storage bucket error guide */}
          {hasError && (
            <div className="flex flex-col gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-amber-300">Upload failed</p>
                  <p className="text-xs text-muted-foreground">
                    Make sure you have a <strong className="text-foreground">videos</strong> bucket in Supabase Storage
                    with a policy allowing authenticated users to upload.
                    <br />
                    <code className="text-primary text-[11px]">authenticated → INSERT → videos/*</code>
                  </p>
                </div>
              </div>
              <a
                href="https://supabase.com/dashboard/project/_/storage/buckets"
                target="_blank"
                rel="noopener noreferrer"
                className="self-start flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> Open Supabase Storage →
              </a>
            </div>
          )}

          {/* View Projects CTA — shown when at least one upload succeeds */}
          {hasUploaded && (
            <button
              onClick={() => navigate("/projects")}
              className="flex items-center justify-between gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30 hover:bg-green-500/15 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5 text-green-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-green-300">
                    {doneCount} video{doneCount !== 1 ? "s" : ""} uploaded successfully
                  </p>
                  <p className="text-xs text-muted-foreground">Click to view your projects →</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-green-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}

          {/* Policy note */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground font-medium">Enhancement policy:</strong> VYRON AI enhances your real footage — it does not generate new scenes or add objects.
            </p>
          </div>

          {/* Settings Panel */}
          <div className="glass border border-border rounded-xl p-6 flex flex-col gap-5">
            <h3 className="font-bold text-lg">Enhancement Settings</h3>
            <div className="flex flex-col gap-3">
              {[
                { key: "noise", label: "Noise Reduction" },
                { key: "sharpness", label: "Sharpness Boost" },
                { key: "color", label: "Color Correction" },
                { key: "framerate", label: "Frame Rate Stabilization" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/30 hover:bg-card/50 transition-colors">
                  <span className="text-sm font-medium">{label}</span>
                  <div
                    className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${settings[key as keyof typeof settings] ? "bg-primary" : "bg-muted"}`}
                    onClick={(e) => { e.stopPropagation(); toggleSetting(key as keyof typeof settings); }}
                    data-testid={`toggle-${key}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${settings[key as keyof typeof settings] ? "translate-x-5" : "translate-x-1"}`} />
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2 mt-2">
              <label className="text-sm font-medium text-muted-foreground">Output Quality</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                data-testid="select-quality"
              >
                <option>1080p HD</option>
                <option>4K Ultra HD</option>
              </select>
            </div>
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 electric-glow mt-4"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              data-testid="btn-start"
            >
              {activeCount > 0
                ? `Uploading ${activeCount} file${activeCount > 1 ? "s" : ""}…`
                : "Select Files to Upload"}
            </Button>
          </div>
        </div>

        {/* Right Column: Upload Queue */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Upload Queue</h2>
            {jobs.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {doneCount}/{jobs.length} uploaded
              </span>
            )}
          </div>

          {jobs.length === 0 ? (
            <div className="glass border border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground">
              <UploadCloud className="w-8 h-8 opacity-30" />
              <p className="text-sm">No uploads yet — drop a video file to get started</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className={`glass rounded-xl border p-4 relative group transition-colors
                    ${job.status === "done" ? "border-green-500/30" : job.status === "error" ? "border-destructive/30" : "border-primary/30"}`}
                >
                  <div className="flex justify-between items-start mb-3 pr-6">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-medium text-sm truncate max-w-[200px]" title={job.name}>
                        {job.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {job.size}
                        {job.durationSeconds ? ` · ${Math.floor(job.durationSeconds / 60)}:${String(job.durationSeconds % 60).padStart(2, "0")}` : ""}
                      </span>
                      {job.status === "error" && job.error && (
                        <span className="text-xs text-destructive mt-0.5">{job.error}</span>
                      )}
                      {job.status === "done" && job.publicUrl && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">
                            {job.publicUrl.split("/").slice(-2).join("/")}
                          </span>
                          <CopyButton text={job.publicUrl} />
                        </div>
                      )}
                    </div>
                    {statusBadge(job)}
                  </div>

                  <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                    {progressBar(job)}
                  </div>

                  <button
                    className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-card transition-opacity text-muted-foreground hover:text-foreground"
                    onClick={() => job.status === "uploading" ? cancelJob(job.id) : removeJob(job.id)}
                    title={job.status === "uploading" ? "Cancel" : "Remove"}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Queue Status */}
          <div className="mt-auto glass border border-border rounded-xl p-5 bg-card/30">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm">Queue Status</h3>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${activeCount > 0 ? "bg-primary animate-pulse" : "bg-green-500"}`} />
                <span className={`text-xs font-medium ${activeCount > 0 ? "text-primary" : "text-green-400"}`}>
                  {activeCount > 0 ? "Uploading…" : "Ready"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between items-center border-b border-border/50 pb-2">
                <span className="text-muted-foreground">Total Jobs</span>
                <span className="font-medium">{jobs.length}</span>
              </div>
              <div className="flex justify-between items-center border-b border-border/50 pb-2">
                <span className="text-muted-foreground">Uploading</span>
                <span className={`font-medium ${activeCount > 0 ? "text-primary" : ""}`}>{activeCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Completed</span>
                <span className={`font-medium ${doneCount > 0 ? "text-green-400" : ""}`}>{doneCount}</span>
              </div>
            </div>
          </div>

          {/* Go to Projects */}
          {hasUploaded && (
            <Button
              variant="outline"
              className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => navigate("/projects")}
            >
              <FolderKanban className="w-4 h-4" />
              View All Projects
            </Button>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
