# CLAUDE.md

灯 Tomoshibi (トモシビ) — a browser app that generates **3D-printable forming molds (harigata)** for
building washi paper lanterns. Editing the cross-section produces STLs for the ribs, koma (hubs),
stand and opening rings, or a full-scale A4 paper template for building the same mold from cardboard.

**The design decisions live in [`docs/design-notes.md`](docs/design-notes.md), not here.** This file
is the short operating brief: how to run things, what must pass, and what not to re-litigate. Read
the design note for the area you are about to touch before you touch it — most of what is in there
is there because it was got wrong once.

## Commands

```bash
npm run dev       # Vite dev server (HMR, --host). http://localhost:8173/ (strictPort: a clash fails loudly)
npm run build     # tsc --noEmit && vite build. Always confirm it passes.
npm run typecheck # just the type check — src, scripts and the Vite config in one pass
npm run preview   # preview the build output (http://localhost:8174)
```

## The gates

There is no test runner. Correctness is **"the build passes"** plus **"the STL is watertight"**.

| gate | covers | the failure it exists for |
|---|---|---|
| `check:manifold` | 41,472 parts, swept | an open edge / non-manifold STL the slicer chokes on |
| `check:hash` | vertex hashes before vs after | a "shouldn't change the STL" refactor that moved one |
| `check:persist` | corrupt localStorage | a bad saved file crashing the app or yielding a non-watertight koma |
| `check:paper` | papercraft + the washi template | a template that is not 1:1, is missing a part, or prints NaN |
| `check:glyphs` | the characters those PDFs print | a character with no outline, which is **dropped** — a blank on paper |
| `check:i18n` | UI wording | a reworded label whose translation silently stopped matching |
| `check:style` | the type / corner scales, the palette, every class | a font size off the scale; a class in the DOM with no rule behind it |
| `typecheck` / `lint` | types; the two React hook rules only | a stale closure — the viewport rendering the design from three edits ago |

**Anything other than `0 FAIL` does not get merged.** CI runs them all on every push. Four things
about them are not obvious from running them:

- **`check:manifold` is the slow one (~2 min) and the one that matters most.** Run it after touching
  anything in `src/geometry/`.
- **`check:hash` is only comparable within one three.js version.** It hashes the position array in
  order, so an upgrade that flips which diagonal splits a quad rewrites every hash while the solid is
  untouched. Across an upgrade, compare triangle count, signed volume, surface area, bounding box.
- **`check:style` needs `npm run build` first** (only Tailwind knows what it generated), and it FAILS
  rather than skips without `dist` — a gate that quietly does nothing is the failure worth designing
  against. `lint` has the same shape: its `files` pattern matching nothing would report "0 problems"
  exactly as loudly as a clean run.
- **`check:i18n` exists because the dictionary is keyed by the Japanese string itself**, so rewording
  a label does not make its translation stale, it DELETES it.

## Do not re-litigate these

Each is settled, each was reverted at least once, and each has its reasoning in the design notes.

- **The neck is always a vertical rectangle**, and its presence never changes the tab size.
- **The tab is a straight tongue** with no outward steps or hooks. Its one exception is the tab-tip
  dent that makes the koma stop — and the shelf it replaced (`komaStop2D`) does not come back.
- **The rib's inner edge is hollowed only at the centre.** `RIB_CURVE_D` is not the knob for
  rescuing a silhouette that cannot be pulled out.
- **Grooves are evenly spaced across the whole lamp body**, barbs leaning toward the equator, with a
  half-pitch buffer at each opening.
- **The print-fit invariants are single definitions** (`innerRi` / `tabTipRi` / `notchR`): a reprinted
  rib still fits a koma printed last month because both parts derive from the same function.
- **The papercraft cuts no grooves, opens no lightening windows, and emits no stand**, and it skips
  the tab-tip dent (`noTabDent`) for tab strength.
- **The washi template is not an output method** — it rides along with whichever route you pick, as
  its own PDF.
- **The build guide is a page, not a view**, and it is generic: it prints no dimension the design
  decides.
