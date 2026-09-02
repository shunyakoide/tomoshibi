/**
 * mm → SVG units, the viewBox, and how big a hit target and a mark come out once the browser has
 * scaled the result. Pure, which is what makes the narrow-screen acceptance criteria in
 * docs/design-notes.md testable rather than merely written down.
 *
 * `content` is passed IN rather than derived here: deriving it would put the same sampling in two
 * places, which is how the frame and the drawing stop agreeing.
 */
import { maxRadius } from "../../geometry.ts";
import type { Design } from "../../types.ts";

// Centre axis and baseline, in SVG logical coordinates. Every X()/Y() is written in terms of them,
// and they stay fixed while the FRAME around them does not (see `viewBox`).
export const CX = 430, Y0 = 710;
const VBW = 860, VBH = 780;

// Compact fits the viewBox to the CONTENT and sizes the hit circles and the marks from the MEASURED
// on-screen scale, so a target stays a target however far the drawing has been scaled down. Both are
// about what is DRAWN: this module measures, it does not generate geometry.
const HIT_PT = 30;      // control point / height handle / tangent grab — CSS px, diameter
const HIT_ADD = 20;     // the "+" ghost sits at the MIDPOINT between two points, so it cannot have
                        // the same target without swallowing them
// The MARKS, in CSS px across. A glyph written in SVG units renders smaller the further the drawing
// is scaled down, and the legend REDRAWS these marks at legend size — a canvas mark half the size of
// its own legend entry reads as broken rather than small.
const GLYPH_PT = 16;    // the control point ◇ / □
const GLYPH_H = 15;     // the body-height handle ●
const GLYPH_ADD = 22;   // the "+" ghost
const GLYPH_TAN = 13;   // a tangent handle, in curve-adjust mode
// Room kept around the content when the frame is fitted to it (SVG units). The right side is wider
// because that is where every point's "84 mm" label goes, and it is reserved unconditionally so the
// drawing does not jump sideways when a label appears or a mark grows.
const FIT_PAD = { l: 26, r: 78, t: 22, b: 22 };

/** What one render of the section view is drawn against. All lengths are SVG units unless said. */
export type SectionFrame = {
  /** mm → SVG units. */
  s: number;
  /** The top of the lamp body, in SVG units. */
  topY: number;
  /** radius (mm) → x, right side / mirrored left side. */
  X: (r: number) => number;
  Xm: (r: number) => number;
  /** height fraction t → y. */
  Y: (t: number) => number;
  /** height (mm) → y. Used by the rib, whose coordinates are millimetres in both axes. */
  Ymm: (y: number) => number;
  viewBox: string;
  /** CSS px per SVG unit, as the browser will render it. 1 before the pane has been measured. */
  k: number;
  hitPt: number; hitAdd: number;
  rPt: number; rRing: number; rH: number; rAdd: number; rTan: number;
  markStroke: string;
  showLabels: boolean; showLegend: boolean;
};

export function sectionFrame(
  p: Design,
  /** The pane's size in CSS px; `{ w: 0, h: 0 }` before the first measurement. */
  pane: { w: number; h: number },
  compact: boolean,
  /** The drawing's own extent in mm: the widest the silhouette gets, and the koma's radius. */
  content: { maxR: number; komaR: number },
): SectionFrame {
  const H = p.height;
  // mm → SVG units, fitting BOTH axes: with the height alone a wide, low body runs off the sides,
  // taking the ◇ you are dragging with it. The width term can only ever make the scale smaller.
  const s = Math.min(2.0, 520 / H, (CX - 30) / Math.max(maxRadius(p), 1));
  const topY = Y0 - H * s;
  const X = (r: number) => CX + r * s;
  const Xm = (r: number) => CX - r * s;
  const Y = (t: number) => Y0 - t * H * s;
  const Ymm = (y: number) => Y0 - y * s;

  // The content's own extent, in SVG units. Every term is something actually drawn — the silhouette,
  // the rib's tabs, the axis stub — so a mark that moves takes the frame with it.
  const cx0 = Math.min(Xm(content.maxR), CX - 60) - FIT_PAD.l;
  const cx1 = Math.max(X(content.maxR), X(content.komaR)) + FIT_PAD.r;
  const cy0 = Math.min(topY - 34, Ymm(H + p.tabLen)) - FIT_PAD.t;
  const cy1 = Math.max(Y0 + 34, Ymm(-p.tabLen)) + FIT_PAD.b;
  // CSS px per SVG unit, as the browser will render it (preserveAspectRatio="meet" = the smaller of
  // the two fits). Falls back to the wide-frame value before the first measurement.
  const fitW = compact ? cx1 - cx0 : VBW, fitH = compact ? cy1 - cy0 : VBH;
  const k = pane.w > 0 ? Math.min(pane.w / fitW, pane.h / fitH) : 1;
  // Widen the fitted box to the pane's aspect so the drawing is centred in whichever axis has slack.
  // preserveAspectRatio would centre it anyway; doing it here keeps the viewBox honest to read.
  const vbW = k > 0 && pane.w > 0 ? pane.w / k : fitW;
  const vbH = k > 0 && pane.h > 0 ? pane.h / k : fitH;
  const viewBox = compact
    ? `${((cx0 + cx1) / 2 - vbW / 2).toFixed(1)} ${((cy0 + cy1) / 2 - vbH / 2).toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`
    : `0 0 ${VBW} ${VBH}`;
  // Hit radii in SVG units landing on the wanted size in CSS px, floored at the wide layout's values.
  const hitPt = compact ? Math.max(13, HIT_PT / 2 / k) : 13;
  const hitAdd = compact ? Math.max(11, HIT_ADD / 2 / k) : 11;
  // The same for the marks. `markStroke` scales the outline with them, so the weight is the weight
  // the wide layout's 2 units were on an 11px mark.
  const u = (px: number, floor: number) => (compact ? Math.max(floor, px / 2 / k) : floor);
  const rPt = u(GLYPH_PT, 5.5);          // half-side of the control-point square
  const rRing = u(GLYPH_PT + 10, 13);    // the selection ring around it
  const rH = u(GLYPH_H, 6.5);            // body-height handle
  const rAdd = u(GLYPH_ADD, 11);         // "+" ghost
  const rTan = u(GLYPH_TAN, 5.5);        // tangent handle
  const markStroke = (2 * rPt / 5.5).toFixed(2);   // stroke weight, in step with the marks
  // Compact hides the NAMES, never the NUMBERS: the mm readouts answer the question the drawing
  // exists to answer, and ride inside `FIT_PAD.r`'s reservation for nothing.
  const showLabels = !compact;
  // Below this the drawing is context rather than a work surface, and a 34px pill is a fifth of it.
  const showLegend = !compact || pane.h === 0 || pane.h >= 220;

  return { s, topY, X, Xm, Y, Ymm, viewBox, k, hitPt, hitAdd, rPt, rRing, rH, rAdd, rTan, markStroke, showLabels, showLegend };
}
