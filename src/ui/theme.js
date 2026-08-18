/**
 * ============================================================================
 * THEME + TRANSLATION CONTEXT
 * ============================================================================
 * The palette and type stack were locals inside HarigataStudio, so every control it rendered had to
 * be handed `ui`, `accent`, `mono` and `sans` as props. None of them are state — they are constants
 * — so they live here and are imported directly by whoever draws something.
 *
 * `t` IS state (it follows the language toggle), so it travels through a context instead: one
 * provider at the root, `useT()` at each leaf, and no `t={t}` on every call site.
 *
 * The values are defined HERE and published to CSS, not the other way round: SVG presentation
 * attributes (the section editor's strokes, the preset icons) need a real colour — `var(--accent)`
 * does not resolve in an XML attribute. Publishing them lets index.css style the things inline
 * styles cannot express at all: :hover, :active, :disabled, :focus-visible.
 *
 * Colours: warm washi neutrals for the inspector, with the orange of lamplight as the accent.
 * ============================================================================
 */
import { createContext, useContext } from "react";

export const accent = "#D95B18";   // the orange of washi lamplight
export const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
export const sans = "'IBM Plex Sans JP', 'Hiragino Sans', system-ui, sans-serif";

export const UI = {
  panel: "#fbf8f1", edge: "rgba(59,52,43,0.1)", head: "#3b342b",
  text: "#3b342b", sub: "#8a7c66", faint: "#a1937c", faintest: "#c0b298",
  card: "#fff", cardEdge: "rgba(59,52,43,0.09)", warn: "#c23c12",
};

// A palette colour at a given alpha. Borders, tints and shadows all want the same hue at different
// strengths, and spelling out rgba(217,91,24,…) at each site is how one of them ends up a slightly
// different orange. Kept in sync with the base colour by construction.
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
export const accentA = (a) => rgba(accent, a);

// Publish the palette as CSS custom properties so index.css can express :hover / :disabled etc.
// The alpha variants are published too — CSS could derive them with rgb(from …), but that syntax is
// recent enough that an older browser would drop the whole declaration and lose the border.
const ALPHAS = [0.06, 0.08, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55];
if (typeof document !== "undefined") {
  const css = document.documentElement.style;
  const set = (k, v) => css.setProperty(k, v);
  set("--accent", accent);
  set("--sans", sans);
  set("--mono", mono);
  for (const [k, v] of Object.entries(UI)) set("--" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()), v);
  for (const a of ALPHAS) {
    const suffix = String(a).slice(2);   // 0.45 → "45", 0.3 → "3"
    set(`--accent-${suffix}`, rgba(accent, a));
    set(`--warn-${suffix}`, rgba(UI.warn, a));
  }
}

// Viewport background. Assembly/print use a cool-neutral CAD grey, lit is a dark room.
// (The section view paints its own; SectionEditor covers the canvas entirely.)
export const vpBg = (isLit) => (isLit
  ? "radial-gradient(circle at 50% 40%, #1b2230 0%, #070a11 100%)"
  : "radial-gradient(circle at 50% 34%, #eef0f3 0%, #c3c8d0 52%, #939ba6 100%)");

// Floating overlay chips (mode tabs, dimension readout) have to stay legible on both backgrounds.
export const chipStyle = (isLit) => (isLit
  ? { bg: "rgba(16,16,18,0.72)", edge: "rgba(255,255,255,0.08)", txt: "#8a8a96" }
  : { bg: "rgba(255,255,255,0.85)", edge: "rgba(59,52,43,0.08)", txt: "#8a7c66" });

// Translation function. Defaults to identity so a control rendered outside the provider (a test, a
// stray mount) shows the Japanese key rather than throwing.
export const TContext = createContext((s) => s);
export const useT = () => useContext(TContext);
