/**
 * Where the grooves go along the lamp body (`grooveList`, from one lattice so the mold, the section
 * drawing and the washi template cannot disagree), how wide they are (`grooveR`), and the outer-edge
 * point list with them cut in (`grooveOuterPts`) — the single source of the rib's outer edge,
 * extruded by `ribOutline2D` and drawn by SectionEditor, so what you see on screen is the edge that
 * gets printed. Pure arithmetic, like profile.ts: no three.js.
 */
import type { Design, Pt2 } from "../types.ts";
import { outerR, fukuroRange, effBoardWidth, innerRi, RIB_MIN_BAND } from "./profile.ts";

/**
 * One groove, in the section plane — the maker's sawtooth, CARVED into the lamp body the way a
 * wooden mold's is: nothing stands outside the curve.
 *
 *        ╱ ← the lamp-body curve, downhill (the way the radius shrinks)
 *       ╱
 *      ◤ tip        ON the curve. The underside runs in from it, over the bamboo.
 *     ○  ╲          the bamboo, in the cleft under the tip
 *      ╲__╲ floor   from the vertex back out to the curve, uphill
 *          ╲ ← the curve, uphill
 *
 * **Why the original notch let go.** The winding tension is a line load toward the AXIS. On a
 * face near vertical it presses the rod into the mold and any pocket holds it. As the face lies
 * over, the same pull becomes a slide along the surface toward smaller radius, and the notch's
 * downhill wall has to stand between the rod and that. The original V was cut square to the
 * surface, 2.6mm deep: on a 68° face the surface downhill has already fallen 2.5mm in radius per
 * millimetre, so the wall's crest sat BELOW the rod's centre in radius and the rod rolled over it
 * with the tension doing the work. Not an angle problem — a height one: the crest has to be
 * outside the rod's centre in radius, which on a sloped face means the rod sits deeper.
 *
 * **What sizes it.** The tip is on the curve; the rod is found from the tip. Its contact point is
 * `t` in along the underside, and `t` is the least that lets the rod THROUGH: the rod arrives
 * rolling along the floor, and the gap between the tip and the floor is `r(1+cosγ) + t·sinγ` for
 * a cleft of angle γ, so `t ≥ r·tan(γ/2)` (plus `ENTRY_CLEAR`). The hold is `r` plus however
 * far the tip stands outside the rod's centre in radius; the cut goes `r/tan(γ/2)` past the
 * contact to the vertex. The underside's tilt (`UNDER_A`) trades those: square to the axis it holds
 * hardest and cuts deepest (a 15° cleft on a 68° face is 7mm of crevice), along the surface normal
 * it cuts least and barely holds. The floor's angle (`FLOOR_K`) is bounded above by the face's own:
 * it has to climb back out to the curve, and on a steep face the curve is running away from it.
 *
 * **Burial is the price, and only on steep faces.** With the tip on the curve and the rod under it,
 * the rod's top is `|slope|·r − r + overhang` inside the curve measured at its own height: about
 * nothing to 27°, 0.4mm at 45°, 2.2mm at 68° for a ⌀2 rod (0.8mm along the normal). The washi is
 * pasted onto the bamboo between the ribs, where it sags inside the rib radius by more than that
 * (4mm at R = 50 on eight ribs); at the rib itself it bridges the notch, as it does on a wooden
 * mold. Whether that is enough is for the print to say.
 *
 * **Near vertical there is no tooth: a plain symmetric V.** The pull there has no downhill in it,
 * a V holds the rod with its centre on the surface, a tip would only be in the way of laying the
 * bamboo in, and a V favouring neither side is the easiest thing to paste washi over. The tooth
 * comes in over `HOOK_ON` — the range the original notch held to — by sliding the V's three numbers
 * (see `cleft`).
 */
