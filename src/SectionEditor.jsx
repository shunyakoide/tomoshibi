/**
 * ============================================================================
 * SECTION EDITOR — direct manipulation
 * ============================================================================
 * An SVG editor for editing the lamp body silhouette directly on the drawing.
 * Instead of sliders:
 *   - Lamp body height … drag the top vertex circle vertically
 *   - Neck (opening) … drag the outermost control point ◇ (horizontal = flare /
 *                       vertical = neck height), independent top/bottom
 *   - Bulge … drag a curve control point ◇ in both axes / double-click a curve
 *             to add / double-click a point to delete / click to toggle
 *             corner (■) ⇄ smooth (◇)
 * Neck = the vertical rectangle at each end (present per neckBot/neckTop); the
 * curve starts just inside it. The radius function shares geometry.js's outerR
 * (matching 3D/STL). Client → SVG user coordinate conversion uses getScreenCTM
 * so handle positions and drag amounts stay accurate even with letterboxing
 * (preserveAspectRatio).
 * ============================================================================
 */
import React, { useRef } from "react";
import { outerR, cutYbot, cutYtop, fukuroRange, grooveR, grooveList, grooveOuterPts, komaR, innerRi, maxRadius, ribOutline2D, lightenHoles2D } from "./geometry.js";
import { LIMITS } from "./config.js";
import { clamp } from "./util.js";

// SVG logical coordinates (fixed). Center axis cx, baseline y0. Display scales uniformly to fit the container.
const VBW = 860, VBH = 780, CX = 430, Y0 = 710;

const C = {
  axis: "#b8a888", outline: "#c4b492", higo: "#c9b593", spine: "#d8c7a3",
  label: "#8a7c66", value: "#3b342b", faint: "#c0b298", handleFill: "#fffdf8",
  neck: "#d9ccb0", bound: "#5aa774", // neck band / lamp body boundary dashes (green = neck/lamp-body seam)
  board: "#caa96f", boardLine: "#9e7f4a", // rib (actual cross-section overlaid on one side)
};

