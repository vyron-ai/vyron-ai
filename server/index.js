import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist", "public");

const app = express();
app.use(express.json());

// ── POST /api/subtitles/generate ──────────────────────────────────────────────
app.post("/api/subtitles/generate", async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  const apiKey = process.env.ASSEMBLYAI_API_KEY ?? "";
  if (!apiKey || apiKey.includes("placeholder")) {
    return res.status(400).json({
      success: false,
      error:
        "ASSEMBLYAI_API_KEY is not set. Add it to Replit Secrets " +
        "(no VITE_ prefix — it must stay server-only), then restart the app.",
    });
  }

  const { videoUrl } = req.body ?? {};
  if (!videoUrl?.trim()) {
    return res.status(400).json({ success: false, error: "videoUrl is required" });
  }

  const AAI_BASE = "https://api.assemblyai.com/v2";
  const headers = {
    Authorization: apiKey,
    "Content-Type": "application/json",
  };

  try {
    // 1. Submit transcription job
    const submitRes = await fetch(`${AAI_BASE}/transcript`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        audio_url: videoUrl.trim(),
        punctuate: true,
        format_text: true,
        language_detection: true,
        speech_models: ["universal-3-pro"],
      }),
    });

    const submitData = await submitRes.json();
    if (!submitRes.ok || submitData.error) {
      throw new Error(
        submitData.error ?? `AssemblyAI submit failed: HTTP ${submitRes.status}`
      );
    }

    const transcriptId = submitData.id;

    // 2. Poll until completed or error (max 60 × 3s = 3 min)
    let result = null;
    const MAX_POLLS = 60;

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`${AAI_BASE}/transcript/${transcriptId}`, { headers });
      result = await pollRes.json();
      if (result.status === "completed") break;
      if (result.status === "error") {
        throw new Error(result.error ?? "AssemblyAI transcription error");
      }
    }

    if (!result || result.status !== "completed") {
      throw new Error("Transcription timed out after 3 minutes. Try a shorter video.");
    }

    // 3. Group words → natural subtitle phrases
    const words = result.words ?? [];

    if (words.length === 0) {
      return res.json({
        success: true,
        subtitles: [],
        warning: "No words detected in the audio.",
      });
    }

    const WEAK = new Set([
      "a","de","que","y","o","para","con","en","la","el","los","las",
      "al","del","un","una","lo","se","su","por","sin","ni","le","les",
      "me","te","nos","si","e","u","its","the","of","to","and",
      "or","for","in","on","at","by","an","is","as","be","we","he",
      "she","it","up","do","if","my","so","no","but","not","are","was",
    ]);

    function endsWeak(wordText) {
      const bare = wordText.toLowerCase().replace(/[.,!?;:\u00bf\u00a1"""']+/g, "").trim();
      return WEAK.has(bare);
    }

    const subtitles = [];
    let segId = 0;
    let i = 0;

    while (i < words.length) {
      const chunk = [];
      while (i < words.length) {
        chunk.push(words[i]);
        i++;
        const last = chunk[chunk.length - 1];
        const w = last.text;
        const n = chunk.length;
        if (n >= 9) break;
        if (n >= 2 && /[.!?\u00bf\u00a1]$/.test(w)) break;
        if (n >= 4 && /[,;:]$/.test(w)) break;
        if (n >= 5 && !endsWeak(w)) break;
        if (n >= 8) break;
      }
      if (chunk.length > 0) {
        subtitles.push({
          id: segId++,
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
          text: chunk.map((w) => w.text).join(" "),
        });
      }
    }

    return res.json({ success: true, subtitles });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Unexpected server error",
    });
  }
});

// ── Serve built React app (SPA) ───────────────────────────────────────────────
app.use(express.static(distDir));

app.get("/{*path}", (_req, res) => {
  res.sendFile(join(distDir, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 5000);
createServer(app).listen(PORT, "0.0.0.0", () => {
  console.log(`VYRON AI server running on http://0.0.0.0:${PORT}`);
});
