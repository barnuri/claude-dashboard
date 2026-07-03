import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.CLAUDE_DASHBOARD_API ?? "http://localhost:3333";
const WEB_PORT = Number(process.env.WEB_PORT ?? 5280);

export default defineConfig({
    plugins: [react()],
    server: {
        port: WEB_PORT,
        proxy: {
            "/api": { target: API_TARGET, changeOrigin: true },
            "/ws": { target: API_TARGET, ws: true, changeOrigin: true },
        },
    },
});
