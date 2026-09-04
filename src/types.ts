/**
 * Types only, so every import of this file is erased: no dependency edge and no possible cycle,
 * which is what lets geometry/ name a design without importing config.ts. Units are mm throughout.
 */

/** A Bézier tangent handle, as a vector in (t, r) space relative to its control point. */
export type Handle = { dt: number; dr: number };

/**
 * One silhouette control point: `t` normalized height (0 = bottom, 1 = top), `r` radius in mm,
 * `sharp` a corner. `ho`/`hi` are the optional Bézier handles toward the next/previous point —
 * **one point having one switches the whole curve to Bézier evaluation** (geometry/profile.ts),
 * which is why they are optional rather than always present.
 */
export type Pt = { t: number; r: number; sharp?: boolean; ho?: Handle; hi?: Handle };

/** A point in a 2D cross-section outline: [x, y] in mm. The form every part's outline is built in. */
export type Pt2 = [number, number];

/**
 * The design — the object called `p` everywhere here. The two optional fields are not settings:
 * they are the two ways a design reaches geometry without coming from the editor.
 *   `neckOn`   — the legacy single neck flag, from designs saved before it split into
 *                neckBot/neckTop. Read only as a fallback (`p.neckBot ?? p.neckOn ?? true`).
 *   `noTabDent`— set by the papercraft, which trades the koma stop for tab strength on cardboard
 *                Never set by the app's own state.
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
  /** Leg sockets in the bottom opening ring. A checkbox, never dimensions. */
  legSockets: boolean;
  /** Legacy: the single neck flag that neckBot/neckTop replaced. Read as a fallback only. */
  neckOn?: boolean;
  /** Papercraft only: force a plain tab + full-depth notch (cardboard tears at the dent). */
  noTabDent?: boolean;
};

/** Which way this maker builds: 3D-printed STL parts, or a full-scale paper template. */
export type Route = "stl" | "paper";

/**
 * The keys of `Design` whose value is a number — what a slider can scrub and a bound can clamp.
 * `SIL_ROWS` (config) and `BOUNDS` (persist) are keyed by it, so a numeric field added without a
 * range stops the build rather than reaching `outerR` unclamped from a corrupt file.
 */
export type NumericDesignKey = { [K in keyof Design]-?: Design[K] extends number ? K : never }[keyof Design];