type Tooth = { pts: Pt2[]; span: [number, number]; rod: Pt2 };
function tooth(p: Design, g: number, k: number, baseR: (y: number) => number, step: number): Tooth | null {
  const r = p.higoD / 2, rk = r * k, sl = profileSlope(p, g);
  // Downhill is where the radius shrinks — the way the bamboo tightens. Read from the LOCAL slope,
  // never from which half of the body the groove is in: a single argmax ("the equator") answers the
  // same on a one-bulge silhouette and wrongly on a waisted one, where dR/dy changes sign more than
  // once and every groove past the second crossing had its tooth on the wrong side.
  const d = sl > 0 ? -1 : 1;
  // Steeper than the surface the floor would never reach it; the retry flattens it where the curve
  // turns away faster than the slope at the groove said.
  for (const flat of FLOOR_RETRY) {
    const { psi, alpha, t, tV, yT, depth } = cleft(p, sl, k, flat);
    // The tip: on the curve, at the groove for a tooth and half a V's mouth downhill of it for the
    // plain V, whose rod sits centred on the groove.
    const T: Pt2 = [baseR(g + d * yT), g + d * yT];
    if (depth > notchCap(p, T[0])) return null;                // the plate's band comes first
    // `eIn` runs along the underside inward, `n` is its normal on the rod's (uphill) side.
    const eIn: Pt2 = [-Math.cos(psi), -d * Math.sin(psi)], n: Pt2 = [Math.sin(psi), -d * Math.cos(psi)];
    const C: Pt2 = [T[0] + t * eIn[0] + rk * n[0], T[1] + t * eIn[1] + rk * n[1]];
    const V: Pt2 = [T[0] + tV * eIn[0], T[1] + tV * eIn[1]];
    const f: Pt2 = [Math.cos(alpha), -d * Math.sin(alpha)];
    // Where the floor meets the curve, within the pitch: the next groove's rod is `step` away.
    const uMax = (step - 2 * r - ENTRY_CLEAR + d * (V[1] - g)) / Math.max(Math.sin(alpha), 1e-6);   // y room to the next rod
    const out = (s: number) => V[0] + s * f[0] - baseR(V[1] + s * f[1]);   // ≥ 0 once outside the curve
    let u = -1;
    for (let s = 0.5; s <= uMax; s += 0.5) if (out(s) >= 0) { u = s; break; }
    if (u < 0) continue;
    for (let lo = u - 0.5, i = 0; i < 4; i++) { const m = (lo + u) / 2; if (out(m) >= 0) u = m; else lo = m; }
    const rimY = V[1] + u * f[1], rim: Pt2 = [baseR(rimY), rimY];
    // Both corners on the curve are rounded: a fillet of `TIP_R` tangent to the curve and to the
    // wall, cut into the corner. Left sharp the tip was a spike a finger catches on and a corner the
    // washi has to go over. The tip's may not reach the rod's contact, or the rod would sit on it.
    const S = Math.hypot(1, sl), theta = angle([sl * d / S, d / S], eIn);
    const tip = fillet(T, [sl * d / S, d / S], eIn, Math.min(TIP_R * r, 0.8 * t * Math.tan(theta / 2)), baseR);
    const top = fillet(rim, [-sl * d / S, -d / S], [-f[0], -f[1]], TIP_R * r, baseR);
    // The floor, from the vertex to where the rim's fillet leaves it.
    const floor: Pt2[] = [];
    const uF = Math.hypot(top.wall[0] - V[0], top.wall[1] - V[1]), m = Math.max(2, Math.round(uF / 0.5));
    for (let i = 1; i < m; i++) {
      const y = V[1] + (top.wall[1] - V[1]) * (i / m), x = V[0] + (top.wall[0] - V[0]) * (i / m);
      floor.push([Math.min(x, baseR(y)), y]);                 // never outside the plate
    }
    // Uphill to downhill: the rim, the floor, the vertex, the underside, the tip. Then in ascending y.
    const pts: Pt2[] = [top.curve, ...top.arc.reverse(), top.wall, ...floor.reverse(), V, tip.wall, ...tip.arc, tip.curve];
    const ordered = d > 0 ? pts : pts.reverse();
    return { pts: ordered, span: [ordered[0][1], ordered[ordered.length - 1][1]], rod: C };
  }
  return null;
}
/** The angle between two unit vectors. */
function angle(a: Pt2, b: Pt2): number { return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))); }
/**
 * A fillet of radius `rho` at the corner `P` between a leg along the curve (`legC`, a unit vector
 * away from the corner) and a wall (`legW`): the tangent point on the curve, the arc from the wall's
 * tangent point round to it, and the wall's tangent point. The curve is taken as its tangent at
 * the corner, and the arc is held inside it.
 */
