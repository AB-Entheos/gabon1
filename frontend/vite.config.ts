import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3001,
    host: true,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        // Django's SECURE_SSL_REDIRECT requires X-Forwarded-Proto: https
        // to treat the request as secure. Without this header, every API
        // call through the dev proxy gets a 301 redirect to HTTPS.
        headers: { "X-Forwarded-Proto": "https" },
      },
    },
  },
});
