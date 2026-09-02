/**
 * ============================================================================
 * SECTION VIEW — the frame, the transforms and the mark sizes
 * ============================================================================
 * Everything the drawing needs before it can draw anything: mm → SVG units, the viewBox, and how
 * big a hit target and a mark come out once the browser has scaled the result.
 *
 * A pure function of `(design, pane, compact, content)` — no React, no DOM, no geometry generated
 * here. That is what makes the narrow-screen acceptance criteria in docs/design-notes.md testable
 * rather than merely written down; see scripts/section.test.mts.
 *
 * `content` is the drawing's own extent, passed IN rather than derived here, because the frame is
 * fitted to what is actually drawn: a mark that moves has to take the frame with it. Deriving it
 * here would put the same sampling in two places, which is how the two stop agreeing.
 * ============================================================================
 */
import { maxRadius } from "../../geometry.ts";
import type { Design } from "../../types.ts";

// SVG logical coordinates. Centre axis cx, baseline y0. CX/Y0 are fixed — every X()/Y() is written
// in terms of them — but the FRAME around them is not (see `viewBox`). Exported because the drawing
// positions the centre axis, the koma and the height handle against them directly.
export const CX = 430, Y0 = 710;
const VBW = 860, VBH = 780;

// ---- Compact (phone) mode --------------------------------------------------------------------
// The fixed 860×780 frame is more than twice the width the drawing uses, so on a 375px viewport the
// whole thing rendered at 0.44× and every ◇ hit target came out ELEVEN pixels across, against the
// 44px both platform guidelines ask for.
//
// `compact` changes two things and nothing else about the shape:
//   1. the viewBox is fitted to the CONTENT instead of the fixed frame — a no-op on a wide screen
//      (the drawing is height-bound there) and roughly double on a phone;
//   2. the hit circles are sized from the MEASURED on-screen scale rather than as SVG-unit constants,
//      so a target stays a target however far the drawing has been scaled down.
// Everything the app PRINTS is untouched: this module measures, it does not generate geometry.
const HIT_PT = 30;      // control point / height handle / tangent grab — CSS px, diameter
const HIT_ADD = 20;     // the "+" ghost: a secondary action, and it sits at the MIDPOINT between two
                        // points, so it can never be given the same target without swallowing them
