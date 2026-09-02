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
