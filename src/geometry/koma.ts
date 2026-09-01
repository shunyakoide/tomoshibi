/**
 * ============================================================================
 * KOMA — the gear-like hub that bundles the rib tabs
 * ============================================================================
 * Two identical hubs, top and bottom, a small gear with edge-open notches (parallel walls) around
 * the rim: the tab (inner end Ri〜Ri+td) plugs in and the rib extends out through the notch, and the
 * stand cradles the rim. The notch bottom radius comes from `notchR()`, which is `tabTipRi() - 0.5` —
 * the same quantity the rib's tab tip is cut from, so the two cannot drift apart. With a dented tab the notch does NOT reach
 * the tab's inner end — `notchR` sits at the DENT radius, so the wider tab base (further in, at
 * `innerRi`) catches the koma's solid hub. That is the koma stop.
 * ============================================================================
 */
import type { Design } from "../types.ts";
import * as THREE from "three";
import { komaR, notchR } from "./profile.ts";

export function komaShape(p: Design): THREE.Shape {
  const { boards, boardT } = p;
  const R = komaR(p);
  // Notch width = board thickness + print fit. The tab itself stays boardT, so fit only opens the
  // real fit clearance (fit=0 → no gap).
  const sw = boardT + Math.max(0, p.fit ?? 0);
  const eps = Math.asin(Math.min(0.9, (sw / 2) / R));
  const rOut = Math.sqrt(Math.max(1, R * R - (sw / 2) * (sw / 2)));
  const nR = notchR(p); // notch bottom = the dented tab tip, relieved 0.5. Shared with ribOutline2D.
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
    // The notch's outer return point is the start of the next tooth; on the last board it coincides
    // with the moveTo start, so it is left to closePath (a duplicate point → degenerate triangle).
    if (k < boards - 1) shape.lineTo(rOut * dx + nx * sw / 2, rOut * dy + ny * sw / 2);
  }
  shape.closePath();
  return shape;
}
export function komaGeometry(p: Design): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(komaShape(p), { depth: p.komaT, bevelEnabled: false });
}
