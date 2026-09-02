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
  const parts = [{ name: `${t("和紙")} ×${sheets}`, outline: g.outline, marks: g.marks, guides: g.guides }];
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
 * The same sheets `washiPDF` writes, as SVG. **Nothing in the app draws these** — the washi template
 * has no preview; what keeps it here is `check:paper` section 6, comparing the hand-rolled PDF
 * against it path by path, markup being the encoding you can assert on. The very same `pagesSVG` as
 * every other sheet: the moment it is a second drawing, the comparison is worthless.
 */
export function washiPagesSVG(p: Design, opts: WashiOpts = {}, t: T = tid, page: Page & { name?: string } = A4) {
  const { parts } = washiParts(p, opts, t);
  return pagesSVG(parts, page, t);
}
