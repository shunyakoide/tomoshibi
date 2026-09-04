/**
 * What a press on the drawing WRITES; what the marks look like and where they sit is the
 * component's, and the clamps are `ui/pointEdit.ts`'s, this being its third surface.
 *
 * **A factory, not a hook, and deliberately not called `useSectionDrag`.** A `use` name invites
 * `useCallback`, and a memoized handler here would close over a stale design — least of all
 * `freezeMap`, whose whole job is to capture the mapping at pointerdown rather than at mount.
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
 * handle highlight together).
 */
export type Handle = {
  key: NumericDesignKey; label: string; x: number; y: number;
  min: number; max: number; cursor: string; guide: [number, number, number, number];
  lx: number; ly: number; anchor: "end";
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
   * The screen→model mapping, frozen at the instant a drag starts, and that is a CORRECTNESS fix:
   * both halves depend on the design being dragged (`s` shrinks as `maxRadius` grows, the fitted
   * viewBox stretches as the silhouette widens), so reading it live closes a positive feedback loop
   * and the handle leaves the finger behind.
   *
   * Called INSIDE each pointerdown, never hoisted, never memoized — either way it freezes at mount.
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

  // On the WINDOW, so the pointer may leave the small hit target mid-drag — and therefore filtered
  // by `pointerId`, because a window listener hears EVERY pointer. Without the filter a second
  // finger put down anywhere on the screen dragged the ◇ the first one was holding, and a second
  // finger lifted ended the first one's drag.
  //
  // `pointercancel` fires INSTEAD of `pointerup` — an iOS edge-swipe, a touch-count overflow, the
  // browser taking the gesture away. Listening for only `pointerup` left the drag live: the move
  // listener stayed bound, `setDrag(null)` never ran, and the next unrelated pointer move anywhere
  // on the page moved that control point. `ui/sheet.ts` has always handled both; this was the outlier.
  const startDrag = (key: string, id: number, onMove: (e: PointerEvent) => void) => {
    const move = (e: PointerEvent) => { if (e.pointerId === id) onMove(e); };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    setDrag(key);
  };

  const beginDrag = (e: React.PointerEvent, cfg: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    const start = p[cfg.key];
    const f = freezeMap();
    const s0 = f.toSvg(e.clientX, e.clientY);
    startDrag(cfg.key, e.pointerId, (ev) => {
      const c = f.toSvg(ev.clientX, ev.clientY);
      const dSvg = s0.y - c.y;   // dragged up = larger, the one direction a handle here counts in
      setP((o) => ({ ...o, [cfg.key]: clamp(cfg.min, cfg.max, Math.round(start + dSvg / f.s)) }));
    });
  };

  // Selects on pointerdown whether or not the pointer then moves; corner⇄smooth and delete are
  // buttons, not click gestures, which misfired against the drag.
  const beginDragPt = (e: React.PointerEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    setSel(i);
    const start = { ...p.pts[i] };
    const sx = e.clientX, sy = e.clientY;
    const f = freezeMap();
    const s0 = f.toSvg(sx, sy);
    let moved = false;
    startDrag("pt" + i, e.pointerId, (ev) => {
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

  // The "+" ghost is the midpoint between two control points, its radius read from `outerR` so the
  // new point lands on the shape that is drawn.
  const addAtT = (mt: number) => {
    if (p.pts.length >= LIMITS.pts[1]) return;
    const r = clampR(outerR(p, mt));
    // Sorted and located BEFORE the state write: a `setP` updater must be pure — React may run it
    // twice — and calling `setSel` from inside one is a side effect however stable its value.
    const pts = [...p.pts, { t: mt, r }].sort((a, b) => a.t - b.t);
    setP((o) => ({ ...o, pts }));
    setSel(pts.findIndex((q) => q.t === mt));
  };

  // `ho` is the next-point side, `hi` the previous one. A smooth interior point mirrors the opposite
  // side; corner and end points are independent per side.
  const beginDragHandle = (e: React.PointerEvent, i: number, which: "ho" | "hi") => {
    e.preventDefault();
    e.stopPropagation();
    const f = freezeMap();
    startDrag("h" + i + which, e.pointerId, (ev) => {
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
