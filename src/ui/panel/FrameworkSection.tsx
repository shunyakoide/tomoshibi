// The neck is NOT here: it is the outermost ◇ on the section drawing, which is the section's last line.
import { ScrubRow, Stepper, SectionLabel, type DragState } from "../controls.tsx";
import { useT } from "../theme.ts";
import type { Design } from "../../types.ts";

export default function FrameworkSection({ p, setP, boardsMax, drag, setDrag }: {
  p: Design; setP: React.Dispatch<React.SetStateAction<Design>>; boardsMax: number;
} & DragState) {
  const t = useT();
  return (
    <div className="mb-20">
      <SectionLabel title="骨組み" />
      <Stepper label="羽根板の枚数" value={p.boards} min={4} max={Math.min(16, boardsMax)} step={1}
        onChange={(v) => setP((o) => ({ ...o, boards: v }))}>
        {p.boards}<span className="text-faintest font-normal">{t(" 枚")}</span>
      </Stepper>
      {boardsMax < 16 && p.boards >= boardsMax && (
        <div className="text-sm leading-[1.5] text-faint pt-2 pb-4">
          {t("この開口・板厚では最大 {n} 枚(コマのノッチが重なるため)。板を薄くすると増やせます", { n: Math.min(16, boardsMax) })}
        </div>
      )}
      <ScrubRow drag={drag} setDrag={setDrag} cfg={{
        key: "boardT", label: "板厚", value: p.boardT, display: p.boardT.toFixed(1),
        min: 1, max: 4, round: 0.2, unit: "mm", onChange: (v) => setP((o) => ({ ...o, boardT: v })),
      }} />
      <ScrubRow drag={drag} setDrag={setDrag} cfg={{
        key: "tabLen", label: "爪の長さ", value: p.tabLen,
        min: 5, max: 40, round: 1, unit: "mm", onChange: (v) => setP((o) => ({ ...o, tabLen: v })),
      }} />
      <div className="text-sm leading-[1.5] text-faint pt-2 pb-4">
        {t("首の高さ・張り出しは断面図の◇(最外の制御点)を上下/左右にドラッグ")}
      </div>
    </div>
  );
}
