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
import { outerR } from "./geometry.ts";
import { LIMITS } from "./config.ts";
import { clamp } from "./util.ts";
import { FS } from "./ui/theme.ts";
import Legend from "./ui/section/Legend.tsx";
import { C } from "./ui/section/palette.ts";
import { CX, Y0, sectionFrame } from "./ui/section/frame.ts";
import { sampleSection, sectionPaths } from "./ui/section/paths.ts";
import type { EditMode } from "./ui/pointEdit.ts";
import type { T } from "./i18n.ts";
import type { Design, NumericDesignKey } from "./types.ts";

/**
 * A draggable dimension handle. `key` names the design field it edits (so the inspector row and the
 * handle highlight together), `axis` which way the drag counts.
 */
type Handle = {
  key: NumericDesignKey; label: string; x: number; y: number; axis: "x" | "y";
  min: number; max: number; cursor: string; guide: [number, number, number, number];
  lx: number; ly: number; anchor: "start" | "middle" | "end";
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
  // The drawing, in three steps: sample it in millimetres, fit a frame to that sample, then put the
  // sample through the frame. The frame is FITTED TO THE CONTENT, so the sample has to come first.
  const sample = sampleSection(p);
  const { fr, maxR, komaR: kR, tnB, tnT } = sample;
  const f = sectionFrame(p, pane, compact, sample);
  const { s, topY, X, Xm, Y, Ymm, viewBox, hitPt, hitAdd, rPt, rRing, rH, rAdd, rTan, markStroke, showLabels, showLegend } = f;
  const { d, higo, ribD, bands } = sectionPaths(p, f, sample, accent);

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

      {/* Operation legend (ui/section/Legend.tsx), which redraws this canvas's own marks at legend
          size. Whether there is room for it is decided here; what it says is decided there. */}
      {showLegend && <Legend accent={accent} editMode={editMode} compact={compact} />}
    </div>
  );
}
