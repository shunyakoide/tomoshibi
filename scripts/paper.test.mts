/**
 * Papercraft (cardboard) verification
 * STL correctness is "watertight"; papercraft is paper, so the criteria differ. Three things must
 * not break:
 *
 *   1. **Full scale (1:1)** — paper dimensions = real mm, cross-checked against geometry.ts's own
 *      invariants (rib length, koma outer diameter, groove width, groove wall).
 *   2. **No missing parts** — all N ribs + 2 koma appear, which only this can catch after row
 *      packing and page spanning. Also that **no seam marks are emitted when no part spans pages**
 *      (sheets butt at the trim box; there is no glue tab anywhere).
 *   3. **No NaN/undefined** — a NaN in an SVG path makes that part vanish silently, so you find out
 *      after printing.
 *
 * The **washi template** is checked by the same three plus its own decisive invariant: the sheet's
 * length is the **meridian arc length**, not the body height, which section 4 asserts against an
 * independent integration of `outerR`. It is a document of its own on both routes, so section 4 also
 * pins that its pages are NOT among the cardboard template's.
 */
import { paperPagesSVG, washiPagesSVG, paperPDF, paperParts, paperFit, paperP, washiParts, washiPDF, A4, MARGIN, ADVICE_PAD, layout, corner, adviceBox, adviceLines, strip, noteOverflow, STYLE } from "../src/papercraft.ts";
import { strWidth, winAnsi } from "../src/io/pdf.ts";
import { makeT } from "../src/i18n.ts";
import { komaR, tabDented, innerRi, maxBoards, notchR, notchWidth, ribInnerX, ribMouthBand, ribOutline2D, ribPullFit, outerR, fukuroRange, grooveList, openingR, ringGeometry, ringLegs, wireRing2D, WASHI_SIDE, WASHI_END } from "../src/geometry.ts";
import { PRESETS, DEFAULTS, LIMITS } from "../src/config.ts";
import type { Design } from "../src/types.ts";

