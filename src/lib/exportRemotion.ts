type ExportRemotionInput = {
  videoUrl: string;
  captions: any[];
  videoDuration: number;
};

export async function exportRemotionVideo({
  videoUrl,
  captions,
  videoDuration,
}: ExportRemotionInput) {
  const response = await fetch("/api/render/remotion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      videoUrl,
      captions,
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: Math.ceil(videoDuration * 30),
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Error exportando con Remotion");
  }

  return data.file as string;
}
