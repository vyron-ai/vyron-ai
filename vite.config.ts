import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * AssemblyAI subtitle generation API — server-side Vite middleware.
 *
 * SECURITY: reads ASSEMBLYAI_API_KEY from process.env only (never VITE_*).
 * The key is never embedded in the browser bundle.
 *
 * Flow: POST /api/subtitles/generate { videoUrl }
 *   1. Submit transcript request to AssemblyAI
 *   2. Poll until completed (max 3 min)
 *   3. Group words into ~6-word subtitle segments
 *   4. Return { success, subtitles: [{ id, start, end, text }] }
 */
function assemblyAIPlugin(): Plugin {
  return {
    name: "assemblyai-subtitles-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/subtitles/generate",
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.method !== "POST") return next();

          res.setHeader("Content-Type", "application/json");

          const apiKey = process.env.ASSEMBLYAI_API_KEY ?? "";
          if (!apiKey || apiKey.includes("placeholder")) {
            res.writeHead(400);
            res.end(
              JSON.stringify({
                success: false,
                error:
                  "ASSEMBLYAI_API_KEY is not set. Add it to Replit Secrets " +
                  "(no VITE_ prefix — it must stay server-only), then restart the app.",
              })
            );
            return;
          }

          // Parse request body
          let rawBody = "";
          for await (const chunk of req as AsyncIterable<Buffer>) {
            rawBody += chunk.toString();
          }

          let videoUrl = "";
          try {
            ({ videoUrl } = JSON.parse(rawBody));
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: "Invalid JSON body" }));
            return;
          }

          if (!videoUrl?.trim()) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: "videoUrl is required" }));
            return;
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

            const submitData = (await submitRes.json()) as {
              id?: string;
              error?: string;
              status?: string;
            };

            if (!submitRes.ok || submitData.error) {
              throw new Error(
                submitData.error ??
                  `AssemblyAI submit failed: HTTP ${submitRes.status}`
              );
            }

            const transcriptId = submitData.id!;

            // 2. Poll until completed or error (max 60 × 3s = 3 min)
            type Word = { text: string; start: number; end: number };
            type TranscriptResult = {
              status: string;
              error?: string;
              words?: Word[];
            };

            let result: TranscriptResult | null = null;
            const MAX_POLLS = 60;

            for (let i = 0; i < MAX_POLLS; i++) {
              await new Promise((r) => setTimeout(r, 3000));

              const pollRes = await fetch(
                `${AAI_BASE}/transcript/${transcriptId}`,
                { headers }
              );
              result = (await pollRes.json()) as TranscriptResult;

              if (result.status === "completed") break;
              if (result.status === "error") {
                throw new Error(
                  result.error ?? "AssemblyAI transcription error"
                );
              }
            }

            if (!result || result.status !== "completed") {
              throw new Error(
                "Transcription timed out after 3 minutes. Try a shorter video."
              );
            }

            // 3. Group words → natural subtitle phrases
            const words: Word[] = result.words ?? [];

            if (words.length === 0) {
              res.writeHead(200);
              res.end(
                JSON.stringify({
                  success: true,
                  subtitles: [],
                  warning: "No words detected in the audio.",
                })
              );
              return;
            }

            // Words that sound unnatural as the last word of a subtitle line
            const WEAK = new Set([
              "a","de","que","y","o","para","con","en","la","el","los","las",
              "al","del","un","una","lo","se","su","por","sin","ni","le","les",
              "me","te","nos","si","e","u","its","a","the","of","to","and",
              "or","for","in","on","at","by","an","is","as","be","we","he",
              "she","it","up","do","if","my","so","no","but","not","are","was",
            ]);

            function endsWeak(wordText: string): boolean {
              const bare = wordText.toLowerCase().replace(/[.,!?;:\u00bf\u00a1"""']+/g, "").trim();
              return WEAK.has(bare);
            }

            const subtitles: { id: number; start: number; end: number; text: string }[] = [];
            let segId = 0;
            let i = 0;

            while (i < words.length) {
              const chunk: Word[] = [];

              while (i < words.length) {
                chunk.push(words[i]);
                i++;

                const last = chunk[chunk.length - 1];
                const w = last.text;
                const n = chunk.length;

                // Hard stop — never exceed 9 words
                if (n >= 9) break;

                // Strong punctuation (. ! ?) → break if we have ≥2 words
                if (n >= 2 && /[.!?\u00bf\u00a1]$/.test(w)) break;

                // Soft punctuation (, ; :) → break if we have ≥4 words
                if (n >= 4 && /[,;:]$/.test(w)) break;

                // Ideal break point: ≥5 words and NOT ending on a weak connector
                if (n >= 5 && !endsWeak(w)) break;

                // Safety max: 8 words regardless of connector
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

            res.writeHead(200);
            res.end(JSON.stringify({ success: true, subtitles }));
          } catch (err) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                success: false,
                error:
                  err instanceof Error ? err.message : "Unexpected server error",
              })
            );
          }
        }
      );
    },
  };
}

/**
 * Vite dev-server plugin: exposes /api/setup-bucket as a Node.js middleware.
 *
 * SECURITY: reads SUPABASE_SERVICE_ROLE_KEY from process.env (server-side only).
 * It is NEVER read via import.meta.env / VITE_* so it is NEVER embedded in
 * the browser bundle.
 */
function supabaseSetupPlugin(): Plugin {
  return {
    name: "supabase-setup-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/setup-bucket",
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.method !== "POST") return next();

          res.setHeader("Content-Type", "application/json");

          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
          const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? "")
            .replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, "")
            .replace(/\/$/, "");

          if (!serviceKey || serviceKey.includes("placeholder")) {
            res.writeHead(400);
            res.end(
              JSON.stringify({
                error:
                  "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to Replit Secrets " +
                  "(without the VITE_ prefix — it must stay server-only).",
              })
            );
            return;
          }

          if (!supabaseUrl || !supabaseUrl.startsWith("http")) {
            res.writeHead(400);
            res.end(
              JSON.stringify({ error: "VITE_SUPABASE_URL is not configured." })
            );
            return;
          }

          try {
            const { createClient } = await import("@supabase/supabase-js");
            const admin = createClient(supabaseUrl, serviceKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            });

            const { error: createErr } = await admin.storage.createBucket(
              "videos",
              {
                public: false,
                fileSizeLimit: 2 * 1024 * 1024 * 1024,
                allowedMimeTypes: [
                  "video/mp4",
                  "video/quicktime",
                  "video/x-matroska",
                  "video/webm",
                ],
              }
            );

            let bucketCreated = false;
            let bucketAlreadyExisted = false;

            if (createErr) {
              const msg = (createErr.message ?? "").toLowerCase();
              if (
                msg.includes("already exists") ||
                msg.includes("duplicate") ||
                (createErr as { statusCode?: string }).statusCode === "23505"
              ) {
                bucketAlreadyExisted = true;
              } else {
                res.writeHead(500);
                res.end(
                  JSON.stringify({
                    error: `Bucket creation failed: ${createErr.message}`,
                  })
                );
                return;
              }
            } else {
              bucketCreated = true;
            }

            res.writeHead(200);
            res.end(
              JSON.stringify({
                bucketCreated,
                bucketAlreadyExisted,
                policiesCreated: false,
              })
            );
          } catch (err) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error:
                  err instanceof Error ? err.message : "Unexpected server error",
              })
            );
          }
        }
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    supabaseSetupPlugin(),
    assemblyAIPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 5000,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    watch: {
      ignored: [
        "**/.local/**",
        "**/.cache/**",
        "**/.replit",
        "**/replit.nix",
        "**/supabase/**",
        "**/.git/**",
        "**/node_modules/**",
        "**/dist/**",
      ],
    },
  },
  preview: {
    port: 5000,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
