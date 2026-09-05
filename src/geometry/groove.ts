/**
 * Where the grooves go along the lamp body (`grooveList`, from one lattice so the mold, the section
 * drawing and the washi template cannot disagree), how wide they are (`grooveR`), and the outer-edge
 * point list with them cut in (`grooveOuterPts`) — the single source of the rib's outer edge,
 * extruded by `ribOutline2D` and drawn by SectionEditor, so what you see on screen is the edge that
 * gets printed. Pure arithmetic, like profile.ts: no three.js.
 */
import type { Design, Pt2 } from "../types.ts";
import { outerR, fukuroRange } from "./profile.ts";

/**
 * One groove, in the section plane: a ramp in, a round seat, and a claw hooked over it.
 *
 *        uphill rim ╲                  the ramp — straight, and the notch's whole angle
 *                    ╲___
 *                        (  ) seat     the seat — the bamboo's own circle
 *                          ╲︶
 *                            ◤ claw    the claw — the lip, standing outside the seated rod
 *
 * **The notch is cut toward the AXIS.** Winding tension pulls the bamboo inward, so that is the
 * direction the groove has to resist. Cut square to the SURFACE instead and on a sloped face the
 * mouth turns partly downhill, the pull becomes a slide down the face, and — the lamp-body curve
 * downhill having already fallen `|slope|·m` in radius — past about 50° the rod leaves without
 * gaining any radius at all (measured: 平丸 held 0.00mm at 55° and above).
 *
 * **The seat is a circle about a centre, not a depth per y.** Both are the same thing on a vertical
 * face and nothing like each other on a shoulder: offsetting a circle from a falling curve shears
 * it, and at dR/dy = 2.4 the "seat" comes out a 6mm gash 2mm tall.
 *
 * **The seat is round because the bamboo is.** A rod cannot descend a V: it wedges where the V is
 * `higoD` across, so a V's depth is decoration and its tip is never reached. Measured on 平丸's 67°
 * groove, a V aimed at the axis holds 0.00mm at 3mm deep and 0.30 at 6mm.
 *
 * **What holds the rod is that the seat's back faces the pull.** A ring of tension presses its rod
 * toward the axis and nowhere else, so a seat cut toward the axis takes it square and has nothing
 * left over to slide it down the face: measured, leaving costs 1.4–2.4mm of radius against the pull
 * at every groove, and no friction at all is asked for. Cut along the NORMAL instead and the
 * reaction tilts by the face angle, the pull keeps `w·sinθ` of itself pointing downhill, and the
 * notch needs μ ≥ tanθ — 2.5 at 68°, which nothing dry supplies.
 *
 * **The claw is margin, not the mechanism, and it is NOT a snap fit.** Rebuild every groove without
 * it and the hold falls by about 0.15mm; the narrowest place on the way in and on the way out is
 * the rod's own diameter, so it is never pinched — the lip only shortens the outward path beside
 * itself. It is there for the handling the tension is not there for.
 *
 * **The ramp is free.** Nothing bears on it: it exists so the rod can be rolled in from uphill, and
 * so the notch reads as a V rather than a slot. Its length is the notch's angle, and nothing else.
 */
