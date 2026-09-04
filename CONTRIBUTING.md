# Contributing

Thanks for your interest! This project generates **3D-printable forming molds** for
washi paper lanterns (paper lamps). The one hard rule: **every exported part must be a
watertight (closed, manifold) mesh**, or slicers break. Most of the guidance below
exists to protect that.

## Development setup

```bash
npm install
npm run dev        # Vite dev server with HMR (--host), http://localhost:8173 (strictPort)
npm run build      # production build; must pass before merging
```

**Node.js 22.18+** is required (or 24+). The floor is set by the check scripts: they are
TypeScript and are run by plain `node`, which strips types without a flag from 22.18 on.
Node 20 reached end of life in April 2026. `package.json`'s `engines` field states the
same range, so an outdated Node fails at `npm install` rather than at build time.

Stack: Vite 8 + React 19 + three.js r185, plus fflate for the export ZIP, written in
**TypeScript** (`strict`). Four runtime dependencies; the dev ones are the toolchain plus
the type packages, which ship nothing. That is deliberate, so
please don't add another without a strong reason. The bar it has to clear: `pdf.ts` is
hand-written because a PDF library costs hundreds of kB for a handful of vector ops,
while `fflate` was worth it at 9.5 kB raw for DEFLATE (a kit ZIP goes 1.0 MB → 0.19 MB).

## Verification gates

There is no unit-test runner. Correctness is guaranteed by **"the build passes"** plus
**"the STL is watertight"**. Before opening a PR, run:

| Command | What it proves |
| --- | --- |
| `npm run build` | Everything type-checks and compiles (it runs `tsc --noEmit` first). |
| `npm run typecheck` | Just the type check, over `src`, `scripts` and the Vite config. Faster than a full build while you work. |
| `npm run lint` | No React hook has a dependency array that disagrees with its body (a stale closure -- the one bug class here that is invisible in review *and* invisible to every geometric check). ESLint runs **only** the two hook rules; see `eslint.config.js` for why. |
| `npm run check:manifold` | Sweeps 3 presets × many parameter combinations and checks every part is watertight: each undirected edge is shared by exactly 2 triangles, with no NaN vertices and no degenerate (zero-area) triangles. **Anything other than `0 FAIL` must not be merged.** Takes about 2 minutes. |
| `npm run check:hash` | For a change that is *supposed* to leave the geometry identical (a refactor, a comment edit), diffs the vertex hashes before/after to prove not a single vertex moved. Usage is documented at the top of `scripts/hash.mts`. |
| `npm run check:persist` | Confirms that corrupted `localStorage` / imported JSON is sanitized safely (no crash, no non-watertight parts). |
| `npm run check:paper` | Confirms the cardboard papercraft output and the washi template are full-scale (1:1), that no part is dropped, and that no `NaN` reaches the SVG or a bad offset the PDF. |
| `npm run check:glyphs` | Confirms every character the PDFs print has an outline in `src/io/pdf-glyphs.ts`. The writer sets Latin in Helvetica and draws the rest from those outlines; a character with none is **dropped**, so a new Japanese label prints as a blank space and nothing else notices. Regenerate the table with `tools/pdffont` rather than editing it. |
| `npm run check:style` | Confirms every font size is a member of the type scale, every corner radius a member of the corner scale, and every class in the DOM has a rule behind it. Needs `npm run build` first, since only Tailwind knows what it generated -- and it FAILS rather than skips without `dist`. |
| `npm run check:i18n` | Confirms no UI wording lost its translation. The dictionary is keyed by the Japanese string itself, so **rewording a label does not make its translation stale -- it deletes it**, silently, and the app shows Japanese to an English visitor. Also catches entries left orphaned by the reword, and `{placeholder}` mismatches. |

CI runs all of these on every push and pull request EXCEPT `check:hash`, which compares a
before and an after and so has nothing to compare against on a single commit -- it is yours
to run locally, around a change that should leave the STL identical. Run the rest locally
first too: `check:manifold` is the slow one and it is the one that matters most.

Manifold verification has a known blind spot: edge counting cannot see a hole that got
filled in -- the shell stays closed either way. The leg sockets are the one place this is
tested directly (`check:manifold` shoots a ray up each pad and counts the faces); for any
other mesh with holes, eyeball the render.

## Architecture (where things live)

`src/` itself holds only the entry, the two barrels, and what more than one area shares
(`types.ts`, `config.ts`, `i18n.ts`, `util.ts`, `bed.ts`). Everything else is in a directory named
for what it is:

