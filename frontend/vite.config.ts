import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend owns the data; the dev server proxies /api so there is no CORS
// in development. `VITE_API_BASE` overrides the target for other setups.
const apiTarget = process.env.VITE_API_BASE || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
});