function fillet(P: Pt2, legC: Pt2, legW: Pt2, rho: number, baseR: (y: number) => number): { curve: Pt2; arc: Pt2[]; wall: Pt2 } {
  const theta = angle(legC, legW), del = rho / Math.tan(theta / 2);
  const yC = P[1] + legC[1] * del, curve: Pt2 = [baseR(yC), yC];
  const wall: Pt2 = [P[0] + legW[0] * del, P[1] + legW[1] * del];
  const bx = legC[0] + legW[0], by = legC[1] + legW[1], bl = Math.hypot(bx, by), oc = rho / Math.sin(theta / 2);
  const O: Pt2 = [P[0] + (bx / bl) * oc, P[1] + (by / bl) * oc];
  let a0 = Math.atan2(wall[1] - O[1], wall[0] - O[0]), a1 = Math.atan2(curve[1] - O[1], curve[0] - O[0]);
  if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI; else if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
  const arc: Pt2[] = [];
  for (let i = 1; i < FILLET_N; i++) {
    const th = a0 + (a1 - a0) * (i / FILLET_N), y = O[1] + rho * Math.sin(th);
    arc.push([Math.min(O[0] + rho * Math.cos(th), baseR(y)), y]);
  }
  return { curve, arc, wall };
}
/**
 * The cleft's angles and lengths for a face of slope `sl`, rod scale `k`, floor flattened by `flat`:
 * `psi` the underside's tilt below square-to-the-axis, `alpha` the floor's angle above it, `t` the
 * tip to the rod's contact along the underside, `tV` the tip to the vertex, `yT` how far downhill of
 * the groove the tip sits, and `depth` how far in from the curve the vertex is, in x — which on a
 * straight face is the deepest the notch goes. In one place so `grooveReach` can answer for the
 * lightening window without building the tooth.
 *
 * Near vertical (`hookIn` = 0) it is a plain symmetric V: both walls at 45°, `r√2` deep, the rod's
 * centre on the surface and on the groove — no wall favoured, which is what the maker asked for
 * there and what makes the washi easiest to paste. That V is the same polyline as the sawtooth
 * with the underside and floor both at 45° and the tip half a mouth downhill, so the tooth comes in
 * by sliding those three numbers, and no groove on a body sits either side of a step.
 */
