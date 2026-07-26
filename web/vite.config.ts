import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Default to 8002 if a stale process owns :8000 without auth routes.
      "/api": process.env.MLF_API_PROXY || "http://127.0.0.1:8005",
    },
  },
});
