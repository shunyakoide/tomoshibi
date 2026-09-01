/**
 * ============================================================================
 * PAPERCRAFT — 1:1 printable pages for building the mold from cardboard/thick paper
 * ============================================================================
 * Each part's 2D outline at **full scale (1:1)** on A4, written as a **PDF** (pdf.ts), so the mold
 * can be built without a 3D printer.
 *
 * Design policy:
 * ・The shape comes **only** from geometry.ts's pure functions — reimplement a dimension here and the
 *   papercraft and the STL make different molds.
 * ・**Don't cut the grooves (higo-me).** A 0.5mm V cannot be scored into cardboard: the outer edge is
 *   cut smooth (`ribOutline2D(p,k,{smooth:true})`), the bamboo positions dashed ticks from the same
 *   `grooveList()` as the STL.
 * ・**Material thickness `matT` goes to every part identically** — `{...p, boardT: matT, komaT: matT,
 *   fit: 0}` — so the parts always mesh; the 3D side's `p` is never modified. `fit: 0` because
 *   cardboard fibres crush going in and a nominal-exact fit meshes more firmly.
 * ・**Don't emit the stand.** Ribs + koma only; the user provides their own (a cardboard cross stand
 *   was removed at the user's request).
 *
 * The **washi template** (`washiParts` / `washiPDF`), the paper skin's flat pattern cut BEFORE
 * pasting, ships with both routes as its **own PDF** rather than as more pages of this one: the two
 * are printed at different moments, and `pagesPDF` numbers and seams the sheets of ONE document. On
 * the cardboard route it must be built from `paperP()`, not the design as edited (see there), and it
 * has **no on-screen preview** — `washiPagesSVG` is only the verification's second encoding.
 *
 * Every page is built once as drawing ops (`pageOps`) and rendered as SVG or PDF, so a full-scale bug
 * cannot hide in one of them. React/DOM-free (stl.ts opens or downloads the bytes).
 * ============================================================================
 */
import {
  ribOutline2D, grooveList, grooveR, outerR, komaShape, maxBoards, tabDented, notchR, washiGore,
} from "./geometry.ts";
import { buildPDF } from "./pdf.ts";
import type { Mark, WashiOpts } from "./geometry.ts";
import type { Op, Page, StrokeName, StyleTable, TextName } from "./pdf.ts";
import type { Design, Pt2 } from "./types.ts";
import type { T } from "./i18n.ts";

/** A part as geometry hands it over: mm, y UP, plus the hints that are drawn but never cut. */
type RawPart = { name: string; outline: Pt2[]; holes?: Pt2[][]; guides?: Pt2[][]; marks?: Mark[] };
/** The same part in page coordinates — y DOWN from its own top-left corner — and its footprint. */
type PagePart = { name: string; outline: Pt2[]; holes: Pt2[][]; guides: Pt2[][]; marks: Mark[]; w: number; h: number };
/** A part with its place in the single content column (mm, before the page band offsets it). */
type Placed = PagePart & { x: number; y: number };
/** A packing row: where it starts down the column, and how tall its tallest part made it. */
type Row = { y: number; h: number };
/** One sheet: the content band it shows, which row that is, and where the band lands on paper. */
type PageBand = { top: number; row: Row | null; y0: number; bot: number };
/** Where the full-scale check square goes — a sheet and a corner on it. */
type Spot = { page: number; x: number; y: number };
type Layout = { placed: Placed[]; CW: number; CH: number; pages: PageBand[]; spot: Spot };
/** A page mid-construction: `y0`/`bot` are filled by the pass after the row loop. */
type PageDraft = { top: number; row: Row | null; y0?: number; bot?: number };

// Default translator: an interpolating identity — the Japanese key with its {name} placeholders
// substituted — so callers that omit one (the check scripts) get the Japanese page and this module
// stays React/DOM-free. The UI passes the real i18n `t`.
const tid: T = (s, params) => (params ? Object.keys(params).reduce((a, k) => a.split("{" + k + "}").join(String(params[k])), s) : s);

