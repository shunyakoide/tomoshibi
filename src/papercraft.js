/**
 * ============================================================================
 * PAPERCRAFT — 1:1 printable pages for building the mold from cardboard/thick paper
 * ============================================================================
 * So the mold can be made without a 3D printer, this generates printable HTML that
 * lays out each part's 2D outline at **full scale (1:1)** on A4. Open it in the browser,
 * print at "no scaling (100%)", glue to cardboard, and cut it out to assemble the same mold.
 *
 * Design policy:
 * ・The shape comes **only** from geometry.js's pure functions. Don't reimplement dimensions here
 *   (same rule as SectionEditor; a mismatch here would make the papercraft and STL molds differ).
 * ・**Don't cut the grooves (higo-me)**. A 0.5mm-precision V-notch can't be scored into cardboard, so the
 *   outer edge is cut as a smooth curve (`ribOutline2D(p,k,{smooth:true})`), and the bamboo-rib winding
 *   positions are shown as dashed **tick lines**. The groove positions themselves come from the same `grooveList()` as the STL.
 * ・The material thickness `matT` is the measured cardboard thickness. Since it sets the koma notch width,
 *   pass `{...p, boardT: matT, komaT: matT, fit: 0}` **the same way to every part** so the parts within the
 *   papercraft always mesh together (the 3D-side p is never modified). `fit=0` means adding no print
 *   tolerance; cardboard crushes its fibers going in, so a snug nominal fit meshes more firmly.
 * ・**Don't emit the stand**. The 3D-print stand is designed to support the koma on thin posts, which in
 *   cardboard lacks the rigidity to stand on its own (it crushes/bends). Rather than printing a half-baked
 *   stand, the papercraft is limited to "the mold itself (ribs + koma)". Users are expected to provide their own stand.
 *
 *
 * The **washi template** (`washiParts` / `washiPDF`) — the flat pattern of the paper skin itself, so
 * the washi can be cut BEFORE pasting instead of trimmed after — rides along with both routes rather
 * than being a separate download: it is laid out among the cardboard pages here, and exported as a
 * PDF inside the kit ZIP for the 3D-printed mold.
 *
 * Every page is built once as a list of drawing ops (`pageOps`) and then rendered as **SVG for the
 * browser** or as **PDF for the kit ZIP** (pdf.js). One drawing, two encodings — a full-scale bug
 * cannot hide in only one of them.
 *
 * A React/DOM-free pure module (returns strings / byte arrays; stl.js opens or downloads them).
 * ============================================================================
 */
import {
  ribOutline2D, grooveList, grooveR, outerR, komaShape, maxBoards, tabDented, notchR, washiGore,
} from "./geometry.js";
import { buildPDF } from "./pdf.js";

// Default translator: an interpolating identity (returns the Japanese key, substituting {name}
// placeholders). The UI passes the real i18n `t` (which looks up English); callers that omit it
// — including the verification scripts — get the Japanese page. Keeping this module React/DOM-free.
const tid = (s, params) => (params ? Object.keys(params).reduce((a, k) => a.split("{" + k + "}").join(params[k]), s) : s);

// ---- Paper (A4) ----
export const A4 = { w: 210, h: 297, name: "A4" };
const MARGIN = 8;    // Paper edge margin (mm). Outside the non-printable area (~5mm) of most home printers.
const FOOTER = 14;   // Height of the info band at the bottom of the page (page number, full-scale check ruler) (mm)
const OVERLAP = 10;  // "Glue tab" for parts spanning pages (mm). The top of the next page overlaps by this much.
const GAP = 6;       // Gap between parts (mm). Margin for cutting them apart.
const TICK = 5;      // Length of the bamboo-rib tick line (mm). Drawn inward from the outer edge.

// ---- Tab-tip dent (koma stop) ----
// The koma stop is the tab-tip inner-corner dent (both tabs) mated to the koma's shallow notch, shared
// with the 3D print via geometry.js (ribOutline2D dents the tabs, komaShape/notchR match it). Nothing
// cardboard-specific to tune: the dent is a fixed size and applies whenever tabDented(pk) has room.

