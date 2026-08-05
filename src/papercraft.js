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
 * A React/DOM-free pure module (just returns an HTML string; stl.js's openHTML opens it in a tab).
 * ============================================================================
 */
import {
  ribOutline2D, grooveList, grooveR, outerR, komaShape, maxBoards, tabDented, notchR, komaR,
} from "./geometry.js";

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
  const all = [part.outline, ...(part.holes || [])].flat().concat((part.marks || []).flatMap((m) => [[m[0], m[1]], [m[2], m[3]]]));
  const b = bbox(all.map(conv));
  const fix = (q) => { const [x, y] = conv(q); return [x - b.x0, b.y1 - y]; }; // flip y
  return {
    name: part.name,
    outline: part.outline.map(fix),
    holes: (part.holes || []).map((hh) => hh.map(fix)),
    marks: (part.marks || []).map((m) => [...fix([m[0], m[1]]), ...fix([m[2], m[3]])]),
    w: b.w, h: b.h,
  };
}

// ============ Each part's 2D outline (all derived from geometry.js) ============

// Rib: a smooth outer edge with no grooves carved + tick lines at the bamboo-rib winding positions.
// No lightening windows (cardboard is light, and windows only weaken it and add cutting effort).
function ribPart(pk, k, nRibs, matT, t) {
  const h = pk.height;
  const outline = ribOutline2D(pk, k, { smooth: true });
  // Tick line positions use the same basis as the STL grooves (grooveList). Horizontal lines TICK mm inward from the outer edge.
  // With spiral winding the grooves shift per rib, so pass k (mark them at the same positions as 3D).
  const marks = grooveList(pk, grooveR(pk), k).map((y) => {
    const x = outerR(pk, Math.min(Math.max(y, 0), h) / h);
    return [x, y, x - TICK, y];
  });
  // Number stays outside t() so the default (Japanese) name still contains the plain word for the tests.
  return { name: `${t("羽根板")} ${k + 1}/${nRibs}`, outline, marks };
}

// Koma: the same komaShape as 3D (= same notch bottom notchR, same notch width). Only the thickness differs.
function komaPart(pk, i, t) {
  const pts = komaShape(pk).extractPoints(1).shape.map((v) => [v.x, v.y]);
  return { name: `${t("コマ")} ${i + 1}/2`, outline: pts };
}

// ---- Cross stand (assemble two cardboard strips into an X to stand the mold up) ----
// Winding bamboo ribs and applying washi wants the mold standing so the whole circumference is accessible. The mold is
// "an egg shape with a fat belly (max diameter) tapering toward the bottom koma (⌀38)", so supporting only the central
// bottom koma leaves the belly floating in the air. Two strips interlock at a central slot into an X, and two V-notches
// on their top edges cradle the bottom koma's rim. Being a light paper shell, the feet (strip length) can be quite modest
// from a tip-over margin (⌀70 for the default shape).
const STAND = {
  H: 42,        // strip height (mm) = V-cradle depth + floor clearance
  vDepth: 12,   // V-cradle notch depth (mm). The bottom koma's rim sinks in here and centers
  slotDepth: 22, // interlock slot depth (mm). vDepth + this < H keeps a bridge at the center (prevents severing)
};
const SLOT_FIT = 0.3; // interlock slot fit (mm). Small because cardboard crushes
// Stand foot diameter (mm). Derives the minimum non-tipping diameter from the mold's center-of-gravity height, rounds to 5mm, floor 70.
function standFootD(pk) {
  const full = pk.height + 2 * pk.tabLen, cg = full * 0.45;   // a thin shell of revolution's CoG is roughly 45% of full height
  const need = 2 * cg * Math.tan((15 * Math.PI) / 180);       // foot diameter that recovers even when tilted 15°
  return Math.max(70, Math.ceil(need / 5) * 5);
}
// Outline of one strip. The central slot is cut from the top edge if slotTop=true, else from the bottom edge
// (the two are flipped top/bottom to interlock). A V-cradle is always added at the top-edge center. vw = the V's opening width.
function standStrip(L, matT, vw, slotTop, name) {
  const H = STAND.H, sw = matT + SLOT_FIT, vd = STAND.vDepth, sd = STAND.slotDepth;
  const o = [];
  // Bottom edge (left → right). For the bottom slot, recess the center.
  if (!slotTop) { o.push([-L / 2, 0], [-sw / 2, 0], [-sw / 2, sd], [sw / 2, sd], [sw / 2, 0], [L / 2, 0]); }
  else { o.push([-L / 2, 0], [L / 2, 0]); }
  // Right edge → top edge (right → left, V-cradle). For the top slot, a narrower slot goes further down from the V's bottom.
  o.push([L / 2, H], [vw / 2, H], [0, H - vd]);
  if (slotTop) { o.push([sw / 2, H - vd], [sw / 2, H - sd], [-sw / 2, H - sd], [-sw / 2, H - vd]); }
  o.push([-vw / 2, H], [-L / 2, H]);
  return { name, outline: o };
}
function standParts(pk, matT, t) {
  const L = standFootD(pk);
  // Make the V's opening width **narrower** than the bottom koma's diameter. If wide, the koma drops through to the V's
  // bottom and just rests on the rim, without centering. If narrow, the koma is caught at the left/right corners of the
  // opening, and the 4 corners across both strips constrain the koma at the center.
  const vw = Math.min(L - 8, Math.max(matT + 8, 2 * komaR(pk) - 6));
  return [
    standStrip(L, matT, vw, false, `${t("スタンド帯")} 1/2 (${t("下スロット")})`),
    standStrip(L, matT, vw, true, `${t("スタンド帯")} 2/2 (${t("上スロット")})`),
  ];
}

