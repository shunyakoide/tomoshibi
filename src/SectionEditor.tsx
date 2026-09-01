/**
 * ============================================================================
 * SECTION EDITOR — direct manipulation
 * ============================================================================
 * An SVG editor for the lamp body silhouette, edited on the drawing instead of with sliders:
 *   - Lamp body height … drag the top vertex circle vertically
 *   - Neck (opening) … drag the outermost ◇ (horizontal = flare / vertical = neck height),
 *                      independent top/bottom
 *   - Bulge … drag a curve ◇ in both axes; tap a `+` ghost to add a point there and select it
 *
 * Corner ⇄ smooth and delete are NOT gestures on the drawing: they are explicit buttons in the
 * inspector (`ui/PointCard.tsx`) and, on a phone, in the contextual bar (`ui/PointBar.tsx`), because
 * as hidden click / double-click gestures they misfired with drags. Nothing here writes `sharp`.
 *
 * Neck = the vertical rectangle at each end (per `neckBot`/`neckTop`); the curve starts just inside
 * it. The radius function is geometry.ts's own `outerR`, so this matches the 3D and the STL exactly.
 * Client → SVG coordinates go through `getScreenCTM`, so positions and drag amounts stay accurate
 * under letterboxing (`preserveAspectRatio`).
 * ============================================================================
 */
import React, { useEffect, useRef, useState } from "react";
import { outerR, cutYbot, cutYtop, fukuroRange, grooveR, grooveList, grooveOuterPts, komaR, innerRi, maxRadius, ribOutline2D, lightenHoles2D } from "./geometry.ts";
import { LIMITS } from "./config.ts";
import { clamp } from "./util.ts";
import { FS } from "./ui/theme.ts";
import type { EditMode } from "./ui/pointEdit.ts";
import type { T } from "./i18n.ts";
import type { Design, NumericDesignKey, Pt2 } from "./types.ts";

/**
 * A draggable dimension handle. `key` names the design field it edits (so the inspector row and the
 * handle highlight together), `axis` which way the drag counts.
 */
type Handle = {
  key: NumericDesignKey; label: string; x: number; y: number; axis: "x" | "y";
  min: number; max: number; cursor: string; guide: [number, number, number, number];
  lx: number; ly: number; anchor: "start" | "middle" | "end";
};

// SVG logical coordinates. Centre axis cx, baseline y0. CX/Y0 are fixed — every X()/Y() below is
// written in terms of them — but the FRAME around them is not (see `viewBox`).
const VBW = 860, VBH = 780, CX = 430, Y0 = 710;

// ---- Compact (phone) mode --------------------------------------------------------------------
// The fixed 860×780 frame is more than twice the width the drawing uses, so on a 375px viewport the
// whole thing rendered at 0.44× and every ◇ hit target came out ELEVEN pixels across, against the
// 44px both platform guidelines ask for.
//
// `compact` changes two things and nothing else about the shape:
//   1. the viewBox is fitted to the CONTENT instead of the fixed frame — a no-op on a wide screen
//      (the drawing is height-bound there) and roughly double on a phone;
//   2. the hit circles are sized from the MEASURED on-screen scale rather than as SVG-unit constants,
//      so a target stays a target however far the drawing has been scaled down.
// Everything the app PRINTS is untouched: this file draws, it does not generate geometry.
const HIT_PT = 30;      // control point / height handle / tangent grab — CSS px, diameter
const HIT_ADD = 20;     // the "+" ghost: a secondary action, and it sits at the MIDPOINT between two
                        // points, so it can never be given the same target without swallowing them
// The MARKS, in CSS px across — the same treatment as the hit circles above. A glyph written as a
// constant in SVG units renders smaller the further the drawing is scaled down (11 units is 11.6px on
// a 1440px desktop and 8.6px on a phone), so the touch surface grew while the thing you aim at shrank
// — and the legend **redraws these marks at legend size**, so a canvas mark half the size of its own
// legend entry reads as a broken UI rather than a small one.
const GLYPH_PT = 16;    // the control point ◇ / □
const GLYPH_H = 15;     // the body-height handle ●
const GLYPH_ADD = 22;   // the "+" ghost
const GLYPH_TAN = 13;   // a tangent handle, in curve-adjust mode
// Room kept around the content when the frame is fitted to it (SVG units). The right side is wider
// because that is where every point's "84 mm" label goes — reserved unconditionally, so the drawing
// does not jump sideways when a label appears or a mark grows. It covers the label's width plus the
// gap the mark pushes it out by (`rPt + 9.5`), larger on a phone where marks are a constant CSS size.
const FIT_PAD = { l: 26, r: 78, t: 22, b: 22 };

