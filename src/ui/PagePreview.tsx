/**
 * The cardboard route's output is a document, so its preview is one: the template's own A4 pages,
 * laid out as a PDF viewer would. **Not 3D** — nothing spatial to show.
 *
 * The markup comes from `paperPagesSVG` — same ops, same renderer, as the PDF — so this is not a
 * picture *of* the template, it IS the template: same page count, same parts per page, same part
 * split across two sheets at the same line. A preview laying parts out its own way is a second
 * opinion, and the user would trust the wrong one.
 *
 * On screen it is NOT full scale (a 210mm page is ~230px) — hence the note, and hence the ruler
 * printed on every sheet, the only check that catches printer scaling.
 */
import { useDeferredValue, useMemo } from "react";
import { paperPagesSVG } from "../papercraft.ts";
import { useT } from "./theme.ts";
import type { Lang } from "../i18n.ts";
import type { Design } from "../types.ts";

export default function PagePreview({ p, matT, lang }: { p: Design; matT: number; lang: Lang }) {
  const t = useT();
  // Deferred: laying the pages out and parsing the markup back into a DOM costs ~100ms, and a slider
  // drag asks for it 60 times a second. The pages trail the drag and settle when it stops.
  const dp = useDeferredValue(p);
  // `lang` rather than `t` in the deps for the same reason it is passed that way to the scene
  // builder: useLang builds a fresh t on every render, which would defeat the memo entirely.
  const { svg, css, pages } = useMemo(
    () => paperPagesSVG(dp, matT, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is derived from lang (new identity per render)
    [dp, matT, lang],
  );

  return (
    <div className="absolute inset-0 flex flex-col pointer-events-auto">
      {/* The page styles are generated from papercraft's STYLE table, scoped so the inspector's own
          note class is not caught by the sheet's 2.6px note style. */}
      <style>{css}</style>
      {/* The class is only a marker for an index.css rule — the sheet is markup papercraft writes
          as a string, so there is no element to put utilities on. `auto-fit` collapses the tracks no
          page landed in and lets the survivors share ALL the width. `grid-auto-rows: max-content` is
          load-bearing and `auto` is a bug: this pane is a flex item with a DEFINITE height, and an
          auto row in such a grid is sized against that height rather than its contents (8.5px rows
          behind 243px pages, drawn through each other). The top pad clears the two floating chip
          rows over this canvas; on a phone the chips are a bar ABOVE this pane, so the sheets go to
          ONE COLUMN AND TOUCH — the template is one column wide and butt-joined, so the preview is
          the strip you will tape and a gap would draw a join that does not exist. */}
      <div dangerouslySetInnerHTML={{ __html: svg }}
        className="pages flex-auto min-h-0 overflow-y-auto [overscroll-behavior:contain]
          grid [grid-template-columns:repeat(auto-fit,minmax(380px,1fr))] [align-content:start]
          [grid-auto-rows:max-content] gap-14 pt-124 px-20 pb-14
          narrow:[grid-template-columns:1fr] narrow:gap-0 narrow:pt-12 narrow:px-10 narrow:pb-10" />
      <div className="flex-none pt-8 px-20 pb-12 text-sm leading-[1.5] font-semibold text-text
        bg-[rgba(255,255,255,0.82)] border-t border-edge backdrop-blur-[4px]">
        {t("型紙プレビュー · 全 {n} ページ", { n: pages })}
        <span className="font-normal"> — {t("画面上は原寸ではありません。PDF をダウンロードして原寸で印刷してください。")}</span>
      </div>
    </div>
  );
}
