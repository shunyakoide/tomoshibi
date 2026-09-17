import type { Design, NumericDesignKey, Pt } from "./types.ts";

/**
 * A shape preset: the control points a design starts from, plus its chip's label. Deliberately NOT
 * a Design — a preset says nothing about rib count or bamboo, and picking one replaces only
 * rTop/rBot/pts (TomoshibiStudio's onPick). `height` is optional because only a preset whose
 * identity is a RATIO rather than an outline may claim it; without it the maker's height is kept.
 */
export type Preset = { key: string; name: string; rTop: number; rBot: number; pts: Pt[]; height?: number };

// Every preset's NECKS are 15.4mm at the height it is picked at (0.075 × 205, 0.10 × 150) — the old
// NECK_MIN, kept as the shape each chip has always drawn. They now sit above the 10mm floor rather
// than on it, so `neckFloor` touches them only at a height short enough to bring them under it, and
// the chip's shape is still the design it yields rather than one the floor pushed about.
// Their OPENINGS are the exception, and knowingly: `OPENING_MIN` raises `たまご`'s r19 and `平丸`'s
// r23 to 26 on every pick, so those two chips draw a wider mouth than the numbers below (see
// OPENING_MIN for why the mouth is the only lever there was) — ⌀52 where the numbers say ⌀38 and
// ⌀46. The drawing only caught up on 2026-09-17: `miniPath` was building its miniature from `pr.pts`
// raw while the pick and `matchPreset` both went through the floors, so for two of the three chips
// the picture was of a shape the app will not build. All three now read `presetPts`.
export const PRESETS: Preset[] = [
  { key: "egg", name: "たまご", rTop: 19, rBot: 74, pts: [{ t: 0.075, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.925, r: 19 }] },
  { key: "barrel", name: "たる", rTop: 52, rBot: 56, pts: [{ t: 0.075, r: 56 }, { t: 0.14, r: 82, sharp: true }, { t: 0.86, r: 78, sharp: true }, { t: 0.925, r: 52 }] },
  // The two mouths are deliberately NOT alike: at the reference photo's ⌀46 / ⌀50 the ribs cannot
  // come out at all (`ribPullFit`), so the BOTTOM — the one the mold leaves by and the stand hides —
  // is opened until they clear, while `komaR` follows the SMALLER mouth so the end you look at is
  // untouched. It names a `height` because this shape is a RATIO (widest ≈ 0.68 × height).
  { key: "hiramaru", name: "平丸", rTop: 23, rBot: 42, height: 150,
    pts: [{ t: 0.10, r: 42 }, { t: 0.30, r: 95 }, { t: 0.52, r: 102 }, { t: 0.78, r: 84 }, { t: 0.90, r: 23 }] },
];

// Initial state. The tab (tabR/tabLen), lightening (lighten) and fit tolerance (fit) are internal —
// no control in the UI reaches them. `tabLen` had a row until 2026-09-08 and the maker saw no need
// for it; persist pins it to this value, so a file cannot carry a length nothing can show or edit.
export const DEFAULTS: Design = {
  height: 205, rTop: 19, rBot: 74,
  pts: [{ t: 0.075, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.925, r: 19 }],
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
// persist's sanitize. The floors are geometry and the ceilings are not; know which is which
// before moving either. `r`'s floor moves with the groove's depth (`check:manifold`'s cylinder
// family asserts it in both directions): 10 while the cleft ran to a point, 8 with its bottom
// rounded, the wall itself at 7.
// `pts` is a COUNT, not a millimetre range like the other two: the fewest control points `outerR`
// can interpolate between (`fukuroSpline`'s div-0 guard exists because two is reachable) and the
// most the section view will add.
export const LIMITS = { height: [60, 2000], r: [8, 600], pts: [2, 8] } as const satisfies Record<string, readonly [number, number]>;

// How close two control points may get, in `t`. Big enough that the spline between them stays
// well-conditioned; small enough that it is never what you notice while dragging.
// Here rather than beside the drag it clamps because it is a LIMIT like the three above: the editor
// enforces it, persist re-enforces it on a file the editor did not write, and check:manifold sweeps
// down to it. While it lived module-private in the UI the gates could not read the floor they had to
// corner, and a silhouette packed to it opened the rib's edges with every gate reporting 0 FAIL.
export const T_GAP = 0.04;

// The least neck either end may have, in mm. The washi's end runs onto the neck (`WASHI_END`
// lands on it, to be folded over the hoop), and with the body's curve — and the first bamboo —
// right at the opening the maker found the paper hard to paste: 15 was their number (2026-09-08).
// **10 since 2026-09-11**, theirs again, from the other side of the same part: on cardboard the rib
// at the neck is a strip only as wide as the mouth leaves (13mm on the default egg), and 15mm of it
// looked like it would snap in the hand. The floor is what stopped anyone shortening it, so the
// floor moved rather than the shape — the presets still ship their own 15.4mm and nothing already
// drawn changes; it is now possible to pull the ◇ in to 10.
// A LIMIT like the two above, in millimetres because the neck is a length you handle, not a
// fraction of the body: the editor stops the ◇ there (`tBounds`), a shorter height or a picked
// preset pushes the ◇ back out to it (`neckFloor`), and persist re-applies it to a file the editor
// did not write. The ends without a neck are not touched — there the tab IS the neck.
export const NECK_MIN = 10;

// The least RADIUS an opening may have, in mm — the first and last control points only, never an
// interior one, so a waisted body can still pinch to `LIMITS.r[0]`. That floor is a geometric wall
// (below it the rib cannot close); this one is the maker's, and it exists because the opening is
// what the rib has left to be at the mouth: the koma's hub takes `innerRi` of it, and what remains
// is the strip that carries the koma and the tab cut into it. 16 keeps 10mm of board there on 2mm
// stock with 8 ribs — one flute pitch, the width under which the app already warns. It went 16 → 19
// → **26**, the last on the maker's "何度やりとりすればこの箇所を太くできますか": 16 and 19 both sat at or
// under the mouth they had actually drawn, so neither changed anything they could see. 26 (⌀52) is
// the first value that does — 20mm of board at the mouth on 2mm stock — and it is the LAST lever
// there was. Widening the mouth is the only way to widen that strip: the tab is cut from it, the hub
// takes `innerRi` of it whatever the rib count, and the koma may not stand outside the opening (that
// step was refused three times). **The cost, taken knowingly:** this rewrites two shipped presets —
// `たまご` ⌀38 → ⌀52 and `平丸` ⌀46 → ⌀52 — and a narrow-necked chōchin can no longer be drawn at all.
// Thicker stock fattens the hub and can still go under one flute; that is what the warning is for,
// and why this is a floor on the OPENING rather than a promise about the strip.
export const OPENING_MIN = 26;

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

// One place: written into two ZIPs, printed in two notes.
export const WASHI_PDF = "tomoshibi_washi_a4.pdf";

// The project's own page. In the ☰ so the app can say where it came from — a browser app with no
// install step leaves no other trail back to its source, and the licence and the issue tracker are
// both there.
export const REPO_URL = "https://github.com/shunyakoide/tomoshibi";