const C = {
  axis: "#b8a888", outline: "#c4b492", higo: "#c9b593", spine: "#d8c7a3",
  label: "#8a7c66", value: "#3b342b", faint: "#c0b298", handleFill: "#fffdf8",
  neck: "#d9ccb0", bound: "#5aa774", // neck band / lamp body boundary dashes (green = neck/lamp-body seam)
  board: "#caa96f", boardLine: "#9e7f4a", // rib (actual cross-section overlaid on one side)
};

export default function SectionEditor({
  p, setP, accent, drag, setDrag, sel = null, setSel = () => {}, editMode = "move", compact = false, t = (s) => s,
}: {
  p: Design;
  setP: React.Dispatch<React.SetStateAction<Design>>;
  accent: string;
  drag: string | null;
  setDrag: (k: string | null) => void;
  sel?: number | null;
  setSel?: (i: number | null) => void;
  editMode?: EditMode;
  /** Phone-sized frame: fit the viewBox to the drawing and size the hit targets for a finger. */
  compact?: boolean;
  t?: T;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // The pane's size in CSS px. Needed only in compact mode, but measured unconditionally: a hook
  // cannot be conditional, and one ResizeObserver costs nothing.
  const [pane, setPane] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Seed from a layout read rather than the observer's first callback: a ResizeObserver only
    // delivers for an element the browser is actually laying out, so a hidden, throttled or
    // off-screen-captured tab leaves it silent — and the `pane.w === 0` fallback is scale 1, which
    // hands a phone the small hit targets this path exists to remove.
    const read = () => {
      const r = el.getBoundingClientRect();
      setPane((q) => (q.w === r.width && q.h === r.height ? q : { w: r.width, h: r.height }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = p.height;
  // mm → SVG units. Fit BOTH axes: height alone set the scale while the radius was capped at 130mm,
  // but a wide, low body now runs off the sides, taking the ◇ you are dragging with it. 520/H and 2.0
  // are unchanged, so nothing that fitted before is redrawn at a different size; the width term only
  // ever makes it smaller.
  const s = Math.min(2.0, 520 / H, (CX - 30) / Math.max(maxRadius(p), 1));
  const neckB = cutYbot(p), neckT = cutYtop(p); // bottom/top neck height (mm, independent)
  const tnB = neckB / H, tnT = neckT / H;
  const topY = Y0 - H * s;
  const X = (r: number) => CX + r * s;
  const Xm = (r: number) => CX - r * s;
  const Y = (t: number) => Y0 - t * H * s;

  // Client coordinates → SVG user coordinates (absorbs preserveAspectRatio letterboxing)
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
   */
  const freezeMap = () => {
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

  // ---- Silhouette sampling (groove serrations at their actual depth; matches geometry) ----
  const fr = fukuroRange(p);                 // t range of the lamp body = between the outermost control points
  const gR = grooveR(p);                     // groove half-width. Shared with geometry, so drawn groove = printed groove
  const gs = grooveList(p, gR);              // groove positions (mm)
  const op = grooveOuterPts(p, gs, gR);      // outer edge with normal-cut groove notches (matches the STL)
  const kR = komaR(p), Ri = innerRi(p);      // koma outer radius / core (inner end of the tab)
  // Right side up, then the mirrored left side down (the same points, so the two sides match)
  let d = `M ${X(op[0][0]).toFixed(1)} ${Y(op[0][1] / H).toFixed(1)}`;
  for (let i = 1; i < op.length; i++) d += ` L ${X(op[i][0]).toFixed(1)} ${Y(op[i][1] / H).toFixed(1)}`;
  for (let i = op.length - 1; i >= 0; i--) d += ` L ${Xm(op[i][0]).toFixed(1)} ${Y(op[i][1] / H).toFixed(1)}`;
  d += " Z";

  // Bamboo ribs (higo) (groove center lines; same positions as the groove notches)
  let higo = "";
  for (const mm of gs) {
    const t = mm / H, r = outerR(p, t);
    higo += `M ${Xm(r).toFixed(1)} ${Y(t).toFixed(1)} L ${X(r).toFixed(1)} ${Y(t).toFixed(1)} `;
  }
  // Bands for color-coding the regions (neck / lamp body), clipped to the silhouette
  const bands: { t0: number; t1: number; fill: string; op?: number }[] = [
    { t0: 0, t1: fr.lo, fill: C.neck },       // bottom neck
    { t0: fr.lo, t1: fr.hi, fill: accent, op: 0.12 }, // lamp body
    { t0: fr.hi, t1: 1, fill: C.neck },       // top neck
  ].filter((b) => b.t1 - b.t0 > 0.001);
  const maxR = Math.max(...op.map((q) => q[0])) + 4;

  // Actual rib cross-section (overlaid on the right side): tab tongue + core (Ri) + grooved outer
  // edge + lightening windows — the exact printed part. Coordinates are (x = radius mm, y = height mm).
  const Ymm = (y: number) => Y0 - y * s;
  const poly2d = (pl: Pt2[]) => "M " + pl.map(([px, py], i) => `${i ? "L " : ""}${X(px).toFixed(1)} ${Ymm(py).toFixed(1)}`).join(" ") + " Z";
  let ribD = poly2d(ribOutline2D(p));
  for (const hole of lightenHoles2D(p).holes) ribD += " " + poly2d(hole); // punch out the windows via evenodd

  // ---- Handles (lamp body height / top radius / bottom radius) ----
  // Every drag gesture below (height handle, control point, tangent handle) needs the same three
  // things: listen on the WINDOW so the pointer may leave the small hit target, mark this key as the
  // active drag so the row/handle highlights, and tear both down on release.
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

  const handles: Handle[] = [
    { key: "height", label: "火袋の高さ", x: CX, y: topY, axis: "y", min: LIMITS.height[0], max: LIMITS.height[1],
      cursor: "ns-resize", guide: [CX - 60, topY, CX + 60, topY],
      lx: CX - 22, ly: topY - 8, anchor: "end" },
    // The opening (= neck) radius IS the outermost control point — no separate handle, drag the ◇.
  ];

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
        // The outermost points reach the very end (they set the neck height); inner ones stay between their neighbours.
        const lo = i > 0 ? pts[i - 1].t + 0.04 : 0.01;
        const hi = i < pts.length - 1 ? pts[i + 1].t - 0.04 : 0.99;
        pts[i].r = clamp(...LIMITS.r, start.r + (c.x - s0.x) / f.s);
        pts[i].t = clamp(lo, hi, start.t + (s0.y - c.y) / (H * f.s));
        return { ...o, pts };
      });
    });
  };

  // The "+" ghost = the midpoint between adjacent control points (radius from geometry's outerR = the
  // actual shape). Click to add a point there and select it; this only adds one point to pts.
  const addAtT = (mt: number) => {
    if (p.pts.length >= 8) return;
    const r = clamp(...LIMITS.r, outerR(p, mt));
    setP((o) => {
      const pts = [...o.pts, { t: mt, r }].sort((a, b) => a.t - b.t);
      const idx = pts.findIndex((q) => q.t === mt);
      setSel(idx);
      return { ...o, pts };
    });
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

  const cps = p.pts.map((pt, i) => {
    return { i, pt, x: X(pt.r), y: Y(pt.t), active: drag === "pt" + i, selected: sel === i, end: i === 0 || i === p.pts.length - 1 };
  });

  // Tangent handles for the selected point (curve mode only). ho = next side / hi = previous side.
  const selPt = sel != null ? p.pts[sel] : null;
  const showHandles = editMode === "curve" && selPt;
  const handleDots: { which: "ho" | "hi"; ax: number; ay: number; hx: number; hy: number }[] = [];
  if (showHandles) {
    const add = (which: "ho" | "hi", h: { dt: number; dr: number } | undefined) => {
      if (!h) return;
      handleDots.push({ which, ax: X(selPt!.r), ay: Y(selPt!.t), hx: X(selPt!.r + h.dr), hy: Y(selPt!.t + h.dt) });
    };
    if (sel! < p.pts.length - 1) add("ho", selPt.ho);
    if (sel! > 0) add("hi", selPt.hi);
  }

  // Add-point ghost (+), capped at 8 points. Hidden in curve-adjust mode so focus stays on the
  // handles.
  const ghosts = (editMode === "curve" || p.pts.length >= 8) ? [] : p.pts.slice(0, -1).map((pt, i) => {
    const mt = (pt.t + p.pts[i + 1].t) / 2;
    return { mt, x: X(outerR(p, mt)), y: Y(mt) };
  });

  const spineY = Math.min(Y(tnB), Y(1 - tnT));
  const spineH = Math.abs(Y(tnB) - Y(1 - tnT));

  // ---- Frame and hit sizing ----------------------------------------------------------------
  // The content's own extent, in SVG units. Every term is something actually drawn below, so a mark
  // that moves takes the frame with it: the silhouette (maxR), the rib's tabs (which stick out past
  // the body at both ends), and the axis stub. The padding is this small because compact drops the
  // region labels (see below); with them the drawing would be squeezed down by its own annotations.
  const cx0 = Math.min(Xm(maxR), CX - 60) - FIT_PAD.l;
  const cx1 = Math.max(X(maxR), X(kR)) + FIT_PAD.r;
  const cy0 = Math.min(topY - 34, Ymm(H + p.tabLen)) - FIT_PAD.t;
  const cy1 = Math.max(Y0 + 34, Ymm(-p.tabLen)) + FIT_PAD.b;
  // CSS px per SVG unit, as the browser will render it (preserveAspectRatio="meet" = the smaller of
  // the two fits). Falls back to the wide-frame value before the first measurement.
  const fitW = compact ? cx1 - cx0 : VBW, fitH = compact ? cy1 - cy0 : VBH;
  const k = pane.w > 0 ? Math.min(pane.w / fitW, pane.h / fitH) : 1;
  // Widen the fitted box to the pane's aspect so the drawing is centred rather than left-aligned in
  // whichever axis has slack. preserveAspectRatio would centre it anyway; doing it here keeps the
  // coordinates honest for anything that reads the viewBox.
  const vbW = k > 0 && pane.w > 0 ? pane.w / k : fitW;
  const vbH = k > 0 && pane.h > 0 ? pane.h / k : fitH;
  const viewBox = compact
    ? `${((cx0 + cx1) / 2 - vbW / 2).toFixed(1)} ${((cy0 + cy1) / 2 - vbH / 2).toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`
    : `0 0 ${VBW} ${VBH}`;
  // A hit radius in SVG units landing on the wanted size in CSS px. The floors are the old constants,
  // so a wide screen keeps exactly the targets it had.
  const hitPt = compact ? Math.max(13, HIT_PT / 2 / k) : 13;
  const hitAdd = compact ? Math.max(11, HIT_ADD / 2 / k) : 11;
  // Mark radii in SVG units landing on the wanted CSS px. Floored at the wide constants, so the wide
  // path draws exactly what it always drew. `markStroke` scales the outline with them — a 2-unit
  // stroke on a 16px mark is the weight the 2 was on an 11px one.
  const u = (px: number, floor: number) => (compact ? Math.max(floor, px / 2 / k) : floor);
  const rPt = u(GLYPH_PT, 5.5);          // half-side of the control-point square
  const rRing = u(GLYPH_PT + 10, 13);    // the selection ring around it
  const rH = u(GLYPH_H, 6.5);            // body-height handle
  const rAdd = u(GLYPH_ADD, 11);         // "+" ghost
  const rTan = u(GLYPH_TAN, 5.5);        // tangent handle
  const markStroke = (2 * rPt / 5.5).toFixed(2);   // stroke weight, in step with the marks
  // Compact hides the NAMES, never the NUMBERS. Out go the region labels (首/火袋/首 — the colour
  // bands already say it), the 羽根板 caption, the 開口/首 tag and the 火袋の高さ caption; the region
  // ones also hang off the LEFT of the widest part of the body, which `cx0` reserves nothing for, so
  // they would be clipped as well as costly. The mm readouts stay — they answer "how big is this" —
  // and cost the frame **nothing**, riding inside `FIT_PAD.r`'s one-label reservation.
  const showLabels = !compact;
  // At the sheet's tallest stop the drawing is a 140px sliver and a 34px pill is a fifth of it,
  // parked on the very drawing it explains, for someone plainly working in the panel. Below this
  // threshold the drawing is context, not a work surface, so the legend steps out of the way.
  const showLegend = !compact || pane.h === 0 || pane.h >= 220;

  return (
    <div ref={wrapRef} onPointerDown={() => setSel(null)} style={{
      position: "absolute", inset: 0, overflow: "hidden",
      background: "radial-gradient(ellipse at 45% 40%, #f7f2e6 0%, #efe7d6 60%, #e9dfc9 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}>
        <defs>
          <linearGradient id="washiGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#efe4cb" />
            <stop offset="0.5" stopColor="#f6efdd" />
            <stop offset="1" stopColor="#e7d9ba" />
          </linearGradient>
        </defs>

        {/* Center axis */}
        <line x1={CX} x2={CX} y1={(topY - 34).toFixed(1)} y2={(Y0 + 34).toFixed(1)}
          stroke={C.axis} strokeWidth="1" strokeDasharray="2 6" />

        <defs>
          <clipPath id="silClip"><path d={d} /></clipPath>
        </defs>

        {/* Lamp body silhouette. Clicks defer to the outer container, which clears the selection */}
        <path d={d} fill="url(#washiGrad)" stroke={C.outline} strokeWidth="1.5" style={{ cursor: "default" }} />

        {/* Region color-coding (neck = ecru / lamp body = accent). Clipped to the silhouette */}
        <g clipPath="url(#silClip)" style={{ pointerEvents: "none" }}>
          {bands.map((b, i) => (
            <rect key={i} x={(CX - maxR * s).toFixed(1)} width={(maxR * 2 * s).toFixed(1)}
              y={Y(b.t1).toFixed(1)} height={((b.t1 - b.t0) * H * s).toFixed(1)}
              fill={b.fill} opacity={b.op ?? 0.3} />
          ))}
        </g>

        {/* Rib (right side = the actual printed cross-section) */}
        <path d={ribD} fillRule="evenodd" fill={C.board} fillOpacity="0.42" stroke={C.boardLine}
          strokeWidth="1.2" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
        {showLabels && <text x={(X(kR) + 9).toFixed(1)} y={(Ymm(H + p.tabLen) + 3).toFixed(1)}
          fontFamily="'IBM Plex Sans JP',sans-serif" fontSize={FS.sm} fontWeight="600"
          fill={C.boardLine} style={{ pointerEvents: "none" }}>{t("羽根板")}</text>}

        {/* Neck ↔ lamp body boundary (= the outermost control point's height). Beyond it, straight neck */}
        {[fr.lo, fr.hi].map((ty, i) => (ty > 0.001 && ty < 0.999) && (
          <line key={i} x1={Xm(maxR).toFixed(1)} x2={X(maxR).toFixed(1)} y1={Y(ty).toFixed(1)} y2={Y(ty).toFixed(1)}
            stroke={C.bound} strokeWidth="1" strokeDasharray="4 4" opacity="0.7" style={{ pointerEvents: "none" }} />
        ))}

        {/* Region labels (neck / lamp body / neck). On the left, clear of the ◇ value labels. Dropped
            in compact, where they would set the frame's width; the colour bands stay. */}
        {showLabels && <g style={{ pointerEvents: "none" }} fontFamily="'IBM Plex Sans JP',sans-serif" fontSize={FS.base} textAnchor="end">
          {fr.lo > 0.03 && <text x={Xm(maxR + 6).toFixed(1)} y={(Y(fr.lo / 2) + 4).toFixed(1)} fill={C.label} fontWeight="600">{t("首")}</text>}
          <text x={Xm(maxR + 6).toFixed(1)} y={(Y((fr.lo + fr.hi) / 2) + 4).toFixed(1)} fill={accent} fontWeight="700">{t("火袋")}</text>
          {fr.hi < 0.97 && <text x={Xm(maxR + 6).toFixed(1)} y={(Y((fr.hi + 1) / 2) + 4).toFixed(1)} fill={C.label} fontWeight="600">{t("首")}</text>}
        </g>}

        {/* Bamboo ribs (higo) */}
        {higo && <path d={higo} stroke={C.higo} strokeWidth="1" fill="none" style={{ pointerEvents: "none" }} />}

        {/* Rib core (center band) */}
        <rect x={CX - 7} width="14" y={spineY.toFixed(1)} height={spineH.toFixed(1)} fill={C.spine} opacity="0.55" />

        {/* Koma (top and bottom hubs) */}
        <rect x={CX - 13} width="26" height="14" rx="3" y={(topY - 7).toFixed(1)} fill={accent} opacity="0.92" />
        <rect x={CX - 13} width="26" height="14" rx="3" y={(Y0 - 7).toFixed(1)} fill={accent} opacity="0.92" />

        {/* Handles */}
        {handles.map((h) => {
          const active = drag === h.key;
          return (
            <g key={h.key} onPointerDown={(e) => beginDrag(e, h)} style={{ cursor: h.cursor }}>
              <line x1={h.guide[0].toFixed(1)} y1={h.guide[1].toFixed(1)} x2={h.guide[2].toFixed(1)} y2={h.guide[3].toFixed(1)}
                stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity={active ? 0.8 : 0} />
              <circle cx={h.x.toFixed(1)} cy={h.y.toFixed(1)} r={Math.max(14, hitPt).toFixed(1)} fill="transparent" />
              <circle cx={h.x.toFixed(1)} cy={h.y.toFixed(1)} r={rH.toFixed(1)} fill={active ? accent : C.handleFill} stroke={accent} strokeWidth={markStroke} />
              {showLabels && <text x={h.lx.toFixed(1)} y={(h.ly - 6).toFixed(1)} textAnchor={h.anchor}
                fontFamily="'IBM Plex Sans JP',sans-serif" fontSize={FS.base} fill={C.label}>{t(h.label)}</text>}
              {/* Never dropped: on a phone it answers "how tall is this" and is the drag's only
                  feedback, the inspector that would otherwise show it being behind the sheet. */}
              {<text x={h.lx.toFixed(1)} y={(h.ly + 10).toFixed(1)} textAnchor={h.anchor}
                fontFamily="'IBM Plex Mono',monospace" fontSize={FS.md} fontWeight="600" fill={active ? accent : C.value}>{p[h.key]} mm</text>}
            </g>
          );
        })}

        {/* Add-point ghost (+), at the midpoint. Click to add a point there and select it */}
        {ghosts.map((g, i) => (
          <g key={"gh" + i} onPointerDown={(e) => { e.stopPropagation(); addAtT(g.mt); }} style={{ cursor: "copy" }}>
            {/* Separate hit and glyph circles: the "+" cannot be drawn any larger without touching
                the two points it sits between, but its TARGET can be. */}
            <circle cx={g.x.toFixed(1)} cy={g.y.toFixed(1)} r={hitAdd.toFixed(1)} fill="transparent" />
            <circle cx={g.x.toFixed(1)} cy={g.y.toFixed(1)} r={rAdd.toFixed(1)} fill={C.handleFill} fillOpacity="0.85"
              stroke={C.bound} strokeWidth={(1.3 * rAdd / 11).toFixed(2)} strokeDasharray="2.5 2.5" />
            <path d={`M ${(g.x - rAdd * 4 / 11).toFixed(1)} ${g.y.toFixed(1)} H ${(g.x + rAdd * 4 / 11).toFixed(1)} M ${g.x.toFixed(1)} ${(g.y - rAdd * 4 / 11).toFixed(1)} V ${(g.y + rAdd * 4 / 11).toFixed(1)}`}
              stroke={C.bound} strokeWidth="1.6" style={{ pointerEvents: "none" }} />
          </g>
        ))}

        {/* Control points (◇ = smooth / ■ = corner). The ends are the opening = neck (horizontal =
            flare / vertical = neck height) */}
        {cps.map((c) => (
          <g key={c.i} onPointerDown={(e) => beginDragPt(e, c.i)} style={{ cursor: "move" }}>
            {c.selected && (
              <circle cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r={rRing.toFixed(1)} fill="none"
                stroke={C.bound} strokeWidth={(1.6 * rPt / 5.5).toFixed(2)} strokeDasharray="3 3" style={{ pointerEvents: "none" }} />
            )}
            <circle cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r={hitPt.toFixed(1)} fill="transparent" />
            <rect x={(c.x - rPt).toFixed(1)} y={(c.y - rPt).toFixed(1)} width={(rPt * 2).toFixed(1)} height={(rPt * 2).toFixed(1)}
              rx={(2.5 * rPt / 5.5).toFixed(1)}
              transform={c.pt.sharp ? undefined : `rotate(45 ${c.x.toFixed(1)} ${c.y.toFixed(1)})`}
              fill={c.active || c.selected || c.end ? accent : C.handleFill} stroke={accent} strokeWidth={markStroke} />
            {c.end && showLabels && (
              <text x={(c.x + rPt + 9.5).toFixed(1)} y={(c.y - 8).toFixed(1)}
                fontFamily="'IBM Plex Sans JP',sans-serif" fontSize={FS.xs} fontWeight="600" fill={accent}>{t("開口/首")}</text>
            )}
            {/* Every point's radius, on both layouts: the sizes the section view is for, riding
                inside `FIT_PAD.r`'s reservation, so showing all of them costs no scale. */}
            {<text x={(c.x + rPt + 9.5).toFixed(1)} y={(c.y + 4).toFixed(1)}
              fontFamily="'IBM Plex Mono',monospace" fontSize={FS.base} fontWeight="600"
              fill={c.active ? accent : C.label}>{Math.round(c.pt.r)} mm</text>}
          </g>
        ))}

        {/* Tangent handles (curve-adjust mode, selected point only). Drag the green line + circle to
            adjust the curve's angle/tension */}
        {handleDots.map((h, i) => (
          <g key={"h" + i}>
            <line x1={h.ax.toFixed(1)} y1={h.ay.toFixed(1)} x2={h.hx.toFixed(1)} y2={h.hy.toFixed(1)}
              stroke={C.bound} strokeWidth="1.4" style={{ pointerEvents: "none" }} />
            <circle cx={h.hx.toFixed(1)} cy={h.hy.toFixed(1)} r={hitPt.toFixed(1)} fill="transparent"
              onPointerDown={(e) => beginDragHandle(e, sel!, h.which)} style={{ cursor: "move" }} />
            <circle cx={h.hx.toFixed(1)} cy={h.hy.toFixed(1)} r={rTan.toFixed(1)} fill="#eef7f0" stroke={C.bound}
              strokeWidth={(2 * rTan / 5.5).toFixed(2)} style={{ pointerEvents: "none" }} />
          </g>
        ))}
      </svg>

      {/* Operation legend. The ◇ handles are the least discoverable part of the app, so the marks are
          redrawn here in the same colours/shapes as on the canvas rather than described in words, and
          the content follows editMode: in curve-adjust mode the + ghosts are hidden and the point
          itself doesn't move, which reads as a bug unless it is said out loud.
          Top-right rather than bottom-left, where a wide, low body fills the frame and the legend
          covered the drawing it explains. Here it is clear of the section (which grows from the axis
          at the left), tucked under the dimension chip, level with the route chip. */}
      {showLegend && <Legend accent={accent} editMode={editMode} compact={compact} t={t} />}
    </div>
  );
}

// One canvas mark at legend size (18×18 box, centred on 9,9).
function Glyph({ kind, accent }: { kind: GlyphKind; accent: string }) {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" style={{ display: "block", flex: "none" }}>
      {kind === "pt" && ( // control point ◇
        <rect x="4" y="4" width="10" height="10" rx="2" transform="rotate(45 9 9)"
          fill={accent} stroke={accent} strokeWidth="2" />
      )}
      {kind === "sel" && ( // control point ◇ with the selection ring
        <>
          <circle cx="9" cy="9" r="8" fill="none" stroke={C.bound} strokeWidth="1.3" strokeDasharray="3 3" />
          <rect x="5.5" y="5.5" width="7" height="7" rx="1.5" transform="rotate(45 9 9)"
            fill={accent} stroke={accent} strokeWidth="1.6" />
        </>
      )}
      {kind === "add" && ( // add-point ghost (+)
        <>
          <circle cx="9" cy="9" r="8" fill={C.handleFill} stroke={C.bound} strokeWidth="1.3" strokeDasharray="2.5 2.5" />
          <path d="M5.5 9H12.5M9 5.5V12.5" stroke={C.bound} strokeWidth="1.7" />
        </>
      )}
      {kind === "top" && ( // body-height handle (●)
        <circle cx="9" cy="9" r="5.5" fill={C.handleFill} stroke={accent} strokeWidth="2" />
      )}
      {kind === "tangent" && ( // tangent handle: direction line + grab circle
        <>
          <path d="M2 16L11 7" stroke={C.bound} strokeWidth="1.4" />
          <circle cx="13" cy="5" r="4" fill="#eef7f0" stroke={C.bound} strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

/** The marks the legend redraws at legend size — the same shapes the canvas uses. */
type GlyphKind = "pt" | "sel" | "add" | "top" | "tangent";

// Rows are [glyph, verb, description]. The verb is its own column rather than folded into the
// sentence, because it is what makes the marks act different (drag vs click).
const LEGEND: Record<EditMode, { title: string; rows: [GlyphKind, string, string][] }> = {
  move: {
    title: "点の操作",
    rows: [
      ["pt", "ドラッグ", "ふくらみを変える"],
      ["sel", "クリック", "選ぶ → 右パネルで編集"],
      ["add", "クリック", "点を増やす"],
      ["top", "ドラッグ", "火袋の高さ"],
    ],
  },
  curve: {
    title: "カーブ調整中",
    rows: [
      ["tangent", "ドラッグ", "カーブの向き・強さ"],
      ["pt", "—", "点は動きません(「点を動かす」へ)"],
    ],
  },
};

function Legend({ accent, editMode, compact, t }: { accent: string; editMode: EditMode; compact: boolean; t: T }) {
  const g = LEGEND[editMode] || LEGEND.move;
  // "→ 右パネルで編集" is a wide-layout fact: on a phone there is no right panel and no card in the
  // sheet either, selecting a point raises the bar under the drawing (ui/PointBar.tsx).
  const rows: [GlyphKind, string, string][] = compact
    ? g.rows.map(([k, v, d]) => [k, v, k === "sel" ? "選ぶ → 下のバーで編集" : d])
    : g.rows;
  // Compact: the card is 300px wide against a 375px screen, so on a phone it IS the drawing, and it
  // landed on the route chips as well. Folded into a pill you tap open, and moved to the bottom, the
  // marks it explains living on the silhouette whose openings and neck are at the top. Closed by
  // default: whoever most needs it is on their first visit, which starts with the welcome card.
  const [open, setOpen] = useState(false);
  const shown = !compact || open;
  const pos: React.CSSProperties = compact
    ? { bottom: 10, left: 10, maxWidth: "calc(100% - 20px)" }
    : { top: 62, right: 16, maxWidth: 300 };

  return (
    <div className="rounded-lg" style={{
      position: "absolute", pointerEvents: compact ? "auto" : "none", ...pos,
      fontFamily: "'IBM Plex Sans JP',sans-serif",
      background: "rgba(255,253,248,0.82)", border: `1px solid ${C.faint}`,
      padding: shown ? "9px 12px 10px" : 0, backdropFilter: "blur(2px)",
    }}>
      {compact ? (
        // The pill and the card's heading are the same element, so the title never moves when it
        // opens. stopPropagation because the pane's own pointerdown clears the point selection.
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpen((v) => !v)}
          aria-expanded={open} style={{
            display: "flex", alignItems: "center", gap: 7, minHeight: 34, padding: shown ? "0 0 6px" : "0 12px",
            background: "transparent", border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: FS.xs, fontWeight: 700, letterSpacing: "0.06em", color: C.label,
          }}>
          <Glyph kind="pt" accent={accent} />
          {t(g.title)}
          <span aria-hidden="true" style={{ color: C.faint }}>{open ? "▾" : "▸"}</span>
        </button>
      ) : (
        <div style={{ fontSize: FS.xs, fontWeight: 700, letterSpacing: "0.06em", color: C.label, marginBottom: 6 }}>
          {t(g.title)}
        </div>
      )}
      {shown && (
      <div style={{ display: "grid", gridTemplateColumns: "18px auto 1fr", columnGap: 8, rowGap: 5, alignItems: "center" }}>
        {rows.map(([kind, verb, desc]) => (
          <React.Fragment key={kind + verb}>
            <Glyph kind={kind} accent={accent} />
            <span style={{ fontSize: FS.xs, fontWeight: 600, color: C.label, whiteSpace: "nowrap" }}>{t(verb)}</span>
            <span style={{ fontSize: FS.sm, color: C.value, lineHeight: 1.35 }}>{t(desc)}</span>
          </React.Fragment>
        ))}
      </div>
      )}
    </div>
  );
}
