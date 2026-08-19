/**
 * ============================================================================
 * WASHI PANEL (GORE) — the flat pattern for the paper skin
 * ============================================================================
 * One panel = the surface between two adjacent ribs, developed flat so the washi can be cut BEFORE
 * pasting rather than trimmed after (a torn wet edge shows, and trimming is the fiddliest step of
 * the build).
 *
 * The decisive dimension is that the sheet's length is the meridian ARC LENGTH, not the body
 * height. Everything else here is allowances and guides.
 * ============================================================================
 */
import { fukuroRange, outerR } from "./profile.js";
import { grooveList, grooveR } from "./groove.js";

// ============ Washi panel (gore) — flat pattern for the paper skin ============
// Trimming the washi AFTER pasting is the hard part of the craft (a wet edge tears and the cut
// line shows), so this develops "the surface between two adjacent ribs" into a flat sheet that can
// be cut FIRST and pasted as-is. Same construction as a globe gore:
//   ・vertical    = the meridian ARC LENGTH s(y) = ∫√(1+R'(y)²)dy — NOT the raw height.
//                   (a 205mm-tall egg body needs 217mm of paper; cut to the height it comes up short)
//   ・half width  = π·R(y)·span/N — half of the rib-to-rib arc at that height.
//   ・the run     = the LAMP BODY only (fukuroRange). The neck carries no washi, so the ends land
//                   exactly on the opening radius = the sheet just covers the opening.
// The lamp body is doubly curved (Gaussian curvature ≠ 0), so NO flat pattern is exact: laying the
// half width out square to a straight axis makes the side edge come out slightly longer than the
// true meridian (~4% at the steepest slope with 8 ribs, ~2% with 12 — it shrinks as (π/N)²). Damp
// washi absorbs that. The exact alternative (a cone-chain unroll, curved axis) trades the stretch
// for extra horizontal seams, which is worse for a lantern.
export const WASHI_SIDE = 3;   // default overlap (のりしろ) added on EACH side, mm. Panels overlap on the rib.
export const WASHI_END = 3;    // default overhang past each opening, mm. Folded over the opening ring.
const WASHI_STEP = 0.5;        // meridian sampling (mm). Same order as the rib outline's STEP.
const WASHI_TICK = 5;          // length of the bamboo-rib tick drawn inward from the edge (mm)
/**
 * The flat pattern of one washi panel. Pure geometry: [x,y] point lists in mm, y = along the
 * meridian (0 = bottom opening), x = across (0 = the panel's centerline).
 *   opts.side  overlap added on each side (mm) — the sheet is wider than the bay by 2×this.
 *   opts.end   overhang past each opening (mm).
 *   opts.span  how many rib bays one sheet covers (1 = rib to rib).
 * Returns { outline, marks, guides, sTot, wMax, ... }: `outline` is the cut line, `marks`/`guides`
 * are dashed hints (never cut). All panels are identical, spiral winding included — the winding is
 * a helix, but every bay sees the same helix, so only the left/right tick heights differ.
 */
export function washiGore(p, opts = {}) {
  const side = Math.max(0, opts.side ?? WASHI_SIDE);
  const end = Math.max(0, opts.end ?? WASHI_END);
  const N = Math.max(3, p.boards || 8);
  const span = Math.max(1, Math.min(N, Math.round(opts.span ?? 1)));
  const h = Math.max(1, p.height || 1);
  const fr = fukuroRange(p), y0 = fr.lo * h, y1 = fr.hi * h;
  const n = Math.max(2, Math.ceil((y1 - y0) / WASHI_STEP));
  // Stations along the meridian: pattern y = arc length so far, pattern half width = π·R·span/N.
  // The arc length is accumulated as chord lengths of the sampled polyline — the same polyline the
  // user actually cuts along, so the paper length matches the drawn line exactly.
  const st = [];
  let s = 0, prev = null, stretch = 0;
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n, R = outerR(p, y / h);
    const w = (Math.PI * R * span) / N;
    if (prev) {
      const ds = Math.hypot(y - prev.y, R - prev.R);                    // true meridian element
      s += ds;
      // How much longer the pattern's side edge runs than the meridian it is supposed to follow
      // (the unavoidable flattening error). Peaks where the profile is steepest.
      if (ds > 1e-9) stretch = Math.max(stretch, Math.hypot(ds, w - prev.w) / ds - 1);
    }
    st.push({ y, R, s, w });
    prev = { y, R, w };
  }
  const sTot = st[n].s;
  // Height (mm on the mold) → position in the pattern. Linear between stations (0.5mm apart).
  const at = (y) => {
    const u = ((Math.min(Math.max(y, y0), y1) - y0) / Math.max(1e-6, y1 - y0)) * n; // guard: degenerate range (two control points at the same t)
    const i = Math.min(n - 1, Math.floor(u)), f = u - i, a = st[i], b = st[i + 1];
    return { s: a.s + (b.s - a.s) * f, w: a.w + (b.w - a.w) * f };
  };

  // Cut line, counter-clockwise. The end overhang keeps the opening's width (the neck is a vertical
  // rectangle, so the surface really is straight out there — the overhang is exact, not a fudge).
  const outline = [];
  if (end > 0) outline.push([-(st[0].w + side), -end], [st[0].w + side, -end]);
  for (const q of st) outline.push([q.w + side, q.s]);
  if (end > 0) outline.push([st[n].w + side, sTot + end], [-(st[n].w + side), sTot + end]);
  for (let i = n; i >= 0; i--) outline.push([-(st[i].w + side), st[i].s]);

  // Bamboo-rib (higo) heights, from the same grooveList as the mold. k=0 is the rib on the left
  // edge, k=1 the rib on the right edge — identical without spiral, shifted by step/boards with it.
  const gR = grooveR(p);
  const marks = [];
  for (const g of grooveList(p, gR, 0)) { const q = at(g); marks.push([-(q.w + side), q.s, -(q.w + side) + WASHI_TICK, q.s]); }
  for (const g of grooveList(p, gR, 1)) { const q = at(g); marks.push([q.w + side, q.s, q.w + side - WASHI_TICK, q.s]); }

  // Guides (dashed, not cut): the two rib lines (= the panel edge without the overlap; line these up
  // with the ribs) and the two opening lines (where the overhang folds over).
  const guides = [];
  // Traced from the same stations as the cut line, so the guide is exactly the outline offset
  // inward by `side` (sampling it more coarsely would let it drift off a sharp shoulder).
  for (const sgn of [-1, 1]) guides.push(st.map((q) => [sgn * q.w, q.s]));
  if (end > 0) for (const i of [0, n]) guides.push([[-(st[i].w + side), st[i].s], [st[i].w + side, st[i].s]]);

  return { outline, marks, guides, sTot, wMax: Math.max(...st.map((q) => q.w)) + side, stretch, span, side, end, N };
}
