/**
 * ============================================================================
 * PROFILE AND THE SIZES DERIVED FROM IT
 * ============================================================================
 * The radius function `outerR(p, t)` — the heart of the design — and every dimension that is a
 * consequence of it: the koma's outer radius, the tab's depth and tip, the koma notch's bottom, the
 * rib-count ceiling.
 *
 * These live together because they are genuinely mutually recursive, not merely related:
 * `outerR` needs `komaR` (a neck-less end IS the tab size) and `komaR` needs `outerR` (via
 * `bodyMinR`'s self-intersection guard). Splitting them would buy two files and an import cycle.
 *
 * This is also where the **print-fit invariants** are aggregated (see CLAUDE.md "Part joints"):
 * `innerRi()` fixes the tab tip AND the koma notch bottom, `notchR()` is shared by the part that
 * cuts the dent and the part that cuts the notch. Those single definitions are the only reason a
 * reprinted rib still fits a koma printed last month. Change one and check both.
 *
 * Pure arithmetic — no three.js, no React, no DOM. Nothing here builds geometry.
 * ============================================================================
 */

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
// Top & bottom tab tips are dented at the inner corner (an L-notch, TAB_DENT_W wide × TAB_DENT_H
// deep). The dent narrows the tab tip's inner edge to innerRi + TAB_DENT_W while the tab base stays
// at innerRi. The koma notch bottom is set to the dented tip radius, so the wider tab base catches
// the koma's solid hub = the inward stop ("the tab hooks the koma's inner side").
// Exported because rib.js cuts the dent while notchR() below sizes the koma notch to match it:
// one pair of numbers, two parts, no chance of them disagreeing.
export const TAB_DENT_W = 6;      // tab-tip inner-corner dent: width (mm, radial)
export const TAB_DENT_H = 6;      // tab-tip inner-corner dent: depth (mm, along the tab)
// Whether the dent is used. p.noTabDent forces a plain tab + full-depth notch (the papercraft sets this:
// cardboard favors tab strength over the koma stop). Short tabs / crowded centers also fall back to plain.
export function tabDented(p) { return !p.noTabDent && p.tabLen > TAB_DENT_H + 1 && komaR(p) - innerRi(p) > TAB_DENT_W + 2; }
// The tab tip's inner radius (where the koma notch bottom mates). Dented tabs pull the tip in by TAB_DENT_W.
function tabTipRi(p) { return innerRi(p) + (tabDented(p) ? TAB_DENT_W : 0); }
// The radius of the koma's notch bottom (= inside this is the koma's solid part). Relieved by 0.5
// from the tab tip inner radius (tabTipRi). With a dent, the notch is shallower and its bottom sits
// at the dent radius; the tab base (at innerRi, further in) then catches the koma hub. This IS the
// koma stop: ribOutline2D cuts the dent and komaShape cuts the notch, both from tabTipRi, so the
// catch cannot drift between the two parts.
export function notchR(p) { return Math.max(1, tabTipRi(p) - 0.5); }
