/**
 * ============================================================================
 * SHEET STYLES — the one table both renderers read
 * ============================================================================
 * Line weights, dashes and text sizes for everything printed on a sheet. It lives above both
 * renderers because it is read by both: `svg.ts` turns it into a stylesheet, `pdf.ts` reads the same
 * numbers into a content stream. `check:style` reads THIS FILE for the class names it generates.
 * ============================================================================
 */
import type { StyleTable } from "../pdf.ts";

// ============ Page drawing (shared by the SVG and PDF renderers) ============
// A page is built once as **drawing ops in mm page coordinates** (y down from the sheet's top-left)
// and the two renderers only translate them, so the rules that decide whether the print is usable —
// clip band, trim box, check square, seam half-diamonds — exist exactly once. Line/text styles too:
// the CSS block is generated from this table, and the PDF reads the same numbers.
export const STYLE = {
  cut: { stroke: "#000", w: 0.25 },                              // cut line
  tick: { stroke: "#000", w: 0.25, dash: [1.2, 1] },             // bamboo-rib ticks (do not cut)
  guide: { stroke: "#777", w: 0.25, dash: [4, 2.5] },            // alignment guides (do not cut)
  scale: { stroke: "#000", w: 0.6 },                             // the full-scale check square (thick: a ruler gets laid on it)
  frame: { stroke: "#1769c8", w: 0.2 },                          // the sheet's trim box — drawn on every sheet, seam or not
  join: { stroke: "#1769c8", w: 0.25 },                          // sheet-join half-diamonds (blue = align, never cut)
  pname: { fill: "#999", size: 3.4, anchor: "middle" },          // part name, faint, inside the part
  note: { fill: "#888", size: 2.6, anchor: "start" },
  jlabel: { fill: "#1769c8", size: 2.4, anchor: "start" },        // a seam's code (1A, 1B, 2A …), beside its diamond
} satisfies StyleTable;
// `scope` prefixes every selector: the only consumer is the in-app preview, which injects these rules
// into the app's own stylesheet, where a bare `.note` would hit the app's own and shrink it to 2.6px.
export const styleCSS = (scope: string) => Object.entries(STYLE as StyleTable).map(([k, s]) => ("size" in s
  ? `${scope}.${k} { font-size: ${s.size}px; fill: ${s.fill}; text-anchor: ${s.anchor}; font-family: sans-serif }`
  : `${scope}.${k} { fill: none; stroke: ${s.stroke}; stroke-width: ${s.w}${s.dash ? `; stroke-dasharray: ${s.dash.join(" ")}` : ""} }`)).join("\n  ");
