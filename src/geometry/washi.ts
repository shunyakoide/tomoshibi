/**
 * One panel = the surface between two adjacent ribs, developed flat so the washi can be cut BEFORE
 * pasting rather than trimmed after (a torn wet edge shows, and trimming is the fiddliest step of
 * the build).
 */
import type { Design, Pt2 } from "../types.ts";
import { fukuroRange, outerR } from "./profile.ts";
import { grooveList, grooveR } from "./groove.ts";

// Same construction as a globe gore:
//   ・vertical    = the meridian ARC LENGTH s(y) = ∫√(1+R'(y)²)dy — NOT the raw height.
//                   (a 205mm-tall egg body needs 217mm of paper; cut to the height it comes up short)
//   ・half width  = π·R(y)·span/N — half of the rib-to-rib arc at that height.
//   ・the run     = the LAMP BODY only (fukuroRange). The neck carries no washi, so the ends land
//                   exactly on the opening radius = the sheet just covers the opening.
// The lamp body is doubly curved (Gaussian curvature ≠ 0), so NO flat pattern is exact: laid out
// square to a straight axis the side edge runs slightly longer than the true meridian (~4% at the
// steepest slope with 8 ribs, ~2% with 12, shrinking as (π/N)²). Damp washi absorbs that; the exact
// alternative (a cone-chain unroll, curved axis) would trade it for extra horizontal seams.
// Default overlap (のりしろ) added on EACH side, mm. Panels overlap on the rib. 3mm held on a lantern
// actually built from this template — it is not a guess, and it is not short.
export const WASHI_SIDE = 3;
// Default overhang past each opening, mm, folded over the opening ring. Twice the side allowance
// because on that same build the END was the one that came up short. That is the whole reason: do
// not re-derive it from an argument about how much glue area a fold leaves, since the side came
// through exactly that argument intact. Still a control with the same 0..15 range; only its start
// moved. **The build was on the 3D-print route** — nothing has been made on cardboard yet, and its
// hoop is bent wire rather than a printed band, so treat 6 as carried over rather than confirmed
// there.
export const WASHI_END = 6;
const WASHI_STEP = 0.5;        // meridian sampling (mm) — the same 0.5 the rib outline and the
                               // groove edge sample at.
const WASHI_TICK = 5;          // length of the bamboo-rib tick drawn inward from the edge (mm)
/** One sampling station along the meridian: height y, radius R, arc length s, half width w (mm). */
type Station = { y: number; R: number; s: number; w: number };
/** A bamboo-rib tick, drawn inward from an edge: [x1, y1, x2, y2] in mm. */
export type Mark = [number, number, number, number];
export type WashiOpts = { side?: number; end?: number; span?: number };
/**
 * One flattened panel. `outline` is the cut line, `marks`/`guides` hints that are never cut, `sTot`
 * the meridian ARC LENGTH (not the body height).
 */
export type WashiGore = {
  outline: Pt2[]; marks: Mark[]; guides: Pt2[][];
  sTot: number; wMax: number;
  span: number; side: number; end: number; N: number;
};

/**
 * The PASTED paper's meridian: the mold's own surface pushed out by `higoD` along its NORMAL, over
 * `fukuroRange`. Not a horizontal offset — a face at angle θ keeps only `higoD·cos θ` of horizontal
 * clearance, so past θ ≈ 60° (dR/dy = 2) the rod comes out through the paper, and `LIMITS` allows
 * far steeper than that (a barrel scaled to r=130 at h=140 reaches dR/dy = 4.4).
 *
 * For the PREVIEWS, which draw the paper sitting on the bamboo. The template you cut is `washiGore`,
 * which follows the mold surface itself — the paper is pasted onto the ribs, not offset from them.
 * One definition so the assembly figures and the lit view cannot draw two different lanterns.
 */
export function washiSurface(p: Design, n = 60): Pt2[] {
  const { lo, hi } = fukuroRange(p);
  const H = Math.max(1, p.height || 1), dt = (hi - lo) / n / 2 || 1e-4;
  const out: Pt2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = lo + ((hi - lo) * i) / n;
    const t0 = Math.max(lo, t - dt), t1 = Math.min(hi, t + dt);
    const slope = (outerR(p, t1) - outerR(p, t0)) / ((t1 - t0) * H);   // dR/dy
    const k = Math.hypot(1, slope);
    out.push([outerR(p, t) + p.higoD / k, t * H - (p.higoD * slope) / k]);
  }
  return out;
}

