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
// Paper edge margin (mm) = where the alignment frame sits, pushed out to the printable limit so the
// sheets carry as much template as they can. 5mm is what "as far out as it goes" means in practice:
// home inkjets stop at ~3.2mm and lasers at ~4.2-5mm, so this is the last value that still prints
// whole on essentially anything. Going further would start clipping the frame itself, and the frame
// is what the sheets are aligned by — losing it costs more than the millimetre gains.
export const MARGIN = 5;
const FOOTER = 0;    // No band at the foot of every page: the parts get the full height between the margins.
// Instead the FIRST page starts this far down, and the strip that opens up carries the check square.
// Reserved once for the whole document rather than 14mm on every sheet. 36mm is what the try
// square's short arm plus its labels need, and it sits inside a flat step in the cost curve: the
// `check:paper` sweep prints 736 sheets for anything from 20mm to 40mm, against 726 at 4mm.
export const TOPBAR = 36;
// Sheets BUTT together, they do not overlap. A glue tab would put the join line OVERLAP inside the
// trim edge, so every sheet at a seam would carry two blue lines a centimetre apart — one to cut on
// and one to align on — and no drawing can make that pair unambiguous. Trimming both sheets on the
// one line and taping behind is the same join the reference patterns describe ("trim any white
// printer border first, then the frames coincide"), and it hands each continuation sheet 10mm of
// content back.
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
 * The design as the CARDBOARD route builds it: measured material thickness in place of the printed
 * board thickness, and the rib count clamped to what that thickness still allows.
 *
 * fit=0: add no print tolerance (nominal = exactly the material thickness). Cardboard crushes its fibers going in, so
 * adding the 3D-print fit (0.3mm default) would instead make it wobble and the tab couldn't hold the koma.
 * noTabDent: cardboard skips the tab-tip dent (the koma stop) — cardboard favors keeping the tab strong (the
 * dent removes tab material) over the inward stop; the koma notch then stays full-depth so the plain tab fits.
 */
function paperP(p, matT) {
  const pk = { ...p, boardT: matT, komaT: matT, fit: 0, noTabDent: true };
  pk.boards = Math.min(pk.boards, maxBoards(pk));
  return pk;
}

/**
 * What the measured material thickness does to the mold, without building a single part — so the app
 * can ask on every render. Two facts, both of which the design can be changed to fix:
 *
 * - `wall`: how much koma is left BETWEEN two notches, at the notch bottom. Thicker material widens
 *   the notches and thins that wall; below half the material thickness it tears when hand-cut.
 * - `clamped` / `nMax`: whether the rib count had to come down, because the widened notches would
 *   otherwise overlap at the koma's centre.
 *
 * Kept separate from paperParts (which returns the same numbers alongside the parts) so that asking
 * costs a couple of divisions rather than an outline of every rib, koma and washi panel.
 */
export function paperFit(p, matT) {
  const pk = paperP(p, matT);
  const nMax = maxBoards(pk);
  return {
    wall: (2 * Math.PI * notchR(pk)) / pk.boards - matT,
    thin: matT / 2,                      // the threshold: thinner than half the material tears when cut by hand
    clamped: p.boards > nMax,
    nMax,
  };
}

/**
 * Build all parts to lay out on the papercraft. The returned p is "the papercraft p with material thickness applied".
 * Depending on material thickness, boards may exceed maxBoards (the notches overlap at the center), so always clamp it,
 * and return whether it was clamped in `clamped` so the UI/page can warn.
 */
export function paperParts(p, matT, t = tid, washiOpts = {}) {
  const pk = paperP(p, matT);            // = the mold this template actually cuts (thickness applied, count clamped)
  const { wall, clamped, nMax } = paperFit(p, matT);   // one source for the fit warnings, shared with the app's alert

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
  return { parts, pk, clamped, nMax, wall };
}

