# CLAUDE.md

灯 Tomoshibi — a browser app that generates 3D-printable forming molds (harigata) for washi paper
lanterns. Editing the cross-section produces the STLs, or a full-scale A4 template for cardboard.

**Read [`docs/design-notes.md`](docs/design-notes.md) for the area you are about to change, before
you change it.** Most of what is in there is there because it was got wrong once.

## Commands

```bash
npm run dev       # Vite dev server, http://localhost:8173/ (strictPort: a clash fails loudly)
npm run build     # tsc --noEmit && vite build. Always confirm it passes.
npm run typecheck # just the type check — src, scripts and the Vite config in one pass
```

Node ≥ 22.18 is the floor: the seven check scripts are `.mts` run by plain `node`, which is also why
**every relative import carries its real extension** (`./geometry.ts`, `./ui/controls.tsx`).

## The gates

No test runner. Correctness is "the build passes" plus "the STL is watertight".
**Anything other than `0 FAIL` does not get merged.**

| gate | the failure it exists for |
|---|---|
| `check:manifold` | an open edge / non-manifold STL the slicer chokes on. ~2 min; run it after any `src/geometry/` change |
| `check:hash` | a "shouldn't change the STL" refactor that moved a vertex. Only comparable within one three.js version |
| `check:persist` | a corrupt saved file crashing the app or yielding a non-watertight koma |
| `check:paper` | a template that is not 1:1, is missing a part, or prints NaN |
| `check:glyphs` | a character with no outline, which is **dropped** — a blank on paper |
| `check:i18n` | a reworded label whose translation silently stopped matching |
| `check:style` | a font size off the scale; a class in the DOM with no rule behind it. **Needs `npm run build` first** |
| `lint` | a stale closure — the viewport rendering the design from three edits ago |

`check:style` and `lint` FAIL rather than skip when they have nothing to work with, on purpose: a
gate that quietly does nothing is worse than one that is missing.

## Do not re-litigate these

Each is settled, each was reverted at least once, each has its reasoning in the design notes.

- **The neck is always a vertical rectangle**, and its presence never changes the tab size.
- **The tab is a straight tongue** — no outward steps or hooks. Its one exception is the tab-tip dent
  that makes the koma stop; the shelf it replaced (`komaStop2D`) does not come back.
- **The rib's inner edge is hollowed only at the centre.** `RIB_CURVE_D` is not the knob for rescuing
  a silhouette that cannot be pulled back out of the lantern it shaped.
- **Grooves are evenly spaced across the whole lamp body**, barbs leaning toward the equator, with a
  half-pitch buffer at each opening.
- **The print-fit invariants are single definitions** (`innerRi` / `tabTipRi` / `notchR`): a reprinted
  rib fits a koma printed last month because both parts derive from the same function.
- **The papercraft cuts no grooves, opens no lightening windows and emits no stand**, and it skips the
  tab-tip dent (`noTabDent`) for tab strength.
- **The cardboard route's opening hoops are a BEND line, never a cut outline** — blue, empty `outline`,
  eyes gated on `ringLegs()` alone. `WIRE_D` is a constant, not a control.
- **The washi template is not an output method** — it ships with whichever route you pick, as its own
  PDF, on both.
- **The build guide is a page, not a view**, and it is generic: it prints no dimension, and states no
  quantity, that the design decides.
- **The print bed only exists on the STL route.**
- **The leg sockets are a checkbox, never dimensions.**

## Conventions

- **Import every shape from `src/geometry.ts`**, never from `src/geometry/*`, and keep that directory
  pure — no React, no DOM. The section drawing, the 3D preview, the STL and both templates read the
  same functions, which is what makes what you see what you print. Never re-derive a dimension
  outside it.
- **Comments are in English.** Units and intent for formulas and dimensions. The code says what; a
  comment says why, in a sentence.
- **UI strings are Japanese, and the Japanese IS the dictionary key**, so editing any user-facing
  wording means editing `EN` in the same commit. Run `check:i18n`.
- **Do not commit without being asked.** Report what passed and wait.
- **Never write a path or username that identifies a personal environment** into anything shared —
  README, PR bodies, issues. Repository-relative notation only.
