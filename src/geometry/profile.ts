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
function profileR(P: Pt[], x: number): number { return anyHandle(P) ? fukuroBezierR(P, x) : fukuroSpline(P, x); }

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
// bands carrying no bamboo (the neck) are handled separately via cutT/cutY, radius continuous. The
// lamp body (curve + grooves) is the t-range BETWEEN the outermost control points; the neck lies
// outside them at exactly their radius, so no flare or S-curve appears at the join.
export function fukuroRange(p: Design): { lo: number; hi: number } {
  const pts = (p.pts && p.pts.length >= 2) ? p.pts : null;
  if (!pts) return { lo: cutTbot(p), hi: 1 - cutTtop(p) };
  const nB = p.neckBot ?? p.neckOn ?? true, nT = p.neckTop ?? p.neckOn ?? true;
  return { lo: nB ? pts[0].t : 0, hi: nT ? pts[pts.length - 1].t : 1 };
}
// The design basis for neck/tab is the control-point radius, so toggling a neck does not change the
// tab size.
function openMin(p: Design): number {
  const pts = p.pts;
  return (pts && pts.length) ? Math.min(pts[0].r, pts[pts.length - 1].r) : Math.min(p.rTop ?? 60, p.rBot ?? 60);
}
function bodyMinR(p: Design): number {
  const pts = p.pts;
  if (!pts || pts.length < 2) return openMin(p);
  let m = Math.min(pts[0].r, pts[pts.length - 1].r);
  for (let i = 0; i <= 40; i++) { const t = pts[0].t + (pts[pts.length - 1].t - pts[0].t) * i / 40; m = Math.min(m, profileR(pts, t)); }
  return m;
}
export function outerR(p: Design, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const pts = (p.pts && p.pts.length) ? p.pts : [{ t: 0.5, r: (p.rTop + p.rBot) / 2 }];
  if (pts.length === 1) return Math.max(8, pts[0].r);
  const fp = pts[0], lp = pts[pts.length - 1];
  const nB = p.neckBot ?? p.neckOn ?? true, nT = p.neckTop ?? p.neckOn ?? true;
  const kR = komaR(p); // tab (koma) size = opening when there is no neck
  // With a neck: widen the opening outward to the control point, then a vertical rectangle from
  // there to y=0/1. Without: the opening becomes the tab size (body end set to kR, no slanted taper).
  const loT = nB ? fp.t : 0, loR = nB ? fp.r : kR;
  const hiT = nT ? lp.t : 1, hiR = nT ? lp.r : kR;
  if (t <= loT) return Math.max(8, loR);
  if (t >= hiT) return Math.max(8, hiR);
  // The endpoint radius changes with the neck (loR/hiR), but ho/hi are relative vectors, so they
  // carry over.
  const first = { t: loT, r: loR, ho: fp.ho, hi: fp.hi, sharp: fp.sharp };
  const last = { t: hiT, r: hiR, ho: lp.ho, hi: lp.hi, sharp: lp.sharp };
  const P = [first, ...pts.slice(1, -1), last];
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
function cutY(p: Design): number { return Math.max(cutYbot(p), cutYtop(p)); }
export function cutT(p: Design): number { return cutY(p) / Math.max(1, p.height); }
// Koma outer radius = the hub that bundles the tabs; the tab (inner end Ri〜Ri+td) meets its outer
// rim. Ri and tabDepth are top-bottom symmetric, so the two koma are identical (only one kind).
export function komaR(p: Design): number {
  // Measured from the smaller control-point radius (openMin), independent of the neck; with no neck
  // this kR IS the opening. Its basis is the legacy inner end `nominalRi`, so deepening the tab tip
  // toward the center (lowering innerRi) does not move komaR = the stand dimensions.
  return Math.min(nominalRi(p) + tabDepth(p) + 3, openMin(p));
}
// The radial depth of the tab (the rib's insertion part) = the koma's notch depth, measured from the
// control point (openMin).
export function tabDepth(p: Design): number {
  return Math.min(p.tabW, Math.max(6, openMin(p) * 0.4));
}
// Upper limit on rib width: keep it at or below the opening so it can be pulled out from the
// larger opening (end radius) after drying.
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
// Notch width (= tab thickness + print fit/tolerance).
function notchWidth(p: Design): number { return p.boardT + Math.max(0, p.fit ?? 0); }
// Center-side limit when deepening. Evaluated at notch bottom radius notchR=Ri-0.5:
//   notchR*(2π/boards) - notchW ≥ MIN_WALL  →  notchR ≥ (MIN_WALL+notchW)*boards/2π.
function ribCoreFloor(p: Design): number {
  const rNotchMin = (MIN_WALL + notchWidth(p)) * p.boards / (2 * Math.PI);
  return Math.max(6, rNotchMin + 0.5);
}
// The rib-count ceiling: the most boards whose koma notch walls still clear `MIN_WALL` at this
// opening / board thickness / tolerance (wall = 2π·r/boards − notchW). Without it a small opening
// plus a thick board plus many boards overlaps the notches near the centre and the koma comes out
// non-watertight (wall negative). Evaluated at the legacy `nominalRi - 0.5` rather than the real
// notch bottom (`notchR()` = `innerRi + TAB_DENT_W - 0.5` when the tab is dented) because the bound
// must not depend on `boards`; `nominalRi` does not, so this is a monotone upper bound.
export function maxBoards(p: Design): number {
  const notchR = nominalRi(p) - 0.5;
  return Math.max(4, Math.floor((2 * Math.PI * notchR) / (MIN_WALL + notchWidth(p))));
}
// The actual tab tip / notch bottom: deeper toward the center than nominalRi by TAB_DEEPEN, floored
// at ribCoreFloor and capped at nominalRi (never shallower; with many teeth, floor > nominalRi, so
// it is simply not deepened). ribOutline2D (tab) and komaShape (notch bottom) call this same value,
// so the meshing always matches — this is the aggregation point of that invariant.
export function innerRi(p: Design): number {
  const nom = nominalRi(p);
  return Math.min(nom, Math.max(ribCoreFloor(p), nom - TAB_DEEPEN));
}
// Both tab tips are dented at the inner corner (an L-notch, TAB_DENT_W wide × TAB_DENT_H deep): the
// tip's inner edge narrows to innerRi + TAB_DENT_W while the tab base stays at innerRi, and the koma
// notch bottom is set to the dented tip radius, so the wider base catches the koma's solid hub = the
// inward stop. Exported because rib.ts cuts the dent while notchR() below sizes the notch to match:
// one pair of numbers, two parts, no chance of them disagreeing.
export const TAB_DENT_W = 6;      // tab-tip inner-corner dent: width (mm, radial)
export const TAB_DENT_H = 6;      // tab-tip inner-corner dent: depth (mm, along the tab)
// Whether the dent is used. p.noTabDent forces a plain tab + full-depth notch (set by the papercraft:
// cardboard favors tab strength over the koma stop); short tabs / crowded centers also fall back.
export function tabDented(p: Design): boolean { return !p.noTabDent && p.tabLen > TAB_DENT_H + 1 && komaR(p) - innerRi(p) > TAB_DENT_W + 2; }
// The tab tip's inner radius (where the koma notch bottom mates). Dented tabs pull the tip in by TAB_DENT_W.
function tabTipRi(p: Design): number { return innerRi(p) + (tabDented(p) ? TAB_DENT_W : 0); }
// The koma notch bottom radius (inside it is the koma's solid part) = tabTipRi relieved by 0.5.
// komaShape cuts the notch from this and ribOutline2D the dent from tabTipRi, so the catch above
// cannot drift between the two parts.
export function notchR(p: Design): number { return Math.max(1, tabTipRi(p) - 0.5); }
