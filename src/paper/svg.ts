// The peer of `pdf.ts`: it reads the same op list and must draw it the same way, which is what
// `check:paper` section 6 compares coordinate by coordinate.
import type { Op, Page } from "../io/pdf.ts";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ESC[c]);
// 2dp where the PDF's `n3` rounds to 3dp. That difference is deliberate and the `check:paper`
// comparison carries a tolerance for it, so the two roundings must never be unified into one helper.
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

/**
 * Ops → one page's SVG. The clip is an SVG clipPath; ops already carry absolute page coordinates.
 *
 * **`doc` is in the clipPath's id because an id is unique per HTML DOCUMENT, and `i` is only unique
 * per template.** The preview renders BOTH templates into one page (`ui/PagePreview.tsx`), so with
 * the id `clip0` on each, the washi sheet's `url(#clip0)` resolved to the cardboard sheet's clip —
 * the first matching id in the DOM wins — and the washi part was clipped to the wrong band: 234mm
 * instead of 287, losing the bottom 84mm at a 400px width. And a clip is the one defect a preview
 * does not announce, because the cut line simply stops at the trim box. The PDF was never affected:
 * it clips with `W n re W n`, which has no name to collide.
 */
export function pageSVG(ops: Op[], i: number, page: Page, doc: string): string {
  const body: string[] = [];
  const cid = `clip-${doc}${i}`;
  let clipped: boolean | null = null;
  for (const op of ops) {
    if (op.k === "clip") {
      body.push(`<defs><clipPath id="${cid}"><rect x="${n2(op.x)}" y="${n2(op.y)}" width="${n2(op.w)}" height="${n2(op.h)}"/></clipPath></defs>`
        + `<g clip-path="url(#${cid})">`);
      clipped = true;
    } else if (op.k === "unclip") { body.push("</g>"); clipped = false; }
    else if (op.k === "path") {
      body.push(`<path d="${op.pts.map(([x, y], j) => `${j ? "L" : "M"}${n2(x)} ${n2(y)}`).join("")}${op.close ? "Z" : ""}" class="${op.style}"/>`);
    } else if (op.k === "text") {
      body.push(`<text x="${n2(op.x)}" y="${n2(op.y)}" class="${op.style}">${esc(op.str)}</text>`);
    }
  }
  if (clipped) body.push("</g>");
  return `<svg class="pg" width="${page.w}mm" height="${page.h}mm" viewBox="0 0 ${page.w} ${page.h}" xmlns="http://www.w3.org/2000/svg">`
    + body.join("") + `</svg>`;
}
