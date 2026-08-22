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
 * same parts per page, same part spanning two pages over a glue tab. A preview that laid the parts
 * out its own way would be a second opinion about a layout that already has one, and the first
 * time they disagreed the user would trust the wrong one.
 *
 * On screen it is NOT full scale (a 210mm page is ~230px here) — hence the note, and hence the
 * ruler printed on every sheet, which is the only check that actually catches printer scaling.
 * ============================================================================
 */
import React, { useDeferredValue, useMemo } from "react";
import { paperPagesSVG } from "./papercraft.js";
import { UI as ui, useT } from "./ui/theme.js";

export default function PagePreview({ p, matT, washi, lang }) {
  const t = useT();
  // Deferred, because laying the pages out and parsing the markup back into a DOM costs ~100ms and a
  // slider drag asks for it 60 times a second. The pages then trail the drag by a frame or two and
  // settle when it stops — right for a document preview, where the finished page is what matters.
  const dp = useDeferredValue(p);
  // `lang` rather than `t` in the deps for the same reason it is passed that way to the scene
  // builder: useLang builds a fresh t on every render, which would defeat the memo entirely.
  const { svg, css, pages } = useMemo(
    () => paperPagesSVG(dp, matT, t, washi),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is derived from lang (new identity per render)
    [dp, matT, washi.side, washi.end, lang],
  );

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", pointerEvents: "auto" }}>
      {/* The page styles are generated from papercraft's STYLE table, scoped to `.pages` so the
          inspector's own `.note` is not caught by the sheet's 2.6px note style. */}
      <style>{css}</style>
      <div className="pages" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="pages-note">
        {t("型紙プレビュー · 全 {n} ページ", { n: pages })}
        <span> — {t("画面上は原寸ではありません。「型紙を開く」から原寸で印刷してください。")}</span>
      </div>
    </div>
  );
}