/**
 * Build all parts to lay out on the papercraft. The returned p is "the papercraft p with material thickness applied".
 * Depending on material thickness, boards may exceed maxBoards (the notches overlap at the center), so always clamp it,
 * and return whether it was clamped in `clamped` so the UI/page can warn.
 */
export function paperParts(p, matT, t = tid) {
  // fit=0: add no print tolerance (nominal = exactly the material thickness). Cardboard crushes its fibers going in, so
  // adding the 3D-print fit (0.3mm default) would instead make it wobble and the tab couldn't hold the koma.
  const pk = { ...p, boardT: matT, komaT: matT, fit: 0 };
  const nMax = maxBoards(pk);
  const clamped = pk.boards > nMax;
  if (clamped) pk.boards = nMax;

  const parts = [];
  for (let k = 0; k < pk.boards; k++) parts.push(ribPart(pk, k, pk.boards, matT, t));
  for (let i = 0; i < 2; i++) parts.push(komaPart(pk, i, t));
  parts.push(...standParts(pk, matT, t));   // the cross stand that stands the mold up (two strips)
  // Whether the tab-tip dent (the koma stop) is present. It needs a tab long enough / center roomy enough
  // (tabDented); if not, the page warns that the koma can't be stopped from slipping inward.
  const stop = tabDented(pk);
  // Wall thickness remaining between the koma's notches (at the notch bottom = notchR). Thicker material
  // widens the notches, thinning the wall. The shape isn't changed (we don't silently reduce the count),
  // but if it's at a level that would tear when hand-cut (less than half the material thickness), note it on
  // the page so the user has grounds to choose count/material/opening.
  const wall = (2 * Math.PI * notchR(pk)) / pk.boards - matT;
  return { parts, pk, clamped, nMax, wall, stop };
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

// ============ SVG / HTML generation ============
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const n2 = (v) => (Math.round(v * 100) / 100).toString();
const pathOf = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${n2(x)} ${n2(y)}`).join("") + "Z";

// SVG for one page. Page i maps the [top, top+CH] band of content coordinates.
function pageSVG(lay, i, page, info, t) {
  const { top, bot } = lay.pages[i];
  const parts = [];
  for (const q of lay.placed) {
    if (q.y >= bot || q.y + q.h <= top) continue;          // don't draw parts not in this band
    const g = [`<path d="${pathOf(q.outline)}" class="cut"/>`];
    for (const hh of q.holes) g.push(`<path d="${pathOf(hh)}" class="cut"/>`);
    for (const m of q.marks) g.push(`<line x1="${n2(m[0])}" y1="${n2(m[1])}" x2="${n2(m[2])}" y2="${n2(m[3])}" class="tick"/>`);
    // The part name goes faintly **inside the part** for identification after cutting. Placed near the top it would land on
    // the "cut-away side" like a post's U-saddle, so place it slightly below center (62%) where material remains.
    g.push(`<text x="${n2(q.w / 2)}" y="${n2(q.h * 0.62)}" class="pname">${esc(q.name)}</text>`);
    parts.push(`<g transform="translate(${n2(q.x)} ${n2(q.y)})">${g.join("")}</g>`);
  }
  // Registration marks (crosses in the four corners). Used to align when gluing sheets together.
  const cross = (x, y) => `<path d="M${n2(x - 3)} ${n2(y)}H${n2(x + 3)}M${n2(x)} ${n2(y - 3)}V${n2(y + 3)}" class="reg"/>`;
  const marks = [cross(MARGIN, MARGIN), cross(MARGIN + lay.CW, MARGIN), cross(MARGIN, MARGIN + lay.CH), cross(MARGIN + lay.CW, MARGIN + lay.CH)].join("");
  // Glue-tab band. Drawn only when the next page intrudes into this page's band (= a part spans pages).
  // If no part spans, pages don't overlap, so neither the line nor the note appears.
  const next = lay.pages[i + 1];
  const glueTop = next && next.top < bot ? next.top : null;   // only when there's an actual overlap
  const glueY = MARGIN + (glueTop - top);
  const glue = glueTop == null ? ""
    : `<line x1="${MARGIN}" y1="${n2(glueY)}" x2="${n2(MARGIN + lay.CW)}" y2="${n2(glueY)}" class="glue"/>`
      + `<text x="${n2(MARGIN + 2)}" y="${n2(glueY - 1.5)}" class="note">${esc(t("▼ここから下は次のページと重なります(のりしろ)"))}</text>`;
  // Full-scale check ruler (50mm). Always verify with a ruler that no printer scaling was applied.
  const sy = page.h - MARGIN - 5, sx = MARGIN;
  const ruler = `<path d="M${sx} ${n2(sy)}h50M${sx} ${n2(sy - 2)}v4M${n2(sx + 25)} ${n2(sy - 1.5)}v3M${n2(sx + 50)} ${n2(sy - 2)}v4" class="reg"/>`
    + `<text x="${n2(sx + 53)}" y="${n2(sy + 1.5)}" class="note">${esc(t("50mm ← 定規で確認(合わなければ「実際のサイズ/100%」で印刷し直し)"))}</text>`;
  const foot = `<text x="${n2(page.w - MARGIN)}" y="${n2(sy + 1.5)}" class="foot">${esc(info.title)} — ${i + 1} / ${info.pages}</text>`;

  // Clip parts to the page band (top..bot). This prevents a spanning part from bleeding into the bottom info band,
  // and it also determines the page break (without the clip, the neighboring page's content bleeds onto the paper).
  const clip = `clip${i}`;
  return `<svg class="pg" width="${page.w}mm" height="${page.h}mm" viewBox="0 0 ${page.w} ${page.h}" xmlns="http://www.w3.org/2000/svg">`
    + `<defs><clipPath id="${clip}"><rect x="${MARGIN}" y="${MARGIN}" width="${n2(lay.CW)}" height="${n2(bot - top)}"/></clipPath></defs>`
    + `<g clip-path="url(#${clip})"><g transform="translate(${MARGIN} ${n2(MARGIN - top)})">${parts.join("")}</g></g>`
    + marks + glue + ruler + foot + `</svg>`;
}

/**
 * Return the papercraft's printable HTML (self-contained, single file).
 * Open it in the browser and print via Ctrl/⌘+P → "Actual size (100%), no margins".
 */
export function paperHTML(p, matT, page = A4, t = tid) {
  const { parts, pk, clamped, nMax, stop, wall } = paperParts(p, matT, t);
  const lay = layout(parts, page);
  const info = { pages: lay.pages.length, title: t("張型スタジオ 型紙 {name} 原寸", { name: page.name }) };
  const svgs = [];
  for (let i = 0; i < lay.pages.length; i++) svgs.push(pageSVG(lay, i, page, info, t));

  const warnWall = wall < matT / 2
    ? `<p class="warn">${t("⚠ コマの<b>溝と溝の間の壁が {wall}mm</b> しかありません(溝の幅は材料厚どおりの {matT}mm)。手で切ると裂けやすい細さです。太くするには <b>羽根板の枚数を減らす</b>・<b>薄い材料にする</b>・断面図で<b>開口を広げてコマを大きくする</b> のいずれかが効きます。", { wall: wall.toFixed(1), matT })}</p>`
    : "";
  const warnStop = !stop
    ? `<p class="warn">${t("⚠ 爪が短い/コマが小さいため、<b>爪先の凹み(ストッパ(段))が作れませんでした</b>。コマが内側へずれ落ちるのを形で止められません。「爪の長さ」を長く({min}mm 程度以上)、または断面図で<b>開口を広げてコマを大きく</b>すると凹みが付きます。", { min: 8 })}</p>`
    : "";
  const warn = clamped
    ? `<p class="warn">${t("⚠ 材料厚 {matT}mm では羽根板は最大 {nMax} 枚です(溝が広がり、コマの中心で溝どうしが重なるため)。{boards} 枚 → <b>{nMax} 枚</b>に減らして出力しました。枚数を保ちたい場合は薄い材料を使ってください。", { matT, nMax, boards: p.boards })}</p>`
    : "";

  return `<meta charset="utf-8"><title>${esc(info.title)}</title>
<style>
  /* One sheet per page, exactly paper-sized. The SVG carries the margins, so this is 0. */
  @page { size: ${page.name}; margin: 0 }
  body { margin: 0; font-family: system-ui, "Hiragino Sans", sans-serif; color: #2b2118; background: #eae6df }
  .pg { display: block; background: #fff; page-break-after: always; break-after: page; margin: 0 auto 12px }
  .cut  { fill: none; stroke: #000; stroke-width: 0.25 }               /* cut line */
  .tick { fill: none; stroke: #000; stroke-width: 0.25; stroke-dasharray: 1.2 1 } /* bamboo-rib ticks (do not cut) */
  .reg  { fill: none; stroke: #000; stroke-width: 0.2 }                /* registration marks / scale */
  .glue { fill: none; stroke: #888; stroke-width: 0.2; stroke-dasharray: 3 2 }
  .pname { font-size: 3.4px; fill: #999; text-anchor: middle; font-family: sans-serif }
  .note  { font-size: 2.6px; fill: #888; font-family: sans-serif }
  .foot  { font-size: 2.8px; fill: #666; text-anchor: end; font-family: sans-serif }
  .head { max-width: 190mm; margin: 16px auto; padding: 16px 20px; background: #fff; border-radius: 10px; line-height: 1.75; font-size: 13px }
  .head h1 { font-size: 16px; margin: 0 0 10px }
  .head ol { padding-left: 1.2em; margin: 8px 0 } .head li { margin: 3px 0 }
  .head code { background: #f2efe9; padding: 1px 5px; border-radius: 4px }
  .warn { background: #fff4e8; border-left: 3px solid #d95b18; padding: 8px 12px; border-radius: 4px }
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
  <h1>${t("張型スタジオ — 段ボール用 型紙({name} 原寸 / 全 {pages} ページ)", { name: page.name, pages: lay.pages.length })}</h1>
  <div class="acts">
    <button onclick="window.print()">${t("印刷 / PDFで保存")}</button>
    <button class="sub" onclick="saveHtml()">${t("HTMLで保存")}</button>
    <span class="hint">${t("PDF が欲しいときは、印刷ダイアログの<b>「送信先」を「PDFに保存」</b>にしてください。")}<br>
      ${t("いずれの場合も<b>「実際のサイズ / 100%」「余白: なし」</b>を選び、「用紙に合わせる」は外してください。")}</span>
  </div>
  ${warn}${warnWall}${warnStop}
  <ol>
    <li>${t("<b>「実際のサイズ / 100%」で印刷</b>してください(「用紙に合わせる」は禁止)。刷ったら各ページ下の <b>50mm スケール</b>を定規で必ず確認。")}</li>
    <li>${t("ページを跨ぐ部品は、<b>のりしろ(灰色の破線より下)</b>を次ページに重ね、四隅のトンボを合わせて貼り合わせます。")}</li>
    <li>${t("紙を段ボールに貼り、<b>実線だけ</b>を切り抜きます。<b>破線の目盛は切りません</b> — 竹ひごを巻く位置の印です。")}</li>
    <li>${t("段ボールの<b>波の向き(目)は羽根板の長手方向</b>に合わせると折れにくくなります。")}</li>
    <li>${t("材料厚 <code>{matT}mm</code> 前提でコマの溝の幅を決めています。実測厚と違うと嵌まりません(緩い/入らない)。", { matT })}</li>
    <li>${t("コマ2枚は<b>同一形状</b>です(上下で同じものを使います)。")}</li>
    <li>${t("組み立て: 羽根板の爪を上下2枚のコマに放射状に差し込みます。上端の爪の内側にある<b>段(ストッパ)</b>が、上のコマが内側へ入り込むのを止めます。差し込みが緩ければ接着してください。")}</li>
    <li>${t("<b>スタンド(帯2枚)</b>: 中央のスロットを噛み合わせて<b>X字に立て</b>ます(一方は上から、一方は下からスロットを切ってあるので直交して組めます)。上辺のV字に<b>下のコマの縁を載せる</b>と、型が立って腹(最大径)が宙に浮き、竹ひごや和紙の作業が全周からできます。ぐらつく場合は接着してください。")}</li>
  </ol>
  <p style="color:#8a7f6e;font-size:12px;margin:6px 0 0">${t("火袋の高さ {height}mm / 羽根板 {boards}枚 / 竹ひごピッチ {pitch}mm — この帯は画面表示だけで、印刷はされません。", { height: p.height, boards: pk.boards, pitch: p.pitch })}</p>
</div>
${svgs.join("\n")}
<script>
// Save this page itself as an HTML file (to reprint later or hand to another device).
// The papercraft is self-contained (no external references), so this single file reproduces it.
function saveHtml() {
  var html = "<!doctype html>\\n" + document.documentElement.outerHTML;
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  a.download = "harigata_katagami_${page.name.toLowerCase()}.html";
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
}
</script>`;
}