let fail = 0;
const bad = (msg: string) => { console.log("FAIL:", msg); fail++; };
const en = makeT("en"); // the PDF is drawn with the English labels (base-14 fonts have no CJK glyphs)
const ja = makeT("ja"); // = the identity: the dictionary's keys ARE the Japanese, as `tid` is
const eq = (a: number, b: number, msg: string, tol = 0.01) => { if (Math.abs(a - b) > tol) bad(`${msg}: ${a} != ${b}`); };
// Every point a part puts on paper. `bend` is in it because the opening hoops are a bend line and
// NOTHING else — an outline-only reader gets Math.max of an empty list, which is -Infinity, and the
// NaN travels all the way to a seam assertion that then passes for the wrong reason.
const pts2 = (q: any) => [q.outline, ...(q.holes || []), ...(q.bend || [])].flat();
// The narrowest radius the body ever reaches — what caps the cardboard joint (`jointCap`). Derived
// here rather than imported (`bodyMinR` is private to profile.ts), because a gate that re-derives it
// independently is the point: the two agreeing is the assertion.
//
// **The control points are in it, and that is not a detail.** A `sharp` point is a local minimum by
// construction and a grid steps straight over it: the first version of this helper sampled `outerR`
// 400 times and nothing else, which is a milder form of the very blind spot it was written to catch
// (profile.ts was reading a hidden waist up to 7.47mm high). 2000 samples, plus every control point.
const bodyMin = (d: Design) => {
  let m = Math.min(...d.pts.map((q) => q.r));
  for (let i = 0; i <= 2000; i++) m = Math.min(m, outerR(d, i / 2000));
  return m;
};
// Bounding box of the point list
const bb = (q: any) => {
  const a = pts2(q);
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
      // **The koma's notch is drawn NARROWER than the board it accepts**, which is the one tolerance
      // here that runs the opposite way to the printed route's. It is not an argument, it is the
      // first cardboard build: on 3mm board the maker cut about 1mm and said 2mm would be about
      // right, board crushing as the tab goes in and a knife widening what it cuts, so a slot drawn
      // at the board's own thickness comes out wider than the board. Both bounds carry a measured
      // number — over `matT` is the wobble that was predicted of the line, and at or under `matT/2`
      // is the 1mm-in-3mm that was cut and found too tight.
      const slot = notchWidth(pk);
      if (slot >= matT - 0.01) bad(`${tag} notch ${slot.toFixed(2)}mm is not narrower than the ${matT}mm board`);
      if (slot <= matT / 2 + 0.01) bad(`${tag} notch ${slot.toFixed(2)}mm is at or under half the ${matT}mm board`);
      // `paperP` is the only place allowed to size it, so a design off that route keeps the printed
      // width — a `joint` leaking onto the STL route would silently narrow every printed koma.
      eq(notchWidth(p), p.boardT + Math.max(0, p.fit ?? 0), `${tag} notch width off the paper route`);
      // Cardboard skips the tab-tip dent (strength over the koma stop): a plain straight tab in a
      // full-depth notch.
      if (tabDented(pk)) bad(`${tag} papercraft should have no tab dent (noTabDent)`);
      eq(notchR(pk), innerRi(pk) - 0.5, `${tag} koma notch should be full-depth for the plain tab`);
      // Cardboard's inner edge is STRAIGHT (`noCrescent`): the crescent is a knife cut hundreds of
      // millimetres long, and drawn from this route's much smaller core radius it takes a bite the
      // maker rejected on the sheet.
      {
        const inner = ribInnerX(pk), Ri = innerRi(pk);
        for (let y = 0; y <= pk.height; y += pk.height / 40)
          eq(inner(y), Ri, `${tag} rib inner edge should be straight at y=${y.toFixed(0)}`);
      }
      // The wall left between the koma's notches; under half the material thickness it tears when
      // hand-cut. It is a viewport alert rather than a note on the printed page, so what has to hold
      // is that the number the alert quotes is real: paperFit against the formula, and against the
      // copy paperParts hands the template.
      const wall = (2 * Math.PI * notchR(pk)) / pk.boards - slot;
      // The joint is sized for BOARD (see `Design.joint`): the wall between two notches is the
      // material's own thickness, and the tab still sits `grip` deep in the notch. The two stopped
      // trading when the koma's rim was let outside the opening, so BOTH have to hold — a wall that
      // came back at the old 1.6mm would mean the rim got pinned to the opening again. The one
      // exception is the cap: past it there is no plate left at the opening to hang a tab on, and
      // then the wall gives rather than the rib.
      // The narrower of the two MOUTHS — the ends — is what `komaR` and `ribMouthBand` are measured
      // against: those two are about what leaves by a hole, and the middle of a waisted body is not a
      // hole anything leaves by.
      const mouth = Math.min(outerR(pk, 0), outerR(pk, 1));
      // The CAP is measured against something else: the narrowest radius the body reaches anywhere
      // (`jointCap` = `bodyMinR - 2`), because the cardboard rib's inner edge is one straight radius
      // past the waist as well and a hub outside the waist crosses it. On every shipped preset the
      // narrowest point IS a mouth, so the two are the same number here — section 10 is where they
      // are not.
      const capped = innerRi(pk) >= Math.max(6, bodyMin(pk) - 2) - 0.01;
      if (!capped && wall < matT - 0.01) bad(`${tag} koma wall ${wall.toFixed(2)} thinner than the ${matT}mm board`);
      // The board a rib still has where it passes the narrower mouth. It is REPORTED, never clamped —
      // the count is the maker's — so what is pinned here is that the number the alert quotes is the
      // real one. Getting that identity wrong is how the alert would start describing a different
      // mold than the sheet.
      eq(ribMouthBand(pk), mouth - innerRi(pk), `${tag} ribMouthBand`);
      // The rim never passes the opening — the maker kept the mouth over the tab's width — so the tab
      // is `min(grip, band)` and its edge runs straight on into the neck with no step to snap off.
      if (komaR(pk) - mouth > 0.01) bad(`${tag} koma stands ${(komaR(pk) - mouth).toFixed(2)}mm proud of the mouth`);
      const tabW = komaR(pk) - innerRi(pk);
      if (tabW < Math.min(20, ribMouthBand(pk)) - 0.01) bad(`${tag} tab ${tabW.toFixed(2)}mm under min(20, band)`);
      const fit = paperFit(p, matT);
      eq(fit.wall, wall, `${tag} paperFit wall`);
      if (fit.clamped !== clamped || fit.nMax !== nMax) bad(`${tag} paperFit disagrees with paperParts`);
      // Chords + edge notch cutouts put the koma's circumscribed diameter slightly UNDER komaR
      // (thicker material = wider notches = more under). Exceeding it is the error.
      const kw = bb(find("コマ")).w, kd = 2 * komaR(pk);
      if (!(kw <= kd + 0.01 && kw >= kd * 0.9)) bad(`${tag} koma outer diameter ${kw} vs ${kd}`);
      // The washi PDF that ships with THIS route is cut from paperP, not the design as edited: the
      // panel is one rib-to-rib bay wide, so a clamped rib count means wider panels, and the
      // unclamped ones give a skin that does not meet itself on the mold this template makes.
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
          // page. The washi panel is its own PDF beside this one in the ZIP, so a sheet of it
          // appearing here would mean it is printed twice.
          // + 2 opening hoops, which are on this document on every design (section 8).
          if (parts.length !== nRibParts + 3 && parts.length !== nRibParts + 4) bad(`${tag}: part count ${parts.length}`);
          if (parts.some((q) => q.name.startsWith("和紙"))) bad(`${tag}: washi panel laid out among the cardboard pages`);
          if (clamped && pk.boards !== nMax) bad(`${tag}: clamp mismatch`);
          for (const q of parts) {
            const pts = pts2(q);
            if (!pts.length) bad(`${tag}: ${q.name} empty`);
            for (const [x, y] of pts) if (!Number.isFinite(x) || !Number.isFinite(y)) bad(`${tag}: ${q.name} has NaN`);
            for (const m of q.marks || []) for (const v of m) if (!Number.isFinite(v)) bad(`${tag}: ${q.name} has NaN in marks`);
          }
          // The template ships as a PDF, but its pages come from the same pageOps; these assertions
          // read paperPagesSVG's markup instead. (The PDF's own structural checks are section 5.)
          const { svg, pages } = paperPagesSVG(p, matT, undefined, A4);
          if (/NaN|Infinity|undefined/.test(svg)) bad(`${tag}: NaN/undefined in the pages`);
          if (pages < 1 || pages > 60) bad(`${tag}: page count ${pages}`);
          if ((svg.match(/class="pg"/g) || []).length !== pages) bad(`${tag}: page count disagrees with the markup`);
          // The check bar catches printer scaling, so a template without one is unusable. Once per
          // DOCUMENT, not per page (printers scale the whole job alike), and drawn whole: TWO ARMS,
          // across and down because a printer can scale x and y by different amounts, each a line
          // plus its two end ticks = six "scale" paths, with BOTH units on BOTH arms so either rule
          // checks either axis.
          const sheets = svg.split('<svg class="pg"').slice(1);
          if (sheets.length !== pages) bad(`${tag}: ${sheets.length} sheets vs ${pages} pages`);
          // WHICH sheet carries it is the layout's call (scaleSpot puts it where the parts leave
          // room), so pinning it to sheet 1 would pin the packing; only "exactly one sheet, every
          // mark on it" holds — none means a template trusted at no size, two means two answers.
          for (const u of ["5cm", "3in", "1in", "3cm"]) {
            const on = sheets.filter((x) => x.includes(u)).length;
            if (on !== 1) bad(`${tag}: ${u} mark on ${on} sheets, want exactly 1`);
          }
          if ((svg.match(/class="scale"/g) || []).length !== 6) bad(`${tag}: check square drawn incompletely`);
          for (const q of parts) if (!svg.includes(q.name)) bad(`${tag}: ${q.name} not on paper`);
          // Seams appear only when a part is too tall for one sheet. Derived from the module's own
          // constants, never copied: a stale "297 - 2*8 - 14" survived the 14mm band's deletion here
          // and passed only because no swept part landed in the gap between its CH and the real one.
          const CH = 297 - 2 * MARGIN;      // a full sheet
          // Sheet 1, which gives up its top strip to the document's corner. `strip()` and not TOPBAR:
          // the corner is the check square PLUS this document's advice, so the strip is 4mm taller
          // than the square alone needs and `tallest` can land in exactly that difference.
          const CH0 = CH - strip(adviceLines(en));
          const tallest = Math.max(...parts.map((q) => {
            const a = pts2(q);
            const ys = a.map((v) => v[1]), xs = a.map((v) => v[0]);
            // Too wide for the paper → rotated 90°, so the width becomes the height
            const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
            return w > 210 - 2 * MARGIN ? w : h;
          }));
          // Judge by what is drawn on paper: a seam carries code 1A on both of its sheets.
          const glued = svg.includes(">1A<");
          // Between CH0 and CH it depends which sheet the part lands on, so only the certain ends
          // are asserted: fits anywhere → never a seam; fits nowhere → always one.
          if (tallest <= CH0 && glued) bad(`${tag}: seam emitted despite no spanning part`);
          if (tallest > CH && !glued) bad(`${tag}: seam missing despite a spanning part`);
          // Both halves of every seam must exist, or there is nothing to line up against: the sheet
          // above draws the top halves, the sheet below the bottom ones, codes 1A/1B, 2A/2B …
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
          // A horizontal frame line is MARGIN or the trim edge; a third value marks something that
          // isn't there. This caught a bottom frame drawn at the end of the CONTENT band on pages
          // whose next page starts a new row — a line across the middle of the paper.
          const trimBot = A4.h - MARGIN;
          for (const y of svg.matchAll(/M0 ([\d.]+)L210 /g))
            if (![MARGIN, trimBot].some((v) => Math.abs(Number(y[1]) - v) < 1e-6))
              bad(`${tag}: frame line at y=${y[1]}, not a trim edge (${MARGIN}/${trimBot})`);
          // The trim box is a fact about the PAPER, so it is on every sheet and identical on each —
          // a seam sheet's box used to stop at the seam, 10mm short of the others.
          const framed = sheets.filter((x) => x.includes('class="frame"')).length;
          if (framed !== pages) bad(`${tag}: trim box on ${framed} of ${pages} sheets`);
          if (diamonds !== codes + seamed * 2) bad(`${tag}: ${diamonds} diamonds for ${codes} codes on ${seamed} seamed sheets`);
        }