// ============ Page layout ============
// Done in two stages. (1) Pack parts top-down into "rows" without considering pages. (2) Assign rows to pages.
// Both stages run twice — once in the order the parts arrive and once ordered by decreasing height —
// and the cheaper result wins (see "Which order to pack in" below). Over the check:paper sweep that
// takes 966 sheets down to 761, halving the count on 123 of 360 designs and raising it on none.
//
// Layout principle: **never let a row that fits on one page span pages**. If it doesn't fit, just start the next page at
// the top of that row (cut it out without joining paper at all). A seam happens only for
// "a row taller than one page" = a part that doesn't fit on one sheet, like a long rib, and only then do pages overlap by
// they butt at the trim line. Previously every page overlapped uniformly, so a glue-tab band appeared on every page even with
// no spanning part, and the effective height was wastefully reduced on all of them.
function layout(parts, page) {
  const CW = page.w - 2 * MARGIN;              // content width
  const CH = page.h - 2 * MARGIN - FOOTER;     // content height (usable height per page)

  // Orient every part up front, before any packing decision: a landscape part that doesn't fit the
  // paper width is rotated 90° to portrait, and it is the ORIENTED height the row ordering below
  // sorts on (rotating afterwards would sort on the wrong dimension).
  const oriented = parts.map((raw) => {
    let q = toPage(raw, false);
    if (q.w > CW) { const r = toPage(raw, true); if (r.w <= CW) q = r; }
    return q;
  });

  const build = (qs, topbar) => {
    // --- (1) Pack into rows ---
    const placed = [], rows = [];
    let y = 0, rowX = 0, rowH = 0;
    const endRow = () => { if (rowH > 0) { rows.push({ y, h: rowH }); y += rowH + GAP; rowX = 0; rowH = 0; } };
    for (const q of qs) {
      if (rowX > 0 && rowX + q.w > CW) endRow();   // wrap to a new row when the width runs out
      placed.push({ ...q, x: rowX, y });
      rowX += q.w + GAP;
      rowH = Math.max(rowH, q.h);
    }
    endRow();

    // --- (2) Assign rows to pages ---
    // Sheet 1 is TOPBAR shorter than the rest, because its top strip carries the check bar. That has
    // to be a PAGE-space fact, not a content-space one: starting the first row at y = TOPBAR instead
    // looks identical until a row spans pages, at which point the spanning branch below takes the
    // row's own y as the page's `top` and the offset cancels itself out — which is exactly the common
    // case (a rib taller than A4), so the strip silently vanished under the drawing.
    const cap = (k) => CH - (k === 0 ? topbar : 0);   // usable content height of sheet k
    const pages = [];
    let cur = null, curAt = -1;
    for (const r of rows) {
      if (r.h > cap(pages.length)) {
        // A row that doesn't fit on one page → raise as many pages as needed, butting at the trim line
        let t = r.y;
        while (t < r.y + r.h) { pages.push({ top: t, row: r }); t += cap(pages.length - 1); }
        cur = pages[pages.length - 1]; curAt = pages.length - 1;   // if the last page has room, put the next row on it too
      } else if (!cur || r.y + r.h > cur.top + cap(curAt)) {
        cur = { top: r.y, row: r };     // doesn't fit on the current page → start the next page at this row
        pages.push(cur); curAt = pages.length - 1;
      }
    }
    if (!pages.length) pages.push({ top: 0, row: null });
    // Bottom edge of each page. Only when **the next page continues the same row** (= splitting a part that doesn't fit on
    // one sheet) do we draw to the full CH. Otherwise cut at "the position
    // where the next page begins" → the head of the next row doesn't intrude into the previous page.
    // (Without this distinction, the next row would bleed into the bottom of a spanning page, producing a seam even where
    //  nothing is joined, making it look like "every page continues".)
    pages.forEach((pg, i) => {
      const next = pages[i + 1];
      pg.y0 = MARGIN + (i === 0 ? topbar : 0);   // page y the content band starts at
      pg.bot = !next || (pg.row && next.row === pg.row)
        ? pg.top + cap(i) : Math.min(pg.top + cap(i), next.top);
    });
    return { placed, CW, CH, pages };
  };

  // --- Which order to pack in ---
  // A row is as tall as its tallest part, so the height of every SHORTER part in it is paid for and
  // thrown away: a koma (a disc a few tens of mm across) sharing a row with a rib (the whole body
  // height) leaves the rest of that sheet blank under it. Packing by decreasing height — the classic
  // first-fit-decreasing-height shelf heuristic — puts parts of similar height in the same row
  // instead. Same-type parts share a height, so in practice this reorders the GROUPS (ribs / washi /
  // komas) and leaves each one contiguous rather than shuffling the sheet.
  const byHeight = oriented
    .map((q, i) => [q, i])
    .sort((a, b) => b[0].h - a[0].h || a[1] - b[1])   // stable: the original index breaks ties
    .map(([q]) => q);
  // It is a heuristic, not a proof, so take whichever order actually costs fewer sheets and keep the
  // given order on a tie (羽根板 → コマ → 和紙 is the order they are cut and assembled in). That makes
  // the reordering unable to ever cost a page, which is what lets it apply unconditionally — to the
  // printed template, the PDF and the in-app preview alike, all of which come through here.
  const pick = (topbar) => {
    const asGiven = build(oriented, topbar), sorted = build(byHeight, topbar);
    return sorted.pages.length < asGiven.pages.length ? sorted : asGiven;
  };
  // Where the check square goes. It is a mark, not a part, so it belongs in room the layout has
  // ALREADY left — most designs finish with half a sheet blank, and reserving a strip for it up
  // front costs a page on designs that had the room all along. Only when nothing anywhere fits does
  // sheet 1 give up TOPBAR for it. Both halves matter: an earlier version reserved the strip
  // unconditionally and spent 10 sheets in 736 for it, and the version before THAT only looked for
  // gaps and silently shipped 16% of designs with no check square at all.
  const free = pick(0);
  const spot = scaleSpot(free);
  if (spot) return { ...free, spot };
  const held = pick(TOPBAR);
  return { ...held, spot: { page: 0, x: MARGIN, y: MARGIN } };
}

