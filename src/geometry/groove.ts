/**
 * Where the grooves go along the lamp body (`grooveList`, from one lattice so the mold, the section
 * drawing and the washi template cannot disagree), how wide they are (`grooveR`), and the outer-edge
 * point list with them cut in along the surface normal (`grooveOuterPts`) — the single source of the
 * rib's outer edge, extruded by `ribOutline2D` and drawn by SectionEditor, so what you see on screen
 * is the edge that gets printed. Pure arithmetic, like profile.ts: no three.js.
 */
import type { Design, Pt2 } from "../types.ts";
import { outerR, fukuroRange } from "./profile.ts";

// The height (mm) of the lamp body's equator (maximum outer radius). Groove barbs tilt toward it, to
// catch the bamboo rib sliding toward the opening; the barb direction reverses where dR/dy = 0, so
// the actual argmax is used rather than a hard-coded h/2 (on an asymmetric profile a barb would
// otherwise face the wrong way).
export function equatorY(p: Design): number {
  const h = p.height;
  let bestT = 0.5, bestR = -1;
  for (let i = 0; i <= 120; i++) { const t = i / 120, r = outerR(p, t); if (r > bestR) { bestR = r; bestT = t; } }
  return bestT * h;
}
// Outer-edge point list with the grooves cut ALONG THE SURFACE NORMAL, not radially: a radial notch
// (depth subtracted from R at each y) shallows by cosθ on a steeply diagonal face and loses the wall
// that stops the bamboo sliding — an outline single-valued in y cannot form that undercut. The notch
// is a V of constant PERPENDICULAR depth (`grooveDepth` = min(higoD*1.5, gR*GROOVE_DEEP), no slope
// term), offset inward along the local normal at each groove centre. Its basis is the local outer
// radius at each y, not the groove centre's, so on a slope the groove is not offset to one side and
// walls form above and below it.
// Returns [[x,y],…] from y=0 to y=h with the endpoints exact (the smooth opening radius);
// `grooves=[]` returns the plain smooth edge. Shared by `ribOutline2D` and the section drawing.
export function grooveOuterPts(p: Design, grooves: number[], gR: number): Pt2[] {
  const h = p.height, mid = equatorY(p), STEP = 0.5;
  const info = grooves.map((g) => {
    const sl = profileSlope(p, g);                     // dR/dy
    const T = Math.hypot(1, sl);                       // |tangent| = 1/cosθ
    const depth = grooveDepth(p, gR);                  // constant perpendicular depth (matches the flat notch)
    const skew = Math.min(0.62, 0.24 + Math.abs(sl) * 0.32);
    const cs = g < mid ? 1 : -1;                        // toward the center (equator): +y when g is below the equator
    // Along-surface half-widths → y half-widths (÷T). Center side gentle (wide), opening side steep (narrow).
    const hyC = (gR * (1 + skew)) / T, hyO = (gR * (1 - skew)) / T;
    return { g, depth, hyC, hyO, cs, nx: -1 / T, ny: sl / T }; // inward unit normal (-1, sl)/|T|
  });
  // y-samples: a fine grid + each groove's exact tip and flank ends, so the V stays crisp.
  const ys = new Set<number>();
  for (let y = 0; y <= h; y += STEP) ys.add(Math.min(y, h));
  ys.add(h);
  for (const it of info) {
    ys.add(it.g);
    ys.add(Math.max(0, it.g - (it.cs > 0 ? it.hyC : it.hyO)));
    ys.add(Math.min(h, it.g + (it.cs > 0 ? it.hyO : it.hyC)));
  }
  const pts: Pt2[] = [];
  for (const y of [...ys].sort((a, b) => a - b)) {
    let dip = 0, nx = 0, ny = 0;                        // nearest groove wins (grooves never overlap: pitch ≫ width)
    for (const it of info) {
      const d = y - it.g;
      const wy = (d === 0 || Math.sign(d) === it.cs) ? it.hyC : it.hyO; // which flank (center/opening) this y is on
      if (Math.abs(d) < wy) {
        const v = it.depth * (1 - Math.abs(d) / wy);
        if (v > dip) { dip = v; nx = it.nx; ny = it.ny; }
      }
    }
    const base = outerR(p, Math.min(Math.max(y, 0), h) / h);
    pts.push([base + dip * nx, y + dip * ny]);
  }
  return pts;
}
// Groove half-width (mm) = bamboo rib radius + relief. In one place so the groove-making side
// (ribOutline2D) and the drawing side (SectionEditor) always use the same value (no section/STL
// mismatch).
const GROOVE_CLEAR = 0.25;
export function grooveR(p: Design): number { return p.higoD / 2 + GROOVE_CLEAR; }
// The local slope dR/dy of the smooth outer edge at height y (mm). Sampled over the same ±0.6mm
// span everywhere, so "how steep is the face here" has one answer across the whole file.
export function profileSlope(p: Design, y: number): number {
  const h = p.height;
  return (outerR(p, Math.min(1, (y + 0.6) / h)) - outerR(p, Math.max(0, (y - 0.6) / h))) / 1.2;
}
// One groove's perpendicular depth (mm) — how deep `grooveOuterPts` cuts along the normal.
// `lightenHoles2D` needs the same number to work out how far a notch reaches **in x** on a slope
// (the tip travels `depth × √(1+slope²)` inward, not `depth`), which keeps the lightening window
// from being cut straight through a groove — hence shared rather than repeated.
const GROOVE_DEEP = 2.1; // perpendicular depth factor; on a flat face this equals the legacy radial depth.
export function grooveDepth(p: Design, gR: number = grooveR(p)): number { return Math.min(p.higoD * 1.5, gR * GROOVE_DEEP); }
// The groove-distribution lattice (valid range [gLo,gHi] within the lamp body, count n, spacing
// step), in one place so grooveList and higoSpiralPath use the same one — diverge, and the mold and
// the drawing disagree. gM = gR*1.6 is a half-pitch-equivalent buffer: no groove closer than that to
// the opening (neck).
function grooveLattice(p: Design, gR: number) {
  const h = p.height, fr = fukuroRange(p), gM = gR * 1.6;
  const gLo = fr.lo * h + gM, gHi = fr.hi * h - gM, span = gHi - gLo;
  const n = span > 0.5 ? Math.max(1, Math.round(span / p.pitch)) : 0;
  return { gLo, gHi, span, n, step: n > 0 ? span / n : 0 };
}
// Bamboo rib groove positions (mm). k = rib index.
// ・Normal (horizontal ring): identical for all ribs, spread evenly with a step/2 buffer at the ends.
// ・Spiral winding (p.spiral): shifted downward by step/boards per rib, so one turn (all ribs) drops
//   exactly one lattice cell (step) and the next rib lands on the next lattice point ⇒ a single
//   continuous spiral across all ribs. Grooves shifted outside [gLo,gHi] are dropped and a vacated
//   lattice point on the opposite side comes in, so the count stays constant to ±1; the range
//   includes the gM buffer, so even an end groove keeps its near-opening clearance. k=0 / no spiral
//   is completely identical to normal (does not change existing STL).
export function grooveList(p: Design, gR: number, k = 0): number[] {
  const { gLo, gHi, n, step } = grooveLattice(p, gR);
  if (n === 0) return [];
  if (!p.spiral || !p.boards) {
    const gs: number[] = [];
    for (let i = 0; i < n; i++) gs.push(gLo + step * (i + 0.5)); // step/2 buffer at the ends
    return gs;
  }
  const off = step * ((((k % p.boards) + p.boards) % p.boards) / p.boards); // [0, step)
  const gs: number[] = [];
  for (let i = -1; i <= n; i++) {
    const y = gLo + step * (i + 0.5) - off;
    if (y >= gLo - 1e-6 && y <= gHi + 1e-6) gs.push(y);
  }
  return gs;
}
// The spiral-winding bamboo rib centerline (for the lit preview): a "one pitch / one turn" continuous
// spiral from the same lattice as grooveList. Pure — returns [angle rad, height mm (0 basis), radius
// mm]. The height decreases as the angle increases, matching grooveList's shift direction.
export function higoSpiralPath(p: Design, seg = 48): [number, number, number][] {
  const gR = grooveR(p), h = p.height;
  const { gHi, n, step } = grooveLattice(p, gR);
  if (n === 0) return [];
  const yTop = gHi - step * 0.5, turns = n; // from the top groove, over n turns to the bottom groove
  const M = Math.max(2, Math.round(seg * turns));
  const out: [number, number, number][] = [];
  for (let i = 0; i <= M; i++) {
    const u = i / M, a = 2 * Math.PI * turns * u, y = yTop - step * turns * u;
    out.push([a, y, outerR(p, Math.min(Math.max(y, 0), h) / h)]);
  }
  return out;
}
