/**
 * The 2D outline (tabs + grooved outer edge + hollowed inner edge), the lightening windows, the
 * serial number engraved for spiral winding, and the extrusion. `ribOutline2D` is shared by the
 * printed rib, the section drawing and the cardboard template, so all three are the same plate.
 */
import type { Design, Pt2 } from "../types.ts";
import * as THREE from "three";
import { cutYbot, cutYtop, effBoardWidth, innerRi, komaR, outerR, tabDepth, tabDented, TAB_DENT_W, TAB_DENT_H } from "./profile.ts";
import { grooveList, grooveOuterPts, grooveReach } from "./groove.ts";
import { shapeFromPts } from "./shape.ts";

// [Rib inner edge = crescent] Hollowed toward the centre so the rib pulls out of the opening after
// drying. The outer edge is untouched, so this reaches neither the mold shape, the tab, the koma nor
// the stand. The core stays straight at `Ri` with an inward bump only inside t∈[tC-HW, tC+HW] —
// bending the whole rib gives the ends an impossible shape — and bump = (1-u²)² has value AND slope
// 0 at its ends, so it meets the core with no corner. Amplitude = centre depth (outer − core) ×
// `RIB_CURVE_D`, a RATIO so the proportion survives a profile change, clamped so the inner edge can
// never cross the outer one.
const RIB_MIN_BAND = 12;  // minimum band thickness (mm). Remains even after subtracting the groove depth (max higoD*1.5).
const RIB_CURVE_C = 0.5;  // curve center (t) = the rib center
const RIB_CURVE_HW = 0.3; // curve half-width (t). Applies only to the middle 60%; the top/bottom 20% each stay core.
const RIB_CURVE_D = 0.3;  // scoop amount = the center rib depth × this (the real mold is about 20%; slightly deeper, prioritizing ease of removal)
export function ribInnerX(p: Design): (y: number) => number {
  const h = p.height, Ri = innerRi(p);
  const W = Math.max(RIB_MIN_BAND, effBoardWidth(p)); // band width to keep
  const bump = (t: number) => {
    const u = (t - RIB_CURVE_C) / RIB_CURVE_HW;
    if (Math.abs(u) >= 1) return 0;
    const v = 1 - u * u;
    return v * v; // value and slope both 0 at the ends → smooth connection to the core
  };
  // Amplitude = a fixed fraction of the center depth (real-mold basis).
  let A = Math.max(0, (outerR(p, RIB_CURVE_C) - Ri) * RIB_CURVE_D);
  // Clamp to an upper limit that does not break the band width W (automatically shallower where narrowed).
  for (let i = 0; i <= 200; i++) {
    const t = i / 200, b = bump(t);
    if (b < 1e-3) continue;
    A = Math.min(A, (outerR(p, t) - W - Ri) / b);
  }
  A = Math.max(0, A);
  return (y: number) => {
    const t = Math.min(1, Math.max(0, y / h));
    return Math.max(Ri, Math.min(Ri + A * bump(t), outerR(p, t) - RIB_MIN_BAND));
  };
}

// ============ Pulling the ribs out ============
// Once the paste has dried the koma come off and the ribs leave through an opening, one at a time.
// A rib is fed out lengthwise, so the mouth's plane cuts ACROSS the plate: what has to pass is the
// plate's BAND — outer edge minus hollowed inner edge — not its distance from the axis, and a deep
// body on a small mouth cannot be taken apart again. The tabs never bind, spanning Ri..kR with kR at
// most the SMALLER opening. The cut is a `boardT`-wide rectangle rather than a line, so the plate
// gets the chord at its own half-thickness, 2√(R²−(t/2)²); `PULL_CLEAR` is slack for it to turn in,
// the band being curved, since a rib exactly as wide as the chord binds.
const PULL_CLEAR = 2;   // mm of slack left for the plate to turn as it comes out
export function ribPullFit(p: Design): { band: number; openR: number; ok: boolean } {
  const h = p.height, innerX = ribInnerX(p);
  let band = 0;
  for (let y = 0; y <= h; y += 0.5) band = Math.max(band, outerR(p, y / h) - innerX(y));
  // Out of the WIDER of the two mouths — nothing makes a rib leave by one end rather than the other.
  const R = Math.max(outerR(p, 0), outerR(p, 1));
  const chord = 2 * Math.sqrt(Math.max(0, R * R - (p.boardT / 2) ** 2));
  return { band, openR: R, ok: band + PULL_CLEAR <= chord };
}

