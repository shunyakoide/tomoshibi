/**
 * The radius function `outerR(p, t)` — the heart of the design — and every dimension that follows
 * from it: the koma's outer radius, the tab's depth and tip, the koma notch's bottom, the rib-count
 * ceiling. They live together because they are mutually recursive: `outerR` needs `komaR` (a
 * neck-less end IS the tab size) and `komaR` needs `outerR` (via `bodyMinR`'s self-intersection
 * guard), so splitting them would buy an import cycle.
 *
 * It is also where the **print-fit invariants** are aggregated — `innerRi` / `tabTipRi` / `notchR`
 * below. Those single definitions are the only reason a reprinted rib still fits a koma printed
 * last month; change one and check both parts.
 *
 * Pure arithmetic: no three.js, React or DOM, and nothing here builds geometry.
 */
import type { Design, Handle, Pt } from "../types.ts";

// ============ Profile (control-point spline) ============
// The silhouette is a radius function joining the control-point array `pts` with monotone Hermite
// interpolation (Fritsch–Carlson); the ◇ handles in the drawing edit `pts` directly. Lamp body
// spline: P=[{neck bottom, rBot}, …control points…, {neck top, rTop}]. Each point's tangent dr/dt
// comes from the adjacent chords, clamped to the same sign as, and within 3× of, the adjacent chord
// (no overshoot, no unwanted sharp curves); endpoints use the chord to the next point.
function fukuroTangents(P: Pt[]): number[] {
  const n = P.length, d: number[] = new Array(n - 1), T: number[] = new Array(n);
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
function fukuroSpline(P: Pt[], x: number, T?: number[]): number {
  T = T || fukuroTangents(P);
  let i = 0;
  while (i < P.length - 2 && x > P[i + 1].t) i++;
  const p1 = P[i], p2 = P[i + 1], h = p2.t - p1.t, s = h > 1e-6 ? (x - p1.t) / h : 0;
  const m1 = T[i] * h, m2 = T[i + 1] * h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p1.r + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2.r + (s3 - s2) * m2;
}

/**
 * The least value of `a s³ + b s² + c s + d` on s ∈ [0,1]: the two endpoints, plus any root of the
 * derivative `3a s² + 2b s + c` that lands strictly inside. Used by `bodyMinR` — see the note there
 * for why that function may not sample.
 */
function cubicMin(a: number, b: number, c: number, d: number): number {
  let m = Math.min(d, a + b + c + d);                       // s = 0 and s = 1
  const A = 3 * a, B = 2 * b;
  const take = (s: number) => { if (s > 0 && s < 1) m = Math.min(m, ((a * s + b) * s + c) * s + d); };
  if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) take(-c / B); }   // the derivative is linear
  else {
    const disc = B * B - 4 * A * c;
    if (disc >= 0) { const q = Math.sqrt(disc); take((-B + q) / (2 * A)); take((-B - q) / (2 * A)); }
  }
  return m;
}

