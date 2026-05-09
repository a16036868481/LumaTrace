import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiProxyTarget = process.env.VITE_PROXY_API_TARGET ?? "http://127.0.0.1:3100";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: false,
        ws: true
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: false
  }
});
