/**
 * ============================================================================
 * SELECTED POINT — the contextual bar (phones only)
 * ============================================================================
 * The one row between the viewport and the sheet while a ◇ is selected in the section view.
 *
 * **Why, measured.** Reaching `PointCard` (185px into a 1333px list) costs the drawing: the sheet's
 * `full` stop leaves the viewport at `MIN_VIEW` (140px) and `half`'s ~212px window does not fit the
 * 256px card. In flow (like `alertBar`), never over the canvas: 57px while a point is selected and
 * nothing otherwise, and tapping empty canvas clears the selection, so it dismisses itself.
 *
 * **It carries H and not R**: the section view already prints every point's radius beside its ◇,
 * while height position is stated nowhere. Everything is a 44px target, and the editing rules live
 * in `pointEdit.ts`, shared with `PointCard`, because a clamp written twice rots.
 * ============================================================================
 */
import React from "react";
import { clamp } from "../util.ts";
import { useT } from "./theme.ts";
import { SEG_SKIN } from "./controls.tsx";

/* Glyph over caption. 46px is what the longest caption needs (four CJK glyphs at 9px), and the row
   had the slack for it at both 375 and 320. All three buttons share this one box. */
const PT_BTN = `flex flex-col items-center justify-center gap-1 flex-none w-46 min-h-44 p-0
  text-md leading-none ${SEG_SKIN}`;
const PT_CAP = "not-italic text-2xs font-semibold tracking-normal whitespace-nowrap";
import { pointOps, makeSetMode } from "./pointEdit.ts";
import type { EditMode } from "./pointEdit.ts";
import type { Design } from "../types.ts";

/** One compact numeric field: a mono letter, the input, and its unit. */
function Num({ tag, title, value, min, max, onChange }: {
  tag: string; title: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <label className="flex-[0_1_auto] mr-auto min-w-0 flex items-center gap-5" title={title}>
      <span aria-hidden="true" className="flex-none font-mono text-sm text-faint">{tag}</span>
      {/* key={value} re-mounts on an external change (a drag) so defaultValue follows it */}
      <input key={value} type="number" defaultValue={value} min={min} max={max} step={1}
        /* Sized to its content, with a FLOOR: a 2000mm design puts four digits in here, the field is
           right-aligned, and an overflow shows the END of the number — `000` for 2000, silently. */
        className="w-56 min-w-50 min-h-44 px-7 py-0 rounded-md text-right bg-card
          border border-card-edge text-text font-mono text-md"
        aria-label={`${title} (mm)`}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        onBlur={(e) => {
          const v = Math.round(Number(e.target.value));
          onChange(Number.isFinite(v) && v > 0 ? clamp(min, max, v) : value);
        }} />
    </label>
  );
}

export default function PointBar({ p, setP, sel, setSel, editMode, setEditMode }: {
  p: Design;
  setP: React.Dispatch<React.SetStateAction<Design>>;
  sel: number | null;
  setSel: (i: number | null) => void;
  editMode: EditMode;
  setEditMode: (m: EditMode) => void;
}) {
  const t = useT();
  const { pt, isEnd, canDelete, patch, setHeightMm, del } = pointOps(p, setP, sel, setSel);
  const setMode = makeSetMode(setP, setEditMode);
  if (!pt) return null;

  return (
    <div className="flex-none flex items-center gap-6 px-10 py-6 bg-panel border-b border-edge
      max-[360px]:gap-5 max-[360px]:px-8">
      {/* Which ◇ this is. A label, not a button: `PointCard` renders nothing on a phone, so there is
          nothing to open. First thing dropped when the row runs out of width. */}
      <span className="flex-none flex items-center px-4 text-accent font-mono text-base font-bold max-[360px]:hidden">{isEnd ? t("開口/首") : `#${sel! + 1}`}</span>
      <Num tag="H" title={t("高さ位置")} value={Math.round(pt.t * p.height)}
        min={1} max={p.height} onChange={setHeightMm} />
      {/* Glyph over a caption: the glyphs are the marks the section view draws for these two states,
          the words make them findable. The span is aria-hidden so the accessible name is the word
          alone, not glyph-plus-word. */}
      <div className="flex-none flex gap-4">
        <button className={PT_BTN} aria-pressed={!pt.sharp} onClick={() => patch({ sharp: false })}>
          <span aria-hidden="true">◇</span><em className={PT_CAP}>{t("なめらか")}</em>
        </button>
        <button className={PT_BTN} aria-pressed={!!pt.sharp} onClick={() => patch({ sharp: true })}>
          <span aria-hidden="true">■</span><em className={PT_CAP}>{t("角")}</em>
        </button>
      </div>
      {/* A rule, not a gap: ◇/■ are two exclusive VALUES of this point, ◠ is a mode of the editor,
          and in one shared skin they read as a group of three however much air separates them. */}
      <span className="flex-none w-1 self-stretch mx-1 my-4 bg-edge" aria-hidden="true" />
      {/* A mode, so a toggle: pressed = curve. Shared with the card via makeSetMode, which is what
          bakes the Bézier handles on the first entry. */}
      <button className={PT_BTN} aria-pressed={editMode === "curve"}
        onClick={() => setMode(editMode === "curve" ? "move" : "curve")}>
        <span aria-hidden="true">◠</span><em className={PT_CAP}>{t("カーブ")}</em>
      </button>
      <span className="flex-none w-1 self-stretch mx-1 my-4 bg-edge" aria-hidden="true" />
      <button onClick={del} disabled={!canDelete}
        className="flex-none w-40 min-h-44 p-0 rounded-md flex items-center justify-center
          cursor-pointer bg-transparent text-warn border-0 hover:bg-warn-08
          disabled:text-faintest disabled:cursor-default disabled:bg-transparent"
        aria-label={t("この点を削除")} title={t("この点を削除")}>
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" fill="none"
          stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M2.5 3.5h9M5.5 3.5V2h3v1.5M3.8 3.5l.6 8.2h5.2l.6-8.2M6 5.8v3.9M8 5.8v3.9" />
        </svg>
      </button>
    </div>
  );
}
