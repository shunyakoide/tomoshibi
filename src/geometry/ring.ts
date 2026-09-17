/**
 * A thin flat hoop that holds one of the lantern's openings round. It goes on the ASSEMBLED MOLD,
 * sliding over the rib tips outside the opening, and it goes on BEFORE the bamboo and the washi (the
 * guide's `rings` step): the washi's end allowance is folded back over it, which is what holds it
 * there, and it stays with the lantern when the mold is pulled out — the one exported part that is
 * not part of the mold. Sized from `openingR()` (the outermost control point), so it
 * follows the design like every other part; thin both radially and in height, not a thick washer or
 * a tall band, and independent of the mold's own parts.
 *
 * The BOTTOM ring doubles as the base of a leg stand for the finished lantern: inside the hoop sit
 * `LEG_N` flat "onigiri" pads (rounded triangles), each with a bore at its middle that a leg rod
 * pushes into. Too small an opening falls back to a plain hoop with the marker tab instead.
 */
import type { Design, Pt2 } from "../types.ts";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { outerR } from "./profile.ts";
import { circlePts } from "../util.ts";

// The hoop goes AROUND the outside of the opening: its INNER diameter matches the opening's outer
// one (see RING_FIT below).
const RING_WALL = 2;   // hoop wall thickness (radial, mm). Thin = the bamboo rib can wind around the outer edge.
const RING_H = 2;      // hoop height (= Z extrusion, mm). A thin flat ring (wire-like).
// Fit clearance (radius, mm): the ring's inner diameter is widened by this much to relieve the print
// error that shrinks it. 0.3 (⌀0.6) was loose; the ring is held by the bamboo rib and washi anyway,
// so slightly tight is better.
const RING_FIT = 0.15;
// ---- Leg sockets on the bottom opening ring ----
// The pads sit evenly spaced inside the hoop, vertex toward the center, their outer edge overlapping
// the hoop's inner rim so the whole thing prints as one piece. Their dimensions are CONSTANTS, not
// settings: the only thing a design says is whether it wants them at all (`p.legSockets`) — pad
// width and bore size follow from that decision, and a rod is trimmed to the hole, not vice versa.
const LEG_N = 3;         // number of leg sockets (evenly spaced)
const LEG_D = 6;         // leg rod diameter (mm)
const TRI_R = 10;        // onigiri circumradius (corner distance from pad center, mm)
const TRI_ROUND = 0.4;   // corner rounding as a fraction of the edge (0 = sharp, ~0.5 = very round)
const LEG_OVERLAP = 0.6; // how far the pad's outer edge overlaps into the hoop rim (mm), for a joined look
const PAD_CORE = 1;      // material the inner vertex must leave around the ring's axis, mm
const PAD_GAP = 1.5;     // clear air required between two neighbouring pads, mm
// Bottom-ring marker, for when there are no leg sockets to tell the pair apart: the two rings are
// then the same flat hoop in sizes that can be close enough to mix up (the barrel preset is ⌀116 vs
// ⌀108), and one small square tab on the inner rim separates them at a glance. It reaches past the
// nominal opening by MARK_D - RING_FIT, intentionally — the tab sits in the pasted layers at the rim
// — and is kept narrow so it stays tuckable. Don't "fix" it by moving it outward.
const MARK_D = 1.5;   // how far the tab reaches in from the inner rim (mm)
const MARK_W = 3;     // tangential width of the tab (mm) — at ⌀148 that is a 2.3° bite of the rim
// The opening (= opening ring) radius. top=true for the top end, false for the bottom. Uses outerR's
// end value regardless of whether a neck exists.
export function openingR(p: Design, top: boolean): number { return outerR(p, top ? 1 : 0); }

