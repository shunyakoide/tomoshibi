/**
 * ============================================================================
 * GLYPH COVERAGE — every character a template prints has an outline
 * ============================================================================
 * `src/pdf.js` sets Latin in Helvetica and draws everything else from the outlines in
 * `src/pdf-glyphs.js`, which `tools/pdffont/build.py` extracts for exactly the characters the
 * templates use. A character with no outline is folded to ASCII or **dropped** — silently, and only
 * on paper, which is the one place nothing else here is looking. Adding a Japanese word to a
 * template and forgetting to rerun the tool is therefore a one-line change that prints a blank.
 *
 * So this reruns the tool's own collection (same sources, same rule) and fails when the committed
 * table no longer covers it. It reads the JS with a regex rather than importing it, for the same
 * reason check:i18n does: what matters is the string as WRITTEN, before any translator sees it.
 *
 *   node scripts/glyphs.test.mjs
 * ============================================================================
 */
import { readFileSync } from "node:fs";
import { GLYPHS } from "../src/pdf-glyphs.js";

// Kept in step with SOURCES / EXTRA in tools/pdffont/build.py — a module that starts printing has
// to be added to both, and this script is what says so out loud.
const SOURCES = ["src/papercraft.js"];
const EXTRA = "←→↑▼—";

let fail = 0;
const bad = (m) => { fail++; console.log("FAIL: " + m); };

/** Characters outside WinAnsi in the string literals of `file`, comments stripped. */
function charsIn(file) {
  const src = readFileSync(new URL("../" + file, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const out = new Set();
  for (const m of src.matchAll(/"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`\\]*)`/g))
    for (const ch of m[1] ?? m[2] ?? m[3] ?? "") if (ch.charCodeAt(0) > 0xff) out.add(ch);
  return out;
}

const needed = new Set(EXTRA);
for (const f of SOURCES) for (const ch of charsIn(f)) needed.add(ch);
if (needed.size < 10) bad(`only ${needed.size} characters collected — the sources or the rule are wrong`);

for (const ch of needed) {
  const g = GLYPHS[ch];
  if (!g) { bad(`"${ch}" (U+${ch.codePointAt(0).toString(16).toUpperCase()}) has no outline — rerun tools/pdffont/build.py`); continue; }
  // An outline that draws nothing, or advances nowhere, prints as a gap just like a missing one.
  if (!/^-?\d+ -?\d+ m\b/.test(g.d)) bad(`"${ch}": the outline does not start with a moveto`);
  if (!/\bh$/.test(g.d)) bad(`"${ch}": the outline's last contour is not closed (the fill would bleed)`);
  if (!(g.w > 0)) bad(`"${ch}": advance width ${g.w}`);
  // The ink has to sit on the em it is advanced by. A glyph extracted at the wrong scale still
  // draws, still fills, still passes every count — it simply prints the size of a thumbnail or of a
  // fist, and nothing downstream is looking at that.
  const xs = [], ys = [];
  for (const m of g.d.matchAll(/(-?\d+) (-?\d+)(?= [mlc]|\b)/g)) { xs.push(+m[1]); ys.push(+m[2]); }
  const box = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (box[0] < -200 || box[1] > 1200 || box[2] < -400 || box[3] > 1200)
    bad(`"${ch}": ink box [${box}] is not inside its 1000-unit em`);
  if (box[1] - box[0] < 50 || box[3] - box[2] < 50) bad(`"${ch}": ink box [${box}] is degenerate`);
}
// The other direction: an outline nothing prints is 200 bytes of a font we are shipping for no
// reason, and usually the fingerprint of a label that was reworded (the same drift check:i18n hunts).
for (const ch of Object.keys(GLYPHS)) if (!needed.has(ch)) bad(`"${ch}" has an outline but nothing prints it`);

console.log(`\n=== ${needed.size} characters, ${Object.keys(GLYPHS).length} outlines, ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
