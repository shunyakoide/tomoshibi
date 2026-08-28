/**
 * ============================================================================
 * MINIMAL PDF WRITER (PDF)
 * ============================================================================
 * Writes a vector-only, self-contained PDF at exact 1:1 scale with no dependencies (same spirit as
 * the hand-rolled ZIP in stl.ts). It takes the **same drawing-op list the SVG renderer consumes**
 * (papercraft.ts `pageOps`), so the PDF and the printed HTML are literally the same drawing — the
 * template can't be full scale in one and off in the other.
 *
 * [Coordinates] Ops are in **mm with y DOWN from the sheet's top-left** (the SVG convention). Each
 *   page sets one CTM that flips y and scales mm→pt, so every number below stays in mm. Text sets
 *   its own flipped text matrix so the glyphs come out upright.
 * [Text] Base-14 Helvetica only. A self-contained PDF cannot carry a CJK font (embedding one would
 *   dwarf the whole file), so the caller renders the PDF with the **English** translator and
 *   `winAnsi()` folds the few remaining symbols (←, ▼, ×…) into WinAnsi. Nothing on paper depends on
 *   this text — it is the part label, the ruler note and the page footer.
 * ============================================================================
 */

import type { Pt2 } from "./types.ts";

/**
 * ---- The drawing language both renderers speak ----
 * A page is a list of ops in mm, y down from the sheet's top-left; papercraft.ts produces them and
 * this file (PDF) and `pageSVG` (SVG) are the only two things that read them. The vocabulary is
 * declared HERE, by a renderer, rather than by the producer: a renderer can only draw what it knows
 * how to draw, and an op it has never heard of is a line that silently does not print.
 *
 * The style names are split into stroke names and text names for the same reason. They are not
 * decoration — `pname` has no stroke and `cut` has no font size, so a path op drawn with a text
 * style loses its colour and width. Splitting the two makes that combination fail to compile
 * instead of printing a hairline where a cut line belongs.
 */
export type StrokeName = "cut" | "tick" | "guide" | "scale" | "frame" | "join";
export type TextName = "pname" | "note" | "jlabel";
export type StrokeStyle = { stroke: string; w: number; dash?: number[] };
export type TextStyle = { fill: string; size: number; anchor: "start" | "middle" | "end" };
export type StyleTable = Record<StrokeName, StrokeStyle> & Record<TextName, TextStyle>;

export type Op =
  /** Clip everything that follows to this rectangle, until the matching unclip. */
  | { k: "clip"; x: number; y: number; w: number; h: number }
  | { k: "unclip" }
  /** A polyline; `close` draws it as a closed loop. */
  | { k: "path"; pts: Pt2[]; style: StrokeName; close?: boolean }
  /** One line of text, positioned by its style's anchor. */
  | { k: "text"; x: number; y: number; str: string; style: TextName };

/** A sheet's size in mm (A4 here, but nothing below assumes it). */
export type Page = { w: number; h: number };

// Advance widths (1/1000 em) for Helvetica, ASCII 32..126. Used to place centred / right-aligned
// text: without real metrics the footer would drift off the margin.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
// Symbols the UI uses that have no WinAnsi code point → ASCII stand-ins. "×" (U+00D7) is kept: it
// is a single WinAnsi byte (0xD7).
const FOLD: Record<string, string> = { "←": "<-", "→": "->", "↑": "^", "▼": "v", "⚠": "!", "·": "-", "—": "-", "–": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "≥": ">=", "≤": "<=" };
/** Fold a UI string down to WinAnsi. Anything still unrepresentable is dropped rather than written
 *  as a broken byte (the alternative — mojibake on paper — is worse than a missing symbol). */
export function winAnsi(s: unknown): string {
  let out = "";
  for (const ch of String(s)) {
    const r = FOLD[ch] ?? ch;
    for (const c of r) {
      const n = c.charCodeAt(0);
      if (n >= 0x20 && n <= 0x7e) out += c;              // ASCII
      else if (n >= 0xa0 && n <= 0xff) out += c;          // Latin-1 upper half = WinAnsi there
    }
  }
  return out;
}
/** Width of a WinAnsi string in mm at the given font size (mm). */
function textWidth(s: string, size: number): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    w += (n >= 32 && n <= 126 ? HELV[n - 32] : 556) / 1000;
  }
  return w * size;
}

