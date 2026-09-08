/**
 * THREE surfaces edit the same ◇ — `PointCard`, `PointBar` and the drag in `SectionEditor` — so the
 * clamps and the delete guard live here rather than being written three times.
 *
 * No hooks and no JSX, so a plain `.ts`: closures over the state setter, nothing more.
 */
import type React from "react";
import { bakeBezierHandles } from "../geometry.ts";
import { LIMITS, T_GAP, NECK_MIN } from "../config.ts";
import { clamp } from "../util.ts";
import type { Design, Pt } from "../types.ts";

/** The neck floor as a fraction of this body's height: `NECK_MIN` is a length, `t` is not. */
const neckT = (height: number) => NECK_MIN / height;

/**
 * How far a point may travel in `t` without passing a neighbour, which keeps `pts` ascending —
 * `fukuroTangents` is promised a sorted list. The outermost points set the neck height, so they
 * reach as far as the neck floor lets them.
 */
export function tBounds(pts: Pt[], i: number, height: number): [number, number] {
  return [
    i > 0 ? pts[i - 1].t + T_GAP : neckT(height),
    i < pts.length - 1 ? pts[i + 1].t - T_GAP : 1 - neckT(height),
  ];
}

/**
 * The neck floor applied to a whole list: the ends pushed out to `NECK_MIN` and every interior point
 * they would otherwise pass carried along at `T_GAP`, so the list `tBounds` guards stays as spaced
 * as it guards it. This is what a height change and a picked preset go through — the ◇ cannot be
 * dragged under the floor, but the floor moves when the height does. Returns `pts` itself when
 * nothing moved, so an untouched design keeps its identity (and `bodyMinR` its memo). The two
 * pushes cannot meet: at LIMITS' 60mm floor they leave 0.5 between them, and eight points at
 * `T_GAP` span 0.28.
 */
export function neckFloor(pts: Pt[], height: number): Pt[] {
  const m = neckT(height), n = pts.length;
  let out = pts;
  const set = (i: number, t: number) => { if (out === pts) out = pts.map((q) => ({ ...q })); out[i].t = t; };
  for (let i = 0; i < n; i++) { const lo = m + i * T_GAP; if (out[i].t < lo) set(i, lo); else break; }
  for (let i = n - 1; i >= 0; i--) { const hi = 1 - m - (n - 1 - i) * T_GAP; if (out[i].t > hi) set(i, hi); else break; }
  return out;
}

/** A control point's radius, inside the range the app will build. */
export const clampR = (r: number) => clamp(...LIMITS.r, r);

/** Which gesture the ◇ handles perform: move the point, or pull its Bézier tangents. */
export type EditMode = "move" | "curve";

/**
 * Entering "curve" with no handles yet bakes them from the current Hermite curve (shape-neutral), so
 * `outerR` evaluates as Bézier and the angles become editable. Once only, from whichever surface asked.
 */
export function makeSetMode(
  setP: React.Dispatch<React.SetStateAction<Design>>,
  setEditMode: (m: EditMode) => void,
) {
  return (m: EditMode) => {
    setEditMode(m);
    if (m === "curve") setP((o) => (o.pts.some((q) => q.ho || q.hi) ? o : { ...o, pts: bakeBezierHandles(o.pts) }));
  };
}

export function pointOps(
  p: Design,
  setP: React.Dispatch<React.SetStateAction<Design>>,
  sel: number | null,
  setSel: (i: number | null) => void,
) {
  const pt = sel != null && p.pts?.[sel] ? p.pts[sel] : null;
  // The first and last points ARE the opening, and the neck's radius — see "Profile model".
  const isEnd = pt != null && (sel === 0 || sel === p.pts.length - 1);
  // `outerR` needs two points to interpolate between; `fukuroSpline`'s div-0 guard is there because
  // one was once reachable.
  const canDelete = p.pts.length > LIMITS.pts[0];
  // The height field's own range, in mm, so its arrows stop where the drag does.
  const hRange: [number, number] = pt ? tBounds(p.pts, sel!, p.height).map((v) => Math.round(v * p.height)) as [number, number] : [0, p.height];

  const patch = (fields: Partial<Pt>) => setP((o) => {
    const pts = o.pts.map((q) => ({ ...q }));
    pts[sel!] = { ...pts[sel!], ...fields };   // only ever called while a point is selected
    return { ...o, pts };
  });

  const setHeightMm = (mm: number) => setP((o) => {
    const pts = o.pts.map((q) => ({ ...q }));
    pts[sel!] = { ...pts[sel!], t: clamp(...tBounds(pts, sel!, o.height), mm / o.height) };
    return { ...o, pts };
  });

  const del = () => {
    if (!canDelete) return;
    setP((o) => ({ ...o, pts: o.pts.filter((_, j) => j !== sel) }));
    setSel(null);
  };

  return { pt, isEnd, canDelete, hRange, patch, setHeightMm, del };
}
