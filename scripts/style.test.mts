/**
 * ============================================================================
 * TYPE SCALE — every font size in the app must be a member of it
 * ============================================================================
 * The scale is `FS` in src/ui/theme.ts (nine steps). This is a CHECK rather than a convention
 * because the old scale had sixteen steps, five of them half-pixel, and not one arrived by decision:
 * a scale with no gate is a scale that grows back.
 *
 * Two encodings have to agree and neither can see the other — JS (`fontSize: FS.base`, and SVG
 * `fontSize={…}`) and CSS (`font-size: 12px` in index.css, written as a LITERAL). This script is the
 * only link between them.
 *
 * What it fails on:
 *   1. a CSS `font-size` whose px value is not in FS
 *   2. a JS `fontSize` written as a raw number
 *   3. an `FS.<name>` that does not exist — a typo is `undefined`, which React drops and CSS never
 *      sees, so the text renders at the inherited size and nothing warns
 *   4. an FS step nothing uses: the drift that says a size was retired without being removed
 *   5. the palette, the corner scale, the `@layer components` wrapper, and every class — see the
 *      section comments below, each of which was added after a bug got through
 * ============================================================================
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FS, RADII, UI, accent, sans, mono } from "../src/ui/theme.ts";

const SIZES = new Set<number>(Object.values(FS));
const NAMES = new Set<string>(Object.keys(FS));
const fail: string[] = [];
const used = new Set<string>();

// ---- 1. index.css: every font-size must be a member ----------------------------------------
// Comments are blanked first, newlines kept so line numbers still point at the real line. This
// file DOCUMENTS the rules it is checked against — the layer note below quotes the reset verbatim
// — so a scanner that reads prose finds the thing it is looking for in the paragraph explaining it.
// (That is not hypothetical: it is how the layer guard first failed, on a correct stylesheet.)
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const css = strip(readFileSync("src/index.css", "utf8")).split("\n");
css.forEach((line, i) => {
  for (const m of line.matchAll(/font-size:\s*([0-9.]+)px/g)) {
    const px = Number(m[1]);
    if (!SIZES.has(px)) fail.push(`src/index.css:${i + 1}  font-size: ${m[1]}px is not on the scale`);
    else used.add(String(px));
  }
});

// ---- 1b. no raw corner radius, in either file kind -------------------------------------------
// The same fold the type scale got, and the same reason to gate it: there were thirteen radii, one
// per integer somebody reached for. index.css writes `var(--radius-*)` (safe, unlike a font size,
// because `@theme` emits these STATICALLY into the stylesheet rather than at runtime), and a .tsx
// writes `rounded-<step>`. A raw `rounded-[9px]` is how the thirteenth value comes back.
css.forEach((line, i) => {
  for (const m of line.matchAll(/border-radius:\s*(\d[\d.]*)px/g)) {
    fail.push(`src/index.css:${i + 1}  border-radius: ${m[1]}px — use var(--radius-<step>)`);
  }
});

// ---- 2/3. src/**/*.tsx: fontSize must be an FS member, spelled correctly --------------------
const walk = (dir: string, exts: string[] = [".tsx"]): string[] => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  return statSync(p).isDirectory() ? walk(p, exts) : exts.some((x) => p.endsWith(x)) ? [p] : [];
});

