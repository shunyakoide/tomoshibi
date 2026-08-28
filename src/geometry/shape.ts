/**
 * ============================================================================
 * POINT LIST → EXTRUDABLE SHAPE
 * ============================================================================
 * The one conversion from "[[x,y],…]" to a THREE.Shape, and the cleanup that has to happen first.
 *
 * Every extruded part goes through `shapeFromPts` because earcut degenerates in two ways that both
 * end in an open edge — near-duplicate points and collinear runs — and the cleanup has to be applied
 * to the holes as well as the outline. Building a Shape by hand is how you forget the second half
 * (see CLAUDE.md "Two kinds of earcut degeneracy"; ribBandShape once carried a copy of the cleanup
 * that was missing exactly the collinear removal).
 * ============================================================================
 */
import type { Pt2 } from "../types.ts";
import * as THREE from "three";

// Point-list cleanup before extrusion (used for both the outline and the windows).
// ・Remove near-duplicate points: they arise at the barb (steep flank) and at the neck merge. Left
//   in, they make degenerate triangles → open edge.
// ・Remove collinear points: without this, "points on the same line" line up in the hundreds in flat
//   stretches like the inner-edge curve. earcut drops collinear points when triangulating, so the
//   cap's boundary diverges from the side-wall boundary and becomes an open edge (the side walls are
//   built exactly per the point list, but the cap discards points).
//   The test uses "the perpendicular distance from the line joining the neighboring points" (stable regardless of length).
function cleanPoly(pts: Pt2[], eps = 1e-3): Pt2[] {
  const out: Pt2[] = [];
  for (const q of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > eps) out.push(q); }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  if (out.length < 4) return out;
  const keep: Pt2[] = [];
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
export function shapeFromPts(pts: Pt2[], holes: Pt2[][] = []): THREE.Shape {
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