// Bounding box of a point list
function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * Normalize a part into page coordinates ("y downward, origin = top-left of the bounding box").
 * geometry.js is y-up and SVG is y-down, so flip once here and handle it straightforwardly afterward.
 * rot=true rotates 90° first to make it portrait (for parts that don't fit the paper width when landscape).
 */
function toPage(part, rot) {
  const conv = ([x, y]) => (rot ? [y, -x] : [x, y]);   // 90° rotation (keeping y-up)
  const all = [part.outline, ...(part.holes || []), ...(part.guides || [])].flat()
    .concat((part.marks || []).flatMap((m) => [[m[0], m[1]], [m[2], m[3]]]));
  const b = bbox(all.map(conv));
  const fix = (q) => { const [x, y] = conv(q); return [x - b.x0, b.y1 - y]; }; // flip y
  return {
    name: part.name,
    outline: part.outline.map(fix),
    holes: (part.holes || []).map((hh) => hh.map(fix)),
    guides: (part.guides || []).map((g) => g.map(fix)),
    marks: (part.marks || []).map((m) => [...fix([m[0], m[1]]), ...fix([m[2], m[3]])]),
    w: b.w, h: b.h,
  };
}

// ============ Each part's 2D outline (all derived from geometry.js) ============

// Rib: a smooth outer edge with no grooves carved + tick lines at the bamboo-rib winding positions.
// No lightening windows (cardboard is light, and windows only weaken it and add cutting effort).
function ribPart(pk, k, name, t) {
  const h = pk.height;
  const outline = ribOutline2D(pk, k, { smooth: true });
  // Tick line positions use the same basis as the STL grooves (grooveList). Horizontal lines TICK mm inward from the outer edge.
  // With spiral winding the grooves shift per rib, so pass k (mark them at the same positions as 3D).
  const marks = grooveList(pk, grooveR(pk), k).map((y) => {
    const x = outerR(pk, Math.min(Math.max(y, 0), h) / h);
    return [x, y, x - TICK, y];
  });
  return { name, outline, marks };
}

// Koma: the same komaShape as 3D (= same notch bottom notchR, same notch width). Only the thickness differs.
function komaPart(pk, name) {
  const pts = komaShape(pk).extractPoints(1).shape.map((v) => [v.x, v.y]);
  return { name, outline: pts };
}

/**
 * Build all parts to lay out on the papercraft. The returned p is "the papercraft p with material thickness applied".
 * Depending on material thickness, boards may exceed maxBoards (the notches overlap at the center), so always clamp it,
 * and return whether it was clamped in `clamped` so the UI/page can warn.
 */
export function paperParts(p, matT, t = tid, washiOpts = {}) {
  // fit=0: add no print tolerance (nominal = exactly the material thickness). Cardboard crushes its fibers going in, so
  // adding the 3D-print fit (0.3mm default) would instead make it wobble and the tab couldn't hold the koma.
  // noTabDent: cardboard skips the tab-tip dent (the koma stop) — cardboard favors keeping the tab strong (the
  // dent removes tab material) over the inward stop; the koma notch then stays full-depth so the plain tab fits.
  const pk = { ...p, boardT: matT, komaT: matT, fit: 0, noTabDent: true };
  const nMax = maxBoards(pk);
  const clamped = pk.boards > nMax;
  if (clamped) pk.boards = nMax;

  // All ribs are identical unless spiral winding shifts the groove (tick) positions per rib. When they
  // are identical, emit a single rib labeled "×N" (cut N copies) instead of N duplicate sheets.
  const ribParts = [];
  if (pk.spiral) {
    for (let k = 0; k < pk.boards; k++) ribParts.push(ribPart(pk, k, `${t("羽根板")} ${k + 1}/${pk.boards}`, t));
  } else {
    ribParts.push(ribPart(pk, 0, `${t("羽根板")} ×${pk.boards}`, t)); // Number stays outside t() so the default name still contains the plain word for the tests.
  }
  // Koma: two identical sheets (top & bottom) normally. But if two komas would spill onto an extra page
  // (a wasteful koma-only page after the ribs), fall back to a single "×2" sheet. Decided by comparing the
  // page count on A4 (the print page).
  const twoKoma = [komaPart(pk, `${t("コマ")} 1/2`), komaPart(pk, `${t("コマ")} 2/2`)];
  const oneKoma = [komaPart(pk, `${t("コマ")} ×2`)];
  // The washi panel ships with the cardboard template too. Someone building the mold out of cardboard
  // needs the paper skin just as much, and they never open the STL ZIP (where the PDF rides). Built
  // from pk, so the panel width follows the possibly-clamped rib count = the mold this sheet makes.
  const washiSheets = washiParts(pk, washiOpts, t).parts;
  const pageCount = (ks) => layout([...ribParts, ...ks, ...washiSheets], A4).pages.length;
  const komas = pageCount(twoKoma) > pageCount(oneKoma) ? oneKoma : twoKoma;
  const parts = [...ribParts, ...komas, ...washiSheets];
  // Wall thickness remaining between the koma's notches (at the notch bottom = notchR). Thicker material
  // widens the notches, thinning the wall. The shape isn't changed (we don't silently reduce the count),
  // but if it's at a level that would tear when hand-cut (less than half the material thickness), note it on
  // the page so the user has grounds to choose count/material/opening.
  const wall = (2 * Math.PI * notchR(pk)) / pk.boards - matT;
  return { parts, pk, clamped, nMax, wall };
}

// ============ Page layout ============
// Done in two stages. (1) Pack parts top-down into "rows" without considering pages. (2) Assign rows to pages.
//
// Layout principle: **never let a row that fits on one page span pages**. If it doesn't fit, just start the next page at
// the top of that row, with no glue tab needed (cut it out without gluing paper together). A glue tab is needed only for
// "a row taller than one page" = a part that doesn't fit on one sheet, like a long rib, and only then do pages overlap by
// OVERLAP. Previously all pages overlapped uniformly, so a glue-tab band appeared on every page even with no spanning part,
// and the effective height was wastefully reduced by OVERLAP too.
function layout(parts, page) {
  const CW = page.w - 2 * MARGIN;              // content width
  const CH = page.h - 2 * MARGIN - FOOTER;     // content height (usable height per page)

  // --- (1) Pack into rows ---
  const placed = [], rows = [];
  let y = 0, rowX = 0, rowH = 0;
  const endRow = () => { if (rowH > 0) { rows.push({ y, h: rowH }); y += rowH + GAP; rowX = 0; rowH = 0; } };
  for (const raw of parts) {
    // A landscape part that doesn't fit the paper width is rotated 90° to portrait
    let q = toPage(raw, false);
    if (q.w > CW) { const r = toPage(raw, true); if (r.w <= CW) q = r; }
    if (rowX > 0 && rowX + q.w > CW) endRow();   // wrap to a new row when the width runs out
    placed.push({ ...q, x: rowX, y });
    rowX += q.w + GAP;
    rowH = Math.max(rowH, q.h);
  }
  endRow();

  // --- (2) Assign rows to pages ---
  const pages = [];
  let cur = null;
  for (const r of rows) {
    if (r.h > CH) {
      // A row that doesn't fit on one page → raise as many pages as needed, overlapping by the glue tab
      for (let t = r.y; t < r.y + r.h; t += CH - OVERLAP) pages.push({ top: t, row: r });
      cur = pages[pages.length - 1];  // if the last page has room, put the next row on it too
    } else if (!cur || r.y + r.h > cur.top + CH) {
      cur = { top: r.y, row: r };     // doesn't fit on the current page → start the next page at this row
      pages.push(cur);
    }
  }
  if (!pages.length) pages.push({ top: 0, row: null });
  // Bottom edge of each page. Only when **the next page continues the same row** (= splitting a part that doesn't fit on
  // one sheet) do we draw to the full CH and overlap the next page by OVERLAP (the glue tab). Otherwise cut at "the position
  // where the next page begins" → the head of the next row doesn't intrude into the previous page.
  // (Without this distinction, the next row would bleed into the bottom of a spanning page, producing a glue tab even where
  //  no gluing is needed, making it look like "every page overlaps".)
  pages.forEach((pg, i) => {
    const next = pages[i + 1];
    pg.bot = !next || (pg.row && next.row === pg.row) ? pg.top + CH : Math.min(pg.top + CH, next.top);
  });
  return { placed, CW, CH, pages };
}

// ============ Page drawing (shared by the SVG and PDF renderers) ============
// A page is built once as a list of **drawing ops in mm page coordinates** (y down from the sheet's
// top-left), and the two renderers only translate ops into their own syntax. The rules that decide
// whether the print is usable — the clip band, the glue tab, the 50mm ruler, the registration
// crosses — therefore exist exactly once, and the PDF cannot silently disagree with the HTML.
//
// Line/text styles live here too (not in the stylesheet) for the same reason: the CSS block is
// generated from this table, and the PDF reads the same numbers.
const STYLE = {
  cut: { stroke: "#000", w: 0.25 },                              // cut line
  tick: { stroke: "#000", w: 0.25, dash: [1.2, 1] },             // bamboo-rib ticks (do not cut)
  guide: { stroke: "#777", w: 0.25, dash: [4, 2.5] },            // alignment guides (do not cut)
  reg: { stroke: "#000", w: 0.2 },                               // registration marks / scale
  glue: { stroke: "#888", w: 0.2, dash: [3, 2] },                // page-overlap (glue tab) line
  pname: { fill: "#999", size: 3.4, anchor: "middle" },          // part name, faint, inside the part
  note: { fill: "#888", size: 2.6, anchor: "start" },
  foot: { fill: "#666", size: 2.8, anchor: "end" },
};
const styleCSS = () => Object.entries(STYLE).map(([k, s]) => (s.size
  ? `.${k} { font-size: ${s.size}px; fill: ${s.fill}; text-anchor: ${s.anchor}; font-family: sans-serif }`
  : `.${k} { fill: none; stroke: ${s.stroke}; stroke-width: ${s.w}${s.dash ? `; stroke-dasharray: ${s.dash.join(" ")}` : ""} }`)).join("\n  ");

/** Ops for page i. The [top, top+CH] band of content coordinates lands inside the clip rectangle. */
function pageOps(lay, i, page, info, t) {
  const { top, bot } = lay.pages[i];
  const ops = [];
  const path = (pts, style, close = false) => ops.push({ k: "path", pts, style, close });
  const text = (x, y, str, style) => ops.push({ k: "text", x, y, str, style });

  // Parts, clipped to the page band. Without the clip a spanning part bleeds into the bottom info
  // band and the neighbouring page's content prints on this sheet.
  ops.push({ k: "clip", x: MARGIN, y: MARGIN, w: lay.CW, h: bot - top });
  const ox = MARGIN, oy = MARGIN - top;                          // content → page coordinates
  for (const q of lay.placed) {
    if (q.y >= bot || q.y + q.h <= top) continue;                // not in this band
    const at = ([x, y]) => [ox + q.x + x, oy + q.y + y];
    path(q.outline.map(at), "cut", true);
    for (const hh of q.holes) path(hh.map(at), "cut", true);
    for (const gd of q.guides || []) path(gd.map(at), "guide");  // open polyline: a guide, not a cut
    for (const m of q.marks) path([at([m[0], m[1]]), at([m[2], m[3]])], "tick");
    // The part name goes faintly **inside the part** for identification after cutting. Placed near
    // the top it would land on the "cut-away side" like a post's U-saddle, so place it slightly
    // below center (62%) where material remains.
    text(ox + q.x + q.w / 2, oy + q.y + q.h * 0.62, q.name, "pname");
  }
  ops.push({ k: "unclip" });

  // Registration marks (crosses in the four corners). Used to align when gluing sheets together.
  for (const [x, y] of [[MARGIN, MARGIN], [MARGIN + lay.CW, MARGIN], [MARGIN, MARGIN + lay.CH], [MARGIN + lay.CW, MARGIN + lay.CH]]) {
    path([[x - 3, y], [x + 3, y]], "reg");
    path([[x, y - 3], [x, y + 3]], "reg");
  }
  // Glue-tab band. Drawn only when the next page intrudes into this page's band (= a part spans
  // pages). If no part spans, pages don't overlap, so neither the line nor the note appears.
  const next = lay.pages[i + 1];
  const glueTop = next && next.top < bot ? next.top : null;
  if (glueTop != null) {
    const gy = MARGIN + (glueTop - top);
    path([[MARGIN, gy], [MARGIN + lay.CW, gy]], "glue");
    text(MARGIN + 2, gy - 1.5, t("▼ここから下は次のページと重なります(のりしろ)"), "note");
  }
  // Full-scale check ruler (50mm). Always verify with a ruler that no printer scaling was applied.
  const sy = page.h - MARGIN - 5, sx = MARGIN;
  path([[sx, sy], [sx + 50, sy]], "reg");
  path([[sx, sy - 2], [sx, sy + 2]], "reg");
  path([[sx + 25, sy - 1.5], [sx + 25, sy + 1.5]], "reg");
  path([[sx + 50, sy - 2], [sx + 50, sy + 2]], "reg");
  text(sx + 53, sy + 1.5, t("50mm ← 定規で確認(合わなければ「実際のサイズ/100%」で印刷し直し)"), "note");
  text(page.w - MARGIN, sy + 1.5, `${info.title} — ${i + 1} / ${info.pages}`, "foot");
  return ops;
}

// ============ SVG / HTML generation ============
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const n2 = (v) => (Math.round(v * 100) / 100).toString();

/** Ops → one page's SVG. The clip is an SVG clipPath; ops already carry absolute page coordinates. */
function pageSVG(lay, i, page, info, t) {
  const body = [];
  let clipped = null;
  for (const op of pageOps(lay, i, page, info, t)) {
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

/**
 * Parts → a print-ready PDF (Uint8Array) of the same pages the HTML shows. `t` should be the
 * **English** translator: the PDF carries base-14 Helvetica only, so Japanese labels cannot be drawn
 * (see pdf.js). Nothing dimensional depends on the labels — the drawing itself is identical.
 */
export function pagesPDF(parts, page, t, title) {
  const lay = layout(parts, page);
  const info = { pages: lay.pages.length, title };
  const pages = [];
  for (let i = 0; i < lay.pages.length; i++) pages.push(pageOps(lay, i, page, info, t));
  return buildPDF(pages, page, STYLE, title);
}

/**
 * Shared page shell: parts → laid-out pages + the on-screen instruction band (hidden when printing).
 * Both templates (the cardboard mold and the washi skin) go through here, so the print rules that
 * actually decide whether the result is usable — full-scale ruler, registration crosses, glue tabs,
 * "save as HTML" — cannot drift apart between them.
 *   head(pages) → { h1, body }: the title line and the instruction HTML for that template.
 *   file: basename for the "Save as HTML" button.
 */
function pagesHTML(parts, page, t, { title, head, file }) {
  const lay = layout(parts, page);
  const info = { pages: lay.pages.length, title };
  const svgs = [];
  for (let i = 0; i < lay.pages.length; i++) svgs.push(pageSVG(lay, i, page, info, t));
  const H = head(lay.pages.length);

  return `<meta charset="utf-8"><title>${esc(title)}</title>
<style>
  /* One sheet per page, exactly paper-sized. The SVG carries the margins, so this is 0. */
  @page { size: ${page.name}; margin: 0 }
  body { margin: 0; font-family: system-ui, "Hiragino Sans", sans-serif; color: #2b2118; background: #eae6df }
  .pg { display: block; background: #fff; page-break-after: always; break-after: page; margin: 0 auto 12px }
  /* Line and text styles are generated from the shared STYLE table, so the PDF renderer draws with
     exactly the same widths, dashes and sizes. */
  ${styleCSS()}
  .head { max-width: 190mm; margin: 16px auto; padding: 16px 20px; background: #fff; border-radius: 10px; line-height: 1.75; font-size: 13px }
  .head h1 { font-size: 16px; margin: 0 0 10px }
  .head ol { padding-left: 1.2em; margin: 8px 0 } .head li { margin: 3px 0 }
  .head code { background: #f2efe9; padding: 1px 5px; border-radius: 4px }
  .warn { background: #fff4e8; border-left: 3px solid #d95b18; padding: 8px 12px; border-radius: 4px }
  /* Status note ("this route is still in development"). Deliberately quieter than .warn: nothing is
     wrong with this particular print, so it must not read as an error about the design. */
  .beta { background: #f4f2ed; border-left: 3px solid #b9b0a0; padding: 8px 12px; border-radius: 4px; color: #6b6252 }
  .beta b { color: #4a4438 }
  /* action buttons (screen only); .head is hidden when printing, so they never appear on paper */
  .acts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 0 0 14px }
  .acts button { font: inherit; font-weight: 700; padding: 10px 18px; border-radius: 9px; cursor: pointer;
    border: 1px solid #d95b18; background: #d95b18; color: #fff }
  .acts button.sub { background: #fff; color: #d95b18 }
  .acts button:hover { filter: brightness(1.06) }
  .acts .hint { font-size: 12px; color: #8a7f6e; line-height: 1.5 }
  @media print { .head { display: none } body { background: #fff } .pg { margin: 0 } }
</style>
<div class="head">
  <h1>${H.h1}</h1>
  <div class="acts">
    <button onclick="window.print()">${t("印刷 / PDFで保存")}</button>
    <button class="sub" onclick="saveHtml()">${t("HTMLで保存")}</button>
    <span class="hint">${t("PDF が欲しいときは、印刷ダイアログの<b>「送信先」を「PDFに保存」</b>にしてください。")}<br>
      ${t("いずれの場合も<b>「実際のサイズ / 100%」「余白: なし」</b>を選び、「用紙に合わせる」は外してください。")}</span>
  </div>
  ${H.body}
</div>
${svgs.join("\n")}
<script>
// Save this page itself as an HTML file (to reprint later or hand to another device).
// The page is self-contained (no external references), so this single file reproduces it.
function saveHtml() {
  var html = "<!doctype html>\\n" + document.documentElement.outerHTML;
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  a.download = "${file}_${page.name.toLowerCase()}.html";
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
}
</script>`;
}

/**
 * Return the papercraft's printable HTML (self-contained, single file).
 * Open it in the browser and print via Ctrl/⌘+P → "Actual size (100%), no margins".
 */
export function paperHTML(p, matT, page = A4, t = tid, washiOpts = {}) {
  const { parts, pk, clamped, nMax, wall } = paperParts(p, matT, t, washiOpts);
  return pagesHTML(parts, page, t, {
    title: t("灯 TOMOSHIBI 型紙 {name} 原寸", { name: page.name }),
    file: "tomoshibi_katagami",
    head: (pages) => ({
      h1: t("灯 TOMOSHIBI — 段ボール用 型紙({name} 原寸 / 全 {pages} ページ)", { name: page.name, pages }),
      // Screen-only (the .head block is display:none when printing), so saying it here costs the
      // printed sheet nothing while still reaching the person about to cut a sheet of cardboard.
      body: `<p class="beta">${t("<b>段ボール版は開発中(beta)です。</b> 寸法は3Dプリント版と同じ計算から出していますが、実際に組んだ報告がまだ少ないルートです。切る前に 50mm スケールと材料の実測厚を確認してください。")}</p>`
        + (clamped
        ? `<p class="warn">${t("⚠ 材料厚 {matT}mm では羽根板は最大 {nMax} 枚です(溝が広がり、コマの中心で溝どうしが重なるため)。{boards} 枚 → <b>{nMax} 枚</b>に減らして出力しました。枚数を保ちたい場合は薄い材料を使ってください。", { matT, nMax, boards: p.boards })}</p>`
        : "")
        + (wall < matT / 2
          ? `<p class="warn">${t("⚠ コマの<b>溝と溝の間の壁が {wall}mm</b> しかありません(溝の幅は材料厚どおりの {matT}mm)。手で切ると裂けやすい細さです。太くするには <b>羽根板の枚数を減らす</b>・<b>薄い材料にする</b>・断面図で<b>開口を広げてコマを大きくする</b> のいずれかが効きます。", { wall: wall.toFixed(1), matT })}</p>`
          : "")
        + `<ol>
    <li>${t("<b>「実際のサイズ / 100%」で印刷</b>してください(「用紙に合わせる」は禁止)。刷ったら各ページ下の <b>50mm スケール</b>を定規で必ず確認。")}</li>
    <li>${t("ページを跨ぐ部品は、<b>のりしろ(灰色の破線より下)</b>を次ページに重ね、四隅のトンボを合わせて貼り合わせます。")}</li>
    <li>${t("紙を段ボールに貼り、<b>実線だけ</b>を切り抜きます。<b>破線の目盛は切りません</b> — 竹ひごを巻く位置の印です。")}</li>
    <li>${t("段ボールの<b>波の向き(目)は羽根板の長手方向</b>に合わせると折れにくくなります。")}</li>
    <li>${t("材料厚 <code>{matT}mm</code> 前提でコマの溝の幅を決めています。実測厚と違うと嵌まりません(緩い/入らない)。", { matT })}</li>
    <li>${pk.spiral
          ? t("羽根板は各枚で竹ひごの巻き位置が異なるため<b>全{boards}枚</b>を掲載しています(番号順に使用)。", { boards: pk.boards })
          : t("羽根板は全て<b>同一形状</b>のため型紙は1枚だけ掲載。同じものを<b>{boards}枚</b>切り出してください。", { boards: pk.boards })}</li>
    <li>${t("コマ2枚は<b>同一形状</b>です(上下で同じものを使います)。")}</li>
    <li>${t("最後の<b>「和紙」の型紙</b>は段ボールではなく<b>和紙を切る</b>ためのものです。羽根板の間1面分なので、同じものを<b>{boards}枚</b>。和紙は薄いので<b>下に敷いて写して</b>から切ります(貼り付けない)。", { boards: pk.boards })}</li>
    <li>${t("組み立て: 羽根板の爪を上下2枚のコマに放射状に差し込みます(段ボール版は強度優先で爪先の凹みなし=まっすぐな爪)。差し込みが緩ければ接着してください。")}</li>
  </ol>
  <p style="color:#8a7f6e;font-size:12px;margin:6px 0 0">${t("火袋の高さ {height}mm / 羽根板 {boards}枚 / 竹ひごピッチ {pitch}mm — この帯は画面表示だけで、印刷はされません。", { height: p.height, boards: pk.boards, pitch: p.pitch })}</p>`,
    }),
  });
}

// ============ Washi skin template (cut the paper BEFORE pasting) ============
// One sheet = the surface between two adjacent ribs, developed flat (geometry.js `washiGore`).
// All panels are identical, so a single template is laid out and cut N times — and because washi is
// translucent, the sheet is meant to be slipped UNDER the paper and traced, not glued onto it.
export function washiParts(p, opts = {}, t = tid) {
  const g = washiGore(p, opts);
  const sheets = Math.ceil(Math.max(3, p.boards || 8) / g.span);
  // Number stays outside t() so the default name still contains the plain word (same as the ribs).
  const parts = [{ name: `${t("和紙")} ×${sheets}`, outline: g.outline, marks: g.marks, guides: g.guides }];
  return { parts, g, sheets };
}

/**
 * The washi panels as a **print-ready PDF** (Uint8Array) — the file bundled in the kit ZIP, so the
 * 3D-print route prints it directly with no intermediate step. (The cardboard route needs no PDF:
 * the same panel is laid out among its own template pages by `paperParts`.) `t` must be an ASCII
 * translator (see pdf.js); it defaults to the identity, which would emit Japanese, so callers pass
 * the English one.
 */
export function washiPDF(p, opts = {}, page = A4, t = tid) {
  const { parts } = washiParts(p, opts, t);
  return pagesPDF(parts, page, t, t("TOMOSHIBI 和紙型紙 {name} 原寸", { name: page.name }));
}