// ---- 4. Washi template (the paper skin's flat pattern) ----
// Same three criteria, plus the invariant that decides whether the cut sheet is usable: the sheet is
// as long as the **meridian arc**, not as tall as the body — cutting to the straight height is the
// mistake this template exists to prevent — asserted against an independent integration of outerR.
let nw = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const boards of [4, 6, 8, 12, 16])
      for (const spiral of [false, true])
        for (const [side, end] of [[WASHI_SIDE, WASHI_END], [3, 3], [0, 0], [10, 5]]) {
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
          const nTicks = grooveList(p, 0).length + grooveList(p, 1).length;
          if ((q.marks || []).length !== nTicks) bad(`${tag}: ${q.marks.length} ticks vs ${nTicks} grooves`);
          for (const v of [...q.outline.flat(), ...q.guides.flat(2), ...(q.marks || []).flat()])
            if (!Number.isFinite(v)) bad(`${tag}: NaN in the washi pattern`);
          // The panel's own sheets — the SVG encoding of the pages the ZIP's PDF is written from
          // (nothing in the app draws them; see washiPagesSVG). Section 5 pins their page count to
          // that PDF's; here, only that they are drawn at all.
          const ws = washiPagesSVG(p, { side, end }, undefined, A4).svg;
          if (/NaN|Infinity|undefined/.test(ws)) bad(`${tag}: NaN/undefined in the washi sheets`);
          // The PANEL, by its name — 「和紙 ×N」 — and not by the word: both documents print the word
          // in their boxed corner now, where 「和紙: 切る前に…」 is a caution about a part that is
          // somewhere else. What must stay on one document is the part, and its name is what says so.
          const panel = /和紙 ×\d/;
          if (!panel.test(ws)) bad(`${tag}: the panel is not on its own sheets`);
          // Guides must be drawn as guides, never as cut lines (cutting them ruins the panel).
          if (!/class="guide"/.test(ws)) bad(`${tag}: guides not drawn on the washi sheets`);
          // …and nowhere else: a panel on both documents would be one printed twice, at two
          // different rib counts.
          if (panel.test(paperPagesSVG(p, 3, undefined, A4).svg))
            bad(`${tag}: the washi panel is still on the cardboard pages`);
        }

