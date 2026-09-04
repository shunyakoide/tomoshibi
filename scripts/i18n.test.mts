/**
 * i18n coverage verification
 * The dictionary in i18n.ts is keyed by **the Japanese UI string itself**: readable source and a
 * fallback to Japanese, at the cost of a silent failure — reword one label and its translation is
 * not out of date, it is **gone**, with no other gate noticing. It has happened. Pinned here:
 *
 *   1. **Missing** — a Japanese string reaching the UI with no EN entry. Collected from every
 *      `t("…")` call (nested in template literals included) plus every plain Japanese literal in
 *      src/, the latter also catching a label never wired through `t` at all.
 *   2. **Orphaned** — an EN entry whose key appears nowhere in src/: the fingerprint of a reworded
 *      string, the old key stranded while the new wording falls back.
 *   3. **Placeholder mismatch** — `{name}` slots on one side only. `t()` substitutes by name, so a
 *      dropped slot prints nothing and an invented one prints the literal braces.
 *
 * Comments are English by convention, so Japanese in one is not a UI string — the scanner strips
 * comments rather than regex-matching over them.
 *
 * Run:  npm run check:i18n — after touching any UI wording or i18n.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { makeT } from "../src/i18n.ts";
import { scan, unescape_ } from "./lib/scan.mts";

const en = makeT("en");
let fail = 0, pass = 0;
const bad = (msg: string) => { console.log("FAIL:", msg); fail++; };
const ok = (msg: string) => { console.log("✓", msg); pass++; };

const JP = /[぀-ヿ㐀-鿿]/;   // kana + CJK ideographs

// Strings that are deliberately the same in both languages, so they carry no EN entry.
// Keep this list short and justified — it is the one place a real miss could hide.
const ALLOW = new Set([
  "Language / 言語",   // the language toggle's tooltip: shown in both languages at once, by design
  "日本語",             // the toggle's own label — it names the language it switches TO
  "灯 Tomoshibi",      // the logo's aria-label: a proper noun, so it is the same in both languages
]);

// ---- Source scanning ----------------------------------------------------------------------
// `scan` is shared with check:glyphs (scripts/lib/scan.mts); the reasoning lives there.

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.[jt]sx?$/.test(e.name)) out.push(f);   // .ts/.tsx today; .js/.jsx still matched so a stray file is never skipped silently
  }
  return out;
}

// pdf-glyphs.ts is keyed by the character it draws, so every Japanese glyph in it reads as an
// untranslated UI string. It is generated data (tools/pdffont), not copy; check:glyphs holds it to
// its own source.
const SRC = walk("src").filter((f) => !f.endsWith("i18n.ts") && !f.endsWith("pdf-glyphs.ts"));
const rawAll = SRC.map((f) => fs.readFileSync(f, "utf8"));

// Candidate UI strings, mapped to the files they came from (for a useful failure message).
const where = new Map<string, Set<string>>();
const note = (s: string, f: string) => { if (!where.has(s)) where.set(s, new Set()); where.get(s)!.add(f); };

for (let k = 0; k < SRC.length; k++) {
  const { literals, code } = scan(rawAll[k]);
  // (a) every t("…") call — a UI string by construction, Japanese or not. A few keys are pure
  //     interpolation with no kana at all, and they still go stale, so no language filter here.
  const call = /\bt\s*\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
  let m;
  while ((m = call.exec(code))) note(unescape_(m[1].slice(1, -1)), SRC[k]);
  // (b) every plain Japanese literal — catches a label handed to a component that translates it
  //     (label="板厚"), and a label that was never wired through t at all.
  for (const s of literals) if (JP.test(s)) note(s, SRC[k]);
}

// ---- 1. Missing translations --------------------------------------------------------------
const missing: [string, string[]][] = [];
for (const [s, files] of where) {
  if (ALLOW.has(s) || !JP.test(s)) continue;   // an all-ASCII key reads the same in both languages
  if (en(s) === s) missing.push([s, [...files]]);
}
if (missing.length) {
  for (const [s, files] of missing) {
    bad(`no English for ${JSON.stringify(s.length > 70 ? s.slice(0, 70) + "…" : s)}  [${files.join(", ")}]`);
  }
} else {
  ok(`every Japanese UI string has an English entry (${where.size} strings)`);
}

// ---- 2. Orphaned dictionary entries --------------------------------------------------------
// The EN dict is not exported, so read its keys off the source; they are plain literals at one
// indent level. The declaration is matched by a PATTERN and a miss is fatal rather than empty:
// anchored on its exact text, retyping the annotation would empty EN_KEYS and both gates below would
// pass over nothing — a check that silently stops checking is worse than no check.
const i18nSrc = fs.readFileSync("src/i18n.ts", "utf8");
const dictAt = i18nSrc.search(/^const EN\b[^=]*=\s*\{$/m);
if (dictAt < 0) { bad("cannot find the EN dictionary declaration in src/i18n.ts"); process.exit(1); }
const dictBody = i18nSrc.slice(dictAt, i18nSrc.indexOf("\n};", dictAt));
const EN_KEYS = [...dictBody.matchAll(/^\s{2}"((?:[^"\\]|\\.)*)":/gm)].map((m) => unescape_(m[1]));
if (!EN_KEYS.length) { bad("read 0 keys out of the EN dictionary — the scraper has drifted"); process.exit(1); }

// A duplicate key is invisible in JS — the object literal keeps the last one — so an entry that
// repeats a word already in the dictionary silently RETRANSLATES the old one elsewhere in the app.
// A materials card's "\u548c\u7d19" did exactly that to the inspector's own section heading.
const dupes = EN_KEYS.filter((k, i) => EN_KEYS.indexOf(k) !== i);
if (dupes.length) {
  for (const k of [...new Set(dupes)]) bad(`duplicate EN entry (the later one silently wins): ${JSON.stringify(k)}`);
} else {
  ok(`no duplicate dictionary keys (${EN_KEYS.length} entries)`);
}

const orphans = EN_KEYS.filter((k) => !where.has(k));
if (orphans.length) {
  for (const k of orphans) {
    bad(`orphaned EN entry (key appears nowhere in src/): ${JSON.stringify(k.length > 70 ? k.slice(0, 70) + "…" : k)}`);
  }
} else {
  ok(`no orphaned dictionary entries (${EN_KEYS.length} entries)`);
}

// ---- 3. Placeholder parity -----------------------------------------------------------------
const slots = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
let slotBad = 0;
for (const k of EN_KEYS) {
  const v = en(k);
  if (v === k) continue;
  const a = slots(k), b = slots(v);
  const dropped = [...a].filter((x) => !b.has(x));
  const invented = [...b].filter((x) => !a.has(x));
  if (dropped.length) { bad(`translation drops {${dropped.join("},{")}}: ${JSON.stringify(k.slice(0, 60))}`); slotBad++; }
  if (invented.length) { bad(`translation invents {${invented.join("},{")}}: ${JSON.stringify(k.slice(0, 60))}`); slotBad++; }
}
if (!slotBad) ok(`every translation keeps its {placeholders} (${EN_KEYS.length} entries)`);

console.log(`\n=== ${pass} pass / ${fail} fail ===`);
process.exit(fail ? 1 : 0);