// ---- Paper (A4) ----
export const A4 = { w: 210, h: 297, name: "A4" };
// Paper edge margin (mm) = where the alignment frame sits, at the printable limit. 5mm is the last
// value that prints whole on essentially anything (home inkjets stop at ~3.2mm, lasers ~4.2-5mm);
// further clips the frame the sheets are aligned by, which costs more than the millimetre gains.
export const MARGIN = 5;
const FOOTER = 0;    // No band at the foot of every page: the parts get the full height between the margins.
// The FIRST page instead starts this far down, and the strip carries the check square — reserved once
// per document rather than 14mm on every sheet, and only when nothing anywhere fits (`scaleSpot`).
// 36mm is what the try square's short arm plus its labels need.
export const TOPBAR = 36;
// Sheets BUTT at the trim box, they do not overlap, and there is no glue tab anywhere — see
// "Joining sheets" in `pageOps` for why.
const GAP = 6;       // Gap between parts (mm). Margin for cutting them apart.
const TICK = 5;      // Length of the bamboo-rib tick line (mm). Drawn inward from the outer edge.

// ---- Tab-tip dent (koma stop): NOT cut on cardboard ----
// The 3D route's koma stop is the tab-tip inner-corner dent mated to the koma's shallower notch (both
// from tabTipRi). Cardboard does NOT get it — `paperP` sets `noTabDent`, so `tabDented(pk)` is always
// false and the tab is a plain tongue in a full-depth notch — because the dent's 6x6mm comes out of
// the tip's inner corner, exactly where a cardboard tab tears along its flutes. Friction holds the
// koma instead (`fit: 0`). `check:paper` asserts it.

