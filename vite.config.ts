import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import type { IncomingMessage, ServerResponse } from "http";

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