// ---- 5. The template PDFs (both shipped deliverables) ----
// The washi template bundled in the STL kit's ZIP, and the cardboard template, which IS the cardboard
// route's entire output. The PDF is hand-rolled (src/io/pdf.ts), so this checks the two ways it can be
// silently wrong: **a broken file** (a bad xref offset makes viewers refuse it or open it blank) and
// **a wrong scale**, pinned by the page CTM (mm→pt = 2.835) and by the check square's arms measuring
// 76.2mm (3in) across and 30mm (3cm) down in user space.
//
// An outlined character is a scale-and-flip matrix, a fill colour and a stored path, whose operators
// are `m`/`l`/`c`/`h` like any other path — so every reader of the content stream must strip glyph
// blocks first. A glyph is a word on the page, not a line to cut along.
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
  // (position follows the layout). Both axes are required — a printer can scale x and y differently,
  // which only a vertical arm sees.
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
      // Washi. Its page count is checked twice over: first against a derivation that owes the layout
      // code nothing — one part of this height on A4, butt-split across pages when it does not fit
      // on one — where TWO answers are admissible, the check square either finding room beside the
      // panel or sheet 1 giving up TOPBAR, and pinning which would pin the packing. Then the PDF is
      // pinned to the preview's exact answer, so the sheets shown and the file in the ZIP can never
      // be a different document (same pairing as the cardboard one below).
      const { g } = washiParts(p, { side: 3, end: 3 });
      const H = g.sTot + 2 * g.end, CH = 297 - 2 * MARGIN;
      const CH0 = CH - strip(adviceLines(en));
      const wPages = washiPagesSVG(p, { side: 3, end: 3 }, en, A4).pages;
      if (![Math.max(1, Math.ceil(H / CH)), H <= CH0 ? 1 : 1 + Math.ceil((H - CH0) / CH)].includes(wPages))
        bad(`${tag} washi: preview lays out ${wPages} pages, neither admissible answer`);
      pdfStructure(Buffer.from(washiPDF(p, { side: 3, end: 3 }, A4, en)).toString("latin1"), `${tag} washi`, wPages);

      // Cardboard. Its page count is checked against what the in-app preview lays out, so the file
      // the user prints and the pages they were shown can never be a different document.
      const cs = Buffer.from(paperPDF(p, 5, A4, en)).toString("latin1");
      pdfStructure(cs, `${tag} cardboard`, paperPagesSVG(p, 5, en, A4).pages);
      // The split, in the shipped bytes: the mold's PDF carries no washi panel. By NAME — 「和紙 ×N」,
      // which is `Washi ×N` once winAnsi has had it — and not by the word, the corner's caution about
      // the washi being printed on this document on purpose (see section 4).
      if (/Washi \\?[( ]?\xd7\d/.test(cs) || cs.includes(`${en("和紙")} \xd7`))
        bad(`${tag} cardboard: the washi panel is in the mold's PDF`);
      // Every part must still be LABELLED: winAnsi drops what it cannot draw rather than mangling
      // it, so a Japanese translator would leave the names silently blank with every check above
      // still passing. This is the one that notices.
      // Escaped the way `pdf.ts` writes a literal string, or the two hoops — the only names on this
      // sheet with brackets in them — are looked for in a form the file cannot legally contain.
      const asWritten = (v: string) => v.replace(/[\\()]/g, (c) => "\\" + c);
      for (const q of paperParts(p, 5, en).parts)
        if (!cs.includes(asWritten(q.name))) bad(`${tag} cardboard: "${q.name}" is not labelled in the PDF`);
      // The same sheet in Japanese — the app's default language, and the one the writer could not
      // print at all until it carried its own outlines. Nothing about the file's structure may change
      // (pdfStructure again, including the rule that no raw multi-byte reaches a Tj), and every
      // character WinAnsi cannot encode must be DRAWN — dropping them silently is the old failure,
      // and it leaves every other assertion here satisfied, so the count is the whole point.
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
// behind.
//
// Compared as coordinates, not bytes, because the two encodings legitimately differ in three ways
// and ONLY these three:
//   · SVG rounds to 2dp and the PDF to 3dp, so a coordinate ending .xx5 double-rounds 0.01mm apart:
//     the compare carries a tolerance, and pairs the two lists by CONTENT rather than by position.
//     Sorting cannot pair them on its own — the key is the coordinates, and the two encodings do not
//     always round the same coordinate to the same key. One tick mark landing on 100.445 sorted
//     under 100.4 in the PDF and 100.5 on screen, and every path after it in the two lists was
//     compared against a different one. The sorted order is still where the pairing starts, because
//     it is right for all but a handful of paths and n² is not free.
//   · a part name is centred by `text-anchor: middle` in SVG and by a pre-shifted x in the PDF, so
//     its x is not comparable and text sorts on y + content;
//   · each format escapes what its own syntax cannot carry raw — SVG writes `<` as `&lt;`, and a PDF
//     literal string backslashes `(`, `)` and `\`, which the opening hoops' names are the first
//     labels here to contain. Both are undone before comparing; neither moves anything on paper.
// A further difference appearing means a renderer has drifted, not that the tolerance needs widening.
const r2 = (v: string | number) => (+v).toFixed(2);
const pkey = (v: string) => String(v.split(" ").length).padStart(6) + "|"
  + v.split(" ").map((x: string) => (Math.round(+x * 10) / 10).toFixed(1).padStart(9)).join(",");
const tkey = (v: string) => v.split(" ").slice(1).join(" ");
// Sorted on a key computed once per entry, not once per comparison: `pkey` splits and reformats
// the whole path, and paid on every comparison it was half of this gate's time.
const sortBy = (key: (v: string) => string) => (vs: string[]) =>
  vs.map((v) => [key(v), v] as const).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map((x) => x[1]);
const byPath = sortBy(pkey), byText = sortBy(tkey);
const svgPaths = (svg: string) => byPath([...svg.matchAll(/ d="([^"]+)"/g)]
  .map((m) => m[1].replace(/[MLZ]/g, " ").trim().split(/\s+/).map(r2).join(" ")));
const svgText = (svg: string) => byText([...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>([^<]*)</g)]
  .map((m) => `${r2(m[1])} ${r2(m[2])} ${m[3].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")}`));
const pdfBody = (s2: string) => [...s2.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => m[1]).join("\n");
const pdfPaths = (s2: string) => byPath(pdfBody(s2)
  .replace(/BT[\s\S]*?ET/g, "")            // a text block's `Tm` matrix ends in "m" — not a moveto
  .replace(GLYPH_RE, "")                   // an outlined character is text, not a line on the sheet
  .split(/\bS\b/)
  .map((seg) => [...seg.matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]\n?/g)].flatMap((m) => [r2(m[1]), r2(m[2])]).join(" "))
  .filter(Boolean));
const pdfText = (s2: string) => byText([...pdfBody(s2).matchAll(/1 0 0 -1 ([\d.-]+) ([\d.-]+) Tm \((.*?)\) Tj/g)]
  // The PDF's own escaping, undone on the same footing as the SVG's entities above: a literal string
  // has to backslash `(`, `)` and `\` or the file will not parse, and the opening hoops are the first
  // labels on this sheet to carry brackets — 口輪(上) / "Ring (top)".
  .map((m) => `${r2(m[1])} ${r2(m[2])} ${m[3].replace(/\\([\\()])/g, "$1")}`));

