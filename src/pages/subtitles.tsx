import React, { useMemo, useRef, useState } from "react";
import { exportRemotionVideo } from "@/lib/exportRemotion";

type Subtitle = {
  id: number;
  start: number;
  end: number;
  text: string;
};

const editorialPreset = {
  name: "Editorial Cinema",
  description: "Swiss motion graphics / documental premium",
  fontFamily: "Inter, Helvetica Neue, Arial, sans-serif",
  textColor: "#FFFFFF",
  mutedColor: "rgba(255,255,255,0.62)",
  shadow: "0 28px 80px rgba(0,0,0,0.32)",
};

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function getCurrentSubtitle(subtitles: Subtitle[], currentTime: number) {
  return subtitles.find((s) => currentTime >= s.start && currentTime <= s.end);
}

function getActiveWordIndex(subtitle: Subtitle, currentTime: number) {
  const words = subtitle.text.split(" ").filter(Boolean);

  const duration = Math.max(subtitle.end - subtitle.start, 400);

  const progress = Math.min(
    Math.max((currentTime - subtitle.start) / duration, 0),
    1,
  );

  return Math.min(words.length - 1, Math.floor(progress * words.length));
}

export default function SubtitlesPage() {
  const params = new URLSearchParams(window.location.search);

  const initialVideoUrl = params.get("videoUrl") || "";

  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);

  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);

  const [currentTime, setCurrentTime] = useState(0);

  const [isGenerating, setIsGenerating] = useState(false);

  const [isExporting, setIsExporting] = useState(false);

  const [error, setError] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const currentSubtitle = useMemo(() => {
    return getCurrentSubtitle(subtitles, currentTime);
  }, [subtitles, currentTime]);

  async function generateSubtitles() {
    if (!videoUrl) {
      alert("Pega una URL pública de video primero.");
      return;
    }

    setIsGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/subtitles/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoUrl,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Subtitle generation failed");
      }

      setSubtitles(data.subtitles || []);
    } catch (err: any) {
      setError(err.message || "Error generando subtítulos");
    } finally {
      setIsGenerating(false);
    }
  }

  async function exportVideo() {
    if (!subtitles.length) {
      alert("Primero genera subtítulos.");
      return;
    }

    setIsExporting(true);

    try {
      const file = await exportRemotionVideo({
        videoUrl,
        captions: subtitles,
        videoDuration: subtitles[subtitles.length - 1]?.end || 10000,
      });

      window.open(file, "_blank");
    } catch (err: any) {
      setError(err.message || "Error exportando video");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "white",
        padding: "32px",
        fontFamily: "Inter, Helvetica Neue, Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            marginBottom: 28,
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.35)",
              fontSize: 12,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            VYRON AI STUDIO
          </div>

          <h1
            style={{
              fontSize: 52,
              fontWeight: 900,
              lineHeight: 1,
              marginBottom: 12,
            }}
          >
            Editorial Cinema Subtitles
          </h1>

          <p
            style={{
              color: "rgba(255,255,255,0.56)",
              maxWidth: 900,
              lineHeight: 1.7,
              fontSize: 15,
            }}
          >
            Motor de subtítulos cinematográficos estilo Swiss Design:
            monocromático, sin rebotes, sin amarillo, sin stroke duro, con
            active word por peso tipográfico.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "420px minmax(320px, 1fr)",
            gap: 36,
            alignItems: "start",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 28,
              padding: 28,
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              style={{
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.55)",
                  marginBottom: 10,
                }}
              >
                Video URL
              </div>

              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Pega aquí la URL pública del video..."
                style={{
                  width: "100%",
                  padding: "18px 20px",
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "#030712",
                  color: "white",
                  outline: "none",
                  fontSize: 15,
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: 14,
                marginBottom: 22,
              }}
            >
              <button
                onClick={generateSubtitles}
                disabled={isGenerating}
                style={{
                  flex: 1,
                  padding: "18px",
                  borderRadius: 18,
                  border: "none",
                  background: "#ffffff",
                  color: "#000",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 15,
                }}
              >
                {isGenerating ? "Generando..." : "Generar subtítulos"}
              </button>

              <button
                onClick={exportVideo}
                disabled={isExporting}
                style={{
                  flex: 1,
                  padding: "18px",
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "transparent",
                  color: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 15,
                }}
              >
                {isExporting ? "Exportando..." : "Export MP4"}
              </button>
            </div>

            {error && (
              <div
                style={{
                  padding: "18px",
                  borderRadius: 18,
                  background: "rgba(255,0,0,0.08)",
                  border: "1px solid rgba(255,0,0,0.14)",
                  color: "#ffb4b4",
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                marginTop: 24,
              }}
            >
              <div
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 12,
                  marginBottom: 14,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                Subtitle timeline
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  maxHeight: 460,
                  overflowY: "auto",
                }}
              >
                {subtitles.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 16,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        fontSize: 12,
                        marginBottom: 8,
                      }}
                    >
                      {formatTime(s.start)} — {formatTime(s.end)}
                    </div>

                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 1.5,
                        color: "white",
                      }}
                    >
                      {s.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div
              style={{
                position: "relative",
                margin: "0 auto",
                width: "100%",
                maxWidth: 340,
                aspectRatio: "9 / 16",
                overflow: "hidden",
                borderRadius: 34,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "#000",
                boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
              }}
            >
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  onTimeUpdate={(e) => {
                    setCurrentTime(e.currentTarget.currentTime * 1000);
                  }}
                />
              ) : (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.18)",
                    fontSize: 12,
                    letterSpacing: "0.25em",
                    textTransform: "uppercase",
                  }}
                >
                  video preview
                </div>
              )}

              {currentSubtitle && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    paddingLeft: 30,
                    paddingRight: 30,
                    paddingBottom: 80,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "92%",
                      textAlign: "center",
                      lineHeight: 0.95,
                      fontFamily: editorialPreset.fontFamily,
                      textShadow: editorialPreset.shadow,
                    }}
                  >
                    {currentSubtitle.text
                      .toLowerCase()
                      .split(" ")
                      .filter(Boolean)
                      .map((word, index) => {
                        const activeIndex = getActiveWordIndex(
                          currentSubtitle,
                          currentTime,
                        );

                        const active = index === activeIndex;

                        return (
                          <span
                            key={`${word}-${index}`}
                            style={{
                              display: "inline-block",
                              marginRight: "0.32em",
                              color: editorialPreset.textColor,
                              fontWeight: active ? 850 : 300,
                              fontSize: active ? "34px" : "30px",
                              letterSpacing: active ? "-0.04em" : "0.01em",
                              opacity: active ? 1 : 0.68,
                              transition:
                                "opacity 260ms ease, font-size 260ms ease, font-weight 260ms ease, letter-spacing 260ms ease",
                            }}
                          >
                            {word}
                          </span>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
