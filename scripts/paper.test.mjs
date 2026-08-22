/**
 * ============================================================================
 * Papercraft (cardboard) verification
 * ============================================================================
 * STL correctness is guaranteed by "watertight (manifold)", but papercraft is
 * paper, so the criteria differ. Three things that must not break in papercraft:
 *
 *   1. **Full-scale (1:1)** — paper dimensions = real mm. If this drifts, the
 *      papercraft is worthless. Cross-check against geometry.js invariants
 *      (rib total length / koma outer diameter / groove width / groove wall thickness).
 *   2. **No missing parts** — all N ribs + 2 komas appear on paper. A drop from
 *      page layout (row packing + page spanning) can only be caught here.
 *      Also checks "**do not emit glue tabs when no part spans pages**" (are we
 *      forcing unnecessary gluing? previously every page was uniformly overlapped).
 *   3. **No NaN/undefined** — a NaN in an SVG path makes that part vanish
 *      (the browser silently ignores it, so you only notice after printing = worst case).
 *
 * The **washi template** (the paper skin's flat pattern) is checked by the same three, with its own
 * decisive invariant: the sheet's length is the **meridian arc length**, not the body height. Cutting
 * the washi to the straight height is the mistake the template exists to prevent, so section 4
 * asserts it against an independent integration of outerR. Section 5 covers the **washi PDF**
 * (the file bundled in the kit ZIP): a hand-rolled PDF is silently wrong in two ways — a bad xref
 * offset (viewers refuse it or open it blank) and a wrong scale — so both are pinned there.
 *
 * Run:  npm run check:paper
 * Run this after touching the 2D side of papercraft.js / geometry.js.
 * ============================================================================
 */
import { paperHTML, paperParts, paperFit, washiParts, washiPDF, A4 } from "../src/papercraft.js";
import { winAnsi } from "../src/pdf.js";
import { makeT } from "../src/i18n.js";
import { komaR, tabDented, innerRi, notchR, outerR, fukuroRange, grooveList, grooveR } from "../src/geometry.js";
import { PRESETS, DEFAULTS } from "../src/config.js";

