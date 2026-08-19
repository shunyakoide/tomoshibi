/**
 * ============================================================================
 * STAND — two saddle posts and the base plate that spaces them
 * ============================================================================
 * Holds the assembled mold clear of the table so it can be turned while bamboo is wound and washi
 * pasted. Constant-thickness posts drop into slots in one thin plate: every face prints flat, so
 * there are no overhangs and no supports.
 *
 * This is the far side of the koma↔stand seam: `standGeometry` calls `komaR()` for the saddle
 * radius, and the post height traces back through `standSaddleH → maxRadius → outerR`, which is why
 * editing the profile moves the stand's dimensions too.
 * ============================================================================
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { komaR, maxRadius } from "./profile.js";

// ============ Stand (simple insertion type) ============
// Two columns of "uniform-thickness flat plate" that receive the koma's edge in a U-shaped saddle
// (notch) are simply inserted into the slots of a single thin base plate. Since the columns are of
// constant thickness, their bottom faces are completely flat → they can be printed laid flat with no
// overhangs (no supports needed). A single plate holds both columns at the correct spacing → no clips
// or connecting hardware needed.
const GROOVE_FIT = 1.0;   // the U-saddle's koma-thickness clearance (play for the koma to fit smoothly)
const SADDLE_FIT = 1.5;   // the saddle receiving radius clearance (room to drop the koma edge in from above)
const BASE_T = 5;         // base plate thickness (mm, keep the center thin)
const COLLAR_H = 10;      // height of the collar (socket) raised around the slot → deepens the insertion and suppresses wobble
const COLLAR_W = 4;       // collar wall thickness (mm)
const TENON_W = 44;       // column insertion tenon width (mm)
const TENON_D = BASE_T + COLLAR_H; // tenon insertion depth = collar top face ~ plate bottom (received over the full length)
const FOOT_HW = 29;       // column foot half-width (the foot that rests on the collar top face)
const SLOT_FIT = 0.4;     // slot fit clearance
const BASE_MARGIN = 8;    // base plate edge margin
// Column thickness (z) = koma thickness + clearance. The column is made from a single flat plate of this constant thickness.
function standFullW(p) { return p.komaT + GROOVE_FIT; }

// Column profile (local x=width, y=height). Includes the insertion tenon at the bottom + the U-saddle at the top + lightening windows.
function standProfile(seatR, H, halfOpen, colW) {
  const lipY = H - seatR * Math.cos(halfOpen);
  const lipX = seatR * Math.sin(halfOpen);
  const topY = lipY + 8;
  const shoulder = 26;               // the height at which the foot widens into the body
  const s = new THREE.Shape();
  s.moveTo(-TENON_W / 2, -TENON_D);  // bottom: center tenon → foot → taper to the shoulder
  s.lineTo(TENON_W / 2, -TENON_D);
  s.lineTo(TENON_W / 2, 0);
  s.lineTo(FOOT_HW, 0);
  s.lineTo(colW, shoulder);
  s.lineTo(colW, topY);
  s.lineTo(lipX, topY);
  s.lineTo(lipX, lipY);
  for (let i = 0; i <= 32; i++) {
    const a = halfOpen - (i / 32) * (2 * halfOpen); // right edge → bottom → left edge (U-saddle)
    s.lineTo(seatR * Math.sin(a), H - seatR * Math.cos(a));
  }
  s.lineTo(-lipX, topY);
  s.lineTo(-colW, topY);
  s.lineTo(-colW, shoulder);
  s.lineTo(-FOOT_HW, 0);
  s.lineTo(-TENON_W / 2, 0);
  s.lineTo(-TENON_W / 2, -TENON_D);
  s.closePath();
  // Lightening windows. Keep the edge legs while cutting a wide center out (a tall column is split in two by a strut to retain rigidity).
  const wx = colW - 8;               // keep just 8mm of the outer leg
  const wy0 = shoulder + 5, wy1 = H - seatR - 6; // from just above the foot shoulder to just below the saddle bottom
  if (wx > 8 && wy1 - wy0 > 40) {    // a tall column is split in two (keeping a strut)
    const mid = (wy0 + wy1) / 2, strut = 8;
    for (const [a, b] of [[wy0, mid - strut / 2], [mid + strut / 2, wy1]]) {
      if (b - a < 14) continue;
      const w = new THREE.Path();
      w.moveTo(-wx, a); w.lineTo(wx, a); w.lineTo(wx, b); w.lineTo(-wx, b); w.closePath();
      s.holes.push(w);
    }
  } else if (wx > 8 && wy1 - wy0 > 16) {
    const w = new THREE.Path();
    w.moveTo(-wx, wy0); w.lineTo(wx, wy0); w.lineTo(wx, wy1); w.lineTo(-wx, wy1); w.closePath();
    s.holes.push(w);
  }
  return s;
}
// Column = a single flat plate of constant thickness (= koma thickness + clearance). The U-notch at
// the top receives the koma's edge, and the center tenon at the bottom is inserted into the base
// plate's slot. Since the thickness is uniform, the bottom face is completely flat in flat printing →
// no overhangs, no supports. The koma's thickness direction settles into the U-groove, and its axial
// direction is located by being clamped between the two left/right columns.
// Dimensions for placing the stand at the correct height in the assembly preview (floor basis):
export function standCollarTop() { return BASE_T + COLLAR_H; } // the height the column foot rests at (= collar top face)
export function standSaddleH(p) { return maxRadius(p) + 15; }  // the column-local saddle center height
export function standGeometry(p) {
  const R = maxRadius(p);
  const kR = komaR(p);
  const H = standSaddleH(p);         // saddle center (koma center) height (max radius + 15mm floor clearance)
  const saddleR = kR + SADDLE_FIT;   // U-groove receiving radius (koma edge + clearance)
  const halfOpen = Math.PI * 0.5;    // semicircular saddle: mouth width = diameter → the koma can be dropped in from above and seated
  const colW = saddleR * Math.sin(halfOpen) + 12;
  const T = standFullW(p);           // plate thickness = koma thickness + clearance
  const g = new THREE.ExtrudeGeometry(
    standProfile(saddleR, H, halfOpen, colW),
    { depth: T, bevelEnabled: false });
  g.translate(0, 0, -T / 2);
  return g;
}
// The two columns (saddles) won't fit into the grooves unless they come directly beneath the two
// koma.
// → Column slot spacing = koma center spacing. The koma is inserted onto the tab (length tabLen) and
//   pushed all the way to the tip, so the koma center comes at komaT/2 from the end. Hence
//   spacing = lamp body + 2*(tabLen - komaT/2) = lamp body + 2*tabLen - komaT (based on the tab tip =
//   the insertion stop position).
export function standSlotSep(p) { return p.height + 2 * p.tabLen - p.komaT; }
// Base plate: a thin flat plate with two column-tenon slots. Total length = koma spacing + slot width
// + margins at both ends. (The slots are placed directly beneath the koma = ±spacing/2, with material
// left outside them, so it is slightly longer than the rib.)
export function standBoardLength(p) {
  return standSlotSep(p) + standFullW(p) + SLOT_FIT + 2 * BASE_MARGIN;
}
// A rounded-rectangle hole path (center cx,cy / half-widths hx,hy / corner radius r).
// Rounding the corners avoids the "multiple holes sharing the same scan line" degeneracy, so three.js
// ExtrudeGeometry doesn't produce non-manifold (open edge). It is also kind to tenon insertion.
function roundedRectPath(cx, cy, hx, hy, r) {
  r = Math.max(0.2, Math.min(r, hx - 0.05, hy - 0.05));
  const p = new THREE.Path();
  p.moveTo(cx - hx + r, cy - hy);
  p.lineTo(cx + hx - r, cy - hy); p.absarc(cx + hx - r, cy - hy + r, r, -Math.PI / 2, 0, false);
  p.lineTo(cx + hx, cy + hy - r); p.absarc(cx + hx - r, cy + hy - r, r, 0, Math.PI / 2, false);
  p.lineTo(cx - hx + r, cy + hy); p.absarc(cx - hx + r, cy + hy - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(cx - hx, cy - hy + r); p.absarc(cx - hx + r, cy - hy + r, r, Math.PI, Math.PI * 1.5, false);
  p.closePath();
  return p;
}
export function boardGeometry(p) {
  const len = standBoardLength(p);
  const sep = standSlotSep(p);                          // column slot spacing = koma spacing
  const W = TENON_W + 2 * BASE_MARGIN;                   // base plate width
  const s = new THREE.Shape();
  s.moveTo(-len / 2, -W / 2);
  s.lineTo(len / 2, -W / 2);
  s.lineTo(len / 2, W / 2);
  s.lineTo(-len / 2, W / 2);
  s.closePath();
  const sx = (standFullW(p) + SLOT_FIT) / 2, sy = (TENON_W + SLOT_FIT) / 2;
  // Two column-tenon slots. The corners stay square (so the rectangular tenon inserts snugly).
  // But if the two slots' y-ends are exactly on the same scan line, earcut breaks and produces an open
  // edge, so they are staggered by ±0.1mm up/down to avoid the degeneracy (the offset is within
  // SLOT_FIT=0.4mm, so it does not affect the fit).
  const STAGGER = 0.1;
  const slots = [[-sep / 2, STAGGER], [sep / 2, -STAGGER]];
  const slotRect = (cx, dy, hx, hy) => {
    const p = new THREE.Path();
    p.moveTo(cx - hx, dy - hy); p.lineTo(cx + hx, dy - hy);
    p.lineTo(cx + hx, dy + hy); p.lineTo(cx - hx, dy + hy); p.closePath();
    return p;
  };
  for (const [cx, dy] of slots) s.holes.push(slotRect(cx, dy, sx, sy));
  // Lightening: cut the center between the slots as a single large window (no strut). Keep only the ends and around the slots.
  const wall = 9, hw = W / 2 - wall, innerHalf = sep / 2 - sx - wall;
  if (hw > 4 && innerHalf > 8) {
    s.holes.push(roundedRectPath(0, 0, innerHalf, hw, 2));
  }
  const geos = [new THREE.ExtrudeGeometry(s, { depth: BASE_T, bevelEnabled: false })];
  // Raise a collar (socket) around the slots, taking the insertion depth from BASE_T → BASE_T+COLLAR_H.
  // Each collar is an independent sealed solid. Sink it slightly into the plate so it self-intersects
  // (= unions in the slicer), avoiding a non-manifold edge from exactly coincident faces. The center
  // stays thin, so the material is minimal.
  const SINK = 1.5, EPS = 0.03;
  for (const [cx, dy] of slots) {
    const c = new THREE.Shape();
    const oX = sx + COLLAR_W, oY = sy + COLLAR_W;
    c.moveTo(cx - oX, dy - oY); c.lineTo(cx + oX, dy - oY);
    c.lineTo(cx + oX, dy + oY); c.lineTo(cx - oX, dy + oY); c.closePath();
    c.holes.push(slotRect(cx, dy, sx + EPS, sy + EPS)); // slightly non-coincident with the plate slot
    const g = new THREE.ExtrudeGeometry(c, { depth: COLLAR_H + SINK, bevelEnabled: false });
    g.translate(0, 0, BASE_T - SINK);
    geos.push(g);
  }
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}