/**
 * The flat pattern of one washi panel: [x,y] in mm, y along the meridian (0 = bottom opening),
 * x across (0 = the panel's centerline).
 *   opts.side  overlap added on each side (mm) — the sheet is wider than the bay by 2×this.
 *   opts.end   overhang past each opening (mm).
 *   opts.span  how many rib bays one sheet covers (1 = rib to rib).
 * All panels are identical, spiral winding included — the winding is a helix, but every bay sees the
 * same helix, so only the left/right tick heights differ.
 */
export function washiGore(p: Design, opts: WashiOpts = {}): WashiGore {
  const side = Math.max(0, opts.side ?? WASHI_SIDE);
  const end = Math.max(0, opts.end ?? WASHI_END);
  const N = Math.max(3, p.boards || 8);
  const span = Math.max(1, Math.min(N, Math.round(opts.span ?? 1)));
  const h = Math.max(1, p.height || 1);
  const fr = fukuroRange(p), y0 = fr.lo * h, y1 = fr.hi * h;
  const n = Math.max(2, Math.ceil((y1 - y0) / WASHI_STEP));
  // Stations along the meridian: pattern y = arc length so far, pattern half width = π·R·span/N.
  // Arc length accumulates as chords of the sampled polyline — the very line the user cuts along, so
  // the paper length matches the drawn line exactly.
  const st: Station[] = [];
  let s = 0, prev: { y: number; R: number; w: number } | null = null;
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n, R = outerR(p, y / h);
    const w = (Math.PI * R * span) / N;
    if (prev) {
      const ds = Math.hypot(y - prev.y, R - prev.R);                    // true meridian element
      s += ds;
    }
    st.push({ y, R, s, w });
    prev = { y, R, w };
  }
  const sTot = st[n].s;
  // Height (mm on the mold) → position in the pattern. Linear between stations (0.5mm apart).
  const at = (y: number) => {
    const u = ((Math.min(Math.max(y, y0), y1) - y0) / Math.max(1e-6, y1 - y0)) * n; // guard: degenerate range (two control points at the same t)
    const i = Math.min(n - 1, Math.floor(u)), f = u - i, a = st[i], b = st[i + 1];
    return { s: a.s + (b.s - a.s) * f, w: a.w + (b.w - a.w) * f };
  };

  // Cut line, counter-clockwise. The end overhang keeps the opening's width: the neck is a vertical
  // rectangle, so the surface really is straight out there and the overhang is exact.
  const outline: Pt2[] = [];
  if (end > 0) outline.push([-(st[0].w + side), -end], [st[0].w + side, -end]);
  for (const q of st) outline.push([q.w + side, q.s]);
  if (end > 0) outline.push([st[n].w + side, sTot + end], [-(st[n].w + side), sTot + end]);
  for (let i = n; i >= 0; i--) outline.push([-(st[i].w + side), st[i].s]);

  // Bamboo-rib (higo) heights, from the same grooveList as the mold: k=0 the left-edge rib, k=1 the
  // right-edge one — identical without spiral, shifted by step/boards with it.
  const gR = grooveR(p);
  const marks: Mark[] = [];
  for (const g of grooveList(p, gR, 0)) { const q = at(g); marks.push([-(q.w + side), q.s, -(q.w + side) + WASHI_TICK, q.s]); }
  for (const g of grooveList(p, gR, 1)) { const q = at(g); marks.push([q.w + side, q.s, q.w + side - WASHI_TICK, q.s]); }

  // Guides (dashed, not cut): the two rib lines (the panel edge less the overlap — line these up
  // with the ribs) and the two opening lines (where the overhang folds over). Traced from the cut
  // line's own stations, so a guide is exactly it offset inward by `side`; sampled more coarsely it
  // would drift off a sharp shoulder.
  const guides: Pt2[][] = [];
  for (const sgn of [-1, 1]) guides.push(st.map((q) => [sgn * q.w, q.s]));
  if (end > 0) for (const i of [0, n]) guides.push([[-(st[i].w + side), st[i].s], [st[i].w + side, st[i].s]]);

  return { outline, marks, guides, sTot, wMax: Math.max(...st.map((q) => q.w)) + side, span, side, end, N };
}
