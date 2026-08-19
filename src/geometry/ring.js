/**
 * ============================================================================
 * OPENING RING (KUCHIWA) — the one part that is not part of the mold
 * ============================================================================
 * A thin flat hoop glued around the finished lantern's opening to hold it round, after the mold has
 * been taken apart and pulled out. Sized from `openingR()`, so it follows the design like every
 * other part. Top and bottom are the same hoop in two sizes, so the bottom one carries a small
 * square marker tab on its inner rim to tell the printed pair apart.
 * ============================================================================
 */
import * as THREE from "three";
import { outerR } from "./profile.js";

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
// Bottom-ring marker. The two rings are the same flat hoop in different sizes, and on a shape whose
// openings are close (the sphere preset is ⌀60 vs ⌀56) they are easy to mix up once printed. One
// small square tab on the inner rim tells them apart at a glance, and only the bottom one has it.
// It reaches past the nominal opening by MARK_D - RING_FIT; that is intended, the tab sits in the
// pasted layers at the rim. Kept narrow so it takes up as little of the rim as possible — widen it
// and it stops being something you can tuck in. Don't "fix" it by moving it outward.
const MARK_D = 1.5;   // how far the tab reaches in from the inner rim (mm)
const MARK_W = 3;     // tangential width of the tab (mm) — at ⌀148 that is a 2.3° bite of the rim
// The opening (= opening ring) radius. top=true for the top end, false for the bottom end. Uses
// outerR's end value regardless of whether a neck exists.
export function openingR(p, top) { return outerR(p, top ? 1 : 0); }
// A full-circle point list, optionally centered at (cx, cy). absarc(0,2π) creates a duplicate
// start=end point and spawns a degenerate triangle, so it is built from N points below 0..2π and the
// loop is not closed (Shape/Path close it automatically).
function circlePts(r, N, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
  return pts;
}
// A flat annulus (ring) extruded along Z, centered at (cx, cy). Independently watertight.
// `mark` > 0 puts one square tab of that depth on the INNER rim (a marker, not a feature — MARK_D).
function annulusGeo(rOuter, rInner, N, cx = 0, cy = 0, depth = RING_H, mark = 0) {
  const shape = new THREE.Shape(circlePts(rOuter, N, cx, cy));
  let hole;
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
export function ringGeometry(p, top) {
  const R = openingR(p, top);          // the opening's outer diameter = the rib's outer side (lamp body face)
  const inner = R + RING_FIT;          // inner diameter = opening outer diameter + clearance (the ring fits smoothly onto the outside of the opening)
  const outer = inner + RING_WALL;     // outward by the wall thickness. The bamboo rib winds around this outer edge
  const N = 96;
  // Both rings are the same flat hoop; only the bottom one gets the marker bump (see MARK_D).
  return annulusGeo(outer, inner, N, 0, 0, RING_H, top ? 0 : MARK_D);
}