export default function SectionEditor({ p, setP, accent, drag, setDrag, sel = null, setSel = () => {}, editMode = "move", setEditMode = () => {}, t = (s) => s }) {
  const svgRef = useRef(null);

  const H = p.height;
  // mm → SVG units. Fit BOTH axes: height alone set the scale while the radius was capped at
  // 130mm and could not overflow, but a wide, low body now runs straight off the sides — taking
  // the ◇ you are dragging with it. 520/H and 2.0 are unchanged, so nothing that fitted before
  // is redrawn at a different size; the width term only ever makes it smaller.
  const s = Math.min(2.0, 520 / H, (CX - 30) / Math.max(maxRadius(p), 1));
  const neckB = cutYbot(p), neckT = cutYtop(p); // bottom/top neck height (mm, independent)
  const tnB = neckB / H, tnT = neckT / H;
  const topY = Y0 - H * s;
  const X = (r) => CX + r * s;
  const Xm = (r) => CX - r * s;
  const Y = (t) => Y0 - t * H * s;

  // Client coordinates → SVG user coordinates (absorbs preserveAspectRatio letterboxing)
  const toSvg = (clientX, clientY) => {
    const el = svgRef.current;
    const m = el && el.getScreenCTM && el.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const inv = m.inverse();
    return { x: inv.a * clientX + inv.c * clientY + inv.e, y: inv.b * clientX + inv.d * clientY + inv.f };
  };
  // Client coordinates → model coordinates (t, r). Used for absolute handle positioning.
  const toModel = (clientX, clientY) => {
    const c = toSvg(clientX, clientY);
    return { t: (Y0 - c.y) / (H * s), r: (c.x - CX) / s };
  };

  // ---- Silhouette sampling (reflects the groove serrations at their actual depth; matches geometry) ----
  const fr = fukuroRange(p);                 // t range of the lamp body (curve) = between the outermost control points
  const gR = grooveR(p);                     // groove half-width. Shared with geometry = the drawn groove matches the printed groove
  const gs = grooveList(p, gR);              // groove positions (mm)
  const op = grooveOuterPts(p, gs, gR);      // outer-edge points with normal-cut groove notches (matches the STL)
  const kR = komaR(p), Ri = innerRi(p);      // koma outer radius / core (inner end of the tab)
  // Right side up, then the mirrored left side down (same points → the drawn groove matches the printed groove)
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
  const bands = [
    { t0: 0, t1: fr.lo, fill: C.neck },       // bottom neck
    { t0: fr.lo, t1: fr.hi, fill: accent, op: 0.12 }, // lamp body
    { t0: fr.hi, t1: 1, fill: C.neck },       // top neck
  ].filter((b) => b.t1 - b.t0 > 0.001);
  const maxR = Math.max(...op.map((q) => q[0])) + 4;

  // Actual rib cross-section (overlaid on the right side). Tab tongue + core (Ri) + grooved outer edge + lightening windows.
  // The exact shape of the printed part. Coordinates are (x = radius mm, y = height mm).
  const Ymm = (y) => Y0 - y * s;
  const poly2d = (pl) => "M " + pl.map(([px, py], i) => `${i ? "L " : ""}${X(px).toFixed(1)} ${Ymm(py).toFixed(1)}`).join(" ") + " Z";
  let ribD = poly2d(ribOutline2D(p));
  for (const hole of lightenHoles2D(p).holes) ribD += " " + poly2d(hole); // punch out the windows via evenodd

  // ---- Handles (lamp body height / top radius / bottom radius) ----
  // Every drag gesture below (height handle, control point, tangent handle) needs the same three
  // things: listen on the WINDOW so the pointer may leave the small hit target, mark this key as the
  // active drag so the row/handle highlights, and tear both down on release. Written out three times
  // over, it was the bulk of this section.
  const startDrag = (key, onMove) => {
    const up = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    setDrag(key);
  };

  const beginDrag = (e, cfg) => {
    e.preventDefault();
    e.stopPropagation();
    const start = p[cfg.key];
    const s0 = toSvg(e.clientX, e.clientY);
    startDrag(cfg.key, (ev) => {
      const c = toSvg(ev.clientX, ev.clientY);
      const dSvg = cfg.axis === "y" ? s0.y - c.y : c.x - s0.x; // up/right direction is positive
      setP((o) => ({ ...o, [cfg.key]: clamp(cfg.min, cfg.max, Math.round(start + dSvg / s)) }));
    });
  };

  const handles = [
    { key: "height", label: "火袋の高さ", x: CX, y: topY, axis: "y", min: LIMITS.height[0], max: LIMITS.height[1],
      cursor: "ns-resize", guide: [CX - 60, topY, CX + 60, topY],
      lx: CX - 22, ly: topY - 8, anchor: "end" },
    // The opening (= neck) radius is the outermost control point itself → no separate handle (drag the ◇).
  ];

  // ---- Curve control points ----
  // Select the point the moment the pointer goes down (regardless of whether it moves). Drag moves t/r;
  // no movement (a click) only selects. Corner⇄smooth and delete are done via explicit buttons in the right panel
  // (previously click = toggle corner and double-click = delete were hidden gestures that misfired with drags).
  const beginDragPt = (e, i) => {
    e.preventDefault();
    e.stopPropagation();
    setSel(i);
    const start = { ...p.pts[i] };
    const sx = e.clientX, sy = e.clientY;
    const s0 = toSvg(sx, sy);
    let moved = false;
    startDrag("pt" + i, (ev) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
      if (!moved) return;
      if (editMode === "curve") return;   // in curve-adjust mode the point doesn't move (only the handles do)
      const c = toSvg(ev.clientX, ev.clientY);
      setP((o) => {
        const pts = o.pts.map((q) => ({ ...q }));
        // The outermost control points can move all the way to the end (they set the neck height). Inner ones stay between their neighbors.
        const lo = i > 0 ? pts[i - 1].t + 0.04 : 0.01;
        const hi = i < pts.length - 1 ? pts[i + 1].t - 0.04 : 0.99;
        pts[i].r = clamp(...LIMITS.r, start.r + (c.x - s0.x) / s);
        pts[i].t = clamp(lo, hi, start.t + (s0.y - c.y) / (H * s));
        return { ...o, pts };
      });
    });
  };

  // The "+" ghost on the curve = midpoint between adjacent control points (radius from geometry's outerR = actual shape).
  // Click to add a point there and select it. geometry is unchanged (just adds one point to pts).
  const addAtT = (mt) => {
    if (p.pts.length >= 8) return;
    const r = clamp(...LIMITS.r, outerR(p, mt));
    setP((o) => {
      const pts = [...o.pts, { t: mt, r }].sort((a, b) => a.t - b.t);
      const idx = pts.findIndex((q) => q.t === mt);
      setSel(idx);
      return { ...o, pts };
    });
  };

  // Dragging a tangent handle (curve-adjust mode). which="ho" (next-point side) / "hi" (previous-point side).
  // Smooth points (non-sharp, interior) mirror the opposite side symmetrically (hi=-ho). Corner/end points are independent per side.
  const beginDragHandle = (e, i, which) => {
    e.preventDefault();
    e.stopPropagation();
    startDrag("h" + i + which, (ev) => {
      const m = toModel(ev.clientX, ev.clientY);
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

  // Tangent handles for the selected point (curve-adjust mode only). ho = next-point side / hi = previous-point side.
  const selPt = sel != null ? p.pts[sel] : null;
  const showHandles = editMode === "curve" && selPt;
  const handleDots = [];
  if (showHandles) {
    const add = (which, h) => {
      if (!h) return;
      handleDots.push({ which, ax: X(selPt.r), ay: Y(selPt.t), hx: X(selPt.r + h.dr), hy: Y(selPt.t + h.dt) });
    };
    if (sel < p.pts.length - 1) add("ho", selPt.ho);
    if (sel > 0) add("hi", selPt.hi);
  }

  // Add-point ghost (+): midpoint between adjacent control points. Radius taken from outerR (= actual shape). Capped at 8 points.
  // Hidden in curve-adjust mode so focus stays on the handles.
  const ghosts = (editMode === "curve" || p.pts.length >= 8) ? [] : p.pts.slice(0, -1).map((pt, i) => {
    const mt = (pt.t + p.pts[i + 1].t) / 2;
    return { mt, x: X(outerR(p, mt)), y: Y(mt) };
  });

  const spineY = Math.min(Y(tnB), Y(1 - tnT));
  const spineH = Math.abs(Y(tnB) - Y(1 - tnT));

  return (
    <div onPointerDown={() => setSel(null)} style={{
      position: "absolute", inset: 0, overflow: "hidden",
      background: "radial-gradient(ellipse at 45% 40%, #f7f2e6 0%, #efe7d6 60%, #e9dfc9 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="xMidYMid meet"
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

        {/* Lamp body silhouette. Clicks defer to the outer container to clear selection (no dedicated handler needed) */}
        <path d={d} fill="url(#washiGrad)" stroke={C.outline} strokeWidth="1.5" style={{ cursor: "default" }} />

        {/* Region color-coding (neck = ecru / lamp body = accent). Clipped to the silhouette */}
        <g clipPath="url(#silClip)" style={{ pointerEvents: "none" }}>
          {bands.map((b, i) => (
            <rect key={i} x={(CX - maxR * s).toFixed(1)} width={(maxR * 2 * s).toFixed(1)}
              y={Y(b.t1).toFixed(1)} height={((b.t1 - b.t0) * H * s).toFixed(1)}
              fill={b.fill} opacity={b.op ?? 0.3} />
          ))}
        </g>

        {/* Rib (right side = the actual printed cross-section). Tab tongue, core (Ri), and lightening windows are visible */}
        <path d={ribD} fillRule="evenodd" fill={C.board} fillOpacity="0.42" stroke={C.boardLine}
          strokeWidth="1.2" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
        <text x={(X(kR) + 9).toFixed(1)} y={(Ymm(H + p.tabLen) + 3).toFixed(1)}
          fontFamily="'IBM Plex Sans JP',sans-serif" fontSize="11" fontWeight="600"
          fill={C.boardLine} style={{ pointerEvents: "none" }}>{t("羽根板")}</text>

        {/* Neck ↔ lamp body boundary (= height of the outermost control point). Beyond here is the straight neck */}
        {[fr.lo, fr.hi].map((ty, i) => (ty > 0.001 && ty < 0.999) && (
          <line key={i} x1={Xm(maxR).toFixed(1)} x2={X(maxR).toFixed(1)} y1={Y(ty).toFixed(1)} y2={Y(ty).toFixed(1)}
            stroke={C.bound} strokeWidth="1" strokeDasharray="4 4" opacity="0.7" style={{ pointerEvents: "none" }} />
        ))}

        {/* Region labels (neck / lamp body / neck). Left side = doesn't collide with the ◇ value labels */}
        <g style={{ pointerEvents: "none" }} fontFamily="'IBM Plex Sans JP',sans-serif" fontSize="12.5" textAnchor="end">
          {fr.lo > 0.03 && <text x={Xm(maxR + 6).toFixed(1)} y={(Y(fr.lo / 2) + 4).toFixed(1)} fill={C.label} fontWeight="600">{t("首")}</text>}
          <text x={Xm(maxR + 6).toFixed(1)} y={(Y((fr.lo + fr.hi) / 2) + 4).toFixed(1)} fill={accent} fontWeight="700">{t("火袋")}</text>
          {fr.hi < 0.97 && <text x={Xm(maxR + 6).toFixed(1)} y={(Y((fr.hi + 1) / 2) + 4).toFixed(1)} fill={C.label} fontWeight="600">{t("首")}</text>}
        </g>

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
              <circle cx={h.x.toFixed(1)} cy={h.y.toFixed(1)} r="14" fill="transparent" />
              <circle cx={h.x.toFixed(1)} cy={h.y.toFixed(1)} r="6.5" fill={active ? accent : C.handleFill} stroke={accent} strokeWidth="2" />
              <text x={h.lx.toFixed(1)} y={(h.ly - 6).toFixed(1)} textAnchor={h.anchor}
                fontFamily="'IBM Plex Sans JP',sans-serif" fontSize="12" fill={C.label}>{t(h.label)}</text>
              <text x={h.lx.toFixed(1)} y={(h.ly + 10).toFixed(1)} textAnchor={h.anchor}
                fontFamily="'IBM Plex Mono',monospace" fontSize="13" fontWeight="600" fill={active ? accent : C.value}>{p[h.key]} mm</text>
            </g>
          );
        })}

        {/* Add-point ghost (+). Midpoint of adjacent points. Click to add a point and select it */}
        {ghosts.map((g, i) => (
          <g key={"gh" + i} onPointerDown={(e) => { e.stopPropagation(); addAtT(g.mt); }} style={{ cursor: "copy" }}>
            <circle cx={g.x.toFixed(1)} cy={g.y.toFixed(1)} r="11" fill={C.handleFill} fillOpacity="0.85"
              stroke={C.bound} strokeWidth="1.3" strokeDasharray="2.5 2.5" />
            <path d={`M ${(g.x - 4).toFixed(1)} ${g.y.toFixed(1)} H ${(g.x + 4).toFixed(1)} M ${g.x.toFixed(1)} ${(g.y - 4).toFixed(1)} V ${(g.y + 4).toFixed(1)}`}
              stroke={C.bound} strokeWidth="1.6" style={{ pointerEvents: "none" }} />
          </g>
        ))}

        {/* Control points (◇ = smooth / ■ = corner). Outermost (ends) = opening = neck (horizontal = flare / vertical = neck height) */}
        {cps.map((c) => (
          <g key={c.i} onPointerDown={(e) => beginDragPt(e, c.i)} style={{ cursor: "move" }}>
            {c.selected && (
              <circle cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r="13" fill="none"
                stroke={C.bound} strokeWidth="1.6" strokeDasharray="3 3" style={{ pointerEvents: "none" }} />
            )}
            <circle cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r="13" fill="transparent" />
            <rect x={(c.x - 5.5).toFixed(1)} y={(c.y - 5.5).toFixed(1)} width="11" height="11" rx="2.5"
              transform={c.pt.sharp ? undefined : `rotate(45 ${c.x.toFixed(1)} ${c.y.toFixed(1)})`}
              fill={c.active || c.selected || c.end ? accent : C.handleFill} stroke={accent} strokeWidth="2" />
            {c.end && (
              <text x={(c.x + 15).toFixed(1)} y={(c.y - 8).toFixed(1)}
                fontFamily="'IBM Plex Sans JP',sans-serif" fontSize="10.5" fontWeight="600" fill={accent}>{t("開口/首")}</text>
            )}
            <text x={(c.x + 15).toFixed(1)} y={(c.y + 4).toFixed(1)}
              fontFamily="'IBM Plex Mono',monospace" fontSize="12" fontWeight="600"
              fill={c.active ? accent : C.label}>{Math.round(c.pt.r)} mm</text>
          </g>
        ))}

        {/* Tangent handles (curve-adjust mode, selected point only). Drag the green direction line + grab circle to adjust angle/tension */}
        {handleDots.map((h, i) => (
          <g key={"h" + i}>
            <line x1={h.ax.toFixed(1)} y1={h.ay.toFixed(1)} x2={h.hx.toFixed(1)} y2={h.hy.toFixed(1)}
              stroke={C.bound} strokeWidth="1.4" style={{ pointerEvents: "none" }} />
            <circle cx={h.hx.toFixed(1)} cy={h.hy.toFixed(1)} r="13" fill="transparent"
              onPointerDown={(e) => beginDragHandle(e, sel, h.which)} style={{ cursor: "move" }} />
            <circle cx={h.hx.toFixed(1)} cy={h.hy.toFixed(1)} r="5.5" fill="#eef7f0" stroke={C.bound} strokeWidth="2"
              style={{ pointerEvents: "none" }} />
          </g>
        ))}
      </svg>

      {/* Operation legend (bottom-left). The ◇ handles are the least discoverable part of the app, so
          the marks are redrawn here at the same colors/shapes as on the canvas rather than described
          in words. Content follows editMode: in curve-adjust mode the + ghosts are hidden and the point
          itself doesn't move, which reads as a bug unless it is said out loud. */}
      <Legend accent={accent} editMode={editMode} t={t} />
    </div>
  );
}

