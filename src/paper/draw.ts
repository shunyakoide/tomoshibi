// Every number in this file is a millimetre of paper.
import { MARGIN } from "./layout.ts";
import type { Layout } from "./layout.ts";
import type { Op, Page, StrokeName, TextName } from "../io/pdf.ts";
import type { T } from "../i18n.ts";
import type { Pt2 } from "../types.ts";

/** Ops for page i. The [top, top+CH] band of content coordinates lands inside the clip rectangle. */
export function pageOps(lay: Layout, i: number, page: Page, t: T): Op[] {
  const { top, bot, y0, row } = lay.pages[i];   // y0 = page y the content band starts at (sheet 1 sits TOPBAR lower)
  const ops: Op[] = [];
  const path = (pts: Pt2[], style: StrokeName, close = false) => ops.push({ k: "path", pts, style, close });
  const text = (x: number, y: number, str: string, style: TextName) => ops.push({ k: "text", x, y, str, style });

  // Parts, clipped to the page band: without it a spanning part bleeds past the sheet's content box
  // and the neighbouring page's content prints on this sheet.
  ops.push({ k: "clip", x: MARGIN, y: y0, w: lay.CW, h: bot - top });
  const ox = MARGIN, oy = y0 - top;                              // content → page coordinates
  for (const q of lay.placed) {
    if (q.y >= bot || q.y + q.h <= top) continue;
    const at = ([x, y]: Pt2): Pt2 => [ox + q.x + x, oy + q.y + y];
    // A part with nothing to cut draws no cut line at all, rather than an empty path: the wire hoops
    // are a bend line and a name, and a stray `d=""` is a path the SVG comparison has to explain.
    if (q.outline.length) path(q.outline.map(at), "cut", true);
    for (const hh of q.holes) path(hh.map(at), "cut", true);
    for (const gd of q.guides || []) path(gd.map(at), "guide");  // open polyline: a guide, not a cut
    for (const bd of q.bend || []) path(bd.map(at), "bend", true);   // closed: a wire's own loop
    for (const m of q.marks) path([at([m[0], m[1]]), at([m[2], m[3]])], "tick");
    // The part name goes faintly **inside the part**, for identification after cutting. Slightly
    // below centre (62%) because near the top it would land on a cut-away side like a post's U-saddle.
    text(ox + q.x + q.w / 2, oy + q.y + q.h * 0.62, q.name, "pname");
    // One line under it, only where the name does not say what the part is for — a hoop is a line to
    // bend on, and the sheet's whole vocabulary otherwise says "cut this".
    if (q.note) text(ox + q.x + q.w / 2, oy + q.y + q.h * 0.62 + 4, q.note, "pnote");
  }
  ops.push({ k: "unclip" });

  // Where the sheet is TRIMMED. Not `y0 + (bot - top)`: a page whose next page starts a new row ends
  // its content band early, and marking THAT as the sheet's edge draws a line across the middle of
  // the paper that is neither a seam nor a cut and moves from sheet to sheet.
  const trimBot = page.h - MARGIN;
  // ---- The trim box ----
  // Drawn identically on every sheet, seam or not, and each edge runs the whole width or height
  // rather than closing into a box: a stacked sheet covers the lower one's corners, which is where a
  // box keeps all of its information.
  const L = MARGIN, R = MARGIN + lay.CW;
  path([[0, MARGIN], [page.w, MARGIN]], "frame");
  path([[0, trimBot], [page.w, trimBot]], "frame");
  path([[L, 0], [L, page.h]], "frame");
  path([[R, 0], [R, page.h]], "frame");

  // ---- Joining sheets ----
  // Only where a part actually spans pages, and a seam is read from the ROW — sheets butt, so there
  // is no overlap to detect. HALF-diamonds, which complete into a whole ◇ when two sheets are laid
  // up correctly, because two lines laid on each other hide a half-millimetre of error where two
  // chevrons that fail to close do not. Each carries a short code (1A, 1B, 2A …) so there is no
  // doubt which edge meets which.
  //
  // **The seam IS the trim box, which is why sheets butt rather than overlap.** A glue tab puts the
  // join line a centimetre inside the trim edge, so every sheet at a seam carries two blue lines —
  // one to cut on, one to align on — and no drawing makes that pair unambiguous. One line does both:
  // trim both sheets on it and tape from behind.
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
    // axes by different amounts and a horizontal bar cannot see that. BOTH units ride BOTH arms (a
    // tick where the metric figure falls, another where the imperial one does): one square labelled
    // "10cm (4in)" is wrong by 1.6mm (4in is 101.6) and does not say which unit it is true to.
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