// ---- Bézier tangent handles (optional) ----
// Like a pen tool's direction lines: `ho` (next-point side) / `hi` (prev-point side) are relative
// vectors {dt,dr} in (t,r) space. **One point with a handle switches the lamp body to Bézier
// evaluation**; with none it stays monotone Hermite (`fukuroSpline`), so existing presets and saved
// designs produce byte-identical STLs. Single-valuedness (height t → one radius r) is kept by
// clamping the segment's control points to non-decreasing t (ho.dt∈[0,Δt] / hi.dt∈[-Δt,0], the total
// shrunk to within Δt so they cannot cross); t(u) is then monotone in u, so bisection finds the u
// for t=x uniquely without breaking the t-monotone assumption grooves and extrusion rely on.
function anyHandle(pts: Pt[]): boolean { for (const q of pts) if (q && (q.ho || q.hi)) return true; return false; }
// Default for points with no handle (equivalent to Catmull-Rom; endpoints one-sided 1/3, sharp
// corner points 0 = straight line).
function bezDefault(P: Pt[], i: number): { ho: Handle; hi: Handle } {
  const n = P.length, a = P[i];
  if (a.sharp) return { ho: { dt: 0, dr: 0 }, hi: { dt: 0, dr: 0 } };
  if (i === 0) { const b = P[1]; return { ho: { dt: (b.t - a.t) / 3, dr: (b.r - a.r) / 3 }, hi: { dt: 0, dr: 0 } }; }
  if (i === n - 1) { const p = P[n - 2]; return { ho: { dt: 0, dr: 0 }, hi: { dt: (p.t - a.t) / 3, dr: (p.r - a.r) / 3 } }; }
  const pv = P[i - 1], nx = P[i + 1], dt = (nx.t - pv.t) / 6, dr = (nx.r - pv.r) / 6;
  return { ho: { dt, dr }, hi: { dt: -dt, dr: -dr } };
}
function fukuroBezierR(P: Pt[], x: number): number {
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
  const T = (u: number) => { const m = 1 - u; return m * m * m * a.t + 3 * m * m * u * c1t + 3 * m * u * u * c2t + u * u * u * b.t; };
  const R = (u: number) => { const m = 1 - u; return m * m * m * a.r + 3 * m * m * u * c1r + 3 * m * u * u * c2r + u * u * u * b.r; };
  let lo = 0, hi = 1;                              // bisect for t(u)=x (t is monotone in u)
  for (let k = 0; k < 40; k++) { const u = (lo + hi) / 2; if (T(u) < x) lo = u; else hi = u; }
  return R((lo + hi) / 2);
}
// The one radius function for the lamp body curve: Bézier if there are handles, else Hermite.
// Cross-section, STL and koma computation all go through it, so they always match.
function profileR(P: Pt[], x: number, T?: number[]): number { return anyHandle(P) ? fukuroBezierR(P, x) : fukuroSpline(P, x, T); }

// Bakes each point's Bézier handles from the current Hermite curve on entry to curve-adjust mode
// (pts unchanged). A cubic Hermite IS a cubic Bézier with the control point shifted Δt/3 along the
// tangent, so the shape does not move. After baking, `sharp` means only "the handles are not
// mirrored, so the corner can move independently"; evaluation always uses ho/hi.
export function bakeBezierHandles(pts: Pt[]): Pt[] {
  if (!pts || pts.length < 2) return pts;
  const T = fukuroTangents(pts), n = pts.length;
  return pts.map((q, i) => {
    const dtN = i < n - 1 ? (pts[i + 1].t - q.t) / 3 : 0;   // next-point side Δt/3
    const dtP = i > 0 ? (q.t - pts[i - 1].t) / 3 : 0;       // prev-point side Δt/3
    return { ...q, ho: { dt: dtN, dr: T[i] * dtN }, hi: { dt: -dtP, dr: -T[i] * dtP } };
  });
}
// Effective outer radius: t∈[0,1] → mm. One continuous spline from the ends (t=0/1) to the apex with
// no vertical neck inserted — a neck there would put a flat-to-curve kink at the joint — so the ends
// are spline control points (rBot/rTop) and the outline stays smooth even with few points. The end
// bands carrying no bamboo (the neck) are handled separately via cutTbot/cutTtop, radius continuous. The
// lamp body (curve + grooves) is the t-range BETWEEN the outermost control points; the neck lies
// outside them at exactly their radius, so no flare or S-curve appears at the join.
export function fukuroRange(p: Design): { lo: number; hi: number } {
  const pts = (p.pts && p.pts.length >= 2) ? p.pts : null;
  if (!pts) return { lo: cutTbot(p), hi: 1 - cutTtop(p) };
  const nB = p.neckBot ?? true, nT = p.neckTop ?? true;
  return { lo: nB ? pts[0].t : 0, hi: nT ? pts[pts.length - 1].t : 1 };
}
// The design basis for neck/tab is the control-point radius, so toggling a neck does not change the
// tab size.
function openMin(p: Design): number {
  const pts = p.pts;
  return (pts && pts.length) ? Math.min(pts[0].r, pts[pts.length - 1].r) : Math.min(p.rTop ?? 60, p.rBot ?? 60);
}
// The body's least radius is a scan of the whole curve, and it is asked for by every radius a
// neck-less body reports and every notch the groove caps — thousands of times per rib, for a value
// that only changes when a control point moves. So it is remembered per `pts` array, and checked
// by value before it is served: the editor replaces the array rather than editing a point in
// place, but a stale minimum would be a silent wrong answer, so nothing here relies on that.
const minRMemo = new WeakMap<Pt[], { snap: number[]; m: number }>();
// Everything profileR reads of a point, as numbers (no handle → NaN, which never equals itself, so
// the comparison below spells that case out).
const ptsSnap = (pts: Pt[]): number[] =>
  pts.flatMap((q) => [q.t, q.r, q.sharp ? 1 : 0, q.ho?.dt ?? NaN, q.ho?.dr ?? NaN, q.hi?.dt ?? NaN, q.hi?.dr ?? NaN]);
