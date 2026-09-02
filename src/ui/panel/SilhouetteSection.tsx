/** The one shape row that is a slider rather than a ◇ on the drawing: the body's height. */
import { ScrubRow, SectionLabel, type DragState } from "../controls.tsx";
import { SIL_ROWS } from "../../config.ts";
import type { Design } from "../../types.ts";

export default function SilhouetteSection({ p, setP, drag, setDrag }: {
  p: Design; setP: React.Dispatch<React.SetStateAction<Design>>;
} & DragState) {
  return (
    <div className="mb-20">
      <SectionLabel title="シルエット" hint="ドラッグ / 値クリックで入力" />
      {SIL_ROWS.map((r) => (
        <ScrubRow key={r.key} drag={drag} setDrag={setDrag}
          cfg={{ ...r, value: p[r.key], onChange: (v) => setP((o) => ({ ...o, [r.key]: v })) }} />
      ))}
    </div>
  );
}
