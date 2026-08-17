import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" emits relative asset paths, so the build works as-is on any static host
// (GitHub Pages, Netlify, a plain file server, …) with no per-host reconfiguration.
export default defineConfig({
  base: "./",
  plugins: [react()],
  // A dedicated port instead of Vite's default 5173, which every other Vite project also wants.
  // strictPort makes a collision fail loudly rather than silently drifting to 5174/5175… (the real
  // annoyance: you can no longer tell which project is on which port). Same offset for preview.
  server: { port: 8173, strictPort: true },
  preview: { port: 8174, strictPort: true },
  build: {
    target: "es2020",
    // The standalone three.js chunk is intentional, so raise the size-warning threshold.
    chunkSizeWarningLimit: 700,
    // three.js is large, so split it into its own chunk for better cache efficiency.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
});
