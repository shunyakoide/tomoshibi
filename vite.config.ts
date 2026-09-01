import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

/**
 * Publish the built document a second time as 404.html.
 *
 * The app has one addressable page (`/guide` — see src/route.ts), and a static host has no rewrite
 * rules, so a request for it never reaches index.html. The convention on GitHub Pages is exactly
 * this file: Pages serves 404.html for any path it cannot match, the browser renders it, and
 * `location.pathname` is left ALONE — which is what the router reads to know where it is. (A
 * redirecting 404 would work too and is what older recipes do; it costs a round trip and puts the
 * route in a query string on the way, for nothing.)
 *
 * It is copied from the EMITTED index.html rather than written from the source, so it always
 * carries the same hashed asset tags — a hand-written copy is a file that silently goes stale one
 * build later. `closeBundle` rather than `writeBundle`, so it runs after the html plugin has
 * finished with index.html.
 */
function spa404(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "spa-404",
    apply: "build",
    configResolved(c) { config = c; },
    closeBundle() {
      const out = resolve(config.root, config.build.outDir);
      const html = resolve(out, "index.html");
      // closeBundle runs even when the bundle was never written — a CSS parse error upstream, say.
      // Copying blind then reports `ENOENT … dist/index.html -> dist/404.html`, which reads as a
      // fault in THIS plugin and buries the real one; an unbalanced brace in index.css cost a long
      // detour that way. Say what actually happened instead.
      if (!existsSync(html)) {
        throw new Error("spa-404: no dist/index.html to copy — the build produced no output, so the "
          + "real failure is above this line (a stylesheet that does not parse will do it).");
      }
      copyFileSync(html, resolve(out, "404.html"));
    },
  };
}

// base: "./" emits relative asset paths, so the build works as-is on any static host
// (GitHub Pages, Netlify, a plain file server, …) with no per-host reconfiguration. The one thing
// it does NOT carry across hosts is the 404 fallback above: a host that does not serve 404.html for
// unmatched paths will 404 on /guide itself, though the app's own root still works everywhere.
export default defineConfig({
  base: "./",
  // Tailwind scans the source for class names and generates only the utilities that appear. It
  // brings NO preflight here — see the import in index.css for why the app keeps its own reset.
  plugins: [react(), tailwind(), spa404()],
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
    // Function form, not the `{ three: ["three"] }` object form: Vite 8 bundles with Rolldown,
    // which only accepts a function here (the object form fails the build outright). Matching on
    // the module path also catches three/examples/jsm/*, which the object form missed.
    rollupOptions: {
      output: {
        manualChunks: (id) => (/node_modules[\\/]three[\\/]/.test(id) ? "three" : undefined),
      },
    },
  },
});
