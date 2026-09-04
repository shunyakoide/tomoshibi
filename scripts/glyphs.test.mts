/**
 * GLYPH COVERAGE — every character a template prints has an outline
 * A character with no outline is folded to ASCII or **dropped** — silently, and only on paper, so
 * adding a Japanese word to a template without rerunning `tools/pdffont/build.py` is a one-line
 * change that prints a blank. Reads the sources with a regex rather than importing them, as
 * check:i18n does: what matters is the string as WRITTEN.
 *
 *   node scripts/glyphs.test.mts
 */
import { readdirSync, readFileSync } from "node:fs";
import { GLYPHS } from "../src/io/pdf-glyphs.ts";
import { scan } from "./lib/scan.mts";

// Kept in step with SOURCES / EXTRA in tools/pdffont/build.py — a module that starts printing has
// to be added to both, and this script is what says so out loud.
//
// The whole paper pipeline is READ FROM THE DIRECTORY rather than listed file by file: the template
// is spread over `src/paper/`, and a hand-listed path stops covering a label the moment someone
// moves it to a neighbouring module — which prints a blank and fails nothing. `papercraft.ts` is the
// barrel and prints nothing itself, but it is scanned too, so a string added there is not invisible.
const SOURCES = ["src/papercraft.ts", ...readdirSync(new URL("../src/paper/", import.meta.url))
  .filter((f) => f.endsWith(".ts")).sort().map((f) => "src/paper/" + f)];
const EXTRA = "←→↑▼—";

let fail = 0;
const bad = (m: string) => { fail++; console.log("FAIL: " + m); };

/**
 * Characters outside WinAnsi in the string literals of `file`, comments stripped.
 *
 * The comments come off with the shared scanner rather than a regex. A `//` strip written as a
 * regex blanks the rest of any line holding a `//` inside a STRING — and `src/paper/svg.ts` holds
 * `xmlns="http://www.w3.org/2000/svg"` — so a label written after one would vanish from this
 * alphabet and print as a blank. That is the failure this gate exists to catch, and it was sitting
 * inside the gate. `scan().code` keeps every literal verbatim, so what is matched below is
 * unchanged; only the comment stripping got honest.
 */
function charsIn(file: string): Set<string> {
  const src = scan(readFileSync(new URL("../" + file, import.meta.url), "utf8")).code;
  const out = new Set<string>();
  for (const m of src.matchAll(/"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`\\]*)`/g))
    for (const ch of m[1] ?? m[2] ?? m[3] ?? "") if (ch.charCodeAt(0) > 0xff) out.add(ch);
  return out;
}

const needed = new Set(EXTRA);
for (const f of SOURCES) for (const ch of charsIn(f)) needed.add(ch);
if (needed.size < 10) bad(`only ${needed.size} characters collected — the sources or the rule are wrong`);

for (const ch of needed) {
  const g = GLYPHS[ch];
  if (!g) { bad(`"${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase()}) has no outline — rerun tools/pdffont/build.py`); continue; }
  // An outline that draws nothing, or advances nowhere, prints as a gap just like a missing one.
  if (!/^-?\d+ -?\d+ m\b/.test(g.d)) bad(`"${ch}": the outline does not start with a moveto`);
  if (!/\bh$/.test(g.d)) bad(`"${ch}": the outline's last contour is not closed (the fill would bleed)`);
  if (!(g.w > 0)) bad(`"${ch}": advance width ${g.w}`);
  // The ink has to sit on the em it is advanced by: a glyph extracted at the wrong scale still
  // draws, fills and passes every count, and simply prints thumbnail- or fist-sized.
  const xs: number[] = [], ys: number[] = [];
  for (const m of g.d.matchAll(/(-?\d+) (-?\d+)(?= [mlc]|\b)/g)) { xs.push(+m[1]); ys.push(+m[2]); }
  const box = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (box[0] < -200 || box[1] > 1200 || box[2] < -400 || box[3] > 1200)
    bad(`"${ch}": ink box [${box}] is not inside its 1000-unit em`);
  if (box[1] - box[0] < 50 || box[3] - box[2] < 50) bad(`"${ch}": ink box [${box}] is degenerate`);
}
// The other direction: an outline nothing prints is 200 shipped bytes for nothing, and usually the
// fingerprint of a reworded label (the same drift check:i18n hunts).
for (const ch of Object.keys(GLYPHS)) if (!needed.has(ch)) bad(`"${ch}" has an outline but nothing prints it`);

console.log(`\n=== ${needed.size} characters, ${Object.keys(GLYPHS).length} outlines, ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
