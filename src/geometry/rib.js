/**
 * ============================================================================
 * RIB (HANEITA) — the radial plate that forms the mold surface
 * ============================================================================
 * The 2D outline (tabs + grooved outer edge + hollowed inner edge), the lightening windows, the
 * serial number engraved for spiral winding, and the extrusion.
 *
 * `ribOutline2D` is shared by the printed rib, the section drawing and the cardboard template, so
 * all three are the same plate. `k` is the rib index and normally changes nothing — with spiral
 * winding it shifts the grooves, which is what makes every rib a different part.
 * ============================================================================
 */
import * as THREE from "three";
import { cutYbot, cutYtop, effBoardWidth, innerRi, komaR, outerR, tabDepth, tabDented, TAB_DENT_W, TAB_DENT_H } from "./profile.js";
import { grooveDepth, grooveList, grooveOuterPts, grooveR, profileSlope } from "./groove.js";
import { shapeFromPts } from "./shape.js";

// [Rib inner-edge curve = banana (crescent) shape] To make the rib easier to pull out from the
// opening after drying, the inner edge is also curved along the outer edge, narrowing at the
// center. The outer edge (= the lamp body face) is not changed at all, so it does not propagate to
// the mold shape / tab / koma / stand (only the inner material is reduced).
//
// Definition: the inner edge basically stays a "straight core Ri." **Only near the center** an
// inward curve is added to narrow it (bending the whole rib would give the ends an unreasonable
// shape, so it is kept local).
//   ・The curve applies only inside t∈[tC-HW, tC+HW]. Outside that, bump=0 ⇒ the inner edge stays
//     strictly Ri ⇒ the end shapes / the connection to the tab (koma) do not change at all.
//   ・bump=(1-u²)² has both value and slope 0 at the ends ⇒ connects smoothly to the straight core
//     (no corner appears).
//   ・Amplitude A is "the rib depth at the center (outer − core) × RIB_CURVE_D." On the real mold
//     (reference photo) the scoop is about 20% of the depth at that position, not carved to the
//     limit. Determining it by a depth ratio keeps the same visual proportion even when the
//     profile changes.
//   ・Finally clamped to "an upper limit that does not break the band width W" ⇒ guarantees the
//     inner edge does not cross the outer edge (no self-intersection), and it automatically becomes
//     modest where the center narrows.
const RIB_MIN_BAND = 12;  // minimum band thickness (mm). Remains even after subtracting the groove depth (max higoD*1.5).
const RIB_CURVE_C = 0.5;  // curve center (t) = the rib center
const RIB_CURVE_HW = 0.3; // curve half-width (t). Applies only to the middle 60%; the top/bottom 20% each stay core.
const RIB_CURVE_D = 0.3;  // scoop amount = the center rib depth × this (the real mold is about 20%; slightly deeper, prioritizing ease of removal)
export function ribInnerX(p) {
  const h = p.height, Ri = innerRi(p);
  const W = Math.max(RIB_MIN_BAND, effBoardWidth(p)); // band width to keep
  const bump = (t) => {
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
  return (y) => {
    const t = Math.min(1, Math.max(0, y / h));
    return Math.max(Ri, Math.min(Ri + A * bump(t), outerR(p, t) - RIB_MIN_BAND));
  };
}

// ============ Pulling the ribs out ============
// Once the paste has dried the koma come off and the ribs leave through an opening, one at a time.
// A rib is fed out lengthwise, so the mouth's plane cuts ACROSS the plate: what has to pass through
// is the plate's BAND — outer edge minus hollowed inner edge — and not its distance from the axis.
// That band is exactly what the hollow inner edge exists to narrow (see ribInnerX above), and a
// deep body on a small mouth is the one shape this app will happily draw that cannot be taken
// apart again. The tabs are never the binding part: they span Ri..kR, and kR is at most the
// SMALLER opening, so they clear any mouth this band clears.
//
// The cut is a boardT-wide rectangle rather than a line, so what the plate actually gets is the
// chord at its own half-thickness, 2√(R²−(t/2)²). PULL_CLEAR is what is left over for it to turn
// in: the band is curved, so it rotates as it goes, and a rib exactly as wide as the chord binds.
const PULL_CLEAR = 2;   // mm of slack left for the plate to turn as it comes out
export function ribPullFit(p) {
  const h = p.height, innerX = ribInnerX(p);
  let band = 0;
  for (let y = 0; y <= h; y += 0.5) band = Math.max(band, outerR(p, y / h) - innerX(y));
  // Out of the WIDER of the two mouths — nothing makes a rib leave by one end rather than the other.
  const R = Math.max(outerR(p, 0), outerR(p, 1));
  const chord = 2 * Math.sqrt(Math.max(0, R * R - (p.boardT / 2) ** 2));
  return { band, chord, openR: R, ok: band + PULL_CLEAR <= chord };
}

// Returns the rib's outline point list (shared by the 2D cross-section drawing and the 3D rib
// geometry = the two always match). k = rib index. Normally all ribs have the same shape (grooves
// are horizontal rings), but with spiral winding (p.spiral), grooveList shifts the grooves by k, so
// the groove positions change per rib (= k affects the shape).
// With opts.smooth = true, returns "a smooth outer edge with no grooves carved" (for the paper
// template). Since 0.5mm-precision V notches can't be cut into cardboard, the paper template cuts
// the outer edge as a plain curve and shows the grooves as scale marks.
// opts.stop adjusts the upper tab's inner stopper (passed straight to komaStop2D). Both default to
// unspecified, so the 3D/STL-side calls do not change at all.
export function ribOutline2D(p, k = 0, opts = {}) {
  const h = p.height, tl = p.tabLen, gR = grooveR(p);
  // Bamboo rib grooves are made over the whole lamp body (between the outermost control points).
  // The curve always gets grooves, and grooves are placed at the top/bottom ends too.
  // With spiral winding, the groove positions shift by rib index k.
  const grooves = grooveList(p, gR, k);
  // Outer edge: grooves cut along the surface normal (opts.smooth = no grooves, for the paper template).
  const outerEdge = grooveOuterPts(p, opts.smooth ? [] : grooves, gR);
  const Ri = innerRi(p), STEP = 0.5, pts = []; // STEP used by the inner-edge loop below
  // Tab = a straight tongue. Match the tip exactly to the koma outer radius kR (no overhang).
  const kR = komaR(p), dent = tabDented(p); // both tips get the inner-corner dent (matched by the koma notch)
  // Bottom tab: straight tongue with the tip's inner corner dented in (an L-notch), same as the top.
  pts.push([Ri, 0]);
  if (dent) pts.push([Ri, -(tl - TAB_DENT_H)], [Ri + TAB_DENT_W, -(tl - TAB_DENT_H)], [Ri + TAB_DENT_W, -tl]);
  else pts.push([Ri, -tl]);
  pts.push([kR, -tl], [kR, 0]);
  // Outer edge from y=0 (= [outerR(p,0),0]) up to y=h (= [outerR(p,1),h]); endpoints are exact.
  for (const q of outerEdge) pts.push(q);
  // Top tab: a plain straight tongue (outer edge full kR, no stopper tooth) with the tip's inner corner
  // dented in — an L-notch cut out of the tip's inner (small-radius) corner.
  pts.push([kR, h], [kR, h + tl]);
  if (dent) pts.push([Ri + TAB_DENT_W, h + tl], [Ri + TAB_DENT_W, h + tl - TAB_DENT_H], [Ri, h + tl - TAB_DENT_H]);
  else pts.push([Ri, h + tl]);
  // Inner edge: the banana (crescent) curve from top to bottom. Both ends return to Ri, so it connects to the tabs.
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
// Solid material (mm) that must remain between a groove's notch tip and the lightening window,
// once the slope term below overtakes the flat-face band. Under ~2mm the strip prints as a tear
// line — and with the old constant band, the steepest shape the app allowed was down to 0.2mm.
const BAND_SOLID = 3;
export function lightenHoles2D(p) {
  const h = p.height, td = tabDepth(p);
  const spineW = Math.max(9, td + 3), bandW = 11, strut = 8, MIN_MAT = 12;
  const oS = (y) => outerR(p, Math.min(Math.max(y, 0), h) / h); // smooth outer edge
  // The band of solid left between the grooved edge and the window. It cannot be a constant,
  // because a groove is cut along the surface NORMAL: the notch tip lands `depth × √(1+slope²)`
  // further in **in x** than the smooth edge at the tip's own height (the normal's y-component
  // drags the tip up a face that is itself climbing in x). On a gentle face that is barely more
  // than the depth and `bandW` swallows it whole; on a steep one — a wide, low body — it is
  // several times bandW, the window's outer edge is drawn straight through the notch, and earcut
  // returns a cap with open edges. Hence the slope term, taken as the worst over ±1.5mm so the
  // 2mm chords between window samples cannot cut the corner either.
  const gDepth = grooveDepth(p);
  const reach = (y) => {
    let m = 0;
    for (let d = -1.5; d <= 1.5; d += 0.75) m = Math.max(m, Math.abs(profileSlope(p, y + d)));
    return gDepth * Math.hypot(1, m);
  };
  // `bandW` is the floor, so every design that was already clear of the notch keeps the exact
  // window it had; BAND_SOLID is the material that has to survive behind the tip once it isn't.
  const band = (y) => Math.max(bandW, reach(y) + BAND_SOLID);
  // Make the window's inner side follow the inner-edge banana curve (keeping the core spineW at a
  // constant width) → the center window also takes a shape following the scoop. Collinear points are
  // thinned by cleanPoly, so earcut does not break.
  const rIn = ribInnerX(p);
  const xi = (y) => rIn(Math.min(Math.max(y, 0), h)) + spineW;
  // Bottom: keep the neck's steep rise (flare) solid to reinforce it → do not create a thin, easily
  // broken strut.
  // Top: narrows to a point, so leave a small margin. Instead of "dropping" the window, shrink it to
  //       the range where material remains (even at the narrowing top, produce a small window to even
  //       out the lightening effect).
  const yBot = cutYbot(p) + 14, yTop = h - cutYtop(p) - 6;
  const nWin = Math.max(1, Math.round((yTop - yBot) / 46)), winH = (yTop - yBot) / nWin, holes = [];
  const thin = (y) => oS(y) - band(y) - xi(y) < MIN_MAT;
  for (let i = 0; i < nWin; i++) {
    let y0 = yBot + i * winH + strut / 2, y1 = yBot + (i + 1) * winH - strut / 2;
    // At thin-material ends (like the narrowing top), pull the window ends in short of it (shrink instead of eliminating entirely).
    while (y1 - y0 > 4 && thin(y1)) y1 -= 2;
    while (y1 - y0 > 4 && thin(y0)) y0 += 2;
    if (y1 - y0 < 14) continue;
    // With a waist (center-narrowing shape), if a thin band remains partway through the window, earcut breaks, so check the whole range.
    let ok = true;
    for (let y = y0; y <= y1; y += 2) if (thin(y)) { ok = false; break; }
    if (!ok) continue;
    // Offset the window's y-ends slightly off the outline's sample lattice (STEP=0.5mm steps). If
    // they land on exactly the same scan line, the window corner and outline vertex become collinear
    // and earcut makes a zero-area triangle, resulting in an open edge (the same known degeneracy as
    // boardGeometry's STAGGER; the offset does not affect the lightening effect).
    const ya = y0 + Y_STAGGER, yb = y1 - Y_STAGGER;
    if (yb - ya < 10) continue;
    // A closed loop tracing the outer side (inside the band) upward and returning down the inner side
    // (outside the core = the banana curve). Cut both edges with the same number of divisions and
    // match the ends exactly (no stray points at the corners).
    const ns = Math.max(2, Math.ceil((yb - ya) / 2));
    const poly = [];
    for (let i = 0; i <= ns; i++) { const y = ya + ((yb - ya) * i) / ns; poly.push([oS(y) - band(y), y]); }
    for (let i = ns; i >= 0; i--) { const y = ya + ((yb - ya) * i) / ns; poly.push([xi(y), y]); }
    holes.push(poly);
  }
  return { holes, spineW, bandW };
}

// ============ Rib ============
// [For spiral winding] Engrave a serial number (k+1) on the rib = a mark of the arrangement order
// around the circumference. In a spiral, the groove positions differ per rib, and unless they are
// arranged in the correct order the bamboo rib does not form a continuous spiral, yet the printed
// physical parts are indistinguishable. So the number is engraved on the solid band at the bottom end.
// ・Each digit cuts the lit segments of "7 segments" as **independent thin rectangular through-holes.**
//   Since there are gaps (G) between segments, even enclosing digits like 0/8 keep the center island
//   connected to the body through the corner gaps = watertight like the lightening windows (engraving
//   = holes, to avoid adding solid volume = non-manifold).
// ・Normal (non-spiral) returns an empty array ⇒ existing STL is completely unchanged (hash match).
// ・For an extremely small opening where there is no room (width), give up on the number (the mold function is unchanged).
export function ribNumberHoles2D(p, k) {
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
  // No segment overlaps another (overlap makes the extrusion cap non-manifold). Horizontal bars are
  // set inward in x by the vertical-bar width + corner gap; vertical bars are set away in y from the
  // middle/top/bottom horizontal bars by the corner gap.
  const hx0 = T + CG, hx1 = W - T - CG, my = H / 2;
  const SEG = { "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg", "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg" };
  const rects = {
    a: [hx0, H - T, hx1, H], g: [hx0, my - T / 2, hx1, my + T / 2], d: [hx0, 0, hx1, T],
    f: [0, my + T / 2 + CG, T, H - T - CG], b: [W - T, my + T / 2 + CG, W, H - T - CG],
    e: [0, T + CG, T, my - T / 2 - CG], c: [W - T, T + CG, W, my - T / 2 - CG],
  };
  // earcut "bridges" holes to the outline to triangulate the cap, but if (a) a hole's horizontal edge
  // coincides with the outline sample's (STEP=0.5mm) scan line, or (b) multiple holes share the same y
  // (the mirrored vertical bars f/b and e/c are at the same height), the bridge degenerates into an
  // open edge. So each hole is given a **unique, off-lattice** y offset (different for every hole → it
  // matches neither a scan line nor any other hole). The offset is the same at the top and bottom
  // ends, so the bar thickness is unchanged; the amount is at most about 0.6mm and the digit's
  // appearance does not change.
  const holes = [];
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
// 3D rib = extrude the 2D final shape (straight inner edge + inner tabs at the same top/bottom positions + outer-edge curve + lightening).
// `opts` reaches ribOutline2D untouched — today that is `{ smooth: true }`, the grooveless outer edge
// the cardboard template cuts (papercraft.js) and the guide's cardboard figures draw. Omitted, the
// rib is the printed one, vertex for vertex.
export function ribShape(p, k, opts = {}) {
  const holes = p.lighten ? lightenHoles2D(p).holes : [];
  return shapeFromPts(ribOutline2D(p, k, opts), [...holes, ...ribNumberHoles2D(p, k)]);
}
export const ribGeometry = (p, k, opts = {}) => {
  const g = new THREE.ExtrudeGeometry(ribShape(p, k, opts), { depth: p.boardT, bevelEnabled: false });
  g.translate(0, 0, -p.boardT / 2);
  return g;
};