function snapHolds(pts: Pt[], snap: number[]): boolean {
  if (snap.length !== pts.length * 7) return false;
  const eq = (v: number, w: number) => v === w || (v !== v && w !== w);
  for (let i = 0, j = 0; i < pts.length; i++, j += 7) {
    const q = pts[i];
    if (q.t !== snap[j] || q.r !== snap[j + 1] || (q.sharp ? 1 : 0) !== snap[j + 2]) return false;
    if (!eq(q.ho?.dt ?? NaN, snap[j + 3]) || !eq(q.ho?.dr ?? NaN, snap[j + 4])) return false;
    if (!eq(q.hi?.dt ?? NaN, snap[j + 5]) || !eq(q.hi?.dr ?? NaN, snap[j + 6])) return false;
  }
  return true;
}
/**
 * **The body's least radius, and it is a MINIMUM rather than a scan of one.** `nominalRi` and
 * `jointCap` subtract a keep from it to hold the rib's straight inner edge inside the body, so a
 * value read HIGH is an edge outside the outline: a printed rib that comes out non-watertight, a
 * cardboard cut line that crosses itself. It was 41 samples of the curve, and samples cannot carry
 * that weight — three rounds of review found three ways past them:
 *   - a `sharp` control point between two samples (read 7.47mm high), so the control points went in;
 *   - a smooth dip between two samples, so a refinement went in;
 *   - **two dips, where a refinement of the lowest SAMPLE's bracket polishes the wrong one.** On a
 *     five-point silhouette (r60, r20, r500 sharp, r24 sharp, r600 at h205) it returned the r20
 *     control point while the true minimum was 9.211 at t=0.848 — 10.8mm high, giving 8 open edges
 *     on three printed ribs and two self-crossings on the cardboard one, with every gate at 0 FAIL.
 *
 * So there is no sampling left. Between two control points the radius IS one cubic — Hermite with
 * the clamped tangents `fukuroSpline` uses, or the Bézier `fukuroBezierR` does, whose r-components
 * are not touched by that function's t-clamp — and a cubic's minimum on a closed interval is its
 * endpoints plus whichever roots of its derivative lie inside. Exact, and CHEAPER than what it
 * replaced: one quadratic and at most four evaluations per segment, against 41 spline evaluations.
 * Still memoized per `pts` array, since it is asked for thousands of times per rib.
 *
 * It is the SPLINE's minimum, and `outerR` floors what it draws at 8mm, so on a silhouette whose
 * curve dives below that this reads under the outline — the conservative direction, and the only one
 * this value may ever err in.
 *
 * Exported for `check:manifold`, which measures it against an independently sampled truth over the
 * silhouette space. The bug above hid three times behind a private function whose answer no gate
 * could see; a guard that nothing can read is a guard nothing checks.
 */
