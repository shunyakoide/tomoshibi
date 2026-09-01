/**
 * ============================================================================
 * PAGE PREVIEW — the cardboard route's print view
 * ============================================================================
 * The cardboard route's output is a document, so its preview is a document: the template's own A4
 * pages, laid out the way a PDF viewer lays them out. **Not 3D** — there is nothing spatial to show
 * (the parts are flat, the "bed" doesn't exist, and a WebGL page needs a canvas texture to say what
 * a stroke of ink says for free). The section view already establishes the pattern: when a view is
 * flat, it is an SVG over the (empty) 3D canvas.
 *
 * The markup comes from `paperPagesSVG` — the same ops, through the same renderer, as the printable
 * HTML and the PDF. So this is not a picture *of* the template, it is the template: same page count,
 * same parts per page, same part split across two sheets at the same line. A preview that laid the parts
 * out its own way would be a second opinion about a layout that already has one, and the first
 * time they disagreed the user would trust the wrong one.
 *
 * On screen it is NOT full scale (a 210mm page is ~230px here) — hence the note, and hence the
 * ruler printed on every sheet, which is the only check that actually catches printer scaling.
 *
 * **There is no preview of the washi template**, on either route, and that is deliberate: it is one
 * sheet of one shape, it changes nothing about the mold you are looking at, and it downloads as its
 * own PDF you open in a viewer that shows it better than a 190px dock ever did. (There WAS such a
 * dock; it took the print view's left gutter on both routes and earned none of it.) The panel's
 * numbers — the 「和紙」 section's panel size — are what the app has to say about it on screen.
 * ============================================================================
 */
import React, { useDeferredValue, useMemo } from "react";
import { paperPagesSVG } from "./papercraft.ts";
import { UI as ui, useT } from "./ui/theme.ts";
import type { Lang } from "./i18n.ts";
import type { Design } from "./types.ts";

export default function PagePreview({ p, matT, lang }: { p: Design; matT: number; lang: Lang }) {
  const t = useT();
  // Deferred, because laying the pages out and parsing the markup back into a DOM costs ~100ms and a
  // slider drag asks for it 60 times a second. The pages then trail the drag by a frame or two and
  // settle when it stops — right for a document preview, where the finished page is what matters.
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
      {/* The page styles are generated from papercraft's STYLE table, scoped to `.pages` so the
          inspector's own `.note` is not caught by the sheet's 2.6px note style. */}
      <style>{css}</style>
      {/* `.pages` is only a marker for index.css's `.pages .pg` rule — the sheet itself is markup
          papercraft writes as a string, so there is no element here to put utilities on. The layout
          around it is utilities, and `repeat(auto-fit, …)` is doing the work: auto-FIT collapses the
          tracks no page landed in and lets the survivors share ALL the width, so two pages become
          half the pane each rather than two thumbnails in a row of seven. `grid-auto-rows: max-content`
          is load-bearing and `auto` is a bug — this pane is a flex item with a DEFINITE height, and an
          auto row in such a grid is sized against that height rather than against its contents (the
          rows came out 8.5px while every page still rendered 243px, so each sheet drew through the
          three below it). The top pad clears the two floating chip rows drawn over this canvas; on a
          phone the chips are a bar ABOVE this pane, so there is nothing to clear, and the sheets go
          to ONE COLUMN AND TOUCH — the template's own layout is one column wide and consecutive
          sheets are butt-joined, so the preview is the strip you will tape, in the order you tape it,
          and a gap would draw a join the finished template does not have. */}
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
