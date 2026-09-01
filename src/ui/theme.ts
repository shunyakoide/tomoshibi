/**
 * ============================================================================
 * THEME + TRANSLATION CONTEXT
 * ============================================================================
 * The palette, the type stack and the two scales, as constants imported directly by whoever draws
 * something. `t` IS state (it follows the language toggle), so it travels through a context instead:
 * one provider at the root, `useT()` at each leaf, and no `t={t}` on every call site.
 *
 * The values are defined HERE and index.css's `@theme` block mirrors them — this file is what SVG
 * presentation attributes read (a `var()` does not resolve in an XML attribute) and `@theme` is what
 * the utilities resolve through. `npm run check:style` compares the two.
 *
 * Colours: warm washi neutrals for the inspector, with the orange of lamplight as the accent.
 * ============================================================================
 */
import { createContext, useContext } from "react";
import type { T } from "../i18n.ts";

export const accent = "#D95B18";   // the orange of washi lamplight
export const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
export const sans = "'IBM Plex Sans JP', 'Hiragino Sans', system-ui, sans-serif";

/**
 * The type scale, in px. Nine steps, and nothing else may set a font size.
 *
 * It used to be sixteen, five of them half-pixel and carrying 36 of the app's 84 type declarations
 * (12.5px alone on sixteen). A half pixel is not a size anyone chooses — it is what you get when a
 * value is nudged rather than picked, and once there are two the next one is free.
 *
 * **Rounding down rather than up is deliberate**: several places here fit by a hair (the chip bar in
 * English measured exactly 375px on a 375px phone), and every one has room for smaller text where
 * none is guaranteed room for larger. **`2xs` is not a rounding artefact** and must not be folded
 * into `xs`: it is the PointBar's caption size, measured against a 46px button, plus the badge and
 * the select carets.
 *
 * This is the source of truth, mirrored into `@theme` as `--text-*`; `check:style` fails on drift,
 * on a raw JS `fontSize`, on an `FS.<name>` that does not exist (a typo is `undefined`, which React
 * drops and CSS never sees) and on a step nothing uses.
 */
export const FS = {
  "2xs": 9,     // badges, the select carets, the point bar's button captions
  xs: 10,       // section labels, notes, the small print under a title
  sm: 11,       // mono readouts, units, hints
  base: 12,     // the default: control labels, segmented options, checkbox rows
  md: 13,       // emphasis inside a card, guide body copy
  lg: 14,       // a card's lead, alert glyphs
  xl: 16,       // icon glyphs (☰, ±, arrows), the guide's step headings
  "2xl": 20,    // the overlay close X
  "3xl": 25,    // the guide's title
} as const;

/**
 * The corner scale, in px. Six steps, and nothing else may be used. Plus `rounded-full` for a
 * circle, which is not on the scale because a circle is not a size.
 *
 * It used to be thirteen — every integer somebody reached for. The same fold the type scale got, and
 * values round DOWN. The pairs that had to keep MATCHING still do: the ☰ is a rounded square
 * precisely so it does not read as a different kind of control beside the row of selects, and both
 * were 9px and are now both `md`.
 */
export const RADII = {
  xs: 4,       // badges, the checkbox, anything whose box is a few px tall
  sm: 6,       // small fields, the ± squares, the wide layout's tabs
  md: 8,       // buttons, selects, segmented options
  lg: 10,      // cards, chips, alerts, the CTA, figure wells
  xl: 12,      // the overflow menu's popover
  "2xl": 14,   // the big overlays: the welcome card, the guide's cards, the sheet's top corners
} as const;

export const UI = {
  panel: "#fbf8f1", edge: "rgba(59,52,43,0.1)", head: "#3b342b",
  text: "#3b342b", sub: "#8a7c66", faint: "#a1937c", faintest: "#c0b298",
  // Small print: the lightest of these warm greys that still clears WCAG AA (4.5:1) on card white.
  // `sub` and `faint` do NOT — 4.07:1 and 3.01:1 — so neither may colour text at body size or
  // below. They are everywhere in the inspector at FS.xs–FS.sm, which is a finding this token does
  // not fix; it only keeps the guide's own small print (part dimensions, spec labels) legible.
  fine: "#7f7159",
  card: "#fff", cardEdge: "rgba(59,52,43,0.09)", warn: "#c23c12",
};

// A palette colour at a given alpha. Borders, tints and shadows all want the same hue at different
// strengths, and spelling out rgba(217,91,24,…) at each site is how one of them ends up a slightly
// different orange. Kept in sync with the base colour by construction.
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
export const accentA = (a: number) => rgba(accent, a);

// Viewport background. Assembly/print use a cool-neutral CAD grey, lit is a dark room.
// (The section view paints its own; SectionEditor covers the canvas entirely.)
export const vpBg = (isLit: boolean) => (isLit
  ? "radial-gradient(circle at 50% 40%, #1b2230 0%, #070a11 100%)"
  : "radial-gradient(circle at 50% 34%, #eef0f3 0%, #c3c8d0 52%, #939ba6 100%)");

// Floating overlay chips (mode tabs, dimension readout) have to stay legible on both backgrounds.
export const chipStyle = (isLit: boolean) => (isLit
  ? { bg: "rgba(16,16,18,0.72)", edge: "rgba(255,255,255,0.08)", txt: "#8a8a96" }
  : { bg: "rgba(255,255,255,0.85)", edge: "rgba(59,52,43,0.08)", txt: "#8a7c66" });

// Translation function. Defaults to identity so a control rendered outside the provider (a test, a
// stray mount) shows the Japanese key rather than throwing.
export const TContext = createContext<T>((s) => s);
export const useT = () => useContext(TContext);
