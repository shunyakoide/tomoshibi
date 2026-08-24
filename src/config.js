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
// replaces rTop/rBot/pts and preserves the other parameters (count, bamboo rib, etc.). A preset may
// also name a `height`, and then that is replaced too — for a shape whose identity is a ratio rather
// than an outline, keeping the height on screen hands you a different lantern (see 平丸 below).
// Only add one to a preset that needs it; the height is the maker's, not the template's.
// Preset icons are generated from the actual profile.
// The control points (pts) are the lamp-body outline. The outermost control point (pts[0]/last)
// = opening = neck radius. So no wasteful flare appears inside the neck, the opening always
// matches the outermost control point. Neck height = the t position of the outermost control point.
export const PRESETS = [
  { key: "egg", name: "たまご", rTop: 19, rBot: 74, pts: [{ t: 0.05, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.95, r: 19 }] },
  { key: "barrel", name: "たる", rTop: 52, rBot: 56, pts: [{ t: 0.05, r: 56 }, { t: 0.14, r: 82, sharp: true }, { t: 0.86, r: 78, sharp: true }, { t: 0.95, r: 52 }] },
  // Wide and low, with a small mouth on top and a big one underneath — the Akari proportion. The two
  // ends are deliberately NOT alike: the top is the mouth you look at, and the bottom is the one the
  // mold leaves by and the stand hides. With the reference photo's own mouths (⌀46 / ⌀50) the ribs
  // are 80.8mm across and cannot come out at all (`ribPullFit`); opening the BOTTOM to ⌀84 clears
  // them with 3.2mm to spare and costs nothing you can see. `komaR` follows the SMALLER mouth, so
  // the koma stays ⌀46 either way and the end you look at is untouched.
  //
  // It is also the one preset that carries a `height`, because this shape is a RATIO — widest ≈
  // 0.68 × height — where the others are outlines that hold at any size. The radii are absolute mm,
  // so handed a 205mm body it comes out ⌀208 × H205: nothing breaks (it prints, fits a 256mm bed and
  // still comes out of its own mouth) — it is simply a tall round lantern rather than this one. A
  // preset that cannot deliver its own proportion is a picture of a shape you don't get.
  { key: "hiramaru", name: "平丸", rTop: 23, rBot: 42, height: 150,
    pts: [{ t: 0.04, r: 42 }, { t: 0.30, r: 95 }, { t: 0.52, r: 102 }, { t: 0.78, r: 84 }, { t: 0.96, r: 23 }] },
];

// Initial state. The silhouette is determined by height (lamp-body height) and pts (control
// points). Neck presence is neckBot/neckTop; height and flare come from the position of the
// outermost control-point ◇. The tab (tabR/tabLen), lightening (lighten), and fit tolerance
// (fit) stay at their defaults (not exposed in the UI, used internally).
// rTop/rBot are a fallback for when pts is empty (not read on the normal path).
export const DEFAULTS = {
  height: 205, rTop: 19, rBot: 74,
  pts: [{ t: 0.05, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.95, r: 19 }],
  neckBot: true, neckTop: true, // choose neck (a vertical rectangle) presence independently top/bottom (outside the outermost control point).
  boards: 8, boardWidth: 35, boardT: 2, higoD: 2, pitch: 9, // bamboo rib spacing (larger = fewer ribs)
  fit: 0.3, tabLen: 10, tabW: 10, komaT: 8,
  tabR: 15, lighten: true,
  spiral: false, // make the bamboo-rib grooves spiral (shift each rib's grooves downward so all ribs form one continuous spiral). Default is horizontal rings.
  // Leg sockets on the BOTTOM opening ring — the finished lantern's stand, not the mold's. Present
  // or absent, nothing more: the pad and bore dimensions are constants in geometry/ring.js.
  // OFF by default: standing the finished lantern on legs is one of three ways to light it, and the
  // other two want a plain hoop. A ring printed with three pads in it is a decision made for someone
  // who has not made it yet — where the checkbox is one tick away.
  legSockets: false,
};

// How far the lamp body may be stretched, in mm — body height, and any control point's radius.
// One table, because the same two numbers are needed by the section editor's drag, the typed
// fields, the scrub row and persist's sanitize, and a design that four of them disagree about is a
// design that snaps back the moment you touch it somewhere else.
//
// **The floors are geometry, the ceilings are not.** r=10 is where the opening becomes narrower
// than the rib's own core (`innerRi`) — the tab is then wider than the mouth it has to come out
// of, and the rib closes on itself; every height from 30 to 2000mm fails at r=8 and passes at
// r=10, so it is a wall, not a preference. The ceilings are the opposite: `check:manifold` sweeps
// this whole box watertight, and they are set where no hand-drag reaches them (a festival 大提灯
// is about ⌀1m, so ⌀1.2m of headroom). They exist only so a corrupt file or a fat-fingered typed
// value cannot ask for a metre-per-mm lantern and hang the tab.
export const LIMITS = { height: [60, 2000], r: [10, 600] };

// Silhouette scrub rows (a slider plus a click-to-type value). Range, travel curve and step.
// Radius-type values are edited by directly dragging the section-view ◇ (control points), so
// they aren't held here.
export const SIL_ROWS = [
  // `curve` because the range is now 60–2000mm: linear travel would put every ordinary lantern in
  // the first sixth of the bar. See ScrubRow for the mapping.
  { key: "height", label: "火袋の高さ", min: LIMITS.height[0], max: LIMITS.height[1], curve: 2.5, round: 1, unit: "mm" },
];