// The bottom ring's leg sockets, or null when the design turned them off OR the opening has no room
// for them. Exported because the inspector has to say which — "off" is a checkbox you can tick back
// on, "no room" is not, and a socket that is silently absent is one you find out about with the
// print in your hand. Ring geometry and UI both read THIS function, so they cannot disagree.
export function ringLegs(p: Design): { n: number; bore: number; triR: number; Rc: number } | null {
  if (!p.legSockets) return null;                  // absent = off (DEFAULTS ships them off)
  const bore = LEG_D / 2 + RING_FIT;               // leg bore = leg rod radius + fit clearance
  const inner = openingR(p, false) + RING_FIT;
  // Pad center: vertex inward, so the outward-facing edge's midpoint sits at Rc + TRI_R/2. Placed
  // just inside the rim, so that midpoint overlaps the hoop band by LEG_OVERLAP.
  const Rc = inner + LEG_OVERLAP - TRI_R / 2;
  // Two ways the pads run out of room on a small opening, both checked against the SAME pad the
  // geometry below builds. (1) The inward vertex crosses the ring's axis — it does at LIMITS'
  // smallest opening (⌀20), and the pads then fold through each other into a shape no slicer can
  // read. (2) Neighbours touch: the pad's widest points are its two outer corners, so its angular
  // half-width seen from the axis is what has to fit inside half the spacing.
  if (Rc - TRI_R < PAD_CORE) return null;
  const cx = Rc + TRI_R / 2, cy = (TRI_R * Math.sqrt(3)) / 2;   // an outer corner, in the pad's own frame
  const half = Math.atan2(cy, cx) + Math.asin(Math.min(1, PAD_GAP / 2 / Math.hypot(cx, cy)));
  if (half >= Math.PI / LEG_N) return null;
  return { n: LEG_N, bore, triR: TRI_R, Rc };
}
// Whether the opening is big enough for sockets at all, regardless of the flag. The UI needs the two
// apart: "you turned them off" and "they will not fit here" are different sentences.
export function ringLegsFit(p: Design): boolean { return ringLegs({ ...p, legSockets: true }) !== null; }

