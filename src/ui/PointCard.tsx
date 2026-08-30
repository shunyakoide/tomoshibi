/**
 * ============================================================================
 * SELECTED CONTROL POINT
 * ============================================================================
 * The card for whichever ◇ is selected in the section view. Its job is to turn gestures that were
 * once hidden on the SVG into explicit, typed, keyboard-reachable UI: exact radius and height,
 * smooth ⇄ corner, delete, and the move ⇄ curve mode switch.
 *
 * It edits `pts` only — radius, height and the sharp flag. No dimension is computed here; the shape
 * still comes entirely from geometry.ts.
 * ============================================================================
 */
import React from "react";
import { LIMITS } from "../config.ts";
import { clamp } from "../util.ts";
import { UI, useT } from "./theme.ts";
import { SectionLabel, NumInput, SegButton } from "./controls.tsx";
import { pointOps, makeSetMode } from "./pointEdit.ts";
import type { EditMode } from "./pointEdit.ts";
import type { Design } from "../types.ts";

export default function PointCard({ p, setP, sel, setSel, editMode, setEditMode, compact = false }: {
  p: Design;
  setP: React.Dispatch<React.SetStateAction<Design>>;
  sel: number | null;
  setSel: (i: number | null) => void;
  editMode: EditMode;
  setEditMode: (m: EditMode) => void;
  /** On a phone the contextual bar (ui/PointBar.tsx) already carries most of this — see below. */
  compact?: boolean;
}) {
  const t = useT();
  // Shared with the phone's contextual bar — see ui/pointEdit.ts for why these are not written twice.
  const { pt, isEnd, canDelete, patch, setHeightMm, del } = pointOps(p, setP, sel, setSel);
  const setMode = makeSetMode(setP, setEditMode);

  // Not rendered at all on a phone. Every control that was left here after the contextual bar took
  // over (ui/PointBar.tsx) was either already in that bar or reachable by dragging the ◇ itself: the
  // radius is set by the app's primary gesture and printed live beside the mark, so a field for it
  // bought exact entry and nothing else, at the price of a section in a list you have to pull a
  // sheet up and scroll to reach. Delete moved into the bar unconditionally instead.
  if (compact) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel title="選択中の点" hint={pt ? (isEnd ? "開口/首" : `#${sel! + 1}`) : undefined} />
      {pt ? (
        <div style={{ border: `1px solid ${UI.cardEdge}`, borderRadius: 10, background: UI.card, padding: "12px 12px 10px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <SegButton label="✥ 点を動かす" active={editMode === "move"} onClick={() => setMode("move")} />
            <SegButton label="◠ カーブ調整" active={editMode === "curve"} onClick={() => setMode("curve")} />
          </div>
          <NumInput label="半径" value={Math.round(pt.r)} min={LIMITS.r[0]} max={LIMITS.r[1]}
            onChange={(v) => patch({ r: clamp(...LIMITS.r, v) })} />
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
