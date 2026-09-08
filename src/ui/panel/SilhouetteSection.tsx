/** The one shape row that is a slider rather than a ◇ on the drawing: the body's height. */
import { ScrubRow, SectionLabel, type DragState } from "../controls.tsx";
import { SIL_ROWS } from "../../config.ts";
import { neckFloor } from "../pointEdit.ts";
import type { Design } from "../../types.ts";

export default function SilhouetteSection({ p, setP, drag, setDrag }: {
  p: Design; setP: React.Dispatch<React.SetStateAction<Design>>;
} & DragState) {
  return (
    <div className="mb-20">
      <SectionLabel title="シルエット" hint="ドラッグ / 値クリックで入力" />
      {SIL_ROWS.map((r) => (
        <ScrubRow key={r.key} drag={drag} setDrag={setDrag}
          cfg={{ ...r, value: p[r.key], onChange: (v) => setP((o) => {
            // The neck floor is millimetres, so a shorter body can put the ◇ under it: carry them out.
            const n = { ...o, [r.key]: v };
            return { ...n, pts: neckFloor(n.pts, n.height) };
          }) }} />
      ))}
    </div>
  );
}
