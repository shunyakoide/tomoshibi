/**
 * ============================================================================
 * BAMBOO-RIB GROOVES (HIGO-ME)
 * ============================================================================
 * Where the grooves go along the lamp body (`grooveList`, from one lattice so the mold, the section
 * drawing and the washi template cannot disagree), how wide they are (`grooveR`), and the outer-edge
 * point list with them cut in along the surface normal (`grooveOuterPts`).
 *
 * `grooveOuterPts` is the single source of the rib's outer edge: `ribOutline2D` extrudes it and
 * SectionEditor draws it, so what you see on screen is the edge that gets printed.
 *
 * Pure arithmetic, like profile.js — point lists in, point lists out, no three.js.
 * ============================================================================
 */
import { outerR, fukuroRange } from "./profile.js";

// The height (mm) of the lamp body's equator (maximum outer radius). The groove barbs tilt toward
// this equator side (to catch the bamboo rib sliding toward the opening). The point where the barb
// direction reverses is "the point where the slope dR/dy becomes 0 = maximum outer radius," so the
// actual argmax is used rather than a hard-coded h/2 (prevents the barb from facing the wrong way
// on an asymmetric profile).
export function equatorY(p) {
  const h = p.height;
  let bestT = 0.5, bestR = -1;
  for (let i = 0; i <= 120; i++) { const t = i / 120, r = outerR(p, t); if (r > bestR) { bestR = r; bestT = t; } }
  return bestT * h;
}
// Outer-edge point list with the bamboo-rib grooves cut ALONG THE SURFACE NORMAL (not purely
// radially). A purely radial notch (a depth subtracted from R at each y) loses its effective depth
// and its catching wall where the profile turns steeply diagonal — a single-valued-in-y outline
// literally cannot form the undercut that stops the bamboo from sliding. This builds the notch as a V of
// constant *perpendicular* depth, offset inward along the fixed local normal at each groove center,
// so the depth and the wall stay effective at any face angle. Returns [[x,y],...] from y=0 to y=h
// (endpoints exact = the smooth opening radius). With grooves=[] it returns the plain smooth edge.
// Single source of truth: shared by ribOutline2D (the printed rib) and the section drawing.
// ・The basis is not "the groove center's outer radius" but the local outer radius at each y.
//   → Even on a slope, the groove is not offset to one side; walls form above and below, and the
//   bamboo rib catches without sliding off.
// ・On a steep slope (a radial groove's effective depth shallows by a factor of cosθ), the depth
//   is multiplied by 1/cosθ=√(1+slope²) (capped at 2.2) to secure the effective depth for the
//   bamboo rib to seat even on a tilted face.
export function grooveOuterPts(p, grooves, gR) {
  const h = p.height, mid = equatorY(p), STEP = 0.5;
  const DEEP = 2.1; // perpendicular depth factor; on a flat face this equals the legacy radial depth.
  const info = grooves.map((g) => {
    const sl = (outerR(p, Math.min(1, (g + 0.6) / h)) - outerR(p, Math.max(0, (g - 0.6) / h))) / 1.2; // dR/dy
    const T = Math.hypot(1, sl);                       // |tangent| = 1/cosθ
    const depth = Math.min(p.higoD * 1.5, gR * DEEP);  // constant perpendicular depth (matches the flat notch)
    const skew = Math.min(0.62, 0.24 + Math.abs(sl) * 0.32);
    const cs = g < mid ? 1 : -1;                        // toward the center (equator): +y when g is below the equator
    // Along-surface half-widths → y half-widths (÷T). Center side gentle (wide), opening side steep (narrow).
    const hyC = (gR * (1 + skew)) / T, hyO = (gR * (1 - skew)) / T;
    return { g, depth, hyC, hyO, cs, nx: -1 / T, ny: sl / T }; // inward unit normal (-1, sl)/|T|
  });
  // y-samples: a fine grid + each groove's exact tip and flank ends, so the V stays crisp.
  const ys = new Set();
  for (let y = 0; y <= h; y += STEP) ys.add(Math.min(y, h));
  ys.add(h);
  for (const it of info) {
    ys.add(it.g);
    ys.add(Math.max(0, it.g - (it.cs > 0 ? it.hyC : it.hyO)));
    ys.add(Math.min(h, it.g + (it.cs > 0 ? it.hyO : it.hyC)));
  }
  const pts = [];
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
// Bamboo rib groove positions. Distributes them "evenly" over the lamp body, but places no groove
// right next to the neck (opening). It gives a half-pitch buffer (= opening/neck-side clearance) at
// the top and bottom ends and arranges the grooves evenly from the inside.
// Groove half-width (mm) = bamboo rib radius + relief. Aggregated here in one place so the
// groove-making side (ribOutline2D) and the drawing side (SectionEditor) always use the
// same value (prevents cross-section/STL mismatch).
const GROOVE_CLEAR = 0.25;
export function grooveR(p) { return p.higoD / 2 + GROOVE_CLEAR; }
// The groove-distribution lattice (valid range [gLo,gHi] within the lamp body, count n, spacing
// step). Aggregated in one place so grooveList and the spiral path higoSpiralPath use the same
// lattice (if they diverge, the mold and the drawing disagree).
// gM = gR*1.6 is a half-pitch-equivalent buffer meaning "place no groove closer than this to the
// opening (neck)."
function grooveLattice(p, gR) {
  const h = p.height, fr = fukuroRange(p), gM = gR * 1.6;
  const gLo = fr.lo * h + gM, gHi = fr.hi * h - gM, span = gHi - gLo;
  const n = span > 0.5 ? Math.max(1, Math.round(span / p.pitch)) : 0;
  return { gLo, gHi, span, n, step: n > 0 ? span / n : 0 };
}
// Bamboo rib groove positions (mm). k = rib index.
// ・Normal (horizontal ring): identical for all ribs. Placed with a step/2 buffer at the ends and
//   arranged evenly.
// ・Spiral winding (p.spiral): shifted downward by step/boards per rib. One turn (all ribs) drops
//   exactly one lattice cell (step), and the next rib lands on the next lattice point ⇒ forming a
//   single continuous spiral across all ribs. Grooves that fall outside the valid range [gLo,gHi]
//   due to the shift are dropped, and a vacated lattice point on the opposite side comes in, so the
//   count stays roughly constant (±1). The valid range includes the gM buffer, so even a groove
//   landing at an end keeps the near-opening clearance. With k=0 / no spiral, this is completely
//   identical to normal (does not change existing STL).
export function grooveList(p, gR, k = 0) {
  const { gLo, gHi, n, step } = grooveLattice(p, gR);
  if (n === 0) return [];
  if (!p.spiral || !p.boards) {
    const gs = [];
    for (let i = 0; i < n; i++) gs.push(gLo + step * (i + 0.5)); // step/2 buffer at the ends
    return gs;
  }
  const off = step * ((((k % p.boards) + p.boards) % p.boards) / p.boards); // [0, step)
  const gs = [];
  for (let i = -1; i <= n; i++) {
    const y = gLo + step * (i + 0.5) - off;
    if (y >= gLo - 1e-6 && y <= gHi + 1e-6) gs.push(y);
  }
  return gs;
}
// The spiral-winding bamboo rib centerline (for the lit preview). Builds a "one pitch / one turn"
// continuous spiral from the same lattice as grooveList. Pure function (no THREE dependency):
// returns a point list of [angle rad, height mm (0 basis), radius mm].
// The height decreases as the angle increases (= the rib advances) = matching grooveList's shift
// direction.
export function higoSpiralPath(p, seg = 48) {
  const gR = grooveR(p), h = p.height;
  const { gHi, n, step } = grooveLattice(p, gR);
  if (n === 0) return [];
  const yTop = gHi - step * 0.5, turns = n; // from the top groove, over n turns to the bottom groove
  const M = Math.max(2, Math.round(seg * turns));
  const out = [];
  for (let i = 0; i <= M; i++) {
    const u = i / M, a = 2 * Math.PI * turns * u, y = yTop - step * turns * u;
    out.push([a, y, outerR(p, Math.min(Math.max(y, 0), h) / h)]);
  }
  return out;
}
