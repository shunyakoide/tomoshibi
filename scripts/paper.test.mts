/**
 * ============================================================================
 * Papercraft (cardboard) verification
 * ============================================================================
 * STL correctness is "watertight"; papercraft is paper, so the criteria differ. Three things must
 * not break:
 *
 *   1. **Full scale (1:1)** — paper dimensions = real mm, cross-checked against geometry.ts's own
 *      invariants (rib length, koma outer diameter, groove width, groove wall). If this drifts the
 *      template is worthless.
 *   2. **No missing parts** — all N ribs + 2 koma appear, which only this can catch after row
 *      packing and page spanning. Also that **no seam marks are emitted when no part spans pages**
 *      (sheets butt at the trim box; there is no glue tab anywhere).
 *   3. **No NaN/undefined** — a NaN in an SVG path makes that part vanish silently, so you find out
 *      after printing.
 *
 * The **washi template** is checked by the same three plus its own decisive invariant: the sheet's
 * length is the **meridian arc length**, not the body height — cutting to the straight height is the
 * mistake the template exists to prevent, so section 4 asserts it against an independent integration
 * of `outerR`. It is a document of its own on both routes, so section 4 also pins that its pages are
 * NOT among the cardboard template's.
 * ============================================================================
 */
import { paperPagesSVG, washiPagesSVG, paperPDF, paperParts, paperFit, paperP, washiParts, washiPDF, A4, MARGIN, TOPBAR } from "../src/papercraft.ts";
import { winAnsi } from "../src/pdf.ts";
import { makeT } from "../src/i18n.ts";
import { komaR, tabDented, innerRi, notchR, outerR, fukuroRange, grooveList, grooveR } from "../src/geometry.ts";
import { PRESETS, DEFAULTS, LIMITS } from "../src/config.ts";