// One mark from the canvas, drawn at legend size (18×18 box, centered on 9,9).
function Glyph({ kind, accent }) {
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

// Rows are [glyph, verb, description]. The verb column is what makes the marks act different
// (drag vs click), so it is kept as its own column instead of being folded into the sentence.
const LEGEND = {
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

function Legend({ accent, editMode, t }) {
  const g = LEGEND[editMode] || LEGEND.move;
  return (
    <div style={{
      position: "absolute", bottom: 14, left: 14, pointerEvents: "none",
      fontFamily: "'IBM Plex Sans JP',sans-serif", maxWidth: 300,
      background: "rgba(255,253,248,0.82)", border: `1px solid ${C.faint}`, borderRadius: 10,
      padding: "9px 12px 10px", backdropFilter: "blur(2px)",
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: C.label, marginBottom: 6 }}>
        {t(g.title)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "18px auto 1fr", columnGap: 8, rowGap: 5, alignItems: "center" }}>
        {g.rows.map(([kind, verb, desc]) => (
          <React.Fragment key={kind + verb}>
            <Glyph kind={kind} accent={accent} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: C.label, whiteSpace: "nowrap" }}>{t(verb)}</span>
            <span style={{ fontSize: 11.5, color: C.value, lineHeight: 1.35 }}>{t(desc)}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
