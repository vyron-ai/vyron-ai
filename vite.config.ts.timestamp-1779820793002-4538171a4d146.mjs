// vite.config.ts
import { defineConfig } from "file:///home/runner/workspace/node_modules/.pnpm/vite@5.4.21_@types+node@22.19.19_lightningcss@1.32.0/node_modules/vite/dist/node/index.js";
import react from "file:///home/runner/workspace/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@22.19.19_lightningcss@1.32.0_/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///home/runner/workspace/node_modules/.pnpm/@tailwindcss+vite@4.3.0_vite@5.4.21_@types+node@22.19.19_lightningcss@1.32.0_/node_modules/@tailwindcss/vite/dist/index.mjs";
import path from "path";
import runtimeErrorOverlay from "file:///home/runner/workspace/node_modules/.pnpm/@replit+vite-plugin-runtime-error-modal@0.0.3/node_modules/@replit/vite-plugin-runtime-error-modal/dist/index.mjs";
var __vite_injected_original_dirname = "/home/runner/workspace";
function assemblyAIPlugin() {
  return {
    name: "assemblyai-subtitles-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/subtitles/generate",
        async (req, res, next) => {
          if (req.method !== "POST") return next();
          res.setHeader("Content-Type", "application/json");
          const apiKey = process.env.ASSEMBLYAI_API_KEY ?? "";
          if (!apiKey || apiKey.includes("placeholder")) {
            res.writeHead(400);
            res.end(
              JSON.stringify({
                success: false,
                error: "ASSEMBLYAI_API_KEY is not set. Add it to Replit Secrets (no VITE_ prefix \u2014 it must stay server-only), then restart the app."
              })
            );
            return;
          }
          let rawBody = "";
          for await (const chunk of req) {
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
            "Content-Type": "application/json"
          };
          try {
            let endsWeak2 = function(wordText) {
              const bare = wordText.toLowerCase().replace(/[.,!?;:\u00bf\u00a1"""']+/g, "").trim();
              return WEAK.has(bare);
            };
            var endsWeak = endsWeak2;
            const submitRes = await fetch(`${AAI_BASE}/transcript`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                audio_url: videoUrl.trim(),
                punctuate: true,
                format_text: true,
                language_detection: true,
                speech_models: ["universal-3-pro"]
              })
            });
            const submitData = await submitRes.json();
            if (!submitRes.ok || submitData.error) {
              throw new Error(
                submitData.error ?? `AssemblyAI submit failed: HTTP ${submitRes.status}`
              );
            }
            const transcriptId = submitData.id;
            let result = null;
            const MAX_POLLS = 60;
            for (let i2 = 0; i2 < MAX_POLLS; i2++) {
              await new Promise((r) => setTimeout(r, 3e3));
              const pollRes = await fetch(
                `${AAI_BASE}/transcript/${transcriptId}`,
                { headers }
              );
              result = await pollRes.json();
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
            const words = result.words ?? [];
            if (words.length === 0) {
              res.writeHead(200);
              res.end(
                JSON.stringify({
                  success: true,
                  subtitles: [],
                  warning: "No words detected in the audio."
                })
              );
              return;
            }
            const WEAK = /* @__PURE__ */ new Set([
              "a",
              "de",
              "que",
              "y",
              "o",
              "para",
              "con",
              "en",
              "la",
              "el",
              "los",
              "las",
              "al",
              "del",
              "un",
              "una",
              "lo",
              "se",
              "su",
              "por",
              "sin",
              "ni",
              "le",
              "les",
              "me",
              "te",
              "nos",
              "si",
              "e",
              "u",
              "its",
              "a",
              "the",
              "of",
              "to",
              "and",
              "or",
              "for",
              "in",
              "on",
              "at",
              "by",
              "an",
              "is",
              "as",
              "be",
              "we",
              "he",
              "she",
              "it",
              "up",
              "do",
              "if",
              "my",
              "so",
              "no",
              "but",
              "not",
              "are",
              "was"
            ]);
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
                if (n >= 5 && !endsWeak2(w)) break;
                if (n >= 8) break;
              }
              if (chunk.length > 0) {
                subtitles.push({
                  id: segId++,
                  start: chunk[0].start,
                  end: chunk[chunk.length - 1].end,
                  text: chunk.map((w) => w.text).join(" ")
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
                error: err instanceof Error ? err.message : "Unexpected server error"
              })
            );
          }
        }
      );
    }
  };
}
function supabaseSetupPlugin() {
  return {
    name: "supabase-setup-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/setup-bucket",
        async (req, res, next) => {
          if (req.method !== "POST") return next();
          res.setHeader("Content-Type", "application/json");
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
          const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? "").replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, "").replace(/\/$/, "");
          if (!serviceKey || serviceKey.includes("placeholder")) {
            res.writeHead(400);
            res.end(
              JSON.stringify({
                error: "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to Replit Secrets (without the VITE_ prefix \u2014 it must stay server-only)."
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
            const { createClient } = await import("file:///home/runner/workspace/node_modules/.pnpm/@supabase+supabase-js@2.106.1/node_modules/@supabase/supabase-js/dist/index.mjs");
            const admin = createClient(supabaseUrl, serviceKey, {
              auth: { autoRefreshToken: false, persistSession: false }
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
                  "video/webm"
                ]
              }
            );
            let bucketCreated = false;
            let bucketAlreadyExisted = false;
            if (createErr) {
              const msg = (createErr.message ?? "").toLowerCase();
              if (msg.includes("already exists") || msg.includes("duplicate") || createErr.statusCode === "23505") {
                bucketAlreadyExisted = true;
              } else {
                res.writeHead(500);
                res.end(
                  JSON.stringify({
                    error: `Bucket creation failed: ${createErr.message}`
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
                policiesCreated: false
              })
            );
          } catch (err) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : "Unexpected server error"
              })
            );
          }
        }
      );
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    supabaseSetupPlugin(),
    assemblyAIPlugin()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "src")
    },
    dedupe: ["react", "react-dom"]
  },
  build: {
    outDir: path.resolve(__vite_injected_original_dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    port: 5e3,
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
        "**/dist/**"
      ]
    }
  },
  preview: {
    port: 5e3,
    host: "0.0.0.0",
    allowedHosts: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9ydW5uZXIvd29ya3NwYWNlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9ydW5uZXIvd29ya3NwYWNlL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3J1bm5lci93b3Jrc3BhY2Uvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIFBsdWdpbiB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHJ1bnRpbWVFcnJvck92ZXJsYXkgZnJvbSBcIkByZXBsaXQvdml0ZS1wbHVnaW4tcnVudGltZS1lcnJvci1tb2RhbFwiO1xuaW1wb3J0IHR5cGUgeyBJbmNvbWluZ01lc3NhZ2UsIFNlcnZlclJlc3BvbnNlIH0gZnJvbSBcImh0dHBcIjtcblxuLyoqXG4gKiBBc3NlbWJseUFJIHN1YnRpdGxlIGdlbmVyYXRpb24gQVBJIFx1MjAxNCBzZXJ2ZXItc2lkZSBWaXRlIG1pZGRsZXdhcmUuXG4gKlxuICogU0VDVVJJVFk6IHJlYWRzIEFTU0VNQkxZQUlfQVBJX0tFWSBmcm9tIHByb2Nlc3MuZW52IG9ubHkgKG5ldmVyIFZJVEVfKikuXG4gKiBUaGUga2V5IGlzIG5ldmVyIGVtYmVkZGVkIGluIHRoZSBicm93c2VyIGJ1bmRsZS5cbiAqXG4gKiBGbG93OiBQT1NUIC9hcGkvc3VidGl0bGVzL2dlbmVyYXRlIHsgdmlkZW9VcmwgfVxuICogICAxLiBTdWJtaXQgdHJhbnNjcmlwdCByZXF1ZXN0IHRvIEFzc2VtYmx5QUlcbiAqICAgMi4gUG9sbCB1bnRpbCBjb21wbGV0ZWQgKG1heCAzIG1pbilcbiAqICAgMy4gR3JvdXAgd29yZHMgaW50byB+Ni13b3JkIHN1YnRpdGxlIHNlZ21lbnRzXG4gKiAgIDQuIFJldHVybiB7IHN1Y2Nlc3MsIHN1YnRpdGxlczogW3sgaWQsIHN0YXJ0LCBlbmQsIHRleHQgfV0gfVxuICovXG5mdW5jdGlvbiBhc3NlbWJseUFJUGx1Z2luKCk6IFBsdWdpbiB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogXCJhc3NlbWJseWFpLXN1YnRpdGxlcy1hcGlcIixcbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyKSB7XG4gICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKFxuICAgICAgICBcIi9hcGkvc3VidGl0bGVzL2dlbmVyYXRlXCIsXG4gICAgICAgIGFzeW5jIChyZXE6IEluY29taW5nTWVzc2FnZSwgcmVzOiBTZXJ2ZXJSZXNwb25zZSwgbmV4dDogKCkgPT4gdm9pZCkgPT4ge1xuICAgICAgICAgIGlmIChyZXEubWV0aG9kICE9PSBcIlBPU1RcIikgcmV0dXJuIG5leHQoKTtcblxuICAgICAgICAgIHJlcy5zZXRIZWFkZXIoXCJDb250ZW50LVR5cGVcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuXG4gICAgICAgICAgY29uc3QgYXBpS2V5ID0gcHJvY2Vzcy5lbnYuQVNTRU1CTFlBSV9BUElfS0VZID8/IFwiXCI7XG4gICAgICAgICAgaWYgKCFhcGlLZXkgfHwgYXBpS2V5LmluY2x1ZGVzKFwicGxhY2Vob2xkZXJcIikpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwKTtcbiAgICAgICAgICAgIHJlcy5lbmQoXG4gICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjpcbiAgICAgICAgICAgICAgICAgIFwiQVNTRU1CTFlBSV9BUElfS0VZIGlzIG5vdCBzZXQuIEFkZCBpdCB0byBSZXBsaXQgU2VjcmV0cyBcIiArXG4gICAgICAgICAgICAgICAgICBcIihubyBWSVRFXyBwcmVmaXggXHUyMDE0IGl0IG11c3Qgc3RheSBzZXJ2ZXItb25seSksIHRoZW4gcmVzdGFydCB0aGUgYXBwLlwiLFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcbiAgICAgICAgICBsZXQgcmF3Qm9keSA9IFwiXCI7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiByZXEgYXMgQXN5bmNJdGVyYWJsZTxCdWZmZXI+KSB7XG4gICAgICAgICAgICByYXdCb2R5ICs9IGNodW5rLnRvU3RyaW5nKCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHZpZGVvVXJsID0gXCJcIjtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgKHsgdmlkZW9VcmwgfSA9IEpTT04ucGFyc2UocmF3Qm9keSkpO1xuICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDApO1xuICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIEpTT04gYm9keVwiIH0pKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoIXZpZGVvVXJsPy50cmltKCkpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwKTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFwidmlkZW9VcmwgaXMgcmVxdWlyZWRcIiB9KSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgQUFJX0JBU0UgPSBcImh0dHBzOi8vYXBpLmFzc2VtYmx5YWkuY29tL3YyXCI7XG4gICAgICAgICAgY29uc3QgaGVhZGVycyA9IHtcbiAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGFwaUtleSxcbiAgICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gMS4gU3VibWl0IHRyYW5zY3JpcHRpb24gam9iXG4gICAgICAgICAgICBjb25zdCBzdWJtaXRSZXMgPSBhd2FpdCBmZXRjaChgJHtBQUlfQkFTRX0vdHJhbnNjcmlwdGAsIHtcbiAgICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgICAgICAgICAgaGVhZGVycyxcbiAgICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgIGF1ZGlvX3VybDogdmlkZW9VcmwudHJpbSgpLFxuICAgICAgICAgICAgICAgIHB1bmN0dWF0ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBmb3JtYXRfdGV4dDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBsYW5ndWFnZV9kZXRlY3Rpb246IHRydWUsXG4gICAgICAgICAgICAgICAgc3BlZWNoX21vZGVsczogW1widW5pdmVyc2FsLTMtcHJvXCJdLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBzdWJtaXREYXRhID0gKGF3YWl0IHN1Ym1pdFJlcy5qc29uKCkpIGFzIHtcbiAgICAgICAgICAgICAgaWQ/OiBzdHJpbmc7XG4gICAgICAgICAgICAgIGVycm9yPzogc3RyaW5nO1xuICAgICAgICAgICAgICBzdGF0dXM/OiBzdHJpbmc7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAoIXN1Ym1pdFJlcy5vayB8fCBzdWJtaXREYXRhLmVycm9yKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBzdWJtaXREYXRhLmVycm9yID8/XG4gICAgICAgICAgICAgICAgICBgQXNzZW1ibHlBSSBzdWJtaXQgZmFpbGVkOiBIVFRQICR7c3VibWl0UmVzLnN0YXR1c31gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHRyYW5zY3JpcHRJZCA9IHN1Ym1pdERhdGEuaWQhO1xuXG4gICAgICAgICAgICAvLyAyLiBQb2xsIHVudGlsIGNvbXBsZXRlZCBvciBlcnJvciAobWF4IDYwIFx1MDBENyAzcyA9IDMgbWluKVxuICAgICAgICAgICAgdHlwZSBXb3JkID0geyB0ZXh0OiBzdHJpbmc7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH07XG4gICAgICAgICAgICB0eXBlIFRyYW5zY3JpcHRSZXN1bHQgPSB7XG4gICAgICAgICAgICAgIHN0YXR1czogc3RyaW5nO1xuICAgICAgICAgICAgICBlcnJvcj86IHN0cmluZztcbiAgICAgICAgICAgICAgd29yZHM/OiBXb3JkW107XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBsZXQgcmVzdWx0OiBUcmFuc2NyaXB0UmVzdWx0IHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBjb25zdCBNQVhfUE9MTFMgPSA2MDtcblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBNQVhfUE9MTFM7IGkrKykge1xuICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dChyLCAzMDAwKSk7XG5cbiAgICAgICAgICAgICAgY29uc3QgcG9sbFJlcyA9IGF3YWl0IGZldGNoKFxuICAgICAgICAgICAgICAgIGAke0FBSV9CQVNFfS90cmFuc2NyaXB0LyR7dHJhbnNjcmlwdElkfWAsXG4gICAgICAgICAgICAgICAgeyBoZWFkZXJzIH1cbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmVzdWx0ID0gKGF3YWl0IHBvbGxSZXMuanNvbigpKSBhcyBUcmFuc2NyaXB0UmVzdWx0O1xuXG4gICAgICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSBcImNvbXBsZXRlZFwiKSBicmVhaztcbiAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09IFwiZXJyb3JcIikge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgIHJlc3VsdC5lcnJvciA/PyBcIkFzc2VtYmx5QUkgdHJhbnNjcmlwdGlvbiBlcnJvclwiXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQuc3RhdHVzICE9PSBcImNvbXBsZXRlZFwiKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBcIlRyYW5zY3JpcHRpb24gdGltZWQgb3V0IGFmdGVyIDMgbWludXRlcy4gVHJ5IGEgc2hvcnRlciB2aWRlby5cIlxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyAzLiBHcm91cCB3b3JkcyBcdTIxOTIgbmF0dXJhbCBzdWJ0aXRsZSBwaHJhc2VzXG4gICAgICAgICAgICBjb25zdCB3b3JkczogV29yZFtdID0gcmVzdWx0LndvcmRzID8/IFtdO1xuXG4gICAgICAgICAgICBpZiAod29yZHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwKTtcbiAgICAgICAgICAgICAgcmVzLmVuZChcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgc3VidGl0bGVzOiBbXSxcbiAgICAgICAgICAgICAgICAgIHdhcm5pbmc6IFwiTm8gd29yZHMgZGV0ZWN0ZWQgaW4gdGhlIGF1ZGlvLlwiLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gV29yZHMgdGhhdCBzb3VuZCB1bm5hdHVyYWwgYXMgdGhlIGxhc3Qgd29yZCBvZiBhIHN1YnRpdGxlIGxpbmVcbiAgICAgICAgICAgIGNvbnN0IFdFQUsgPSBuZXcgU2V0KFtcbiAgICAgICAgICAgICAgXCJhXCIsXCJkZVwiLFwicXVlXCIsXCJ5XCIsXCJvXCIsXCJwYXJhXCIsXCJjb25cIixcImVuXCIsXCJsYVwiLFwiZWxcIixcImxvc1wiLFwibGFzXCIsXG4gICAgICAgICAgICAgIFwiYWxcIixcImRlbFwiLFwidW5cIixcInVuYVwiLFwibG9cIixcInNlXCIsXCJzdVwiLFwicG9yXCIsXCJzaW5cIixcIm5pXCIsXCJsZVwiLFwibGVzXCIsXG4gICAgICAgICAgICAgIFwibWVcIixcInRlXCIsXCJub3NcIixcInNpXCIsXCJlXCIsXCJ1XCIsXCJpdHNcIixcImFcIixcInRoZVwiLFwib2ZcIixcInRvXCIsXCJhbmRcIixcbiAgICAgICAgICAgICAgXCJvclwiLFwiZm9yXCIsXCJpblwiLFwib25cIixcImF0XCIsXCJieVwiLFwiYW5cIixcImlzXCIsXCJhc1wiLFwiYmVcIixcIndlXCIsXCJoZVwiLFxuICAgICAgICAgICAgICBcInNoZVwiLFwiaXRcIixcInVwXCIsXCJkb1wiLFwiaWZcIixcIm15XCIsXCJzb1wiLFwibm9cIixcImJ1dFwiLFwibm90XCIsXCJhcmVcIixcIndhc1wiLFxuICAgICAgICAgICAgXSk7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGVuZHNXZWFrKHdvcmRUZXh0OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgICAgICAgY29uc3QgYmFyZSA9IHdvcmRUZXh0LnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvWy4sIT87OlxcdTAwYmZcXHUwMGExXCJcIlwiJ10rL2csIFwiXCIpLnRyaW0oKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFdFQUsuaGFzKGJhcmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBzdWJ0aXRsZXM6IHsgaWQ6IG51bWJlcjsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXI7IHRleHQ6IHN0cmluZyB9W10gPSBbXTtcbiAgICAgICAgICAgIGxldCBzZWdJZCA9IDA7XG4gICAgICAgICAgICBsZXQgaSA9IDA7XG5cbiAgICAgICAgICAgIHdoaWxlIChpIDwgd29yZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGNodW5rOiBXb3JkW10gPSBbXTtcblxuICAgICAgICAgICAgICB3aGlsZSAoaSA8IHdvcmRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGNodW5rLnB1c2god29yZHNbaV0pO1xuICAgICAgICAgICAgICAgIGkrKztcblxuICAgICAgICAgICAgICAgIGNvbnN0IGxhc3QgPSBjaHVua1tjaHVuay5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICBjb25zdCB3ID0gbGFzdC50ZXh0O1xuICAgICAgICAgICAgICAgIGNvbnN0IG4gPSBjaHVuay5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICAvLyBIYXJkIHN0b3AgXHUyMDE0IG5ldmVyIGV4Y2VlZCA5IHdvcmRzXG4gICAgICAgICAgICAgICAgaWYgKG4gPj0gOSkgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAvLyBTdHJvbmcgcHVuY3R1YXRpb24gKC4gISA/KSBcdTIxOTIgYnJlYWsgaWYgd2UgaGF2ZSBcdTIyNjUyIHdvcmRzXG4gICAgICAgICAgICAgICAgaWYgKG4gPj0gMiAmJiAvWy4hP1xcdTAwYmZcXHUwMGExXSQvLnRlc3QodykpIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgLy8gU29mdCBwdW5jdHVhdGlvbiAoLCA7IDopIFx1MjE5MiBicmVhayBpZiB3ZSBoYXZlIFx1MjI2NTQgd29yZHNcbiAgICAgICAgICAgICAgICBpZiAobiA+PSA0ICYmIC9bLDs6XSQvLnRlc3QodykpIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgLy8gSWRlYWwgYnJlYWsgcG9pbnQ6IFx1MjI2NTUgd29yZHMgYW5kIE5PVCBlbmRpbmcgb24gYSB3ZWFrIGNvbm5lY3RvclxuICAgICAgICAgICAgICAgIGlmIChuID49IDUgJiYgIWVuZHNXZWFrKHcpKSBicmVhaztcblxuICAgICAgICAgICAgICAgIC8vIFNhZmV0eSBtYXg6IDggd29yZHMgcmVnYXJkbGVzcyBvZiBjb25uZWN0b3JcbiAgICAgICAgICAgICAgICBpZiAobiA+PSA4KSBicmVhaztcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmIChjaHVuay5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgc3VidGl0bGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgaWQ6IHNlZ0lkKyssXG4gICAgICAgICAgICAgICAgICBzdGFydDogY2h1bmtbMF0uc3RhcnQsXG4gICAgICAgICAgICAgICAgICBlbmQ6IGNodW5rW2NodW5rLmxlbmd0aCAtIDFdLmVuZCxcbiAgICAgICAgICAgICAgICAgIHRleHQ6IGNodW5rLm1hcCgodykgPT4gdy50ZXh0KS5qb2luKFwiIFwiKSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgc3VidGl0bGVzIH0pKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAwKTtcbiAgICAgICAgICAgIHJlcy5lbmQoXG4gICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjpcbiAgICAgICAgICAgICAgICAgIGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBcIlVuZXhwZWN0ZWQgc2VydmVyIGVycm9yXCIsXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgKTtcbiAgICB9LFxuICB9O1xufVxuXG4vKipcbiAqIFZpdGUgZGV2LXNlcnZlciBwbHVnaW46IGV4cG9zZXMgL2FwaS9zZXR1cC1idWNrZXQgYXMgYSBOb2RlLmpzIG1pZGRsZXdhcmUuXG4gKlxuICogU0VDVVJJVFk6IHJlYWRzIFNVUEFCQVNFX1NFUlZJQ0VfUk9MRV9LRVkgZnJvbSBwcm9jZXNzLmVudiAoc2VydmVyLXNpZGUgb25seSkuXG4gKiBJdCBpcyBORVZFUiByZWFkIHZpYSBpbXBvcnQubWV0YS5lbnYgLyBWSVRFXyogc28gaXQgaXMgTkVWRVIgZW1iZWRkZWQgaW5cbiAqIHRoZSBicm93c2VyIGJ1bmRsZS5cbiAqL1xuZnVuY3Rpb24gc3VwYWJhc2VTZXR1cFBsdWdpbigpOiBQbHVnaW4ge1xuICByZXR1cm4ge1xuICAgIG5hbWU6IFwic3VwYWJhc2Utc2V0dXAtYXBpXCIsXG4gICAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xuICAgICAgc2VydmVyLm1pZGRsZXdhcmVzLnVzZShcbiAgICAgICAgXCIvYXBpL3NldHVwLWJ1Y2tldFwiLFxuICAgICAgICBhc3luYyAocmVxOiBJbmNvbWluZ01lc3NhZ2UsIHJlczogU2VydmVyUmVzcG9uc2UsIG5leHQ6ICgpID0+IHZvaWQpID0+IHtcbiAgICAgICAgICBpZiAocmVxLm1ldGhvZCAhPT0gXCJQT1NUXCIpIHJldHVybiBuZXh0KCk7XG5cbiAgICAgICAgICByZXMuc2V0SGVhZGVyKFwiQ29udGVudC1UeXBlXCIsIFwiYXBwbGljYXRpb24vanNvblwiKTtcblxuICAgICAgICAgIGNvbnN0IHNlcnZpY2VLZXkgPSBwcm9jZXNzLmVudi5TVVBBQkFTRV9TRVJWSUNFX1JPTEVfS0VZID8/IFwiXCI7XG4gICAgICAgICAgY29uc3Qgc3VwYWJhc2VVcmwgPSAocHJvY2Vzcy5lbnYuVklURV9TVVBBQkFTRV9VUkwgPz8gXCJcIilcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXC8ocmVzdHxhdXRofHN0b3JhZ2V8cmVhbHRpbWUpKFxcLy4qKT8kLywgXCJcIilcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXC8kLywgXCJcIik7XG5cbiAgICAgICAgICBpZiAoIXNlcnZpY2VLZXkgfHwgc2VydmljZUtleS5pbmNsdWRlcyhcInBsYWNlaG9sZGVyXCIpKSB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCk7XG4gICAgICAgICAgICByZXMuZW5kKFxuICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgZXJyb3I6XG4gICAgICAgICAgICAgICAgICBcIlNVUEFCQVNFX1NFUlZJQ0VfUk9MRV9LRVkgaXMgbm90IHNldC4gQWRkIGl0IHRvIFJlcGxpdCBTZWNyZXRzIFwiICtcbiAgICAgICAgICAgICAgICAgIFwiKHdpdGhvdXQgdGhlIFZJVEVfIHByZWZpeCBcdTIwMTQgaXQgbXVzdCBzdGF5IHNlcnZlci1vbmx5KS5cIixcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCFzdXBhYmFzZVVybCB8fCAhc3VwYWJhc2VVcmwuc3RhcnRzV2l0aChcImh0dHBcIikpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwKTtcbiAgICAgICAgICAgIHJlcy5lbmQoXG4gICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IFwiVklURV9TVVBBQkFTRV9VUkwgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgY3JlYXRlQ2xpZW50IH0gPSBhd2FpdCBpbXBvcnQoXCJAc3VwYWJhc2Uvc3VwYWJhc2UtanNcIik7XG4gICAgICAgICAgICBjb25zdCBhZG1pbiA9IGNyZWF0ZUNsaWVudChzdXBhYmFzZVVybCwgc2VydmljZUtleSwge1xuICAgICAgICAgICAgICBhdXRoOiB7IGF1dG9SZWZyZXNoVG9rZW46IGZhbHNlLCBwZXJzaXN0U2Vzc2lvbjogZmFsc2UgfSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCB7IGVycm9yOiBjcmVhdGVFcnIgfSA9IGF3YWl0IGFkbWluLnN0b3JhZ2UuY3JlYXRlQnVja2V0KFxuICAgICAgICAgICAgICBcInZpZGVvc1wiLFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcHVibGljOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBmaWxlU2l6ZUxpbWl0OiAyICogMTAyNCAqIDEwMjQgKiAxMDI0LFxuICAgICAgICAgICAgICAgIGFsbG93ZWRNaW1lVHlwZXM6IFtcbiAgICAgICAgICAgICAgICAgIFwidmlkZW8vbXA0XCIsXG4gICAgICAgICAgICAgICAgICBcInZpZGVvL3F1aWNrdGltZVwiLFxuICAgICAgICAgICAgICAgICAgXCJ2aWRlby94LW1hdHJvc2thXCIsXG4gICAgICAgICAgICAgICAgICBcInZpZGVvL3dlYm1cIixcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBsZXQgYnVja2V0Q3JlYXRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgbGV0IGJ1Y2tldEFscmVhZHlFeGlzdGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGlmIChjcmVhdGVFcnIpIHtcbiAgICAgICAgICAgICAgY29uc3QgbXNnID0gKGNyZWF0ZUVyci5tZXNzYWdlID8/IFwiXCIpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBtc2cuaW5jbHVkZXMoXCJhbHJlYWR5IGV4aXN0c1wiKSB8fFxuICAgICAgICAgICAgICAgIG1zZy5pbmNsdWRlcyhcImR1cGxpY2F0ZVwiKSB8fFxuICAgICAgICAgICAgICAgIChjcmVhdGVFcnIgYXMgeyBzdGF0dXNDb2RlPzogc3RyaW5nIH0pLnN0YXR1c0NvZGUgPT09IFwiMjM1MDVcIlxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICBidWNrZXRBbHJlYWR5RXhpc3RlZCA9IHRydWU7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDApO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoXG4gICAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgQnVja2V0IGNyZWF0aW9uIGZhaWxlZDogJHtjcmVhdGVFcnIubWVzc2FnZX1gLFxuICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYnVja2V0Q3JlYXRlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwKTtcbiAgICAgICAgICAgIHJlcy5lbmQoXG4gICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICBidWNrZXRDcmVhdGVkLFxuICAgICAgICAgICAgICAgIGJ1Y2tldEFscmVhZHlFeGlzdGVkLFxuICAgICAgICAgICAgICAgIHBvbGljaWVzQ3JlYXRlZDogZmFsc2UsXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDApO1xuICAgICAgICAgICAgcmVzLmVuZChcbiAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgIGVycm9yOlxuICAgICAgICAgICAgICAgICAgZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFwiVW5leHBlY3RlZCBzZXJ2ZXIgZXJyb3JcIixcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICApO1xuICAgIH0sXG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIHRhaWx3aW5kY3NzKCksXG4gICAgcnVudGltZUVycm9yT3ZlcmxheSgpLFxuICAgIHN1cGFiYXNlU2V0dXBQbHVnaW4oKSxcbiAgICBhc3NlbWJseUFJUGx1Z2luKCksXG4gIF0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjXCIpLFxuICAgIH0sXG4gICAgZGVkdXBlOiBbXCJyZWFjdFwiLCBcInJlYWN0LWRvbVwiXSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiZGlzdC9wdWJsaWNcIiksXG4gICAgZW1wdHlPdXREaXI6IHRydWUsXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDUwMDAsXG4gICAgc3RyaWN0UG9ydDogdHJ1ZSxcbiAgICBob3N0OiBcIjAuMC4wLjBcIixcbiAgICBhbGxvd2VkSG9zdHM6IHRydWUsXG4gICAgd2F0Y2g6IHtcbiAgICAgIGlnbm9yZWQ6IFtcbiAgICAgICAgXCIqKi8ubG9jYWwvKipcIixcbiAgICAgICAgXCIqKi8uY2FjaGUvKipcIixcbiAgICAgICAgXCIqKi8ucmVwbGl0XCIsXG4gICAgICAgIFwiKiovcmVwbGl0Lm5peFwiLFxuICAgICAgICBcIioqL3N1cGFiYXNlLyoqXCIsXG4gICAgICAgIFwiKiovLmdpdC8qKlwiLFxuICAgICAgICBcIioqL25vZGVfbW9kdWxlcy8qKlwiLFxuICAgICAgICBcIioqL2Rpc3QvKipcIixcbiAgICAgIF0sXG4gICAgfSxcbiAgfSxcbiAgcHJldmlldzoge1xuICAgIHBvcnQ6IDUwMDAsXG4gICAgaG9zdDogXCIwLjAuMC4wXCIsXG4gICAgYWxsb3dlZEhvc3RzOiB0cnVlLFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQW9QLFNBQVMsb0JBQTRCO0FBQ3pSLE9BQU8sV0FBVztBQUNsQixPQUFPLGlCQUFpQjtBQUN4QixPQUFPLFVBQVU7QUFDakIsT0FBTyx5QkFBeUI7QUFKaEMsSUFBTSxtQ0FBbUM7QUFtQnpDLFNBQVMsbUJBQTJCO0FBQ2xDLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLGdCQUFnQixRQUFRO0FBQ3RCLGFBQU8sWUFBWTtBQUFBLFFBQ2pCO0FBQUEsUUFDQSxPQUFPLEtBQXNCLEtBQXFCLFNBQXFCO0FBQ3JFLGNBQUksSUFBSSxXQUFXLE9BQVEsUUFBTyxLQUFLO0FBRXZDLGNBQUksVUFBVSxnQkFBZ0Isa0JBQWtCO0FBRWhELGdCQUFNLFNBQVMsUUFBUSxJQUFJLHNCQUFzQjtBQUNqRCxjQUFJLENBQUMsVUFBVSxPQUFPLFNBQVMsYUFBYSxHQUFHO0FBQzdDLGdCQUFJLFVBQVUsR0FBRztBQUNqQixnQkFBSTtBQUFBLGNBQ0YsS0FBSyxVQUFVO0FBQUEsZ0JBQ2IsU0FBUztBQUFBLGdCQUNULE9BQ0U7QUFBQSxjQUVKLENBQUM7QUFBQSxZQUNIO0FBQ0E7QUFBQSxVQUNGO0FBR0EsY0FBSSxVQUFVO0FBQ2QsMkJBQWlCLFNBQVMsS0FBOEI7QUFDdEQsdUJBQVcsTUFBTSxTQUFTO0FBQUEsVUFDNUI7QUFFQSxjQUFJLFdBQVc7QUFDZixjQUFJO0FBQ0YsYUFBQyxFQUFFLFNBQVMsSUFBSSxLQUFLLE1BQU0sT0FBTztBQUFBLFVBQ3BDLFFBQVE7QUFDTixnQkFBSSxVQUFVLEdBQUc7QUFDakIsZ0JBQUks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