// A full-circle point list, optionally centered at (cx, cy). absarc(0,2π) leaves a duplicate
// A flat annulus (ring) extruded along Z, centered at (cx, cy). Independently watertight.
// `mark` > 0 puts one square tab of that depth on the INNER rim (a marker, not a feature — MARK_D).
function annulusGeo(rOuter: number, rInner: number, N: number, cx = 0, cy = 0, depth = RING_H, mark = 0): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(circlePts(rOuter, N, cx, cy));
  let hole: THREE.Vector2[];
  if (mark > 0 && MARK_W / 2 < rInner) {
    // The tab is a rectangle spliced into the hole, so material grows inward. Its two base corners
    // sit at the exact angles where the rim crosses y = ±MARK_W/2, which keeps the splice from
    // leaving a hair-thin sliver of a triangle at the join; the rim is then sampled strictly BETWEEN
    // those angles, so no sample can coincide with a corner.
    const phi = Math.asin(MARK_W / 2 / rInner);
    const xBase = rInner * Math.cos(phi), xTip = rInner - mark;
    hole = [
      new THREE.Vector2(cx + xBase, cy + MARK_W / 2),   // base, +y side
      new THREE.Vector2(cx + xTip, cy + MARK_W / 2),    // tip, +y side
      new THREE.Vector2(cx + xTip, cy - MARK_W / 2),    // tip, -y side
      new THREE.Vector2(cx + xBase, cy - MARK_W / 2),   // base, -y side
    ];
    const span = 2 * Math.PI - 2 * phi;                 // the rim arc that survives, from -phi round to +phi
    const n = Math.max(8, Math.round(N * (span / (2 * Math.PI))));
    for (let i = 1; i < n; i++) {
      const a = -phi - (i / n) * span;                  // clockwise in angle = same winding as the corners above
      hole.push(new THREE.Vector2(cx + rInner * Math.cos(a), cy + rInner * Math.sin(a)));
    }
  } else {
    hole = circlePts(rInner, N, cx, cy).reverse();
  }
  shape.holes.push(new THREE.Path(hole));   // the hole is wound opposite to the outline
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
}
// An "onigiri" pad: an equilateral triangle centered at (cx, cy), circumradius R, rotated by `rot`,
// bore of radius `boreR` at the center, extruded along Z. `t` = corner rounding as a fraction of the
// edge, per-corner [t0,t1,t2]; 0 stays sharp (where the pad meets the ring).
// Independently watertight.
function onigiriGeo(cx: number, cy: number, R: number, tv: [number, number, number], rot: number, boreR: number, depth: number): THREE.ExtrudeGeometry {
  const V = [0, 1, 2].map((k) => {
    const a = rot + (k * 2 * Math.PI) / 3;
    return new THREE.Vector2(cx + R * Math.cos(a), cy + R * Math.sin(a));
  });
  const lerp = (p: THREE.Vector2, q: THREE.Vector2, s: number) => new THREE.Vector2(p.x + (q.x - p.x) * s, p.y + (q.y - p.y) * s);
  const shape = new THREE.Shape();
  for (let i = 0; i < 3; i++) {
    const cur = V[i], prev = V[(i + 2) % 3], next = V[(i + 1) % 3], ti = tv[i];
    if (ti <= 0) {                     // sharp corner: go straight to the vertex
      if (i === 0) shape.moveTo(cur.x, cur.y); else shape.lineTo(cur.x, cur.y);
      continue;
    }
    const pIn = lerp(cur, prev, ti);   // arriving at the corner along the prev edge
    const pOut = lerp(cur, next, ti);  // leaving the corner along the next edge
    if (i === 0) shape.moveTo(pIn.x, pIn.y); else shape.lineTo(pIn.x, pIn.y);
    shape.quadraticCurveTo(cur.x, cur.y, pOut.x, pOut.y); // round the corner (corner = control point)
  }
  shape.closePath();
  shape.holes.push(new THREE.Path(circlePts(boreR, 48, cx, cy).reverse())); // leg bore (reverse-wound)
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
}
export function ringGeometry(p: Design, top: boolean): THREE.BufferGeometry {
  const R = openingR(p, top);          // the opening's outer diameter = the rib's outer side (lamp body face)
  const inner = R + RING_FIT;          // inner diameter = opening outer diameter + clearance
  const outer = inner + RING_WALL;     // outward by the wall thickness; the bamboo rib winds around this edge
  const N = 96;
  if (top) return annulusGeo(outer, inner, N);   // the top ring is a plain hoop
  const legs = ringLegs(p);
  // No sockets → a plain hoop, and the marker tab is then the only thing separating this ring from
  // the top one, so it is cut exactly when the sockets are not.
  if (!legs) return annulusGeo(outer, inner, N, 0, 0, RING_H, MARK_D);
  // Bottom ring = base of the leg stand.
  const geos = [annulusGeo(outer, inner, N)];
  for (let i = 0; i < legs.n; i++) {
    const a = (i / legs.n) * Math.PI * 2;
    const rot = a + Math.PI;                 // V[0] vertex points inward (toward the center)
    // Round only the inner vertex; the two outer corners stay sharp where the pad meets the ring.
    // Flat pad, same height as the hoop (RING_H).
    geos.push(onigiriGeo(legs.Rc * Math.cos(a), legs.Rc * Math.sin(a), legs.triR, [TRI_ROUND, 0, 0], rot, legs.bore, RING_H));
  }
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// ---- The cardboard route's hoop, bent from wire ----
// That route has nothing to print a ring WITH, so the same hoop is bent from wire against a 1:1 line
// the template draws. It is sized from the same `openingR() + RING_FIT` as the printed one and is
// the same 2mm across, so the wire lands in the very band `annulusGeo` would have filled and a
// lantern built either way takes the same washi over the same rim.
const WIRE_D = 2;     // the wire the template is drawn for (mm) — RING_WALL's twin, deliberately
// A CONSTANT, for the reason `LEG_D` is one: the sheet is a line you lay wire ON, so the wire's own
// thickness moves nothing but where that line is drawn — a fraction of a millimetre on a hoop held
// by bamboo and paste. It is not a dimension worth a control, and a template that asked for one
// would be asking before it can draw anything.
// Eye centreline radius (mm), so the eye reads as a ⌀10 loop: ⌀8 of clear hole once the wire's own
// thickness is off, ⌀12 over the outside. Sized to be BENDABLE rather than to just admit a leg — a
// ⌀4 eye is the very tip of a pair of round-nose pliers and comes out lopsided by hand, where a
// centimetre of loop is something you can form, and leaves room to hook a leg or knot a cord for a
// pendant through it.
const EYE_R = 5;
const BEND_SEG = 2;   // longest chord between two sampled points on a bend line (mm)

/**
 * The wire hoop's CENTRELINE, one closed polyline in the ring's own plane (mm, centred on the
 * origin) — what the cardboard template draws at full scale for the wire to be bent against.
 *
 * The bottom hoop carries eyes when the design asked for leg sockets, at the same angles the printed
 * ring puts its pads: the wire runs up to the hoop, takes a full turn around the eye and carries on,
 * which is the shape a pair of round-nose pliers makes and the reason the eye is drawn tangent from
 * the inside rather than hung off the rim. **Whether there are eyes is `ringLegs()`'s answer, not a
 * second opinion** — an eye is far smaller than a pad, so every design it turns down for room has no
 * legs to hang on one anyway, and one answer is what keeps the template and the guide agreeing.
 */
export function wireRing2D(p: Design, top: boolean): Pt2[] {
  const R = openingR(p, top) + RING_FIT + WIRE_D / 2;
  const legs = top ? null : ringLegs(p);
  const pts: Pt2[] = [];
  // Sample an arc EXCLUDING its end point, so the pieces below chain without a doubled vertex.
  const arc = (r: number, cx: number, cy: number, a0: number, a1: number) => {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / BEND_SEG));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  if (!legs) { arc(R, 0, 0, 0, 2 * Math.PI); return pts; }
  const step = (2 * Math.PI) / legs.n;
  for (let i = 0; i < legs.n; i++) {
    const a = i * step;
    // The eye's centre sits EYE_R in along the same ray, so the eye circle meets the hoop exactly at
    // the hoop line: the wire passes that point twice, once entering the turn and once leaving it.
    arc(EYE_R, (R - EYE_R) * Math.cos(a), (R - EYE_R) * Math.sin(a), a, a + 2 * Math.PI);
    arc(R, 0, 0, a, a + step);
  }
  return pts;
}

