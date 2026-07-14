/**
 * ============================================================================
 * 断面エディタ (SECTION EDITOR) — 直接操作
 * ============================================================================
 * 火袋のシルエットを図面上で直接編集する SVG エディタ。スライダーの代わりに:
 *   - 火袋の高さ … 頂点の○を縦ドラッグ
 *   - 上部/下部半径 … 首の中央の○を横ドラッグ
 *   - ふくらみ … 曲線の制御点 ◇ を縦横ドラッグ / 曲線をWクリックで追加 /
 *                点をWクリックで削除 / クリックで 角(■) ⇄ なめらか(◇) 切替
 * 首(NECK=15mm)は固定。半径関数は geometry.js の outerR を共有(3D/STLと一致)。
 * クライアント座標→SVGユーザー座標の変換は getScreenCTM を使い、レターボックス
 * (preserveAspectRatio)があってもハンドル位置とドラッグ量が正確になるようにする。
 * ============================================================================
 */
import React, { useRef } from "react";
import { outerR, NECK } from "./geometry.js";

// SVG 論理座標(固定)。中心軸 cx、底辺 y0。表示はコンテナに合わせて等比拡縮。
const VBW = 860, VBH = 780, CX = 430, Y0 = 710;
const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

const C = {
  axis: "#b8a888", outline: "#c4b492", higo: "#c9b593", spine: "#d8c7a3",
  label: "#8a7c66", value: "#3b342b", faint: "#c0b298", handleFill: "#fffdf8",
};

