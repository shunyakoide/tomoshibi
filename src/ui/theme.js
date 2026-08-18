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
