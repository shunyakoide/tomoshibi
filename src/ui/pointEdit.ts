/**
 * ============================================================================
 * EDITING THE SELECTED CONTROL POINT — the operations, in one place
 * ============================================================================
 * THREE surfaces edit the same ◇ — the inspector card (`PointCard`), the phone's bar (`PointBar`)
 * and the drag on the drawing itself (`SectionEditor`) — and these rules must not be written twice:
 *
 * - **A point stays between its neighbours** (`tBounds`, ±0.04) so the array stays ascending —
 *   `fukuroTangents` is promised a sorted list. Typed in mm and stored as `t`; dragged as a
 *   displacement. Both ends of that go through the same bounds.
 * - **A radius is clamped to `LIMITS.r`** (`clampR`), wherever it is set.
 * - **Delete only while more than `LIMITS.pts[0]` points remain** — `outerR` needs two to
 *   interpolate between, and `fukuroSpline`'s div-0 guard exists because that was once reachable.
 * - **Deleting clears the selection**, or a surface points at an index that is now another point.
 *
 * The drag was the surface this file did NOT reach, and the one that runs these rules most often: it
 * carried its own copy of the ±0.04 bounds, character for character.
 *
 * No hooks and no JSX, so a plain `.ts`: closures over the state setter, nothing more.
 * ============================================================================
 */
import type React from "react";
import { bakeBezierHandles } from "../geometry.ts";
import { LIMITS } from "../config.ts";
import { clamp } from "../util.ts";
import type { Design, Pt } from "../types.ts";

// How close two control points may get, in `t`. Big enough that the spline between them stays
// well-conditioned; small enough that it is never what you notice while dragging.
const T_GAP = 0.04;

/**
 * How far a point may travel in `t` without passing a neighbour. The outermost points reach the very
 * end — they set the neck height — while an inner one stays between the two beside it.
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