let fail = 0;
const bad = (msg: string) => { console.log("FAIL:", msg); fail++; };
const en = makeT("en"); // the PDF is drawn with the English labels (base-14 fonts have no CJK glyphs)
const eq = (a: number, b: number, msg: string, tol = 0.01) => { if (Math.abs(a - b) > tol) bad(`${msg}: ${a} != ${b}`); };
// Bounding box of the point list (outline + holes)
const bb = (q: any) => {
  const a = [q.outline, ...(q.holes || [])].flat();
  const xs = a.map((v: number[]) => v[0]), ys = a.map((v: number[]) => v[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

// ---- 1. Full-scale: do the paper dimensions match geometry.ts values? ----
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const matT of [1, 2, 5, 10]) {
      const p = { ...DEFAULTS, ...preset, height };
      const { parts, pk, clamped, nMax } = paperParts(p, matT);
      const tag = `${preset.key} h${height} t${matT}`;
      const find = (pre: string) => parts.find((q) => q.name.startsWith(pre))!;
      eq(bb(find("羽根板")).h, p.height + 2 * p.tabLen, `${tag} rib total length`);
      // Koma notch width = material thickness exactly (fit=0). If this drifts, the tab won't fit / will wobble.
      eq(pk.boardT + Math.max(0, pk.fit ?? 0), matT, `${tag} notch width`);
      // Cardboard skips the tab-tip dent (strength over the koma stop): the papercraft rib is a plain
      // straight tab, and the koma notch is full-depth so that plain tab fits.
      if (tabDented(pk)) bad(`${tag} papercraft should have no tab dent (noTabDent)`);
      eq(notchR(pk), innerRi(pk) - 0.5, `${tag} koma notch should be full-depth for the plain tab`);
      // The wall left between the koma's notches. Thin (under half the material thickness) means it
      // tears when hand-cut — the app raises a viewport alert for it, and no longer the printed page,
      // because every fix for it (fewer ribs / thinner material / a wider opening) is a control you
      // reach for while designing. So what has to hold here is that the number the alert quotes is
      // the real one: paperFit is what the app calls, checked against the formula and against the
      // copy paperParts hands the template.
      const wall = (2 * Math.PI * notchR(pk)) / pk.boards - matT;
      const fit = paperFit(p, matT);
      eq(fit.wall, wall, `${tag} paperFit wall`);
      eq(fit.thin, matT / 2, `${tag} paperFit thin threshold`);
      if (fit.clamped !== clamped || fit.nMax !== nMax) bad(`${tag} paperFit disagrees with paperParts`);
      // The koma is a polygonal approximation (chords) + edge notch cutouts, so the circumscribed diameter is slightly under the diameter
      // (thicker material = wider notches = more under). It's an error if it **exceeds** komaR.
      const kw = bb(find("コマ")).w, kd = 2 * komaR(pk);
      if (!(kw <= kd + 0.01 && kw >= kd * 0.9)) bad(`${tag} koma outer diameter ${kw} vs ${kd}`);
      // The washi PDF that ships with THIS route is cut from paperP, not from the design as edited.
      // The panel is one rib-to-rib bay wide, so a clamped rib count means wider panels; cutting the
      // unclamped ones would give a skin that does not meet itself on the mold this template makes.
      eq(washiParts(paperP(p, matT)).g.span, washiParts(pk).g.span, `${tag} washi span`);
      if (fit.clamped && !(washiParts(pk).g.wMax > washiParts(p).g.wMax))
        bad(`${tag}: the clamped rib count does not widen the washi panel`);
    }

// ---- 2/3. Sweep for missing parts / NaN / page consistency ----
let n = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const boards of [4, 6, 8, 12, 16])
      for (const matT of [1, 2, 3, 5, 8, 10])
        for (const pitch of [8, 15, 30]) {
          n++;
          const p = { ...DEFAULTS, ...preset, height, boards, pitch };
          const tag = `${preset.key} h${height} b${boards} t${matT} pi${pitch}`;
          const { parts, pk, clamped, nMax } = paperParts(p, matT);
          const nRibParts = pk.spiral ? pk.boards : 1; // identical ribs → a single "×N" sheet; spiral → one per rib
          // The mold and nothing else: koma is 2 sheets, or 1 ("×2") when 2 would spill onto an extra
          // page. The washi panel is a document of its own (its own PDF beside this one in the ZIP),
          // so a sheet of it appearing here would mean it is being printed twice.
          if (parts.length !== nRibParts + 1 && parts.length !== nRibParts + 2) bad(`${tag}: part count ${parts.length}`);
          if (parts.some((q) => q.name.startsWith("和紙"))) bad(`${tag}: washi panel laid out among the cardboard pages`);
          if (clamped && pk.boards !== nMax) bad(`${tag}: clamp mismatch`);
          for (const q of parts) {
            const pts = [q.outline, ...(q.holes || [])].flat();
            if (!pts.length) bad(`${tag}: ${q.name} empty`);
            for (const [x, y] of pts) if (!Number.isFinite(x) || !Number.isFinite(y)) bad(`${tag}: ${q.name} has NaN`);
            for (const m of q.marks || []) for (const v of m) if (!Number.isFinite(v)) bad(`${tag}: ${q.name} has NaN in marks`);
          }
          // The template ships as a PDF, but its pages are built from the same pageOps; paperPagesSVG
          // renders them as the markup the in-app preview shows, which is what these assertions read.
          // (The PDF's own structural checks are section 5.)
          const { svg, pages } = paperPagesSVG(p, matT, undefined, A4);
          if (/NaN|Infinity|undefined/.test(svg)) bad(`${tag}: NaN/undefined in the pages`);
          if (pages < 1 || pages > 60) bad(`${tag}: page count ${pages}`);
          if ((svg.match(/class="pg"/g) || []).length !== pages) bad(`${tag}: page count disagrees with the markup`);
          // The check bar is what catches printer scaling, so a template without one is unusable.
          // It is once per DOCUMENT now, not once per page — printers scale the whole job alike, so
          // one sheet answers for all of them, and reserving a strip on every page bought nothing.
          // It must be drawn whole: TWO ARMS (one across, one down), each a line plus its two end
          // ticks = six "scale" paths. Two arms because a printer can scale x and y by different
          // amounts; and BOTH units ride BOTH arms, a tick where the metric figure falls and another
          // where the imperial one does, so either rule checks either axis.
          const sheets = svg.split('<svg class="pg"').slice(1);
          if (sheets.length !== pages) bad(`${tag}: ${sheets.length} sheets vs ${pages} pages`);
          // Exactly one sheet carries it, and which one is the layout's call — it goes wherever the
          // parts already leave room (scaleSpot), so pinning it to sheet 1 would pin the packing too.
          // What must hold is that it exists at all, on one sheet, with every mark on it: a template
          // with no check square cannot be trusted at any size, and one drawn twice means two answers.
          for (const u of ["5cm", "3in", "1in", "3cm"]) {
            const on = sheets.filter((x) => x.includes(u)).length;
            if (on !== 1) bad(`${tag}: ${u} mark on ${on} sheets, want exactly 1`);
          }
          if ((svg.match(/class="scale"/g) || []).length !== 6) bad(`${tag}: check square drawn incompletely`);
          for (const q of parts) if (!svg.includes(q.name)) bad(`${tag}: ${q.name} not on paper`);
          // Seams appear only when a part is too tall for one sheet. Derived from the module's own
          // constants rather than copied: this block used to carry "297 - 2*8 - 14" long after the
          // 14mm band was deleted, and only passed because no swept part happened to land in the gap
          // between the CH it assumed and the real one.
          const CH = 297 - 2 * MARGIN;      // a full sheet
          const CH0 = CH - TOPBAR;          // sheet 1, which gives up its top strip to the check bar
          const tallest = Math.max(...parts.map((q) => {
            const a = [q.outline, ...(q.holes || [])].flat();
            const ys = a.map((v) => v[1]), xs = a.map((v) => v[0]);
            // If it doesn't fit the paper width it's rotated 90°, in which case the width becomes the height
            const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
            return w > 210 - 2 * MARGIN ? w : h;
          }));
          // Judge by what is actually drawn on paper: a seam carries code 1A on both of its sheets.
          const glued = svg.includes(">1A<");
          // Between CH0 and CH it depends which sheet the part lands on, so only the two certain
          // ends are asserted: fits anywhere → never a seam; fits nowhere → always one.
          if (tallest <= CH0 && glued) bad(`${tag}: seam emitted despite no spanning part`);
          if (tallest > CH && !glued) bad(`${tag}: seam missing despite a spanning part`);
          // Both halves of every seam must exist, or there is nothing to line up against: the sheet
          // above draws the top halves and the sheet below the bottom halves, codes 1A/1B, 2A/2B …
          for (let j = 1; j <= pages; j++)
            for (const side of ["A", "B"]) {
              const on = sheets.filter((x) => x.includes(`>${j}${side}<`)).length;
              if (on && on !== 2) bad(`${tag}: seam ${j}${side} is on ${on} sheet(s), not 2`);
            }
          // A sheet at a seam carries a diamond on all four edges: the coded pair on whichever of the
          // top/bottom edges has a seam, plus one unlabelled trim mark on each side.
          const codes = (svg.match(/class="jlabel">\d+[AB]</g) || []).length;
          const diamonds = (svg.match(/class="join"/g) || []).length;
          const seamed = sheets.filter((x) => x.includes('class="join"')).length;
          // A horizontal frame line can only be one of three things, and a fourth value means it is
          // marking something that isn't there. This caught a bottom frame drawn at the end of the
          // CONTENT band on pages whose next page starts a new row — a line across the middle of the
          // paper that is neither a seam nor a cut, and that moved from sheet to sheet.
          const trimBot = A4.h - MARGIN;
          for (const y of svg.matchAll(/M0 ([\d.]+)L210 /g))
            if (![MARGIN, trimBot].some((v) => Math.abs(Number(y[1]) - v) < 1e-6))
              bad(`${tag}: frame line at y=${y[1]}, not a trim edge (${MARGIN}/${trimBot})`);
          // The trim box is a fact about the PAPER, so it is on every sheet and identical on each —
          // a box that changes size from sheet to sheet is the bug this replaced (a seam sheet's box
          // used to stop at the seam, 10mm short of the others).
          const framed = sheets.filter((x) => x.includes('class="frame"')).length;
          if (framed !== pages) bad(`${tag}: trim box on ${framed} of ${pages} sheets`);
          if (diamonds !== codes + seamed * 2) bad(`${tag}: ${diamonds} diamonds for ${codes} codes on ${seamed} seamed sheets`);
        }

// ---- 4. Washi template (the paper skin's flat pattern) ----
// Same three criteria, but the invariant that decides whether the cut sheet is usable is the
// **meridian arc length**: the sheet must be as long as the curve, not as tall as the body. Cutting
// to the straight height is exactly the mistake this template exists to prevent, so it is asserted
// against an independent integration of outerR here.
let nw = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const boards of [4, 6, 8, 12, 16])
      for (const spiral of [false, true])
        for (const [side, end] of [[3, 3], [0, 0], [10, 5]]) {
          nw++;
          const p = { ...DEFAULTS, ...preset, height, boards, spiral };
          const tag = `${preset.key} h${height} b${boards} sp${spiral ? 1 : 0} s${side} e${end}`;
          const { parts, g, sheets } = washiParts(p, { side, end });
          const N = p.boards;
          // Independent recomputation: arc length ∫√(1+R'²)dy and max half width π·R/N over the body.
          const fr = fukuroRange(p), y0 = fr.lo * height, y1 = fr.hi * height;
          let arc = 0, wMax = 0, prev = null;
          for (let i = 0; i <= 4000; i++) {
            const y = y0 + ((y1 - y0) * i) / 4000, R = outerR(p, y / height);
            if (prev) arc += Math.hypot(y - prev.y, R - prev.R);
            wMax = Math.max(wMax, (Math.PI * R) / N);
            prev = { y, R };
          }
          eq(g.sTot, arc, `${tag} meridian arc length`, 0.05);
          eq(g.wMax, wMax + side, `${tag} panel half width`, 0.05);
          if (g.sTot < y1 - y0) bad(`${tag}: pattern shorter than the body height (${g.sTot} < ${y1 - y0})`);
          if (sheets * g.span < N) bad(`${tag}: ${sheets} sheets × span ${g.span} does not cover ${N} bays`);
          // The cut outline must be exactly `side`/`end` outside the guides (= the rib and opening lines).
          const q = parts[0];
          const xs = q.outline.map((v) => v[0]), ys = q.outline.map((v) => v[1]);
          eq(Math.max(...xs) - Math.min(...xs), 2 * (wMax + side), `${tag} sheet width`, 0.05);
          eq(Math.max(...ys) - Math.min(...ys), arc + 2 * end, `${tag} sheet length`, 0.05);
          // guides[0]/[1] are the two rib lines (the opening lines that follow run the full width).
          const gx = q.guides.slice(0, 2).flat().map((v) => v[0]);
          eq(Math.max(...gx), wMax, `${tag} rib guide inset by the overlap`, 0.05);
          eq(Math.min(...gx), -wMax, `${tag} rib guide inset by the overlap`, 0.05);
          // Bamboo-rib ticks: one per groove on each edge (spiral shifts the right edge, not the count-by-edge).
          const nTicks = grooveList(p, grooveR(p), 0).length + grooveList(p, grooveR(p), 1).length;
          if ((q.marks || []).length !== nTicks) bad(`${tag}: ${q.marks.length} ticks vs ${nTicks} grooves`);
          for (const v of [...q.outline.flat(), ...q.guides.flat(2), ...(q.marks || []).flat()])
            if (!Number.isFinite(v)) bad(`${tag}: NaN in the washi pattern`);
          // The panel's own sheets — the SVG encoding of the pages the ZIP's PDF is written from
          // (nothing in the app draws them; see washiPagesSVG). Section 5 pins their page count to
          // that PDF's; here, that they are drawn at all, and drawn as guides.
          const ws = washiPagesSVG(p, { side, end }, undefined, A4).svg;
          if (/NaN|Infinity|undefined/.test(ws)) bad(`${tag}: NaN/undefined in the washi sheets`);
          if (!ws.includes("和紙")) bad(`${tag}: the panel is not on its own sheets`);
          // Guides must be drawn as guides, never as cut lines (cutting them ruins the panel).
          if (!/class="guide"/.test(ws)) bad(`${tag}: guides not drawn on the washi sheets`);
          // …and nowhere else: the cardboard template stopped carrying it when it became its own PDF,
          // and a panel on both would be one printed twice, at two different rib counts.
          if (paperPagesSVG(p, 3, undefined, A4).svg.includes("和紙"))
            bad(`${tag}: the washi panel is still on the cardboard pages`);
        }

