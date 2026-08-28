/**
 * ============================================================================
 * OPENING RING (KUCHIWA) — the one part that is not part of the mold
 * ============================================================================
 * A thin flat hoop glued around the finished lantern's opening to hold it round, after the mold has
 * been taken apart and pulled out. Sized from `openingR()`, so it follows the design like every
 * other part.
 *
 * The BOTTOM ring doubles as the base of a leg stand for the finished lantern: inside the hoop sit
 * `legN` flat "onigiri" pads (rounded triangles), each with a bore at its middle that a leg rod
 * pushes into. Where the opening is too small to hold them the ring falls back to a plain hoop with
 * a marker tab, which is also what tells the printed pair apart when there are no sockets to do it.
 * ============================================================================
 */
import type { Design } from "../types.ts";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { outerR } from "./profile.ts";

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
// ---- Leg sockets on the bottom opening ring ----
// The bottom ring also serves as the base of a leg stand for the finished lantern. Inside the hoop,
// `p.legN` "onigiri" pads (rounded triangles) sit evenly spaced, each pointing its vertex toward the
// center, and a leg rod is inserted into the bore at each pad's middle. The pad's outer (rounded)
// edge overlaps the hoop's inner rim so the whole thing prints as one piece.
//
// The pad's dimensions are CONSTANTS, not settings. The one thing a design has to say about them is
// whether it wants them at all (`p.legSockets`) — a lantern either stands on legs or it doesn't. How
// wide the pad is and how big the bore is are consequences of that decision, not separate questions,
// and a rod is trimmed to the hole rather than the other way round.
const LEG_N = 3;         // number of leg sockets (evenly spaced)
const LEG_D = 6;         // leg rod diameter (mm)
const TRI_R = 10;        // onigiri circumradius (corner distance from pad center, mm)
const TRI_ROUND = 0.4;   // corner rounding as a fraction of the edge (0 = sharp, ~0.5 = very round)
const LEG_OVERLAP = 0.6; // how far the pad's outer edge overlaps into the hoop rim (mm), for a joined look
const PAD_CORE = 1;      // material the inner vertex must leave around the ring's axis, mm
const PAD_GAP = 1.5;     // clear air required between two neighbouring pads, mm
// Bottom-ring marker, for when there are no leg sockets to tell the pair apart. The two rings are
// then the same flat hoop in different sizes, and on a shape whose openings are close (the sphere
// preset is ⌀60 vs ⌀56) they are easy to mix up once printed. One small square tab on the inner rim
// tells them apart at a glance. It reaches past the nominal opening by MARK_D - RING_FIT; that is
// intended, the tab sits in the pasted layers at the rim. Kept narrow so it takes up as little of
// the rim as possible — widen it and it stops being something you can tuck in. Don't "fix" it by
// moving it outward.
const MARK_D = 1.5;   // how far the tab reaches in from the inner rim (mm)
const MARK_W = 3;     // tangential width of the tab (mm) — at ⌀148 that is a 2.3° bite of the rim
// The opening (= opening ring) radius. top=true for the top end, false for the bottom end. Uses
// outerR's end value regardless of whether a neck exists.
export function openingR(p: Design, top: boolean): number { return outerR(p, top ? 1 : 0); }

// The bottom ring's leg sockets, or null when the design turned them off OR the opening has no room
// for them. Exported because the inspector has to say which of those it is — "off" is a checkbox you
// can tick back on, "no room" is not, and a socket that silently is not there is one you find out
// about with the print in your hand. Both the ring geometry and the UI read THIS function, so they
// cannot disagree about whether a given design has sockets.
export function ringLegs(p: Design): { n: number; bore: number; triR: number; Rc: number } | null {
  if ((p.legSockets ?? true) === false) return null;
  const bore = LEG_D / 2 + RING_FIT;               // leg bore = leg rod radius + fit clearance
  const inner = openingR(p, false) + RING_FIT;
  // Pad center: with the vertex pointing inward, the outward-facing edge's midpoint sits at Rc + TRI_R/2.
  // Place it just inside the rim so that midpoint overlaps the hoop band by LEG_OVERLAP.
  const Rc = inner + LEG_OVERLAP - TRI_R / 2;
  // Two ways the pads run out of room on a small opening, and both are checked against the SAME pad
  // the geometry below builds. (1) The inward vertex crosses the ring's axis — at LIMITS' smallest
  // opening (⌀20) it does, and the pads then fold through each other into a shape no slicer can
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

// A full-circle point list, optionally centered at (cx, cy). absarc(0,2π) creates a duplicate
// start=end point and spawns a degenerate triangle, so it is built from N points below 0..2π and the
// loop is not closed (Shape/Path close it automatically).
function circlePts(r: number, N: number, cx = 0, cy = 0): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
  return pts;
}
// A flat annulus (ring) extruded along Z, centered at (cx, cy). Independently watertight.
// `mark` > 0 puts one square tab of that depth on the INNER rim (a marker, not a feature — MARK_D).
function annulusGeo(rOuter: number, rInner: number, N: number, cx = 0, cy = 0, depth = RING_H, mark = 0): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(circlePts(rOuter, N, cx, cy));
  let hole: THREE.Vector2[];
  if (mark > 0 && MARK_W / 2 < rInner) {
    // The tab is a rectangle spliced into the hole, so material grows inward. Its two base corners
    // are placed at the exact angles where the rim crosses y = ±MARK_W/2, which is what keeps the
    // splice from leaving a hair-thin sliver of a triangle at the join. The rim is then sampled
    // strictly BETWEEN those angles, so no sample can coincide with a corner.
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
// with a circular bore of radius `boreR` at the center. Extruded along Z. `t` is the corner rounding
// as a fraction of the edge — a single number for all corners, or a per-corner [t0,t1,t2]; a corner
// with t=0 stays sharp (used where the pad meets the ring). Independently watertight.
function onigiriGeo(cx: number, cy: number, R: number, t: number | [number, number, number], rot: number, boreR: number, depth: number): THREE.ExtrudeGeometry {
  const tv = Array.isArray(t) ? t : [t, t, t];
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
  const inner = R + RING_FIT;          // inner diameter = opening outer diameter + clearance (the ring fits smoothly onto the outside of the opening)
  const outer = inner + RING_WALL;     // outward by the wall thickness. The bamboo rib winds around this outer edge
  const N = 96;
  if (top) return annulusGeo(outer, inner, N);   // the top ring is a plain hoop
  const legs = ringLegs(p);
  // No room for sockets → a plain hoop, and then the marker tab is the only thing separating this
  // ring from the top one, so it is cut exactly when the sockets are not.
  if (!legs) return annulusGeo(outer, inner, N, 0, 0, RING_H, MARK_D);
  // Bottom ring = base of the leg stand. Inside the hoop, the pads point their vertex toward the
  // center; the opposite (rounded) edge overlaps the inner rim so it all prints as one piece.
  const geos = [annulusGeo(outer, inner, N)];
  for (let i = 0; i < legs.n; i++) {
    const a = (i / legs.n) * Math.PI * 2;
    const rot = a + Math.PI;                 // V[0] vertex points inward (toward the center)
    // Round only the inner vertex; keep the two outer corners sharp where the pad meets the ring.
    // Flat pad, same height as the hoop (RING_H).
    geos.push(onigiriGeo(legs.Rc * Math.cos(a), legs.Rc * Math.sin(a), legs.triR, [TRI_ROUND, 0, 0], rot, legs.bore, RING_H));
  }
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}