export function bodyMinR(p: Design): number {
  const pts = p.pts;
  if (!pts || pts.length < 2) return openMin(p);
  const hit = minRMemo.get(pts);
  if (hit && snapHolds(pts, hit.snap)) return hit.m;
  let m = Infinity;
  if (anyHandle(pts)) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      // The same control values `fukuroBezierR` evaluates. Its t-clamp scales only the t components,
      // so r(u) is the plain cubic Bézier through these four numbers.
      const c1 = a.r + (a.ho || bezDefault(pts, i).ho).dr;
      const c2 = b.r + (b.hi || bezDefault(pts, i + 1).hi).dr;
      m = Math.min(m, cubicMin(-a.r + 3 * c1 - 3 * c2 + b.r, 3 * a.r - 6 * c1 + 3 * c2, -3 * a.r + 3 * c1, a.r));
    }
  } else {
    const T = fukuroTangents(pts);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], h = b.t - a.t, m1 = T[i] * h, m2 = T[i + 1] * h;
      // The Hermite basis of `fukuroSpline`, in the power basis of s.
      m = Math.min(m, cubicMin(2 * a.r - 2 * b.r + m1 + m2, -3 * a.r + 3 * b.r - 2 * m1 - m2, m1, a.r));
    }
  }
  minRMemo.set(pts, { snap: ptsSnap(pts), m });
  return m;
}
export function outerR(p: Design, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const pts = (p.pts && p.pts.length) ? p.pts : [{ t: 0.5, r: (p.rTop + p.rBot) / 2 }];
  if (pts.length === 1) return Math.max(8, pts[0].r);
  const fp = pts[0], lp = pts[pts.length - 1];
  const nB = p.neckBot ?? true, nT = p.neckTop ?? true;
  // With a neck: widen the opening outward to the control point, then a vertical rectangle from
  // there to y=0/1. Without: the opening becomes the tab size (body end set to kR, no slanted taper).
  // kR is only asked for when a neck is off: komaR scans the whole body for its least radius, and
  // this function is called per sample — asked for every time, it was most of a rib's cost.
  const kR = nB && nT ? NaN : komaR(p);
  const loT = nB ? fp.t : 0, loR = nB ? fp.r : kR;
  const hiT = nT ? lp.t : 1, hiR = nT ? lp.r : kR;
  if (t <= loT) return Math.max(8, loR);
  if (t >= hiT) return Math.max(8, hiR);
  // The endpoint radius changes with the neck (loR/hiR), but ho/hi are relative vectors, so they
  // carry over. With both necks on the ends ARE the control points, and `pts` is read as it is.
  const P = nB && nT ? pts : [
    { t: loT, r: loR, ho: fp.ho, hi: fp.hi, sharp: fp.sharp },
    ...pts.slice(1, -1),
    { t: hiT, r: hiR, ho: lp.ho, hi: lp.hi, sharp: lp.sharp },
  ];
  return Math.max(8, profileR(P, t));                             // lamp body (between control points)
}
export function maxRadius(p: Design): number {
  let m = 0;
  for (let i = 0; i <= 120; i++) m = Math.max(m, outerR(p, i / 120));
  return m + p.higoD;
}
// The neck = a vertical rectangle outside (toward the opening) the outermost control point; its
// height is that point's position, and presence is independent top and bottom (neckBot / neckTop).
// On the neck-less side outerR makes it straight (lantern-like).
export function cutTbot(p: Design): number { const pts = p.pts; return (pts && pts.length) ? pts[0].t : 0; }
export function cutTtop(p: Design): number { const pts = p.pts; return (pts && pts.length) ? 1 - pts[pts.length - 1].t : 0; }
export function cutYbot(p: Design): number { return cutTbot(p) * (p.height || 1); }
export function cutYtop(p: Design): number { return cutTtop(p) * (p.height || 1); }
// Koma outer radius = the hub that bundles the tabs; the tab (inner end Ri〜Ri+td) meets its outer
// rim. Ri and tabDepth are top-bottom symmetric, so the two koma are identical (only one kind).
export function komaR(p: Design): number {
  // Measured from the smaller control-point radius (openMin), independent of the neck; with no neck
  // this kR IS the opening. Its basis is the legacy inner end `nominalRi`, so deepening the tab tip
  // toward the center (lowering innerRi) does not move komaR = the stand dimensions.
  const kR = Math.min(nominalRi(p) + tabDepth(p) + 3, openMin(p));
  // [Cardboard] The rim takes `grip` of tab but NEVER passes the opening. Three things cannot hold at
  // once — a wide tab, no step at the neck, and the mouth the maker drew — because the mouth's radius
  // minus the hub (`innerRi`) is all the board there is for a tab to be: 26 − 6 = 20mm on the default
  // egg in 2mm board, and 12.8mm of it in 5mm board, the hub fattening as the material does. Put to
  // the maker as those three, they kept the mouth and gave up the width. So the tab is
  // `min(grip, band)` and its outer edge runs straight on into the neck. Letting the rim past the
  // opening does work — the koma leaves by the END of the mold and never passes a mouth — and it was
  // shipped for exactly one round; it is the LOOK of the step that is refused, not the mechanics.
  // None of this touches the wall between two notches: that is bought with the notch bottom
  // (`innerRi`), never with the rim.
  return p.joint ? Math.min(openMin(p), Math.max(kR, innerRi(p) + p.joint.grip)) : kR;
}
// The radial depth of the tab (the rib's insertion part) = the koma's notch depth, measured from the
// control point (openMin).
export function tabDepth(p: Design): number {
  return Math.min(p.tabW, Math.max(6, openMin(p) * 0.4));
}
// Upper limit on rib width: keep it at or below the opening so it can be pulled out from the
// larger opening (end radius) after drying.
// The least band the rib keeps between its outer and inner edges (mm). It lives here rather than in
// rib.ts because the groove has to know how deep it may cut, and groove.ts sits below rib.ts.
export const RIB_MIN_BAND = 12;
export function effBoardWidth(p: Design): number {
  return Math.min(p.boardWidth, Math.max(outerR(p, 0), outerR(p, 1)) - 1);
}