// ---- 5. The template PDFs (both shipped deliverables) ----
// The washi template bundled in the STL kit's ZIP, and the cardboard template, which since the HTML
// page was dropped IS the cardboard route's entire output.
//
// The PDF is hand-rolled (src/pdf.ts), so this checks the two ways it can be silently wrong: **a
// broken file** (a bad xref offset makes viewers refuse it or open it blank) and **a wrong scale**
// (the whole point of the template), pinned by the page CTM (mm→pt = 2.835) and by the check
// square's arms measuring 76.2mm (3in) across and 30mm (3cm) down in user space.
//
// An outlined character is a scale-and-flip matrix, a fill colour, a stored path, filled — and its
// operators are `m`/`l`/`c`/`h` like any other path, so every reader of the content stream has to
// strip glyph blocks first. A glyph is a word on the page, not a line to cut along.
const GLYPH_RE = /q [-\d. ]+ cm [\d. ]+ rg [-\d. mlch]+ f Q/g;
const pdfStructure = (s: string, tag: string, pages: number) => {
  if (!s.startsWith("%PDF-1.")) bad(`${tag}: no PDF header`);
  if (!s.trimEnd().endsWith("%%EOF")) bad(`${tag}: no EOF marker`);
  // Every xref offset must land exactly on its object header, or viewers reject the file.
  const xrefAt = Number((s.match(/startxref\s+(\d+)/) || [])[1]);
  const table = s.slice(xrefAt).match(/^xref\n0 (\d+)\n([\s\S]*?)\ntrailer/);
  if (!table) { bad(`${tag}: no xref table`); return; }
  table[2].split("\n").slice(1).forEach((row: string, i: number) => {   // skip the free entry
    const off = Number(row.slice(0, 10));
    if (!s.startsWith(`${i + 1} 0 obj`, off)) bad(`${tag}: xref offset ${i + 1} → ${off} is not an object header`);
  });
  if (!s.includes(`/Count ${pages}`)) bad(`${tag}: /Count is not ${pages}`);
  if ((s.match(/\/MediaBox\[0 0 595\.276 841\.89\]/g) || []).length !== pages) bad(`${tag}: MediaBox is not A4 on every page`);
  // Full scale: the page CTM is mm→pt, and the ruler is 50mm long in that space.
  if ((s.match(/2\.835 0 0 -2\.835 0 841\.89 cm/g) || []).length !== pages) bad(`${tag}: page CTM is not mm→pt`);
  // Full scale, part two: the check square's two arms, found by LENGTH rather than by coordinates
  // (a bar's position follows the layout). Both axes are required — the reason the mark is an L and
  // not a bar is that a printer can scale x and y differently, and only a vertical arm sees that.
  const seg = [...s.matchAll(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g)];
  const has = (i0: number, i1: number, fixed: [number, number], len: number) => seg.some((m) =>
    m[fixed[0]] === m[fixed[1]] && Math.abs(Math.abs(Number(m[i1]) - Number(m[i0])) - len) < 1e-6);
  if (!has(1, 3, [2, 4], 76.2)) bad(`${tag}: no 3in arm on the check square`);
  if (!has(2, 4, [1, 3], 30)) bad(`${tag}: no 3cm arm on the check square`);
  // Text must be WinAnsi: a stray multi-byte character would print as mojibake.
  for (const m of s.matchAll(/\((.*?)\) Tj/g))
    for (const ch of m[1]) if (ch.charCodeAt(0) > 0xff) bad(`${tag}: non-WinAnsi text ${JSON.stringify(m[1])}`);
};
let np = 0;
for (const preset of PRESETS)
  for (const height of [140, 300, 400])
    for (const boards of [6, 8, 12]) {
      np++;
      const p = { ...DEFAULTS, ...preset, height, boards };
      const tag = `pdf ${preset.key} h${height} b${boards}`;
      // Washi. Its page count is checked twice over. First against a derivation that owes the layout
      // code nothing — one part of this height on A4, butt-split across pages when it does not fit on
      // one. Two answers are admissible there because the check square either finds room beside the
      // panel (no strip reserved) or does not (sheet 1 gives up TOPBAR); which of the two is the
      // layout's call, and pinning it here would pin the packing. Then the PDF is pinned to the
      // preview's exact answer, so the sheets the 3D route shows beside its plates and the file in
      // the kit ZIP can never be a different document (same pairing as the cardboard one below).
      const { g } = washiParts(p, { side: 3, end: 3 });
      const H = g.sTot + 2 * g.end, CH = 297 - 2 * MARGIN, CH0 = CH - TOPBAR;
      const wPages = washiPagesSVG(p, { side: 3, end: 3 }, en, A4).pages;
      if (![Math.max(1, Math.ceil(H / CH)), H <= CH0 ? 1 : 1 + Math.ceil((H - CH0) / CH)].includes(wPages))
        bad(`${tag} washi: preview lays out ${wPages} pages, neither admissible answer`);
      pdfStructure(Buffer.from(washiPDF(p, { side: 3, end: 3 }, A4, en)).toString("latin1"), `${tag} washi`, wPages);

      // Cardboard. Its page count is checked against what the in-app preview lays out, so the file
      // the user prints and the pages they were shown can never be a different document.
      const cs = Buffer.from(paperPDF(p, 5, A4, en)).toString("latin1");
      pdfStructure(cs, `${tag} cardboard`, paperPagesSVG(p, 5, en, A4).pages);
      // The split, in the shipped bytes: the mold's PDF carries no washi panel. (Labelled in
      // English here, so this is what "和紙 ×N" comes out as when winAnsi has had it.)
      if (cs.includes(en("和紙"))) bad(`${tag} cardboard: the washi panel is in the mold's PDF`);
      // Every part must still be LABELLED. winAnsi drops what it cannot draw rather than mangling it,
      // so handing this PDF a Japanese translator would leave the names silently blank and every
      // check above would still pass — this is the one that notices.
      for (const q of paperParts(p, 5, en).parts)
        if (!cs.includes(q.name)) bad(`${tag} cardboard: "${q.name}" is not labelled in the PDF`);
      // The same sheet in Japanese — the language the app speaks by default, and the one the writer
      // could not print at all until it carried its own outlines. Nothing about the file's structure
      // may change (pdfStructure again, including the rule that no raw multi-byte reaches a Tj), and
      // every character WinAnsi cannot encode must be DRAWN. Counting is the whole point: dropping
      // them silently is the old failure, and it leaves every other assertion here satisfied.
      const jaSVG = paperPagesSVG(p, 5, undefined, A4);
      const js = Buffer.from(paperPDF(p, 5, A4)).toString("latin1");
      pdfStructure(js, `${tag} cardboard ja`, jaSVG.pages);
      const wanted = [...jaSVG.svg.matchAll(/<text[^>]*>([^<]*)</g)]
        .flatMap((m) => [...m[1]]).filter((ch) => ch.charCodeAt(0) > 0xff).length;
      const drawn = (js.match(GLYPH_RE) || []).length;
      if (!wanted) bad(`${tag} cardboard ja: the pages carry no Japanese to draw`);
      if (drawn !== wanted) bad(`${tag} cardboard ja: ${wanted} outlined characters on screen, ${drawn} in the PDF`);
    }
