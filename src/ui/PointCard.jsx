/**
 * ============================================================================
 * SELECTED CONTROL POINT
 * ============================================================================
 * The card for whichever ◇ is selected in the section view. Its job is to turn gestures that were
 * once hidden on the SVG into explicit, typed, keyboard-reachable UI: exact radius and height,
 * smooth ⇄ corner, delete, and the move ⇄ curve mode switch.
 *
 * It edits `pts` only — radius, height and the sharp flag. No dimension is computed here; the shape
 * still comes entirely from geometry.js.
 * ============================================================================
 */
import React from "react";
import { bakeBezierHandles } from "../geometry.js";
import { clamp } from "../util.js";
import { UI, useT } from "./theme.js";
import { SectionLabel, NumInput, SegButton } from "./controls.jsx";

export default function PointCard({ p, setP, sel, setSel, editMode, setEditMode }) {
  const t = useT();
  const pt = sel != null && p.pts?.[sel] ? p.pts[sel] : null;
  const isEnd = pt && (sel === 0 || sel === p.pts.length - 1);
  const canDelete = p.pts.length > 2;

  const patch = (fields) => setP((o) => {
    const pts = o.pts.map((q) => ({ ...q }));
    pts[sel] = { ...pts[sel], ...fields };
    return { ...o, pts };
  });
  // Height is typed in mm; neighbours cap it so the points stay in ascending t order.
  const setHeightMm = (mm) => setP((o) => {
    const pts = o.pts.map((q) => ({ ...q }));
    const lo = sel > 0 ? pts[sel - 1].t + 0.04 : 0.01;
    const hi = sel < pts.length - 1 ? pts[sel + 1].t - 0.04 : 0.99;
    pts[sel] = { ...pts[sel], t: clamp(lo, hi, mm / p.height) };
    return { ...o, pts };
  });
  const del = () => {
    if (!canDelete) return;
    setP((o) => ({ ...o, pts: o.pts.filter((_, j) => j !== sel) }));
    setSel(null);
  };
  // Entering curve mode with no handles yet bakes them from the current Hermite curve, which leaves
  // the shape untouched; from then on outerR evaluates as Bézier and the angles are editable.
  const enterCurve = () => {
    setEditMode("curve");
    setP((o) => (o.pts.some((q) => q.ho || q.hi) ? o : { ...o, pts: bakeBezierHandles(o.pts) }));
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel title="選択中の点" hint={pt ? (isEnd ? "開口/首" : `#${sel + 1}`) : undefined} />
      {pt ? (
        <div style={{ border: `1px solid ${UI.cardEdge}`, borderRadius: 10, background: UI.card, padding: "12px 12px 10px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <SegButton label="✥ 点を動かす" active={editMode === "move"} onClick={() => setEditMode("move")} />
            <SegButton label="◠ カーブ調整" active={editMode === "curve"} onClick={enterCurve} />
          </div>
          <NumInput label="張り出し(半径)" value={Math.round(pt.r)} min={10} max={130}
            onChange={(v) => patch({ r: clamp(10, 130, v) })} />
          <NumInput label="高さ位置" value={Math.round(pt.t * p.height)} min={1} max={p.height}
            onChange={setHeightMm} />
          <div style={{ display: "flex", gap: 6, margin: "4px 0 10px" }}>
            <SegButton label="◇ なめらか" active={!pt.sharp} onClick={() => patch({ sharp: false })} />
            <SegButton label="■ 角" active={!!pt.sharp} onClick={() => patch({ sharp: true })} />
          </div>
          <button className="block-btn" onClick={del} disabled={!canDelete}>{t("この点を削除")}</button>
        </div>
      ) : (
        <div style={{
          border: `1px dashed ${UI.cardEdge}`, borderRadius: 10, padding: "14px 14px",
          fontSize: 11.5, color: UI.faint, lineHeight: 1.6,
        }}>{t("断面図の点をクリックすると、数値・なめらか/角・削除がここに出ます。曲線上の緑の＋で点を追加できます。")}</div>
      )}
    </div>
  );
}