function cleft(p: Design, sl: number, k: number, flat: number) {
  const rk = (p.higoD / 2) * k, a = Math.abs(sl), phi = Math.atan(a), w = hookIn(sl);
  // The plain V: the original notch's depth and half-width, so its wall angle, and the rod as far
  // in as its own radius lets it — a little under the surface, as it was.
  const dV = vDepth(p) * k, hV = grooveR(p) * k, beta = Math.atan2(hV, dV), lV = Math.hypot(hV, dV);
  const tVee = lV - rk / Math.tan(beta);
  // The tooth: underside and floor at their own angles, the tip's overhang the least that lets the
  // rod through.
  const psi = beta + (UNDER_A * phi - beta) * w;
  const alpha = beta + (FLOOR_K * (Math.PI / 2 - phi) * flat - beta) * w;
  const gamma = psi + alpha;
  const tTooth = rk * Math.tan(gamma / 2) + ENTRY_CLEAR / Math.sin(gamma);
  const t = tVee + (tTooth - tVee) * w;
  const tV = t + rk / Math.tan(gamma / 2);
  const yT = hV * (1 - w);
  return { psi, alpha, t, tV, yT, depth: tV * (Math.cos(psi) + a * Math.sin(psi)) };
}
// The plain V's depth (mm), the original notch's: a rod and a half, or the mouth's half-width times
// 2.1, whichever is less — 2.6 at ⌀2, with the rod 0.7 proud. The maker had the shallower `r√2`
// V (1.0 proud) put back to this.
const V_DEEP = 2.1;
function vDepth(p: Design): number { return Math.min(p.higoD * 1.5, grooveR(p) * V_DEEP); }
// The tip's rounding, in rod radii, and how many segments draw it.
const TIP_R = 0.4, FILLET_N = 4;
// What the floor flattens to, in turn, when it cannot reach the curve at the angle the slope gave.
const FLOOR_RETRY = [1, 0.7, 0.49];
// The deepest the notch may cut, in x (mm), at a place where the outer edge is at `R`: the band the
// rib keeps there (`ribInnerX` holds it to `RIB_MIN_BAND` or the board width, whichever is more, and
// near an opening only the core is left) less what has to stay solid behind the vertex. Past it the
// tooth is scaled down rather than the plate — on the steepest faces `LIMITS` allows, a near-
// horizontal one, the notch's own geometry runs to tens of millimetres. The lightening window keeps
// `BAND_SOLID` (3) of its own behind `grooveReach`.
const NOTCH_KEEP = 4;
function notchCap(p: Design, R: number): number {
  return Math.min(Math.max(RIB_MIN_BAND, effBoardWidth(p)), R - innerRi(p)) - NOTCH_KEEP;
}
// dR/dy between which the tooth comes in: none below ≈ 11° off vertical, whole by ≈ 29°. The
// plain V holds 1.0 at vertical, and the original notch let go past about 20°.
const HOOK_ON: [number, number] = [0.2, 0.55];
function hookIn(sl: number): number {
  const u = Math.min(1, Math.max(0, (Math.abs(sl) - HOOK_ON[0]) / (HOOK_ON[1] - HOOK_ON[0])));
  return u * u * (3 - 2 * u);
}
// The underside's tilt below square-to-the-axis, as a fraction of the face angle: 0 is the sketch's
// horizontal underside, 1 is along the surface normal. Hold against depth of cut — see above.
const UNDER_A = 0.45;
// The floor's angle above square-to-the-axis, as a fraction of what the face allows. At 1 the floor
// is parallel to the surface and never reaches it.
const FLOOR_K = 0.5;
// Clearance (mm) between the tip and the floor beyond the rod's own diameter, so it goes through.
const ENTRY_CLEAR = 0.2;
// What a tooth shrinks to when it will not fit where it is. A groove that cannot be cut cleanly is
// left out — one bay of the winding without a notch, against an STL no slicer will take.
const TOOTH_SCALES = [1, 0.8, 0.62, 0.48, 0.36, 0.26, 0.18];
// Outer-edge point list with the grooves cut in. Returns [[x,y],…] from y=0 to y=h with the
// endpoints exact (the smooth opening radius); `grooves=[]` returns the plain smooth edge. Shared by
// `ribOutline2D` and the section drawing, so the section view draws the notch that gets printed.
export function grooveOuterPts(p: Design, grooves: number[]): Pt2[] {
  const h = p.height, STEP = 0.5, step = grooveLattice(p).step || p.pitch;
  const baseR = (y: number) => outerR(p, Math.min(Math.max(y, 0), h) / h);
  const sample = (k0: number): Pt2[] => {
    const teeth: Tooth[] = [];
    for (const g of grooves) for (const k of TOOTH_SCALES) { const t = tooth(p, g, k0 * k, baseR, step); if (t) { teeth.push(t); break; } }
    const order = teeth.map((_, i) => i).sort((a, b) => teeth[a].span[0] - teeth[b].span[0]);
    const spans = teeth.map((t) => t.span);
    const pts: Pt2[] = [];
    let ti = 0;
    for (let y = 0; ; y = Math.min(h, y + STEP)) {
      while (ti < order.length && spans[order[ti]][0] <= y) { pts.push(...teeth[order[ti]].pts); ti++; }
      // Inclusive, and the tooth goes first: a lattice sample landing ON a span's end would
      // otherwise be emitted after the tooth that already covered it and send the outline back down
      // its own flank — a zero-area sliver the extrusion opens edges on, at every groove.
      if (!spans.some(([a, b]) => y >= a - EPS && y <= b + EPS)) pts.push([baseR(y), y]);
      if (y >= h) break;
    }
    while (ti < order.length) { pts.push(...teeth[order[ti]].pts); ti++; }
    return pts;
  };
  // Full size first, and returned untouched unless it folds.
  let pts = sample(1);
  for (const s of DEPTH_BACKOFF) { if (!foldsOver(pts)) break; pts = sample(s); }
  return pts;
}
// Where the bamboo's centre lies at groove `g` (mm): on the flank of its seat near vertical, on the
// surface itself on a slope — and in either case `r` uphill of the tooth's underside. The preview
// draws the ring here rather than on the smooth curve, which on a shoulder is inside the tooth.
export function higoSeat(p: Design, g: number): Pt2 {
  const h = p.height, step = grooveLattice(p).step || p.pitch;
  const baseR = (y: number) => outerR(p, Math.min(Math.max(y, 0), h) / h);
  for (const k of TOOTH_SCALES) { const t = tooth(p, g, k, baseR, step); if (t) return t.rod; }
  return [baseR(g), g];
}
// How far the notch backs off, in steps, when the outline folds. Depth rather than width: a
// shallower V keeps the same footprint on the surface and still catches the bamboo, where a
// narrower one would stop being the undercut it exists to be.
const DEPTH_BACKOFF = [0.7, 0.45, 0.25, 0.1];
// Samples scanned ahead for a crossing. Every fold observed sits inside ONE groove's own tooth, so
// this is a short window rather than the whole O(n²) outline — which matters because check:manifold
// calls this tens of thousands of times. It has to be longer than a tooth, though: a tooth is about
// twenty points now, and a window that cannot span one cannot see a fold inside one.
const FOLD_SCAN = 48;
// Two outline points closer together than this are the same point as far as the extrusion is
// concerned, and a pair of them is a zero-area triangle = an open edge.
const EPS = 1e-6;
/**
 * Does the outer edge cross itself? The notch is offset along the surface NORMAL, so on a steep face
 * its tip travels in y as well as in x. Where the profile turns sharply — control points at the
 * editor's `T_GAP` with a large radius swing — that travel outruns the flank's own y half-width and
 * the outline folds back THROUGH itself; the extrusion then opens edges and the slicer refuses the
 * STL, with every gate reporting 0 FAIL.
 *
 * DETECTED rather than predicted. The closed-form threshold (depth × |slope| against the flank's
 * half-width) also fires on shapes that are perfectly sound, because a NON-MONOTONE outline is the
 * normal state here — the undercut is the whole point of the notch, and all three presets are
 * non-monotone. A proper crossing is not normal, and separates the two.
 */