- **The bed only exists on the STL route.**
- **The leg sockets are a checkbox, not dimensions.**

→ [`docs/design-notes.md`](docs/design-notes.md) for all of the above, plus the terminology (rib /
koma / groove / neck / tab / opening ring), the narrow-screen acceptance criteria, and the Tailwind
setup's six load-bearing decisions.

## Where things are

| | |
|---|---|
| `src/geometry.ts` | the single import point for every shape — a barrel over `src/geometry/` (profile, groove, shape, rib, koma, ring, stand, washi). **Pure functions**, no React or DOM. Import from here, not from the modules. |
| `src/types.ts` | what a design IS (`Design`, `Pt`, `Route`, `NumericDesignKey`). Types only, so it creates no dependency edge. |
| `src/config.ts` | `PRESETS` / `DEFAULTS` / `SIL_ROWS` / `LIMITS` |
| `src/SectionEditor.tsx` | the direct-manipulation cross-section editor (SVG), built from `geometry.ts` so it matches the STL exactly |
| `src/TomoshibiStudio.tsx` | the app's state and composition only — no controls of its own, no 3D |
| `src/three/` | `viewport.ts` (renderer, lights, orbit, loop) · `scenes.ts` (what each view draws) · `figures.ts` (the guide's line drawings, rendered off-screen to PNGs) |
| `src/ui/` | `theme.ts` (palette, `FS`, `RADII`) · `controls.tsx` · the panel's pieces (`PresetChips`, `PointCard`, `Toolbar`, `Menu`, `PointBar`, `pointEdit.ts`) |
| `src/papercraft.ts` / `src/pdf.ts` | the A4 templates and the dependency-free PDF writer. One set of drawing ops, rendered as SVG or PDF. |
| `src/stl.ts` | STL / ZIP export |
| `src/persist.ts` / `src/hooks.ts` / `src/route.ts` | localStorage + sanitize · undo-redo, autosave, responsive flag, language · the one page that has a URL |
| `src/GuidePage.tsx` / `src/PagePreview.tsx` / `src/Welcome.tsx` | the build guide · the cardboard route's print view · the first-run card |
| `src/index.css` | 17 rules — only what a utility cannot be. Everything else is Tailwind on the element. |
| `scripts/` | the gates above |

## Tech stack

Vite 8 + React 19 + three.js r185 + fflate, in TypeScript (`strict`). **Four runtime dependencies**;
keep it that way. Three consequences worth knowing before you edit anything:

- **Relative imports carry their real extension** (`./geometry.ts`, `./ui/controls.tsx`). Vite would
  resolve them without one, but the seven check scripts run under plain `node`, which strips types
  and does not map a `.js` specifier onto a `.ts` file. `allowImportingTsExtensions` permits it and
  `noEmit` is its precondition.
- **Node ≥ 22.18 is the floor** (`engines`, and the CI matrix), for that same reason.
- **The check scripts are `.mts` and are type-checked with everything else.** A corollary the
  compiler cannot state: **nothing a check script imports may be a `.tsx` file** — Node strips types
  but cannot compile JSX.

## Working conventions

- **Comments are in English.** Write units and intent for formulas and dimensions. Keep the reason,
  keep it to a sentence; the code says what, a comment says why.
- **Merging two ADJACENT `{/* … */}` blocks is a code change, not a comment change.** It removes an
  expression container from the emitted child list and changes the surrounding whitespace. If you are
  proving an edit is comment-only (transpile with `removeComments` and diff against HEAD), this is
  the one thing that will fail the check for a real reason — split them back into two containers.
- **UI strings are Japanese, and the Japanese IS the dictionary key** — so editing any user-facing
  wording means editing `EN` in the same commit. Run `check:i18n`.
- **Keep `src/geometry/` pure** (no React, no DOM), and never re-derive a dimension outside it. The
  section editor, the 3D preview, the STL and both templates all read the same functions, which is
  what makes what you see what you print.
- **Do not commit without being asked.** Report what passed and wait.
- **Privacy**: never write a path or username that identifies a personal environment into a shared
  document (README, PR bodies, issues). Use repository-relative notation.
