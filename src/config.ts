import type { Design, NumericDesignKey, Pt } from "./types.ts";

/**
 * A shape preset: the control points a design starts from, plus its chip's label. Deliberately NOT
 * a Design — a preset says nothing about rib count or bamboo, and picking one replaces only
 * rTop/rBot/pts (TomoshibiStudio's onPick). `height` is optional because only a preset whose
 * identity is a RATIO rather than an outline may claim it; without it the maker's height is kept.
 */
export type Preset = { key: string; name: string; rTop: number; rBot: number; pts: Pt[]; height?: number };

export const PRESETS: Preset[] = [
  { key: "egg", name: "たまご", rTop: 19, rBot: 74, pts: [{ t: 0.05, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.95, r: 19 }] },
  { key: "barrel", name: "たる", rTop: 52, rBot: 56, pts: [{ t: 0.05, r: 56 }, { t: 0.14, r: 82, sharp: true }, { t: 0.86, r: 78, sharp: true }, { t: 0.95, r: 52 }] },
  // The two mouths are deliberately NOT alike: at the reference photo's ⌀46 / ⌀50 the ribs cannot
  // come out at all (`ribPullFit`), so the BOTTOM — the one the mold leaves by and the stand hides —
  // is opened until they clear, while `komaR` follows the SMALLER mouth so the end you look at is
  // untouched. It names a `height` because this shape is a RATIO (widest ≈ 0.68 × height).
  { key: "hiramaru", name: "平丸", rTop: 23, rBot: 42, height: 150,
    pts: [{ t: 0.04, r: 42 }, { t: 0.30, r: 95 }, { t: 0.52, r: 102 }, { t: 0.78, r: 84 }, { t: 0.96, r: 23 }] },
];

// Initial state. The tab (tabR/tabLen), lightening (lighten) and fit tolerance (fit) are internal —
// no control in the UI reaches them.
export const DEFAULTS: Design = {
  height: 205, rTop: 19, rBot: 74,
  pts: [{ t: 0.05, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.95, r: 19 }],
  neckBot: true, neckTop: true,
  boards: 8, boardWidth: 35, boardT: 2, higoD: 2, pitch: 9,
  fit: 0.3, tabLen: 10, tabW: 10, komaT: 8,
  tabR: 15, lighten: true,
  spiral: false,
  // OFF: standing the lantern on legs is one of the guide's three ways to light it and the other two
  // want a plain hoop, so printing the pads would decide for someone who has not decided yet.
  legSockets: false,
};

// The one table every clamp reads — the section editor's drag, the typed fields, the scrub row and
// persist's sanitize. The floors are geometry and the ceilings are not; see docs/design-notes.md
// "How big may a design get" before moving either.
// `pts` is a COUNT, not a millimetre range like the other two: the fewest control points `outerR`
// can interpolate between (`fukuroSpline`'s div-0 guard exists because two is reachable) and the
// most the section view will add.
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

// Radii are edited by dragging the section-view ◇ instead, so they are not here.
export const SIL_ROWS: SilRow[] = [
  // `curve` because the range is 60–2000mm: linear travel puts every ordinary lantern in the first
  // sixth of the bar. See ScrubRow for the mapping.
  { key: "height", label: "火袋の高さ", min: LIMITS.height[0], max: LIMITS.height[1], curve: 2.5, round: 1, unit: "mm" },
];
