/**
 * ============================================================================
 * TYPE SCALE — every font size in the app must be a member of it
 * ============================================================================
 * The scale is `FS` in src/ui/theme.ts (nine steps). Nothing else may set a font size, and the
 * reason this is a check rather than a convention is that the old scale had SIXTEEN steps, five of
 * them half-pixel, and not one of them arrived by decision — each was a nudge that stuck. A scale
 * with no gate is a scale that grows back.
 *
 * Two encodings have to agree and neither can see the other:
 *   - JS  — `fontSize: FS.base` in a style object, `fontSize={FS.base}` on an SVG <text>
 *   - CSS — `font-size: 12px` in index.css, written as a LITERAL
 * The literal is deliberate (see the FS comment: a `var()` that is not set yet degrades to inherited
 * TEXT SIZE, and the whole page would resize on boot), so nothing at runtime links the two. This
 * script is the link.
 *
 * What it fails on:
 *   1. a CSS `font-size` whose px value is not in FS
 *   2. a JS `fontSize` written as a raw number instead of an FS member
 *   3. an `FS.<name>` that does not exist (a typo — `FS.xxl` is `undefined`, which React drops
 *      silently and CSS never sees, so the text renders at the inherited size and nothing warns)
 *   4. an FS step nothing uses — the drift that says a size was retired without being removed
 *
 * It does NOT read font sizes out of three/figures.ts or papercraft.ts. Those draw into a WebGL
 * frame and onto A4 at 1:1, where the unit is mm or a world unit and 12 has nothing to do with 12px.
 * ============================================================================
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FS } from "../src/ui/theme.ts";

const SIZES = new Set<number>(Object.values(FS));
const NAMES = new Set<string>(Object.keys(FS));
const fail: string[] = [];
const used = new Set<string>();

// ---- 1. index.css: every font-size must be a member ----------------------------------------
const css = readFileSync("src/index.css", "utf8").split("\n");
css.forEach((line, i) => {
  for (const m of line.matchAll(/font-size:\s*([0-9.]+)px/g)) {
    const px = Number(m[1]);
    if (!SIZES.has(px)) fail.push(`src/index.css:${i + 1}  font-size: ${m[1]}px is not on the scale`);
    else used.add(String(px));
  }
});

// ---- 2/3. src/**/*.tsx: fontSize must be an FS member, spelled correctly --------------------
const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
});

for (const f of walk("src")) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    // A raw number anywhere a font size is set — style object, prop, or SVG attribute.
    for (const m of line.matchAll(/fontSize(?::\s*|=")([0-9.]+)/g)) {
      fail.push(`${f}:${i + 1}  fontSize ${m[1]} is a raw number — use an FS member`);
    }
    for (const m of line.matchAll(/FS(?:\.([A-Za-z][A-Za-z0-9]*)|\["([^"]+)"\])/g)) {
      const name = m[1] ?? m[2];
      if (!NAMES.has(name)) fail.push(`${f}:${i + 1}  FS.${name} does not exist`);
      else used.add(String(FS[name as keyof typeof FS]));
    }
  });
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
console.log(`✓ type scale: ${n} steps, every font size in src/ is a member  (0 FAIL)`);