// Footprint of the check square including its labels (mm).
const SQ = { w: 86, h: 34 };
/**
 * The first place the check square fits without touching a part, scanning sheets in order (it is
 * more use on an early sheet than a late one). Parts are tested by BOUNDING BOX, which is
 * conservative — a curved rib leaves real room beside it this will not use — because printing the
 * one mark the sheet's scale is judged by across a cut line is worse than spending a page.
 */
function scaleSpot(lay) {
  for (let i = 0; i < lay.pages.length; i++) {
    const { top, bot, y0, row } = lay.pages[i];
    const prev = lay.pages[i - 1];
    const oy = y0 - top, bandTop = y0 + (prev && prev.bot > top ? 1 : 0), bandBot = y0 + (bot - top);
    const near = lay.placed.filter((q) => q.y < bot && q.y + q.h > top)
      .map((q) => ({ x: MARGIN + q.x, y: oy + q.y, w: q.w, h: q.h }));
    // Candidates are the band's own top-left corner plus the bottom-right corners the parts leave —
    // the standard corner heuristic. A free rectangle touching nothing always has one of these as
    // its top-left, so sweeping a grid instead would only cost time.
    const xs = [MARGIN, ...near.map((q) => q.x + q.w + GAP)].sort((a, b) => a - b);
    const ys = [bandTop, ...near.map((q) => q.y + q.h + GAP)].sort((a, b) => a - b);
    for (const y of ys) for (const x of xs) {
      if (x + SQ.w > MARGIN + lay.CW || y + SQ.h > bandBot || y < bandTop) continue;
      if (!near.some((q) => q.x < x + SQ.w && q.x + q.w > x && q.y < y + SQ.h && q.y + q.h > y))
        return { page: i, x, y };
    }
  }
  return null;
}

