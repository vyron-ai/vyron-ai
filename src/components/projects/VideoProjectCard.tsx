import { useRef, useState } from "react";
import {
  ExternalLink, Copy, Trash2, CheckCheck,
  CheckCircle2, Clock, CircleDashed, AlertCircle, Upload,
  Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoProject, formatProjectDate } from "@/lib/projects";
import { formatBytes } from "@/lib/storage";

interface VideoProjectCardProps {
  project: VideoProject;
  onDelete?: (id: string) => void;
}

function StatusBadge({ status }: { status: string }) {
  const base = "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border";
  switch (status) {
    case "completed":
      return <span className={`${base} bg-green-500/15 text-green-400 border-green-500/30`}><CheckCircle2 className="w-3 h-3" /> Completed</span>;
    case "processing":
      return <span className={`${base} bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse`}><CircleDashed className="w-3 h-3 animate-spin" /> Processing</span>;
    case "queued":
      return <span className={`${base} bg-muted text-muted-foreground border-border`}><Clock className="w-3 h-3" /> Queued</span>;
    case "failed":
      return <span className={`${base} bg-red-500/15 text-red-400 border-red-500/30`}><AlertCircle className="w-3 h-3" /> Failed</span>;
    default:
      return <span className={`${base} bg-primary/15 text-primary border-primary/30`}><Upload className="w-3 h-3" /> Uploaded</span>;
  }
}

function VideoThumbnail({ src, fileName }: { src: string; fileName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [thumbReady, setThumbReady] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 1;
    }
  };

  const handleSeeked = () => {
    setThumbReady(true);
  };

  const handleError = () => {
    setThumbError(true);
  };

  return (
    <div className="relative w-full h-full">
      {/* Fallback / placeholder shown until video thumb is ready */}
      {!thumbReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/20">
          {thumbError ? (
            <>
              <Film className="w-8 h-8 text-muted-foreground/40" />
              <span className="text-[10px] text-muted-foreground/60 font-mono truncate px-4 max-w-full text-center">{fileName}</span>
            </>
          ) : (
            <Film className="w-8 h-8 text-primary/30 animate-pulse" />
          )}
        </div>
      )}

      {!thumbError && (
        <video
          ref={videoRef}
          src={src}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${thumbReady ? "opacity-100" : "opacity-0"}`}
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          onSeeked={handleSeeked}
          onError={handleError}
        />
      )}

      {/* Cinematic gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent pointer-events-none" />
    </div>
  );
}

function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button
      variant="outline"
      size="sm"
      className="flex-1 h-8 text-xs gap-1.5 border-border bg-transparent hover:bg-muted"
      onClick={copy}
      title="Copy public URL"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy URL"}
    </Button>
  );
}

export function VideoProjectCard({ project, onDelete }: VideoProjectCardProps) {
  const { id, file_name, file_url, file_size, status, created_at } = project;

  return (
    <div
      className="glass rounded-xl overflow-hidden border border-border hover:border-primary/40 transition-all duration-300 flex flex-col group"
      data-testid={`project-card-${id}`}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-card overflow-hidden">
        <VideoThumbnail src={file_url} fileName={file_name} />

        {/* Status badge top-left */}
        <div className="absolute top-2.5 left-2.5 z-10">
          <StatusBadge status={status} />
        </div>

        {/* File size badge bottom-right */}
        <div className="absolute bottom-2.5 right-2.5 z-10 px-2 py-0.5 rounded bg-black/70 text-[10px] text-white font-mono backdrop-blur-sm">
          {formatBytes(file_size)}
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-col gap-3 p-4 flex-1">
        {/* File name + date */}
        <div className="flex flex-col gap-0.5">
          <h3
            className="font-semibold text-sm leading-snug truncate text-foreground"
            title={file_name}
          >
            {file_name}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {formatProjectDate(created_at)}
          </p>
        </div>

        {/* Public URL — truncated, monospace */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/40 border border-border/60">
          <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
          <a
            href={file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-primary truncate hover:underline min-w-0"
            title={file_url}
          >
            {file_url.replace(/^https?:\/\//, "").slice(0, 48)}…
          </a>
        </div>

        {/* Action buttons — always visible */}
        <div className="flex items-center gap-2 mt-auto pt-1">
          <a
            href={file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button
              variant="default"
              size="sm"
              className="w-full h-8 text-xs gap-1.5 bg-primary/90 hover:bg-primary text-primary-foreground electric-glow"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Video
            </Button>
          </a>

          <CopyUrlButton url={file_url} />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border hover:border-destructive/30"
            onClick={() => onDelete?.(id)}
            title="Delete project"
            data-testid={`btn-delete-${id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
