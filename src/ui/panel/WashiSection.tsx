/**
 * The template is not an output method: it ships with whichever route you pick, so there is no
 * download here. Beta because `check:paper` checks the dimensions and nothing checks the FIT —
 * flattening a doubly-curved surface is approximate, and a damp sheet takes up an unmeasured amount.
 */
import { Stepper, SectionLabel, Note } from "../controls.tsx";
import { useT } from "../theme.ts";

export default function WashiSection({ boards, side, end, setSide, setEnd, gore }: {
  boards: number; side: number; end: number;
  setSide: (v: number) => void; setEnd: (v: number) => void;
  gore: { wMax: number; sTot: number };
}) {
  const t = useT();
  return (
    <div className="mb-20">
      <SectionLabel title="和紙" hint="羽根板の間 1面分 · beta" />
      <Stepper label="のりしろ(左右)" value={side} min={0} max={15} step={1} onChange={setSide}>
        {side} mm
      </Stepper>
      <Stepper label="被せ代(上下)" value={end} min={0} max={15} step={1} onChange={setEnd}>
        {end} mm
      </Stepper>
      <div className="flex items-center justify-between py-7">
        <span className="text-base text-text">{t("1面のサイズ")}</span>
        <span className="font-mono text-sm text-faint">
          {Math.round(2 * gore.wMax)} × {Math.round(gore.sTot + 2 * end)} mm × {boards}
        </span>
      </div>
      <Note className="mt-2">
        {t("貼る前に和紙を切るための原寸型紙です。どちらの出力にも別 PDF で同梱されます。")}
        <br />{t("この型紙は検証中です。全面を切る前に、まず 1 面だけ合わせてみてください。")}
      </Note>
    </div>
  );
}
