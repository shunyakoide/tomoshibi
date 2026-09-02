/**
 * ============================================================================
 * SECTION VIEW — the frame invariants, and a drawing hash
 * ============================================================================
 * The section editor is the one surface with no gate behind it. `check:manifold` and `check:hash`
 * cover what is PRINTED; nothing covered what is DRAWN, so the narrow-screen acceptance criteria in
 * docs/design-notes.md ("◇ hit target: 30px", "the wide layout is untouched") lived only as prose,
 * and the drag-scale bug they were written for — one ◇ dragged 40px taking the design from ⌀192 to
 * ⌀392 — was found by measuring a phone by hand.
 *
 * This is possible only because `ui/section/frame.ts` and `ui/section/paths.ts` are pure: no React,
 * no DOM, so the frame can be computed for a matrix of designs and panes and checked as arithmetic.
 *
 * Two jobs:
 *   1. **Invariants** — each one traceable to a line of the design notes, listed beside it.
 *   2. **A drawing hash** — the same before/after workflow as `check:hash`, for a refactor that
 *      should not move a single path point:
 *          node scripts/section.test.mts --hashes > /tmp/base.txt
 *          …make the change…
 *          node scripts/section.test.mts --hashes > /tmp/after.txt
 *          diff /tmp/base.txt /tmp/after.txt      # zero diff = the drawing is untouched
 *      The summary line always carries a single combined digest, so an unintended move shows up as
 *      one changed number without having to keep the full table around.
 *
 * It FAILS rather than skips when it has nothing to work with — an empty matrix, a design that
 * produces no path — for the reason `check:style` and `lint` do: a gate that quietly does nothing is
 * worse than one that is missing.
 *
 * Run:  node scripts/section.test.mts
 * ============================================================================
 */
import crypto from "node:crypto";
import { CX, Y0, sectionFrame } from "../src/ui/section/frame.ts";
import { sampleSection, sectionPaths } from "../src/ui/section/paths.ts";
import { PRESETS, DEFAULTS, LIMITS } from "../src/config.ts";
import type { Design } from "../src/types.ts";

