/**
 * ============================================================================
 * 断面エディタ (SECTION EDITOR) — 直接操作
 * ============================================================================
 * 火袋のシルエットを図面上で直接編集する SVG エディタ。スライダーの代わりに:
 *   - 火袋の高さ … 頂点の○を縦ドラッグ
 *   - 首(開口) … 最外の制御点 ◇ を横=張り出し / 縦=首の高さ にドラッグ(上下独立)
 *   - ふくらみ … 曲線の制御点 ◇ を縦横ドラッグ / 曲線をWクリックで追加 /
 *                点をWクリックで削除 / クリックで 角(■) ⇄ なめらか(◇) 切替
 * 首=上下端の垂直な長方形(有無は neckBot/neckTop)。その内側からカーブが始まる。
 * 半径関数は geometry.js の outerR を共有(3D/STLと一致)。
 * クライアント座標→SVGユーザー座標の変換は getScreenCTM を使い、レターボックス
 * (preserveAspectRatio)があってもハンドル位置とドラッグ量が正確になるようにする。
 * ============================================================================
 */
import React, { useRef } from "react";
import { outerR, cutYbot, cutYtop, fukuroRange, grooveList, grooveOuterX, komaR, innerRi, ribOutline2D, lightenHoles2D } from "./geometry.js";

// SVG 論理座標(固定)。中心軸 cx、底辺 y0。表示はコンテナに合わせて等比拡縮。
const VBW = 860, VBH = 780, CX = 430, Y0 = 710;
const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

const C = {
  axis: "#b8a888", outline: "#c4b492", higo: "#c9b593", spine: "#d8c7a3",
  label: "#8a7c66", value: "#3b342b", faint: "#c0b298", handleFill: "#fffdf8",
  neck: "#d9ccb0", bound: "#5aa774", // 首の帯 / 火袋境界の破線(緑=首と火袋の境目)
  board: "#caa96f", boardLine: "#9e7f4a", // 羽根板(片側に重ねる実断面)
};

