/**
 * ============================================================================
 * GEOMETRY
 * ============================================================================
 * Pure functions that generate the cross-section shapes and 3D geometry of the
 * forming mold's ("harigata") three parts — rib / koma (hub) / stand. They return
 * three.js Shape/ExtrudeGeometry but depend on neither React nor DOM (shared by both
 * the 2D cross-section drawing and the STL export).
 *
 * [Coordinate system / units] All dimensions in mm. Rib/koma/stand are XY-plane shapes
 *   + Z extrusion (= laid flat, ready for printing as-is). outerR(p, t): normalized
 *   height t∈[0,1] → radius in mm (control-point spline).
 * ============================================================================
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ============ Profile (control-point spline) ============
// The silhouette is determined by a radius function built by joining the "control-point
// array pts" with monotone Hermite interpolation. The ◇ handles in the drawing are dragged
// directly to edit pts. The neck is a vertical rectangle outside the outermost control point,
// with no bamboo ribs (higo) wound on it.

// Lamp body spline: P=[{neck bottom, rBot}, …control points…, {neck top, rTop}]. A smooth
// curve with suppressed warping/sharp kinks, via monotone Hermite (Fritsch–Carlson). Each
// point's tangent dr/dt is derived from adjacent chords, clamped to the same sign as, and
// within 3× of, the adjacent chord (prevents overshoot and unwanted sharp curves). Endpoints
// use the chord to the next point.
function fukuroTangents(P) {
  const n = P.length, d = new Array(n - 1), T = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (P[i + 1].r - P[i].r) / ((P[i + 1].t - P[i].t) || 1); // segment chord (dr/dt)
  for (let i = 0; i < n; i++) {
    let t;
    if (P[i] && P[i].sharp) t = i === 0 ? d[0] : i === n - 1 ? d[n - 2] : (Math.abs(d[i - 1]) < Math.abs(d[i]) ? d[i - 1] : d[i]);
    else if (i === 0) t = d[0];
    else if (i === n - 1) t = d[n - 2];
    else t = (d[i - 1] + d[i]) / 2;                                   // central difference
    // Monotonize: 0 if opposite sign to the adjacent chord; otherwise within 3× the chord
    const near = i === 0 ? d[0] : i === n - 1 ? d[n - 2] : (Math.abs(d[i - 1]) < Math.abs(d[i]) ? d[i - 1] : d[i]);
    if (near === 0) t = 0;
    else { const a = t / near; t = (a < 0 ? 0 : Math.min(a, 3)) * near; }
    T[i] = t;
  }
  return T;
}
function fukuroSpline(P, x, T) {
  T = T || fukuroTangents(P);
  let i = 0;
  while (i < P.length - 2 && x > P[i + 1].t) i++;
  const p1 = P[i], p2 = P[i + 1], h = p2.t - p1.t, s = h > 1e-6 ? (x - p1.t) / h : 0;
  const m1 = T[i] * h, m2 = T[i + 1] * h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p1.r + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2.r + (s3 - s2) * m2;
}

// ---- Bézier tangent handles (optional) ----
// Like Illustrator's pen tool, direction lines (handles ho=next-point side / hi=prev-point side)
// are drawn from each control point so the curve's angle/tension can be edited. Handles are
// relative vectors {dt,dr} in (t,r) space.
// **If even one point has a handle, the lamp body curve switches to Bézier evaluation.** With
// none, it stays the previous monotone Hermite (fukuroSpline) = STL of existing presets and
// saved data is completely unchanged.
//
// Single-valuedness (height t → radius r unique) is guaranteed by clamping the t-component of
// the segment's control points to be non-decreasing (ho.dt∈[0,Δt] / hi.dt∈[-Δt,0], and shrinking
// the total to within Δt so they don't cross). This makes t(u) monotone in u ⇒ the u for t=x is
// found uniquely by bisection, without breaking the t-monotone assumption of grooves/extrusion.
function anyHandle(pts) { for (const q of pts) if (q && (q.ho || q.hi)) return true; return false; }
// Default for points with no handle specified (equivalent to Catmull-Rom; endpoints use one-sided
// 1/3, sharp corner points use 0 = straight line).
function bezDefault(P, i) {
  const n = P.length, a = P[i];
  if (a.sharp) return { ho: { dt: 0, dr: 0 }, hi: { dt: 0, dr: 0 } };
  if (i === 0) { const b = P[1]; return { ho: { dt: (b.t - a.t) / 3, dr: (b.r - a.r) / 3 }, hi: { dt: 0, dr: 0 } }; }
  if (i === n - 1) { const p = P[n - 2]; return { ho: { dt: 0, dr: 0 }, hi: { dt: (p.t - a.t) / 3, dr: (p.r - a.r) / 3 } }; }
  const pv = P[i - 1], nx = P[i + 1], dt = (nx.t - pv.t) / 6, dr = (nx.r - pv.r) / 6;
  return { ho: { dt, dr }, hi: { dt: -dt, dr: -dr } };
}
function fukuroBezierR(P, x) {
  const n = P.length;
  let i = 0;
  while (i < n - 2 && x > P[i + 1].t) i++;
  const a = P[i], b = P[i + 1], dt = b.t - a.t;
  if (dt < 1e-9) return a.r;
  const ha = a.ho || bezDefault(P, i).ho;         // a's out handle
  const hb = b.hi || bezDefault(P, i + 1).hi;      // b's in handle
  // Clamp t-components monotonically (keep control-polygon t as a.t ≤ c1.t ≤ c2.t ≤ b.t)
  let ot = Math.max(0, Math.min(dt, ha.dt)), it = Math.max(-dt, Math.min(0, hb.dt));
  const sum = ot - it;                             // = ot + |it|. If it exceeds Δt, shrink both
  if (sum > dt) { const k = dt / sum; ot *= k; it *= k; }
  const c1t = a.t + ot, c1r = a.r + ha.dr, c2t = b.t + it, c2r = b.r + hb.dr;
  const T = (u) => { const m = 1 - u; return m * m * m * a.t + 3 * m * m * u * c1t + 3 * m * u * u * c2t + u * u * u * b.t; };
  const R = (u) => { const m = 1 - u; return m * m * m * a.r + 3 * m * m * u * c1r + 3 * m * u * u * c2r + u * u * u * b.r; };
  let lo = 0, hi = 1;                              // bisect for t(u)=x (t is monotone in u)
  for (let k = 0; k < 40; k++) { const u = (lo + hi) / 2; if (T(u) < x) lo = u; else hi = u; }
  return R((lo + hi) / 2);
}
// Unifies the lamp body curve's radius function: Bézier if there are handles, otherwise the
// previous Hermite. The cross-section, STL, and koma computation all go through this one
// function, so they always match.
function profileR(P, x) { return anyHandle(P) ? fukuroBezierR(P, x) : fukuroSpline(P, x); }

// Bakes each point's Bézier handles (ho/hi) from the current Hermite curve and returns them
// (pts unchanged). Called the moment curve-adjust mode is entered. A cubic Hermite is exactly
// equal to "a cubic Bézier with the control point shifted Δt/3 along the tangent," so the curve
// shape is unchanged after baking (a seamless transition into handle editing). From then on
// anyHandle=true and evaluation switches to Bézier (only the shape that was touched; untouched
// shapes stay the same). All points, including sharp ones, are baked from the current Hermite
// tangent T[i] (= exactly reproduces the current shape). After baking, "sharp" is limited to
// meaning "the handles are not mirrored left/right (the corner can move independently)" and has
// no direct effect on the curve itself (evaluation always uses ho/hi).
export function bakeBezierHandles(pts) {
  if (!pts || pts.length < 2) return pts;
  const T = fukuroTangents(pts), n = pts.length;
  return pts.map((q, i) => {
    const dtN = i < n - 1 ? (pts[i + 1].t - q.t) / 3 : 0;   // next-point side Δt/3
    const dtP = i > 0 ? (q.t - pts[i - 1].t) / 3 : 0;       // prev-point side Δt/3
    return { ...q, ho: { dt: dtN, dr: T[i] * dtN }, hi: { dt: -dtP, dr: -T[i] * dtP } };
  });
}
// Effective outer radius. t∈[0,1] → radius in mm. Makes a single continuous spline from the
// ends (t=0/1) to the apex (no vertical neck is created). Inserting a neck would produce a
// "flat → sharp curve" kink angle, so the ends are included in the spline as control points
// (rBot/rTop), keeping the outline smooth even with few points.
// The upper/lower end bands (neck) with no bamboo ribs wound on them are handled separately via
// cutT/cutY (the radius stays continuous).
// The lamp body (curve + bamboo rib grooves) t-range = between the outermost control points.
// The neck is outside (toward the opening) the outermost control point.
// The opening (= neck) radius exactly matches the outermost control point → no wasted
// flare/S-curve appears between neck and lamp body.
export function fukuroRange(p) {
  const pts = (p.pts && p.pts.length >= 2) ? p.pts : null;
  if (!pts) return { lo: cutTbot(p), hi: 1 - cutTtop(p) };
  const nB = p.neckBot ?? p.neckOn ?? true, nT = p.neckTop ?? p.neckOn ?? true;
  return { lo: nB ? pts[0].t : 0, hi: nT ? pts[pts.length - 1].t : 1 };
}
// The design basis for neck/tab is "the control-point radius" = independent of whether a neck
// exists (tab size does not change when the neck is toggled).
function openMin(p) {
  const pts = p.pts;
  return (pts && pts.length) ? Math.min(pts[0].r, pts[pts.length - 1].r) : Math.min(p.rTop ?? 60, p.rBot ?? 60);
}
function bodyMinR(p) {
  const pts = p.pts;
  if (!pts || pts.length < 2) return openMin(p);
  let m = Math.min(pts[0].r, pts[pts.length - 1].r);
  for (let i = 0; i <= 40; i++) { const t = pts[0].t + (pts[pts.length - 1].t - pts[0].t) * i / 40; m = Math.min(m, profileR(pts, t)); }
  return m;
}
export function outerR(p, t) {
  t = Math.max(0, Math.min(1, t));
  const pts = (p.pts && p.pts.length) ? p.pts : [{ t: 0.5, r: (p.rTop + p.rBot) / 2 }];
  if (pts.length === 1) return Math.max(8, pts[0].r);
  const fp = pts[0], lp = pts[pts.length - 1];
  const nB = p.neckBot ?? p.neckOn ?? true, nT = p.neckTop ?? p.neckOn ?? true;
  const kR = komaR(p); // tab (koma) size = opening when there is no neck
  // With neck = widen the opening outward to the control point, then a vertical rectangle from
  // there to y=0/1.
  // Without neck = the opening becomes the tab size (set the lamp body end to kR and close to
  // the opening; no slanted taper).
  const loT = nB ? fp.t : 0, loR = nB ? fp.r : kR;
  const hiT = nT ? lp.t : 1, hiR = nT ? lp.r : kR;
  if (t <= loT) return Math.max(8, loR);
  if (t >= hiT) return Math.max(8, hiR);
  // The endpoint radius changes with the presence of a neck (loR/hiR), but the handles (ho/hi)
  // are relative vectors so they are carried over.
  const first = { t: loT, r: loR, ho: fp.ho, hi: fp.hi, sharp: fp.sharp };
  const last = { t: hiT, r: hiR, ho: lp.ho, hi: lp.hi, sharp: lp.sharp };
  const P = [first, ...pts.slice(1, -1), last];
  return Math.max(8, profileR(P, t));                             // lamp body (between control points)
}
export function maxRadius(p) {
  let m = 0;
  for (let i = 0; i <= 120; i++) m = Math.max(m, outerR(p, i / 120));
  return m + p.higoD;
}
// The neck = a vertical rectangle outside (toward the opening) the outermost control point.
// Neck height = the position of the outermost control point. Presence chosen independently for
// top and bottom (neckBot / neckTop). On the neck-less side, outerR makes it straight (lantern-like).
export function cutTbot(p) { const pts = p.pts; return (pts && pts.length) ? pts[0].t : 0; }
export function cutTtop(p) { const pts = p.pts; return (pts && pts.length) ? 1 - pts[pts.length - 1].t : 0; }
export function cutYbot(p) { return cutTbot(p) * (p.height || 1); }
export function cutYtop(p) { return cutTtop(p) * (p.height || 1); }
function cutY(p) { return Math.max(cutYbot(p), cutYtop(p)); }
export function cutT(p) { return cutY(p) / Math.max(1, p.height); }
// Koma outer radius = the radius of the small hub that bundles the tabs. The tab (inner end
// Ri〜Ri+td) meets the koma's edge (outer rim). Ri and tabDepth are top-bottom symmetric, so the
// koma is completely identical top and bottom (only one kind).
export function komaR(p) {
  // The koma outer radius (= tab size) is determined relative to the smaller control-point radius
  // (openMin) (independent of whether a neck exists). When there is no neck, this kR becomes the
  // opening. The basis is "the previous inner end nominalRi," so deepening the tab tip toward the
  // center (lowering innerRi) does not move komaR = stand dimensions.
  return Math.min(nominalRi(p) + tabDepth(p) + 3, openMin(p));
}
// The radial depth of the tab (the rib's insertion part) = the koma's notch depth. Relative to
// the control point, independent of the neck.
export function tabDepth(p) {
  return Math.min(p.tabW, Math.max(6, openMin(p) * 0.4));
}
// Upper limit on rib width: keep it at or below the opening so it can be pulled out from the
// larger opening (end radius) after drying.
export function effBoardWidth(p) {
  return Math.min(p.boardWidth, Math.max(outerR(p, 0), outerR(p, 1)) - 1);
}

// ============ 2D cross-section (final shape) ============
// The inner edge is a straight core (radius Ri), with tabs on its inside at the same top/bottom
// positions. The outer edge is the body curve + neck. The center is lightened (keeping the outer
// band = grooves, and the inner core = tab support). Used in the rib's cross-section view.
//
// The previous-basis tab inner end (= the basis for computing the koma outer radius komaR).
// Includes a self-intersection guard. Control-point-based = independent of the neck. The actual
// tab tip / notch bottom is deepened further toward the center by innerRi (but komaR stays fixed
// on this nominalRi basis).
function nominalRi(p) {
  const td = tabDepth(p);
  // Keep the core (Ri) within the lamp body's minimum outer radius (self-intersection prevention).
  // Control-point-based = independent of whether a neck exists.
  const lim = Math.min(openMin(p) - td - 2, bodyMinR(p) - 3);
  return Math.max(6, Math.min(p.tabR ?? 15, lim));
}
// Amount (mm) to deepen the tab inner end toward the center. Lengthens the tab tip / notch bottom
// to increase grip (still a straight tongue).
const TAB_DEEPEN = 5;
// Minimum wall thickness (mm) to leave between adjacent tab notches on the koma. With many teeth
// or a small koma the wall becomes thin and non-manifold. This is the basis for both the
// deepening lower limit (ribCoreFloor) and the maximum board count (maxBoards).
const MIN_WALL = 1.6;
// Notch width (= tab thickness + print fit/tolerance).
function notchWidth(p) { return p.boardT + Math.max(0, p.fit ?? 0); }
// Center-side limit when deepening. Evaluated at notch bottom radius notchR=Ri-0.5:
//   notchR*(2π/boards) - notchW ≥ MIN_WALL  →  notchR ≥ (MIN_WALL+notchW)*boards/2π.
function ribCoreFloor(p) {
  const rNotchMin = (MIN_WALL + notchWidth(p)) * p.boards / (2 * Math.PI);
  return Math.max(6, rNotchMin + 0.5);
}
// The maximum rib count for which the koma's notch walls can stay at or above MIN_WALL, for this
// opening/board-thickness/tolerance. Notches are cut near notchR=nominalRi-0.5, and
// wall = 2π·notchR/boards − notchW. This is the upper bound on boards that keeps that ≥ MIN_WALL.
// Used as the UI's count limit, to prevent the notches from overlapping near the center and making
// the koma non-watertight (wall going negative) in the combination of small opening / thick board /
// many boards. nominalRi does not depend on boards, so this value also does not depend on the
// current boards (a monotone upper bound).
export function maxBoards(p) {
  const notchR = nominalRi(p) - 0.5;
  return Math.max(4, Math.floor((2 * Math.PI * notchR) / (MIN_WALL + notchWidth(p))));
}
// The actual tab tip / notch bottom. Deeper toward the center than the previous basis nominalRi by
// TAB_DEEPEN (lower limit = ribCoreFloor). ribOutline2D (tab) and komaShape (notch bottom) call
// this same value, so the meshing always matches (the aggregation point of the invariant). Upper
// limit is nominalRi (never shallower). When there are many teeth and floor>nominalRi, it is not
// deepened and stays as before.
export function innerRi(p) {
  const nom = nominalRi(p);
  return Math.min(nom, Math.max(ribCoreFloor(p), nom - TAB_DEEPEN));
}
// Returns an outerX function with the bamboo rib grooves carved into the outer edge (shared by
// normal/split/2D).
// ・The basis is not "the groove center's outer radius" but the local outer radius at each y.
//   → Even on a slope, the groove is not offset to one side; walls form above and below, and the
//   bamboo rib catches without sliding off.
// ・On a steep slope (a radial groove's effective depth shallows by a factor of cosθ), the depth
//   is multiplied by 1/cosθ=√(1+slope²) (capped at 2.2) to secure the effective depth for the
//   bamboo rib to seat even on a tilted face.
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
export function grooveOuterX(p, grooves, gR) {
  const h = p.height, mid = equatorY(p);
  const DEEP = 2.1; // Deeper groove = steeper flank = sharp claw-like tooth. The bamboo rib sinks deep and bites (a larger groove).
  // Each groove: depth + asymmetry (barb). Make "the center (equator) side flank gentle and the
  // opening side steep" so the tooth tip tilts toward the center (a claw-like barb) → catches the
  // bamboo rib trying to slide toward the opening. Steeper slope = stronger barb. But even at low
  // slope (cylinder/barrel etc.), always keep a minimum barb (floor) (= prevents the barb from
  // vanishing at zero slope).
  const info = grooves.map((g) => {
    const sl = (outerR(p, Math.min(1, (g + 0.6) / h)) - outerR(p, Math.max(0, (g - 0.6) / h))) / 1.2; // dR/dy
    // Depth is capped at 1.5× the bamboo rib diameter (larger, but over-digging reversal /
    // self-intersection is guarded by the split-band MIN_BAND=6 below and the manifold sweep).
    // Steep slope is multiplied by 1/cosθ (capped at 2.2) to secure effective depth.
    const depth = Math.min(p.higoD * 1.5, gR * DEEP * Math.min(2.2, Math.hypot(1, sl)));
    // Barb = floor 0.24 (always catches even when flat) + proportional to slope. Cap 0.62 (makes the opening-side flank nearly a wall).
    const skew = Math.min(0.62, 0.24 + Math.abs(sl) * 0.32);
    const centerDir = g < mid ? 1 : -1;             // direction toward the center (equator) (in y)
    return { g, depth, skew, centerDir };
  });
  return (y) => {
    let dip = 0;
    for (const { g, depth, skew, centerDir } of info) {
      const delta = y - g;
      // Center side gentle (wide), opening side steep (narrow) → a barb whose tooth tip tilts toward the center.
      const w = gR * (delta * centerDir > 0 ? 1 + skew : 1 - skew);
      const ad = Math.abs(delta);
      if (ad < w) { const d = depth * (1 - ad / w); if (d > dip) dip = d; }
    }
    return outerR(p, Math.min(Math.max(y, 0), h) / h) - dip;
  };
}
// Bamboo rib groove positions. Distributes them "evenly" over the lamp body, but places no groove
// right next to the neck (opening). It gives a half-pitch buffer (= opening/neck-side clearance) at
// the top and bottom ends and arranges the grooves evenly from the inside.
// Groove half-width (mm) = bamboo rib radius + relief. Aggregated here in one place so the
// groove-making side (ribOutline2D / ribEdges) and the drawing side (SectionEditor) always use the
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
// The radius of the koma's notch bottom (= inside this is the koma's solid part). Relieved by 0.5
// from the tab inner end innerRi. Shared by komaShape (which cuts the notch) and komaStop2D (which
// adds the shelf onto that solid part).
export function notchR(p) { return Math.max(1, innerRi(p) - 0.5); }

// [Upper koma inner stopper] A shelf on the tab's inner edge that stops the upper koma from
// entering toward the lamp body (inward) side.
// ・The koma is pulled out "outward (toward the tab tip)" after the work, so the shelf sits only on
//   the koma's inner side and does not clamp it top and bottom → no need to ride over it; insertion
//   and removal stay free, and only inward slippage is stopped.
// ・Shelf height yShelf = height + tabLen - komaT = the position of the "koma inner face" when the
//   koma is seated to the tab tip. This matches the position assumed by
//   standSlotSep = height + 2*tabLen - komaT, so it merely guarantees by shape a position that was
//   previously left to operation ("push it in to the tip") ⇒ the stand does not move.
// ・The shelf projects inward past notchR to support the underside of the koma's solid part. But
//   if it projects too far, the shelves of adjacent ribs interfere near the center, so a minimum
//   radius is applied from the circumferential clearance.
// ・When there is no room (short tab / crowded center with many teeth), returns null = no shelf as before.
const KOMA_STOP_W = 3;     // shelf projection target (mm)
const KOMA_STOP_MIN = 0.8; // do not create if the projection is under this
// opts is a hook to avoid changing the 3D-print defaults (when omitted, completely identical to
// before). Only the paper template (cardboard) relaxes this. With thick material the tab tip is
// pushed back out to ribCoreFloor and nearly coincides with the shelf's interference limit rMin
// (the difference is determined by "MIN_WALL 1.6 − shelf clearance gap" and does not depend on
// material thickness), so with the default values, at ≥3mm thickness there is always "no room" =
// the shelf vanishes. Cardboard is hand-cut and there is no real harm if adjacent shelves touch,
// so the shelf-to-shelf clearance gap and adoption lower limit min are reduced to push the shelf
// out to the full room at the center.
//   w   = shelf projection target (mm)
//   gap = circumferential clearance (mm) from the adjacent rib's shelf. Determines rMin.
//   min = do not create a shelf if the projection is under this
export function komaStop2D(p, opts = {}) {
  const { w = KOMA_STOP_W, gap = 1.0, min = KOMA_STOP_MIN } = opts;
  const yShelf = p.height + p.tabLen - p.komaT;
  if (yShelf - p.height < 1) return null;                     // tab too short, no room for a shelf
  const nR = notchR(p);
  const rMin = ((p.boardT + gap) * p.boards) / (2 * Math.PI); // minimum radius that doesn't interfere with the adjacent rib
  const Rd = Math.max(rMin, nR - w);
  if (nR - Rd < min) return null;                             // cannot achieve the projection
  return { yShelf, Rd };
}

// [Rib inner-edge curve = banana (crescent) shape] To make the rib easier to pull out from the
// opening after drying, the inner edge is also curved along the outer edge, narrowing at the
// center. The outer edge (= the lamp body face) is not changed at all, so it does not propagate to
// the mold shape / tab / koma / stand (only the inner material is reduced).
//
// Definition: the inner edge basically stays a "straight core Ri." **Only near the center** an
// inward curve is added to narrow it (bending the whole rib would give the ends an unreasonable
// shape, so it is kept local).
//   ・The curve applies only inside t∈[tC-HW, tC+HW]. Outside that, bump=0 ⇒ the inner edge stays
//     strictly Ri ⇒ the end shapes / the connection to the tab (koma) do not change at all.
//   ・bump=(1-u²)² has both value and slope 0 at the ends ⇒ connects smoothly to the straight core
//     (no corner appears).
//   ・Amplitude A is "the rib depth at the center (outer − core) × RIB_CURVE_D." On the real mold
//     (reference photo) the scoop is about 20% of the depth at that position, not carved to the
//     limit. Determining it by a depth ratio keeps the same visual proportion even when the
//     profile changes.
//   ・Finally clamped to "an upper limit that does not break the band width W" ⇒ guarantees the
//     inner edge does not cross the outer edge (no self-intersection), and it automatically becomes
//     modest where the center narrows.
const RIB_MIN_BAND = 12;  // minimum band thickness (mm). Remains even after subtracting the groove depth (max higoD*1.5).
const RIB_CURVE_C = 0.5;  // curve center (t) = the rib center
const RIB_CURVE_HW = 0.3; // curve half-width (t). Applies only to the middle 60%; the top/bottom 20% each stay core.
const RIB_CURVE_D = 0.3;  // scoop amount = the center rib depth × this (the real mold is about 20%; slightly deeper, prioritizing ease of removal)
export function ribInnerX(p) {
  const h = p.height, Ri = innerRi(p);
  const W = Math.max(RIB_MIN_BAND, effBoardWidth(p)); // band width to keep
  const bump = (t) => {
    const u = (t - RIB_CURVE_C) / RIB_CURVE_HW;
    if (Math.abs(u) >= 1) return 0;
    const v = 1 - u * u;
    return v * v; // value and slope both 0 at the ends → smooth connection to the core
  };
  // Amplitude = a fixed fraction of the center depth (real-mold basis).
  let A = Math.max(0, (outerR(p, RIB_CURVE_C) - Ri) * RIB_CURVE_D);
  // Clamp to an upper limit that does not break the band width W (automatically shallower where narrowed).
  for (let i = 0; i <= 200; i++) {
    const t = i / 200, b = bump(t);
    if (b < 1e-3) continue;
    A = Math.min(A, (outerR(p, t) - W - Ri) / b);
  }
  A = Math.max(0, A);
  return (y) => {
    const t = Math.min(1, Math.max(0, y / h));
    return Math.max(Ri, Math.min(Ri + A * bump(t), outerR(p, t) - RIB_MIN_BAND));
  };
}

// Returns the rib's outline point list (shared by the 2D cross-section drawing and the 3D rib
// geometry = the two always match). k = rib index. Normally all ribs have the same shape (grooves
// are horizontal rings), but with spiral winding (p.spiral), grooveList shifts the grooves by k, so
// the groove positions change per rib (= k affects the shape).
// With opts.smooth = true, returns "a smooth outer edge with no grooves carved" (for the paper
// template). Since 0.5mm-precision V notches can't be cut into cardboard, the paper template cuts
// the outer edge as a plain curve and shows the grooves as scale marks.
// opts.stop adjusts the upper tab's inner stopper (passed straight to komaStop2D). Both default to
// unspecified, so the 3D/STL-side calls do not change at all.
export function ribOutline2D(p, k = 0, opts = {}) {
  const h = p.height, tl = p.tabLen, gR = grooveR(p);
  // Bamboo rib grooves are made over the whole lamp body (between the outermost control points).
  // The curve always gets grooves, and grooves are placed at the top/bottom ends too.
  // With spiral winding, the groove positions shift by rib index k (ribEdges aligns with the same grooveList(p,gR,k)).
  const grooves = grooveList(p, gR, k);
  const outerX = opts.smooth
    ? (y) => outerR(p, Math.min(Math.max(y, 0), h) / h)
    : grooveOuterX(p, grooves, gR);
  const Ri = innerRi(p), STEP = 0.5, pts = []; // fine, to pick up the barb's steep flank
  // Tab = a straight tongue. Match the tip exactly to the koma outer radius kR (no overhang).
  const kR = komaR(p);
  // Bottom tab: stays a straight rectangle (the stopper is only on the upper koma side).
  pts.push([Ri, 0], [Ri, -tl], [kR, -tl], [kR, 0], [outerR(p, 0), 0]);
  for (let y = STEP; y <= h; y += STEP) pts.push([outerX(Math.min(y, h)), Math.min(y, h)]);
  // Top tab: insert the koma from the tip (outside), and the inner-edge shelf supports the underside of the koma's solid part to stop inward slippage.
  pts.push([outerR(p, 1), h], [kR, h], [kR, h + tl], [Ri, h + tl]);
  const stop = komaStop2D(p, opts.stop);
  if (stop) pts.push([Ri, stop.yShelf], [stop.Rd, stop.yShelf], [stop.Rd, h]); // shelf (projection)
  // Inner edge: the banana (crescent) curve from top to bottom. Both ends return to Ri, so it connects to the tabs.
  const innerX = ribInnerX(p);
  pts.push([Ri, h]);
  for (let y = h - STEP; y > 0; y -= STEP) pts.push([innerX(y), y]);
  pts.push([Ri, 0]);
  return pts;
}
// Lightening windows (keep the outer band bandW and the inner core spineW, divided by struts strut).
// The window's outer boundary is based on the "smooth outer edge (outerR)" ignoring the groove bumps (prevents bumpiness).
const Y_STAGGER = 0.13; // amount (mm) to offset the window's y-ends off the outline sample lattice (0.5mm)
export function lightenHoles2D(p) {
  const h = p.height, td = tabDepth(p);
  const spineW = Math.max(9, td + 3), bandW = 11, strut = 8, MIN_MAT = 12;
  const oS = (y) => outerR(p, Math.min(Math.max(y, 0), h) / h); // smooth outer edge
  // Make the window's inner side follow the inner-edge banana curve (keeping the core spineW at a
  // constant width) → the center window also takes a shape following the scoop. Collinear points are
  // thinned by cleanPoly, so earcut does not break.
  const rIn = ribInnerX(p);
  const xi = (y) => rIn(Math.min(Math.max(y, 0), h)) + spineW;
  // Bottom: keep the neck's steep rise (flare) solid to reinforce it → do not create a thin, easily
  // broken strut.
  // Top: narrows to a point, so leave a small margin. Instead of "dropping" the window, shrink it to
  //       the range where material remains (even at the narrowing top, produce a small window to even
  //       out the lightening effect).
  const yBot = cutYbot(p) + 14, yTop = h - cutYtop(p) - 6;
  const nWin = Math.max(1, Math.round((yTop - yBot) / 46)), winH = (yTop - yBot) / nWin, holes = [];
  const thin = (y) => oS(y) - bandW - xi(y) < MIN_MAT;
  for (let i = 0; i < nWin; i++) {
    let y0 = yBot + i * winH + strut / 2, y1 = yBot + (i + 1) * winH - strut / 2;
    // At thin-material ends (like the narrowing top), pull the window ends in short of it (shrink instead of eliminating entirely).
    while (y1 - y0 > 4 && thin(y1)) y1 -= 2;
    while (y1 - y0 > 4 && thin(y0)) y0 += 2;
    if (y1 - y0 < 14) continue;
    // With a waist (center-narrowing shape), if a thin band remains partway through the window, earcut breaks, so check the whole range.
    let ok = true;
    for (let y = y0; y <= y1; y += 2) if (thin(y)) { ok = false; break; }
    if (!ok) continue;
    // Offset the window's y-ends slightly off the outline's sample lattice (STEP=0.5mm steps). If
    // they land on exactly the same scan line, the window corner and outline vertex become collinear
    // and earcut makes a zero-area triangle, resulting in an open edge (the same known degeneracy as
    // boardGeometry's STAGGER; the offset does not affect the lightening effect).
    const ya = y0 + Y_STAGGER, yb = y1 - Y_STAGGER;
    if (yb - ya < 10) continue;
    // A closed loop tracing the outer side (inside the band) upward and returning down the inner side
    // (outside the core = the banana curve). Cut both edges with the same number of divisions and
    // match the ends exactly (no stray points at the corners).
    const ns = Math.max(2, Math.ceil((yb - ya) / 2));
    const poly = [];
    for (let i = 0; i <= ns; i++) { const y = ya + ((yb - ya) * i) / ns; poly.push([oS(y) - bandW, y]); }
    for (let i = ns; i >= 0; i--) { const y = ya + ((yb - ya) * i) / ns; poly.push([xi(y), y]); }
    holes.push(poly);
  }
  return { holes, spineW, bandW };
}

// Point-list cleanup before extrusion (used for both the outline and the windows).
// ・Remove near-duplicate points: they arise at the barb (steep flank) and at the neck merge. Left
//   in, they make degenerate triangles → open edge.
// ・Remove collinear points: without this, "points on the same line" line up in the hundreds in flat
//   stretches like the inner-edge curve. earcut drops collinear points when triangulating, so the
//   cap's boundary diverges from the side-wall boundary and becomes an open edge (the side walls are
//   built exactly per the point list, but the cap discards points).
//   The test uses "the perpendicular distance from the line joining the neighboring points" (stable regardless of length).
function cleanPoly(pts, eps = 1e-3) {
  const out = [];
  for (const q of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > eps) out.push(q); }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  if (out.length < 4) return out;
  const keep = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
    const dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy);
    // If a-c is collapsed, keep b (cannot decide)
    if (len < eps) { keep.push(b); continue; }
    const dist = Math.abs(dx * (a[1] - b[1]) - dy * (a[0] - b[0])) / len; // distance from b to line a-c
    if (dist > eps) keep.push(b);
  }
  return keep.length >= 3 ? keep : out;
}
// Builds a Shape for extrusion from a point list (+ hole point lists). Both the outline and the
// holes always go through cleanPoly (forgetting the cleanup on either one lets earcut break the cap
// and produce an open edge).
function shapeFromPts(pts, holes = []) {
  const outline = cleanPoly(pts);
  const s = new THREE.Shape();
  outline.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  for (const hole of holes) {
    const hp = cleanPoly(hole);
    if (hp.length < 3) continue;
    const path = new THREE.Path();
    hp.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
    s.holes.push(path);
  }
  return s;
}

// ============ Rib ============
// The rib's inner/outer edge functions (shared by normal/split)
export function ribEdges(p, k) {
  const { height } = p;
  const boardWidth = effBoardWidth(p); // limited to a pull-out-able width
  const oB = outerR(p, 0), oT = outerR(p, 1);
  const tw = tabDepth(p); // tab depth (uniform top and bottom)
  const gR = grooveR(p);
  // Grooves span the whole lamp body. Aligned by the same rule (grooveR/grooveList) as ribOutline2D (spiral shifts by k).
  const grooves = grooveList(p, gR, k);
  const outerX = grooveOuterX(p, grooves, gR);
  // Inner-edge lower limit. A width-dependent lower limit prevents a pointed spike at the bottom end.
  // But at a waist (narrow center) the lower limit can exceed the outer edge and the band can invert
  // (self-intersect), so the upper side is also clamped to always keep at least MIN_BAND from the
  // outer edge, guaranteeing the band width (prevents non-manifold split parts).
  const mInner = Math.max(8, boardWidth * 0.4), MIN_BAND = 6;
  const innerX = (y) => {
    const oR = outerR(p, y / height);
    return Math.min(Math.max(mInner, oR - boardWidth), oR - MIN_BAND);
  };
  return { oB, oT, tw, outerX, innerX };
}
// [For spiral winding] Engrave a serial number (k+1) on the rib = a mark of the arrangement order
// around the circumference. In a spiral, the groove positions differ per rib, and unless they are
// arranged in the correct order the bamboo rib does not form a continuous spiral, yet the printed
// physical parts are indistinguishable. So the number is engraved on the solid band at the bottom end.
// ・Each digit cuts the lit segments of "7 segments" as **independent thin rectangular through-holes.**
//   Since there are gaps (G) between segments, even enclosing digits like 0/8 keep the center island
//   connected to the body through the corner gaps = watertight like the lightening windows (engraving
//   = holes, to avoid adding solid volume = non-manifold).
// ・Normal (non-spiral) returns an empty array ⇒ existing STL is completely unchanged (hash match).
// ・For an extremely small opening where there is no room (width), give up on the number (the mold function is unchanged).
export function ribNumberHoles2D(p, k) {
  if (!p.spiral) return [];
  const h = p.height, Ri = innerRi(p), s = String(k + 1);
  let W = 6, H = 11, T = 1.2, CG = 0.45, GX = 2;            // digit: width/height/bar thickness/corner gap/inter-digit gap (mm)
  const y0base = Math.max(4, p.tabLen * 0.4);               // the solid band just above the bottom tab
  const outer = outerR(p, Math.min(Math.max(y0base + H / 2, 0), h) / h);
  const availW = (outer - 5) - (Ri + 3);                    // usable width leaving inner edge 3 / outer edge (groove) 5mm
  if (availW < 6) return [];
  let blockW = s.length * W + (s.length - 1) * GX;
  if (blockW > availW) {                                    // shrink uniformly to fit
    const sc = availW / blockW; W *= sc; H *= sc; T *= sc; CG *= sc; GX *= sc; blockW = availW;
    if (H < 3.5) return [];                                 // too small to engrave
  }
  const x0 = Ri + 3 + (availW - blockW) / 2;                // center the band
  // No segment overlaps another (overlap makes the extrusion cap non-manifold). Horizontal bars are
  // set inward in x by the vertical-bar width + corner gap; vertical bars are set away in y from the
  // middle/top/bottom horizontal bars by the corner gap.
  const hx0 = T + CG, hx1 = W - T - CG, my = H / 2;
  const SEG = { "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg", "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg" };
  const rects = {
    a: [hx0, H - T, hx1, H], g: [hx0, my - T / 2, hx1, my + T / 2], d: [hx0, 0, hx1, T],
    f: [0, my + T / 2 + CG, T, H - T - CG], b: [W - T, my + T / 2 + CG, W, H - T - CG],
    e: [0, T + CG, T, my - T / 2 - CG], c: [W - T, T + CG, W, my - T / 2 - CG],
  };
  // earcut "bridges" holes to the outline to triangulate the cap, but if (a) a hole's horizontal edge
  // coincides with the outline sample's (STEP=0.5mm) scan line, or (b) multiple holes share the same y
  // (the mirrored vertical bars f/b and e/c are at the same height), the bridge degenerates into an
  // open edge. So each hole is given a **unique, off-lattice** y offset (different for every hole → it
  // matches neither a scan line nor any other hole). The offset is the same at the top and bottom
  // ends, so the bar thickness is unchanged; the amount is at most about 0.6mm and the digit's
  // appearance does not change.
  const holes = [];
  let hi = 0;
  for (let i = 0; i < s.length; i++) {
    const ox = x0 + i * (W + GX);
    for (const ch of SEG[s[i]]) {
      const [rx0, ry0, rx1, ry1] = rects[ch];
      const j = 0.13 + hi * 0.031;                     // unique, off-lattice (avoid multiples of 0.5)
      hi++;
      const ya = y0base + ry0 + j, yb = y0base + ry1 + j;
      holes.push([[ox + rx0, ya], [ox + rx1, ya], [ox + rx1, yb], [ox + rx0, yb]]);
    }
  }
  return holes;
}
// 3D rib = extrude the 2D final shape (straight inner edge + inner tabs at the same top/bottom positions + outer-edge curve + lightening).
export function ribShape(p, k) {
  const holes = p.lighten ? lightenHoles2D(p).holes : [];
  return shapeFromPts(ribOutline2D(p, k), [...holes, ...ribNumberHoles2D(p, k)]);
}
export const ribGeometry = (p, k) => {
  const g = new THREE.ExtrudeGeometry(ribShape(p, k), { depth: p.boardT, bevelEnabled: false });
  g.translate(0, 0, -p.boardT / 2);
  return g;
};

// ---- Rib top/bottom split into two (for large lamps) ----
// Butt them at the split face and join them with a "splice plate + integral studs" inserted on the
// inner face. Being a thin plate, the splice plate supports out-of-plane bending. The locating holes
// double as the studs.
const SPLICE_T = 3, SPLICE_HALF = 22, PIN_D = 3, PIN_FIT = 0.5;
function ribBandShape(p, k, y0, y1, pins) {
  const { height, tabLen } = p;
  const { oB, oT, tw, outerX, innerX } = ribEdges(p, k);
  const STEP = 0.4;
  const pts = [];
  pts.push([innerX(y0), y0]);
  if (y0 <= 0.001) { // the actual bottom end: base edge + tab
    pts.push([oB - tw, 0], [oB - tw, -tabLen], [oB, -tabLen], [oB, 0]);
  } else {
    pts.push([outerX(y0), y0]); // cross straight at the split face
  }
  for (let y = y0 + STEP; y < y1; y += STEP) pts.push([outerX(y), y]);
  if (y1 >= height - 0.001) { // the actual top end: tab
    pts.push([oT, height], [oT, height + tabLen], [oT - tw, height + tabLen], [oT - tw, height], [innerX(height), height]);
  } else {
    pts.push([outerX(y1), y1], [innerX(y1), y1]);
  }
  for (let y = y1 - STEP; y > y0; y -= STEP) pts.push([innerX(y), y]);
  // Run the outline through cleanPoly (remove duplicate/collinear points). Duplicate vertices appear
  // where the inner edge stays constant at its lower limit joins the tab end, and collinear points
  // appear on the outer edge's flat stretches. Left in, earcut makes degenerate triangles and the
  // cap/side-wall boundaries diverge into non-manifold. The stud holes are arcs, so they are added after this.
  const s = shapeFromPts(pts);
  if (pins) for (const [hx, hy] of pins) { const h = new THREE.Path(); h.absarc(hx, hy, (PIN_D + PIN_FIT) / 2, 0, Math.PI * 2, true); s.holes.push(h); }
  return s;
}
export function ribSplitParts(p, k) {
  const { height, boardT } = p;
  const splitY = height / 2;
  const { outerX, innerX } = ribEdges(p, k);
  const wLo = innerX(splitY), wHi = outerX(splitY);
  // Place the stud holes where they have at least (hole radius + margin) of clearance inside the band
  // across "that hole's y position (splitY±10) and the split face." If the band narrows at a waist the
  // hole punches through the edge into non-manifold, so keep them within a safe x range [lo, hi] (if
  // narrow, one hole at the center; if extremely narrow, splice plate only).
  const pinR = (PIN_D + PIN_FIT) / 2, M = 2.5;
  const yB = splitY - 10, yT = splitY + 10;
  // A hole spans ±pinR in y, so secure a safe zone from the edge not only at the center y but across
  // the hole's entire y range (prevents the hole from punching through the curved-surface edge into
  // non-manifold near a waist). Place the pin at the intersection of the safe x ranges of both the top
  // and bottom bands. If narrow, one at the center; if extremely narrow, splice plate only.
  const span = (py) => {
    let lo = -Infinity, hi = Infinity;
    for (let y = py - pinR - 1; y <= py + pinR + 1; y += 0.5) { lo = Math.max(lo, innerX(y)); hi = Math.min(hi, outerX(y)); }
    return [lo + pinR + M, hi - pinR - M];
  };
  const [aLo, aHi] = span(yB), [bLo, bHi] = span(yT);
  const lo = Math.max(aLo, bLo), hi = Math.min(aHi, bHi);
  const pxs = hi - lo >= 2 * pinR + 6 ? [lo, hi] : hi > lo ? [(lo + hi) / 2] : [];
  const pinsB = pxs.map((px) => [px, yB]);
  const pinsT = pxs.map((px) => [px, yT]);
  const bottom = new THREE.ExtrudeGeometry(ribBandShape(p, k, 0, splitY, pinsB), { depth: boardT, bevelEnabled: false });
  const top = new THREE.ExtrudeGeometry(ribBandShape(p, k, splitY, height, pinsT), { depth: boardT, bevelEnabled: false });
  const sh = new THREE.Shape(); // splice plate
  const sm = Math.min(3, (wHi - wLo) / 3);   // when the band is narrow, shrink the splice-plate margin too, to prevent inversion
  const sx0 = wLo + sm, sx1 = wHi - sm;
  sh.moveTo(sx0, splitY - SPLICE_HALF); sh.lineTo(sx1, splitY - SPLICE_HALF);
  sh.lineTo(sx1, splitY + SPLICE_HALF); sh.lineTo(sx0, splitY + SPLICE_HALF); sh.closePath();
  const parts = [new THREE.ExtrudeGeometry(sh, { depth: SPLICE_T, bevelEnabled: false })];
  for (const [hx, hy] of [...pinsB, ...pinsT]) { // integral stud
    const stud = new THREE.CylinderGeometry(PIN_D / 2 - 0.1, PIN_D / 2 - 0.1, boardT, 16);
    stud.rotateX(Math.PI / 2);
    stud.translate(hx, hy, SPLICE_T + boardT / 2);
    parts.push(stud);
  }
  // ExtrudeGeometry (non-indexed) and CylinderGeometry (indexed) are mixed, so unify them
  const splice = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  return { bottom, top, splice };
}

// ============ Koma (the small gear hub that bundles the tabs) ============
// Like the main one, a small gear with edge-open notches (parallel walls). The tab (inner end
// Ri〜Ri+td) meets the koma's edge. The notch reaches the tab's inner end (Ri), and the rib extends
// out through the notch. The stand receives the koma.
export function komaShape(p) {
  const { boards, boardT } = p;
  const R = komaR(p);
  // Notch width = board thickness + print fit. The tab itself stays boardT (nominally "tab
  // width = notch width = board thickness" matches, and fit only opens the actual fit clearance).
  // With fit=0, there is no gap as before.
  const sw = boardT + Math.max(0, p.fit ?? 0);
  const eps = Math.asin(Math.min(0.9, (sw / 2) / R));
  const rOut = Math.sqrt(Math.max(1, R * R - (sw / 2) * (sw / 2)));
  const nR = notchR(p); // depth reaching the tab's inner end (Ri). Shared with komaStop2D (the projection is inside this).
  const shape = new THREE.Shape();
  shape.moveTo(R * Math.cos(eps), R * Math.sin(eps));
  for (let k = 0; k < boards; k++) {
    const a0 = (k / boards) * Math.PI * 2;
    const a1 = ((k + 1) / boards) * Math.PI * 2;
    for (let i = 1; i <= 12; i++) {
      const a = a0 + eps + (i / 12) * (a1 - a0 - 2 * eps);
      shape.lineTo(R * Math.cos(a), R * Math.sin(a));
    }
    const dx = Math.cos(a1), dy = Math.sin(a1), nx = -dy, ny = dx;
    shape.lineTo(nR * dx - nx * sw / 2, nR * dy - ny * sw / 2);
    shape.lineTo(nR * dx + nx * sw / 2, nR * dy + ny * sw / 2);
    // The notch's outer return point is the start of the next tooth. For the last board, it exactly
    // matches the start point (moveTo), so it is omitted and left to closePath (prevents a degenerate
    // triangle from a duplicate point).
    if (k < boards - 1) shape.lineTo(rOut * dx + nx * sw / 2, rOut * dy + ny * sw / 2);
  }
  shape.closePath();
  return shape;
}
export function komaGeometry(p) {
  return new THREE.ExtrudeGeometry(komaShape(p), { depth: p.komaT, bevelEnabled: false });
}

// ============ Opening ring (kuchiwa) ============
// A thin ring inserted into the top and bottom openings of the finished washi lantern. Fitted into
// the opening to keep it perfectly round, and the bamboo rib ends are wound and fastened around its
// outer edge. The opening position/diameter is decided by the outermost control point, so it comes
// automatically from openingR (outer diameter = opening diameter). Not a thick washer nor a tall band,
// but a thin wire-like hoop (thin both radially and in height). A new part independent of the existing
// parts (rib/koma/stand).
const RING_WALL = 2;   // hoop wall thickness (radial, mm). Thin = the bamboo rib can wind around the outer edge.
const RING_H = 2;      // hoop height (= Z extrusion, mm). A thin flat ring (wire-like).
// Fit clearance (radius, mm). The opening ring fits on the **outside** of the opening, so the ring's
// **inner diameter** must smoothly match the opening's outer diameter (= the rib's outer side). This
// widens by this much to relieve the amount the inner diameter shrinks due to print error. 0.3
// (diameter 0.6mm) was loose, so changed to 0.15 (diameter 0.3mm). It is fixed by the bamboo rib and
// washi, so slightly tight is better.
const RING_FIT = 0.15;
// The opening (= opening ring) radius. top=true for the top end, false for the bottom end. Uses
// outerR's end value regardless of whether a neck exists.
export function openingR(p, top) { return outerR(p, top ? 1 : 0); }
// A full-circle point list. absarc(0,2π) creates a duplicate start=end point and spawns a degenerate
// triangle, so it is built from N points below 0..2π and the loop is not closed (Shape/Path close it
// automatically).
function circlePts(r, N) {
  const pts = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a))); }
  return pts;
}
export function ringGeometry(p, top) {
  const R = openingR(p, top);          // the opening's outer diameter = the rib's outer side (lamp body face)
  const inner = R + RING_FIT;          // inner diameter = opening outer diameter + clearance (the ring fits smoothly onto the outside of the opening)
  const outer = inner + RING_WALL;     // outward by the wall thickness. The bamboo rib winds around this outer edge
  const N = 96;
  const shape = new THREE.Shape(circlePts(outer, N));
  shape.holes.push(new THREE.Path(circlePts(inner, N).reverse())); // the hole is wound in reverse
  return new THREE.ExtrudeGeometry(shape, { depth: RING_H, bevelEnabled: false, curveSegments: 1 });
}

// ============ Stand (simple insertion type) ============
// Two columns of "uniform-thickness flat plate" that receive the koma's edge in a U-shaped saddle
// (notch) are simply inserted into the slots of a single thin base plate. Since the columns are of
// constant thickness, their bottom faces are completely flat → they can be printed laid flat with no
// overhangs (no supports needed). A single plate holds both columns at the correct spacing → no clips
// or connecting hardware needed.
const GROOVE_FIT = 1.0;   // the U-saddle's koma-thickness clearance (play for the koma to fit smoothly)
const SADDLE_FIT = 1.5;   // the saddle receiving radius clearance (room to drop the koma edge in from above)
const BASE_T = 5;         // base plate thickness (mm, keep the center thin)
const COLLAR_H = 10;      // height of the collar (socket) raised around the slot → deepens the insertion and suppresses wobble
const COLLAR_W = 4;       // collar wall thickness (mm)
const TENON_W = 44;       // column insertion tenon width (mm)
const TENON_D = BASE_T + COLLAR_H; // tenon insertion depth = collar top face ~ plate bottom (received over the full length)
const FOOT_HW = 29;       // column foot half-width (the foot that rests on the collar top face)
const SLOT_FIT = 0.4;     // slot fit clearance
const BASE_MARGIN = 8;    // base plate edge margin
// Column thickness (z) = koma thickness + clearance. The column is made from a single flat plate of this constant thickness.
function standFullW(p) { return p.komaT + GROOVE_FIT; }

// Column profile (local x=width, y=height). Includes the insertion tenon at the bottom + the U-saddle at the top + lightening windows.
function standProfile(seatR, H, halfOpen, colW) {
  const lipY = H - seatR * Math.cos(halfOpen);
  const lipX = seatR * Math.sin(halfOpen);
  const topY = lipY + 8;
  const shoulder = 26;               // the height at which the foot widens into the body
  const s = new THREE.Shape();
  s.moveTo(-TENON_W / 2, -TENON_D);  // bottom: center tenon → foot → taper to the shoulder
  s.lineTo(TENON_W / 2, -TENON_D);
  s.lineTo(TENON_W / 2, 0);
  s.lineTo(FOOT_HW, 0);
  s.lineTo(colW, shoulder);
  s.lineTo(colW, topY);
  s.lineTo(lipX, topY);
  s.lineTo(lipX, lipY);
  for (let i = 0; i <= 32; i++) {
    const a = halfOpen - (i / 32) * (2 * halfOpen); // right edge → bottom → left edge (U-saddle)
    s.lineTo(seatR * Math.sin(a), H - seatR * Math.cos(a));
  }
  s.lineTo(-lipX, topY);
  s.lineTo(-colW, topY);
  s.lineTo(-colW, shoulder);
  s.lineTo(-FOOT_HW, 0);
  s.lineTo(-TENON_W / 2, 0);
  s.lineTo(-TENON_W / 2, -TENON_D);
  s.closePath();
  // Lightening windows. Keep the edge legs while cutting a wide center out (a tall column is split in two by a strut to retain rigidity).
  const wx = colW - 8;               // keep just 8mm of the outer leg
  const wy0 = shoulder + 5, wy1 = H - seatR - 6; // from just above the foot shoulder to just below the saddle bottom
  if (wx > 8 && wy1 - wy0 > 40) {    // a tall column is split in two (keeping a strut)
    const mid = (wy0 + wy1) / 2, strut = 8;
    for (const [a, b] of [[wy0, mid - strut / 2], [mid + strut / 2, wy1]]) {
      if (b - a < 14) continue;
      const w = new THREE.Path();
      w.moveTo(-wx, a); w.lineTo(wx, a); w.lineTo(wx, b); w.lineTo(-wx, b); w.closePath();
      s.holes.push(w);
    }
  } else if (wx > 8 && wy1 - wy0 > 16) {
    const w = new THREE.Path();
    w.moveTo(-wx, wy0); w.lineTo(wx, wy0); w.lineTo(wx, wy1); w.lineTo(-wx, wy1); w.closePath();
    s.holes.push(w);
  }
  return s;
}
// Column = a single flat plate of constant thickness (= koma thickness + clearance). The U-notch at
// the top receives the koma's edge, and the center tenon at the bottom is inserted into the base
// plate's slot. Since the thickness is uniform, the bottom face is completely flat in flat printing →
// no overhangs, no supports. The koma's thickness direction settles into the U-groove, and its axial
// direction is located by being clamped between the two left/right columns.
// Dimensions for placing the stand at the correct height in the assembly preview (floor basis):
export function standCollarTop() { return BASE_T + COLLAR_H; } // the height the column foot rests at (= collar top face)
export function standSaddleH(p) { return maxRadius(p) + 15; }  // the column-local saddle center height
export function standGeometry(p) {
  const R = maxRadius(p);
  const kR = komaR(p);
  const H = standSaddleH(p);         // saddle center (koma center) height (max radius + 15mm floor clearance)
  const saddleR = kR + SADDLE_FIT;   // U-groove receiving radius (koma edge + clearance)
  const halfOpen = Math.PI * 0.5;    // semicircular saddle: mouth width = diameter → the koma can be dropped in from above and seated
  const colW = saddleR * Math.sin(halfOpen) + 12;
  const T = standFullW(p);           // plate thickness = koma thickness + clearance
  const g = new THREE.ExtrudeGeometry(
    standProfile(saddleR, H, halfOpen, colW),
    { depth: T, bevelEnabled: false });
  g.translate(0, 0, -T / 2);
  return g;
}
// The two columns (saddles) won't fit into the grooves unless they come directly beneath the two
// koma.
// → Column slot spacing = koma center spacing. The koma is inserted onto the tab (length tabLen) and
//   pushed all the way to the tip, so the koma center comes at komaT/2 from the end. Hence
//   spacing = lamp body + 2*(tabLen - komaT/2) = lamp body + 2*tabLen - komaT (based on the tab tip =
//   the insertion stop position).
export function standSlotSep(p) { return p.height + 2 * p.tabLen - p.komaT; }
// Base plate: a thin flat plate with two column-tenon slots. Total length = koma spacing + slot width
// + margins at both ends. (The slots are placed directly beneath the koma = ±spacing/2, with material
// left outside them, so it is slightly longer than the rib.)
export function standBoardLength(p) {
  return standSlotSep(p) + standFullW(p) + SLOT_FIT + 2 * BASE_MARGIN;
}
// A rounded-rectangle hole path (center cx,cy / half-widths hx,hy / corner radius r).
// Rounding the corners avoids the "multiple holes sharing the same scan line" degeneracy, so three.js
// ExtrudeGeometry doesn't produce non-manifold (open edge). It is also kind to tenon insertion.
function roundedRectPath(cx, cy, hx, hy, r) {
  r = Math.max(0.2, Math.min(r, hx - 0.05, hy - 0.05));
  const p = new THREE.Path();
  p.moveTo(cx - hx + r, cy - hy);
  p.lineTo(cx + hx - r, cy - hy); p.absarc(cx + hx - r, cy - hy + r, r, -Math.PI / 2, 0, false);
  p.lineTo(cx + hx, cy + hy - r); p.absarc(cx + hx - r, cy + hy - r, r, 0, Math.PI / 2, false);
  p.lineTo(cx - hx + r, cy + hy); p.absarc(cx - hx + r, cy + hy - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(cx - hx, cy - hy + r); p.absarc(cx - hx + r, cy - hy + r, r, Math.PI, Math.PI * 1.5, false);
  p.closePath();
  return p;
}
export function boardGeometry(p) {
  const len = standBoardLength(p);
  const sep = standSlotSep(p);                          // column slot spacing = koma spacing
  const W = TENON_W + 2 * BASE_MARGIN;                   // base plate width
  const s = new THREE.Shape();
  s.moveTo(-len / 2, -W / 2);
  s.lineTo(len / 2, -W / 2);
  s.lineTo(len / 2, W / 2);
  s.lineTo(-len / 2, W / 2);
  s.closePath();
  const sx = (standFullW(p) + SLOT_FIT) / 2, sy = (TENON_W + SLOT_FIT) / 2;
  // Two column-tenon slots. The corners stay square (so the rectangular tenon inserts snugly).
  // But if the two slots' y-ends are exactly on the same scan line, earcut breaks and produces an open
  // edge, so they are staggered by ±0.1mm up/down to avoid the degeneracy (the offset is within
  // SLOT_FIT=0.4mm, so it does not affect the fit).
  const STAGGER = 0.1;
  const slots = [[-sep / 2, STAGGER], [sep / 2, -STAGGER]];
  const slotRect = (cx, dy, hx, hy) => {
    const p = new THREE.Path();
    p.moveTo(cx - hx, dy - hy); p.lineTo(cx + hx, dy - hy);
    p.lineTo(cx + hx, dy + hy); p.lineTo(cx - hx, dy + hy); p.closePath();
    return p;
  };
  for (const [cx, dy] of slots) s.holes.push(slotRect(cx, dy, sx, sy));
  // Lightening: cut the center between the slots as a single large window (no strut). Keep only the ends and around the slots.
  const wall = 9, hw = W / 2 - wall, innerHalf = sep / 2 - sx - wall;
  if (hw > 4 && innerHalf > 8) {
    s.holes.push(roundedRectPath(0, 0, innerHalf, hw, 2));
  }
  const geos = [new THREE.ExtrudeGeometry(s, { depth: BASE_T, bevelEnabled: false })];
  // Raise a collar (socket) around the slots, taking the insertion depth from BASE_T → BASE_T+COLLAR_H.
  // Each collar is an independent sealed solid. Sink it slightly into the plate so it self-intersects
  // (= unions in the slicer), avoiding a non-manifold edge from exactly coincident faces. The center
  // stays thin, so the material is minimal.
  const SINK = 1.5, EPS = 0.03;
  for (const [cx, dy] of slots) {
    const c = new THREE.Shape();
    const oX = sx + COLLAR_W, oY = sy + COLLAR_W;
    c.moveTo(cx - oX, dy - oY); c.lineTo(cx + oX, dy - oY);
    c.lineTo(cx + oX, dy + oY); c.lineTo(cx - oX, dy + oY); c.closePath();
    c.holes.push(slotRect(cx, dy, sx + EPS, sy + EPS)); // slightly non-coincident with the plate slot
    const g = new THREE.ExtrudeGeometry(c, { depth: COLLAR_H + SINK, bevelEnabled: false });
    g.translate(0, 0, BASE_T - SINK);
    geos.push(g);
  }
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}
