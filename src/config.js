/**
 * ============================================================================
 * PRESETS / PARAMETER DEFINITIONS (CONFIG)
 * ============================================================================
 * Collects the shape presets (control-point templates) and initial values. The silhouette
 * is edited not with sliders but by directly dragging handles / control points on the
 * section view (SectionEditor). This file holds only the initial-placement templates for pts.
 * ============================================================================
 */

// Shape preset = initial-placement template for the control points (pts). Selecting one
// replaces rTop/rBot/pts and preserves the other parameters (height, count, bamboo rib, etc.).
// Preset icons are generated from the actual profile.
// The control points (pts) are the lamp-body outline. The outermost control point (pts[0]/last)
// = opening = neck radius. So no wasteful flare appears inside the neck, the opening always
// matches the outermost control point. Neck height = the t position of the outermost control point.
export const PRESETS = [
  { key: "egg", name: "たまご", rTop: 19, rBot: 74, pts: [{ t: 0.05, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.95, r: 19 }] },
  { key: "sphere", name: "球", rTop: 26, rBot: 28, pts: [{ t: 0.05, r: 28 }, { t: 0.5, r: 90 }, { t: 0.95, r: 26 }] },
  { key: "barrel", name: "たる", rTop: 52, rBot: 56, pts: [{ t: 0.05, r: 56 }, { t: 0.14, r: 82, sharp: true }, { t: 0.86, r: 78, sharp: true }, { t: 0.95, r: 52 }] },
];

// Initial state. The silhouette is determined by height (lamp-body height) and pts (control
// points). Neck presence is neckBot/neckTop; height and flare come from the position of the
// outermost control-point ◇. The tab (tabR/tabLen), lightening (lighten), and fit tolerance
// (fit) stay at their defaults (not exposed in the UI, used internally).
// rTop/rBot are a fallback for when pts is empty (not read on the normal path).
export const DEFAULTS = {
  shape: "egg", height: 205, rTop: 19, rBot: 74,
  pts: [{ t: 0.05, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.95, r: 19 }],
  neckBot: true, neckTop: true, // choose neck (a vertical rectangle) presence independently top/bottom (outside the outermost control point).
  boards: 8, boardWidth: 35, boardT: 2, higoD: 2, pitch: 9, // bamboo rib spacing (larger = fewer ribs)
  fit: 0.3, tabLen: 10, tabW: 10, komaT: 8,
  tabR: 15, lighten: true,
  spiral: false, // make the bamboo-rib grooves spiral (shift each rib's grooves downward so all ribs form one continuous spiral). Default is horizontal rings.
};

// Silhouette scrub rows (fine-tune by dragging left/right). Value range and sensitivity.
// Radius-type values are edited by directly dragging the section-view ◇ (control points), so
// they aren't held here.
export const SIL_ROWS = [
  { key: "height", label: "火袋の高さ", min: 140, max: 400, sens: 0.5, round: 1, unit: "mm" },
];
