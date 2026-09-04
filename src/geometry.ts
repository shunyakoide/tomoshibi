/**
 * Pure functions, depending on neither React nor DOM, which is what lets the 2D section drawing, the
 * 3D preview, the STL export and the paper templates all be built from the same ones — so what you
 * see is what you print. Import from HERE and not from `geometry/`: the split into one module per
 * part is an internal arrangement, and one public surface keeps moving a function between modules a
 * non-event for every caller.
 */

// ---- Profile and the sizes derived from it ----
export {
  bakeBezierHandles, fukuroRange, outerR, maxRadius,
  cutYbot, cutYtop,
  komaR, maxBoards, innerRi,
  tabDented, notchR,
} from "./geometry/profile.ts";
// (TAB_DENT_W/H stay internal: rib.ts imports them from profile.ts directly. The surface here was
//  left exactly as it was before the split, so no caller could tell it happened — and then trimmed
//  once, of the names that split had carried out of `profile.ts` for nobody: a re-export with no
//  importer is not a stable surface, it is a claim that something out there depends on it.)

// ---- Bamboo-rib grooves ----
export { grooveOuterPts, grooveR, grooveList, higoSpiralPath } from "./geometry/groove.ts";

// ---- Parts ----
export { ribOutline2D, ribPullFit, lightenHoles2D, ribGeometry } from "./geometry/rib.ts";
export { komaShape, komaGeometry } from "./geometry/koma.ts";
export { openingR, ringGeometry, ringLegs, ringLegsFit, wireRing2D, wireRingGeometry } from "./geometry/ring.ts";
export {
  standCollarTop, standSaddleH, standGeometry, standSlotSep, standBoardLength, boardGeometry,
} from "./geometry/stand.ts";

// ---- Washi panel ----
export { WASHI_SIDE, WASHI_END, washiGore, washiSurface } from "./geometry/washi.ts";

// ---- Types ----
// `Design`/`Pt` are NOT re-exported here — a design is not a shape, it is the input every shape is
// made from, and it lives in types.ts so persist, the UI and the templates can name it without
// importing geometry at all.
export type { Mark, WashiOpts } from "./geometry/washi.ts";
