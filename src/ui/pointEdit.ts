/**
 * ============================================================================
 * EDITING THE SELECTED CONTROL POINT — the operations, in one place
 * ============================================================================
 * Two surfaces edit the same ◇ now: the full card in the inspector (`PointCard`) and the contextual
 * bar over the sheet on a phone (`PointBar`). The rules for editing a point are not obvious enough
 * to be written twice:
 *
 * - **Height is typed in mm but stored as `t`**, and the neighbours cap it (±0.04) so the array
 *   stays in ascending order. Fork this and one surface lets you drag a point past its neighbour
 *   while the other does not, and `fukuroTangents` sees a list it was promised is sorted.
 * - **A point can only be deleted while more than two remain** — `outerR` needs two to interpolate
 *   between, and `splineR`'s div-0 guard exists because that was once reachable.
 * - **Deleting clears the selection**, or the card and the bar both keep pointing at an index that
 *   is now a different point.
 *
 * No hooks and no JSX, so this is a plain `.ts`: closures over the state setter, nothing more.
 * ============================================================================
 */
import type React from "react";
import { bakeBezierHandles } from "../geometry.ts";
import { clamp } from "../util.ts";
import type { Design, Pt } from "../types.ts";

/** Which gesture the ◇ handles perform: move the point, or pull its Bézier tangents. */
export type EditMode = "move" | "curve";

/**
 * Switch the editor's mode. Entering "curve" with no handles yet bakes them from the current
 * Hermite curve, which leaves the shape untouched; from then on `outerR` evaluates as Bézier and the
 * angles are editable. It has to happen on the FIRST entry and only then, from whichever surface
 * asked — the card in the inspector or the phone's contextual bar — so it lives here with the rest
 * of the rules rather than in either of them.
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
  // The first and last points ARE the opening (and the neck's radius) — see "Profile model" in
  // CLAUDE.md. Both surfaces label them differently for that reason.
  const isEnd = pt != null && (sel === 0 || sel === p.pts.length - 1);
  const canDelete = p.pts.length > 2;

  const patch = (fields: Partial<Pt>) => setP((o) => {
    const pts = o.pts.map((q) => ({ ...q }));
    pts[sel!] = { ...pts[sel!], ...fields };   // only ever called while a point is selected
    return { ...o, pts };
  });

  const setHeightMm = (mm: number) => setP((o) => {
    const pts = o.pts.map((q) => ({ ...q }));
    const lo = sel! > 0 ? pts[sel! - 1].t + 0.04 : 0.01;
    const hi = sel! < pts.length - 1 ? pts[sel! + 1].t - 0.04 : 0.99;
    pts[sel!] = { ...pts[sel!], t: clamp(lo, hi, mm / p.height) };
    return { ...o, pts };
  });

  const del = () => {
    if (!canDelete) return;
    setP((o) => ({ ...o, pts: o.pts.filter((_, j) => j !== sel) }));
    setSel(null);
  };

  return { pt, isEnd, canDelete, patch, setHeightMm, del };
}
