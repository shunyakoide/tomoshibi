/**
 * Its own document on BOTH routes, never pages spliced into the cardboard template: the two are
 * printed at different moments, and `pagesPDF` numbers and seams the sheets of ONE document.
 *
 * Named `skin.ts` because `src/geometry/washi.ts` — which computes the gore — already owns `washi`.
 */
import { washiGore } from "../geometry.ts";
import { A4 } from "./layout.ts";
import { pagesPDF, pagesSVG, tid } from "./render.ts";
import type { WashiOpts } from "../geometry.ts";
import type { Page } from "../io/pdf.ts";
import type { Design } from "../types.ts";
import type { T } from "../i18n.ts";

// One sheet = the surface between two adjacent ribs, developed flat (geometry.ts `washiGore`).
// All panels are identical, so a single template is laid out and cut N times — and because washi is
// translucent, the sheet is meant to be slipped UNDER the paper and traced, not glued onto it.
export function washiParts(p: Design, opts: WashiOpts = {}, t: T = tid) {
  const g = washiGore(p, opts);
  const sheets = Math.ceil(Math.max(3, p.boards || 8) / g.span);
  // Number stays outside t() so the default name still contains the plain word (same as the ribs).
  // The advice, on the one sheet where a mistake costs material you cannot re-cut: this panel is
  // computed from the DESIGN, and the mold in your hands is a print or a hand-cut board, so the two
  // can differ. Offered up first, the difference is a pencil line; found after the washi is cut, it
  // is a sheet of washi. It belongs to the document rather than to a line on the panel — one panel is
  // the whole document — so it is set in the corner (`RawPart.advice`), which on these sheets is the
  // room beside the panel: a gore is narrow and leaves most of the width.
  //
  // The only advice line with NO part name in front of it, and 「この型」 is why: it names the sheet
  // the reader is holding. A label exists to say which of several parts a sentence is about, and this
  // document has one part — 「和紙: 和紙を切る前に…」 would only say the word twice.
  const parts = [{ name: `${t("和紙")} ×${sheets}`,
    advice: t("和紙を切る前にこの型を当てて寸法を確認"),
    outline: g.outline, marks: g.marks, guides: g.guides }];
  return { parts, g, sheets };
}

/**
 * The washi panels as a **print-ready PDF** (Uint8Array) — the file bundled in the download either
 * route produces. On the cardboard route, hand it `paperP(p, matT)`: the panel width follows the rib
 * count, which that route can clamp. `t` defaults to the identity (= Japanese); every character it
 * can produce has an outline in pdf.ts, which tools/pdffont keeps true.
 */
export function washiPDF(p: Design, opts: WashiOpts = {}, page = A4, t: T = tid): Uint8Array {
  const { parts } = washiParts(p, opts, t);
  return pagesPDF(parts, page, t, t("TOMOSHIBI 和紙型紙 {name} 原寸", { name: page.name }));
}

/**
 * The same sheets `washiPDF` writes, as SVG. Two callers, and they want the same thing of it:
 * `check:paper` section 6 compares the hand-rolled PDF against this markup path by path (markup
 * being the encoding you can assert on), and the print view draws it beside the cardboard template
 * (`ui/PagePreview.tsx`). The very same `pagesSVG` as every other sheet — the moment it is a second
 * drawing, both the comparison and the preview are worthless.
 */
export function washiPagesSVG(p: Design, opts: WashiOpts = {}, t: T = tid, page: Page & { name?: string } = A4) {
  const { parts } = washiParts(p, opts, t);
  return pagesSVG(parts, page, t);
}