// ---- 6. One drawing, two encodings ----
// Every page is built once as `pageOps` and rendered as SVG or as PDF. Section 5 pins the page
// COUNT; this pins the drawing itself, so a change to one renderer cannot quietly leave the other
// behind — the only thing standing between a hand-rolled PDF and a file that disagrees with
// everything else here.
//
// Compared as coordinates, not bytes, because the two encodings legitimately differ in three ways
// and ONLY these three:
//   · SVG rounds to 2dp and the PDF to 3dp, so a coordinate ending .xx5 double-rounds 0.01mm apart:
//     the compare carries a tolerance and sorts on a coarse 0.1mm key (a lexicographic sort would
//     reorder the two lists over that same 0.01, and a key from the first few points ties paths);
//   · a part name is centred by `text-anchor: middle` in SVG and by a pre-shifted x in the PDF, so
//     its x is not comparable and text sorts on y + content;
//   · SVG escapes `<` as `&lt;`.
// A fourth difference appearing means a renderer has drifted, not that the tolerance needs widening.
const r2 = (v: string | number) => (+v).toFixed(2);
const pkey = (v: string) => String(v.split(" ").length).padStart(6) + "|"
  + v.split(" ").map((x: string) => (Math.round(+x * 10) / 10).toFixed(1).padStart(9)).join(",");
