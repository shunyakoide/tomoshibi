/**
 * ============================================================================
 * KOMA — the gear-like hub that bundles the rib tabs
 * ============================================================================
 * Two identical hubs, top and bottom. Notches around the rim take the tabs; the stand cradles the
 * rim. The notch width is the board thickness plus the print tolerance, and its bottom radius comes
 * from `notchR()` — the same function the rib's tab tip is built from, which is what makes them mate.
 * ============================================================================
 */
import type { Design } from "../types.ts";
import * as THREE from "three";
import { komaR, notchR } from "./profile.ts";

// ============ Koma (the small gear hub that bundles the tabs) ============
// Like the main one, a small gear with edge-open notches (parallel walls). The tab (inner end
// Ri〜Ri+td) meets the koma's edge. The notch reaches the tab's inner end (Ri), and the rib extends
// out through the notch. The stand receives the koma.
export function komaShape(p: Design): THREE.Shape {
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
export function komaGeometry(p: Design): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(komaShape(p), { depth: p.komaT, bevelEnabled: false });
}
