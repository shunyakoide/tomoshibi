/**
 * The settings for the selected route — the switch itself sits on the viewport, next to the mode
 * tabs. Two branches in one file, because the branch IS the section: what each route needs of the
 * maker has nothing in common.
 */
import { Stepper, NumInput, SectionLabel, Note } from "../controls.tsx";
import { useT } from "../theme.ts";
import type { Design, Route } from "../../types.ts";

const BED_PRESETS = [180, 220, 250, 256, 300, 350];
const BED_SELECT = "w-150 px-8 py-6 font-sans text-base text-text bg-card border "
  + "border-card-edge rounded-md cursor-pointer";

/** 3D print: the machine's bed, and how many rib copies go on one plate. */
function BedGroup({ bedW, bedD, setBedW, setBedD, spiral, boards, nRibs, setPrintRibs }: {
  bedW: number; bedD: number; setBedW: (v: number) => void; setBedD: (v: number) => void;
  spiral: boolean; boards: number; nRibs: number; setPrintRibs: (v: number) => void;
}) {
  const t = useT();
  const preset = bedW === bedD && BED_PRESETS.includes(bedW);
  return (
    <>
      <SectionLabel title="プリントベッド" />
      {/* Square presets, so this sets width = depth; 幅/奥行き below stay for rectangular beds. */}
      <div className="flex items-center justify-between mb-12">
        <span className="text-base text-text">{t("定番サイズ")}</span>
        <select value={preset ? String(bedW) : "custom"} aria-label={t("定番サイズ")}
          onChange={(e) => { const v = +e.target.value; if (v) { setBedW(v); setBedD(v); } }}
          className={BED_SELECT}>
          {!preset && <option value="custom">{t("カスタム")}</option>}
          {BED_PRESETS.map((sz) => <option key={sz} value={sz}>{sz} × {sz} mm</option>)}
        </select>
      </div>
      <NumInput label="幅" value={bedW} onChange={setBedW} min={100} max={420} />
      <NumInput label="奥行き" value={bedD} onChange={setBedD} min={100} max={420} />

      {/* A per-job output choice, not a bed dimension, hence its own group. */}
      <div className="border-t border-edge pt-14 mt-14">
        <SectionLabel title="配置" />
        {spiral ? (
          <div className="flex items-center justify-between py-7">
            <span className="text-base text-text">{t("印刷する羽根板")}</span>
            <span className="font-mono text-sm text-faint">{t("螺旋: 全")}{boards}{t("枚(各1枚)")}</span>
          </div>
        ) : (
          <Stepper label="印刷する羽根板" value={nRibs} min={1} max={boards} step={1} onChange={setPrintRibs}>
            {nRibs}<span className="text-faintest font-normal"> / {boards}</span>
          </Stepper>
        )}
      </div>
    </>
  );
}

/** Cardboard: the A4 full-scale template. Only the material thickness lives here. */
function BoardGroup({ matT, setMatT }: { matT: number; setMatT: (v: number) => void }) {
  const t = useT();
  return (
    <>
      <SectionLabel title="型紙(段ボール)" hint="A4 原寸 · beta" />
      <Note className="mb-12">
        {t("この出力は開発中です。寸法は3Dプリント版と同じ計算から出していますが、実際に組んだ報告がまだ少ないルートです。材料の厚みは必ず実測し、刷った紙の 50mm スケールを定規で確認してください。")}
      </Note>
      <Stepper label="材料の厚み" value={matT} min={1} max={10} step={0.5} onChange={setMatT}>
        {matT} mm
      </Stepper>
      {/* Counterpart to the 3D route's bed warning: on paper there is no machine size to exceed, and
          saying nothing would read as a missing check. */}
      <Note>{t("A4 に収まらない部品は次のページに続きます(両方を青い枠で切り、同じ番号の半ダイヤが◇になるよう突き合わせて裏からテープ)。続くのは縦方向だけです。")}</Note>
    </>
  );
}

export default function ExportSection({ route, p, nRibs, bedW, bedD, setBedW, setBedD, setPrintRibs, matT, setMatT }: {
  route: Route; p: Design; nRibs: number;
  bedW: number; bedD: number; setBedW: (v: number) => void; setBedD: (v: number) => void;
  setPrintRibs: (v: number) => void; matT: number; setMatT: (v: number) => void;
}) {
  return (
    <div className="border-t border-edge pt-16 mt-4">
      {/* Titled, because the panel is one long scroll: untitled, the first control reads as another
          shape setting. */}
      <SectionLabel title="印刷・書き出し" hint={route === "stl" ? "3Dプリント" : "段ボール"} />
      {route === "stl"
        ? <BedGroup bedW={bedW} bedD={bedD} setBedW={setBedW} setBedD={setBedD}
            spiral={!!p.spiral} boards={p.boards} nRibs={nRibs} setPrintRibs={setPrintRibs} />
        : <BoardGroup matT={matT} setMatT={setMatT} />}
    </div>
  );
}