// Bounding box of a point list
function bbox(pts: Pt2[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * Normalize a part into page coordinates (y DOWN, origin = top-left of the bounding box): geometry.ts
 * is y-up, SVG is y-down, so flip once here. rot=true rotates 90° first, for parts too wide landscape.
 */
function toPage(part: RawPart, rot: boolean): PagePart {
  const conv = ([x, y]: Pt2): Pt2 => (rot ? [y, -x] : [x, y]);   // 90° rotation (keeping y-up)
  const all = [part.outline, ...(part.holes || []), ...(part.guides || [])].flat()
    .concat((part.marks || []).flatMap((m) => [[m[0], m[1]], [m[2], m[3]]]));
  const b = bbox(all.map(conv));
  const fix = (q: Pt2): Pt2 => { const [x, y] = conv(q); return [x - b.x0, b.y1 - y]; }; // flip y
  return {
    name: part.name,
    outline: part.outline.map(fix),
    holes: (part.holes || []).map((hh) => hh.map(fix)),
    guides: (part.guides || []).map((g) => g.map(fix)),
    marks: (part.marks || []).map((m): Mark => [...fix([m[0], m[1]]), ...fix([m[2], m[3]])]),
    w: b.w, h: b.h,
  };
}

// ============ Each part's 2D outline (all derived from geometry.ts) ============

// Rib: a smooth outer edge with no grooves carved + ticks at the bamboo-rib winding positions. No
// lightening windows — cardboard is light, and windows only weaken it and add cutting effort.
function ribPart(pk: Design, k: number, name: string): RawPart {
  const h = pk.height;
  const outline = ribOutline2D(pk, k, { smooth: true });
  // Ticks come from the same `grooveList()` as the STL grooves: horizontal lines TICK mm inward from
  // the outer edge. Pass k, so spiral winding's per-rib shift is marked where 3D cuts it.
  const marks = grooveList(pk, grooveR(pk), k).map((y): Mark => {
    const x = outerR(pk, Math.min(Math.max(y, 0), h) / h);
    return [x, y, x - TICK, y];
  });
  return { name, outline, marks };
}

// Koma: the same `komaShape` as 3D, but from `paperP()` — three inputs differ, not just the
// thickness, so the notch WIDTH is the material thickness (boardT = matT, fit = 0) and the notch is
// FULL-DEPTH, the tab being undented. `check:paper` pins notchR(pk) === innerRi(pk) - 0.5.
function komaPart(pk: Design, name: string): RawPart {
  const pts = komaShape(pk).extractPoints(1).shape.map((v): Pt2 => [v.x, v.y]);
  return { name, outline: pts };
}

/**
 * The design as the CARDBOARD route builds it: measured material thickness in place of the printed
 * board thickness, the rib count clamped to what that thickness still allows, `fit: 0` (the 3D-print
 * 0.3mm would leave a cardboard joint wobbling) and `noTabDent` (see the dent note above).
 *
 * Exported because the **washi PDF that ships with this route must be built from it too**: the panel
 * is one rib-to-rib arc wide, so a clamped rib count means wider panels, and a skin cut from the
 * design as edited would not meet itself on the mold this template makes.
 */
export function paperP(p: Design, matT: number): Design {
  const pk = { ...p, boardT: matT, komaT: matT, fit: 0, noTabDent: true };
  pk.boards = Math.min(pk.boards, maxBoards(pk));
  return pk;
}

/**
 * What the measured material thickness does to the mold, without building a part — so the app can ask
 * on every render (paperParts returns the same numbers, at the cost of every outline). Two facts,
 * both fixable by changing the design: `wall`, the koma left BETWEEN two notches at the notch bottom,
 * which thicker material thins until it tears when hand-cut (below half the material thickness); and
 * `clamped`/`nMax`, whether the rib count had to come down, the widened notches otherwise overlapping
 * at the koma's centre.
 */
export function paperFit(p: Design, matT: number) {
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
 * Every part to lay out: ribs + koma and nothing else — the washi panel is a separate document (see
 * the top of the file). The returned p is `paperP()`'s, so `boards` is already clamped to maxBoards;
 * `clamped` reports it so the UI/page can warn.
 */
export function paperParts(p: Design, matT: number, t: T = tid) {
  const pk = paperP(p, matT);            // = the mold this template actually cuts (thickness applied, count clamped)
  const { wall, clamped, nMax } = paperFit(p, matT);   // one source for the fit warnings, shared with the app's alert

  // All ribs are identical unless spiral winding shifts the tick positions per rib; identical ones
  // are emitted as a single sheet labelled "×N" rather than N duplicates.
  const ribParts: RawPart[] = [];
  if (pk.spiral) {
    for (let k = 0; k < pk.boards; k++) ribParts.push(ribPart(pk, k, `${t("羽根板")} ${k + 1}/${pk.boards}`));
  } else {
    ribParts.push(ribPart(pk, 0, `${t("羽根板")} ×${pk.boards}`)); // Number stays outside t() so the default name still contains the plain word for the tests.
  }
  // Koma: two identical sheets (top & bottom) normally, or a single "×2" sheet when two would spill
  // onto an extra koma-only page. Decided by comparing the page count on A4 (the print page).
  const twoKoma = [komaPart(pk, `${t("コマ")} 1/2`), komaPart(pk, `${t("コマ")} 2/2`)];
  const oneKoma = [komaPart(pk, `${t("コマ")} ×2`)];
  const pageCount = (ks: RawPart[]) => layout([...ribParts, ...ks], A4).pages.length;
  const komas = pageCount(twoKoma) > pageCount(oneKoma) ? oneKoma : twoKoma;
  // Mold only — the washi panel was laid out here once and is now its own PDF.
  const parts = [...ribParts, ...komas];
  return { parts, pk, clamped, nMax, wall };
}

// ============ Page layout ============
// Two stages: (1) pack parts top-down into "rows" ignoring pages, (2) assign rows to pages. Both run
// twice — in the order the parts arrive and by decreasing height — and the cheaper result wins (with
// ribs and koma alone it saves nothing on any design in the sweep; see "Which order to pack in").
//
// Layout principle: **never let a row that fits on one page span pages.** If it does not fit, start
// the next page at the top of that row, so there is nothing to join. A seam happens only for a row
// taller than one page — a part too big for one sheet, like a long rib — and the sheets then BUTT at
// the trim line rather than overlapping (see "Joining sheets" in `pageOps`).
function layout(parts: RawPart[], page: Page): Layout {
  const CW = page.w - 2 * MARGIN;              // content width
  const CH = page.h - 2 * MARGIN - FOOTER;     // content height (usable height per page)

  // Orient every part before any packing decision — a part too wide for the paper is rotated 90° —
  // so the row ordering below sorts on the ORIENTED height, not on the wrong dimension.
  const oriented = parts.map((raw) => {
    let q = toPage(raw, false);
    if (q.w > CW) { const r = toPage(raw, true); if (r.w <= CW) q = r; }
    return q;
  });

  const build = (qs: PagePart[], topbar: number) => {
    // --- (1) Pack into rows ---
    const placed: Placed[] = [], rows: Row[] = [];
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
    // Sheet 1 is TOPBAR shorter, its top strip carrying the check bar — a PAGE-space fact, because
    // starting the first row at y = TOPBAR instead cancels itself out whenever a row spans pages (the
    // common case: a rib taller than A4), and the strip vanishes under the drawing.
    const cap = (k: number) => CH - (k === 0 ? topbar : 0);   // usable content height of sheet k
    // Two passes: the loop below decides which band each sheet shows, the forEach after it where that
    // band lands on paper (y0) and where the sheet is cut (bot). The cast marks that seam.
    const pages: PageDraft[] = [];
    let cur: PageDraft | null = null, curAt = -1;
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
    // Bottom edge of each page: the full CH only when **the next page continues the same row**,
    // otherwise where the next page begins — so the head of the next row does not intrude on the
    // previous page and draw a seam where nothing is joined.
    pages.forEach((pg, i) => {
      const next = pages[i + 1];
      pg.y0 = MARGIN + (i === 0 ? topbar : 0);   // page y the content band starts at
      pg.bot = !next || (pg.row && next.row === pg.row)
        ? pg.top + cap(i) : Math.min(pg.top + cap(i), next.top);
    });
    return { placed, CW, CH, pages: pages as PageBand[] };
  };

  // --- Which order to pack in ---
  // A row is as tall as its tallest part, so a koma sharing a row with a rib wastes the sheet under
  // it. Packing by decreasing height (first-fit-decreasing-height shelf heuristic) groups similar
  // heights; same-type parts share a height, so it reorders the two GROUPS and leaves each contiguous.
  const byHeight = oriented
    .map((q, i): [PagePart, number] => [q, i])
    .sort((a, b) => b[0].h - a[0].h || a[1] - b[1])   // stable: the original index breaks ties
    .map(([q]) => q);
  // A heuristic, not a proof: take whichever order costs fewer sheets, keeping the given order on a
  // tie (羽根板 → コマ is the order they are cut in), so the reordering can never cost a page.
  const pick = (topbar: number) => {
    const asGiven = build(oriented, topbar), sorted = build(byHeight, topbar);
    return sorted.pages.length < asGiven.pages.length ? sorted : asGiven;
  };
  // Where the check square goes: a mark, not a part, so it takes room the layout ALREADY leaves —
  // reserving a strip up front cost a page on designs that had the room all along. Only when nothing
  // anywhere fits does sheet 1 give up TOPBAR. Keep BOTH halves: looking for gaps alone shipped 16%
  // of designs with no check square at all.
  const free = pick(0);
  const spot = scaleSpot(free);
  if (spot) return { ...free, spot };
  const held = pick(TOPBAR);
  return { ...held, spot: { page: 0, x: MARGIN, y: MARGIN } };
}

// Footprint of the check square including its labels (mm).
const SQ = { w: 86, h: 34 };
/**
 * The first place the check square fits without touching a part, sheets scanned in order (it is more
 * use on an early one). Parts are tested by BOUNDING BOX, deliberately conservative: printing the one
 * mark the sheet's scale is judged by across a cut line is worse than spending a page.
 */
function scaleSpot(lay: Omit<Layout, "spot">): Spot | null {
  for (let i = 0; i < lay.pages.length; i++) {
    const { top, bot, y0, row } = lay.pages[i];
    const prev = lay.pages[i - 1];
    const oy = y0 - top, bandTop = y0 + (prev && prev.bot > top ? 1 : 0), bandBot = y0 + (bot - top);
    const near = lay.placed.filter((q) => q.y < bot && q.y + q.h > top)
      .map((q) => ({ x: MARGIN + q.x, y: oy + q.y, w: q.w, h: q.h }));
    // Candidates: the band's top-left corner plus the bottom-right corners the parts leave (the
    // standard corner heuristic). A free rectangle always has one of these as its top-left.
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
// A page is built once as **drawing ops in mm page coordinates** (y down from the sheet's top-left)
// and the two renderers only translate them, so the rules that decide whether the print is usable —
// clip band, trim box, check square, seam half-diamonds — exist exactly once. Line/text styles too:
// the CSS block is generated from this table, and the PDF reads the same numbers.
export const STYLE = {
  cut: { stroke: "#000", w: 0.25 },                              // cut line
  tick: { stroke: "#000", w: 0.25, dash: [1.2, 1] },             // bamboo-rib ticks (do not cut)
  guide: { stroke: "#777", w: 0.25, dash: [4, 2.5] },            // alignment guides (do not cut)
  scale: { stroke: "#000", w: 0.6 },                             // the full-scale check square (thick: a ruler gets laid on it)
  frame: { stroke: "#1769c8", w: 0.2 },                          // the sheet's trim box — drawn on every sheet, seam or not
  join: { stroke: "#1769c8", w: 0.25 },                          // sheet-join half-diamonds (blue = align, never cut)
  pname: { fill: "#999", size: 3.4, anchor: "middle" },          // part name, faint, inside the part
  note: { fill: "#888", size: 2.6, anchor: "start" },
  jlabel: { fill: "#1769c8", size: 2.4, anchor: "start" },        // a seam's code (1A, 1B, 2A …), beside its diamond
} satisfies StyleTable;
// `scope` prefixes every selector: the only consumer is the in-app preview, which injects these rules
// into the app's own stylesheet, where a bare `.note` would hit the app's own and shrink it to 2.6px.
const styleCSS = (scope: string) => Object.entries(STYLE as StyleTable).map(([k, s]) => ("size" in s
  ? `${scope}.${k} { font-size: ${s.size}px; fill: ${s.fill}; text-anchor: ${s.anchor}; font-family: sans-serif }`
  : `${scope}.${k} { fill: none; stroke: ${s.stroke}; stroke-width: ${s.w}${s.dash ? `; stroke-dasharray: ${s.dash.join(" ")}` : ""} }`)).join("\n  ");

/** Ops for page i. The [top, top+CH] band of content coordinates lands inside the clip rectangle. */
function pageOps(lay: Layout, i: number, page: Page, t: T): Op[] {
  const { top, bot, y0, row } = lay.pages[i];   // y0 = page y the content band starts at (sheet 1 sits TOPBAR lower)
  const ops: Op[] = [];
  const path = (pts: Pt2[], style: StrokeName, close = false) => ops.push({ k: "path", pts, style, close });
  const text = (x: number, y: number, str: string, style: TextName) => ops.push({ k: "text", x, y, str, style });

  // Parts, clipped to the page band: without it a spanning part bleeds past the sheet's content box
  // and the neighbouring page's content prints on this sheet.
  ops.push({ k: "clip", x: MARGIN, y: y0, w: lay.CW, h: bot - top });
  const ox = MARGIN, oy = y0 - top;                              // content → page coordinates
  for (const q of lay.placed) {
    if (q.y >= bot || q.y + q.h <= top) continue;                // not in this band
    const at = ([x, y]: Pt2): Pt2 => [ox + q.x + x, oy + q.y + y];
    path(q.outline.map(at), "cut", true);
    for (const hh of q.holes) path(hh.map(at), "cut", true);
    for (const gd of q.guides || []) path(gd.map(at), "guide");  // open polyline: a guide, not a cut
    for (const m of q.marks) path([at([m[0], m[1]]), at([m[2], m[3]])], "tick");
    // The part name goes faintly **inside the part**, for identification after cutting. Slightly
    // below centre (62%) because near the top it would land on a cut-away side like a post's U-saddle.
    text(ox + q.x + q.w / 2, oy + q.y + q.h * 0.62, q.name, "pname");
  }
  ops.push({ k: "unclip" });

  // Where the sheet is TRIMMED. Not `y0 + (bot - top)`: a page whose next page starts a new row ends
  // its content band early, and marking THAT as the sheet's edge draws a line across the middle of
  // the paper that is neither a seam nor a cut and moves from sheet to sheet.
  const trimBot = page.h - MARGIN;
  // ---- The trim box ----
  // Drawn IDENTICALLY on every sheet, seam or not: a fact about the paper, not about the parts on it.
  // Each edge runs the whole width or height rather than closing into a box, because a stacked sheet
  // covers the lower one's corners — where a box keeps all of its information.
  const L = MARGIN, R = MARGIN + lay.CW;
  path([[0, MARGIN], [page.w, MARGIN]], "frame");
  path([[0, trimBot], [page.w, trimBot]], "frame");
  path([[L, 0], [L, page.h]], "frame");
  path([[R, 0], [R, page.h]], "frame");

  // ---- Joining sheets ----
  // Only where a part actually spans pages, and a seam is read from the ROW — sheets butt, so there
  // is no overlap to detect. The convention is home-print sewing patterns': HALF-diamonds that
  // complete into a whole ◇ when two sheets are laid up correctly, because two lines laid on each
  // other hide a half-millimetre of error where two chevrons that fail to close do not. Each carries
  // a short code (1A, 1B, 2A …) so there is no doubt which edge meets which.
  //
  // **The seam IS the trim box, which is why sheets butt rather than overlap.** A glue tab puts the
  // join line a centimetre inside the trim edge, so every sheet at a seam carries two blue lines —
  // one to cut on, one to align on — and no drawing makes that pair unambiguous. One line does both:
  // trim both sheets on it and tape from behind, the join the reference patterns describe ("trim any
  // white printer border first, then the frames coincide"), which also hands each continuation sheet
  // 10mm of content back.
  const next = lay.pages[i + 1], prev = lay.pages[i - 1];
  const cutsBelow = !!(next && row && next.row === row);
  const cutsAbove = !!(prev && row && prev.row === row);
  if (cutsBelow || cutsAbove) {
    let seams = 0;                                    // how many seams happen above this sheet
    for (let j = 0; j < i; j++) if (lay.pages[j + 1] && lay.pages[j + 1].row === lay.pages[j].row) seams++;
    // Half a diamond: an OPEN chevron whose ends rest on a line, apex pointing inward. Open because
    // closing it would lay a second stroke along the very line the sheets are aligned by.
    const B = 4, D = 3.4;                             // half-base, depth (mm)
    const half = (x: number, y: number, dx: number, dy: number, code: string) => {
      path([[x - B * Math.abs(dy), y - B * Math.abs(dx)],
        [x + D * dx, y + D * dy],
        [x + B * Math.abs(dy), y + B * Math.abs(dx)]], "join");
      if (code) text(x + (B + 1.5) * Math.abs(dy) + 1.5 * dx, y + (dy < 0 ? -1.4 : dy > 0 ? 2.8 : 0.9), code, "jlabel");
    };
    // Two per seam rather than one, so laying the sheets up pins rotation as well as offset, and a
    // fifth in from each end, the angle they fix being only as good as their spacing.
    const jx = [L + lay.CW / 5, L + (4 * lay.CW) / 5];
    if (cutsAbove) jx.forEach((x, k) => half(x, MARGIN, 0, 1, `${seams}${"AB"[k]}`));
    if (cutsBelow) jx.forEach((x, k) => half(x, trimBot, 0, -1, `${seams + 1}${"AB"[k]}`));
    // Left and right edges mark where to TRIM, not what to mate: this layout is one column wide, so
    // a sheet never has a neighbour beside it and there is no half to complete — hence no code.
    const my = (MARGIN + trimBot) / 2;
    half(L, my, 1, 0, "");
    half(R, my, -1, 0, "");
  }
  if (i === lay.spot.page) {
    // Full-scale check, drawn as an L — a try square, not a bar, because a printer can scale the two
    // axes by different amounts and a horizontal bar cannot see that. An L rather than a full square
    // because width is free and height comes out of the parts. BOTH units ride BOTH arms (a tick
    // where the metric figure falls, another where the imperial one does): one square labelled
    // "10cm (4in)" is wrong by 1.6mm (4in is 101.6) and does not say which unit it is true to. `scaleSpot` places
    // it, in room the layout already leaves.
    const x0 = lay.spot.x, ys = lay.spot.y, AX = 76.2, AY = 30;   // 3in across, 3cm down
    path([[x0, ys], [x0 + AX, ys]], "scale");
    path([[x0, ys], [x0, ys + AY]], "scale");
    // Ticks run INWARD off their arm: outward ones can reach past MARGIN, outside the printable limit
    // it is set to, and a tick the printer clips no longer says where the length ends.
    const across = (len: number, label: string) => {
      path([[x0 + len, ys], [x0 + len, ys + 3]], "scale");
      text(x0 + len + 1, ys + 6.4, label, "note");
    };
    const down = (len: number, label: string) => {
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
 * The template's pages as SVG, for the print view's in-app preview: the same pages, ops and renderer
 * as the PDF, so what is on screen is the sheet that comes out of the printer, page count included.
 * The preview never lays parts out itself — a second opinion about the layout is how a preview starts
 * lying about how many pages there are. Returns the markup plus its stylesheet (generated from STYLE).
 */
export function paperPagesSVG(p: Design, matT: number, t: T = tid, page: Page & { name?: string } = A4) {
  const { parts, pk, clamped, nMax } = paperParts(p, matT, t);
  const lay = layout(parts, page);
  const svgs: string[] = [];
  for (let i = 0; i < lay.pages.length; i++) svgs.push(pageSVG(pageOps(lay, i, page, t), i, page));
  return { svg: svgs.join(""), css: styleCSS(".pages "), pages: lay.pages.length, pk, clamped, nMax };
}

// ============ SVG generation ============
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ESC[c]);
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** Ops → one page's SVG. The clip is an SVG clipPath; ops already carry absolute page coordinates. */
function pageSVG(ops: Op[], i: number, page: Page): string {
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

/**
 * Parts → a print-ready PDF (Uint8Array) of the same pages the preview shows, labelled in whatever
 * language `t` speaks: Latin is Helvetica, the rest is drawn from the outlines pdf.ts carries.
 * Nothing dimensional depends on the labels.
 */
export function pagesPDF(parts: RawPart[], page: Page, t: T, title: string): Uint8Array {
  const lay = layout(parts, page);
  const pages: Op[][] = [];
  for (let i = 0; i < lay.pages.length; i++) pages.push(pageOps(lay, i, page, t));
  return buildPDF(pages, page, STYLE, title);
}

/**
 * The cardboard template as a print-ready PDF — the mold itself (ribs + koma) — downloaded inside the
 * route's ZIP next to the washi PDF, the same way the STL kit carries its own. It replaced a
 * self-contained HTML page whose whole preamble talked the reader through printing at exactly 1:1;
 * a PDF is already A4 at exact size, and the app says the one remaining printer setting beside the
 * download. `t` is the UI's translator: the writer carries outlines for the characters WinAnsi cannot
 * encode (pdf.ts / tools/pdffont), so the sheet prints in the language the app was showing — it was
 * forced to English while a Japanese label was DROPPED rather than drawn (`" ×8"`, the word gone).
 */
export function paperPDF(p: Design, matT: number, page = A4, t: T = tid): Uint8Array {
  const { parts } = paperParts(p, matT, t);
  return pagesPDF(parts, page, t, t("TOMOSHIBI 段ボール型紙 {name} 原寸", { name: page.name }));
}

// ============ Washi skin template (cut the paper BEFORE pasting) ============
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
 * against it path by path, markup being the encoding you can assert on. Same `layout` + `pageOps` +
 * `pageSVG` as every other sheet: the moment it is a second drawing, the comparison is worthless.
 */
export function washiPagesSVG(p: Design, opts: WashiOpts = {}, t: T = tid, page: Page & { name?: string } = A4) {
  const { parts } = washiParts(p, opts, t);
  const lay = layout(parts, page);
  const svgs: string[] = [];
  for (let i = 0; i < lay.pages.length; i++) svgs.push(pageSVG(pageOps(lay, i, page, t), i, page));
  return { svg: svgs.join(""), css: styleCSS(".pages "), pages: lay.pages.length };
}