function foldsOver(pts: Pt2[]): boolean {
  const n = pts.length;
  for (let i = 0; i + 1 < n; i++) {
    const end = Math.min(n - 1, i + FOLD_SCAN);
    for (let j = i + 2; j < end; j++) if (segCross(pts[i], pts[i + 1], pts[j], pts[j + 1])) return true;
  }
  return false;
}
/** Proper segment crossing — endpoints touching (which adjacent samples always do) is not one. */
function segCross(a: Pt2, b: Pt2, c: Pt2, d: Pt2): boolean {
  const side = (o: Pt2, u: Pt2, v: Pt2) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  const d1 = side(c, d, a), d2 = side(c, d, b), d3 = side(a, b, c), d4 = side(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
// The local slope dR/dy of the smooth outer edge at height y (mm). Sampled over the same ±0.6mm
// span everywhere, so "how steep is the face here" has one answer across the whole file.
export function profileSlope(p: Design, y: number): number {
  const h = p.height;
  return (outerR(p, Math.min(1, (y + 0.6) / h)) - outerR(p, Math.max(0, (y - 0.6) / h))) / 1.2;
}
// Groove half-width (mm) = bamboo rib radius + relief. Read by the drawing side and the preview,
// so the section view and the 3D bamboo agree with the mold on one number.
const GROOVE_CLEAR = 0.25;
export function grooveR(p: Design): number { return p.higoD / 2 + GROOVE_CLEAR; }
/**
 * The deepest any groove could cut at height y (mm) — what `lightenHoles2D` has to stay behind.
 * The notch is deepest at its vertex, a little uphill of its own groove, and the spiral can put a
 * groove at any height at all, so this asks every slope within a notch's reach of y rather than
 * the one at y. Answered here rather than sampled in rib.ts because how far a notch spans is this
 * file's business.
 */
export function grooveReach(p: Design, y: number): number {
  const h = p.height, cap = notchCap(p, outerR(p, Math.min(Math.max(y, 0), h) / h));
  let deep = 0;
  for (let t = -REACH_W; t <= REACH_W + 1e-9; t += 0.5)
    deep = Math.max(deep, Math.min(cap, cleft(p, profileSlope(p, y + t), 1, FLOOR_RETRY[FLOOR_RETRY.length - 1]).depth));
  return deep;
}
// How far from a groove its deepest point can be in y (mm): the vertex is `tV·sinψ` uphill, under
// two millimetres for any rod the app allows, and the floor beyond it only climbs out.
const REACH_W = 3;
// The groove-distribution lattice (valid range [gLo,gHi] within the lamp body, count n, spacing
// step), in one place so grooveList and higoSpiralPath use the same one — diverge, and the mold and
// the drawing disagree. gM = gR*1.6 is a half-pitch-equivalent buffer: no groove closer than that to
// the opening (neck).
function grooveLattice(p: Design) {
  const h = p.height, fr = fukuroRange(p), gM = grooveR(p) * 1.6;
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
export function grooveList(p: Design, k = 0): number[] {
  const { gLo, gHi, n, step } = grooveLattice(p);
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
export function higoSpiralPath(p: Design): [number, number, number][] {
  const seg = 48;   // samples per turn of the helix
  const h = p.height;
  const { gHi, n, step } = grooveLattice(p);
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