type Tooth = { pts: Pt2[]; span: [number, number] };
function tooth(p: Design, g: number, k: number, baseR: (y: number) => number): Tooth | null {
  const sl = profileSlope(p, g);                      // dR/dy
  // Downhill is where the radius shrinks — the way the bamboo tightens. Read from the LOCAL slope,
  // never from which half of the body the groove is in: a single argmax ("the equator") answers the
  // same on a one-bulge silhouette and wrongly on a waisted one, where dR/dy changes sign more than
  // once and every groove past the second crossing had its claw on the wrong side.
  const s = sl > 0 ? -1 : 1;
  const { q, rho, m } = seat(p, sl, k);
  // The ramp opens further the steeper the face, so the notch keeps reading as a V rather than
  // closing to a slot — bounded by the pitch, or at `higoD` 4 it would reach the next groove.
  const wU = Math.max(rho * 1.2, Math.min(grooveR(p) * k * (RAMP_W + Math.abs(sl)), p.pitch * 0.45 - m));
  // Local frame about the seat centre: +X outward in radius, +Y downhill. The seat is the circle
  // X² + Y² = rho², the deepest point of the notch is at angle π, and both rims are points of the
  // lamp-body curve — so a tooth begins and ends exactly on it, with no step to sand off.
  const cx = baseR(g) - q;
  const at = (X: number, Y: number): Pt2 => [cx + X, g + s * Y];
  const rim = (Y: number): Pt2 => { const y = g + s * Y; return [baseR(y), y]; };
  // Where the straight flank from a rim touches the seat. Both rims are outside the circle, so the
  // flank runs in without a corner at the far end; the corner it does leave, on the curve, is the
  // point of the tooth.
  const graze = (X: number, Y: number, side: 1 | -1) =>
    Math.atan2(Y, X) + side * Math.acos(Math.max(-1, Math.min(1, rho / Math.hypot(X, Y))));
  const uX = baseR(g - s * wU) - cx, tX = baseR(g + s * m) - cx;
  if (Math.hypot(uX, wU) <= rho || Math.hypot(tX, m) <= rho) return null;   // no flank to draw
  const thU = graze(uX, -wU, -1), thD = graze(tX, m, 1);
  // …and round the deep side between them: from the uphill graze BACKWARDS through π, never the
  // short way across the mouth.
  const sweep = 2 * Math.PI + thU - thD;
  const arc: Pt2[] = [];
  for (let i = 0; i <= ARC_N; i++) { const th = thU - sweep * (i / ARC_N); arc.push(at(rho * Math.cos(th), rho * Math.sin(th))); }
  // The flanks carry intermediate points they do not need to be straight, so that the check below
  // sees them: a chord between two points of a CONCAVE stretch of the curve lies outside the plate,
  // and its ends — both of them on the curve — say nothing about its middle.
  const flank = (a: Pt2, b: Pt2) => { const out: Pt2[] = []; for (let i = 1; i < FLANK_N; i++) out.push([a[0] + (b[0] - a[0]) * (i / FLANK_N), a[1] + (b[1] - a[1]) * (i / FLANK_N)]); return out; };
  // The flank stops where it thins to `CLAW_TIP`, and the nose below carries it round from there.
  // Run out to a point instead and the claw ends as a knife edge — on a 6mm pitch at `higoD` 3 the
  // lip measured 0.14mm thick a fifth of a millimetre from its point, which is under one extrusion
  // width, prints as nothing, snaps if it prints at all, and hands earcut a sliver it triangulates
  // into six open edges. Nothing is lost: the rod bears on the flank, not on the last 0.4mm.
  //
  // Walking BACK from the tip rather than solving for the stop, because where the curve steepens
  // downhill it can dive under the whole flank — and then the tooth is not wrong, it simply has no
  // lip left to give at that height. Cut back into the seat, the notch opens downhill and stops
  // holding, which is the truth about that face and not a reason to throw the groove away.
  const rU = rim(-wU), aEnd = arc[arc.length - 1];
  const tail: Pt2[] = [...arc, ...flank(aEnd, rim(m))];
  let cut = tail.length - 1;
  while (cut > 0 && baseR(tail[cut][1]) - tail[cut][0] < CLAW_TIP) cut--;
  if (cut < ARC_N / 2) return null;                       // nothing but the ramp would be left
  // …and the last stretch is a rounded nose, not a square end. Two corners would meet here — the
  // flank turning onto the tip face and the tip face turning back onto the curve — and both are on
  // the one part of the plate a bamboo rod levers against. A cubic with its controls AT those two
  // corners rounds them both at once: it leaves tangent to the flank and lands tangent to the
  // lamp-body curve, so the claw rejoins the silhouette instead of ending on it.
  const body: Pt2[] = [rU, ...flank(rU, arc[0]), ...tail.slice(0, cut + 1)];
  const c1 = body[body.length - 1];                                  // where the flank stops…
  // Back up `CLAW_TIP` ALONG the outline for the nose to start from, dropping whatever it passes.
  // Stepping back off the last point alone lands behind the one before it wherever the flank is
  // short — a near-vertical face subdivides 1.4mm into five — and the outline then takes a step
  // backwards, which is a fold, which quietly costs every groove on the rib its depth.
  let j = body.length - 1, rem = CLAW_TIP, a0: Pt2 | null = null;
  while (j > 1 && !a0) {
    const q0 = body[j - 1], seg = Math.hypot(body[j][0] - q0[0], body[j][1] - q0[1]);
    if (seg >= rem) a0 = [body[j][0] + ((q0[0] - body[j][0]) / seg) * rem, body[j][1] + ((q0[1] - body[j][1]) / seg) * rem];
    else { rem -= seg; j--; }
  }
  if (!a0) return null;
  body.length = j;
  const c2: Pt2 = [baseR(c1[1]), c1[1]];                             // …straight out to the curve…
  const yB = c1[1] + s * CLAW_TIP / Math.hypot(1, sl);               // …and away along it
  const b0: Pt2 = [baseR(yB), yB];
  const nose: Pt2[] = [];
  for (let i = 1; i <= NOSE_N; i++) {
    const t = i / NOSE_N, u = 1 - t, w = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
    nose.push([w[0] * a0[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * b0[0], w[0] * a0[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * b0[1]]);
  }
  body.push(a0);
  const tip = b0;
  const pts: Pt2[] = [...body, ...nose];
  // Every point of a tooth but its two rims has to be strictly INSIDE the lamp-body curve. `sl` is
  // one number sampled over ±0.6mm, and it stands in for the surface across the whole 5mm the notch
  // spans; where the profile turns hard — control points at the editor's `T_GAP`, a 60mm body — the
  // real curve dives inside the seat, the outline crosses itself, and the slicer refuses an STL
  // every other gate has passed. Cheaper and surer to ask the curve than to predict it.
  for (let i = 1; i < body.length; i++) if (body[i][0] > baseR(body[i][1]) - 1e-3) return null;
  for (let i = 0; i + 1 < nose.length; i++) if (nose[i][0] > baseR(nose[i][1]) + 1e-9) return null;
  const a = g - s * wU, b = tip[1];
  // The span the plain samples must yield: rim to CLAW TIP, not to the seat's downhill extreme. The
  // curve resumes at the tip, and the seat's last stretch runs back UNDER the surface it resumes on
  // — that overlap in y is the undercut, and the outline is not single-valued in y through it.
  return { pts: s > 0 ? pts : pts.reverse(), span: [Math.min(a, b), Math.max(a, b)] };
}
const ARC_N = 16, FLANK_N = 5, NOSE_N = 6;
// How wide the claw's blunt tip is, measured in radius (mm) — one printed perimeter, not a tolerance.
const CLAW_TIP = 0.4;
// What a tooth shrinks to when it will not fit where it is. A groove that cannot be cut cleanly is
// left out — one bay of the winding without a notch, against an STL no slicer will take.
const TOOTH_SCALES = [1, 0.8, 0.62, 0.48, 0.36, 0.26, 0.18];
// Outer-edge point list with the grooves cut in. Returns [[x,y],…] from y=0 to y=h with the
// endpoints exact (the smooth opening radius); `grooves=[]` returns the plain smooth edge. Shared by
// `ribOutline2D` and the section drawing, so the section view draws the notch that gets printed.
export function grooveOuterPts(p: Design, grooves: number[]): Pt2[] {
  const h = p.height, STEP = 0.5;
  const baseR = (y: number) => outerR(p, Math.min(Math.max(y, 0), h) / h);
  const sample = (k0: number): Pt2[] => {
    const teeth: Tooth[] = [];
    for (const g of grooves) for (const k of TOOTH_SCALES) { const t = tooth(p, g, k0 * k, baseR); if (t) { teeth.push(t); break; } }
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
// The seat's clearance over the bamboo (mm) — the rod's slack inside its own pocket, and so the
// first thing it takes back out of the hold before it has to start climbing.
const SEAT_CLEAR = 0.15;
export function grooveR(p: Design): number { return p.higoD / 2 + SEAT_CLEAR; }
// How far downhill of the groove centre the claw's tip sits, along the lamp-body curve (mm), and
// so how much of the seated rod the lip stands over. Inside the rod's own radius it is a claw;
// level with the seat's own edge it is no claw at all, just the mouth of an open pocket.
//
// **A vertical face gets no claw, and that is not a saving — it is the right shape.** There is no
// downhill there for the rod to be dragged along: the tension bears straight into the notch and the
// seat alone holds it. A lip would be material in the way of putting the bamboo in, and one more
// thing to snap off, in exchange for nothing. It fades in over `CLAW_ON` — full by about 24°, half
// by 12° — so no groove on a body sits either side of a step.
const CLAW_BITE = 0.3;     // mm the lip closes in past the rod's radius, once it is fully in
const CLAW_ON = 0.45;      // dR/dy at which it is fully in (≈24° off vertical)
function clawTip(p: Design, sl: number): number {
  const open = grooveR(p), shut = Math.max(0.2, p.higoD / 2 - CLAW_BITE);
  return open + (shut - open) * Math.min(1, Math.abs(sl) / CLAW_ON);
}
// How much material is left between the seat and the surface, measured square to the surface (mm) —
// the claw's own thickness. It is a printed lip a rod is levering against, so it is a thickness and
// not a tolerance.
const CLAW_STAND = 0.25;
// How far uphill the ramp opens, in seat radii, before the slope term. It sets the notch's ANGLE and
// nothing else — no rod ever bears on it.
const RAMP_W = 1.6;
// The least the claw's tip may stand outside the seat centre, in radius (mm) — the climb a seated
// rod owes before it can leave, on a face too steep for the seat's own geometry to give it.
const GROOVE_LOCK = 1;
// The cap. The slope term runs away on the steepest faces `LIMITS` allows (a ⌀600 body 60mm tall
// reaches dR/dy ≈ 20), and the rib's band is only `RIB_MIN_BAND` (12mm) at its thinnest — a groove
// may not eat half of it. Capped, the claw degrades instead of the plate.
const GROOVE_MAX_D = 6;    // mm
/**
 * The seat, for one groove on a face of slope `sl`: centre depth `q` below the lamp-body curve at
 * the groove, radius `rho`, claw tip `m` downhill along the curve.
 *
 * `q` is where the slope is paid for, and the reason a groove on a shoulder is deeper than one at
 * the equator. **A falling surface's outward normal tilts downhill**, so the point of the seat
 * nearest to breaking out is the one under the claw — `rho·√(1+slope²)` in from the curve, not
 * `rho`. Sink it less than that and the seat opens out downhill, which is not a shallower claw but
 * no claw at all, and an outline that crosses itself where the two were supposed to meet.
 *
 * Past the cap the seat can no longer be sunk far enough, and `rho` and `m` give way instead — a
 * scratch of a groove rather than a fold. At dR/dy = 20 there is nothing there to hold anyway.
 */
function seat(p: Design, sl: number, k = 1) {
  const S = Math.hypot(1, sl), a = Math.abs(sl);
  const rho0 = grooveR(p) * k, m0 = clawTip(p, sl) * k, lock = GROOVE_LOCK * k;
  const q = Math.min(Math.max((rho0 + CLAW_STAND) * S, a * m0 + lock), GROOVE_MAX_D - rho0);
  const rho = Math.max(0.05, Math.min(rho0, q / S - CLAW_STAND));
  // The tip has to stay outside the seat, or the flank has nothing to run to and the "lip" is a
  // point inside its own pocket. On a face this steep the curve outruns it, so the tip comes back in.
  const m = Math.min(m0, Math.max(0.03, (q - lock) / Math.max(a, 1e-9)));
  return { q, rho, m };
}
// One groove's depth (mm), measured IN X — the groove is cut toward the axis, so this is the
// deepest the notch goes: the seat's far side, centre plus radius.
export function grooveDepth(p: Design, sl = 0): number { const s = seat(p, sl); return s.q + s.rho; }
/**
 * The deepest any groove could cut at height y (mm) — what `lightenHoles2D` has to stay behind.
 *
 * It is not `grooveDepth` at y. A tooth is not a slot at its own height: its ramp runs several
 * millimetres uphill, further the steeper the face, and it is a groove centred well away from y
 * that reaches y at its deepest. Asked here rather than sampled in rib.ts because how far a tooth
 * spans is this file's business — and the spiral can put a groove at any height at all, so the
 * answer cannot depend on which rib is being drawn.
 */
export function grooveReach(p: Design, y: number): number {
  const w = Math.min(p.pitch, grooveR(p) * (RAMP_W + 1 + Math.abs(profileSlope(p, y))));
  let d = 0;
  for (let t = -w; t <= w + 1e-9; t += 0.5) d = Math.max(d, grooveDepth(p, profileSlope(p, y + t)));
  return d;
}
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