for (const f of walk("src")) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    // A raw number anywhere a font size is set — style object, prop, or SVG attribute.
    for (const m of line.matchAll(/fontSize(?::\s*|=")([0-9.]+)/g)) {
      fail.push(`${f}:${i + 1}  fontSize ${m[1]} is a raw number — use an FS member`);
    }
    for (const m of line.matchAll(/rounded-\[(\d[\d.]*)px\]/g)) {
      fail.push(`${f}:${i + 1}  rounded-[${m[1]}px] is a raw radius — use a RADII step`);
    }
    for (const m of line.matchAll(/borderRadius:\s*([0-9"'][^,}\n]*)/g)) {
      fail.push(`${f}:${i + 1}  borderRadius ${m[1].trim()} inline — use a rounded-* utility`);
    }
    // A Tailwind `text-<step>` uses the step just as `FS.<step>` does.
    for (const m of line.matchAll(/\btext-(2xs|xs|sm|base|md|lg|xl|2xl|3xl)\b/g)) {
      used.add(String(FS[m[1] as keyof typeof FS]));
    }
    for (const m of line.matchAll(/FS(?:\.([A-Za-z][A-Za-z0-9]*)|\["([^"]+)"\])/g)) {
      const name = m[1] ?? m[2];
      if (!NAMES.has(name)) fail.push(`${f}:${i + 1}  FS.${name} does not exist`);
      else used.add(String(FS[name as keyof typeof FS]));
    }
  });
}

// ---- 3b. @theme must carry exactly what theme.ts declares ------------------------------------
const cssText = css.join("\n");
const theme = cssText.slice(cssText.indexOf("@theme {"), cssText.indexOf("\n}", cssText.indexOf("@theme {")));
const tokens = new Map<string, string>();
for (const m of theme.matchAll(/^\s*--([a-z0-9-]+(?:-\*)?):\s*([^;]+);/gm)) tokens.set(m[1], m[2].trim());

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const expect = new Map<string, string>([
  ...Object.entries(FS).map(([k, v]) => [`text-${k}`, `${v}px`] as [string, string]),
  ...Object.entries(RADII).map(([k, v]) => [`radius-${k}`, `${v}px`] as [string, string]),
  ...Object.entries(UI).map(([k, v]) => [`color-${kebab(k)}`, v] as [string, string]),
  ["color-accent", accent], ["font-sans", sans.replace(/'/g, '"')], ["font-mono", mono.replace(/'/g, '"')],
  // The alpha ladder: same list, and the same suffix rule, as theme.ts's ALPHAS loop.
  ...[0.06, 0.07, 0.08, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55].flatMap((a) => {
    const suffix = String(a).slice(2);
    const rgba = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    };
    return [[`color-accent-${suffix}`, rgba(accent)], [`color-warn-${suffix}`, rgba(UI.warn)]] as [string, string][];
  }),
]);
for (const [name, want] of expect) {
  const got = tokens.get(name);
  if (got === undefined) fail.push(`@theme is missing --${name} (theme.ts says ${want})`);
  else if (got !== want) fail.push(`@theme --${name} is "${got}", theme.ts says "${want}"`);
}
for (const name of tokens.keys()) {
  if (/^(text|color|radius)-/.test(name) && !name.endsWith("-*") && !expect.has(name)) {
    fail.push(`@theme declares --${name}, which theme.ts does not`);
  }
}
// A cleared namespace is what stops `text-red-500` / `text-xs` from silently existing.
for (const ns of ["color-*", "text-*", "radius-*"]) {
  if (tokens.get(ns) !== "initial") fail.push(`@theme must clear --${ns} with \`initial\` before declaring ours`);
}

// ---- 3c. the app's CSS must stay inside @layer components ------------------------------------
// This is the bug that made the Tailwind migration real work, and it is invisible: an UNLAYERED
// rule beats every layered one whatever the specificity, so with the app's reset outside a layer
// `* { padding: 0 }` defeated every spacing utility in the app. `px-12` computed to 0px with the
// class in the DOM and the rule in the stylesheet, and nothing anywhere said so.
{
  const open = cssText.indexOf("@layer components {");
  const reset = cssText.indexOf("* { margin: 0");
  if (open < 0) fail.push("src/index.css: the app's CSS must be wrapped in `@layer components { … }`");
  else if (reset >= 0 && reset < open) fail.push("src/index.css: the reset is OUTSIDE @layer components — unlayered rules beat every utility");
}

// ---- 3d. BEM modifiers must exist in both directions -----------------------------------------
// `.btn--ghost` was deleted from index.css when the buttons it belonged to moved into the ☰ menu,
// and GuidePage's one use of it was not. That button then rendered in the BROWSER's default chrome —
// grey, 2px outset black — inside a warm-toned document, on main, past every gate here, because a
// class attribute is a string and nothing in this project read it.
//
// Two directions, needing different rules because only one is decidable here. **Defined but unused**
// covers EVERY class in index.css, which is what catches a rule whose element moved to utilities and
// left the rule behind (`.guide-steps .btn { margin-top: 12px }` outlived its `.btn` by one commit,
// and the guide's button silently lost its 12px). **Used but undefined** can only be checked for
// `x--y` modifiers: a bare class in JSX is far more likely to be a Tailwind utility, and telling
// them apart without running Tailwind's own scanner is guesswork, while a `--` modifier is a project
// class by construction.
//
// Both read comment-stripped source, for the reason index.css's scan does: this repo documents the
// rules it enforces, and the guard first failed on a correct file by finding a class quoted in the
// paragraph explaining it.
{
  const noComments = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
  // `@import "tailwindcss/theme.css"` would otherwise contribute a class called `css`.
  const selectors = css.join("\n").replace(/@import[^;]*;/g, "");
  const declared = [...selectors.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]);
  // papercraft generates its own stylesheet from the STYLE table and scopes it under `.pages`.
  const paper = new Set([...noComments(readFileSync("src/papercraft.ts", "utf8"))
    .matchAll(/"?([a-z][\w-]*)"?\s*:\s*\{/g)].map((m) => m[1]));
  // Every whitespace-separated token that appears inside a STRING LITERAL anywhere in src/. Only
  // literals: an earlier version accepted a match delimited by whitespace in the raw source, which
  // made `const btn = useRef(...)` in Menu.tsx count as a use of `.btn` and quietly passed a dead
  // `.guide-steps .btn` rule — the exact bug the check exists for.
  const rendered = new Set<string>();
  for (const f of walk("src", [".ts", ".tsx"])) {
    for (const m of noComments(readFileSync(f, "utf8")).matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
      // Split on quotes and angle brackets too: a class can sit inside a `${…}` in a template, or
      // inside markup a module builds as a string (papercraft writes `<svg class="pg" …>`).
      for (const tok of (m[1] ?? m[2] ?? m[3] ?? "").split(/[\s${}"'<>=]+/)) if (tok) rendered.add(tok);
    }
  }
  const MOD = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*--[a-z0-9-]+\b/g;

  for (const c of new Set(declared)) {
    if (c.startsWith("pages") || paper.has(c)) continue;
    if (!rendered.has(c)) {
      fail.push(`src/index.css: .${c} is in a selector but nothing in src/ renders it`);
    }
  }
  const declaredMods = new Set(declared.filter((c) => c.includes("--")));
  for (const f of walk("src", [".tsx"])) {
    noComments(readFileSync(f, "utf8")).split("\n").forEach((line, i) => {
      for (const m of line.matchAll(MOD)) {
        if (!declaredMods.has(m[0])) fail.push(`${f}:${i + 1}  class "${m[0]}" is not defined in index.css`);
      }
    });
  }
}

// ---- 3e. every utility written in JSX must exist in the built stylesheet ----------------------
// The Tailwind half of "a class attribute is a string". `text-md` is a size in this app and not in
// stock Tailwind; `rounded-8` looks obviously fine and generates NOTHING, because v4's `rounded-*`
// reads a --radius-* namespace rather than the spacing scale. A utility that does not exist is not
// an error anywhere: it is a class in the DOM with no rule behind it, which is the same silence
// `.btn--ghost` shipped in.
//
// This needs the BUILD, since only Tailwind knows what it generated. CI builds before it runs the
// checks. If dist is missing this FAILS rather than skipping — a gate that quietly does nothing is
// the one failure mode worth designing against (see eslint.config.ts for the same argument).
{
  let built: string[] = [];
  try { built = readdirSync("dist/assets").filter((n) => n.endsWith(".css")); } catch { /* reported below */ }
  if (!built.length) {
    fail.push("no built stylesheet in dist/assets — run `npm run build` before check:style");
  } else {
    const sheet = readFileSync(join("dist/assets", built[0]), "utf8");
    const esc = (c: string) => "." + c.replace(/[:[\]().,'#/%!&>~*+=]/g, (ch) => "\\" + ch);
    const seen = new Set<string>();
    // Two shapes carry a class list: the attribute itself, and a SHARED SKIN CONSTANT — the string
    // a component hands to `className={…}` or composes into a template. `SEG_SKIN`, `NOTE_SKIN`,
    // `PT_BTN`, `CHIP_BOX`, `TAB_SKIN`: every one is a class attribute that happens to be spelled
    // somewhere else, and reading only the attribute left them all unchecked — the biggest class
    // strings in the app, in the files most likely to be edited.
    //
    // Which constants those are is not guessed from their NAMES: the identifiers are read out of the
    // `className={…}` expressions that use them, and only those are then resolved. A naming
    // convention would have to be remembered; this cannot miss one, and cannot mistake `WASHI_PDF`
    // for a class list either. A constant is read whole rather than line by line, because these are
    // written as multi-line `"…" + "…"` concatenations.
    const CLASS_ATTR = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g;
    const skinNames = new Set<string>();
    const files = [...walk("src", [".tsx"])];
    const src = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
    for (const text of src.values()) {
      for (const m of text.matchAll(CLASS_ATTR)) {
        for (const id of (m[2] ?? m[3] ?? "").matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)) skinNames.add(id[0]);
      }
    }
    // EVERY token, not just Tailwind-shaped ones. Narrowing this to utilities left a hole the orphan
    // check does not cover from the other side: `className="sec"` kept working after `.sec` was
    // deleted from index.css, because nothing asks whether a bare project class still resolves. It
    // does not — the built sheet is the whole truth about what a class name means, project rule and
    // generated utility alike.
    const check = (where: string, list: string) => {
      for (const c of list.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) {
        if (!c || seen.has(c)) continue;
        seen.add(c);
        if (!sheet.includes(esc(c))) fail.push(`${where}  class "${c}" matches no rule in the built stylesheet`);
      }
    };
    for (const [f, text] of src) {
      text.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(CLASS_ATTR)) check(`${f}:${i + 1}`, m[1] ?? m[2] ?? "");
      });
      // The skins, read whole. `[\s\S]` rather than `.` so a concatenation may span lines.
      for (const name of skinNames) {
        const m = text.match(new RegExp(`\\b${name}\\b(?:\\s*:\\s*string)?\\s*=\\s*((?:\\s*(?:"[^"\\n]*"|\`[^\`]*\`)\\s*\\+?)+)`));
        if (!m) continue;
        const parts = [...m[1].matchAll(/"([^"\n]*)"|\`([^\`]*)\`/g)].map((q) => q[1] ?? q[2]).join(" ");
        check(`${f}  (${name})`, parts);
      }
    }
  }
}

// ---- 4. a step nothing uses -----------------------------------------------------------------
for (const [name, px] of Object.entries(FS)) {
  if (!used.has(String(px))) fail.push(`FS["${name}"] = ${px}px is used nowhere — retire it or use it`);
}

const n = SIZES.size;
if (fail.length) {
  console.error(`\n✗ type scale: ${fail.length} problem(s)\n`);
  for (const f of fail) console.error("  " + f);
  console.error(`\n  the scale is ${Object.entries(FS).map(([k, v]) => `${k}=${v}`).join("  ")}\n`);
  process.exit(1);
}
console.log(`✓ style: ${n} type steps, ${Object.keys(RADII).length} radii, every font size in src/ is a member; @theme carries ${expect.size} tokens, all matching theme.ts  (0 FAIL)`);