// ============ Page drawing (shared by the SVG and PDF renderers) ============
// A page is built once as a list of **drawing ops in mm page coordinates** (y down from the sheet's
// top-left), and the two renderers only translate ops into their own syntax. The rules that decide
// whether the print is usable — the clip band, the trim box, the check square, the seam
// crosses — therefore exist exactly once, and the PDF cannot silently disagree with the HTML.
//
// Line/text styles live here too (not in the stylesheet) for the same reason: the CSS block is
// generated from this table, and the PDF reads the same numbers.
export const STYLE = {
  cut: { stroke: "#000", w: 0.25 },                              // cut line
  tick: { stroke: "#000", w: 0.25, dash: [1.2, 1] },             // bamboo-rib ticks (do not cut)
  guide: { stroke: "#777", w: 0.25, dash: [4, 2.5] },            // alignment guides (do not cut)
  scale: { stroke: "#000", w: 0.6 },                             // the full-scale check bar (thick: a ruler gets laid on it)
  frame: { stroke: "#1769c8", w: 0.2 },                          // alignment frame of a sheet that joins another
  join: { stroke: "#1769c8", w: 0.25 },                          // sheet-join half-diamonds (blue = align, never cut)
  pname: { fill: "#999", size: 3.4, anchor: "middle" },          // part name, faint, inside the part
  note: { fill: "#888", size: 2.6, anchor: "start" },
  jlabel: { fill: "#1769c8", size: 2.4, anchor: "start" },        // a seam's code (1A, 1B, 2A …), beside its diamond
};
// `scope` prefixes every selector, because the only consumer is the in-app preview, which injects
// these rules into the app's own stylesheet — where a bare `.note` would hit the inspector's notes
// and shrink them to 2.6px.
const styleCSS = (scope) => Object.entries(STYLE).map(([k, s]) => (s.size
  ? `${scope}.${k} { font-size: ${s.size}px; fill: ${s.fill}; text-anchor: ${s.anchor}; font-family: sans-serif }`
  : `${scope}.${k} { fill: none; stroke: ${s.stroke}; stroke-width: ${s.w}${s.dash ? `; stroke-dasharray: ${s.dash.join(" ")}` : ""} }`)).join("\n  ");