const MM = 72 / 25.4;                                     // mm → pt
const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString();
const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c);
// Latin-1 bytes (NOT UTF-8): WinAnsi codes above 127 must go out as single bytes.
const lat1 = (s: string) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return u; };

// One op list → a PDF content stream (mm, y-down; the page CTM below does the flip).
function contentOf(ops: Op[], style: StyleTable): string {
  const out: string[] = [];
  let cur: string | null = null;
  for (const op of ops) {
    if (op.k === "clip") { out.push(`q ${n3(op.x)} ${n3(op.y)} ${n3(op.w)} ${n3(op.h)} re W n`); continue; }
    if (op.k === "unclip") { out.push("Q"); cur = null; continue; }
    if (op.k === "path") {
      const st = style[op.style];
      if (cur !== op.style) {                             // set stroke state only when it changes
        const [r, g, b] = rgb(st.stroke || "#000");
        out.push(`${n3(r)} ${n3(g)} ${n3(b)} RG ${n3(st.w ?? 0.25)} w [${(st.dash || []).map(n3).join(" ")}] 0 d`);
        cur = op.style;
      }
      out.push(op.pts.map(([x, y], i) => `${n3(x)} ${n3(y)} ${i ? "l" : "m"}`).join(" ") + (op.close ? " h S" : " S"));
    } else if (op.k === "text") {
      const st = style[op.style];
      const s = winAnsi(op.str);
      if (!s) continue;
      const w = textWidth(s, st.size);
      const x = op.x - (st.anchor === "middle" ? w / 2 : st.anchor === "end" ? w : 0);
      const [r, g, b] = rgb(st.fill || "#000");
      // The page CTM is y-flipped, so the text matrix flips back (otherwise the glyphs are mirrored).
      out.push(`BT ${n3(r)} ${n3(g)} ${n3(b)} rg /F1 ${n3(st.size)} Tf 1 0 0 -1 ${n3(x)} ${n3(op.y)} Tm (${esc(s)}) Tj ET`);
      cur = null;                                          // BT/ET doesn't reset stroke state, but keep it simple
    }
  }
  return out.join("\n");
}

/**
 * Build the PDF. `pages` is a list of op lists (see papercraft.ts `pageOps`), `page` is {w,h} in mm,
 * `style` is the shared style table. Returns the file as a Uint8Array.
 */
export function buildPDF(pages: Op[][], page: Page, style: StyleTable, title = ""): Uint8Array {
  const W = page.w * MM, H = page.h * MM;
  const objs: (string | null)[] = [];                                        // 1-based: objs[i] is object i+1
  const add = (body: string | null) => { objs.push(body); return objs.length; };
  const catalog = add(null), pagesObj = add(null), font = add("<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>");
  const kids: number[] = [];
  for (const ops of pages) {
    // mm, y down from the top-left: scale by MM and flip y about the page height.
    const content = `q ${n3(MM)} 0 0 ${n3(-MM)} 0 ${n3(H)} cm\n${contentOf(ops, style)}\nQ`;
    const cid = add(`<</Length ${lat1(content).length}>>\nstream\n${content}\nendstream`);
    const pid = add(`<</Type/Page/Parent ${pagesObj} 0 R/MediaBox[0 0 ${n3(W)} ${n3(H)}]`
      + `/Resources<</Font<</F1 ${font} 0 R>>>>/Contents ${cid} 0 R>>`);
    kids.push(pid);
  }
  objs[catalog - 1] = `<</Type/Catalog/Pages ${pagesObj} 0 R>>`;
  objs[pagesObj - 1] = `<</Type/Pages/Kids[${kids.map((k) => `${k} 0 R`).join(" ")}]/Count ${kids.length}>>`;
  const info = add(`<</Producer(Tomoshibi)/Title(${esc(winAnsi(title))})>>`);

  const chunks: Uint8Array[] = [];
  let len = 0;
  const push = (s: string) => { const b = lat1(s); chunks.push(b); len += b.length; };
  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");                  // binary comment: marks the file as binary
  const offsets: number[] = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(len);
    push(`${i + 1} 0 obj\n${objs[i]}\nendobj\n`);
  }
  const xref = len;
  push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join(""));
  push(`trailer\n<</Size ${objs.length + 1}/Root ${catalog} 0 R/Info ${info} 0 R>>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(len);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}