const byPath = (a: string, b: string) => (pkey(a) < pkey(b) ? -1 : pkey(a) > pkey(b) ? 1 : 0);
const tkey = (v: string) => v.split(" ").slice(1).join(" ");
const byText = (a: string, b: string) => (tkey(a) < tkey(b) ? -1 : tkey(a) > tkey(b) ? 1 : 0);
const svgPaths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)]
  .map((m) => m[1].replace(/[MLZ]/g, " ").trim().split(/\s+/).map(r2).join(" ")).sort(byPath);
const svgText = (svg: string) => [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>([^<]*)</g)]
  .map((m) => `${r2(m[1])} ${r2(m[2])} ${m[3].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")}`)
  .sort(byText);
const pdfBody = (s2: string) => [...s2.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => m[1]).join("\n");
const pdfPaths = (s2: string) => pdfBody(s2)
  .replace(/BT[\s\S]*?ET/g, "")            // a text block's `Tm` matrix ends in "m" — not a moveto
  .replace(GLYPH_RE, "")                   // an outlined character is text, not a line on the sheet
  .split(/\bS\b/)
  .map((seg) => [...seg.matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]\n?/g)].flatMap((m) => [r2(m[1]), r2(m[2])]).join(" "))
  .filter(Boolean).sort(byPath);