export default function SectionEditor({ p, setP, accent, drag, setDrag }) {
  const svgRef = useRef(null);

  const H = p.height;
  const s = Math.min(2.0, 520 / H);          // mm → SVG単位
  const tn = NECK / H;
  const topY = Y0 - H * s;
  const X = (r) => CX + r * s;
  const Xm = (r) => CX - r * s;
  const Y = (t) => Y0 - t * H * s;

  // クライアント座標 → SVGユーザー座標(preserveAspectRatio のレターボックスを吸収)
  const toSvg = (clientX, clientY) => {
    const el = svgRef.current;
    const m = el && el.getScreenCTM && el.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const inv = m.inverse();
    return { x: inv.a * clientX + inv.c * clientY + inv.e, y: inv.b * clientX + inv.d * clientY + inv.f };
  };

  // ---- シルエット標本化(高解像度で折れ線のカクつきを消す) ----
  const N = 200;
  const rs = [];
  for (let i = 0; i <= N; i++) rs.push(outerR(p, i / N));
  let d = `M ${X(rs[0]).toFixed(1)} ${Y(0).toFixed(1)}`;
  for (let i = 1; i <= N; i++) d += ` L ${X(rs[i]).toFixed(1)} ${Y(i / N).toFixed(1)}`;
  for (let i = N; i >= 0; i--) d += ` L ${Xm(rs[i]).toFixed(1)} ${Y(i / N).toFixed(1)}`;
  d += " Z";

  // 竹ひご(首を除き pitch 間隔の水平線)
  let higo = "";
  for (let mm = NECK + p.pitch; mm < H - NECK; mm += p.pitch) {
    const t = mm / H, r = outerR(p, t);
    higo += `M ${Xm(r).toFixed(1)} ${Y(t).toFixed(1)} L ${X(r).toFixed(1)} ${Y(t).toFixed(1)} `;
  }

  // ---- ハンドル(火袋の高さ / 上部半径 / 下部半径) ----
  const beginDrag = (e, cfg) => {
    e.preventDefault();
    e.stopPropagation();
    const start = p[cfg.key];
    const s0 = toSvg(e.clientX, e.clientY);
    const move = (ev) => {
      const c = toSvg(ev.clientX, ev.clientY);
      const dSvg = cfg.axis === "y" ? s0.y - c.y : c.x - s0.x; // 上/右方向を正に
      setP((o) => ({ ...o, [cfg.key]: clamp(cfg.min, cfg.max, Math.round(start + dSvg / s)) }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    setDrag(cfg.key);
  };

  const handles = [
    { key: "height", label: "火袋の高さ", x: CX, y: topY, axis: "y", min: 140, max: 400,
      cursor: "ns-resize", guide: [CX - 60, topY, CX + 60, topY],
      lx: CX - 22, ly: topY - 8, anchor: "end" },
    { key: "rTop", label: "上部半径", x: X(p.rTop), y: topY + NECK * s * 0.5, axis: "x", min: 12, max: 80,
      cursor: "ew-resize", guide: [CX, topY + NECK * s * 0.5, X(p.rTop), topY + NECK * s * 0.5],
      lx: X(p.rTop) + 16, ly: topY + NECK * s * 0.5, anchor: "start" },
    { key: "rBot", label: "下部半径", x: X(p.rBot), y: Y0 - NECK * s * 0.5, axis: "x", min: 12, max: 80,
      cursor: "ew-resize", guide: [CX, Y0 - NECK * s * 0.5, X(p.rBot), Y0 - NECK * s * 0.5],
      lx: X(p.rBot) + 16, ly: Y0 - NECK * s * 0.5, anchor: "start" },
  ];

  // ---- 曲線の制御点 ----
  const beginDragPt = (e, i) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { ...p.pts[i] };
    const sx = e.clientX, sy = e.clientY;
    const s0 = toSvg(sx, sy);
    let moved = false;
    const move = (ev) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
      if (!moved) return;
      const c = toSvg(ev.clientX, ev.clientY);
      setP((o) => {
        const pts = o.pts.map((q) => ({ ...q }));
        const lo = i > 0 ? pts[i - 1].t + 0.04 : 0.03;
        const hi = i < pts.length - 1 ? pts[i + 1].t - 0.04 : 0.97;
        pts[i].r = clamp(10, 130, start.r + (c.x - s0.x) / s);
        pts[i].t = clamp(lo, hi, start.t + (s0.y - c.y) / (H * s));
        return { ...o, pts };
      });
      setDrag("pt" + i);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) {
        // クリック(移動なし)= 角 ⇄ なめらか 切替
        setP((o) => {
          const pts = o.pts.map((q) => ({ ...q }));
          pts[i] = { ...pts[i], sharp: !pts[i].sharp };
          return { ...o, pts };
        });
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    setDrag("pt" + i);
  };

  const removePt = (i) => {
    if (p.pts.length <= 1) return;
    setP((o) => ({ ...o, pts: o.pts.filter((_, j) => j !== i) }));
  };

  const addPt = (e) => {
    if (p.pts.length >= 7) return;
    const c = toSvg(e.clientX, e.clientY);
    const t = (Y0 - c.y) / (H * s);
    if (t < 0.03 || t > 0.97) return;
    const r = clamp(10, 130, Math.abs(c.x - CX) / s);
    setP((o) => ({ ...o, pts: [...o.pts, { t, r }].sort((a, b) => a.t - b.t) }));
  };

  const cps = p.pts.map((pt, i) => {
    return { i, pt, x: X(pt.r), y: Y(pt.t), active: drag === "pt" + i };
  });

  const spineY = Math.min(Y(tn), Y(1 - tn));
  const spineH = Math.abs(Y(tn) - Y(1 - tn));

  return (
    <div style={{
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

        {/* 中心軸 */}
        <line x1={CX} x2={CX} y1={(topY - 34).toFixed(1)} y2={(Y0 + 34).toFixed(1)}
          stroke={C.axis} strokeWidth="1" strokeDasharray="2 6" />

        {/* 火袋シルエット(Wクリックで制御点追加) */}
        <path d={d} fill="url(#washiGrad)" stroke={C.outline} strokeWidth="1.5"
          onDoubleClick={addPt} style={{ cursor: "crosshair" }} />

        {/* 竹ひご */}
        {higo && <path d={higo} stroke={C.higo} strokeWidth="1" fill="none" />}

        {/* 羽根板の芯(中央帯) */}
        <rect x={CX - 7} width="14" y={spineY.toFixed(1)} height={spineH.toFixed(1)} fill={C.spine} opacity="0.55" />

        {/* コマ(上下のハブ) */}
        <rect x={CX - 13} width="26" height="14" rx="3" y={(topY - 7).toFixed(1)} fill={accent} opacity="0.92" />
        <rect x={CX - 13} width="26" height="14" rx="3" y={(Y0 - 7).toFixed(1)} fill={accent} opacity="0.92" />

        {/* ハンドル */}
        {handles.map((h) => {
          const active = drag === h.key;
          return (
            <g key={h.key} onPointerDown={(e) => beginDrag(e, h)} style={{ cursor: h.cursor }}>
              <line x1={h.guide[0].toFixed(1)} y1={h.guide[1].toFixed(1)} x2={h.guide[2].toFixed(1)} y2={h.guide[3].toFixed(1)}
                stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity={active ? 0.8 : 0} />
              <circle cx={h.x.toFixed(1)} cy={h.y.toFixed(1)} r="14" fill="transparent" />
              <circle cx={h.x.toFixed(1)} cy={h.y.toFixed(1)} r="6.5" fill={active ? accent : C.handleFill} stroke={accent} strokeWidth="2" />
              <text x={h.lx.toFixed(1)} y={(h.ly - 6).toFixed(1)} textAnchor={h.anchor}
                fontFamily="'IBM Plex Sans JP',sans-serif" fontSize="12" fill={C.label}>{h.label}</text>
              <text x={h.lx.toFixed(1)} y={(h.ly + 10).toFixed(1)} textAnchor={h.anchor}
                fontFamily="'IBM Plex Mono',monospace" fontSize="13" fontWeight="600" fill={active ? accent : C.value}>{p[h.key]} mm</text>
            </g>
          );
        })}

        {/* 制御点(◇=なめらか / ■=角) */}
        {cps.map((c) => (
          <g key={c.i} onPointerDown={(e) => beginDragPt(e, c.i)} onDoubleClick={() => removePt(c.i)} style={{ cursor: "move" }}>
            <circle cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r="13" fill="transparent" />
            <rect x={(c.x - 5.5).toFixed(1)} y={(c.y - 5.5).toFixed(1)} width="11" height="11" rx="2.5"
              transform={c.pt.sharp ? undefined : `rotate(45 ${c.x.toFixed(1)} ${c.y.toFixed(1)})`}
              fill={c.active ? accent : C.handleFill} stroke={accent} strokeWidth="2" />
            <text x={(c.x + 15).toFixed(1)} y={(c.y + 4).toFixed(1)}
              fontFamily="'IBM Plex Mono',monospace" fontSize="12" fontWeight="600"
              fill={c.active ? accent : C.label}>{Math.round(c.pt.r)} mm</text>
          </g>
        ))}
      </svg>

      {/* 操作ヒント */}
      <div style={{
        position: "absolute", bottom: 14, right: 18, display: "flex", alignItems: "center", gap: 8,
        fontSize: 11.5, color: C.label, fontFamily: "'IBM Plex Sans JP',sans-serif",
        maxWidth: "60%", textAlign: "right", pointerEvents: "none", lineHeight: 1.5,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, flex: "none" }} />
        ◇ドラッグでふくらみ · クリックで角⇄なめらか · 曲線Wクリックで点追加 · 点Wクリックで削除
      </div>
    </div>
  );
}
