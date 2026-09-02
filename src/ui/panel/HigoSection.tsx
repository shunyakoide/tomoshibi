/** The bamboo: its diameter, its spacing, and whether it winds as rings or as one spiral. */
import { ScrubRow, Checkbox, SectionLabel, type DragState } from "../controls.tsx";
import { useT } from "../theme.ts";
import type { Design } from "../../types.ts";

export default function HigoSection({ p, setP, drag, setDrag }: {
  p: Design; setP: React.Dispatch<React.SetStateAction<Design>>;
} & DragState) {
  const t = useT();
  return (
    <div className="mb-20">
      <SectionLabel title="竹ひご" />
      <ScrubRow drag={drag} setDrag={setDrag} cfg={{
        key: "higoD", label: "竹ひご径", value: p.higoD, display: p.higoD.toFixed(1),
        min: 1, max: 4, round: 0.5, unit: "mm", onChange: (v) => setP((o) => ({ ...o, higoD: v })),
      }} />
      <ScrubRow drag={drag} setDrag={setDrag} cfg={{
        key: "pitch", label: "ひごピッチ", value: p.pitch,
        min: 8, max: 30, round: 1, unit: "mm", onChange: (v) => setP((o) => ({ ...o, pitch: v })),
      }} />
      <div className="mt-4">
        <Checkbox checked={p.spiral ?? false} onToggle={() => setP((o) => ({ ...o, spiral: !(o.spiral ?? false) }))}
          label={<>{t("螺旋巻き")} <span className="text-faint">{t("(溝を下へ連続させる)")}</span></>} />
      </div>
    </div>
  );
}