const sameDrawing = (svg: string, pdf: string, tag: string) => {
  const cmp = (x: string[], y: string[], what: string, anchored?: boolean) => {
    if (x.length !== y.length) { bad(`${tag} ${what}: ${x.length} on screen vs ${y.length} in the PDF`); return; }
    const xs = x.map((v) => v.split(" ")), ys = y.map((v) => v.split(" "));
    const same = (a: string[], b: string[]) => {
      if (a.length !== b.length) return false;
      for (let j = anchored ? 1 : 0; j < a.length; j++) {
        const an = Number(a[j]), bn = Number(b[j]);
        if (Number.isNaN(an) || Number.isNaN(bn) ? a[j] !== b[j] : Math.abs(an - bn) >= 0.011) return false;
      }
      return true;
    };
    let i = 0;
    while (i < xs.length && same(xs[i], ys[i])) i++;
    if (i === xs.length) return;
    // Out of step from here on, which is what a sort boundary looks like and also what one missing
    // line looks like. Told apart by pairing every drawing with an unclaimed one — a bijection, so
    // "the PDF drew this one twice" is still a failure. Only ever reached when something is wrong.
    const used = new Uint8Array(ys.length);
    for (const a of xs) {
      let hit = -1;
      for (let k = 0; k < ys.length && hit < 0; k++) if (!used[k] && same(a, ys[k])) hit = k;
      if (hit < 0) { bad(`${tag} ${what}: "${a.join(" ")}" is on screen and in no PDF ${what}`); return; }
      used[hit] = 1;
    }
  };
  cmp(svgPaths(svg), pdfPaths(pdf), "paths", false);
  cmp(svgText(svg), pdfText(pdf), "text", true);
};

let ns = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400]) {
    const p = { ...DEFAULTS, ...preset, height };
    // Once per design, not per allowance pair: the mold's template stopped depending on the washi
    // allowances when the panel became its own document.
    ns++;
    sameDrawing(paperPagesSVG(p, 5, en, A4).svg,
      Buffer.from(paperPDF(p, 5, A4, en)).toString("latin1"), `same ${preset.key} h${height} cardboard`);
    for (const [side, end] of [[3, 3], [0, 0], [10, 5]]) {
      ns++;
      const tag = `same ${preset.key} h${height} s${side} e${end}`;
      // Built with the SAME translator the PDF gets, so this is about the drawing, not the labels.
      const w = washiPagesSVG(p, { side, end }, en, A4).svg;
      sameDrawing(w, Buffer.from(washiPDF(p, { side, end }, A4, en)).toString("latin1"), `${tag} washi`);
      // The language must not move a single coordinate — only the words. Checked in both encodings,
      // the PDF being where the words became artwork and so the one that could push lines around (a
      // glyph left in the path stream reads as a cut line half a millimetre wide).
      if (svgPaths(washiPagesSVG(p, { side, end }, undefined, A4).svg).join("|") !== svgPaths(w).join("|"))
        bad(`${tag} washi: the drawing changes with the UI language`);
      const jaPDF = Buffer.from(washiPDF(p, { side, end }, A4)).toString("latin1");
      if (pdfPaths(jaPDF).join("|") !== pdfPaths(Buffer.from(washiPDF(p, { side, end }, A4, en)).toString("latin1")).join("|"))
        bad(`${tag} washi: the PDF drawing changes with the UI language`);
    }
  }

// ---- 7. The silhouette extremes (the corners of LIMITS) ----
// Cardboard has no HEIGHT limit — a part too tall for A4 continues on the next sheet — so it is the
// route that meets a 2m body, and the one the sweeps above say nothing about (they run 140..400mm at
// the presets' own radii). This walks the corners of the box the editor allows and asserts what would
// make the template wrong rather than merely large: the rib still drawn at full scale (its length is
// the geometry's, not a fitted one), the washi panel still cut to the meridian ARC length — which
// only runs further from the straight height as the body steepens — and no NaN on any page.
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
        for (const [x, y] of pts2(q))
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

