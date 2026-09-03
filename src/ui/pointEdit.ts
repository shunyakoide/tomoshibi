/**
 * THREE surfaces edit the same ◇ — `PointCard`, `PointBar` and the drag in `SectionEditor` — so the
 * clamps and the delete guard live here rather than being written three times.
 *
 * No hooks and no JSX, so a plain `.ts`: closures over the state setter, nothing more.
 */
import type React from "react";
import { bakeBezierHandles } from "../geometry.ts";
import { LIMITS, T_GAP } from "../config.ts";
import { clamp } from "../util.ts";
import type { Design, Pt } from "../types.ts";

/**
 * How far a point may travel in `t` without passing a neighbour, which keeps `pts` ascending —
 * `fukuroTangents` is promised a sorted list. The outermost points set the neck height, so they
 * reach the very end.
 */
export function tBounds(pts: Pt[], i: number): [number, number] {
  return [
    i > 0 ? pts[i - 1].t + T_GAP : 0.01,
    i < pts.length - 1 ? pts[i + 1].t - T_GAP : 0.99,
  ];
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

  const patch = (fields: Partial<Pt>) => setP((o) => {
    const pts = o.pts.map((q) => ({ ...q }));
    pts[sel!] = { ...pts[sel!], ...fields };   // only ever called while a point is selected
    return { ...o, pts };
  });

  const setHeightMm = (mm: number) => setP((o) => {
    const pts = o.pts.map((q) => ({ ...q }));
    pts[sel!] = { ...pts[sel!], t: clamp(...tBounds(pts, sel!), mm / p.height) };
    return { ...o, pts };
  });

  const del = () => {
    if (!canDelete) return;
    setP((o) => ({ ...o, pts: o.pts.filter((_, j) => j !== sel) }));
    setSel(null);
  };

  return { pt, isEnd, canDelete, patch, setHeightMm, del };
}
