import { useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  UploadCloud, Info, Check, X, CircleDashed, AlertCircle,
  Copy, CheckCheck, ExternalLink, FolderKanban,
  CheckCircle2, XCircle, HelpCircle, RefreshCw, ChevronDown,
  Wand2, Loader2, ShieldAlert, Terminal, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVideoUpload, UploadJob } from "@/hooks/useVideoUpload";
import { getStorageDiagnostics } from "@/lib/storage";
import { useBuckets } from "@/hooks/useBuckets";
import { useBucketSetup } from "@/hooks/useBucketSetup";
import { isAdminConfigured } from "@/lib/supabaseAdmin";
import { SETUP_BUCKET, buildPolicySQL } from "@/lib/bucketSetup";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase";

const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"];
const ACCEPT_ATTR = ".mp4,.mov,.mkv,.webm,video/mp4,video/quicktime,video/x-matroska,video/webm";

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : HelpCircle;
  const color = ok === true ? "text-green-400" : ok === false ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1 font-medium ${color}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {detail ?? (ok ? "Yes" : "No")}
      </span>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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
      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 border border-primary/20"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

// ── Policy SQL Modal ──────────────────────────────────────────────────────────
function PolicySQLModal({
  bucketCreated,
  bucketAlreadyExisted,
  policiesCreated,
  policySQL,
  onClose,
  onRefetch,
}: {
  bucketCreated: boolean;
  bucketAlreadyExisted: boolean;
  policiesCreated: boolean;
  policySQL: string;
  onClose: () => void;
  onRefetch: () => void;
}) {
  const projectRef = (() => {
    try {
      const url = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
      const host = new URL(url).hostname;
      const m = host.match(/^([a-z0-9]+)\.supabase\.co$/);
      return m ? m[1] : null;
    } catch { return null; }
  })();
  const sqlEditorUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
    : "https://supabase.com/dashboard/project/_/sql/new";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-strong border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col gap-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              policiesCreated ? "bg-green-500/20" : "bg-primary/20"
            }`}>
              <Database className={`w-5 h-5 ${policiesCreated ? "text-green-400" : "text-primary"}`} />
            </div>
            <div>
              <h2 className="font-bold text-sm">Bucket Setup Complete</h2>
              <p className="text-xs text-muted-foreground">
                {bucketAlreadyExisted ? "Bucket already existed" : "Bucket created successfully"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status summary */}
        <div className="px-6 py-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <span>
              {bucketAlreadyExisted
                ? `Bucket "${SETUP_BUCKET}" already existed — no changes needed`
                : `Bucket "${SETUP_BUCKET}" created with 2 GB file-size limit`}
            </span>
          </div>
          {policiesCreated ? (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <span>Storage policies applied automatically</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Policies need one manual step (see SQL below)</span>
            </div>
          )}
        </div>

        {/* SQL section — shown when policies weren't auto-applied */}
        {!policiesCreated && policySQL && (
          <div className="px-6 pb-4 flex flex-col gap-3">
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p>
                The Management API requires a personal access token (not the service role key),
                so policies couldn't be applied automatically.{" "}
                <strong className="text-foreground">Copy the SQL below and run it in your Supabase SQL Editor</strong> — it takes ~10 seconds.
              </p>
            </div>

            {/* SQL block */}
            <div className="relative rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-card/80 border-b border-border">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground">SQL Editor</span>
                </div>
                <CopyButton text={policySQL} label="Copy SQL" />
              </div>
              <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed p-3 overflow-x-auto max-h-48 bg-background/50 whitespace-pre">
                {policySQL}
              </pre>
            </div>

            <a
              href={sqlEditorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline py-1"
            >
              <ExternalLink className="w-4 h-4" />
              Open Supabase SQL Editor →
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { onRefetch(); onClose(); }}
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh bucket list
          </Button>
          <Button size="sm" onClick={onClose} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── One-click Bucket Setup Button ─────────────────────────────────────────────
function BucketSetupSection({ refetch }: { refetch: () => void }) {
  const [modalOpen, setModalOpen] = useState(false);
  const { phase, result, run } = useBucketSetup(refetch);

  const handleClick = async () => {
    await run();
    setModalOpen(true);
  };

  if (!isAdminConfigured) {
    return (
      <div className="flex flex-col gap-2 pt-3 border-t border-border">
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-card/50 px-3 py-2.5 rounded-lg border border-border">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-foreground">One-click bucket setup available</span>
            <span>
              Add{" "}
              <code className="text-primary bg-primary/10 px-1 rounded font-mono">
                VITE_SUPABASE_SERVICE_ROLE_KEY
              </code>{" "}
              to your Replit Secrets to enable automatic bucket creation.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2 pt-3 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Setup
          </span>
          {phase === "error" && result?.error && (
            <span className="text-[10px] text-destructive max-w-[200px] truncate" title={result.error}>
              {result.error}
            </span>
          )}
        </div>

        <button
          onClick={handleClick}
          disabled={phase === "loading"}
          className={`flex items-center justify-center gap-2 w-full h-9 rounded-lg text-sm font-semibold transition-all border
            ${phase === "loading"
              ? "bg-primary/10 border-primary/20 text-primary cursor-not-allowed"
              : phase === "done"
              ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/15"
              : "bg-primary/15 border-primary/30 text-primary hover:bg-primary/20 electric-glow"
            }`}
        >
          {phase === "loading" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating bucket…</>
          ) : phase === "done" ? (
            <><CheckCircle2 className="w-4 h-4" /> Bucket ready — click to review</>
          ) : (
            <><Wand2 className="w-4 h-4" /> Create "videos" bucket + policies</>
          )}
        </button>

        {phase !== "loading" && (
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            Creates the <code className="font-mono">videos</code> bucket with a 2 GB file limit.
            Policy SQL is shown for a one-paste finish.
          </p>
        )}
      </div>

      {modalOpen && result && !result.error && (
        <PolicySQLModal
          bucketCreated={result.bucketCreated}
          bucketAlreadyExisted={result.bucketAlreadyExisted}
          policiesCreated={result.policiesCreated}
          policySQL={result.policySQL}
          onClose={() => setModalOpen(false)}
          onRefetch={refetch}
        />
      )}
    </>
  );
}

// ── Supabase Connection + Bucket Selector Panel ───────────────────────────────
function SupabaseStatusPanel({ isDemoMode }: { isDemoMode: boolean }) {
  const diag = getStorageDiagnostics();
  const { buckets, loading, error: bucketsError, selectedBucket, setSelectedBucket, refetch } = useBuckets();

  const hasBuckets = buckets.length > 0;
  const hasVideosBucket = buckets.some((b) => b.name === SETUP_BUCKET);

  return (
    <div className="glass border border-border rounded-xl p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">Supabase Connection</h3>
        <div className="flex items-center gap-2">
          {isSupabaseConfigured && (
            <button
              onClick={refetch}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Re-check connection"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            diag.clientReady
              ? "text-green-400 border-green-500/40 bg-green-500/10"
              : "text-destructive border-destructive/40 bg-destructive/10"
          }`}>
            {diag.clientReady ? "Connected" : "Not configured"}
          </span>
        </div>
      </div>

      {/* Status rows */}
      <div className="flex flex-col gap-2">
        <StatusRow label="VITE_SUPABASE_URL" ok={diag.urlLoaded} />
        <StatusRow label="VITE_SUPABASE_ANON_KEY" ok={diag.keyLoaded} />
        <StatusRow label="VITE_SUPABASE_SERVICE_ROLE_KEY" ok={isAdminConfigured} detail={isAdminConfigured ? "Loaded" : "Not set"} />
        <StatusRow label="Auth mode" ok={null} detail={isDemoMode ? "Demo (anon)" : "Authenticated"} />
      </div>

      {/* Not-configured hint */}
      {!diag.clientReady && (
        <p className="text-[11px] text-muted-foreground border-t border-border pt-3 mt-1">
          Add{" "}
          <code className="text-primary bg-primary/10 px-1 rounded font-mono">VITE_SUPABASE_URL</code> and{" "}
          <code className="text-primary bg-primary/10 px-1 rounded font-mono">VITE_SUPABASE_ANON_KEY</code>{" "}
          in <strong>Tools → Secrets</strong>, then click <strong>Restart</strong>.
        </p>
      )}

      {/* Bucket selector */}
      {diag.clientReady && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Storage Bucket
            </span>
            {loading && <span className="text-[10px] text-muted-foreground animate-pulse">Detecting…</span>}
          </div>

          {bucketsError && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{bucketsError}</span>
            </div>
          )}

          {!loading && !bucketsError && !hasBuckets && (
            <div className="text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20">
              No buckets found. Use the setup button below, or create one in{" "}
              <a
                href="https://supabase.com/dashboard/project/_/storage/buckets"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-amber-300"
              >
                Supabase → Storage
              </a>.
            </div>
          )}

          {hasBuckets && (
            <>
              <div className="relative">
                <select
                  value={selectedBucket ?? ""}
                  onChange={(e) => setSelectedBucket(e.target.value)}
                  className="w-full h-9 pl-3 pr-8 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
                >
                  {buckets.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}{b.public ? " (public)" : " (private)"}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>

              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {buckets.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBucket(b.name)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                      selectedBucket === b.name
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {isDemoMode && selectedBucket && (
            <p className="text-[11px] text-amber-400 mt-1">
              Demo mode uses the anon token. Uploads to{" "}
              <strong>"{selectedBucket}"</strong> require an anonymous INSERT policy.
            </p>
          )}
        </div>
      )}

      {/* One-click setup — show when Supabase is configured AND "videos" bucket is missing */}
      {diag.clientReady && !hasVideosBucket && (
        <BucketSetupSection refetch={refetch} />
      )}

      {/* Show policy SQL link when videos bucket exists but admin key isn't set */}
      {diag.clientReady && hasVideosBucket && !bucketsError && (
        <div className="border-t border-border pt-3 flex items-center justify-between">
          <span className="text-[11px] text-green-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Bucket "{SETUP_BUCKET}" exists
          </span>
          <button
            onClick={() => {
              const sql = buildPolicySQL();
              navigator.clipboard.writeText(sql);
            }}
            className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            title="Copy storage policy SQL to clipboard"
          >
            <Copy className="w-3 h-3" /> Copy policy SQL
          </button>
        </div>
      )}
    </div>
  );
}

