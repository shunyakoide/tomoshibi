/**
 * ============================================================================
 * SELECTED CONTROL POINT
 * ============================================================================
 * The card for whichever ◇ is selected in the section view: the SVG's gestures as explicit, typed,
 * keyboard-reachable UI — exact radius and height, smooth ⇄ corner, delete, move ⇄ curve mode.
 *
 * It edits `pts` only — radius, height and the sharp flag. No dimension is computed here; the shape
 * comes entirely from geometry.ts.
 * ============================================================================
 */
import React from "react";
import { LIMITS } from "../config.ts";
import { clamp } from "../util.ts";
import { useT } from "./theme.ts";
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

  // Not rendered at all on a phone: everything left here after the contextual bar (ui/PointBar.tsx)
  // took over is either in that bar or set by dragging the ◇ — the radius is the primary gesture and
  // is printed live beside the mark, so a field for it cost a section you must scroll to reach and
  // bought only exact entry. Delete moved into the bar unconditionally instead.
  if (compact) return null;

  return (
    <div className="mb-20">
      <SectionLabel title="選択中の点" hint={pt ? (isEnd ? "開口/首" : `#${sel! + 1}`) : undefined} />
      {pt ? (
        <div className="rounded-lg border border-card-edge bg-card px-12 pt-12 pb-10">
          <div className="flex gap-6 mb-10">
            <SegButton label="✥ 点を動かす" active={editMode === "move"} onClick={() => setMode("move")} />
            <SegButton label="◠ カーブ調整" active={editMode === "curve"} onClick={() => setMode("curve")} />
          </div>
          <NumInput label="半径" value={Math.round(pt.r)} min={LIMITS.r[0]} max={LIMITS.r[1]}
            onChange={(v) => patch({ r: clamp(...LIMITS.r, v) })} />
          <NumInput label="高さ位置" value={Math.round(pt.t * p.height)} min={1} max={p.height}
            onChange={setHeightMm} />
          <div className="flex gap-6 mt-4 mb-10">
            <SegButton label="◇ なめらか" active={!pt.sharp} onClick={() => patch({ sharp: false })} />
            <SegButton label="■ 角" active={!!pt.sharp} onClick={() => patch({ sharp: true })} />
          </div>
          <button onClick={del} disabled={!canDelete}
            className="w-full p-9 rounded-md cursor-pointer bg-transparent text-warn
              border border-warn-4 font-sans text-base font-semibold enabled:hover:bg-warn-06
              disabled:text-faintest disabled:border-card-edge disabled:opacity-55
              disabled:cursor-default">{t("この点を削除")}</button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-card-edge p-14 text-sm text-faint leading-[1.6]">{t("断面図の点をクリックすると、数値・なめらか/角・削除がここに出ます。曲線上の緑の＋で点を追加できます。")}</div>
      )}
    </div>
  );
}
