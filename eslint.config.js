/**
 * ============================================================================
 * ESLint — the React hook rules, and only those
 * ============================================================================
 * No linter by policy: the checks that matter here are geometric. The one exception is invisible to
 * review and to every geometric check — a hook whose dependency array disagrees with its body, i.e.
 * a stale closure, failing silently. So: the two classic hook rules, nothing else.
 * `react-hooks/recommended` would switch on ~29 rules (the React Compiler set included), none of
 * which this codebase was written against.
 *
 * Deliberately absent: `eslint:recommended`, so `no-undef` never runs and no `globals` dependency is
 * needed for `window` / `document` / `localStorage`; the build already fails on a genuinely
 * undefined identifier, and `tsc` in `npm run build` is the type check. The parser is here because
 * ESLint cannot READ a .ts/.tsx file without it, and a `files` matching nothing reports "0 problems"
 * as loudly as a clean run — that silence is the failure mode this guards.
 *
 * Run:  npm run lint          (part of the verification gates; warnings are errors)
 * ============================================================================
 */
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // A hook called conditionally or out of a component desynchronizes React's hook order —
      // always a bug, never a style preference.
      "react-hooks/rules-of-hooks": "error",
      // The stale-closure rule above. An error rather than a warning because both legitimate
      // opt-outs carry an eslint-disable comment with a reason: escaping it silently is not fine.
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