/**
 * The same hoop as a solid, for the guide's figures on the cardboard route — the centreline swept by
 * a round section of the wire's own diameter. **A drawing, not a printed part**: nothing exports it
 * to STL, so it is not on `check:manifold`'s list and does not have to be watertight.
 */
export function wireRingGeometry(p: Design, top: boolean): THREE.BufferGeometry {
  const path = wireRing2D(p, top).map(([x, y]) => new THREE.Vector3(x, y, 0));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path, true, "centripetal"), path.length, WIRE_D / 2, 8, true);
}

/**
 * How far to TURN a hoop about its own axis, in radians, so what reaches inward off its inner rim
 * passes BETWEEN the ribs instead of into one.
 *
 * Everything on the rim that is not the rim reaches inside the mouth: a leg pad by
 * `TRI_R + TRI_R/2 - LEG_OVERLAP` (14.25mm on the default egg's ⌀148), the wire hoop's eyes by about
 * `2·EYE_R`, the marker tab by `MARK_D - RING_FIT`. The rib plate at the mouth is solid from the tab
 * out to the opening at every height in the neck, so a hoop offered up in any old orientation has
 * those features fouling a rib — and the answer is the maker's own: **you turn it.** The gaps between
 * eight 2mm plates are almost all air.
 *
 * A single feature (the tab) wants half a rib pitch. `LEG_N` pads at `2π/LEG_N` want the angle that
 * is furthest from every rib at once, which is a one-dimensional packing with a closed form: take the
 * pads' positions modulo one rib pitch, find the largest gap between neighbours on that circle, and
 * turn so its MIDDLE is where the rib sits. Each pad then clears the nearest rib by half that gap —
 * **half a pitch where the rib count is a multiple of `LEG_N`**, all three pads sharing one residue
 * (30° at 6 ribs, 20° at 9), and a sixth of it otherwise (7.5° at 8, 3.75° at 16).
 *
 * **It can run out, and the opening is what decides.** A pad's own half-width is
 * `atan(TRI_R·√3/2 / (Rc + TRI_R/2))` — an angle, so it grows as the mouth shrinks — and past the
 * clearance above the pad is back in a rib whatever the turn. Measured against the plates as drawn
 * (`boardT`, solid from the tab out to the mouth), the smallest mouth whose pads clear: **⌀146 at 8
 * ribs** (the default egg's ⌀148 makes it by 0.17mm), ⌀294 at 16, ⌀184 at 10, ⌀128 at 7 — against ⌀40
 * at 3, 6 and 9 ribs, i.e. as small as sockets are cut at all. The bent wire's eyes are narrower than
 * a printed pad and clear from ⌀116 at 8 ribs. Turning is still the best there is where it is not
 * enough; a hoop that will not go on is the PART's news, not this function's.
 *
 * `top` is answered with 0 — the top hoop is a plain band with nothing on its rim.
 */
