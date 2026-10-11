// Where the app looks for the backend, and where the preloaded example lives.

// The live backend: baked at build time from `VITE_API_BASE` (the Cloudflare
// tunnel hostname); empty means same-origin (dev proxy or the single-port build).
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// The bundled example served when the backend is unreachable. Kept under the
// app's base path so it works on GitHub Pages (`/tenderbuddy/demo/`).
export const DEMO_BASE = `${import.meta.env.BASE_URL}demo/`;