/** Ops for page i. The [top, top+CH] band of content coordinates lands inside the clip rectangle. */
function pageOps(lay, i, page, t) {
  const { top, bot, y0, row } = lay.pages[i];   // y0 = page y the content band starts at (sheet 1 sits TOPBAR lower)
  const ops = [];
  const path = (pts, style, close = false) => ops.push({ k: "path", pts, style, close });
  const text = (x, y, str, style) => ops.push({ k: "text", x, y, str, style });

  // Parts, clipped to the page band. Without the clip a spanning part bleeds past the sheet's own
  // content box and the neighbouring page's content prints on this sheet.
  ops.push({ k: "clip", x: MARGIN, y: y0, w: lay.CW, h: bot - top });
  const ox = MARGIN, oy = y0 - top;                              // content → page coordinates
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

  // Where the sheet is TRIMMED, which is a fact about the paper, not about the parts on it. Not
  // `y0 + (bot - top)`: a page whose next page starts a new row rather than continuing this one ends
  // its content band early, and marking THAT as the sheet's edge draws a trim line across the middle
  // of the paper — a line that is neither a seam nor a cut, differing from sheet to sheet.
  const trimBot = page.h - MARGIN;
  // ---- The trim box ----
  // Drawn IDENTICALLY on every sheet, seam or not, because it is a fact about the paper and not
  // about the parts on it. Each edge runs the whole width or height rather than closing into a box:
  // lay two sheets up and the upper one covers the lower one's corners, which is exactly where a box
  // keeps all of its information, and only a long line makes a small angular error visible.
  const L = MARGIN, R = MARGIN + lay.CW;
  path([[0, MARGIN], [page.w, MARGIN]], "frame");
  path([[0, trimBot], [page.w, trimBot]], "frame");
  path([[L, 0], [L, page.h]], "frame");
  path([[R, 0], [R, page.h]], "frame");

  // ---- Joining sheets ----
  // Only where a part actually spans pages; with no spanning part the sheets don't overlap and none
  // of this is drawn.
  //
  // The convention is the one home-print sewing patterns use, and it is worth following exactly:
  // HALF-diamonds that complete into a whole ◇ when two sheets are laid up correctly. Two lines laid
  // on each other hide a half-millimetre of error; two half-diamonds that fail to close do not. Each
  // carries a short code (1A, 1B, 2A …) so there is no doubt which edge meets which — no sentence,
  // because a sentence printed across the drawing is unreadable and the codes say it all.
  //
  // The seam IS the trim box, and that is why sheets butt rather than overlap. With a glue tab the
  // join line necessarily sits a centimetre inside the trim edge, so every sheet at a seam carries
  // two blue lines — one to cut on, one to align on — and nothing about the drawing can make that
  // pair unambiguous. One line does both jobs: cut both sheets on it, butt the cut edges, and the
  // two chevrons meet base-to-base.
  // A seam is where the NEXT sheet carries on the same row — i.e. a part too tall for one sheet. It is
  // read from the row, not from an overlap: sheets butt, so there is no overlap left to detect.
  const next = lay.pages[i + 1], prev = lay.pages[i - 1];
  const cutsBelow = !!(next && row && next.row === row);
  const cutsAbove = !!(prev && row && prev.row === row);
  if (cutsBelow || cutsAbove) {
    let seams = 0;                                    // how many seams happen above this sheet
    for (let j = 0; j < i; j++) if (lay.pages[j + 1] && lay.pages[j + 1].row === lay.pages[j].row) seams++;
    // Half a diamond: an OPEN chevron whose ends rest on a line, apex pointing inward. Open, because
    // the line it sits on already draws its base — closing it would lay a second stroke along the
    // very line the sheets are aligned by and thicken it. Two sheets laid up correctly bring opposed
    // chevrons base-to-base and the ◇ closes; a millimetre out and it visibly doesn't.
    const B = 4, D = 3.4;                             // half-base, depth (mm)
    const half = (x, y, dx, dy, code) => {
      path([[x - B * Math.abs(dy), y - B * Math.abs(dx)],
        [x + D * dx, y + D * dy],
        [x + B * Math.abs(dy), y + B * Math.abs(dx)]], "join");
      if (code) text(x + (B + 1.5) * Math.abs(dy) + 1.5 * dx, y + (dy < 0 ? -1.4 : dy > 0 ? 2.8 : 0.9), code, "jlabel");
    };
    // Two per seam rather than one, so laying the sheets up pins rotation as well as offset — a
    // single mark leaves the sheet free to pivot on it. Set wide apart (a fifth in from each end)
    // because the angle they fix is only as good as their spacing, and it keeps the codes out of the
    // middle of the drawing where nothing can be read.
    const jx = [L + lay.CW / 5, L + (4 * lay.CW) / 5];
    if (cutsAbove) jx.forEach((x, k) => half(x, MARGIN, 0, 1, `${seams}${"AB"[k]}`));
    if (cutsBelow) jx.forEach((x, k) => half(x, trimBot, 0, -1, `${seams + 1}${"AB"[k]}`));
    // Left and right edges. These mark where to TRIM, not what to mate: this layout is one column
    // wide, so a sheet never has a neighbour beside it and there is no half to complete. They carry
    // no code for that reason — cut the box here and the sheets stack with their sides flush.
    const my = (MARGIN + trimBot) / 2;
    half(L, my, 1, 0, "");
    half(R, my, -1, 0, "");
  }
  if (i === lay.spot.page) {
    // Full-scale check, drawn as an L — a try square, not a bar. Every printable sewing pattern
    // prints a SQUARE rather than a line, and the reason is real: a printer can scale the two axes
    // by different amounts, and a horizontal bar cannot see that at all.
    //
    // It is an L and not a full square because the two axes do not cost the same. Width is free
    // (200mm of it, mostly unused), height comes straight out of the parts, so the long arm goes
    // across and the short arm goes down — enough to catch an axis that scaled differently, no more.
    // A full 3in square costs 800 sheets over the `check:paper` sweep against 736 for this L.
    //
    // Both units ride the SAME arms rather than taking a mark each: a tick where the metric figure
    // falls and another where the imperial one does. Patterns normally print one square labelled
    // "10cm (4in)", but 4in is 101.6mm, so that label is wrong by 1.6mm and the reader cannot tell
    // which unit it is true to. Two ticks on one arm are exact in both.
    //
    // Its position comes from the layout (`scaleSpot`), not from here — it lands in room already
    // going spare, which is why no sheet is set aside for it.
    const x0 = lay.spot.x, ys = lay.spot.y, AX = 76.2, AY = 30;   // 3in across, 3cm down
    path([[x0, ys], [x0 + AX, ys]], "scale");
    path([[x0, ys], [x0, ys + AY]], "scale");
    // Ticks run INWARD off their arm. Outward ones can reach past MARGIN, outside the printable
    // limit MARGIN is set to — and a tick the printer clips no longer says where the length ends,
    // on the one measurement the whole sheet is trusted by.
    const across = (len, label) => {
      path([[x0 + len, ys], [x0 + len, ys + 3]], "scale");
      text(x0 + len + 1, ys + 6.4, label, "note");
    };
    const down = (len, label) => {
      path([[x0, ys + len], [x0 + 3, ys + len]], "scale");
      text(x0 + 4.5, ys + len + 1, label, "note");
    };
    across(50, "5cm");
    across(AX, "3in");
    down(25.4, "1in");
    down(AY, "3cm");
    text(x0 + 8, ys + 11, t("← 定規で確認"), "note");
  }
  return ops;
}

