/**
 * ============================================================================
 * i18n coverage verification
 * ============================================================================
 * The dictionary in i18n.js is keyed by **the Japanese UI string itself**, which keeps the source
 * readable and makes an untranslated string fall back to Japanese rather than crash. The cost is
 * that the failure is silent: reword one Japanese label and its English translation is not "out of
 * date", it is simply **gone** — the app quietly shows Japanese to an English visitor, and nothing
 * in the build, the manifold sweep or the paper test notices. That has already happened once (the
 * Washi section shipped Japanese-only in English mode).
 *
 * This script pins the three ways that dictionary drifts:
 *
 *   1. **Missing** — a Japanese string that reaches the UI has no EN entry. Collected from every
 *      `t("…")` call (including calls nested inside template literals) plus every plain Japanese
 *      string literal in src/ — the latter also catches a label that was never wired through `t`
 *      at all, which is the same bug one step earlier.
 *   2. **Orphaned** — an EN entry whose Japanese key appears nowhere in src/. Harmless on its own,
 *      but it is the fingerprint of a reworded string: the old key is stranded here while the new
 *      wording silently falls back to Japanese. Fixing an orphan is usually fixing a missing one.
 *   3. **Placeholder mismatch** — `{name}` slots that exist on one side only. `t()` substitutes by
 *      name, so a slot dropped from the translation does not error: the number just never appears
 *      ("up to about % slack"), and a slot invented in the translation prints the literal braces.
 *
 * Comments are in English by convention (CLAUDE.md), so Japanese in a comment is not a UI string —
 * the scanner strips comments properly rather than regex-matching over them.
 *
 * Run:  npm run check:i18n
 * Run this after touching any UI wording or i18n.js.
 * ============================================================================
 */
import fs from "node:fs";
import path from "node:path";
import { makeT } from "../src/i18n.js";

const en = makeT("en");
let fail = 0, pass = 0;
const bad = (msg) => { console.log("FAIL:", msg); fail++; };
const ok = (msg) => { console.log("✓", msg); pass++; };

const JP = /[぀-ヿ㐀-鿿]/;   // kana + CJK ideographs

// Strings that are deliberately the same in both languages, so they carry no EN entry.
// Keep this list short and justified — it is the one place a real miss could hide.
const ALLOW = new Set([
  "Language / 言語",   // the language toggle's tooltip: shown in both languages at once, by design
  "日本語",             // the toggle's own label — it names the language it switches TO
]);

// ---- Source scanning ----------------------------------------------------------------------
// A character scanner rather than a regex, because both directions of the naive approach are
// wrong: stripping `//` comments with a regex eats the `//` inside a URL, and matching literals
// without tracking comments picks up the Japanese in a comment. It also has to see string
// literals NESTED IN template literals — `${t("羽根板")} ×${n}` is one template token, and the
// t() call inside it is exactly what we are looking for.
function scan(src) {
  const literals = [];      // plain '…' / "…" literals (not template literals)
  let code = "";            // source with comments blanked out, literals kept
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") {                       // line comment
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {                       // block comment
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c, start = i;
      let body = "";
      i++;
      while (i < n) {
        if (src[i] === "\\") { body += src[i] + src[i + 1]; i += 2; continue; }
        if (src[i] === quote) break;
        // Inside a template literal, `${ … }` is code again: recurse so nested literals are seen.
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          let depth = 1, j = i + 2;
          while (j < n && depth > 0) {
            if (src[j] === "{") depth++;
            else if (src[j] === "}") depth--;
            j++;
          }
          const inner = scan(src.slice(i + 2, j - 1));
          literals.push(...inner.literals);
          code += inner.code;
          i = j;
          continue;
        }
        body += src[i];
        i++;
      }
      i++;                                              // closing quote
      if (quote !== "`") literals.push(unescape_(body));
      code += src.slice(start, i);
      continue;
    }
    code += c;
    i++;
  }
  return { literals, code };
}
// Undo the escapes that matter for matching a dictionary key written the same way.
const unescape_ = (s) => s.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.jsx?$/.test(e.name)) out.push(f);
  }
  return out;
}

const SRC = walk("src").filter((f) => !f.endsWith("i18n.js"));
const rawAll = SRC.map((f) => fs.readFileSync(f, "utf8"));

// Candidate UI strings, mapped to the files they came from (for a useful failure message).
const where = new Map();
const note = (s, f) => { if (!where.has(s)) where.set(s, new Set()); where.get(s).add(f); };

for (let k = 0; k < SRC.length; k++) {
  const { literals, code } = scan(rawAll[k]);
  // (a) every t("…") call — the string is definitely a UI string, Japanese or not. A few keys are
  //     pure interpolation ("{name} {n}mm") and carry no kana at all; they still need an entry, and
  //     they still go stale, so the language filter must not run here.
  const call = /\bt\s*\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
  let m;
  while ((m = call.exec(code))) note(unescape_(m[1].slice(1, -1)), SRC[k]);
  // (b) every plain Japanese literal — catches a label handed to a component that translates it
  //     (label="板厚"), and a label that was never wired through t at all.
  for (const s of literals) if (JP.test(s)) note(s, SRC[k]);
}

// ---- 1. Missing translations --------------------------------------------------------------
const missing = [];
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
// The EN dict is not exported (it is an implementation detail of makeT), so read its keys off the
// source. Only the keys are needed, and they are plain literals at one indent level.
const i18nSrc = fs.readFileSync("src/i18n.js", "utf8");
const dictBody = i18nSrc.slice(i18nSrc.indexOf("const EN = {"), i18nSrc.indexOf("\n};"));
const EN_KEYS = [...dictBody.matchAll(/^\s{2}"((?:[^"\\]|\\.)*)":/gm)].map((m) => unescape_(m[1]));

const orphans = EN_KEYS.filter((k) => !where.has(k));
if (orphans.length) {
  for (const k of orphans) {
    bad(`orphaned EN entry (key appears nowhere in src/): ${JSON.stringify(k.length > 70 ? k.slice(0, 70) + "…" : k)}`);
  }
} else {
  ok(`no orphaned dictionary entries (${EN_KEYS.length} entries)`);
}

// ---- 3. Placeholder parity -----------------------------------------------------------------
const slots = (s) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
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
