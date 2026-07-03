import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.CLAUDE_DASHBOARD_API ?? "http://localhost:4317";

// The GitHub Pages demo is served from https://<owner>.github.io/<repo>/, a subpath,
// so asset URLs need that prefix baked in. Override via GH_PAGES_BASE if the repo is
// ever renamed or forked under a different name.
const GH_PAGES_BASE = process.env.GH_PAGES_BASE ?? "/claude-dashboard/";

export default defineConfig(({ mode }) => ({
  base: mode === "demo" ? GH_PAGES_BASE : "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/ws": { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
}));