let fail = 0, checks = 0;
const bad = (msg: string) => { console.log("FAIL:", msg); fail++; };
const t = (ok: boolean, msg: string) => { checks++; if (!ok) bad(msg); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// The wide layout's numbers, which are floors in compact and exact values here. design-notes:382 —
// "the wide layout is untouched, deliberately", down to the viewBox and every target.
const WIDE = {
  viewBox: "0 0 860 780", hitPt: 13, hitAdd: 11,
  rPt: 5.5, rRing: 13, rH: 6.5, rAdd: 11, rTan: 5.5, markStroke: "2.00",
};
// What a mark and a target must measure once the browser has scaled the drawing (CSS px across).
// design-notes:374 and :386 — the touch surface and the thing you aim at were allowed to disagree
// once, and the legend redraws these same marks at legend size.
const WANT = { hitPt: 30, hitAdd: 20, glyphPt: 16 };

// Panes the app actually puts this in: before the first measurement (the k=1 fallback), the phone at
// rest and at both sheet stops, and a desktop. design-notes:376, :396-:398.
const PANES: [string, { w: number; h: number }][] = [
  ["unmeasured", { w: 0, h: 0 }],
  ["phone-peek", { w: 375, h: 717 }],
  ["phone-half", { w: 375, h: 212 }],
  ["phone-full", { w: 375, h: 140 }],
  ["desktop", { w: 1000, h: 900 }],
];

const designs: [string, Design][] = [];
for (const preset of PRESETS)
  for (const height of [LIMITS.height[0], 140, 300, 700, LIMITS.height[1]])
    for (const boards of [4, 8, 16])
      designs.push([`${preset.key} h${height} b${boards}`, { ...DEFAULTS, ...preset, height, boards }]);

// A gate with an empty matrix reports success as loudly as a clean run.
if (!designs.length || !PANES.length) bad("empty matrix — this check would pass without checking anything");

const lines: string[] = [];
const digest = crypto.createHash("sha1");

for (const [tag, p] of designs) {
  const sample = sampleSection(p);
  // The sample is what the frame is fitted to, so it has to be a real drawing before anything else
  // means anything. design-notes:385 — "a mark that moves takes the frame with it".
  t(sample.op.length > 1, `${tag}: silhouette sampled to ${sample.op.length} points`);
  t(Number.isFinite(sample.maxR) && sample.maxR > 0, `${tag}: maxR is ${sample.maxR}`);
  t(near(sample.maxR, sampleSection(p).maxR), `${tag}: sampleSection is not deterministic`);

  for (const [pTag, pane] of PANES) {
    for (const compact of [false, true]) {
      const id = `${tag} ${pTag} ${compact ? "compact" : "wide"}`;
      const f = sectionFrame(p, pane, compact, sample);

      // Nothing may be NaN: a single one silently blanks an SVG attribute rather than throwing.
      for (const [k, v] of Object.entries(f)) {
        if (typeof v === "number" && !Number.isFinite(v)) bad(`${id}: frame.${k} is ${v}`);
      }
      if (/NaN|Infinity|undefined/.test(f.viewBox)) bad(`${id}: viewBox is "${f.viewBox}"`);
      checks++;

      t(f.s > 0 && f.s <= 2.0, `${id}: s = ${f.s}, which is outside (0, 2.0]`);
      t(f.k > 0, `${id}: k = ${f.k}`);

      // What the four transforms MEAN, stated independently of each other. Everything positional
      // below is expressed through them, so a containment check can only ever compare a transform
      // with itself — these are what catch a transform that is wrong in the same way twice.
      for (const r of [0, 50, 200]) {
        t(near(f.X(r) + f.Xm(r), 2 * CX), `${id}: Xm(${r}) does not mirror X(${r}) about the centre axis`);
        t(near(f.X(r) - CX, r * f.s), `${id}: X(${r}) is not ${r}mm at scale ${f.s}`);
      }
      // t and mm both grow UP the drawing, and y grows down the screen.
      t(near(f.Y(0), Y0) && f.Y(1) < f.Y(0), `${id}: Y runs the wrong way (Y(0)=${f.Y(0)}, Y(1)=${f.Y(1)})`);
      t(near(f.Ymm(0), Y0) && f.Ymm(p.height) < f.Ymm(0), `${id}: Ymm runs the wrong way`);
      t(near(f.Y(1), f.topY), `${id}: Y(1) is ${f.Y(1)}, topY is ${f.topY}`);

      if (!compact) {
        // The wide path draws exactly what it always drew, whatever the pane.
        t(f.viewBox === WIDE.viewBox, `${id}: viewBox "${f.viewBox}" — the wide frame is fixed`);
        for (const key of ["hitPt", "hitAdd", "rPt", "rRing", "rH", "rAdd", "rTan"] as const) {
          t(f[key] === WIDE[key], `${id}: ${key} = ${f[key]}, wide is ${WIDE[key]}`);
        }
        t(f.markStroke === WIDE.markStroke, `${id}: markStroke = ${f.markStroke}`);
        t(f.showLabels && f.showLegend, `${id}: the wide layout keeps its labels and its legend`);
        continue;
      }

      // Compact: targets and marks are sized from the MEASURED scale, so they land on the asked-for
      // CSS px however far down the drawing has been scaled.
      t(f.hitPt * 2 * f.k >= WANT.hitPt - 1e-9, `${id}: ◇ target is ${(f.hitPt * 2 * f.k).toFixed(1)}px, wanted ${WANT.hitPt}`);
      t(f.hitAdd * 2 * f.k >= WANT.hitAdd - 1e-9, `${id}: + ghost target is ${(f.hitAdd * 2 * f.k).toFixed(1)}px, wanted ${WANT.hitAdd}`);
      t(f.rPt * 2 * f.k >= WANT.glyphPt - 1e-9, `${id}: ◇ mark is ${(f.rPt * 2 * f.k).toFixed(1)}px, smaller than its own legend entry`);
      // The mark never outgrows its target, or the thing you aim at sticks out of the thing you hit.
      t(f.rPt <= f.hitPt, `${id}: rPt ${f.rPt} exceeds the hit radius ${f.hitPt}`);
      t(!f.showLabels, `${id}: compact drops the NAMES (the numbers stay)`);

      // The fitted frame contains what is drawn: the silhouette at its widest, the body, and the
      // rib's tabs, which stick out past the body at both ends.
      const [vx, vy, vw, vh] = f.viewBox.split(" ").map(Number);
      const l = Math.min(f.Xm(sample.maxR), f.X(sample.maxR)), r = Math.max(f.X(sample.maxR), f.X(sample.komaR));
      const top = Math.min(f.topY, f.Ymm(p.height + p.tabLen)), bot = Math.max(f.Ymm(0), f.Ymm(-p.tabLen));
      t(l >= vx - 1e-6 && r <= vx + vw + 1e-6, `${id}: the drawing spans x ${l.toFixed(1)}..${r.toFixed(1)}, the viewBox ${vx}..${(vx + vw).toFixed(1)}`);
      t(top >= vy - 1e-6 && bot <= vy + vh + 1e-6, `${id}: the drawing spans y ${top.toFixed(1)}..${bot.toFixed(1)}, the viewBox ${vy}..${(vy + vh).toFixed(1)}`);
    }
  }

  // The frame goes into the hash as well as the paths. The invariants above say whether it is
  // CORRECT; only a hash says whether it CHANGED, and a frame term can move without breaking any
  // invariant — the 4mm the silhouette is padded by does exactly that, and so does anything that
  // shifts the fitted viewBox. Both layouts, since the wide one is meant to be pinned.
  for (const [pTag, pane] of PANES) {
    for (const compact of [false, true]) {
      const f = sectionFrame(p, pane, compact, sample);
      const shape = [f.s, f.topY, f.k, f.viewBox, f.hitPt, f.hitAdd, f.rPt, f.rRing, f.rH, f.rAdd,
        f.rTan, f.markStroke, f.showLabels, f.showLegend, f.X(100), f.Xm(100), f.Y(0.5), f.Ymm(100)];
      const h = crypto.createHash("sha1").update(JSON.stringify(shape)).digest("hex").slice(0, 12);
      lines.push(`${tag} frame ${pTag} ${compact ? "compact" : "wide   "} ${h}`);
      digest.update(h);
    }
  }

  // ---- the drawing itself, hashed ----
  // One frame per design is enough for a regression hash: the paths are the frame's transforms
  // applied to the sample, so a moved point shows up whichever frame it is drawn in.
  const f = sectionFrame(p, PANES[1][1], false, sample);
  const { d, higo, ribD, bands } = sectionPaths(p, f, sample, "#D95B18");
  t(d.startsWith("M ") && d.endsWith(" Z"), `${tag}: the silhouette is not a closed path`);
  t(ribD.length > 0, `${tag}: the rib drew nothing`);
  t(higo.split("M").length - 1 === sample.gs.length, `${tag}: ${higo.split("M").length - 1} bamboo ribs drawn, ${sample.gs.length} grooves`);
  t(bands.length > 0 && bands.every((b) => b.t1 > b.t0), `${tag}: a region band is empty or inverted`);
  for (const [name, str] of [["d", d], ["higo", higo], ["ribD", ribD], ["bands", JSON.stringify(bands)]] as const) {
    if (/NaN|Infinity|undefined/.test(str)) bad(`${tag}: ${name} contains NaN/Infinity/undefined`);
    checks++;
    const h = crypto.createHash("sha1").update(str).digest("hex").slice(0, 12);
    lines.push(`${tag} ${name.padEnd(5)} ${h}`);
    digest.update(h);
  }
}

if (process.argv.includes("--hashes")) console.log(lines.join("\n"));
console.log(`\n=== ${designs.length} designs × ${PANES.length} panes × 2 layouts, ${checks} checks, drawing ${digest.digest("hex").slice(0, 12)}, ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