export function hoopTurn(p: Design, top: boolean): number {
  if (top) return 0;
  const pitch = (2 * Math.PI) / Math.max(1, p.boards);
  const legs = ringLegs(p);
  if (!legs) return pitch / 2;                    // the marker tab: one feature, so mid-gap is the answer
  const at: number[] = [];
  for (let i = 0; i < legs.n; i++) at.push((((i * 2 * Math.PI) / legs.n) % pitch + pitch) % pitch);
  at.sort((a, b) => a - b);
  let widest = -1, middle = 0;
  for (let i = 0; i < at.length; i++) {
    const lo = at[i], hi = i + 1 < at.length ? at[i + 1] : at[0] + pitch;   // wraps by one pitch
    if (hi - lo > widest) { widest = hi - lo; middle = (lo + hi) / 2; }
  }
  return -middle;
}

/**
 * How far a hoop can LEAN on the mold it has been fitted over, in radians — a drawing's dimension,
 * and here rather than in the viewport because it is `RING_FIT` that answers it.
 *
 * A hoop resting on an opening is held by nothing at that point in the build (the guide's `rings`
 * step says so, and says to put a rubber band on it), and drawn flat on the opening plane it reads
 * as fused into the rib edges it is only lying against. So it is drawn leaning, and this is the
 * limit: the inner rim clears the neck by `RING_FIT` — the bent wire's inner surface sits at that
 * same radius — and a circle of radius `r + f` tilted by α presents a minor axis of `(r + f)·cos α`,
 * which binds on the neck at `acos(r / (r + f))`. **A wide mouth leans less**: 3.6° on the default
 * egg's ⌀148, 11° at the ⌀16 floor, the clearance being a smaller fraction of a bigger circle — which
 * is how a hoop behaves in the hand, and the reason this is not one constant angle.
 *
 * `room` is the millimetres the caller has along the axis (opening → the koma's outer face, which is
 * where the low rim would foul the part the mold stands on), and the lean is capped at the angle that
 * spends exactly that. What a leaning hoop occupies is `2·rOuter·sin α + RING_H·cos α` — the low rim's
 * drop **plus the hoop's own thickness**, which is the term this cap was missing: at a ⌀600 mouth on a
 * 60mm body it spent 21.10mm of 20.00mm, and in the standing pose (where `Box3` puts the mold on the
 * floor by its own extent) that hovers the whole mold 1.1mm off the table. `check:manifold` measures
 * the span on the ring's own vertices now, which is what found it.
 *
 * `A·sin α + B·cos α = hypot(A,B)·sin(α + atan2(B,A))`, so the cap inverts in closed form.
 *
 * Both routes, one expression: `WIRE_D` is `RING_WALL`'s twin AND `RING_H`'s (2mm all three), so the
 * leaning hoop has the same outer radius and the same thickness whether it was printed or bent.
 */
export function hoopLean(p: Design, top: boolean, room: number): number {
  const r = openingR(p, top);
  const bind = Math.acos(Math.min(1, r / (r + RING_FIT)));
  const drop = 2 * (r + RING_FIT + RING_WALL);          // the low rim's travel per radian of lean
  const phase = Math.atan2(RING_H, drop);
  const fits = Math.asin(Math.min(1, Math.max(0, room) / Math.hypot(drop, RING_H))) - phase;
  return Math.max(0, Math.min(bind, fits));
}