const pdfText = (s2: string) => [...pdfBody(s2).matchAll(/1 0 0 -1 ([\d.-]+) ([\d.-]+) Tm \((.*?)\) Tj/g)]
  .map((m) => `${r2(m[1])} ${r2(m[2])} ${m[3]}`).sort(byText);

const sameDrawing = (svg: string, pdf: string, tag: string) => {
  const cmp = (x: string[], y: string[], what: string, anchored?: boolean) => {
    if (x.length !== y.length) { bad(`${tag} ${what}: ${x.length} on screen vs ${y.length} in the PDF`); return; }
    for (let i = 0; i < x.length; i++) {
      const av = x[i].split(" "), bv = y[i].split(" ");
      if (av.length !== bv.length) { bad(`${tag} ${what} #${i}: ${av.length} vs ${bv.length} tokens`); return; }
      for (let j = anchored ? 1 : 0; j < av.length; j++) {
        const an = Number(av[j]), bn = Number(bv[j]);
        const ok = Number.isNaN(an) || Number.isNaN(bn) ? av[j] === bv[j] : Math.abs(an - bn) < 0.011;
        if (!ok) { bad(`${tag} ${what} #${i}: ${av[j]} vs ${bv[j]}`); return; }
      }
    }
  };
  cmp(svgPaths(svg), pdfPaths(pdf), "paths", false);
  cmp(svgText(svg), pdfText(pdf), "text", true);
};

