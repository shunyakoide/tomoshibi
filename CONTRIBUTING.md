# Contributing

Thanks for your interest! This project generates **3D-printable forming molds** for
washi paper lanterns (paper lamps). The one hard rule: **every exported part must be a
watertight (closed, manifold) mesh**, or slicers break. Most of the guidance below
exists to protect that.

## Development setup

```bash
npm install
npm run dev        # Vite dev server with HMR (--host), default http://localhost:5173
npm run build      # production build; must pass before merging
```

Node.js 18+ is required. Stack: Vite 7 + React 18 + three.js 0.169 (plain JS/JSX, no
TypeScript). Dependencies are intentionally minimal — please don't add new ones without
a strong reason.

## Verification gates

There is no unit-test runner. Correctness is guaranteed by **"the build passes"** plus
**"the STL is watertight"**. Before opening a PR, run:

| Command | What it proves |
| --- | --- |
| `npm run build` | Everything compiles. |
| `npm run check:manifold` | Sweeps 3 presets × many parameter combinations and checks every part is watertight: each undirected edge is shared by exactly 2 triangles, with no NaN vertices and no degenerate (zero-area) triangles. **Anything other than `0 FAIL` must not be merged.** |
| `npm run check:hash` | For a change that is *supposed* to leave the geometry identical (a refactor, a comment edit), diffs the vertex hashes before/after to prove not a single vertex moved. Usage is documented at the top of `scripts/hash.mjs`. |
| `npm run check:persist` | Confirms that corrupted `localStorage` / imported JSON is sanitized safely (no crash, no non-watertight parts). |
| `npm run check:paper` | Confirms the cardboard papercraft output is full-scale (1:1), that no part is dropped, and that no `NaN` reaches the SVG. |

Manifold verification has a known blind spot: it does **not** catch a hole that is
topologically closed but visually filled (wrong-winding caps). For meshes with holes,
also eyeball the render.

## Architecture (where things live)

- **`src/geometry.js`** — the core. Pure functions that build the 2D cross-sections and
  3D geometry of every part. Returns three.js `Shape`/`ExtrudeGeometry` but depends on
  **neither React nor DOM** — it is shared by the section editor, the 3D views, and the
  STL export, so all three always agree. Add geometry logic here.
- **`src/config.js`** — presets (control-point templates) and default parameters.
- **`src/SectionEditor.jsx`** — the direct-manipulation section editor (SVG). It must draw
  using `geometry.js` functions (including the dimension constants), never re-implement
  them, or the drawing and the STL will drift apart.
- **`src/HarigataStudio.jsx`** — the app shell: the right-hand control panel and the four
  3D views (Section / Assembly / Print / Lit).
- **`src/stl.js`** — STL export and ZIP packaging.
- **`src/papercraft.js`** — the full-scale A4 cardboard templates (pure module built from
  the same `geometry.js` functions).
- **`src/i18n.js`** — UI translations. Keys are the Japanese UI strings; English is looked
  up in the `EN` dictionary, falling back to Japanese.

## Conventions

- **Comments are in English.** Include units and intent for formulas and dimensions.
- Keep **`geometry.js` pure** (no React/DOM) — it's what keeps the section drawing and the
  STL in sync.
- The section editor and papercraft must reuse `geometry.js` functions rather than
  re-deriving dimensions.
- The mold's part definitions and relationships (rib / koma / stand / groove / neck / tab /
  opening ring) are fixed — see [`CLAUDE.md`](CLAUDE.md) for the full design rules and the
  print-fit invariants (the shared values that let a reprinted part still fit a previously
  printed one). Read it before changing shapes.

## Adding a shape preset

Add an entry to `PRESETS` in `src/config.js` (a `key`, `name`, and a `pts` array of
control points). Then run `npm run check:manifold` — a new silhouette can expose
degenerate cases, so it must sweep clean.

## Pull requests

Keep PRs small and verified. State which checks you ran and their results. If a change is
meant to leave the STL unchanged, include the `check:hash` result.
