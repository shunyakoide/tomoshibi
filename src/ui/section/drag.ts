/**
 * ============================================================================
 * SECTION VIEW — the pointer gestures
 * ============================================================================
 * The four things a press on the drawing can begin: the body-height handle, a control point, the
 * `+` ghost, and a tangent handle in curve-adjust mode. What each one WRITES lives here; what the
 * marks look like and where they sit is the component's.
 *
 * **A factory, not a hook, and deliberately not called `useSectionDrag`.** It holds no state of its
 * own — the window listeners live and die inside one gesture — so it is the same shape as
 * `ui/pointEdit.ts`: closures over the state setter, rebuilt every render, nothing more. A `use`
 * name invites `useCallback`, and a memoized handler here would close over a stale design: the one
 * thing that must NOT be memoized is `freezeMap`, whose whole job is to capture the mapping at
 * pointerdown rather than at mount. A ref would hide that from `react-hooks/exhaustive-deps`, which
 * is the gate that exists for it.
 *
 * The editing rules themselves are not here either — `tBounds` and `clampR` come from
 * `ui/pointEdit.ts`, shared with the two button surfaces, because this is the third one.
 * ============================================================================
 */
import { outerR } from "../../geometry.ts";
import { LIMITS } from "../../config.ts";
import { clamp } from "../../util.ts";
import { CX, Y0 } from "./frame.ts";
import { tBounds, clampR } from "../pointEdit.ts";
import type React from "react";
import type { EditMode } from "../pointEdit.ts";
import type { Design, NumericDesignKey } from "../../types.ts";

/**
 * A draggable dimension handle. `key` names the design field it edits (so the inspector row and the
 * handle highlight together), `axis` which way the drag counts.
 */
export type Handle = {
  key: NumericDesignKey; label: string; x: number; y: number; axis: "x" | "y";
  min: number; max: number; cursor: string; guide: [number, number, number, number];
  lx: number; ly: number; anchor: "start" | "middle" | "end";
};

export type SectionDrag = {
  beginDrag: (e: React.PointerEvent, cfg: Handle) => void;
  beginDragPt: (e: React.PointerEvent, i: number) => void;
  beginDragHandle: (e: React.PointerEvent, i: number, which: "ho" | "hi") => void;
  addAtT: (mt: number) => void;
};

