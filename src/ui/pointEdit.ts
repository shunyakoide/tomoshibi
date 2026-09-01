/**
 * ============================================================================
 * EDITING THE SELECTED CONTROL POINT — the operations, in one place
 * ============================================================================
 * Two surfaces edit the same ◇ — the inspector card (`PointCard`) and the phone's bar (`PointBar`)
 * — and these rules must not be written twice:
 *
 * - **Height is typed in mm, stored as `t`**, capped by the neighbours (±0.04) so the array stays
 *   ascending — `fukuroTangents` is promised a sorted list.
 * - **Delete only while more than two points remain** — `outerR` needs two to interpolate between,
 *   and `fukuroSpline`'s div-0 guard exists because that was once reachable.
 * - **Deleting clears the selection**, or both surfaces point at an index that is now another point.
 *
 * No hooks and no JSX, so a plain `.ts`: closures over the state setter, nothing more.
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
 * Hermite curve (shape-neutral); `outerR` then evaluates as Bézier and the angles are editable. It
 * must happen on the FIRST entry only, from whichever surface asked, so it lives here.
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
  // The first and last points ARE the opening (and the neck's radius) — docs/design-notes.md "Profile model" —
  // which is why both surfaces label them differently.
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
