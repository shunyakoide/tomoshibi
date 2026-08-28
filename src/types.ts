/**
 * ============================================================================
 * THE SHARED TYPES — what a design IS
 * ============================================================================
 * `Design` is the object called `p` everywhere in this codebase: the single argument that almost
 * every function in geometry/ takes. Until now its shape lived in two places that could not check
 * each other — `DEFAULTS` in config.ts and the prose in CLAUDE.md — and a third, `BOUNDS` in
 * persist.ts, listed the half of it that is numeric. This file is the one place that says what the
 * fields are; `DEFAULTS` is now checked against it, so a field added to one and not the other stops
 * the build instead of arriving in `outerR` as `undefined`.
 *
 * Types only — no values, nothing at runtime. Every import of it is `import type`, erased by the
 * transpiler, so this file creates no dependency edge and cannot make a cycle. That is what lets
 * geometry/ name a design without importing config.ts, which it deliberately does not do.
 *
 * Units are mm throughout (see CLAUDE.md "Coordinate system and units").
 * ============================================================================
 */

/** A Bézier tangent handle, as a vector in (t, r) space relative to its control point. */
export type Handle = { dt: number; dr: number };

/**
 * One silhouette control point. `t` is the normalized height (0 = bottom, 1 = top), `r` the radius
 * in mm. `sharp` marks a corner; `ho`/`hi` are the optional Bézier handles toward the next/previous
 * point — **if even one point in the array has one, the whole curve switches to Bézier evaluation**
 * (see geometry/profile.ts), which is why they are optional rather than always present.
 */
export type Pt = { t: number; r: number; sharp?: boolean; ho?: Handle; hi?: Handle };

/** A point in a 2D cross-section outline: [x, y] in mm. The form every part's outline is built in. */
export type Pt2 = [number, number];

/**
 * The design. One flat object, edited by the section view and the inspector, persisted by
 * persist.ts, and handed to every geometry function.
 *
 * The two optional fields are not optional settings — they are the two ways a design reaches
 * geometry without having come from the editor:
 *   `neckOn`   — the legacy single neck flag, from designs saved before it split into
 *                neckBot/neckTop. Read only as a fallback (`p.neckBot ?? p.neckOn ?? true`).
 *   `noTabDent`— set by the papercraft, which trades the koma stop for tab strength on cardboard
 *                (CLAUDE.md "Papercraft"). Never set by the app's own state.
 */
export type Design = {
  /** Lamp-body height (mm). The silhouette's t axis spans this. */
  height: number;
  /** Fallback opening radii, used only when `pts` is empty. Not on the normal path. */
  rTop: number;
  rBot: number;
  /** The silhouette itself: control points in ascending t. */
  pts: Pt[];
  /** Neck (the vertical rectangle outside the outermost control point), chosen per end. */
  neckBot: boolean;
  neckTop: boolean;
  /** Rib count (the "N-plate mold"). */
  boards: number;
  /** Rib width (mm) before the opening clamps it — see effBoardWidth. */
  boardWidth: number;
  /** Board thickness (mm) = the tab's thickness = the koma notch's nominal width. */
  boardT: number;
  /** Bamboo rib (higo) diameter (mm). Sets the groove's width and depth. */
  higoD: number;
  /** Bamboo rib spacing (mm). Larger = fewer grooves. */
  pitch: number;
  /** Print tolerance (mm), added to the koma notch only — never to the tab. */
  fit: number;
  /** Tab length (mm) and the tab's radial depth basis (mm). */
  tabLen: number;
  tabW: number;
  /** Koma thickness (mm) = the stand's post thickness. */
  komaT: number;
  /** The rib's core radius basis (mm) — see nominalRi. */
  tabR: number;
  /** Cut the lightening windows in the rib. */
  lighten: boolean;
  /** Spiral winding: offset each rib's grooves so the bamboo forms one continuous helix. */
  spiral: boolean;
  /** Leg sockets in the bottom opening ring. A checkbox, never dimensions (CLAUDE.md). */
  legSockets: boolean;
  /** Legacy: the single neck flag that neckBot/neckTop replaced. Read as a fallback only. */
  neckOn?: boolean;
  /** Papercraft only: force a plain tab + full-depth notch (cardboard tears at the dent). */
  noTabDent?: boolean;
};

/** Which way this maker builds: 3D-printed STL parts, or a full-scale paper template. */
export type Route = "stl" | "paper";

/**
 * The keys of `Design` whose value is a number — the fields a slider can scrub and a bound can
 * clamp. `SIL_ROWS` (config) and `BOUNDS` (persist) are both keyed by it, so a numeric field added
 * to the design without a range to clamp it into stops the build rather than reaching `outerR`
 * unclamped from a corrupt file.
 */
export type NumericDesignKey = { [K in keyof Design]-?: Design[K] extends number ? K : never }[keyof Design];