export default function SectionEditor({ p, setP, accent, drag, setDrag }) {
  const svgRef = useRef(null);

  const H = p.height;
  const s = Math.min(2.0, 520 / H);          // mm → SVG単位
  const neckB = cutYbot(p), neckT = cutYtop(p); // 下/上の首の高さ(mm, 独立)
  const tnB = neckB / H, tnT = neckT / H;
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

  // ---- シルエット標本化(竹ひご溝のギザギザを実際の深さで反映。geometry と一致) ----
  const fr = fukuroRange(p);                 // 火袋(カーブ)の t 範囲 = 最外制御点の間
  const gR = p.higoD / 2 + 0.15;
  const gs = grooveList(p, gR);              // 竹ひご溝の位置(mm)
  const oX = grooveOuterX(p, gs, gR);        // 溝ノッチ込みの外径(mm)
  const kR = komaR(p), Ri = innerRi(p);      // コマ外径 / 芯(爪の内端)
  const N = Math.max(240, Math.round(H * 2));
  const rs = [];
  for (let i = 0; i <= N; i++) rs.push(oX(i / N * H));
  let d = `M ${X(rs[0]).toFixed(1)} ${Y(0).toFixed(1)}`;
  for (let i = 1; i <= N; i++) d += ` L ${X(rs[i]).toFixed(1)} ${Y(i / N).toFixed(1)}`;
  for (let i = N; i >= 0; i--) d += ` L ${Xm(rs[i]).toFixed(1)} ${Y(i / N).toFixed(1)}`;
  d += " Z";

  // 竹ひご(溝の中心線。溝ノッチと同じ位置)
  let higo = "";
  for (const mm of gs) {
    const t = mm / H, r = outerR(p, t);
    higo += `M ${Xm(r).toFixed(1)} ${Y(t).toFixed(1)} L ${X(r).toFixed(1)} ${Y(t).toFixed(1)} `;
  }
  // 領域(首/火袋)を色分けするための帯(シルエットでクリップ)
  const bands = [
    { t0: 0, t1: fr.lo, fill: C.neck },       // 下の首
    { t0: fr.lo, t1: fr.hi, fill: accent, op: 0.12 }, // 火袋
    { t0: fr.hi, t1: 1, fill: C.neck },       // 上の首
  ].filter((b) => b.t1 - b.t0 > 0.001);
  const maxR = Math.max(...rs) + 4;

  // 羽根板の実断面(右側に重ねて表示)。爪の舌 + 芯(Ri) + 溝付き外縁 + 肉抜き窓。
  // 印刷される部品そのものの形。座標は (x=半径mm, y=高さmm)。
  const Ymm = (y) => Y0 - y * s;
  const poly2d = (pl) => "M " + pl.map(([px, py], i) => `${i ? "L " : ""}${X(px).toFixed(1)} ${Ymm(py).toFixed(1)}`).join(" ") + " Z";
  let ribD = poly2d(ribOutline2D(p).pts);
  for (const hole of lightenHoles2D(p).holes) ribD += " " + poly2d(hole); // evenodd で窓を抜く

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
    // 開口(=首)半径は最外の制御点そのもの → 別ハンドルは持たない(◇をドラッグ)。
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
        // 最外の制御点は端まで動かせる(首の高さを決める)。内側は隣の間。
        const lo = i > 0 ? pts[i - 1].t + 0.04 : 0.01;
        const hi = i < pts.length - 1 ? pts[i + 1].t - 0.04 : 0.99;
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
    if (p.pts.length <= 2) return; // 最低2点(上下の開口)は残す
    setP((o) => ({ ...o, pts: o.pts.filter((_, j) => j !== i) }));
  };

  const addPt = (e) => {
    if (p.pts.length >= 8) return;
    const c = toSvg(e.clientX, e.clientY);
    const t = (Y0 - c.y) / (H * s);
    if (t < tnB + 0.02 || t > 1 - tnT - 0.02) return; // 火袋(最外制御点の内側)にのみ追加
    const r = clamp(10, 130, Math.abs(c.x - CX) / s);
    setP((o) => ({ ...o, pts: [...o.pts, { t, r }].sort((a, b) => a.t - b.t) }));
  };

  const cps = p.pts.map((pt, i) => {
    return { i, pt, x: X(pt.r), y: Y(pt.t), active: drag === "pt" + i, end: i === 0 || i === p.pts.length - 1 };
  });

  const spineY = Math.min(Y(tnB), Y(1 - tnT));
  const spineH = Math.abs(Y(tnB) - Y(1 - tnT));

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

        <defs>
          <clipPath id="silClip"><path d={d} /></clipPath>
        </defs>

        {/* 火袋シルエット(Wクリックで制御点追加) */}
        <path d={d} fill="url(#washiGrad)" stroke={C.outline} strokeWidth="1.5"
          onDoubleClick={addPt} style={{ cursor: "crosshair" }} />

        {/* 領域の色分け(首=生成り / 火袋=アクセント)。シルエットでクリップ */}
        <g clipPath="url(#silClip)" style={{ pointerEvents: "none" }}>
          {bands.map((b, i) => (
            <rect key={i} x={(CX - maxR * s).toFixed(1)} width={(maxR * 2 * s).toFixed(1)}
              y={Y(b.t1).toFixed(1)} height={((b.t1 - b.t0) * H * s).toFixed(1)}
              fill={b.fill} opacity={b.op ?? 0.3} />
          ))}
        </g>

        {/* 羽根板(右側=印刷される実断面)。爪の舌・芯(Ri)・肉抜き窓が見える */}
        <path d={ribD} fillRule="evenodd" fill={C.board} fillOpacity="0.42" stroke={C.boardLine}
          strokeWidth="1.2" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
        <text x={(X(kR) + 9).toFixed(1)} y={(Ymm(H + p.tabLen) + 3).toFixed(1)}
          fontFamily="'IBM Plex Sans JP',sans-serif" fontSize="11" fontWeight="600"
          fill={C.boardLine} style={{ pointerEvents: "none" }}>羽根板</text>

        {/* 首↔火袋の境界(=最外の制御点の高さ)。ここから外は直線の首 */}
        {[fr.lo, fr.hi].map((ty, i) => (ty > 0.001 && ty < 0.999) && (
          <line key={i} x1={Xm(maxR).toFixed(1)} x2={X(maxR).toFixed(1)} y1={Y(ty).toFixed(1)} y2={Y(ty).toFixed(1)}
            stroke={C.bound} strokeWidth="1" strokeDasharray="4 4" opacity="0.7" style={{ pointerEvents: "none" }} />
        ))}

        {/* 領域ラベル(首 / 火袋 / 首)。左側=◇の値ラベルと衝突しない */}
        <g style={{ pointerEvents: "none" }} fontFamily="'IBM Plex Sans JP',sans-serif" fontSize="12.5" textAnchor="end">
          {fr.lo > 0.03 && <text x={Xm(maxR + 6).toFixed(1)} y={(Y(fr.lo / 2) + 4).toFixed(1)} fill={C.label} fontWeight="600">首</text>}
          <text x={Xm(maxR + 6).toFixed(1)} y={(Y((fr.lo + fr.hi) / 2) + 4).toFixed(1)} fill={accent} fontWeight="700">火袋</text>
          {fr.hi < 0.97 && <text x={Xm(maxR + 6).toFixed(1)} y={(Y((fr.hi + 1) / 2) + 4).toFixed(1)} fill={C.label} fontWeight="600">首</text>}
        </g>

        {/* 竹ひご */}
        {higo && <path d={higo} stroke={C.higo} strokeWidth="1" fill="none" style={{ pointerEvents: "none" }} />}

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

        {/* 制御点(◇=なめらか / ■=角)。最外(端)= 開口=首(横=張り出し / 縦=首の高さ) */}
        {cps.map((c) => (
          <g key={c.i} onPointerDown={(e) => beginDragPt(e, c.i)} onDoubleClick={() => removePt(c.i)} style={{ cursor: "move" }}>
            <circle cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r="13" fill="transparent" />
            <rect x={(c.x - 5.5).toFixed(1)} y={(c.y - 5.5).toFixed(1)} width="11" height="11" rx="2.5"
              transform={c.pt.sharp ? undefined : `rotate(45 ${c.x.toFixed(1)} ${c.y.toFixed(1)})`}
              fill={c.active || c.end ? accent : C.handleFill} stroke={accent} strokeWidth="2" />
            {c.end && (
              <text x={(c.x + 15).toFixed(1)} y={(c.y - 8).toFixed(1)}
                fontFamily="'IBM Plex Sans JP',sans-serif" fontSize="10.5" fontWeight="600" fill={accent}>開口/首</text>
            )}
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
        端の◆=開口/首(横=張り出し·縦=首の高さ) · ◇ドラッグでふくらみ · クリックで角⇄なめらか · Wクリックで点追加/削除
      </div>
    </div>
  );
}
