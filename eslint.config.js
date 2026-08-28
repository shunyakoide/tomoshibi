/**
 * ============================================================================
 * ESLint — the React hook rules, and only those
 * ============================================================================
 * This project has no linter by policy: the checks that matter here are geometric (watertightness,
 * full scale), and a style linter would only add noise and a dependency. One class of bug is the
 * exception, because it is invisible in review and no geometric check can see it: a hook whose
 * dependency array does not match what its body reads. That is a stale closure — the viewport
 * keeps rendering the design from three edits ago — and it fails silently.
 *
 * So this config enables the two classic hook rules and nothing else. `react-hooks/recommended`
 * would switch on ~29 rules (the plugin now ships the React Compiler lint set too), none of which
 * this codebase was written against; that is a separate decision, not a side effect of wanting
 * dependency checking.
 *
 * Deliberately absent: `eslint:recommended`. Without it `no-undef` never runs, which is what lets
 * us skip a `globals` dependency for `window` / `document` / `localStorage` — the build already
 * fails on a genuinely undefined identifier. Same for typescript-eslint's own rule sets: `tsc` is
 * the type check, and it runs in `npm run build`. What the parser is here for is that ESLint cannot
 * READ a .ts/.tsx file without it — and a config whose `files` no longer matches anything reports
 * "0 problems" exactly as loudly as a clean one. That silence is the failure mode this guards.
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
      // The stale-closure rule above. It is an error rather than a warning because the two places
      // that legitimately opt out already say so in an eslint-disable comment with a reason, which
      // is the standard this keeps: escaping the rule is fine, escaping it silently is not.
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
