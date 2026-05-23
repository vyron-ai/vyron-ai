import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from "remotion";

type Subtitle = {
  id: number;
  start: string;
  end: string;
  text: string;
};

type Preset = "viral" | "minimal" | "neon" | "red" | "gold";

const PRESETS: Record<
  Preset,
  { active: string; normal: string; stroke: string }
> = {
  viral: { active: "#FFD400", normal: "#FFFFFF", stroke: "#000000" },
  minimal: { active: "#FFFFFF", normal: "#FFFFFF", stroke: "#000000" },
  neon: { active: "#38BDF8", normal: "#FFFFFF", stroke: "#020617" },
  red: { active: "#FF3B30", normal: "#FFFFFF", stroke: "#000000" },
  gold: { active: "#F5C542", normal: "#FFF7D6", stroke: "#000000" },
};

function timeToSeconds(time?: string) {
  if (!time) return 0;
  const parts = time.replace(",", ".").split(":");
  if (parts.length !== 3) return 0;
  return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
}

function getCurrentSubtitle(subtitles: Subtitle[], currentTime: number) {
  return subtitles.find((sub) => {
    return (
      currentTime >= timeToSeconds(sub.start) &&
      currentTime <= timeToSeconds(sub.end)
    );
  });
}

function getActiveWordIndex(subtitle: Subtitle, currentTime: number) {
  const words = subtitle.text.split(" ").filter(Boolean);
  const start = timeToSeconds(subtitle.start);
  const end = timeToSeconds(subtitle.end);
  const duration = Math.max(end - start, 0.3);
  const progress = Math.min(Math.max((currentTime - start) / duration, 0), 1);

  return Math.min(Math.floor(progress * words.length), words.length - 1);
}

export function CaptionVideo({
  videoUrl,
  subtitles,
  preset = "viral",
}: {
  videoUrl: string;
  subtitles: Subtitle[];
  preset?: Preset;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const style = PRESETS[preset] || PRESETS.viral;

  const currentSubtitle = getCurrentSubtitle(subtitles, currentTime);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Video
        src={videoUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {currentSubtitle && (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 230,
            paddingLeft: 70,
            paddingRight: 70,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "center",
              gap: 14,
              textAlign: "center",
              lineHeight: 0.92,
            }}
          >
            {currentSubtitle.text
              .split(" ")
              .filter(Boolean)
              .map((word, index) => {
                const activeIndex = getActiveWordIndex(
                  currentSubtitle,
                  currentTime,
                );
                const isActive = index === activeIndex;

                const pop = spring({
                  frame,
                  fps,
                  config: {
                    damping: 10,
                    stiffness: 180,
                    mass: 0.35,
                  },
                });

                const scale = isActive
                  ? interpolate(pop, [0, 1], [0.92, 1.12])
                  : 1;

                return (
                  <span
                    key={`${word}-${index}-${currentSubtitle.id}`}
                    style={{
                      display: "inline-block",
                      color: isActive ? style.active : style.normal,
                      fontSize: isActive ? 78 : 66,
                      fontWeight: 900,
                      fontFamily: "Arial Black, Arial, sans-serif",
                      textTransform: "uppercase",
                      letterSpacing: "-1px",
                      WebkitTextStroke: `5px ${style.stroke}`,
                      textShadow: isActive
                        ? `0 4px 0 ${style.stroke}, 0 0 18px ${style.active}`
                        : `0 4px 0 ${style.stroke}`,
                      transform: `scale(${scale})`,
                    }}
                  >
                    {word}
                  </span>
                );
              })}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
