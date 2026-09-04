/**
 * Source scanning shared by the gates that read `src/` AS TEXT rather than importing it —
 * `check:i18n` (what string is written) and `check:glyphs` (what character is printed).
 *
 * A character scanner rather than a regex, and the reason is the same for both callers: a regex
 * `//` strip eats the `//` inside a URL and blanks the rest of that line, while matching literals
 * without tracking comments picks up prose out of a comment. `src/paper/svg.ts` carries
 * `xmlns="http://www.w3.org/2000/svg"`, so the first of those is not hypothetical here — a label
 * written after it on that line would have been dropped from `check:glyphs`'s alphabet and printed
 * as a blank, which is the exact failure that gate exists to catch.
 *
 * It also has to see literals NESTED IN template literals, where the `t()` call inside is what both
 * callers are after: every Japanese label on the templates reaches the page as `${t("…")}`.
 */

/**
 * Split `src` into its plain `'…'` / `"…"` literals and the same source with comments blanked and
 * literals kept verbatim. Template literals are not returned as literals themselves — their `${…}`
 * is code, and is scanned recursively — but they survive intact in `code`, so a caller that wants
 * a template's own text can match over that.
 */
export function scan(src: string): { literals: string[]; code: string } {
  const literals: string[] = [];      // plain '…' / "…" literals (not template literals)
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

/** Undo the escapes that matter for matching a dictionary key written the same way. */
export const unescape_ = (s: string) => s.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");
