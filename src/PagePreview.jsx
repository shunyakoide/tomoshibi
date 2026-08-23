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
 * `WashiPreview` at the bottom is the same idea for the **3D-print route**, which has no document
 * view of its own: its washi template goes straight into the kit ZIP, so it was the one sheet the app
 * produces that you could never look at before downloading it. It docks at the side of the plate
 * view instead of covering it — the plates are still the subject there, the washi is what comes out
 * of the paper printer alongside them.
 * ============================================================================
 */
import React, { useDeferredValue, useMemo } from "react";
import { paperPagesSVG, washiPagesSVG } from "./papercraft.js";
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
        <span> — {t("画面上は原寸ではありません。PDF をダウンロードして原寸で印刷してください。")}</span>
      </div>
    </div>
  );
}

/**
 * The washi template's sheets, docked beside the 3D route's plate view. Same sheets as
 * `tomoshibi_washi_a4.pdf` in the kit ZIP, through the same renderer — so this is the file, not a
 * picture of it. Absolutely positioned rather than laid over the whole viewport, because the plates
 * remain the subject of this view and the camera behind it has to stay draggable.
 */
export function WashiPreview({ p, washi, lang }) {
  const t = useT();
  const dp = useDeferredValue(p);   // same reason as above: a slider drag would ask for this 60×/s
  const { svg, css, pages } = useMemo(
    () => washiPagesSVG(dp, washi, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is derived from lang (new identity per render)
    [dp, washi.side, washi.end, lang],
  );

  return (
    <div className="pages pages-dock">
      <style>{css}</style>
      <div className="pages-dock-cap">{t("和紙の型紙")}{pages > 1 ? ` · ${pages}p` : ""}</div>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