| | |
|---|---|
| `src/studio/` | the app's state and its files — `TomoshibiStudio.tsx` and the hooks, undo, autosave, downloads and routing it owns |
| `src/io/` | byte-level writers with no domain knowledge — STL, ZIP, PDF |
| `src/ui/` | every component except the entry and the studio itself; `panel/` and `section/` hold their own heads |
| `src/guide/` | the build guide, `GuidePage.tsx` included |
| `src/geometry/` `src/paper/` `src/three/` | the shapes, the templates, the 3D |

- **`src/geometry.ts`** — the core, and the single import point for every shape. Pure
  functions that build the 2D cross-sections and 3D geometry of every part. Returns
  three.js `Shape`/`ExtrudeGeometry` but depends on **neither React nor DOM** — it is
  shared by the section editor, the 3D views, the STL export and both paper templates, so
  all of them always agree. The file itself is a re-export barrel; the implementation is
  in **`src/geometry/`**, one module per part:
  - **`profile.ts`** — `outerR()` and every dimension derived from it (`komaR`, tab depth,
    notch bottom, rib-count ceiling). They share a module because they are mutually
    recursive, and it is where the **print-fit invariants** live — the values that let a
    reprinted rib still fit a koma printed last month. Be careful here.
  - **`groove.ts`** (bamboo-rib grooves) · **`shape.ts`** (point list → `THREE.Shape`, with
    the cleanup earcut requires) · **`rib.ts`** · **`koma.ts`** · **`ring.ts`** ·
    **`stand.ts`** · **`washi.ts`**
  - Import from `geometry.ts`, not from the modules. Dependencies run one way
    (profile ← groove ← rib; shape is a leaf), so anything mutually recursive with
    `outerR` belongs in `profile.ts` — otherwise you have made a cycle.
- **`src/types.ts`** — what a design *is*: `Design` (the `p` almost every function takes),
  `Pt`/`Handle`, `Pt2`, `Route`. Types only, so it is erased at build time and creates no
  dependency — which is what lets `geometry/` name a design without importing `config.ts`.
- **`src/config.ts`** — presets (control-point templates) and default parameters, checked
  against `Design`.
- **`src/ui/section/SectionEditor.tsx`** — the direct-manipulation section editor (SVG). It must draw
  using `geometry.ts` functions (including the dimension constants), never re-implement
  them, or the drawing and the STL will drift apart.
- **`src/studio/TomoshibiStudio.tsx`** — the app shell: state and composition only. The 3D lives in
  **`src/three/`** (`viewport.ts` = renderer/lights/controls, `scenes.ts` = what each view
  draws) and the panel's controls in **`src/ui/`**.
- **`src/io/stl.ts`** — STL export and ZIP packaging.
- **`src/papercraft.ts`** — the full-scale A4 cardboard templates and the washi template
  (a pure module built from the same `geometry.ts` functions), rendered as SVG or as PDF
  through **`src/io/pdf.ts`**.
- **`src/i18n.ts`** — UI translations. Keys are the Japanese UI strings; English is looked
  up in the `EN` dictionary, falling back to Japanese. Edit a wording and its `EN` entry in
  the same commit — `npm run check:i18n` enforces it.

## Conventions

- **`README.md` and `README.ja.md` are the same document in two languages, and they move
  together.** No gate checks it, so it is on the author: edit one, edit the other in the
  same commit. A page that looks complete while being a release behind is worse than a
  short one, which is why the Japanese half is a full translation rather than a summary —
  a summary is the form that goes stale without ever looking wrong.
- **Comments are in English.** Include units and intent for formulas and dimensions.
- **Relative imports carry their real extension** (`./geometry.ts`, `./ui/controls.tsx`).
  Vite does not need it, but the check scripts are run by plain `node`, which will not map
  a `.js` specifier onto a `.ts` file. One consequence worth knowing: **nothing a check
  script imports may be a `.tsx` file** — Node strips types but cannot compile JSX.
- Keep **`src/geometry/` pure** (no React/DOM) — it's what keeps the section drawing and
  the STL in sync.
- The section editor and papercraft must reuse `geometry.ts` functions rather than
  re-deriving dimensions.
- The mold's part definitions and relationships (rib / koma / stand / groove / neck / tab /
  opening ring) are fixed — see [`docs/design-notes.md`](docs/design-notes.md) for the full design
  rules and the print-fit invariants (the shared values that let a reprinted part still fit a
  previously printed one). **Read the note for the area you are changing before you change it**:
  most of what is in there is there because it was got wrong once.

## Adding a shape preset

Add an entry to `PRESETS` in `src/config.ts` (a `key`, `name`, and a `pts` array of
control points). Then run `npm run check:manifold` — a new silhouette can expose
degenerate cases, so it must sweep clean.

## Pull requests

Keep PRs small and verified. State which checks you ran and their results. If a change is
meant to leave the STL unchanged, include the `check:hash` result.