// ============ 2D cross-section (final shape) ============
// Inner edge: a straight core (radius Ri), tabs on its inside at the same top/bottom positions.
// Outer edge: the body curve plus the neck. The centre is lightened, keeping the outer band (the
// grooves) and the inner core (the tab support).
//
// `nominalRi` is the legacy tab inner end and the basis for `komaR`, control-point-based (so
// independent of the neck) with a self-intersection guard. The real tab tip and notch bottom go
// further in via `innerRi`, but `komaR` stays on this nominal basis — which is what keeps deepening
// the tab from moving the stand.
function nominalRi(p: Design): number {
  const td = tabDepth(p);
  // Keep the core (Ri) within the lamp body's minimum outer radius (self-intersection prevention).
  const lim = Math.min(openMin(p) - td - 2, bodyMinR(p) - 3);
  return Math.max(6, Math.min(p.tabR ?? 15, lim));
}
// Amount (mm) the tab inner end is deepened toward the center: a longer tab tip / notch bottom grips
// harder (still a straight tongue).
const TAB_DEEPEN = 5;
// Minimum wall (mm) left between adjacent tab notches on the koma — with many teeth or a small koma
// it goes thin and non-manifold. Basis for both the deepening floor (ribCoreFloor) and the maximum
// board count (maxBoards).
const MIN_WALL = 1.6;
/**
 * How wide the koma's notch is (mm) — tab thickness plus the print tolerance, EXCEPT where the joint
 * asks for a width of its own. The cardboard route does, and asks for less than the tab is thick
 * (`joint.notch`, see types.ts): board crushes, a knife widens what it cuts, and the slot has to be
 * drawn narrower than the thing it accepts for the two to grip.
 *
 * Exported because `komaShape` draws this width and `maxBoards`/`ribCoreFloor` budget for it, and a
 * second copy of the formula is how the drawn notch and the counted one drift apart.
 */