// The MARKS, in CSS px across — the same treatment as the hit circles above. A glyph written as a
// constant in SVG units renders smaller the further the drawing is scaled down (11 units is 11.6px on
// a 1440px desktop and 8.6px on a phone), so the touch surface grew while the thing you aim at shrank
// — and the legend **redraws these marks at legend size**, so a canvas mark half the size of its own
// legend entry reads as a broken UI rather than a small one.
const GLYPH_PT = 16;    // the control point ◇ / □
const GLYPH_H = 15;     // the body-height handle ●
const GLYPH_ADD = 22;   // the "+" ghost
const GLYPH_TAN = 13;   // a tangent handle, in curve-adjust mode
// Room kept around the content when the frame is fitted to it (SVG units). The right side is wider
// because that is where every point's "84 mm" label goes — reserved unconditionally, so the drawing
// does not jump sideways when a label appears or a mark grows. It covers the label's width plus the
// gap the mark pushes it out by (`rPt + 9.5`), larger on a phone where marks are a constant CSS size.
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
  // mm → SVG units. Fit BOTH axes: height alone set the scale while the radius was capped at 130mm,
  // but a wide, low body now runs off the sides, taking the ◇ you are dragging with it. 520/H and 2.0
  // are unchanged, so nothing that fitted before is redrawn at a different size; the width term only
  // ever makes it smaller.
  const s = Math.min(2.0, 520 / H, (CX - 30) / Math.max(maxRadius(p), 1));
  const topY = Y0 - H * s;
  const X = (r: number) => CX + r * s;
  const Xm = (r: number) => CX - r * s;
  const Y = (t: number) => Y0 - t * H * s;
  const Ymm = (y: number) => Y0 - y * s;

  // ---- Frame and hit sizing ----------------------------------------------------------------
  // The content's own extent, in SVG units. Every term is something actually drawn, so a mark that
  // moves takes the frame with it: the silhouette (maxR), the rib's tabs (which stick out past the
  // body at both ends), and the axis stub. The padding is this small because compact drops the
  // region labels (see below); with them the drawing would be squeezed down by its own annotations.
  const cx0 = Math.min(Xm(content.maxR), CX - 60) - FIT_PAD.l;
  const cx1 = Math.max(X(content.maxR), X(content.komaR)) + FIT_PAD.r;
  const cy0 = Math.min(topY - 34, Ymm(H + p.tabLen)) - FIT_PAD.t;
  const cy1 = Math.max(Y0 + 34, Ymm(-p.tabLen)) + FIT_PAD.b;
  // CSS px per SVG unit, as the browser will render it (preserveAspectRatio="meet" = the smaller of
  // the two fits). Falls back to the wide-frame value before the first measurement.
  const fitW = compact ? cx1 - cx0 : VBW, fitH = compact ? cy1 - cy0 : VBH;
  const k = pane.w > 0 ? Math.min(pane.w / fitW, pane.h / fitH) : 1;
  // Widen the fitted box to the pane's aspect so the drawing is centred rather than left-aligned in
  // whichever axis has slack. preserveAspectRatio would centre it anyway; doing it here keeps the
  // coordinates honest for anything that reads the viewBox.
  const vbW = k > 0 && pane.w > 0 ? pane.w / k : fitW;
  const vbH = k > 0 && pane.h > 0 ? pane.h / k : fitH;
  const viewBox = compact
    ? `${((cx0 + cx1) / 2 - vbW / 2).toFixed(1)} ${((cy0 + cy1) / 2 - vbH / 2).toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`
    : `0 0 ${VBW} ${VBH}`;
  // A hit radius in SVG units landing on the wanted size in CSS px. The floors are the old constants,
  // so a wide screen keeps exactly the targets it had.
  const hitPt = compact ? Math.max(13, HIT_PT / 2 / k) : 13;
  const hitAdd = compact ? Math.max(11, HIT_ADD / 2 / k) : 11;
  // Mark radii in SVG units landing on the wanted CSS px. Floored at the wide constants, so the wide
  // path draws exactly what it always drew. `markStroke` scales the outline with them — a 2-unit
  // stroke on a 16px mark is the weight the 2 was on an 11px one.
  const u = (px: number, floor: number) => (compact ? Math.max(floor, px / 2 / k) : floor);
  const rPt = u(GLYPH_PT, 5.5);          // half-side of the control-point square
  const rRing = u(GLYPH_PT + 10, 13);    // the selection ring around it
  const rH = u(GLYPH_H, 6.5);            // body-height handle
  const rAdd = u(GLYPH_ADD, 11);         // "+" ghost
  const rTan = u(GLYPH_TAN, 5.5);        // tangent handle
  const markStroke = (2 * rPt / 5.5).toFixed(2);   // stroke weight, in step with the marks
  // Compact hides the NAMES, never the NUMBERS. Out go the region labels (首/火袋/首 — the colour
  // bands already say it), the 羽根板 caption, the 開口/首 tag and the 火袋の高さ caption; the region
  // ones also hang off the LEFT of the widest part of the body, which `cx0` reserves nothing for, so
  // they would be clipped as well as costly. The mm readouts stay — they answer "how big is this" —
  // and cost the frame **nothing**, riding inside `FIT_PAD.r`'s one-label reservation.
  const showLabels = !compact;
  // At the sheet's tallest stop the drawing is a 140px sliver and a 34px pill is a fifth of it,
  // parked on the very drawing it explains, for someone plainly working in the panel. Below this
  // threshold the drawing is context, not a work surface, so the legend steps out of the way.
  const showLegend = !compact || pane.h === 0 || pane.h >= 220;

  return { s, topY, X, Xm, Y, Ymm, viewBox, k, hitPt, hitAdd, rPt, rRing, rH, rAdd, rTan, markStroke, showLabels, showLegend };
}