// ── Upload helpers ────────────────────────────────────────────────────────────
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
  return <div className="h-full bg-primary transition-all duration-300" style={{ width: `${job.progress}%` }} />;
}

function UploadCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline" title="Copy URL">
      {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy URL"}
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function UploadPage() {
  const [, navigate] = useLocation();
  const { isDemoMode } = useAuth();
  const { selectedBucket } = useBuckets();
  const [quality, setQuality] = useState("1080p HD");
  const [settings, setSettings] = useState({ noise: true, sharpness: true, color: true, framerate: false });
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { jobs, addFiles, cancelJob, removeJob, activeCount, doneCount } = useVideoUpload(
    selectedBucket ?? undefined
  );

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

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }, [handleFiles]);
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; };

  const hasError = jobs.some((j) => j.status === "error");
  const hasUploaded = jobs.some((j) => j.status === "done");

  return (
    <AppLayout title="Video AI">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Left Column ── */}
        <div className="flex flex-col gap-6">

          <SupabaseStatusPanel isDemoMode={isDemoMode} />

          {/* Dropzone */}
          <div
            className={`glass-strong border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 transition-colors cursor-pointer group relative overflow-hidden
              ${dragging ? "border-primary bg-primary/10" : "border-primary/40 hover:bg-primary/5"}`}
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
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
            {selectedBucket && (
              <div className="text-[11px] text-muted-foreground bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
                Uploading to: <strong className="text-primary">{selectedBucket}</strong>
              </div>
            )}
            <div className="flex gap-2 text-xs font-mono text-muted-foreground bg-background/50 px-3 py-1 rounded border border-border">
              <span>MP4</span><span>MOV</span><span>MKV</span><span>WebM</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Max file size: 2 GB · Up to 4K resolution</p>
            <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} multiple className="sr-only" onChange={onInputChange} data-testid="file-input" />
          </div>

          {/* Error panel */}
          {hasError && (
            <div className="flex flex-col gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-semibold text-destructive">Upload failed</p>
                  {jobs.filter((j) => j.status === "error").map((j) => (
                    <p key={j.id} className="text-xs text-muted-foreground font-mono bg-background/50 px-2 py-1.5 rounded border border-border break-words">
                      <span className="text-foreground font-medium">{j.name}:</span> {j.error ?? "Unknown error"}
                    </p>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-1 flex-wrap">
                <a href="https://supabase.com/dashboard/project/_/storage/buckets" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <ExternalLink className="w-3 h-3" /> Storage Buckets
                </a>
                <a href="https://supabase.com/dashboard/project/_/storage/policies" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <ExternalLink className="w-3 h-3" /> Storage Policies
                </a>
              </div>
            </div>
          )}

          {/* Success CTA */}
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
              <strong className="text-foreground font-medium">Enhancement policy:</strong>{" "}
              VYRON AI enhances your real footage — it does not generate new scenes or add objects.
            </p>
          </div>

          {/* Enhancement settings */}
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
              {activeCount > 0 ? `Uploading ${activeCount} file${activeCount > 1 ? "s" : ""}…` : "Select Files to Upload"}
            </Button>
          </div>
        </div>

        {/* ── Right Column: Upload Queue ── */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Upload Queue</h2>
            {jobs.length > 0 && (
              <span className="text-xs text-muted-foreground">{doneCount}/{jobs.length} uploaded</span>
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
                      <span className="font-medium text-sm truncate max-w-[200px]" title={job.name}>{job.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {job.size}
                        {job.durationSeconds ? ` · ${Math.floor(job.durationSeconds / 60)}:${String(job.durationSeconds % 60).padStart(2, "0")}` : ""}
                        {job.bucket ? ` · ${job.bucket}` : ""}
                      </span>
                      {job.status === "error" && job.error && (
                        <span className="text-xs text-destructive mt-0.5 break-words max-w-[280px]">{job.error}</span>
                      )}
                      {job.status === "done" && job.publicUrl && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">
                            {job.publicUrl.split("/").slice(-2).join("/")}
                          </span>
                          <UploadCopyButton text={job.publicUrl} />
                        </div>
                      )}
                    </div>
                    {statusBadge(job)}
                  </div>
                  <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">{progressBar(job)}</div>
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
                <span className="text-muted-foreground">Active Bucket</span>
                <span className="font-medium text-primary">{selectedBucket ?? "—"}</span>
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

          {hasUploaded && (
            <Button variant="outline" className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10" onClick={() => navigate("/projects")}>
              <FolderKanban className="w-4 h-4" />
              View All Projects
            </Button>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
