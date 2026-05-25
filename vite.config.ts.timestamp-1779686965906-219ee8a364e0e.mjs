// vite.config.ts
import { defineConfig } from "file:///home/runner/workspace/node_modules/.pnpm/vite@5.4.21_@types+node@22.19.19_lightningcss@1.32.0/node_modules/vite/dist/node/index.js";
import react from "file:///home/runner/workspace/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@22.19.19_lightningcss@1.32.0_/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///home/runner/workspace/node_modules/.pnpm/@tailwindcss+vite@4.3.0_vite@5.4.21_@types+node@22.19.19_lightningcss@1.32.0_/node_modules/@tailwindcss/vite/dist/index.mjs";
import path from "path";
import runtimeErrorOverlay from "file:///home/runner/workspace/node_modules/.pnpm/@replit+vite-plugin-runtime-error-modal@0.0.3/node_modules/@replit/vite-plugin-runtime-error-modal/dist/index.mjs";
var __vite_injected_original_dirname = "/home/runner/workspace";
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
    supabaseSetupPlugin()
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9ydW5uZXIvd29ya3NwYWNlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9ydW5uZXIvd29ya3NwYWNlL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3J1bm5lci93b3Jrc3BhY2Uvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIFBsdWdpbiB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHJ1bnRpbWVFcnJvck92ZXJsYXkgZnJvbSBcIkByZXBsaXQvdml0ZS1wbHVnaW4tcnVudGltZS1lcnJvci1tb2RhbFwiO1xuaW1wb3J0IHR5cGUgeyBJbmNvbWluZ01lc3NhZ2UsIFNlcnZlclJlc3BvbnNlIH0gZnJvbSBcImh0dHBcIjtcblxuLyoqXG4gKiBWaXRlIGRldi1zZXJ2ZXIgcGx1Z2luOiBleHBvc2VzIC9hcGkvc2V0dXAtYnVja2V0IGFzIGEgTm9kZS5qcyBtaWRkbGV3YXJlLlxuICpcbiAqIFNFQ1VSSVRZOiByZWFkcyBTVVBBQkFTRV9TRVJWSUNFX1JPTEVfS0VZIGZyb20gcHJvY2Vzcy5lbnYgKHNlcnZlci1zaWRlIG9ubHkpLlxuICogSXQgaXMgTkVWRVIgcmVhZCB2aWEgaW1wb3J0Lm1ldGEuZW52IC8gVklURV8qIHNvIGl0IGlzIE5FVkVSIGVtYmVkZGVkIGluXG4gKiB0aGUgYnJvd3NlciBidW5kbGUuXG4gKi9cbmZ1bmN0aW9uIHN1cGFiYXNlU2V0dXBQbHVnaW4oKTogUGx1Z2luIHtcbiAgcmV0dXJuIHtcbiAgICBuYW1lOiBcInN1cGFiYXNlLXNldHVwLWFwaVwiLFxuICAgIGNvbmZpZ3VyZVNlcnZlcihzZXJ2ZXIpIHtcbiAgICAgIHNlcnZlci5taWRkbGV3YXJlcy51c2UoXG4gICAgICAgIFwiL2FwaS9zZXR1cC1idWNrZXRcIixcbiAgICAgICAgYXN5bmMgKHJlcTogSW5jb21pbmdNZXNzYWdlLCByZXM6IFNlcnZlclJlc3BvbnNlLCBuZXh0OiAoKSA9PiB2b2lkKSA9PiB7XG4gICAgICAgICAgaWYgKHJlcS5tZXRob2QgIT09IFwiUE9TVFwiKSByZXR1cm4gbmV4dCgpO1xuXG4gICAgICAgICAgcmVzLnNldEhlYWRlcihcIkNvbnRlbnQtVHlwZVwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG5cbiAgICAgICAgICBjb25zdCBzZXJ2aWNlS2V5ID0gcHJvY2Vzcy5lbnYuU1VQQUJBU0VfU0VSVklDRV9ST0xFX0tFWSA/PyBcIlwiO1xuICAgICAgICAgIGNvbnN0IHN1cGFiYXNlVXJsID0gKHByb2Nlc3MuZW52LlZJVEVfU1VQQUJBU0VfVVJMID8/IFwiXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFwvKHJlc3R8YXV0aHxzdG9yYWdlfHJlYWx0aW1lKShcXC8uKik/JC8sIFwiXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFwvJC8sIFwiXCIpO1xuXG4gICAgICAgICAgaWYgKCFzZXJ2aWNlS2V5IHx8IHNlcnZpY2VLZXkuaW5jbHVkZXMoXCJwbGFjZWhvbGRlclwiKSkge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDApO1xuICAgICAgICAgICAgcmVzLmVuZChcbiAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgIGVycm9yOlxuICAgICAgICAgICAgICAgICAgXCJTVVBBQkFTRV9TRVJWSUNFX1JPTEVfS0VZIGlzIG5vdCBzZXQuIEFkZCBpdCB0byBSZXBsaXQgU2VjcmV0cyBcIiArXG4gICAgICAgICAgICAgICAgICBcIih3aXRob3V0IHRoZSBWSVRFXyBwcmVmaXggXHUyMDE0IGl0IG11c3Qgc3RheSBzZXJ2ZXItb25seSkuXCIsXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICghc3VwYWJhc2VVcmwgfHwgIXN1cGFiYXNlVXJsLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCk7XG4gICAgICAgICAgICByZXMuZW5kKFxuICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBcIlZJVEVfU1VQQUJBU0VfVVJMIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGNyZWF0ZUNsaWVudCB9ID0gYXdhaXQgaW1wb3J0KFwiQHN1cGFiYXNlL3N1cGFiYXNlLWpzXCIpO1xuICAgICAgICAgICAgY29uc3QgYWRtaW4gPSBjcmVhdGVDbGllbnQoc3VwYWJhc2VVcmwsIHNlcnZpY2VLZXksIHtcbiAgICAgICAgICAgICAgYXV0aDogeyBhdXRvUmVmcmVzaFRva2VuOiBmYWxzZSwgcGVyc2lzdFNlc3Npb246IGZhbHNlIH0sXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgeyBlcnJvcjogY3JlYXRlRXJyIH0gPSBhd2FpdCBhZG1pbi5zdG9yYWdlLmNyZWF0ZUJ1Y2tldChcbiAgICAgICAgICAgICAgXCJ2aWRlb3NcIixcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHB1YmxpYzogZmFsc2UsXG4gICAgICAgICAgICAgICAgZmlsZVNpemVMaW1pdDogMiAqIDEwMjQgKiAxMDI0ICogMTAyNCxcbiAgICAgICAgICAgICAgICBhbGxvd2VkTWltZVR5cGVzOiBbXG4gICAgICAgICAgICAgICAgICBcInZpZGVvL21wNFwiLFxuICAgICAgICAgICAgICAgICAgXCJ2aWRlby9xdWlja3RpbWVcIixcbiAgICAgICAgICAgICAgICAgIFwidmlkZW8veC1tYXRyb3NrYVwiLFxuICAgICAgICAgICAgICAgICAgXCJ2aWRlby93ZWJtXCIsXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgbGV0IGJ1Y2tldENyZWF0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIGxldCBidWNrZXRBbHJlYWR5RXhpc3RlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAoY3JlYXRlRXJyKSB7XG4gICAgICAgICAgICAgIGNvbnN0IG1zZyA9IChjcmVhdGVFcnIubWVzc2FnZSA/PyBcIlwiKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgbXNnLmluY2x1ZGVzKFwiYWxyZWFkeSBleGlzdHNcIikgfHxcbiAgICAgICAgICAgICAgICBtc2cuaW5jbHVkZXMoXCJkdXBsaWNhdGVcIikgfHxcbiAgICAgICAgICAgICAgICAoY3JlYXRlRXJyIGFzIHsgc3RhdHVzQ29kZT86IHN0cmluZyB9KS5zdGF0dXNDb2RlID09PSBcIjIzNTA1XCJcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgYnVja2V0QWxyZWFkeUV4aXN0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAwKTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKFxuICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYEJ1Y2tldCBjcmVhdGlvbiBmYWlsZWQ6ICR7Y3JlYXRlRXJyLm1lc3NhZ2V9YCxcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGJ1Y2tldENyZWF0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCk7XG4gICAgICAgICAgICByZXMuZW5kKFxuICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgYnVja2V0Q3JlYXRlZCxcbiAgICAgICAgICAgICAgICBidWNrZXRBbHJlYWR5RXhpc3RlZCxcbiAgICAgICAgICAgICAgICBwb2xpY2llc0NyZWF0ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAwKTtcbiAgICAgICAgICAgIHJlcy5lbmQoXG4gICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICBlcnJvcjpcbiAgICAgICAgICAgICAgICAgIGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBcIlVuZXhwZWN0ZWQgc2VydmVyIGVycm9yXCIsXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgKTtcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICB0YWlsd2luZGNzcygpLFxuICAgIHJ1bnRpbWVFcnJvck92ZXJsYXkoKSxcbiAgICBzdXBhYmFzZVNldHVwUGx1Z2luKCksXG4gIF0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjXCIpLFxuICAgIH0sXG4gICAgZGVkdXBlOiBbXCJyZWFjdFwiLCBcInJlYWN0LWRvbVwiXSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiZGlzdC9wdWJsaWNcIiksXG4gICAgZW1wdHlPdXREaXI6IHRydWUsXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDUwMDAsXG4gICAgc3RyaWN0UG9ydDogdHJ1ZSxcbiAgICBob3N0OiBcIjAuMC4wLjBcIixcbiAgICBhbGxvd2VkSG9zdHM6IHRydWUsXG4gICAgd2F0Y2g6IHtcbiAgICAgIGlnbm9yZWQ6IFtcbiAgICAgICAgXCIqKi8ubG9jYWwvKipcIixcbiAgICAgICAgXCIqKi8uY2FjaGUvKipcIixcbiAgICAgICAgXCIqKi8ucmVwbGl0XCIsXG4gICAgICAgIFwiKiovcmVwbGl0Lm5peFwiLFxuICAgICAgICBcIioqL3N1cGFiYXNlLyoqXCIsXG4gICAgICAgIFwiKiovLmdpdC8qKlwiLFxuICAgICAgICBcIioqL25vZGVfbW9kdWxlcy8qKlwiLFxuICAgICAgICBcIioqL2Rpc3QvKipcIixcbiAgICAgIF0sXG4gICAgfSxcbiAgfSxcbiAgcHJldmlldzoge1xuICAgIHBvcnQ6IDUwMDAsXG4gICAgaG9zdDogXCIwLjAuMC4wXCIsXG4gICAgYWxsb3dlZEhvc3RzOiB0cnVlLFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQW9QLFNBQVMsb0JBQTRCO0FBQ3pSLE9BQU8sV0FBVztBQUNsQixPQUFPLGlCQUFpQjtBQUN4QixPQUFPLFVBQVU7QUFDakIsT0FBTyx5QkFBeUI7QUFKaEMsSUFBTSxtQ0FBbUM7QUFjekMsU0FBUyxzQkFBOEI7QUFDckMsU0FBTztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sZ0JBQWdCLFFBQVE7QUFDdEIsYUFBTyxZQUFZO0FBQUEsUUFDakI7QUFBQSxRQUNBLE9BQU8sS0FBc0IsS0FBcUIsU0FBcUI7QUFDckUs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