// ---- 8. The opening hoops (the cardboard route's wire rings) ----
// The 3D route prints these two parts; cardboard draws them at 1:1 and the maker bends wire on the
// line. So the criteria are not paper's usual ones — there is nothing to cut and nothing to fold —
// but the two that decide whether the hoop fits the lantern it was drawn for:
//
//   · it lands in the very band the PRINTED ring fills, which is measured off `ringGeometry`'s own
//     vertices rather than copied from `ring.ts`'s constants — copy them and this passes forever;
//   · the eyes are there exactly when `ringLegs()` says so, at the angles the printed pads sit at,
//     and big enough for a leg of the same wire to pass. Two answers to "does this design have legs"
//     is the failure: the template offering eyes the guide's leg step has been filtered out of.
//
// Plus the one thing a bend line can be wrong about that a cut line cannot: a wire is ONE length, so
// a jump between consecutive points is a hoop that cannot be bent, not merely a coarse curve.
const ringBand = (p: Design, top: boolean) => {
  const pos = ringGeometry(p, top).getAttribute("position");
  let lo = Infinity, hi = 0;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    if (r < lo) lo = r;
    if (r > hi) hi = r;
  }
  return { lo, hi };
};
let nh = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 400])
    for (const legSockets of [false, true]) {
      nh++;
      const p: Design = { ...DEFAULTS, ...preset, height, legSockets };
      const tag = `hoop ${preset.key} h${height} legs${legSockets ? "on" : "off"}`;
      const hoops = paperParts(p, 5).parts.filter((q) => q.name.startsWith("口輪"));
      if (hoops.length !== 2) bad(`${tag}: ${hoops.length} hoops on the sheet, want 2`);
      for (const q of hoops) {
        // Nothing to cut. An outline or a hole here is a black line telling someone to cut the hoop
        // out of the paper, which is the one misreading this part has to be immune to.
        if (q.outline.length || (q.holes || []).length) bad(`${tag}: ${q.name} carries a cut line`);
        if ((q.bend || []).length !== 1) bad(`${tag}: ${q.name} has ${(q.bend || []).length} bend lines, want 1`);
        if (!q.note) bad(`${tag}: ${q.name} has no note — it is the one part on the sheet nobody cuts`);
      }
      // The printed ring's band. The TOP ring is always a plain annulus (no pads, no marker tab), so
      // its vertices give the two rim radii directly, and the wire's own diameter is the wall between.
      const band = ringBand(p, true);
      const wireD = band.hi - band.lo;
      const legs = ringLegs(p);
      let topR = 0;
      for (const top of [true, false]) {
        const side = top ? "top" : "bottom";
        const path = wireRing2D(p, top);
        const rad = path.map(([x, y]) => Math.hypot(x, y));
        const R = Math.max(...rad), rMin = Math.min(...rad);
        if (top) {
          topR = R;
          // Same inner face, same outer face: the wire fills the band the print would have.
          eq(R - wireD / 2, band.lo, `${tag} ${side} inner face`);
          eq(R + wireD / 2, band.hi, `${tag} ${side} outer face`);
        } else {
          // Both hoops follow their own opening, and nothing else may move between them.
          eq(R - topR, openingR(p, false) - openingR(p, true), `${tag} hoop spacing follows the openings`);
        }
        // Eyes: `ringLegs` is the only gate, and only the bottom hoop takes them.
        const eyed = rMin < R - 0.5;
        if (eyed !== (!top && !!legs)) bad(`${tag} ${side}: eyes=${eyed}, ringLegs=${!!legs}`);
        if (eyed) {
          const eyeR = (R - rMin) / 2;
          const bore = 2 * eyeR - wireD;
          if (bore < 3) bad(`${tag}: an eye's bore is ${bore.toFixed(2)}mm — a leg of the same wire will not pass`);
          for (let i = 0; i < legs!.n; i++) {
            const a = (i / legs!.n) * Math.PI * 2;   // the angles ringGeometry puts its pads at
            const wx = rMin * Math.cos(a), wy = rMin * Math.sin(a);
            const near = Math.min(...path.map(([x, y]) => Math.hypot(x - wx, y - wy)));
            // Half a sampling chord: an eye's deepest point is only a SAMPLE when its circle happens
            // to divide evenly, so a tighter bound fails on the sampler's parity rather than on the
            // geometry. Wide enough to survive that, narrow enough that an eye off its pad's angle
            // (6mm at 20°) or missing altogether still reads as missing.
            if (near > 1.1) bad(`${tag}: no eye at ${Math.round((a * 180) / Math.PI)}° (nearest point ${near.toFixed(2)}mm)`);
          }
        }
        let jump = 0;
        for (let i = 0; i < path.length; i++) {
          const [x0, y0] = path[i], [x1, y1] = path[(i + 1) % path.length];   // closed: the wrap counts
          jump = Math.max(jump, Math.hypot(x1 - x0, y1 - y0));
        }
        if (jump > 2.2) bad(`${tag} ${side}: a ${jump.toFixed(2)}mm jump in the bend line`);
      }
      // On the mold's sheets, and only there: the washi template is traced under paper and has
      // nothing to bend.
      const bends = (paperPagesSVG(p, 5).svg.match(/class="bend"/g) || []).length;
      if (bends !== 2) bad(`${tag}: ${bends} bend lines drawn on the cardboard pages, want 2`);
      if ((washiPagesSVG(p).svg.match(/class="bend"/g) || []).length) bad(`${tag}: a bend line on the washi template`);
    }


// ---- 9. The small print (`note` and `advice`) ----
// Two failures, both of which every gate above reports 0 FAIL for, because a template with grey text
// across a cut line is still watertight, still 1:1 and still has every part on it:
//
//   · a `note` too long for the part it is set inside. It is centred on a line 12% below the part's
//     middle, so the room it has is the CHORD there, not the bounding box the packer used — on the
//     starting egg the koma's box is 37.9mm wide and that line is 33.9mm. The English runs ~40%
//     longer than the Japanese it is keyed by and nobody translating sees the part, so BOTH are swept.
//   · a line of `advice` too long for the box it is set in. The box is a CONSTANT width (the check
//     square's, so the corner's footprint cannot move with the UI language — see `adviceBox`), and
//     there is no way to shrink a line that does not fit, only to notice.
//
// **Split in two on purpose, because the two questions cost different amounts.** The note fit is a
// question about the DESIGN — every part of every combination — and answering it needs the layout but
// not the markup. Whether the box is drawn, and each line printed once on one sheet, is a question
// about the CORNER: the same code for every design, varying only with how many sheets the document
// has. Rendering both documents' SVG for all 384 combinations to ask the second one took this gate
// from 4s to 34s, which is most of a `check:paper` spent re-answering a question about four strings.
let nn = 0;
// Is every line inside its box? Per LANGUAGE, not per design — the box is a constant and the lines
// do not depend on the drawing.
const ROOM = adviceBox(adviceLines(ja)).w - 2 * ADVICE_PAD;
for (const [lang, t] of [["ja", ja], ["en", en]] as const) {
  if (corner(adviceLines(t)).w > A4.w - 2 * MARGIN)
    bad(`advice ${lang}: the corner is ${corner(adviceLines(t)).w}mm wide, column is ${A4.w - 2 * MARGIN}`);
  for (const a of adviceLines(t)) {
    const w = strWidth(a, STYLE.note.size);   // the size the sheet sets it at, never a copy of it
    if (w > ROOM) bad(`advice ${lang}: "${a}" is ${w.toFixed(1)}mm, box holds ${ROOM}`);
  }
}
// The note fit, over the design space. No SVG: `layout` is what decides where a part's lettering
// lands, and `noteOverflow` reads the part.
for (const preset of PRESETS)
  for (const height of [60, 140, 205, 400])
    for (const boards of [4, 8, 12, 16])
      for (const matT of [1, 2, 5, 10])
        for (const [lang, t] of [["ja", ja], ["en", en]] as const) {
          nn++;
          const p = { ...DEFAULTS, ...preset, height, boards };
          const want = adviceLines(t);
          for (const [doc, parts] of [["cardboard", paperParts(p, matT, t).parts],
                                      ["washi", washiParts(paperP(p, matT), {}, t).parts]] as const) {
            const tag = `small print ${preset.key} h${height} b${boards} t${matT} ${lang} ${doc}`;
            const lay = layout(parts, A4, want);
            for (const q of lay.placed) {
              const over = noteOverflow(q);
              if (over > 0) bad(`${tag}: ${q.name}'s note hangs ${over.toFixed(1)}mm outside the part`);
            }
            if (lay.advice.length !== want.length) bad(`${tag}: ${lay.advice.length} advice lines, want ${want.length}`);
          }
        }