// The rib's outline point list, shared by the 2D section drawing and the 3D geometry, so the two
// always match. `k` is the rib index: normally every rib is the same shape (grooves are horizontal
// rings), but with spiral winding `grooveList` shifts them by k, making every rib a different part.
// `opts.smooth` returns a smooth outer edge with no grooves cut — for the cardboard template, which
// ticks the bamboo positions instead, 0.5mm V notches not being cuttable in board.
export function ribOutline2D(p: Design, k = 0, opts: { smooth?: boolean } = {}): Pt2[] {
  const h = p.height, tl = p.tabLen;
  // Grooves run over the whole lamp body (between the outermost control points) but not right up to
  // the ends: `grooveLattice` insets the range by gR*1.6 and `grooveList` starts a further half-pitch
  // in, so no groove sits next to an opening (a barb there does not hold).
  const grooves = grooveList(p, k);
  // Outer edge: grooves cut along the surface normal (opts.smooth = no grooves, for the paper template).
  const outerEdge = grooveOuterPts(p, opts.smooth ? [] : grooves);
  const Ri = innerRi(p), STEP = 0.5, pts: Pt2[] = [];
  // Tab = a straight tongue, its outer edge exactly the koma outer radius kR (no overhang).
  const kR = komaR(p), dent = tabDented(p); // both tips get the inner-corner dent (matched by the koma notch)
  // Bottom tab.
  pts.push([Ri, 0]);
  if (dent) pts.push([Ri, -(tl - TAB_DENT_H)], [Ri + TAB_DENT_W, -(tl - TAB_DENT_H)], [Ri + TAB_DENT_W, -tl]);
  else pts.push([Ri, -tl]);
  pts.push([kR, -tl], [kR, 0]);
  // Outer edge from y=0 (= [outerR(p,0),0]) up to y=h (= [outerR(p,1),h]); endpoints are exact.
  for (const q of outerEdge) pts.push(q);
  // Top tab: the same, no stopper tooth on the outer edge (full kR).
  pts.push([kR, h], [kR, h + tl]);
  if (dent) pts.push([Ri + TAB_DENT_W, h + tl], [Ri + TAB_DENT_W, h + tl - TAB_DENT_H], [Ri, h + tl - TAB_DENT_H]);
  else pts.push([Ri, h + tl]);
  // Inner edge: the crescent curve, top to bottom. Both ends return to Ri, so it meets the tabs.
  const innerX = ribInnerX(p);
  pts.push([Ri, h]);
  for (let y = h - STEP; y > 0; y -= STEP) pts.push([innerX(y), y]);
  pts.push([Ri, 0]);
  return pts;
}
// Lightening windows (keep the outer band, and the inner core spineW, divided by struts strut).
// The window's outer boundary follows the "smooth outer edge (outerR)" rather than the grooved one,
// so it does not go bumpy — the grooves are accounted for by the band's width instead (see `band`).
const Y_STAGGER = 0.13; // amount (mm) to offset the window's y-ends off the outline sample lattice (0.5mm)
// Solid material (mm) that must remain between a groove's notch tip and the lightening window, once
// the slope term below overtakes the flat-face band. Under ~2mm the strip prints as a tear line, and
// the old constant band left 0.2mm on the steepest shape the app allowed.
const BAND_SOLID = 3;
export function lightenHoles2D(p: Design): { holes: Pt2[][] } {
  const h = p.height, td = tabDepth(p);
  const spineW = Math.max(9, td + 3), bandW = 11, strut = 8, MIN_MAT = 12;
  const oS = (y: number) => outerR(p, Math.min(Math.max(y, 0), h) / h); // smooth outer edge
  // The band of solid left between the grooved edge and the window. It cannot be a constant, because
  // the notch is deeper where the face is steeper (`grooveReach` takes the slope): a gentle face
  // barely exceeds the flat depth and `bandW` swallows it, a steep one — a wide, low body — reaches
  // several millimetres further in, and the window's outer edge is then drawn straight through the
  // notch, earcut returning a cap with open edges. `grooveReach` answers for the whole tooth, ramp
  // included, so the 2mm chords between window samples cannot cut the corner either.
  // `bandW` is the floor, so every design that was already clear of the notch keeps the exact
  // window it had; BAND_SOLID is the material that has to survive behind the tip once it isn't.
  const band = (y: number) => Math.max(bandW, grooveReach(p, y) + BAND_SOLID);
  // The window's inner side follows the crescent inner edge, keeping the core a constant spineW
  // wide, so the centre window takes the scoop's shape too. cleanPoly thins the collinear points it
  // leaves, so earcut does not break.
  const rIn = ribInnerX(p);
  const xi = (y: number) => rIn(Math.min(Math.max(y, 0), h)) + spineW;
  // Bottom: the neck's steep rise (flare) stays solid rather than becoming a thin, breakable strut.
  // Top: it narrows to a point, so leave a margin — the window shrinks to the range where material
  // remains rather than being dropped, so even the narrowing top gets one and the lightening evens out.
  const yBot = cutYbot(p) + 14, yTop = h - cutYtop(p) - 6;
  const nWin = Math.max(1, Math.round((yTop - yBot) / 46)), winH = (yTop - yBot) / nWin, holes: Pt2[][] = [];
  const thin = (y: number) => oS(y) - band(y) - xi(y) < MIN_MAT;
  for (let i = 0; i < nWin; i++) {
    let y0 = yBot + i * winH + strut / 2, y1 = yBot + (i + 1) * winH - strut / 2;
    // At thin-material ends (the narrowing top) pull the window ends in rather than dropping it.
    while (y1 - y0 > 4 && thin(y1)) y1 -= 2;
    while (y1 - y0 > 4 && thin(y0)) y0 += 2;
    if (y1 - y0 < 14) continue;
    // On a waisted shape a thin band partway through the window breaks earcut, so check the whole range.
    let ok = true;
    for (let y = y0; y <= y1; y += 2) if (thin(y)) { ok = false; break; }
    if (!ok) continue;
    // Offset the window's y-ends off the outline's sample lattice (STEP=0.5mm): on the same scan
    // line the window corner and outline vertex are collinear, and earcut makes a zero-area triangle
    // = open edge (boardGeometry's STAGGER is the same fix; the offset costs no lightening).
    const ya = y0 + Y_STAGGER, yb = y1 - Y_STAGGER;
    if (yb - ya < 10) continue;
    // A closed loop up the outer side (inside the band) and back down the inner one (outside the
    // core = the crescent), both edges cut with the same divisions and ends matched exactly, so no
    // stray points are left at the corners.
    const ns = Math.max(2, Math.ceil((yb - ya) / 2));
    const poly: Pt2[] = [];
    for (let i = 0; i <= ns; i++) { const y = ya + ((yb - ya) * i) / ns; poly.push([oS(y) - band(y), y]); }
    for (let i = ns; i >= 0; i--) { const y = ya + ((yb - ya) * i) / ns; poly.push([xi(y), y]); }
    holes.push(poly);
  }
  return { holes };
}

