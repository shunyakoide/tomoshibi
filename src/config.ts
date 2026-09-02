/**
 * ============================================================================
 * PRESETS / PARAMETER DEFINITIONS (CONFIG)
 * ============================================================================
 * The shape presets (control-point templates), `DEFAULTS`, the silhouette scrub rows and `LIMITS`.
 * The silhouette is edited by dragging control points, not with sliders, so a preset holds only the
 * initial PLACEMENT of `pts`.
 * ============================================================================
 */
import type { Design, NumericDesignKey, Pt } from "./types.ts";

/**
 * A shape preset: the control points a design starts from, plus its chip's label. Deliberately NOT
 * a Design — a preset says nothing about rib count or bamboo, and picking one replaces only
 * rTop/rBot/pts (TomoshibiStudio's onPick). `height` is optional because only a preset whose
 * identity is a RATIO rather than an outline may claim it; without it the maker's height is kept.
 */
export type Preset = { key: string; name: string; rTop: number; rBot: number; pts: Pt[]; height?: number };

// Selecting a preset replaces rTop/rBot/pts and preserves everything else; one naming a `height`
// replaces that too. The control points are the lamp-body outline, and the outermost one
// (pts[0]/last) = opening = neck radius, which keeps a flare out of the neck; neck height = its t
// position. Preset icons are generated from the actual profile.
export const PRESETS: Preset[] = [
  { key: "egg", name: "たまご", rTop: 19, rBot: 74, pts: [{ t: 0.05, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.95, r: 19 }] },
  { key: "barrel", name: "たる", rTop: 52, rBot: 56, pts: [{ t: 0.05, r: 56 }, { t: 0.14, r: 82, sharp: true }, { t: 0.86, r: 78, sharp: true }, { t: 0.95, r: 52 }] },
  // Wide and low, small mouth on top and a big one underneath — the Akari proportion. The ends are
  // deliberately NOT alike: the top is the mouth you look at, the bottom the one the mold leaves by
  // and the stand hides. At the reference photo's mouths (⌀46 / ⌀50) the 80.8mm ribs cannot come out
  // at all (`ribPullFit`); opening the BOTTOM to ⌀84 clears them by 3.2mm, and `komaR` follows the
  // SMALLER mouth so the end you look at is untouched. The one preset carrying a `height`, because
  // this shape is a RATIO (widest ≈ 0.68 × height) where the others hold at any size: the radii are
  // absolute mm, so at a 205mm body it comes out ⌀208 × H205, simply a different lantern.
  { key: "hiramaru", name: "平丸", rTop: 23, rBot: 42, height: 150,
    pts: [{ t: 0.04, r: 42 }, { t: 0.30, r: 95 }, { t: 0.52, r: 102 }, { t: 0.78, r: 84 }, { t: 0.96, r: 23 }] },
];

// Initial state. The silhouette is height (lamp-body height) plus pts; neck presence is
// neckBot/neckTop, and its height and flare come from the outermost ◇'s position. The tab
// (tabR/tabLen), lightening (lighten) and fit tolerance (fit) are internal, not exposed in the UI.
// rTop/rBot are a fallback for an empty pts (not read on the normal path).
export const DEFAULTS: Design = {
  height: 205, rTop: 19, rBot: 74,
  pts: [{ t: 0.05, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.95, r: 19 }],
  neckBot: true, neckTop: true, // choose neck (a vertical rectangle) presence independently top/bottom (outside the outermost control point).
  boards: 8, boardWidth: 35, boardT: 2, higoD: 2, pitch: 9, // bamboo rib spacing (larger = fewer ribs)
  fit: 0.3, tabLen: 10, tabW: 10, komaT: 8,
  tabR: 15, lighten: true,
  spiral: false, // make the bamboo-rib grooves spiral (shift each rib's grooves downward so all ribs form one continuous spiral). Default is horizontal rings.
  // Leg sockets on the BOTTOM opening ring — the finished lantern's stand, not the mold's. Present
  // or absent, nothing more: the pad and bore dimensions are constants in geometry/ring.ts.
  // OFF by default: standing the lantern on legs is one of three ways to light it and the other two
  // want a plain hoop, so printing the pads would decide for someone who has not decided yet.
  legSockets: false,
};

// How far the lamp body may be stretched, in mm — body height, and any control point's radius. One
// table, because the section editor's drag, the typed fields, the scrub row and persist's sanitize
// all need it, and a design four of them disagree about snaps back the moment you touch it.
//
// **The floors are geometry, the ceilings are not.** r=10 is where the opening becomes narrower
// than the rib's own core (`innerRi`), so the tab is wider than the mouth it must come out of and
// the rib closes on itself: every height from 30 to 2000mm fails at r=8 and passes at r=10, a wall
// rather than a preference. The ceilings only stop a corrupt or fat-fingered value from asking for
// a metre-per-mm lantern; `check:manifold` sweeps the whole box watertight, and a festival 大提灯 is
// about ⌀1m, so ⌀1.2m is headroom.
// `pts` is a COUNT, not a millimetre range like the other two: the fewest control points `outerR`
// can interpolate between (`fukuroSpline`'s div-0 guard exists because two was once reachable) and
// the most the section view will add. It lives here because it was a bare `8` written twice in the
// editor and a bare `2` in the point-edit rules, which is three places to disagree about one shape.
export const LIMITS = { height: [60, 2000], r: [10, 600], pts: [2, 8] } as const satisfies Record<string, readonly [number, number]>;

/**
 * A scrub row edits ONE numeric field, so its `key` is constrained to the numeric keys rather than
 * `string`: a row naming `pts` or a field that no longer exists fails here instead of silently
 * feeding `undefined` into the slider (TomoshibiStudio reads `p[r.key]`).
 */
export type SilRow = {
  key: NumericDesignKey; label: string; min: number; max: number;
  curve?: number; round: number; unit: string;
};

// Silhouette scrub rows (a slider plus a click-to-type value): range, travel curve and step. Radii
// are edited by dragging the section-view ◇ instead, so they are not here.
export const SIL_ROWS: SilRow[] = [
  // `curve` because the range is 60–2000mm: linear travel puts every ordinary lantern in the first
  // sixth of the bar. See ScrubRow for the mapping.
  { key: "height", label: "火袋の高さ", min: LIMITS.height[0], max: LIMITS.height[1], curve: 2.5, round: 1, unit: "mm" },
];