// What the SHEETS say, on designs chosen for their page counts rather than swept: a one-sheet
// document, a two-sheet one, and a body long enough to span (where a line could be drawn twice or
// land on the wrong sheet). Both documents, both languages.
let ns9 = 0;
for (const [label, p] of [["1 sheet", { ...DEFAULTS, height: 60 }],
                          ["2 sheets", { ...DEFAULTS }],
                          ["spanning", { ...DEFAULTS, height: 400 }]] as const)
  for (const [lang, t] of [["ja", ja], ["en", en]] as const) {
    const want = adviceLines(t);
    for (const [doc, svg] of [["cardboard", paperPagesSVG(p, 3, t, A4).svg],
                              ["washi", washiPagesSVG(paperP(p, 3), {}, t, A4).svg]] as const) {
      ns9++;
      const tag = `advice ${label} ${lang} ${doc}`;
      // BOTH documents print EVERY line — 「両方のシートに全部載せる」, the person cutting the mold
      // being the person who will cut the washi — each once, on one sheet.
      const sheets = svg.split('<svg class="pg"').slice(1);
      for (const a of want) {
        const on = sheets.filter((x) => x.includes(a)).length;
        if (on !== 1) bad(`${tag}: "${a}" on ${on} of ${sheets.length} sheets, want exactly 1`);
        const times = (svg.match(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
        if (times !== 1) bad(`${tag}: "${a}" printed ${times} times, want once`);
      }
      // The box is STROKED, and as a `guide` — grey and dashed, because a solid rectangle on this
      // sheet is the shape of a part and a blade follows solid lines. A CLOSED guide path, which on
      // these sheets can only be the box: the washi panel's own guides are open polylines.
      if (!/<path d="M[^"]*Z" class="guide"\/>/.test(svg))
        bad(`${tag}: no closed guide path — the advice box is not drawn`);
    }
  }

// ---- 10. A waisted body on cardboard (the hub has to stay inside the shape) ----
// Every sweep above runs the PRESETS, and on all three of them the narrowest radius the body reaches
// IS one of the mouths. So none of them asks the question this section is about: a body that pinches
// in the MIDDLE, narrower than either opening — an hourglass, which the editor allows and nothing
// floors.
//
// The cardboard rib's inner edge is ONE radius from tab to tab (`noCrescent`), so it runs past that
// waist. If the hub is outside it, that edge is outside the outer curve and **the cut line crosses
// itself**: the part is undrawable, and every gate here passed it — the sheet is still 1:1, still has
// every part, still has no NaN, and `ribPullFit` still reports ok, because pulling out is a question
// about the MOUTH. The printed route has been guarded all along, `nominalRi` keeping the core inside
// `bodyMinR - 3`; the `joint` branch of `innerRi` does not go through `nominalRi`, which is how the
// guard got lost on this route alone (325 of 1728 swept waisted designs crossed, the worst 32.9mm
// outside the waist).
//
// **Asked in three costs, as section 9 is**, and the middle one exists because the first version of
// this section was too narrow to fail: it swept mouths 30..120 and two waist POSITIONS, and reported
// `0 FAIL` while 300 of 15,744 legal waisted designs still drew a crossing rib. What the failure
// needs is a mouth/waist RATIO wide enough that the curve between two of `bodyMinR`'s samples dives
// under the cap, and a waist sitting off its grid — mouth 600 against a waist of 10, at t≈0.13.
//   · the band — arithmetic on `innerRi` and an independent minimum — over the whole space;
//   · the parts, drawn, on a dozen designs (`paperParts` builds every rib);
//   · one actual count of segment crossings, that being 637k pairs, on the tightest design found.
let n10 = 0, tightest: { tag: string; pk: Design; band: number } | null = null;
const waisted = (mouth: number, waist: number, ribs: number, tw: number, sharp: boolean): Design => ({
  ...DEFAULTS, height: 280, boards: ribs,
  pts: [{ t: 0.075, r: mouth }, { t: tw, r: waist, sharp }, { t: 0.925, r: mouth }],
});
// **Where the waist goes is the whole of whether this section bites.** `bodyMinR` scans 40 intervals
// between the two end points, so a waist sitting MIDWAY between two of its samples is the one it
// cannot see — and that, not the mouth or the board, is what decided failure: over a grid of round
// positions the tightest band came out +0.07mm and this section reported 0 FAIL while the design one
// step off that grid was 6mm outside its own outline. So the positions are chosen adversarially,
// against the scan's own arithmetic, with 0.5 kept as a position it does see.
const blind = (i: number) => 0.075 + 0.85 * (i + 0.5) / 40;
const WAIST_T = [blind(2), blind(4), blind(8), blind(16), blind(24), blind(32), blind(36), 0.5];
for (const mouth of [60, 120, 300, 600])
  for (const waist of [8, 14, 20, 40])
    for (const ribs of [4, 8, 16])
      for (const matT of [1, 3, 10])
        for (const tw of WAIST_T)
          // `sharp` is the sharpest corner the editor allows, and a corner IS a local minimum: the
          // scan has nothing sitting at it unless a sample lands there.
          for (const sharp of [false, true]) {
            if (waist >= mouth) continue;
            n10++;
            const pk = paperP(waisted(mouth, waist, ribs, tw, sharp), matT);
            const tag = `waist mouth${mouth} waist${waist} ${ribs}ribs t${matT} tw${tw.toFixed(3)}${sharp ? " sharp" : ""}`;
            // THE assertion: the hub inside the narrowest radius the body reaches, measured on
            // `outerR` and the control points rather than on anything profile.ts told us.
            const band = bodyMin(pk) - innerRi(pk);
            if (band <= 0)
              bad(`${tag}: the hub is ${(-band).toFixed(2)}mm OUTSIDE the body — the rib's inner edge crosses its outer edge`);
            if (!tightest || band < tightest.band) tightest = { tag, pk, band };
            // The rim still never passes the mouth, the waist having no say in that (section 1's
            // rule, restated where the two numbers differ).
            const mouthR = Math.min(outerR(pk, 0), outerR(pk, 1));
            if (komaR(pk) - mouthR > 0.01) bad(`${tag}: koma stands ${(komaR(pk) - mouthR).toFixed(2)}mm proud of the mouth`);
            // What gives on a waisted body is the rib COUNT: the hub cannot grow past the waist, so
            // the notches run out of circle and `maxBoards` trims the count, which the app reports.
            // Asserted as the EQUALITY — `pk.boards > ribs` cannot fail, `paperP` ending in a
            // `Math.min`, so it was an assertion that asserted nothing.
            if (pk.boards !== Math.min(ribs, maxBoards(pk)))
              bad(`${tag}: rib count ${pk.boards}, want min(${ribs}, ${maxBoards(pk)})`);
          }
// Drawn, on a dozen of them: every part on paper, no NaN. `paperParts` builds every rib, so this is
// the expensive question and it is asked of the corners of the space rather than all of it.
for (const mouth of [60, 600])
  for (const waist of [8, 20])
    for (const ribs of [4, 16])
      for (const [tw, sharp] of [[blind(4), true], [0.5, false]] as const) {
        const p = waisted(mouth, waist, ribs, tw, sharp);
        const { parts, pk } = paperParts(p, 10);
        const tag = `waist drawn mouth${mouth} waist${waist} ${ribs}ribs tw${tw}${sharp ? " sharp" : ""}`;
        if (!parts.some((q) => q.name.startsWith("羽根板")) || !parts.some((q) => q.name.startsWith("コマ")))
          bad(`${tag}: a part is missing from the sheet`);
        for (const q of parts)
          for (const [x, y] of pts2(q))
            if (!Number.isFinite(x) || !Number.isFinite(y)) bad(`${tag}: ${q.name} has NaN`);
        if (bodyMin(pk) - innerRi(pk) <= 0) bad(`${tag}: the hub is outside the body`);
      }
// Once, on the tightest of them: does the drawn outline actually cross itself anywhere? This is the
// failure in its own terms, and the band above is the cheap proxy the sweep can afford (637k segment
// pairs per design).
if (tightest) {
  const o = ribOutline2D(tightest.pk, 0, { smooth: true }) as [number, number][];
  const side = (a: number[], b: number[], c: number[]) =>
    Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const cross = (a: number[], b: number[], c: number[], d: number[]) =>
    side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
  let hits = 0;
  for (let i = 0; i < o.length; i++)
    for (let j = i + 2; j < o.length; j++) {
      if (i === 0 && j === o.length - 1) continue;
      if (cross(o[i], o[(i + 1) % o.length], o[j], o[(j + 1) % o.length])) hits++;
    }
  if (hits) bad(`${tightest.tag}: the rib outline crosses itself ${hits}×`);
  // And that `ribPullFit` is NOT what would have caught it — the note above says so, so it is pinned.
  if (!ribPullFit(tightest.pk).ok && tightest.band > 0)
    bad(`pull-out now reports the waist; the comment in section 10 needs rewriting`);
}

// ---- 11. The preview puts BOTH documents in one DOM ----
// The PDFs are two files and never meet. The preview renders both into one HTML page
// (`ui/PagePreview.tsx`), and an SVG id is scoped to the DOCUMENT, so the sheets' clipPath ids must
// not collide: with `clip0` on each, the washi sheet's `url(#clip0)` resolved to the CARDBOARD
// sheet's clip — first matching id in the DOM wins — and the washi part was clipped to the wrong
// band, silently, because a clip ends a cut line at the trim box and draws nothing to say so.
{
  const ids = (svg: string) => (svg.match(/ id="([^"]+)"/g) || []).map((m) => m.slice(5, -1));
  const p = { ...DEFAULTS, ...PRESETS[0] };
  const m = ids(paperPagesSVG(p, 5, undefined, A4).svg), w = ids(washiPagesSVG(paperP(p, 5), undefined, undefined, A4).svg);
  if (!m.length || !w.length) bad(`preview: no ids at all (${m.length}/${w.length}) — this section stopped asking anything`);
  const dup = m.filter((id) => w.includes(id));
  if (dup.length) bad(`preview: both documents emit id ${JSON.stringify(dup[0])} (${dup.length} shared)`);
  for (const [doc, list] of [["cardboard", m], ["washi", w]] as const)
    if (new Set(list).size !== list.length) bad(`preview: the ${doc} document repeats an id among its own sheets`);
}

// Japanese labels cannot be drawn with base-14 fonts, so they must be dropped, never emitted raw.
if (winAnsi("和紙 ×8") !== " ×8") bad(`winAnsi should drop Japanese: ${JSON.stringify(winAnsi("和紙 ×8"))}`);
if (winAnsi("50mm ← 定規で確認") !== "50mm <- ") bad(`winAnsi arrow fold: ${JSON.stringify(winAnsi("50mm ← 定規で確認"))}`);

console.log(`\n=== ${n} combos (incl. ${PRESETS.length * 16} full-scale combos) + ${nw} washi + ${np} pdf + ${ns} preview=PDF + ${nx} extreme + ${nh} hoop + ${nn} small-print + ${ns9} advice-sheet + ${n10} waisted combos, ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
