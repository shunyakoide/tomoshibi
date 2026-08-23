/**
 * ============================================================================
 * GEOMETRY — the single import point for every shape in the app
 * ============================================================================
 * Pure functions that generate the cross-section shapes and 3D geometry of the forming mold
 * ("harigata"): rib / koma (hub) / stand, plus the opening rings and the washi panel. They return
 * three.js Shape/ExtrudeGeometry but depend on neither React nor DOM, which is what lets the 2D
 * section drawing, the 3D preview, the STL export and the paper templates all be built from the
 * same functions — so what you see is what you print.
 *
 * [Coordinate system / units] All dimensions in mm. Rib/koma/stand are XY-plane shapes + Z
 *   extrusion (= laid flat, ready for printing as-is). outerR(p, t): normalized height t∈[0,1] →
 *   radius in mm (control-point spline).
 *
 * The implementation lives in `geometry/`, one module per part, and this file re-exports it. Import
 * from HERE, not from the modules: the split is an internal arrangement, and keeping one public
 * surface means moving a function between modules stays a non-event for every caller.
 *
 *   geometry/profile.js … outerR + every size derived from it (komaR, tab depth, notch bottom,
 *                         rib-count ceiling). The print-fit invariants are aggregated here.
 *   geometry/groove.js  … bamboo-rib groove positions, width, and the grooved outer edge
 *   geometry/shape.js   … point list → THREE.Shape, with the cleanup earcut requires
 *   geometry/rib.js     … the rib plate: outline, lightening, serial number, extrusion
 *   geometry/koma.js    … the hub that bundles the tabs
 *   geometry/ring.js    … the opening rings (the part that stays in the finished lantern)
 *   geometry/stand.js   … saddle posts + base plate
 *   geometry/washi.js   … the paper skin's flat pattern
 *
 * Dependencies run one way — profile ← groove ← rib, and shape is a leaf — so there are no cycles
 * to reason about. Anything mutually recursive with `outerR` belongs in profile.js by construction.
 * ============================================================================
 */

// ---- Profile and the sizes derived from it ----
export {
  bakeBezierHandles, fukuroRange, outerR, maxRadius,
  cutTbot, cutTtop, cutYbot, cutYtop, cutT,
  komaR, tabDepth, effBoardWidth, maxBoards, innerRi,
  tabDented, notchR,
} from "./geometry/profile.js";
// (TAB_DENT_W/H stay internal: rib.js imports them from profile.js directly. The public surface here
//  is deliberately the same 40 names it was before the split, so no caller can tell it happened.)

// ---- Bamboo-rib grooves ----
export { equatorY, grooveOuterPts, grooveR, grooveList, higoSpiralPath } from "./geometry/groove.js";

// ---- Parts ----
export { ribInnerX, ribOutline2D, lightenHoles2D, ribNumberHoles2D, ribShape, ribGeometry } from "./geometry/rib.js";
export { komaShape, komaGeometry } from "./geometry/koma.js";
export { openingR, ringGeometry, ringLegs, ringLegsFit } from "./geometry/ring.js";
export {
  standCollarTop, standSaddleH, standGeometry, standSlotSep, standBoardLength, boardGeometry,
} from "./geometry/stand.js";

// ---- Washi panel ----
export { WASHI_SIDE, WASHI_END, washiGore } from "./geometry/washi.js";
