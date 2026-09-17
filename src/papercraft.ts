/**
 * The cardboard route's 1:1 A4 templates, as a barrel: the implementation is one module per job in
 * `src/paper/`, and callers import from HERE, never from `./paper/*` — the same rule `geometry.ts`
 * carries, so a function moving between those modules stays a non-event.
 *
 * Dependencies run one way: layout ← draw ← render ← {mold, skin}, with style, svg and advice as
 * leaves.
 * React/DOM-free (stl.ts opens or downloads the bytes).
 *
 * **The app reaches for the bottom two lines; the row above them is `check:paper`'s.** A gate has to
 * be able to ask the layout what it decided — where the corner went, how wide the box is, how far a
 * note hangs outside its part — and the rule against importing `./paper/*` applies to the check
 * scripts too, they being callers like any other. Exported deliberately rather than reached around,
 * so a function moving between those modules stays a non-event for the gate as well.
 */
export { A4, MARGIN, TOPBAR, ADVICE_PAD, layout, corner, adviceBox, strip } from "./paper/layout.ts";
export { adviceLines } from "./paper/advice.ts";
export { noteOverflow } from "./paper/draw.ts";
export { STYLE } from "./paper/style.ts";
export { paperP, paperFit, paperParts, paperPagesSVG, paperPDF } from "./paper/mold.ts";
export { washiParts, washiPDF, washiPagesSVG } from "./paper/skin.ts";

import { A4, layout, type Overflow } from "./paper/layout.ts";
import { adviceLines } from "./paper/advice.ts";
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
 * clipped away with no seam, no extra sheet and nothing on screen. Both documents are previewed
 * now, but a clip is exactly the thing a preview does not announce: the sheet looks complete and
 * the cut line simply stops at the trim box. This names the part and the overhang.
 */
export function templateOverflow(p: Design, matT: number, opts: WashiOpts, route: Route, t: T = tid): Overflow[] {
  const out: Overflow[] = [];
  if (route === "paper") out.push(...layout(paperParts(p, matT, t).parts, A4, adviceLines(t)).over);
  // The washi template rides along on BOTH routes, cut for the mold that route actually makes.
  out.push(...layout(washiParts(route === "paper" ? paperP(p, matT) : p, opts, t).parts, A4, adviceLines(t)).over);
  return out;
}
