/**
 * The cardboard route's 1:1 A4 templates, as a barrel: the implementation is one module per job in
 * `src/paper/`, and callers import from HERE, never from `./paper/*` — the same rule `geometry.ts`
 * carries, so a function moving between those modules stays a non-event.
 *
 * Dependencies run one way: layout ← draw ← render ← {mold, skin}, with style and svg as leaves.
 * React/DOM-free (stl.ts opens or downloads the bytes).
 */
export { A4, MARGIN, TOPBAR } from "./paper/layout.ts";
export { STYLE } from "./paper/style.ts";
export { pagesPDF } from "./paper/render.ts";
export { paperP, paperFit, paperParts, paperPagesSVG, paperPDF } from "./paper/mold.ts";
export { washiParts, washiPDF, washiPagesSVG } from "./paper/skin.ts";
export type { Overflow } from "./paper/layout.ts";

import { A4, layout, type Overflow } from "./paper/layout.ts";
import { paperP, paperParts } from "./paper/mold.ts";
import { washiParts } from "./paper/skin.ts";
import { tid } from "./paper/render.ts";
import type { WashiOpts } from "./geometry.ts";
import type { T } from "./i18n.ts";
import type { Design, Route } from "./types.ts";

/**
 * Every part of the templates THIS route ships that no orientation fits across the sheet.
 *
 * A function rather than a re-export because it spans both documents, and `mold` and `skin` are
 * siblings that must not import each other. It exists at all because the overhang is otherwise
 * invisible: `layout` splits pages downward only, so a part wider than the content column is
 * clipped away with no seam, no extra sheet and nothing on screen — and the washi template has no
 * preview, so its panel can come out short with nothing to look at first.
 */
export function templateOverflow(p: Design, matT: number, opts: WashiOpts, route: Route, t: T = tid): Overflow[] {
  const out: Overflow[] = [];
  if (route === "paper") out.push(...layout(paperParts(p, matT, t).parts, A4).over);
  // The washi template rides along on BOTH routes, cut for the mold that route actually makes.
  out.push(...layout(washiParts(route === "paper" ? paperP(p, matT) : p, opts, t).parts, A4).over);
  return out;
}
