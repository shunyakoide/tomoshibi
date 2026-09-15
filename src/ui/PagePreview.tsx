/**
 * The cardboard route's output is a document, so its preview is one: the template's own A4 pages,
 * laid out as a PDF viewer would. **Not 3D** — nothing spatial to show.
 *
 * The markup comes from `paperPagesSVG` / `washiPagesSVG` — same ops, same renderer, as the PDFs —
 * so this is not a picture *of* the template, it IS the template: same page count, same parts per
 * page, same part split across two sheets at the same line. A preview laying parts out its own way
 * is a second opinion, and the user would trust the wrong one.
 *
 * BOTH documents, because the ZIP holds both and the washi one used to go to the printer unseen.
 * Two sections, never one page sequence: they are separate PDFs, printed at different moments, and
 * `pagesPDF` numbers and seams the sheets of ONE document (see `paper/skin.ts`). Splicing them here
 * would put page "3 of 7" on a sheet the file calls page 1.
 *
 * On screen it is NOT full scale (a 210mm page is ~230px) — hence the note, and hence the ruler
 * printed on every sheet, the only check that catches printer scaling.
 */
import { useDeferredValue, useMemo } from "react";
import { paperPagesSVG, washiPagesSVG } from "../papercraft.ts";
import { useT } from "./theme.ts";
import type { Design } from "../types.ts";
import type { WashiOpts } from "../geometry.ts";

export default function PagePreview({ p, matT, midKoma, mold, washiOpts }: {
  p: Design; matT: number; midKoma: boolean;
  /** The mold this route MAKES (`paperP`'s). The washi panel is one rib-to-rib bay wide, so it must
   *  be cut for the possibly-clamped rib count — the same design `downloadPaperKit` hands `washiPDF`. */
  mold: Design;
  washiOpts: WashiOpts;
}) {
  const t = useT();
  // Deferred: laying the pages out and parsing the markup back into a DOM costs ~100ms, and a slider
  // drag asks for it 60 times a second. The pages trail the drag and settle when it stops. Both
  // documents, or the two halves would settle a frame apart.
  const dp = useDeferredValue(p);
  const dm = useDeferredValue(mold);
  // `t` is memoized on `lang` in useLang, so it is a stable dep rather than a fresh closure.
  const { svg, css, pages } = useMemo(() => paperPagesSVG(dp, matT, t, undefined, midKoma), [dp, matT, t, midKoma]);
  const washi = useMemo(() => washiPagesSVG(dm, washiOpts, t), [dm, washiOpts, t]);

  return (
    <div className="absolute inset-0 flex flex-col pointer-events-auto">
      {/* The page styles are generated from papercraft's STYLE table, scoped so the inspector's own
          note class is not caught by the sheet's 2.6px note style. */}
      <style>{css}</style>
      {/* ONE scroller, two documents. The class is only a marker for an index.css rule — the sheet is
          markup papercraft writes as a string, so there is no element to put utilities on. The top
          pad clears the two floating chip rows over this canvas; on a phone the chips are a bar
          ABOVE this pane. */}
      <div className="flex-auto min-h-0 overflow-y-auto [overscroll-behavior:contain]
        pt-124 px-20 pb-14 narrow:pt-12 narrow:px-10 narrow:pb-10">
        {[{ k: "mold", title: "型紙(段ボール)", note: "羽根板・コマ・口輪", html: svg },
          { k: "washi", title: "和紙の型紙", note: "羽根板の間 1面分", html: washi.svg }].map((doc, i) => (
          <div key={doc.k}>
            {/* Each document says what it is. Without it the washi sheets read as more pages of the
                template, which is the one thing they are not — they are a separate file, cut from
                paper rather than board, and printed at a different moment. */}
            <div className={`flex items-baseline gap-8 pb-8 ${i ? "pt-28 narrow:pt-20" : ""}`}>
              <b className="text-xs font-bold tracking-[0.14em] text-faint">{t(doc.title)}</b>
              <i className="text-xs not-italic text-faintest">{t(doc.note)}</i>
            </div>
            {/* `auto-fit` collapses the tracks no page landed in and lets the survivors share ALL the
                width. `grid-auto-rows: max-content` is load-bearing and `auto` is a bug: an auto row
                in a grid with a definite height is sized against that height rather than its
                contents (8.5px rows behind 243px pages, drawn through each other). On a phone the
                sheets go to ONE COLUMN AND TOUCH — the template is one column wide and butt-joined,
                so the preview is the strip you will tape and a gap would draw a join that is not
                there. */}
            <div dangerouslySetInnerHTML={{ __html: doc.html }}
              className="pages grid [grid-template-columns:repeat(auto-fit,minmax(380px,1fr))]
                [align-content:start] [grid-auto-rows:max-content] gap-14
                narrow:[grid-template-columns:1fr] narrow:gap-0" />
          </div>
        ))}
      </div>
      <div className="flex-none pt-8 px-20 pb-12 text-sm leading-[1.5] font-semibold text-text
        bg-[rgba(255,255,255,0.82)] border-t border-edge backdrop-blur-[4px]">
        {t("型紙プレビュー · 段ボール {n} ページ + 和紙 {w} ページ", { n: pages, w: washi.pages })}
        <span className="font-normal"> — {t("画面上は原寸ではありません。PDF をダウンロードして原寸で印刷してください。")}</span>
      </div>
    </div>
  );
}
