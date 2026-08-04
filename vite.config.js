import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" emits relative asset paths, so the build works as-is on any static host
// (GitHub Pages, Netlify, a plain file server, …) with no per-host reconfiguration.
export default defineConfig({
  base: "./",
  plugins: [react()],
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