/**
 * The template's pages as SVG, for the print view's in-app preview: the same pages, from the same
 * ops, through the same renderer as the printable HTML — so what is on screen is the sheet that
 * comes out of the printer, page count included. The preview never lays parts out itself; a second
 * opinion about the layout is exactly how a preview starts lying about how many pages there are.
 *
 * Returns the pages' markup plus the stylesheet it needs (the styles live in STYLE, and the printable
 * HTML generates its CSS from the same table). Pure, like the rest of this module: it builds strings,
 * and the caller decides where they go.
 */
export function paperPagesSVG(p, matT, t = tid, washiOpts = {}, page = A4) {
  const { parts, pk, clamped, nMax } = paperParts(p, matT, t, washiOpts);
  const lay = layout(parts, page);
  const svgs = [];
  for (let i = 0; i < lay.pages.length; i++) svgs.push(pageSVG(pageOps(lay, i, page, t), i, page));
  return { svg: svgs.join(""), css: styleCSS(".pages "), pages: lay.pages.length, pk, clamped, nMax };
}

// ============ SVG / HTML generation ============
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const n2 = (v) => (Math.round(v * 100) / 100).toString();

/** Ops → one page's SVG. The clip is an SVG clipPath; ops already carry absolute page coordinates. */
function pageSVG(ops, i, page) {
  const body = [];
  let clipped = null;
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

/**
 * Parts → a print-ready PDF (Uint8Array) of the same pages the HTML shows. `t` should be the
 * **English** translator: the PDF carries base-14 Helvetica only, so Japanese labels cannot be drawn
 * (see pdf.js). Nothing dimensional depends on the labels — the drawing itself is identical.
 */
export function pagesPDF(parts, page, t, title) {
  const lay = layout(parts, page);
  const pages = [];
  for (let i = 0; i < lay.pages.length; i++) pages.push(pageOps(lay, i, page, t));
  return buildPDF(pages, page, STYLE, title);
}

/**
 * The cardboard template as a print-ready PDF — the route's one deliverable.
 *
 * It replaced a self-contained HTML page whose entire preamble existed to talk the reader through
 * printing an HTML at exactly 1:1 ("Actual size / 100%", no margins, fit-to-page off, and a
 * "save as HTML" button for later). A PDF is already A4 at exact size, so all of that went with it;
 * what is left worth saying is the one printer setting, and the app says it beside the download.
 *
 * `t` must be the **English** translator, for the reason washiPDF documents: the PDF carries
 * base-14 Helvetica only, and winAnsi() drops anything outside Latin-1 — hand it Japanese and the
 * part names come out as " x8" with the word silently gone. Nothing dimensional depends on the
 * labels; the drawing is identical either way.
 */
export function paperPDF(p, matT, page = A4, t = tid, washiOpts = {}) {
  const { parts } = paperParts(p, matT, t, washiOpts);
  return pagesPDF(parts, page, t, t("TOMOSHIBI 段ボール型紙 {name} 原寸", { name: page.name }));
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