let fail = 0;
const bad = (msg) => { console.log("FAIL:", msg); fail++; };
const en = makeT("en"); // the PDF is drawn with the English labels (base-14 fonts have no CJK glyphs)
const eq = (a, b, msg, tol = 0.01) => { if (Math.abs(a - b) > tol) bad(`${msg}: ${a} != ${b}`); };
// Bounding box of the point list (outline + holes)
const bb = (q) => {
  const a = [q.outline, ...(q.holes || [])].flat();
  const xs = a.map((v) => v[0]), ys = a.map((v) => v[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

// ---- 1. Full-scale: do the paper dimensions match geometry.js values? ----
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const matT of [1, 2, 5, 10]) {
      const p = { ...DEFAULTS, ...preset, height };
      const { parts, pk, clamped, nMax } = paperParts(p, matT);
      const tag = `${preset.key} h${height} t${matT}`;
      const find = (pre) => parts.find((q) => q.name.startsWith(pre));
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
          // Koma is 2 sheets, or 1 ("×2") when 2 would spill onto an extra page, + the washi panel:
          // whoever builds the mold from cardboard needs the paper skin and never opens the STL ZIP.
          if (parts.length !== nRibParts + 2 && parts.length !== nRibParts + 3) bad(`${tag}: part count ${parts.length}`);
          if (!parts.some((q) => q.name.startsWith("和紙"))) bad(`${tag}: washi panel missing from the cardboard template`);
          if (clamped && pk.boards !== nMax) bad(`${tag}: clamp mismatch`);
          for (const q of parts) {
            const pts = [q.outline, ...(q.holes || [])].flat();
            if (!pts.length) bad(`${tag}: ${q.name} empty`);
            for (const [x, y] of pts) if (!Number.isFinite(x) || !Number.isFinite(y)) bad(`${tag}: ${q.name} has NaN`);
            for (const m of q.marks || []) for (const v of m) if (!Number.isFinite(v)) bad(`${tag}: ${q.name} has NaN in marks`);
          }
          const html = paperHTML(p, matT, A4);
          if (/NaN|Infinity|undefined/.test(html)) bad(`${tag}: NaN/undefined in HTML`);
          const pages = (html.match(/class="pg"/g) || []).length;
          if (pages < 1 || pages > 60) bad(`${tag}: page count ${pages}`);
          // Every page must show the full-scale check ruler (if even one is missing, a scaling accident goes unnoticed)
          if ((html.match(/50mm ←/g) || []).length !== pages) bad(`${tag}: scale missing`);
          for (const q of parts) if (!html.includes(q.name)) bad(`${tag}: ${q.name} not on paper`);
          // Glue tabs are emitted only when there's a "part that doesn't fit on one page (content height CH)".
          // A4: CH = 297 - 2*8 (margins) - 14 (bottom band) = 267mm.
          const CH = 297 - 2 * 8 - 14;
          const tallest = Math.max(...parts.map((q) => {
            const a = [q.outline, ...(q.holes || [])].flat();
            const ys = a.map((v) => v[1]), xs = a.map((v) => v[0]);
            // If it doesn't fit the paper width it's rotated 90°, in which case the width becomes the height
            const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
            return w > 210 - 2 * 8 ? w : h;
          }));
          // Judge by the note actually drawn on paper (the explanatory text also contains the word "のりしろ" / glue tab)
          const glued = html.includes("ここから下は次のページと重なります");
          if (tallest <= CH && glued) bad(`${tag}: glue tab emitted despite no spanning part`);
          if (tallest > CH && !glued) bad(`${tag}: glue tab missing despite a spanning part`);
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
          // The panel is laid out among the cardboard template's pages (the only HTML route to it).
          const html = paperHTML(p, 3, A4, undefined, { side, end });
          if (/NaN|Infinity|undefined/.test(html)) bad(`${tag}: NaN/undefined in HTML`);
          if (!html.includes("和紙")) bad(`${tag}: the washi panel is not on the cardboard pages`);
          // Guides must be drawn as guides, never as cut lines (cutting them ruins the panel).
          if (!/class="guide"/.test(html)) bad(`${tag}: guides not drawn`);
        }

// ---- 5. Washi PDF (the file bundled in the kit ZIP) ----
// The PDF is hand-rolled (src/pdf.js), so the checks are the two ways it can be silently wrong:
// **a broken file** (a bad xref offset makes viewers refuse it, or open it blank) and **a wrong
// scale** (the whole point of the template). Scale is pinned by the page CTM (mm→pt = 2.835) plus
// the 50mm ruler being drawn as literally 50mm in user space.
let np = 0;
for (const preset of PRESETS)
  for (const height of [140, 300, 400])
    for (const boards of [6, 8, 12]) {
      np++;
      const p = { ...DEFAULTS, ...preset, height, boards };
      const tag = `pdf ${preset.key} h${height} b${boards}`;
      const bytes = washiPDF(p, { side: 3, end: 3 }, A4, en);
      const s = Buffer.from(bytes).toString("latin1");
      if (!s.startsWith("%PDF-1.")) bad(`${tag}: no PDF header`);
      if (!s.trimEnd().endsWith("%%EOF")) bad(`${tag}: no EOF marker`);
      // Every xref offset must land exactly on its object header, or viewers reject the file.
      const xrefAt = Number((s.match(/startxref\s+(\d+)/) || [])[1]);
      const table = s.slice(xrefAt).match(/^xref\n0 (\d+)\n([\s\S]*?)\ntrailer/);
      if (!table) { bad(`${tag}: no xref table`); continue; }
      const rows = table[2].split("\n").slice(1); // skip the free entry
      rows.forEach((row, i) => {
        const off = Number(row.slice(0, 10));
        if (!s.startsWith(`${i + 1} 0 obj`, off)) bad(`${tag}: xref offset ${i + 1} → ${off} is not an object header`);
      });
      // Page count, derived independently of the layout code: one part of this height on A4, split
      // across pages that overlap by the glue tab only when it does not fit on one (CH = 267mm).
      const { g } = washiParts(p, { side: 3, end: 3 });
      const H = g.sTot + 2 * g.end, CH = 297 - 2 * 8 - 14;
      const pages = H <= CH ? 1 : Math.ceil(H / (CH - 10));
      if (!s.includes(`/Count ${pages}`)) bad(`${tag}: /Count != ${pages} pages`);
      if ((s.match(/\/MediaBox\[0 0 595\.276 841\.89\]/g) || []).length !== pages) bad(`${tag}: MediaBox is not A4 on every page`);
      // Full scale: the page CTM is mm→pt, and the ruler is 50mm long in that space.
      if ((s.match(/2\.835 0 0 -2\.835 0 841\.89 cm/g) || []).length !== pages) bad(`${tag}: page CTM is not mm→pt`);
      if ((s.match(/8 284 m 58 284 l S/g) || []).length !== pages) bad(`${tag}: the 50mm ruler is not 50mm`);
      // Text must be WinAnsi: a stray multi-byte character would print as mojibake.
      for (const m of s.matchAll(/\((.*?)\) Tj/g))
        for (const ch of m[1]) if (ch.charCodeAt(0) > 0xff) bad(`${tag}: non-WinAnsi text ${JSON.stringify(m[1])}`);
    }
// Japanese labels cannot be drawn with base-14 fonts, so they must be dropped, never emitted raw.
if (winAnsi("和紙 ×8") !== " ×8") bad(`winAnsi should drop Japanese: ${JSON.stringify(winAnsi("和紙 ×8"))}`);
if (winAnsi("50mm ← 定規で確認") !== "50mm <- ") bad(`winAnsi arrow fold: ${JSON.stringify(winAnsi("50mm ← 定規で確認"))}`);

console.log(`\n=== ${n} combos (incl. ${PRESETS.length * 16} full-scale combos) + ${nw} washi + ${np} pdf combos, ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
