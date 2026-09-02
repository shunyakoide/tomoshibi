/**
 * The CTA for the current mode, pinned at the BOTTOM on both layouts. The summary beside it is
 * dropped on a phone, where the sheet's bar carries it: `peek` is measured from that bar ALONE, so
 * this footer sits below the sheet's own edge and is clipped until the sheet is pulled up.
 */
import { CTA } from "../controls.tsx";
import KitNote, { type KitNoteState } from "./KitNote.tsx";
import { WASHI_PDF } from "../../kit.ts";
import { useT } from "../theme.ts";
import type { Route } from "../../types.ts";

export default function PanelFooter({
  narrow, isPrint, route, goPrint, maxDia, ribLen, topOpen, botOpen, ribFits, bedRules,
  kitNote, setKitNote, onDownloadStl, onDownloadPaper,
}: {
  narrow: boolean; isPrint: boolean; route: Route; goPrint: () => void;
  maxDia: number; ribLen: number; topOpen: number; botOpen: number;
  ribFits: boolean; bedRules: boolean;
  kitNote: KitNoteState; setKitNote: React.Dispatch<React.SetStateAction<KitNoteState>>;
  onDownloadStl: () => void; onDownloadPaper: () => void;
}) {
  const t = useT();
  const toggle = () => setKitNote((v) => (v === "open" ? "shut" : "open"));
  return (
    <div className="flex-none border-t border-edge px-20 pt-16 pb-18
      narrow:px-14 narrow:pt-10 narrow:pb-12">
      {!narrow && (
      <div className="grid grid-cols-[auto_1fr] gap-x-12 gap-y-5 text-base mb-14">
        <span className="text-faint">{t("最大径")}</span>
        <span className="font-mono font-semibold text-right">⌀{maxDia} mm</span>
        <span className="text-faint">{t("羽根板の全長")}</span>
        <span className={`font-mono font-semibold text-right${!bedRules || ribFits ? "" : " text-warn"}`}>
          {ribLen} mm
        </span>
        <span className="text-faint">{t("上下の開口(半径)")}</span>
        <span className="font-mono font-semibold text-right">{topOpen} / {botOpen} mm</span>
      </div>
      )}

      {!isPrint ? (
        <CTA label="印刷・書き出しへ進む →" outline onClick={goPrint} />
      ) : route === "paper" ? (
        <>
          <CTA label="型紙 ZIP をダウンロード (A4 原寸)" onClick={() => { onDownloadPaper(); setKitNote("open"); }} />
          {/* A PDF is already A4 at exact size, so the printer's own scaling is the only way to
              lose it: hence the one line that is not folded away. */}
          <KitNote warn={<><strong>{t("原寸 100% で印刷")}</strong>{t("(「用紙に合わせる」は不可)")}</>}
            state={kitNote} onToggle={toggle} t={t}>
            <li><span className="font-mono">tomoshibi_katagami_a4.pdf</span>{t(" — 型紙")}</li>
            <li><span className="font-mono">{WASHI_PDF}</span>{t(" — 和紙の型紙(原寸で印刷)")}</li>
          </KitNote>
        </>
      ) : (
        <>
          <CTA label="STL 書き出し" onClick={() => { onDownloadStl(); setKitNote("open"); }} />
          {/* Miss this and you print half a mold: koma and posts are identical top and bottom, so
              the kit carries one of each. */}
          <KitNote warn={<>{t("コマ・柱は各1つ。スライサーで")}<strong>{t("2つに複製")}</strong></>}
            state={kitNote} onToggle={toggle} t={t}>
            <li><span className="font-mono">tomoshibi_*.stl</span>{t(" — 羽根板・コマ・土台・口輪")}</li>
            <li><span className="font-mono">{WASHI_PDF}</span>{t(" — 和紙の型紙(原寸で印刷)")}</li>
            <li><span className="font-mono">tomoshibi_config.json</span>{t(" — 設計のバックアップ")}</li>
          </KitNote>
        </>
      )}
    </div>
  );
}
