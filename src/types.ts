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
 * The design — the object called `p` everywhere here. The optional fields are not settings: they are
 * the way the CARDBOARD route reaches geometry without coming from the editor. `paperP` sets every
 * one of them, and nothing else may.
 *   `noTabDent` — trades the koma stop for tab strength on cardboard.
 *   `noCrescent`— leaves the rib's inner edge straight, because board is cut by hand.
 *   `midKoma`   — a koma partway up a long cardboard mold, which needs that straight edge.
 *   `joint`     — sizes the koma/tab joint for board rather than for plastic.
 *
 * There was a second, `neckOn` — the single neck flag that neckBot/neckTop replaced, read as
 * `p.neckBot ?? p.neckOn ?? true`. That fallback could not fire: `sanitizeP` spreads `DEFAULTS`
 * before the saved fields, so `neckBot` was already `true` by the time the `??` chain ran, and a
 * legacy file's `neckOn: false` restored with its necks ON. It was removed rather than repaired —
 * nothing had read it since the split, so there was no behaviour to preserve, only a claim to drop.
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
  /** Papercraft only: force a plain tab + full-depth notch (cardboard tears at the dent). */
  noTabDent?: boolean;
  /** Papercraft only: leave the rib's inner edge straight at `innerRi` instead of hollowing the
   *  crescent. Set by `paperP`. The crescent is a shallow curve several hundred millimetres long,
   *  which a printer traces exactly and a hand with a knife does not; and it is drawn from the core
   *  radius, which the cardboard joint puts far closer to the axis, so the same 30% ratio scoops out
   *  a far deeper bite here than on the printed rib. It buys clearance at the mouth, and the app
   *  already alerts on the mouth (`ribPullFit`) for the straight edge it now gets. */
  noCrescent?: boolean;
  /** Papercraft only: size the koma joint from the WALL the material needs rather than from the
   *  opening — `wall` is the least material left between two notches, `grip` how far the tab sits
   *  inside one. Set by `paperP`. On a 3D print 1.6mm of PLA between two notches holds; the same
   *  1.6mm of board, cut across the flutes, is two liners and the air between them, and the joint
   *  is the first thing in a cardboard mold to fail. The wall is bought with the notch bottom
   *  (`innerRi`), which is why it costs the rim nothing; `grip` is a REQUEST — `komaR` stops the rim
   *  at the opening, so on a mouth too narrow for it the tab takes the whole band instead. Its
   *  presence is also what marks a design as the cardboard route's inside `geometry/`. */
  joint?: { wall: number; grip: number };
  /** Papercraft only: a koma partway up as well as the two on the ends, for a cardboard mold long
   *  enough to sag between them. Set by `paperP` from the cardboard route's own setting, never by
   *  the editor — the 3D-printed mold is a different, stiffer thing and does not take one. How many
   *  follows from the height, and a design whose ribs would then not come out through the mouth
   *  gets none (`midKomaList`). It needs the straight inner edge (`noCrescent`) to slide back out
   *  along the ribs, which on this route it always has. */
  midKoma?: boolean;
};

/** Which way this maker builds: 3D-printed STL parts, or a full-scale paper template. */
export type Route = "stl" | "paper";

/**
 * The keys of `Design` whose value is a number — what a slider can scrub and a bound can clamp.
 * `SIL_ROWS` (config) and `BOUNDS` (persist) are keyed by it, so a numeric field added without a
 * range stops the build rather than reaching `outerR` unclamped from a corrupt file.
 */
export type NumericDesignKey = { [K in keyof Design]-?: Design[K] extends number ? K : never }[keyof Design];
