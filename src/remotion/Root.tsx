import React from "react";
import { Composition } from "remotion";
import { CaptionVideo } from "./CaptionVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VyronCaptionVideo"
        component={CaptionVideo}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          videoUrl: "",
          subtitles: [],
          preset: "viral",
        }}
      />
    </>
  );
};
