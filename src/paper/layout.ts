import type { Mark } from "../geometry.ts";
import type { Page } from "../io/pdf.ts";
import type { Pt2 } from "../types.ts";

/** A part as geometry hands it over: mm, y UP, plus the hints that are drawn but never cut. */
export type RawPart = { name: string; outline: Pt2[]; holes?: Pt2[][]; guides?: Pt2[][]; marks?: Mark[] };
/** The same part in page coordinates — y DOWN from its own top-left corner — and its footprint. */
export type PagePart = { name: string; outline: Pt2[]; holes: Pt2[][]; guides: Pt2[][]; marks: Mark[]; w: number; h: number };
/** A part with its place in the single content column (mm, before the page band offsets it). */
export type Placed = PagePart & { x: number; y: number };
/** A packing row: where it starts down the column, and how tall its tallest part made it. */
export type Row = { y: number; h: number };
/** One sheet: the content band it shows, which row that is, and where the band lands on paper. */
export type PageBand = { top: number; row: Row | null; y0: number; bot: number };
/** Where the full-scale check square goes — a sheet and a corner on it. */
export type Spot = { page: number; x: number; y: number };
/** A part no orientation fits across the sheet: its ORIENTED width and the overhang, both mm. */
export type Overflow = { name: string; w: number; over: number };
export type Layout = { placed: Placed[]; CW: number; CH: number; pages: PageBand[]; spot: Spot; over: Overflow[] };
/** A page mid-construction: `y0`/`bot` are filled by the pass after the row loop. */
export type PageDraft = { top: number; row: Row | null; y0?: number; bot?: number };

// ---- Paper (A4) ----
// These page constants are declared here and nowhere else: a second `MARGIN` is a template that is
// 1:1 in one place and not in another.
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
// Sheets BUTT at the trim box — no overlap, no glue tab (see "Joining sheets" in `pageOps`).
const GAP = 6;       // Gap between parts (mm). Margin for cutting them apart.

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
  const fix = (q: Pt2): Pt2 => { const [x, y] = conv(q); return [x - b.x0, b.y1 - y]; };
  return {
    name: part.name,
    outline: part.outline.map(fix),
    holes: (part.holes || []).map((hh) => hh.map(fix)),
    guides: (part.guides || []).map((g) => g.map(fix)),
    marks: (part.marks || []).map((m): Mark => [...fix([m[0], m[1]]), ...fix([m[2], m[3]])]),
    w: b.w, h: b.h,
  };
}

// **Never let a row that fits on one page span pages**: if it does not fit, the next page starts at
// the top of that row, so there is nothing to join. A seam happens only for a row taller than one
// page, and the sheets then BUTT at the trim line (see "Joining sheets" in `pageOps`).
export function layout(parts: RawPart[], page: Page): Layout {
  const CW = page.w - 2 * MARGIN;              // content width
  const CH = page.h - 2 * MARGIN - FOOTER;     // content height (usable height per page)

  // Orient every part before any packing decision — a part too wide for the paper is rotated 90° —
  // so the row ordering below sorts on the ORIENTED height, not on the wrong dimension.
  const over: Overflow[] = [];
  const oriented = parts.map((raw) => {
    let q = toPage(raw, false);
    if (q.w > CW) { const r = toPage(raw, true); if (r.w <= CW) q = r; }
    // Neither way round fits ACROSS the sheet. Pages only ever split DOWN, so there is no next sheet
    // for the overhang to continue onto and `pageOps`' clip discards it — on paper only, with no
    // seam and nothing on screen. Recorded so the one place that knows can say so out loud.
    if (q.w > CW) over.push({ name: raw.name, w: q.w, over: q.w - CW });
    return q;
  });

  const build = (qs: PagePart[], topbar: number) => {
    // --- (1) Pack into rows ---
    const placed: Placed[] = [], rows: Row[] = [];
    let y = 0, rowX = 0, rowH = 0;
    const endRow = () => { if (rowH > 0) { rows.push({ y, h: rowH }); y += rowH + GAP; rowX = 0; rowH = 0; } };
    for (const q of qs) {
      if (rowX > 0 && rowX + q.w > CW) endRow();
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
        let t = r.y;
        while (t < r.y + r.h) { pages.push({ top: t, row: r }); t += cap(pages.length - 1); }
        cur = pages[pages.length - 1]; curAt = pages.length - 1;   // if the last page has room, put the next row on it too
      } else if (!cur || r.y + r.h > cur.top + cap(curAt)) {
        cur = { top: r.y, row: r };
        pages.push(cur); curAt = pages.length - 1;
      }
    }
    if (!pages.length) pages.push({ top: 0, row: null });
    // The full CH only while the next page continues the same row: otherwise the head of the next
    // row intrudes on this page and draws a seam where nothing is joined.
    pages.forEach((pg, i) => {
      const next = pages[i + 1];
      pg.y0 = MARGIN + (i === 0 ? topbar : 0);   // page y the content band starts at
      pg.bot = !next || (pg.row && next.row === pg.row)
        ? pg.top + cap(i) : Math.min(pg.top + cap(i), next.top);
    });
    return { placed, CW, CH, pages: pages as PageBand[], over };
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
  // The check square is a mark, not a part, so it takes room the layout ALREADY leaves; only when
  // nothing anywhere fits does sheet 1 give up TOPBAR. Keep BOTH halves.
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
    const { top, bot, y0 } = lay.pages[i];
    // The band starts at `y0`. It used to add 1mm when `prev.bot > top`, which cannot happen:
    // `build` sets a page's `bot` to the next page's `top` exactly when the row continues, and to
    // its own cap otherwise. Zero hits over 7,704 page boundaries across both templates.
    const oy = y0 - top, bandTop = y0, bandBot = y0 + (bot - top);
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