export function notchWidth(p: Design): number {
  return p.joint?.notch ?? p.boardT + Math.max(0, p.fit ?? 0);
}
// Center-side limit when deepening. Evaluated at notch bottom radius notchR=Ri-0.5:
//   notchR*(2π/boards) - notchW ≥ MIN_WALL  →  notchR ≥ (MIN_WALL+notchW)*boards/2π.
// The wall this design asks the koma to keep between two notches (mm). `MIN_WALL` is the floor for
// everything; the cardboard route asks for more through `p.joint` (see types.ts).
function jointWall(p: Design): number { return Math.max(MIN_WALL, p.joint?.wall ?? 0); }
function ribCoreFloor(p: Design): number {
  const rNotchMin = (jointWall(p) + notchWidth(p)) * p.boards / (2 * Math.PI);
  return Math.max(6, rNotchMin + 0.5);
}
// How far in the tab's inner end may go before the SHAPE has nothing left to hang it on: 2mm inside
// the NARROWEST radius the body ever reaches. `bodyMinR` starts at the smaller control point — the
// opening — and only scans downward, so this one number says both things at once:
//   - at the opening it is the plate the tab hangs on: the rib's band there runs `Ri..outerR`, and a
//     tab tip past the mouth leaves nothing to hang it on;
//   - at a WAIST it is the rib not crossing itself. The cardboard rib's inner edge is one radius from
//     tab to tab (`noCrescent`), so it runs past the waist as well, and a hub outside a waist
//     narrower than the mouths puts that edge outside the outer curve — the cut line crosses itself
//     on the sheet. `nominalRi` has carried this guard all along (`bodyMinR - 3`) and the joint branch
//     of `innerRi` does not go through it: 325 of 1728 swept waisted designs crossed, the worst 32.9mm
//     out (a ⌀20 waist, 16 ribs, 10mm board), with `ribPullFit` still reporting ok.
// It stays 2mm rather than borrowing `nominalRi`'s 3 so that a body whose narrowest point IS its
// mouth — every shipped preset — keeps the cap it was measured with; the waist is the new case (0 of
// 24 preset×thickness combinations moved, and `check:hash` is identical).
//
// **2mm is only worth 2mm because `bodyMinR` is a minimum and not a sample.** It was 41 samples when
// this cap was written, and that alone did not hold: a `sharp` waist between two of them was read up
// to 7.47mm high, so 304 of 15,744 legal waisted designs still put the hub outside the body and 300
// still drew a rib that crossed itself — the guard changed which designs failed rather than whether
// they did. `bodyMinR` now takes the control points and refines the scan, and over that same sweep
// the band never comes in under 2.00mm.
// This is what caps the joint — growth has to go OUTWARD, into a bigger rim, not toward the axis.
// The 6mm floor is under any radius the editor allows (`LIMITS.r[0]` is 8), so it cannot itself cross.
function jointCap(p: Design): number { return Math.max(6, bodyMinR(p) - 2); }
// The rib-count ceiling: the most boards whose koma notch walls still clear `MIN_WALL` at this
// opening / board thickness / tolerance (wall = 2π·r/boards − notchW). Without it a small opening
// plus a thick board plus many boards overlaps the notches near the centre and the koma comes out
// non-watertight (wall negative). Evaluated at the legacy `nominalRi - 0.5` rather than the real
// notch bottom (`notchR()` = `innerRi + TAB_DENT_W - 0.5` when the tab is dented) because the bound
// must not depend on `boards`; `nominalRi` does not, so this is a monotone upper bound.
export function maxBoards(p: Design): number {
  // With a `joint` the wall is kept by growing the koma rather than by capping the count, so what
  // bounds the count is `jointCap` — the point past which the plate at the opening runs out.
  const notchR = (p.joint ? jointCap(p) : nominalRi(p)) - 0.5;
  return Math.max(4, Math.floor((2 * Math.PI * notchR) / (jointWall(p) + notchWidth(p))));
}
// [Cardboard] The rib count is NOT reduced for a thin band at the mouth. Thick board fattens the
// koma hub, the hub IS the rib's inner edge, and so the board left where a rib passes the narrower
// mouth (`ribMouthBand`) is what the count spends: at 5mm and 8 ribs it is 5.8mm, under one flute
// pitch. That was briefly a second bound here, and it silently cut a design from 8 ribs to 6 — the
// count is the maker's, and this is a thing to REPORT, not to decide for them (`derived.ts` raises
// it, the way the pull-out is raised). Only the notches meeting at the hub's centre, above, is a
// clamp: that one is not buildable at any count.
export function ribMouthBand(p: Design): number { return openMin(p) - innerRi(p); }
// The actual tab tip / notch bottom: deeper toward the center than nominalRi by TAB_DEEPEN, floored
// at ribCoreFloor and capped at nominalRi (never shallower; with many teeth, floor > nominalRi, so
// it is simply not deepened). ribOutline2D (tab) and komaShape (notch bottom) call this same value,
// so the meshing always matches — this is the aggregation point of that invariant.
export function innerRi(p: Design): number {
  // With a `joint` the tab tip is the wall's own answer — the least radius whose notches still leave
  // `wall` between them — held back only by the plate needing to exist at the opening. `nominalRi`
  // does not cap it: that number is the opening's, and the whole point here is to stop the opening
  // deciding the joint.
  if (p.joint) return Math.min(ribCoreFloor(p), jointCap(p));
  const nom = nominalRi(p);
  return Math.min(nom, Math.max(ribCoreFloor(p), nom - TAB_DEEPEN));
}
// Both tab tips are dented at the inner corner (an L-notch, TAB_DENT_W wide × tabDentH deep): the
// tip's inner edge narrows to innerRi + TAB_DENT_W while the tab base stays at innerRi, and the koma
// notch bottom is set to the dented tip radius, so the wider base catches the koma's solid hub = the
// inward stop. Exported because rib.ts cuts the dent while notchR() below sizes the notch to match:
// one pair of numbers, two parts, no chance of them disagreeing.
export const TAB_DENT_W = 6;      // tab-tip inner-corner dent: width (mm, radial)
// The dent's depth along the tab IS the koma's thickness: the koma slides on from the tip until its
// inner face meets the step, so this is where it seats — flush with the tip, which is where the 3D
// preview draws it and where `standSlotSep` puts its centre. It was a constant 6 against a koma of
// 8, and a printed koma stopped 2mm proud of the tip: the preview showed it sunk into the base, and
// the stand's posts were 4mm too close (2026-09-08).
export function tabDentH(p: Design): number { return p.komaT; }
// Whether the dent is used. p.noTabDent forces a plain tab + full-depth notch (set by the papercraft:
// cardboard favors tab strength over the koma stop); short tabs / crowded centers also fall back.
export function tabDented(p: Design): boolean { return !p.noTabDent && p.tabLen > tabDentH(p) + 1 && komaR(p) - innerRi(p) > TAB_DENT_W + 2; }
// The tab tip's inner radius (where the koma notch bottom mates). Dented tabs pull the tip in by TAB_DENT_W.
function tabTipRi(p: Design): number { return innerRi(p) + (tabDented(p) ? TAB_DENT_W : 0); }
// The koma notch bottom radius (inside it is the koma's solid part) = tabTipRi relieved by 0.5.
// komaShape cuts the notch from this and ribOutline2D the dent from tabTipRi, so the catch above
// cannot drift between the two parts.
export function notchR(p: Design): number { return Math.max(1, tabTipRi(p) - 0.5); }