export function sectionDrag(ctx: {
  p: Design;
  setP: React.Dispatch<React.SetStateAction<Design>>;
  setDrag: (k: string | null) => void;
  setSel: (i: number | null) => void;
  editMode: EditMode;
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** mm → SVG units, from the frame this render was drawn with. */
  s: number;
}): SectionDrag {
  const { p, setP, setDrag, setSel, editMode, svgRef, s } = ctx;
  const H = p.height;

  /**
   * The screen→model mapping, frozen at the instant a drag starts.
   *
   * Both halves depend on the design being dragged: `s` (mm → SVG units) shrinks as `maxRadius`
   * grows, and in COMPACT mode the viewBox is fitted to the drawing, so the SVG→screen half stretches
   * as the silhouette widens. Read live on every move that closes a positive feedback loop, and
   * dragging one control point 40px took the design from ⌀192 to ⌀392, the handle leaving the finger
   * behind. Frozen, millimetres per pixel is whatever it was when you touched down. The wide path
   * barely showed this (fixed viewBox, `s` pinned at 2.0 until ~200mm radius), which is why the bug
   * arrived with the content-fitted frame.
   *
   * Called INSIDE each pointerdown, never hoisted, never memoized: hoisted it freezes at mount, and
   * the bug above comes back the other way round.
   */
  const freezeMap = () => {
    // Client coordinates → SVG user coordinates (absorbs preserveAspectRatio letterboxing)
    const el = svgRef.current;
    const m = el && el.getScreenCTM && el.getScreenCTM();
    const inv = m ? m.inverse() : null;
    const at = (clientX: number, clientY: number) => (inv
      ? { x: inv.a * clientX + inv.c * clientY + inv.e, y: inv.b * clientX + inv.d * clientY + inv.f }
      : { x: 0, y: 0 });
    return {
      s,
      toSvg: at,
      // Client coordinates → model coordinates (t, r). Used for absolute handle positioning.
      toModel: (clientX: number, clientY: number) => {
        const c = at(clientX, clientY);
        return { t: (Y0 - c.y) / (H * s), r: (c.x - CX) / s };
      },
    };
  };

  // Every gesture below (height handle, control point, tangent handle) needs the same three things:
  // listen on the WINDOW so the pointer may leave the small hit target, mark this key as the active
  // drag so the row/handle highlights, and tear both down on release.
  const startDrag = (key: string, onMove: (e: PointerEvent) => void) => {
    const up = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    setDrag(key);
  };

  // ---- The body-height handle ----
  const beginDrag = (e: React.PointerEvent, cfg: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    const start = p[cfg.key];
    const f = freezeMap();
    const s0 = f.toSvg(e.clientX, e.clientY);
    startDrag(cfg.key, (ev) => {
      const c = f.toSvg(ev.clientX, ev.clientY);
      const dSvg = cfg.axis === "y" ? s0.y - c.y : c.x - s0.x; // up/right direction is positive
      setP((o) => ({ ...o, [cfg.key]: clamp(cfg.min, cfg.max, Math.round(start + dSvg / f.s)) }));
    });
  };

  // ---- Curve control points ----
  // Select the point the moment the pointer goes down, whether or not it moves. Drag moves t/r; a
  // click only selects. Corner⇄smooth and delete are explicit buttons in the right panel — as hidden
  // click / double-click gestures they misfired with drags.
  const beginDragPt = (e: React.PointerEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    setSel(i);
    const start = { ...p.pts[i] };
    const sx = e.clientX, sy = e.clientY;
    const f = freezeMap();
    const s0 = f.toSvg(sx, sy);
    let moved = false;
    startDrag("pt" + i, (ev) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
      if (!moved) return;
      if (editMode === "curve") return;   // in curve-adjust mode the point doesn't move (only the handles do)
      const c = f.toSvg(ev.clientX, ev.clientY);
      setP((o) => {
        const pts = o.pts.map((q) => ({ ...q }));
        pts[i].r = clampR(start.r + (c.x - s0.x) / f.s);
        pts[i].t = clamp(...tBounds(pts, i), start.t + (s0.y - c.y) / (H * f.s));
        return { ...o, pts };
      });
    });
  };

  // The "+" ghost = the midpoint between adjacent control points (radius from geometry's outerR = the
  // actual shape). Click to add a point there and select it; this only adds one point to pts.
  const addAtT = (mt: number) => {
    if (p.pts.length >= LIMITS.pts[1]) return;
    const r = clampR(outerR(p, mt));
    // Sorted and located BEFORE the state write. `setSel` used to sit inside the `setP` updater,
    // which must be pure — React may run it twice, and a second surface's setter is a side effect
    // even when the value it sets is the same both times. Built from `p.pts`, which is what the
    // guard and `r` above already read, so the new array and the index it is selected by come from
    // one design rather than two.
    const pts = [...p.pts, { t: mt, r }].sort((a, b) => a.t - b.t);
    setP((o) => ({ ...o, pts }));
    setSel(pts.findIndex((q) => q.t === mt));
  };

  // Dragging a tangent handle (curve-adjust mode). which="ho" (next-point side) / "hi" (previous
  // side). Smooth points (non-sharp, interior) mirror the opposite side (hi=-ho); corner/end points
  // are independent per side.
  const beginDragHandle = (e: React.PointerEvent, i: number, which: "ho" | "hi") => {
    e.preventDefault();
    e.stopPropagation();
    const f = freezeMap();
    startDrag("h" + i + which, (ev) => {
      const m = f.toModel(ev.clientX, ev.clientY);
      setP((o) => {
        const pts = o.pts.map((q) => ({ ...q, ho: q.ho ? { ...q.ho } : undefined, hi: q.hi ? { ...q.hi } : undefined }));
        const a = pts[i], dt = m.t - a.t, dr = m.r - a.r;
        const mirror = !a.sharp && i > 0 && i < pts.length - 1;
        if (which === "ho") { a.ho = { dt, dr }; if (mirror) a.hi = { dt: -dt, dr: -dr }; }
        else { a.hi = { dt, dr }; if (mirror) a.ho = { dt: -dt, dr: -dr }; }
        return { ...o, pts };
      });
    });
  };

  return { beginDrag, beginDragPt, beginDragHandle, addAtT };
}
