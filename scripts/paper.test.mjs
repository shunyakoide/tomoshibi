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
 * Run:  npm run check:paper
 * Run this after touching the 2D side of papercraft.js / geometry.js.
 * ============================================================================
 */
import { paperHTML, paperParts, A4 } from "../src/papercraft.js";
import { komaR, tabDented, innerRi, notchR } from "../src/geometry.js";
import { PRESETS, DEFAULTS } from "../src/config.js";

let fail = 0;
const bad = (msg) => { console.log("FAIL:", msg); fail++; };
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
      const { parts, pk } = paperParts(p, matT);
      const tag = `${preset.key} h${height} t${matT}`;
      const find = (pre) => parts.find((q) => q.name.startsWith(pre));
      eq(bb(find("羽根板")).h, p.height + 2 * p.tabLen, `${tag} rib total length`);
      // Koma notch width = material thickness exactly (fit=0). If this drifts, the tab won't fit / will wobble.
      eq(pk.boardT + Math.max(0, pk.fit ?? 0), matT, `${tag} notch width`);
      // Cardboard skips the tab-tip dent (strength over the koma stop): the papercraft rib is a plain
      // straight tab, and the koma notch is full-depth so that plain tab fits.
      if (tabDented(pk)) bad(`${tag} papercraft should have no tab dent (noTabDent)`);
      eq(notchR(pk), innerRi(pk) - 0.5, `${tag} koma notch should be full-depth for the plain tab`);
      // When the wall between koma grooves is thin (less than half the material thickness), by design notify on paper without changing the shape.
      const wall = (2 * Math.PI * notchR(pk)) / pk.boards - matT;
      if (wall < matT / 2 && !paperHTML(p, matT, A4).includes("しかありません")) bad(`${tag} no warning despite the thin wall`);
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
          // Koma is 2 sheets, or 1 ("×2") when 2 would spill onto an extra page.
          if (parts.length !== nRibParts + 1 && parts.length !== nRibParts + 2) bad(`${tag}: part count ${parts.length}`);
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

console.log(`\n=== ${n} combos (incl. ${PRESETS.length * 16} full-scale combos), ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