let ns = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400]) {
    const p = { ...DEFAULTS, ...preset, height };
    // Once per design, not once per allowance pair: the mold's template stopped depending on the
    // washi allowances the day the panel became its own document.
    ns++;
    sameDrawing(paperPagesSVG(p, 5, en, A4).svg,
      Buffer.from(paperPDF(p, 5, A4, en)).toString("latin1"), `same ${preset.key} h${height} cardboard`);
    for (const [side, end] of [[3, 3], [0, 0], [10, 5]]) {
      ns++;
      const tag = `same ${preset.key} h${height} s${side} e${end}`;
      // Built with the SAME translator the PDF gets, so this is about the drawing, not the labels.
      const w = washiPagesSVG(p, { side, end }, en, A4).svg;
      sameDrawing(w, Buffer.from(washiPDF(p, { side, end }, A4, en)).toString("latin1"), `${tag} washi`);
      // The language must not move a single coordinate — only the words. Checked in both encodings:
      // the PDF is where the words became artwork, so it is the one that could start pushing lines
      // around (a glyph left in the path stream would read as a cut line half a millimetre wide).
      if (svgPaths(washiPagesSVG(p, { side, end }, undefined, A4).svg).join("|") !== svgPaths(w).join("|"))
        bad(`${tag} washi: the drawing changes with the UI language`);
      const jaPDF = Buffer.from(washiPDF(p, { side, end }, A4)).toString("latin1");
      if (pdfPaths(jaPDF).join("|") !== pdfPaths(Buffer.from(washiPDF(p, { side, end }, A4, en)).toString("latin1")).join("|"))
        bad(`${tag} washi: the PDF drawing changes with the UI language`);
    }
  }

