// The peer of `pdf.ts`: it reads the same op list and must draw it the same way, which is what
// `check:paper` section 6 compares coordinate by coordinate.
import type { Op, Page } from "../io/pdf.ts";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ESC[c]);
// 2dp where the PDF's `n3` rounds to 3dp. That difference is deliberate and the `check:paper`
// comparison carries a tolerance for it, so the two roundings must never be unified into one helper.
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** Ops → one page's SVG. The clip is an SVG clipPath; ops already carry absolute page coordinates. */
export function pageSVG(ops: Op[], i: number, page: Page): string {
  const body: string[] = [];
  let clipped: boolean | null = null;
  for (const op of ops) {
    if (op.k === "clip") {
      body.push(`<defs><clipPath id="clip${i}"><rect x="${n2(op.x)}" y="${n2(op.y)}" width="${n2(op.w)}" height="${n2(op.h)}"/></clipPath></defs>`
        + `<g clip-path="url(#clip${i})">`);
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