// ============ Rib ============
// [Spiral winding] The serial number (k+1) cut into the solid band at the rib's bottom end is its
// position around the circumference: in a spiral every rib has different groove positions, so out of
// order the bamboo does not form a continuous helix — and the printed parts are indistinguishable.
// ・Each digit cuts the lit segments of a 7-segment display as **independent thin through-holes**;
//   the gaps between segments keep the centre island of a 0 or an 8 connected to the body through
//   the corners, so it stays watertight exactly as the lightening windows do.
// ・Non-spiral returns an empty array, so existing STLs are unchanged (hash match).
// ・Where an extremely small opening leaves no width for it, the number is given up on.
export function ribNumberHoles2D(p: Design, k: number): Pt2[][] {
  if (!p.spiral) return [];
  const h = p.height, Ri = innerRi(p), s = String(k + 1);
  let W = 6, H = 11, T = 1.2, CG = 0.45, GX = 2;            // digit: width/height/bar thickness/corner gap/inter-digit gap (mm)
  const y0base = Math.max(4, p.tabLen * 0.4);               // the solid band just above the bottom tab
  const outer = outerR(p, Math.min(Math.max(y0base + H / 2, 0), h) / h);
  const availW = (outer - 5) - (Ri + 3);                    // usable width leaving inner edge 3 / outer edge (groove) 5mm
  if (availW < 6) return [];
  let blockW = s.length * W + (s.length - 1) * GX;
  if (blockW > availW) {                                    // shrink uniformly to fit
    const sc = availW / blockW; W *= sc; H *= sc; T *= sc; CG *= sc; GX *= sc; blockW = availW;
    if (H < 3.5) return [];                                 // too small to engrave
  }
  const x0 = Ri + 3 + (availW - blockW) / 2;                // center the band
  // No segment overlaps another (overlap makes the extrusion cap non-manifold): horizontal bars are
  // set in by the vertical-bar width + corner gap, vertical bars set away in y from the middle/top/
  // bottom horizontal bars by the corner gap.
  const hx0 = T + CG, hx1 = W - T - CG, my = H / 2;
  const SEG: Record<string, string> = { "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg", "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg" };
  const rects: Record<string, [number, number, number, number]> = {
    a: [hx0, H - T, hx1, H], g: [hx0, my - T / 2, hx1, my + T / 2], d: [hx0, 0, hx1, T],
    f: [0, my + T / 2 + CG, T, H - T - CG], b: [W - T, my + T / 2 + CG, W, H - T - CG],
    e: [0, T + CG, T, my - T / 2 - CG], c: [W - T, T + CG, W, my - T / 2 - CG],
  };
  // earcut "bridges" holes to the outline to triangulate the cap, and the bridge degenerates into an
  // open edge if (a) a hole's horizontal edge coincides with the outline sample's (STEP=0.5mm) scan
  // line or (b) several holes share a y (the mirrored vertical bars f/b and e/c are at one height).
  // So each hole gets a **unique, off-lattice** y offset, matching neither a scan line nor another
  // hole. It is the same at both ends, so bar thickness is unchanged, and at most ~0.6mm, so the
  // digit looks no different.
  const holes: Pt2[][] = [];
  let hi = 0;
  for (let i = 0; i < s.length; i++) {
    const ox = x0 + i * (W + GX);
    for (const ch of SEG[s[i]]) {
      const [rx0, ry0, rx1, ry1] = rects[ch];
      const j = 0.13 + hi * 0.031;                     // unique, off-lattice (avoid multiples of 0.5)
      hi++;
      const ya = y0base + ry0 + j, yb = y0base + ry1 + j;
      holes.push([[ox + rx0, ya], [ox + rx1, ya], [ox + rx1, yb], [ox + rx0, yb]]);
    }
  }
  return holes;
}
// 3D rib = the 2D final shape extruded. `opts` reaches ribOutline2D untouched — today that is
// `{ smooth: true }`, the grooveless outer edge the cardboard template cuts (papercraft.ts) and the
// guide's cardboard figures draw. Omitted, the rib is the printed one, vertex for vertex.
export function ribShape(p: Design, k: number, opts: { smooth?: boolean } = {}): THREE.Shape {
  const holes = p.lighten ? lightenHoles2D(p).holes : [];
  return shapeFromPts(ribOutline2D(p, k, opts), [...holes, ...ribNumberHoles2D(p, k)]);
}
export const ribGeometry = (p: Design, k: number, opts: { smooth?: boolean } = {}): THREE.ExtrudeGeometry => {
  const g = new THREE.ExtrudeGeometry(ribShape(p, k, opts), { depth: p.boardT, bevelEnabled: false });
  g.translate(0, 0, -p.boardT / 2);
  return g;
};