// ---- 7. The silhouette extremes (the corners of LIMITS) ----
// Cardboard is the route with no size limit — a part too tall for A4 just continues on the next
// sheet — so it is the route that actually meets a 2m body, and the one where the sweeps above say
// nothing: they run 140..400mm at the presets' own radii. This walks the corners of the box the
// editor now allows and asserts what would make the template wrong rather than merely large: the
// rib is still drawn at full scale (its length is the geometry's, not a fitted one), the washi
// panel is still cut to the meridian ARC length — which only runs further from the straight height
// as the body gets steeper — and every part still lands on a page with no NaN in it.
let nx = 0;
const [xhLo, xhHi] = LIMITS.height, [xrLo, xrHi] = LIMITS.r;
for (const preset of PRESETS)
  for (const height of [xhLo, xhHi])
    for (const rMax of [xrLo * 2, xrHi]) {
      nx++;
      const widest = Math.max(...preset.pts.map((q) => q.r));
      const pts = preset.pts.map((q) => ({ ...q, r: Math.min(xrHi, Math.max(xrLo, (q.r * rMax) / widest)) }));
      const p = { ...DEFAULTS, ...preset, pts, height };
      const tag = `extreme ${preset.key} h${height} rMax${rMax}`;
      const { parts, pk } = paperParts(p, 5);
      const rib = parts.find((q) => q.name.startsWith("羽根板"));
      eq(bb(rib).h, p.height + 2 * p.tabLen, `${tag} rib total length`);
      // The panel that ships beside these pages, cut from the same pk they are (see section 1).
      const wparts = washiParts(pk).parts;
      if (!wparts.length) bad(`${tag}: washi panel missing`);
      for (const q of parts)
        for (const [x, y] of [q.outline, ...(q.holes || [])].flat())
          if (!Number.isFinite(x) || !Number.isFinite(y)) bad(`${tag}: ${q.name} has NaN`);
      // Integrated independently of washiGore, as in section 4: the panel must cover the arc.
      const fr = fukuroRange(p), y0 = fr.lo * height, y1 = fr.hi * height;
      let arc = 0, prev = outerR(p, y0 / height);
      for (let i = 1; i <= 4000; i++) {
        const y = y0 + ((y1 - y0) * i) / 4000, R = outerR(p, y / height);
        arc += Math.hypot((y1 - y0) / 4000, R - prev); prev = R;
      }
      const panel = bb(wparts.find((q) => q.name.startsWith("和紙"))).h;
      if (panel + 0.01 < arc) bad(`${tag}: washi panel ${panel} shorter than the meridian arc ${arc}`);
      // The pages still render, and every part still lands on one.
      const { svg, pages } = paperPagesSVG(p, 5, undefined, A4);
      if (/NaN|Infinity|undefined/.test(svg)) bad(`${tag}: NaN/undefined in the pages`);
      if ((svg.match(/class="pg"/g) || []).length !== pages) bad(`${tag}: page count disagrees with the markup`);
      for (const q of parts) if (!svg.includes(q.name)) bad(`${tag}: ${q.name} not on paper`);
      if (pk.boards < 4) bad(`${tag}: rib count clamped to ${pk.boards}`);
    }

// Japanese labels cannot be drawn with base-14 fonts, so they must be dropped, never emitted raw.
if (winAnsi("和紙 ×8") !== " ×8") bad(`winAnsi should drop Japanese: ${JSON.stringify(winAnsi("和紙 ×8"))}`);
if (winAnsi("50mm ← 定規で確認") !== "50mm <- ") bad(`winAnsi arrow fold: ${JSON.stringify(winAnsi("50mm ← 定規で確認"))}`);

console.log(`\n=== ${n} combos (incl. ${PRESETS.length * 16} full-scale combos) + ${nw} washi + ${np} pdf + ${ns} preview=PDF + ${nx} extreme combos, ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
