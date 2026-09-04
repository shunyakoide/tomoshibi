# Design notes — 灯 Tomoshibi

Why the mold is shaped the way it is, and which decisions are settled.

Most of this is here because it was got wrong once. The parts of a real forming mold have fixed
roles and fixed relationships, and several of the choices below were made, reverted, and made
again — so they are written down as decisions rather than as suggestions. **Read the section that
covers what you are about to change before you change it.**

`CONTRIBUTING.md` is the practical entry point (setup, the verification gates, how to open a PR).
`CLAUDE.md` is the short operating file an AI assistant loads; it points here for anything
substantive.

---

## Terminology and roles (read this first)

The real-world lantern-making process: **wind bamboo ribs onto the mold → paste on washi paper → once dry, disassemble the mold and pull it out**. This app is about 3D-printing that mold as separable parts.

> **Grooves are horizontal rings by default** (identical position across every rib). An optional **spiral winding** mode (`p.spiral`) offsets the grooves per rib (`step/boards` each) so the bamboo forms one continuous descending helix; because each rib is then a different shape, spiral molds export one STL per rib, each engraved with its serial number (7-segment through-cut). Each part's role is as follows (**these definitions and relationships are fixed — do not change them arbitrarily in the implementation or explanations**).

```
        ● koma (top)         ← gear-like hub that gathers and bundles the rib tabs
      ┌──┐  neck (top)       ← vertical rectangle whose only job is positioning the opening (optional)
      │  │
     ╱    ╲                  lamp body (hibukuro) = the lantern's body shape.
    │ groove→ │ ← bamboo rib  Surface of revolution the washi is pasted onto. Bamboo-rib grooves on the outer edge.
    │ groove→ │
     ╲    ╱
      │  │  neck (bottom)     ← top and bottom are independent (neckBot / neckTop)
      └──┘
        ● koma (bottom)
       ╱ ╲                   ↑ tab (tsume) = the straight tongue at the rib's end. Plugs into the koma.
      stand (2 posts + base)  Receives the koma in a U-shaped saddle, holding it clear of the floor.
```

| Term | Role / definition |
|---|---|
| **lamp body (hibukuro / 火袋)** | The lantern's **body shape**. The curved surface the washi is pasted onto. The curved portion **between** the outermost control points of the cross-section profile. Bamboo-rib grooves go here and only here. |
| **rib (haneita / 羽根板)** | The **radial plate** that forms the mold's surface (N of them, arranged like the segments of a mandarin orange). A flat plate printed lying flat. Its outer edge is the lamp-body curve (+ grooves), with a tab at each end. It assembles by plugging into the two koma (top and bottom). Its inner edge is a curve **hollowed inward only at the center** (`ribInnerX()`) — to make it easy to pull out through the opening after drying (the same intent as carving the inside of a real forming mold into a half-moon). Note: "rib" (haneita) is a coined term for this app. Real craftspeople don't name the individual parts; they count by plate count — "**6-plate, 8-plate, 10-plate mold**". |
| **bamboo rib (higo / 竹ひご)** | The thin bamboo **wound horizontally** around the outside of the lamp body. The lantern's horizontal rings. It seats along the grooves on the rib's outer edge. Also called "**higo / bamboo bone**" in the real craft. |
| **groove (mizo / bamboo-rib groove)** | The **V-notch** carved into the rib's outer edge. So the bamboo rib seats in and doesn't slip off, the barb (tooth tip) leans toward **the center = the equator**. **Evenly spaced.** None are cut at the neck (near the opening). In craftspeople's terminology this side groove on the forming mold is called "**higo-me (ひご目)**" (the finer the count, the finer the work). |
| **opening (kaikou / 開口)** | The **mouth** at the top and bottom of the lamp body. = the radius of the outermost control point. It is the edge of the washi and the position where the koma/tabs connect. In real work this rim corresponds to the "**opening ring (kuchiwa / 口輪)**". |
| **neck (kubi / neck)** | The **vertical rectangular collar** standing outside the opening. Its role is **"only" to set the position and size of the opening**. It is independent top/bottom and can be present or absent (`neckBot`/`neckTop`). **Always a rectangle — never angled.** **The presence of a neck does not change the tab size.** Without a neck, the opening becomes the tab size. The neck carries no bamboo rib, no groove, and no washi. |
| **tab (tsume / tab)** | The **straight tongue** at the rib's end. It plugs into the koma's notch. Width = **board thickness `boardT`** (nominally equal to the koma's notch width). Only the notch side adds the **print tolerance `fit`** to become `boardT + fit`, leaving a real-world fit clearance (the tab itself stays `boardT`). No **outward** steps, hooks, or protrusions. **Both tabs** have an **L-notch dented into the tip's inner corner** (`TAB_DENT_W`×`TAB_DENT_H`), which the koma's shallower notch mates with: the wider tab base then catches the koma's solid hub and stops it sliding inward. In a lantern maker's mold there is no neck and "tab = neck" (which is why the neck is an optional design element). |
| **koma (コマ)** | The **small gear-like hub** that gathers and bundles the tabs (two of them, top and bottom, completely identical). Notches around the rim where the tabs plug in. Outer diameter = `komaR`. The stand receives it. This is a **real craft term**; in the trade it is also called "**kagami (mirror / 鏡)**" (the forming mold is assembled and fixed by inserting it into the grooves of the top and bottom koma = kagami). |
| **stand (dodai / 土台)** | The **base** that supports the assembled mold. Two **posts** of constant thickness receive the koma's rim in a U-shaped saddle, and a single base plate holds the posts at the correct spacing. Fully flat, needs no print supports. Users often reuse it (they don't print it every time). |
| **opening ring (kuchiwa / 口輪)** | **The one exported part that is not part of the mold** — it stays in the finished lantern, which has no koma left in it once the mold is pulled out. A thin flat hoop (`ringGeometry`, `RING_WALL`/`RING_H` = 2mm) glued around the opening to hold it round, sized from `openingR()` so it follows the design like every other part. The **bottom** one also carries the **leg sockets** (see below); the top one is a plain hoop. |
| **leg socket (脚ソケット)** | The **flat "onigiri" pads** inside the bottom opening ring — `LEG_N`=3 of them at 120°, each pointing its rounded vertex at the centre with a **bore** (`LEG_D`=6mm) at its middle that a leg rod pushes into. This is what makes the bottom ring double as the base of a **stand for the finished lantern**. Each pad's two outer corners stay sharp and overlap the hoop's inner rim by `LEG_OVERLAP`, so the whole thing prints as one piece; the pads are the same height as the hoop (flat, no supports). Presence is `p.legSockets` — **a checkbox, not dimensions** (see below). |

**Assembly relationships**: rib (tab) → plugs into → **koma** → sits on → **stand**. (The **opening ring** joins nothing here — it belongs to the finished lantern, after the mold is taken apart.) The bamboo rib winds into the **grooves** on the rib's outer edge. The rib's outer edge revolved forms the **lamp body** surface onto which the washi is pasted. The **neck** positions the opening (a vertical rectangle) and is **independent of the tab size**.

## Coordinate system and units

- **All dimensions in mm.** Ribs/koma/stand are a **Shape on the XY plane + extruded along Z** (= oriented for flat printing as-is).
- `outerR(p, t)`: height-normalized `t∈[0,1]` (0 = bottom, 1 = top) → outer radius in mm. The heart of the profile.

## Profile model (important)

The silhouette is a radius function connecting the **control-point array `p.pts = [{t, r, sharp?}]`** (ascending) via **monotone Hermite interpolation** (Fritsch–Carlson, `fukuroTangents`/`fukuroSpline`). To suppress warping and unwanted sharp curves, tangents are clamped to the same sign as the adjacent chords and to within 3×.

- **The outermost control points (`pts[0]` / last) = the opening = the neck radius.** Matching them here removes any wasteful flare (S-curve) from the neck into the lamp body.
- **The neck (kubi)** = a **vertical rectangle** outside the outermost control point (always a rectangle — never angled). Presence is independent top/bottom via `neckBot` / `neckTop`. The neck's height and overhang are adjusted with the ◇ handle in the section view (horizontal = overhang / vertical = neck height).
- **The lamp body (hibukuro)** = the curve **between** the outermost control points + bamboo-rib grooves. `fukuroRange(p)` gives its t range.
- **The design reference for the neck and tab is "the control-point radius"** (`openMin`/`bodyMinR`), and it **does not depend on whether the neck exists**. Toggling the neck does not change the tab (koma) size. On the side without a neck, the opening becomes the tab size (`komaR`).

## How big may a design get (`LIMITS`)

`src/config.ts` holds one table — `LIMITS = { height: [60, 2000], r: [10, 600] }`, in mm — and **everything that clamps a silhouette value reads it**: the section editor's ◇ drag and its `+` ghost, the typed radius field, the height scrub row, and `persist.ts`'s sanitize. Four separate copies is how you get a design that snaps back the moment you touch it somewhere else; the old code had exactly that (the editor clamped radius to 130, persist to 140, and persist's floor was 8 where the editor's was 10).

- **The floors are geometry. The ceilings are not.** `r = 10` is the wall: below it the opening is narrower than the rib's own core (`innerRi`), so the tab is wider than the mouth it has to come out of. Every height from 30 to 2000mm fails at r=8 and passes at r=10 — it is not a preference, and `check:manifold`'s cylinder family exists to keep it honest. The ceilings only stop a corrupt file or a fat-fingered typed value from asking for a metre-per-mm lantern; `check:manifold` sweeps the whole box watertight, and a festival 大提灯 is about ⌀1m, so ⌀1.2m is headroom, not a design decision.
- **These used to be 140–400mm and 10–130mm, and the wall was reachable by hand** — dragging a ◇ simply stopped. Widening them is what surfaced the slope-dependent lightening-window bug (see "STL watertightness" below), which was already reachable inside the *old* caps (a barrel scaled to r=130 at h=140 reaches dR/dy = 4.4) and invisible because nothing in any sweep scaled the control points.
- **The section view fits both axes**: `s = min(2.0, 520/H, (CX-30)/maxRadius(p))`. The first two terms are unchanged, so nothing that fitted before is redrawn at a different size; the width term only ever makes it smaller. Without it a wide, low body runs off the sides of the frame, taking the ◇ you are dragging with it. The 3D views needed nothing — `frame()` already sizes itself from `maxRadius(p)` and `p.height`, far plane included.
- **The height scrub row is non-linear** (`curve: 2.5` — see ScrubRow). Over 60–2000mm a linear slider spends 93% of itself above the sizes anyone builds; the curve gives 60–400mm half the bar, and one arrow-key step is still ~1mm at 205mm. Don't widen a range past a few multiples without it.
- **A bed-overflow hint of "→ reduce the body height" is only true when some height fits.** `heightLimit` returns 0 when none does — a ⌀1.1m rib overflows a 256mm bed at *any* height, and the parts are too wide, not too tall.
- **`T_GAP` (0.04) is in `config.ts` beside `LIMITS`, not in the UI that clamps with it.** It is the same kind of thing as the three ranges above — the editor enforces it, `persist.ts` re-enforces it on a file the editor did not write, and `check:manifold` sweeps down to it. While it was a module-private `const` in `ui/pointEdit.ts` **no gate could read the floor it needed to corner**, and that is not a small thing: a silhouette packed to exactly `T_GAP` with a ±20mm radius swing extruded a rib with open edges, reachable by DRAGGING ALONE, while every gate printed `0 FAIL`. Same argument as `innerRi` / `notchR` / `tabTipRi`: one definition, so both sides agree.
- **`LIMITS.pts` and `T_GAP` are enforced on load, not only in the editor.** `validatePts` clamped `r` and `t` and nothing else, so a hand-edited or foreign `config.json` restored with 30 or 50 control points and handed the slicer a rib with 18 or 48 open edges. It now **thins** rather than rejects — points closer than `T_GAP` are dropped, then the count is cut to `LIMITS.pts[1]` keeping both ends, because the first and last points ARE the openings. Thinning keeps the promise `sanitizeSaved` makes everywhere else: salvage the design, do not throw it away.

## Design rules (repeatedly raised points — fixed items so they don't need re-explaining)

Always obey the following when changing the shape. Removing these has caused reverts in the past:

- **The neck is always a vertical rectangle.** No slanted taper or angle. Its only role is positioning the opening.
- **Do not change the tab (koma) size based on whether a neck exists.** The neck widens the opening outward. Without a neck, opening = tab size.
- **The tab is a straight tongue.** No **outward** steps, hooks, or protrusions (the outer edge matches the koma outer diameter `kR` exactly and does not stick out).
- **Exception: the koma stop = the tab-tip dent** (added by reference to a real paper-lamp mold). **Both tabs** get an **L-notch cut out of the tip's inner (small-radius) corner** — `TAB_DENT_W`=6mm radially × `TAB_DENT_H`=6mm along the tab. The tip's inner edge pulls in to `innerRi + TAB_DENT_W` while the tab **base** stays at `innerRi`, and the koma's notch bottom is set to that same dented radius (`tabTipRi` → `notchR`), so **the wider tab base catches the koma's solid hub** and the koma cannot slide inward toward the lamp body.
  - **The koma is pulled out "outward" (toward the tab tip) after work.** The catch is a single inward step, not a clamp from both sides → nothing to ride over, so insertion/removal stays free. Blocking this makes the mold impossible to disassemble.
  - **The catch cannot drift between the two parts**: `ribOutline2D()` (which cuts the dent) and `komaShape()` (which cuts the notch) both derive from `tabTipRi()`. Change one and you change both.
  - `tabDented(p)` decides whether there is room (needs `tabLen > TAB_DENT_H+1` and `komaR - innerRi > TAB_DENT_W+2`); with no room it falls back to a plain straight tongue + full-depth notch. **`p.noTabDent` forces that fallback** — the cardboard papercraft sets it (see below).
  - Nothing here moves the stand: the dent only reshapes the tab tip, and `komaR()`/`standSlotSep()` do not depend on it.
  - **History**: this replaced an earlier "inward shelf on the top tab only" (`komaStop2D()`), which was removed. Don't reintroduce a shelf.
- **Tab width = board thickness `boardT`** (nominally equal to notch width). Notch width = `boardT + fit` (`fit` = print tolerance, added in `komaShape()`). Rather than "cramming it tight", match nominally and leave only the real-world clearance `fit`. With `fit=0` there is no gap, as before.
- **Hollow the rib's inner edge "only at the center"** (`ribInnerX()`). Real paper-lamp molds have this shape, to make the rib easy to pull out through the opening. **Do not bend the whole rib** (bending it end-to-end makes an impossible shape / a constant-width band gives an opening ≫ koma shape that never reaches the tab, splitting the rib in two). The top and bottom ends stay at **core `Ri`**, so the connection to the tab is unchanged. The hollow amount is the center depth × `RIB_CURVE_D`, which is **0.3** — deliberately deeper than the ~20% a real mold scoops, to favour getting the rib out. **It does not propagate to the outer edge, grooves, tab, koma, or stand** (only the inner material is reduced).
- **The groove's barb (tooth tip) leans toward the center = the equator** (not toward the opening). Do not place grooves right next to the opening; leave a half-pitch buffer (barbs at the very end don't work).
- **Grooves go evenly spaced across the entire lamp-body curve.** The curve always needs grooves.
- **Curves stay smooth.** Do not create wasteful sharp curves or S-warps derived from the control points (matching the outermost control point = the opening removes the flare at the neck).
- **Don't casually change the height or the stand.** Users reuse the stand. Dimension changes propagate to the joints (below).
- **The ribs have to come back out.** A rib leaves through one of the two openings, so the mouth's plane cuts **across** the plate — and because the plate's outer edge is single-valued in y, that cut is exactly one horizontal slice of the plate in its own frame, whatever angle it is held at. So what has to pass is the **band** (`outerR(y) − ribInnerX(y)`, worst over the body), not the plate's distance from the axis, and it has to fit the rectangle-in-a-circle bound `√(band² + boardT²) ≤ 2R` at the **wider** mouth. That is `ribPullFit(p)` in `geometry/rib.ts`; `PULL_CLEAR` (2mm) is practical slack on top of it, not part of the maths. The tabs never bind (they span `Ri..komaR`, and `komaR ≤ openMin`).
  - **It warns; it does not clamp.** Every way out — a wider opening, less bulge, more scoop — is a silhouette decision, and the app has no business picking one. It is the only viewport alert about a design that cannot be **built** rather than one that cannot be printed or cut, which is also why it is the last thing anyone would find out on their own: everything prints, fits the bed and is watertight, and you learn about it with a dry lantern in your hands.
  - **It belongs to both routes**, unlike the other two alerts — a cardboard mold comes out of the same hole — which is why the bottom-right corner became a stacked column instead of two mutually-exclusive cards (`Alert` in `TomoshibiStudio`).
  - **Deepening the scoop is the tempting fix and is not this one's to make.** `RIB_CURVE_D` is a fixed proportion of the rib's own depth (see "Design rules" above and `ribInnerX`), and raising it to rescue a silhouette would move every STL the app has ever exported.

## Part joints (invariants for printing and assembling)

The mold is **rib × N + koma × 2 + stand**. Whether a reprint "fits the previous koma/stand" is determined by these values:

- **Rib tab ↔ koma**: board thickness `boardT` (the tab's thickness; notch width is `boardT + fit`) / `innerRi` (tab tip = notch-bottom radius) / `boards` (tooth count). If these three are the same, the tab plugs in to the same depth. `fit` only adds tangential fit clearance and does not affect engagement depth. `komaR` (koma outer diameter) only sets the koma's outward overhang and does not affect engagement.
  - **Implementation**: this engagement is **consolidated into the single function `innerRi()`** (`src/geometry/profile.ts`). Because `ribOutline2D()` (which makes the tab) and `komaShape()` (which cuts the notch) **call the same `innerRi()`**, the tab-tip depth and the notch bottom necessarily match. The only place that can break this invariant is `innerRi()` alone. Check the impact on both before touching it.
  - **Tab depth (engagement) and stand independence**: `innerRi()` is the legacy reference `nominalRi()` deepened toward the center by `TAB_DEEPEN` (tab tip / notch bottom). Meanwhile `komaR()` is based on `nominalRi()`, so **deepening the tab does not move komaR = the stand dimensions**. To prevent the wall between adjacent tab notches from getting thin and non-manifold from over-deepening, `ribCoreFloor()` (computed from the minimum inter-tooth wall thickness MIN_WALL) imposes a center-side limit.
  - **Notch bottom `notchR()` is also shared**: `komaShape()` (which cuts the notch) and `ribOutline2D()` (which cuts the tab-tip dent) both trace back to `tabTipRi()` → `notchR()`. With a dent the notch is **shallower** (its bottom sits at the dent radius) and the tab base, further in at `innerRi`, is what catches the hub. The deeper `TAB_DEEPEN`, the less room `tabDented()` has to find (both fight over the same inner space).
- **Koma ↔ stand**: `komaR` (saddle receiving radius = `komaR + SADDLE_FIT`) / `komaT` (koma thickness = post thickness) / `standSlotSep(p) = height + 2*tabLen - komaT` (post spacing) / `maxRadius(p)` (post height = floor clearance).
  - **Implementation**: `komaR()` (koma side) being called by `standGeometry()` (stand side) is **the single cross-edge bridging koma ↔ stand**. The post height traces back through `standSaddleH() → maxRadius() → outerR()`, so it **depends on the profile core `outerR()`** ⇒ changing the profile automatically moves the stand dimensions too (the substance of the caveat below).
- `komaR`/`tabDepth`/`innerRi` are based on the smaller opening (`openMin`). Note that **changing the opening radius changes the koma size**.

## Leg sockets on the bottom opening ring

The bottom ring doubles as the base of a stand for the **finished lantern**. Fixed items:

- **This was removed once (`f8447e2`, 2026-08-19) and put back deliberately.** That commit dropped the pads on the grounds that "the stand they were for is still undesigned", and left the ring a plain hoop with a marker tab. Do not remove them again on that reasoning: an undesigned stand is a reason to leave the sockets alone, not to delete the only feature that lets one exist.
- **The dimensions are CONSTANTS and stay constants (`LEG_N` / `LEG_D` / `TRI_R`).** The design says only **whether it wants sockets** — `p.legSockets`, one checkbox, and it ships **off**: standing the finished lantern on legs is one of the guide's three ways to light it, and the other two want a plain hoop. A missing flag reads as off too — in `sanitizeP` (via `DEFAULTS`) and in `ringLegs` alike, which is what keeps a restored design and its ring saying the same thing. They were never settings, and a leg count and rod diameter are not two more things to tune: a lantern either stands on legs or it doesn't, and a rod gets trimmed to the hole rather than the hole opened to the rod. Numeric controls for these were tried once and taken straight back out; don't re-add them.
- **`ringLegs(p)` is the single answer to "are there sockets".** `ringGeometry` and the inspector both call it, so the panel cannot claim sockets the part does not have. It returns `null` when the flag is off, and on the two ways the pads run out of room — the inward vertex crossing the ring's axis (`PAD_CORE`), and neighbours touching (`PAD_GAP`) — and the ring then falls back to a plain hoop. The small-opening case is reachable inside `LIMITS`: at the ⌀20 floor the pads fold through each other.
- **`ringLegsFit(p)` asks the second question without the first.** "You turned them off" and "they will not fit here" are different sentences and only one of them is news, so the hint appears only when the design asked for sockets and the opening refused.
- **The marker tab is cut exactly when the sockets are not.** Its whole reason is that the two rings would otherwise be the same hoop in two sizes (the barrel preset's rings are ⌀116 vs ⌀108). With sockets there is nothing to confuse, and the tab reaches 1.35mm past the nominal opening — a cost with no benefit. One `if`, not two independent decisions.
- **Verification is `check:manifold`'s leg-socket section, and the bore test in it is not optional.** The pads are separate closed shells merged into the hoop, so **edge counting is blind to a bore that got filled in** — the shell stays closed and a ring you cannot put a leg in passes. So it shoots a ray up each pad's middle and counts the faces over it (0 = open, 2 = capped), plus the two geometric conditions `ringLegs` exists to enforce and the fact that the flag being off really does cut nothing.

## STL watertightness (mandatory verification)

The ribs, koma, and stand must be **watertight (closed manifold)** or the print slicer breaks. After touching geometry, verify by sweeping across a representative parameter range. The test is the "shared count of undirected edges":

- 2 = closed (normal) / 1 = open edge / >2 = non-manifold. Additionally, no NaN vertices and no degenerate (zero-area) triangles.

**Verification is `npm run check:manifold`** (`scripts/manifold.mts`): 3 presets × height / bamboo-rib diameter / pitch / board thickness / tolerance / plate count, **41,472 parts**, plus five narrower sections — Bézier handle editing, spiral winding, the **silhouette extremes** (the corners of `LIMITS`; the only section that scales the control points, so the only one that sees a steeply sloped face), the **control-point spacing and count** (below) and the **bottom ring's leg sockets** (the only section that runs `legSockets` off, and the only one that tests a hole AS a hole rather than as a closed shell). Anything but `0 FAIL` does not get merged.

| gate | covers | the failure it exists for |
|---|---|---|
| `check:manifold` | every part, swept | an open edge / non-manifold STL the slicer chokes on |
| `check:hash` | vertex hashes before vs after | a "shouldn't change the STL" refactor that moved one |
| `check:persist` | corrupt localStorage | a bad saved file crashing the app or yielding a non-watertight koma |
| `check:paper` | papercraft + the washi template | a template that is not 1:1, is missing a part, or prints NaN |
| `check:glyphs` | the characters those PDFs print | a character with no outline, which is **dropped** — a blank on paper |
| `check:i18n` | UI wording | a reworded label whose translation silently stopped matching |
| `check:style` | the type / corner scales, the palette, every class | a font size off the scale; a class in the DOM with no rule behind it |
| `typecheck` | `src`, `scripts`, the Vite config | — (also the first half of `npm run build`) |
| `lint` | the two React hook rules only | a stale closure: the viewport rendering the design from three edits ago |

Four things about those gates are not obvious from running them:

- **Do NOT add material disposal to `buildScene`'s teardown. It was measured, and it costs.** The loop disposes geometries and leaves materials alone, which reads like a leak: `higoMat`, `legMat`, `plateMat` and every GridHelper's line material are made fresh on each build, and a build runs on every change to `p` — every frame of a slider drag. But three shares shader programs through a cache keyed on the material's CONFIGURATION, refcounted by `usedTimes`. Those four are configured identically every time, so nothing new is compiled: over 30 rebuilds, `createProgram` and `deleteProgram` were both called **zero** times (counted at the WebGL context, headless). What "leaks" is a refcount that never reaches zero, holding no GPU memory; the material objects themselves are ordinary garbage. Add `dispose()` and the refcount DOES reach zero, the program is deleted, and the next build recompiles it — the same 30 rebuilds became **+6 created / +6 deleted**, paid on the drag path. If you touch this, note that any shared material must be excluded anyway, and the handle's own fields are the way to find them.
- **`check:hash` covers the opening rings too, and did not always.** It hashed rib / koma / stand / board while `ringGeometry` went unhashed, so a change in `geometry/ring.ts` could move every ring vertex and still merge as "zero hash diff" — the one gate whose whole job is proving a refactor changed nothing, blind to two of the parts it ships. 1,152 lines became 1,728, the existing 1,152 byte-for-byte unchanged. Two figures elsewhere in this file say "1152 parts": both are records of what was measured at the time and are left alone.
- **`check:hash` is only comparable within one three.js version.** It hashes the position array in order, so an upgrade that merely flips which diagonal splits a quad rewrites every hash while the solid is untouched (r169 → r185 did exactly that to `boardGeometry`). Across an upgrade, compare order-insensitive quantities — triangle count, signed volume, surface area, bounding box.
- **`check:i18n` exists because the dictionary is keyed by the Japanese string itself**, so rewording a label does not make its translation stale, it DELETES it. The script pins four shapes of that drift: a Japanese UI string with no EN entry, an **orphaned** EN entry whose key appears nowhere in `src/`, a `{placeholder}` present on only one side, and a **duplicate key** — which JS resolves silently in favour of the last one, and which had quietly retranslated 「和紙」 and 「竹ひご」.
- **`lint` runs only `rules-of-hooks` and `exhaustive-deps`** (see `eslint.config.js` for why not `recommended`). A dependency array that disagrees with its body is the one bug class here that is invisible in review AND invisible to every geometric check. Opting out is fine, opting out silently is not: both exemptions carry an `eslint-disable` with its reason. Its `files` is `src/**/*.{ts,tsx}` and its parser is typescript-eslint's, and neither is cosmetic — ESLint cannot READ a `.ts` file without the parser, and a `files` pattern that matches nothing reports "0 problems" exactly as loudly as a clean run. **The one way this gate can fail is by going quiet.**
- **`check:style` needs `npm run build` first** (only Tailwind knows what it generated), and it FAILS rather than skips when `dist` is missing — for the same reason.

Past failure causes and fixes: grooves too deep (→ cap depth at `higoD*1.5`), near-duplicate points on the barb's sharp flank (→ clean duplicate points before extruding), single-control-point presets (→ div-0 guard in `splineR` / denominators), a thin strip remaining in the lightening window at a waist (→ shrink/drop the window where it's thin), **the lightening window cut straight through a groove on a steep face** (→ the band is slope-aware; see below), and **the outer edge folding through itself where the profile turns sharply** (→ the notch backs off until it doesn't; see below).

**The outer edge may not cross itself, and non-monotone is NOT the test.** The notch is offset along the surface normal, so its tip travels in y as well as in x. Where the profile turns sharply — control points at `T_GAP` with a large radius swing, or a short body with one — that travel outruns the flank's own y half-width and `grooveOuterPts`' outline folds back **through** itself; the extrusion opens edges and the slicer refuses the file. `grooveOuterPts` now returns full depth first and only backs the depth off, in steps, while a **proper segment crossing** remains.

Three things about this are worth keeping:
- **It is detected, not predicted.** The closed-form threshold (`depth × |slope|` against the flank half-width) fires on shapes that are perfectly sound, because **a non-monotone outline is the normal state here** — the undercut is the entire point of the notch, and all three presets are non-monotone (egg 24 backward steps, barrel 16, hiramaru 32) while watertight. Backward-step count and magnitude both fail to separate pass from fail; a proper crossing separates them. Measured over 1,440 silhouettes: no open-edge case lacked a crossing (648 positives, 0 counterexamples), and one crossing case was watertight anyway — so the test is conservative in the safe direction.
- **Depth, not width, is the lever.** A shallower V keeps the same footprint on the surface and still catches the bamboo; a narrower one stops being the undercut it exists to be. Uniform across grooves, because `grooveDepth` is one number by design.
- **The scan is a short window, not the whole outline.** Every fold observed sits inside ONE groove's own flanks and spans at most 7 samples, so `foldsOver` looks 24 samples ahead. `check:manifold` calls this tens of thousands of times; O(n²) over 450 points would not be affordable.

`check:hash` is the receipt: **all 1,152 parts are byte-identical**, because a silhouette that does not fold is returned at full depth untouched. And the new sweep is not vacuous — reverted to the old `grooveOuterPts` it reports **108 FAIL** out of its 2,592 checks, including combinations tighter spacing alone would not have found (`egg n8 gap0.10 swing20 h60`: a short body, not a packed one).

**The papercraft is not affected.** `src/paper/mold.ts` cuts the rib with `{ smooth: true }`, which reaches `grooveOuterPts` with an empty groove list — `dip` is always 0, so the fold cannot arise and the cardboard outline never had it. The 3D preview does build the grooved rib on the cardboard route (`three/scenes.ts`), so before this fix the broken shape was visible on screen there while nothing broken was ever exported.

**The lightening window's band is not a constant, and must not be turned back into one.** A groove is cut along the surface NORMAL (`grooveOuterPts`), so its tip does not land `depth` inside the smooth edge — it lands `depth × √(1+slope²)` inside, measured **in x at the tip's own height**, because the normal's y-component drags the tip up a face that is itself climbing in x. `lightenHoles2D` therefore takes `band(y) = max(bandW, grooveDepth(p) × √(1+slope²) + BAND_SOLID)`, worst slope over ±1.5mm so the 2mm chords between window samples cannot cut a corner either. `bandW` (11mm) stays the floor, so every design that was already clear of the notch keeps the exact window it had — 1144 of the 1152 parts `check:hash` covers are byte-identical; the 8 that moved are `barrel h140 higoD3`, whose surviving strip was **0.2mm**. `grooveDepth()` and `profileSlope()` live in `geometry/groove.ts` and are shared with the cutter for the usual reason: the window and the notch have to be talking about the same groove.

**Two kinds of earcut degeneracy (you will always hit these as you increase the point count; handled by `cleanPoly()` and `Y_STAGGER`)**:
- **Collinear points**: sampling the curve finely lays hundreds of "points on the same straight line" along a flat span. The side walls are built exactly along the point list, but **earcut drops collinear points**, so the boundary between cap and side wall shifts and becomes an open edge. → `cleanPoly()` thins out collinear points in addition to duplicates. **Apply it to both the outline and the lightening window** (the window side originally had no cleaning, and that was the hole).
  - **Implementation**: the point-list → `THREE.Shape` conversion is **consolidated into the single function `shapeFromPts(pts, holes)`** (`src/geometry/shape.ts`), which always applies `cleanPoly()` to both the outline and the holes. Build extrusion Shapes through here (writing it by hand forgets the cleaning and hits the degeneracy above — in fact `ribBandShape` had a copy of the cleaning that was missing only the collinear-point removal).
- **Same scanline**: if a lightening window's y-end lands at exactly the same height as an outline sample (`STEP=0.5mm`), the window corner and the outline vertex become collinear, producing a **zero-area triangle** and an open edge. → `Y_STAGGER=0.13` shifts the window's y-ends off the grid (`boardGeometry`'s `STAGGER=0.1` is the same fix).

## Papercraft (building from cardboard)

So it can be built without a 3D printer, the app lays each part's 2D outline out at **A4 full scale (1:1)** as a PDF (`src/papercraft.ts` → `paperPDF(p, matT)`), downloaded from the print view as `tomoshibi_katagami.zip` **with the washi PDF beside it** — one download per route, the same shape the STL kit's ZIP has.

- **The template PDF is the mold — ribs and koma — plus the two opening hoops** (see "Opening hoops on cardboard" below). The washi panel is the other file in the ZIP, never pages spliced into this one.
- **It is a PDF, and it used to be a self-contained HTML page.** That page carried a screen-only preamble (print at 100%, no margins, fit-to-page off) every line of which existed BECAUSE the medium was HTML. A PDF is already A4 at exact size, so only the printer's 100% setting is still worth saying, and it is the one line `KitNote` does not fold away. Do not reintroduce an HTML route to get Japanese labels back — see `pdf.ts` for how they print now.
- **The shape comes only from `geometry.ts`'s pure functions.** Do not reimplement a dimension on the paper side; if this drifts, the papercraft and the STL produce different molds.
- **Don't cut the grooves (higo-me).** You cannot carve a 0.5mm V into cardboard, so the outer edge is cut smooth (`ribOutline2D(p, k, { smooth: true })`) and the bamboo positions are marked with **dashed ticks** from the same `grooveList()` as the STL.
- **Don't open lightening windows.** Cardboard is light, and they only weaken it and add cutting work.
- **Material thickness `matT` goes to every part identically** — `{ ...p, boardT: matT, komaT: matT, fit: 0 }` — so the parts always mesh. Do not change the 3D side's `p`. `fit: 0` because cardboard fibres crush as it goes in, so a nominal-exact fit meshes more firmly. Thick material exceeds `maxBoards`, so the rib count is **trimmed** and the page says so.
- **Cardboard skips the tab-tip dent** (`noTabDent: true`). The dent takes 6×6mm out of the tip's inner corner, which on cardboard is exactly where the tab is weakest — it tears along the flutes when pushed in. It trades the koma stop for tab strength and takes a full-depth notch; the koma is located by friction, which `fit: 0` makes enough. `check:paper` asserts `tabDented(pk)` is **false** for every combination.
- **The "koma wall is too thin" warning belongs to the APP, not the printed page.** The wall between the koma's notches (`paperFit(p, matT)`) thins as material thickens until it tears when hand-cut, and every way out of it is a control in the app — so a warning on the sheet arrives after the sheet in your hand is already the wrong one. It is a **viewport alert**, in the stacked column it shares with the bed-overflow and pull-out ones. The rib-count clamp stays on the page, because that one states what the template you are holding contains.
- **Don't output a stand.** The papercraft is the mold only (ribs + koma); the user provides their own. A cardboard cross stand was generated once and removed at the user's request. The 3D-print stand is unaffected.
- **Pages split DOWN only, so a part wider than the content column is CLIPPED — and that must never be silent again.** `layout` orients each part once (rotating it 90° if that makes it fit across) and, when neither way round fits, places it at `x = 0` anyway; `pageOps` then clips to `CW` and the overhang is gone, with no seam, no extra sheet and nothing on screen. An egg preset scaled ×3 (⌀564, well inside `LIMITS.r`) loses **72mm off every rib**, and the washi panel starts losing width at ⌀250 on four ribs (`π·R/N + side > CW`), a document with **no preview at all**. The UI said the opposite in so many words — 「大きさの制限はありません」 — and that clause is gone; the sheet-joining sentence stays, now ending "続くのは縦方向だけです". `layout` records the offending parts as `Overflow { name, w, over }`, `templateOverflow` collects them for whichever documents the route ships, and it surfaces as a viewport alert beside the bed-overflow and pull-out ones. **Continuing a part sideways is a different feature** — it needs horizontal seam codes and an assembly order the current half-diamond vocabulary does not have. Until it exists, the alert is the honest answer; do not re-add a "no size limit" claim to get the sentence back. **A second copy of it survived that sweep** — the welcome card’s route button read 「大きさの制限なし」, a different wording that the grep for the first one missed, and it is the sentence someone reads *before* they have a design that could raise the alert. It now says 「縦につないで大きく」, which claims the axis that is actually unbounded.

- **A part keeps `EDGE` (3mm) clear of the trim box, and that white travels with its ROW.** Without it
  a part is placed at the content column's own origin and its cut line lands exactly on the blue trim
  line: black over blue, nothing for a blade to clear, and no telling which of the two lines you are
  meant to follow. 3mm is half of `GAP`, so the sheet's edge is as far from a part as a neighbouring
  part's edge is — the trim box is simply another neighbour. It is carried as part of the row's
  height (the row is `EDGE` taller, its parts sit `EDGE` down inside it) and **never as a page-space
  offset on `y0`**: a page that CONTINUES a row is a seam, and padding that would open a 3mm break in
  a spanning part's cut line at the very join the two sheets are butted on. `CW` stays the trim
  width — the frame, the clip and the join diamonds are drawn to the paper, not to the column — and
  only the packing and the overflow test read `colW = CW - 2·EDGE`. Measured over the sweep: **zero**
  extra sheets.

**The full-scale check mark is an L — a try square, not a bar — and it goes wherever the layout already leaves room.** Shrinking under "fit to page" is the biggest source of accidents and this is the only way to catch it with a ruler; one mark answers for the whole job, since a printer scales every page alike. It is drawn thick (the `scale` style, 0.6mm) so a ruler's edge has something to line up against.

- **Two arms, because a printer can scale the two axes differently and a horizontal bar cannot see that at all.** This is why every printable sewing pattern prints a *square* rather than a line ([Seamwork](https://help.seamwork.com/hc/en-us/articles/360004182294-The-test-square-on-my-digital-pattern-is-too-small), [Sussex Seamstress](https://www.sussexseamstress.com/sewing-tips-blog/how-to-print-and-assemble-pdf-sewing-patterns)). Do not reduce it to one line.
- **An L rather than a full square, because the two axes do not cost the same**: width is free, height comes straight out of the parts. The long arm (3in) goes across, the short arm (3cm) down. Over the `check:paper` sweep a full 3in square costs **800 sheets against 712**.
- **Both units ride the SAME arms** — a tick where the metric figure falls and another where the imperial one does (`5cm`/`3in` across, `1in`/`3cm` down). Patterns normally print one square labelled "10cm (4in)", but **4in is 101.6mm**, so that label is wrong by 1.6mm and the reader cannot tell which unit it is true to. **Don't pair 5cm with 2in**: 2in is 50.8mm, near enough that someone checking with an inch rule reads "just under 2in" and believes a bad print is fine.
- **`scaleSpot()` places it, not `pageOps`** — it is a mark, not a part, so it goes in room the layout has ALREADY left, and most designs finish with half a sheet blank. Parts are tested by **bounding box**, deliberately conservative: printing the one mark the sheet's scale is judged by across a cut line is worse than spending a page. Over the sweep it lands on sheet 1 for 232 designs and sheet 2 for 128, and the template prints **712 sheets**.
- **`TOPBAR` (36mm) is the fallback, not the plan.** When nothing fits anywhere, sheet 1 gives up that strip. Keep both halves: reserving it unconditionally cost **736** sheets, and the version before that only looked for gaps and silently shipped **16% of designs with no check square at all**. Neither failure is visible in the app — you find out with scissors in your hand.
- **Ticks run inward off their arm**, since outward ones can reach past `MARGIN`, outside the printable limit `MARGIN` is set to.
- **`TOPBAR` shifts the CONTENT down, never the frame.** The frame is the sheet's trim box and has to land in the same place on every sheet to be a reference at all. `ft = joinsPrev ? y0 : MARGIN` is what keeps those apart.
- This strip replaced a `FOOTER` band that took 14mm off EVERY page. `FOOTER` is 0 now. Measured over the sweep: **761 sheets → 726** once `MARGIN` came in to 5, and **→ 712** once the check square stopped reserving a strip.
- **Nothing else is printed per sheet — no title, no page number.** The seam codes already say which sheet meets which. **A part is split across sheets only when it doesn't fit on one page**: layout is (1) pack parts into rows, (2) pack rows into pages, and a row that fits on one page is never straddled. Each page is clipped `top`〜`bot`, where `bot` is `top+CH` if the next page continues the same row and the next page's start otherwise — without that distinction the head of the next row prints onto the previous page's bottom edge and a seam appears where nothing is joined.

**Sheets are joined by a blue frame plus coded half-diamonds — the convention home-print sewing patterns use** (`STYLE.frame` / `STYLE.join` / `STYLE.jlabel`, all `#1769c8`; blue on a pattern sheet reads as "align", never as "cut"). Four rules, each load-bearing:

- **The trim box is drawn identically on EVERY sheet**, seam or not — it is a fact about the paper. Each edge runs the whole width or height rather than closing into a box: lay two sheets up and the upper covers the lower's corners, which is exactly where a box keeps all its information, and only a long line makes a small angular error visible.
- **Sheets BUTT at the trim box; there is no glue tab, and there must never be a second line.** A glue tab necessarily puts the join a centimetre inside the trim edge, so every seam carries two blue lines a centimetre apart — one to cut on, one to align on — and no drawing makes that pair unambiguous. One line does both: cut both sheets on it, butt the cut edges, tape from behind. A seam is therefore read from the ROW (`next.row === row`), not from an overlap. `check:paper` pins every horizontal frame line to `MARGIN` or the trim edge; a third value means a line is marking something that is not there.
- **The half-diamonds are OPEN chevrons**, ends on the frame edge, apex inward — open because the frame line already draws their base, and closing them lays a second stroke along the very line the sheets align by. Two sheets laid up correctly bring opposed chevrons base-to-base and the ◇ closes; a millimetre out and it visibly doesn't, which beats "line the two lines up" (two lines on top of each other hide half a millimetre of error).
- **Two per seam, a fifth in from each end, each with a code** (`1A`/`1B`, `2A`/`2B`, …): one mark leaves the sheet free to pivot on it, so two pin rotation as well as offset. The left/right chevrons carry **no** code, the layout being one column wide — those edges have no neighbour and are trim marks only.
- **There are no corner registration crosses, and the `reg` and `glue` styles are gone with them.** The box's own full-bleed intersections are better crosses (they run to the paper's edge). A style in `STYLE` that nothing draws is a lie about what is on the sheet, so delete the entry with its last consumer.
## Opening hoops on cardboard (bent from wire)

The 3D route prints a hoop for each opening (`ringGeometry`). The cardboard route has nothing to
print one with, so the template draws the hoop's **centreline at 1:1** and the maker bends wire on the
line (`wireRing2D` in `src/geometry/ring.ts` → `wirePart` in `src/paper/mold.ts`). Before this the
route printed no hoop at all and the guide told you to cut one out of card and pierce three holes in
it — which is exactly as strong as the card.

- **It is the SAME hoop, in the same place.** `openingR() + RING_FIT + WIRE_D/2`, with `WIRE_D` equal
  to the printed hoop's `RING_WALL`, so the bent wire fills the band `annulusGeo` would have filled:
  the same inner face against the ribs, the same outer face for the bamboo, and the same washi cover
  allowance folded over it. `check:paper` §8 asserts both faces against `ringGeometry`'s own vertices
  rather than against the constants, because constants copied into a gate agree with themselves
  forever.
- **`WIRE_D` is a constant and stays one**, for the reason `LEG_D` is (see the leg-socket section).
  The sheet is a line you lay wire ON, so the wire's thickness moves nothing but where that line is
  drawn — a fraction of a millimetre on a hoop held by bamboo and paste. A template that asked for a
  wire gauge would be asking before it can draw anything.
- **The eyes are `ringLegs()`'s answer, not a second opinion.** The bottom hoop takes `LEG_N` eyes at
  the angles the printed ring puts its pads, when and only when `ringLegs(p)` is non-null. An eye is
  far smaller than a pad, so a design that function turns down for room has no legs to hang on one
  anyway — and one answer is what stops the template offering eyes for a leg step the guide has
  filtered out. Do not give the eyes a fit test of their own.
- **An eye is a full turn of the wire, tangent to the hoop from the INSIDE**: the line runs up to the
  hoop, goes once round a circle of `EYE_R` centred `EYE_R` further in, and carries on — the shape a
  pair of round-nose pliers makes, and a path the wire really can be bent along.
- **The eye is a ⌀10 loop, and it is sized to be BENDABLE, not merely to admit a leg.** Bore =
  `2·EYE_R - WIRE_D` = 8mm. It was ⌀4 first, which is the very tip of a pair of round-nose pliers and
  comes out lopsided by hand; a centimetre of loop is something you can form, and it takes a knotted
  cord for a pendant as readily as a leg. `check:paper` §8 fails below a 3mm bore.
- **The hoops have an EMPTY `outline`, and that is the point.** They are the only parts on the sheet
  with nothing to cut. `RawPart.outline` may therefore be empty, `pageOps` draws no `cut` path for
  one, and the hoop is drawn in a new `bend` style — **blue**, because on this sheet blue already
  means "lay something on this, never cut it" (the trim box, the join diamonds), and a third colour
  would be a third thing to learn. It is twice `join`'s width: a hairline disappears under 2mm of
  steel. Giving a hoop an outline "so the layout has something" prints a black line telling someone
  to cut it out.
- **`RawPart.note` exists for the same reason** — one line of small print under the part's name,
  centred (`pnote`). Every other line on the paper is a cut line or a hint beside one, so the one
  part nobody cuts has to say so out loud: 「針金(2mm)を曲げる線」. Keep it short in **both**
  languages; it is set inside a hoop that is ⌀22 at the `LIMITS` floor.
- **They cost a sheet on a third of designs, and that is the cheap option.** Over `check:paper`'s
  1,080-design sweep the template went **1,620 → 1,980 sheets**: 720 designs pay nothing and 360 gain
  one page. A separate hoop PDF — the other way this was considered — costs one page on *every*
  design, so riding in the room the mold's own layout leaves is strictly better. Nesting the smaller
  hoop inside the larger would save nothing: the pages that grow do so because the hoops open a new
  ROW, whose height is the bigger hoop's either way.
- **There is no wire equivalent of the printed ring's marker tab.** Two bent hoops of ⌀116 and ⌀108
  are as easy to mix up as two printed ones, and a tab cannot be bent into wire by hand. What tells
  them apart is that they are bent on two separately labelled lines, so the ring step says to mark
  which is which before they leave the paper. Do not invent a bend for it.
- **None of this has been built yet.** The hoop's dimensions are the printed ring's, and `check:paper`
  §8 holds them there — but the cardboard route has never been made up in the hand, so how a bent
  hoop actually behaves (springback opening the ring, the two ends' twist sitting proud under the
  washi, whether a 1cm eye is the size you want once a leg is in it) is unknown. Say so before
  defending any of these numbers on paper.
- **The guide follows the part, not the route.** The ring step runs on both routes with a
  `paperBody`; `PARTS` lists both hoops on both routes; the wire stops being `任意` on the cardboard
  route (`KitItem.paper`); and every figure that draws a ring — the parts list, the ring/higo/dry/pull
  steps, the lit shade, the hanger — picks `wireRingGeometry` or `ringGeometry` off the same `smooth`
  flag. `wireRingGeometry` is a **drawing**: nothing exports it to STL, so it is not on
  `check:manifold`'s list.

## Washi template (cutting the paper skin before pasting)

Trimming the washi AFTER it is pasted is the fiddliest step of the build and a torn wet edge shows, so the app also prints the paper skin's own flat pattern: **one panel = the surface between two adjacent ribs**, at A4 full scale. `washiGore(p, {side, end, span})` → `washiParts` / `washiPDF` in `papercraft.ts`. Fixed items:

- **The sheet's length is the meridian ARC LENGTH `∫√(1+R'²)dy`, not the body height** (a 205mm body needs 217mm of paper). Cutting to the straight height is exactly the failure this template exists to prevent; `check:paper` asserts it against an independent integration of `outerR`, and the page states the number.
- **Half width = `π·R(y)·span/N`** = half the rib-to-rib arc. The run is **`fukuroRange` only** (the neck carries no washi), so the ends land on the opening radius and the sheet just covers the opening.
- **Flattening is inexact by nature** (the lamp body has Gaussian curvature ≠ 0). The straight-axis gore makes the side edge slightly longer than the true meridian — worst ~4% at the steepest slope with 8 ribs, ~2% with 12, shrinking as `(π/N)²`. **Do not "fix" this by scaling the width**: the width is what makes the panel meet its neighbours. `washiGore` used to return the worst slack as `stretch` for the page to report; nothing ever read it, and a number no surface prints is not a report, so it is gone. Bring it back by printing it, not by computing it again. The exact alternative (a cone-chain unroll with a curved axis) buys accuracy with extra horizontal seams and is not wanted for a lantern.
- **Allowances are the only additions**: `side` (overlap, on EACH side — panels lap over each other on the rib) and `end` (cover, past EACH opening — folded over the opening ring). Defaults **3mm side / 6mm end**, adjustable and persisted like `matT`. The end overhang keeps the opening's width, which is exact because the neck is a vertical rectangle. **Both numbers come from a lantern actually built from this template** (2026-09-03, **on the 3D-print route**): the 3mm side overlap held, and the end was too short to fold over the opening ring, so it was doubled. They are a maker's result, not a calculation — do not re-derive either from an argument about how much glue area a fold leaves, since the side came through exactly that argument intact. Nothing has been built on the **cardboard** route, whose hoop is bent wire rather than a printed band, so 6 is carried over there rather than confirmed. `check:paper` §4 sweeps the shipped defaults themselves (`[WASHI_SIDE, WASHI_END]`) rather than a copy of their numbers, so moving one cannot leave the gate testing a value nothing ships.
- **Guides are never cut lines.** The dashed guides mark the true rib lines (inset by `side`) and the opening lines; the short ticks mark the bamboo positions from the same `grooveList()` as the mold. They are traced from the same station list as the cut outline, so they cannot drift off a sharp shoulder.
- **The template is traced, not glued on** — washi is translucent, so it is slipped under the paper. Never instruct the user to glue it to the material; that is the cardboard template's flow.
- **There is no on-screen preview of the washi panel, and it is not an oversight.** It is one sheet of one shape, it says nothing about the mold, and the PDF opens in a viewer that shows it better than a 190px dock did. A dock existed briefly on both routes and was removed at the user's request — do not rebuild it, and do not draw the panel a second way for a thumbnail either.
  - **`washiPagesSVG()` survives that removal on purpose**: it is the SVG encoding of the very pages `washiPDF` writes, and **`check:paper` section 6 compares the two coordinate by coordinate** (3,942 paths over 36 designs), plus the fact that the UI language moves no coordinate. That comparison is what stands between a hand-rolled PDF and a file that disagrees with everything else here. The encoding differences it tolerates are named in its comment — rounding, the two ways a label is centred, and each format's own escaping (SVG's `&lt;`, and the backslashes a PDF literal string must put on `(`, `)` and `\`, which the hoops' bracketed names were the first labels here to need). A further one appearing means a renderer has drifted, not that the tolerance needs widening.
- **The washi template is not an output method, and has no download of its own.** It is the paper skin you need on top of whichever mold you built, so it lives with the design settings (the 「和紙」 section) and **rides along with whichever output you pick**, as `tomoshibi_washi_a4_beta.pdf` inside that route's ZIP. Do not re-add it to the output toggle: the toggle is mutually exclusive and the washi is needed in both cases. **One download per route, one deliverable per document.**
  - **It is its own PDF on the cardboard route too, not pages appended to the mold's template.** The two are printed at different moments — the mold once, the skin once per lantern, often on different paper — and `pagesPDF` numbers and seams the sheets of ONE document, so splicing them makes the seam codes span things that never join.
  - **Its panel width follows the rib count, so the cardboard copy is cut from `paperP(p, matT)`** — the CLAMPED `pk.boards`, the mold that template actually makes. That is why `paperP` is exported. `check:paper` pins it three ways: a clamped count must widen the panel (§1), the panel is on its own sheets and not on the cardboard pages (§4), and the same holds in the shipped bytes (§5).
- **The washi template is marked `beta` — in the panel AND in the filename** (`WASHI_PDF`, one constant for both ZIPs and both notes). The dimensions are verified, and **one** lantern has now been built from it — on the 3D-print route, which is what moved the end allowance (2026-09-03). One build on one route is what the beta is still there for, not what lifts it. The **filename** is the half that matters, because the file outlives the screen it came from.
- **The PDF is labelled in whatever language the app is showing.** It carries no CJK font but does carry outlines for the characters it prints (see `pdf.ts`). Nothing dimensional depends on the labels — but keep the ruler note short in **both** languages, since a long line collides with the right-aligned footer and no CSS will save you in a PDF.
- **Pages are built once as drawing ops** (`pageOps`) and rendered as SVG *or* PDF, so add a new page element there, not in one renderer; the line/text styles live in the `STYLE` table so the two cannot drift. The **in-app preview is not a third renderer** — `paperPagesSVG()` hands it the same `pageSVG()` markup, asking only for the CSS scoped (`styleCSS(".pages ")`), because the sheet's style table uses bare names like `.note` that must not reach the rest of the app.
- **All panels are identical, spiral winding included** (every bay sees the same helix), so one sheet is laid out labelled `×N`. Spiral only shifts the right-edge ticks by `step/boards` — `grooveList(p, gR, 0)` vs `grooveList(p, gR, 1)`, not a separate calculation.

## Build route (3D print vs cardboard)

Which route someone is on — `route`: `"stl"` / `"paper"` — is **app-level state held in `TomoshibiStudio` and persisted** (`persist.ts`, alongside the bed dimensions; anything but `"paper"` sanitizes to `"stl"`). It is not a per-export toggle: it is a fact about the maker, and the rest of the app branches on it.

- **The print bed only exists on the STL route.** Cardboard prints on A4 and a taller part simply **continues onto the next page, butt-joined** — so there is no *bed* to warn about. That is a statement about the bed and nothing else: the content column still caps a part’s WIDTH, which is the alert two sections up, so do not read this bullet as "cardboard has no size limit". `bedRules = route === "stl"` gates the overflow warning (in *every* view, not just the print view — it used to nag a cardboard user in the section view), the "→ lower the body height to Nmm" hint, and the warn colouring on the rib-length readout. Do not reintroduce a bed check that ignores the route: shrinking a design for a limit that route doesn't have is the bug this prevents.
- **The print view is a different kind of view per route.** STL gets the 3D plates (`buildPrint`); cardboard gets **`src/ui/PagePreview.tsx`** — the template's own A4 pages as SVG over the (idle) canvas, exactly the way the section editor overlays its SVG; `buildScene` returns early for it, the same as for `"2d"`. **Its output is a document, so its preview is a document** — there is nothing spatial to show, and a WebGL page needs a canvas texture to say what a stroke of ink says for free. **Neither view previews the washi template** — it downloads as a PDF and is read as one (see "Washi template").
- **The preview never lays parts out itself.** It renders `paperPagesSVG()` — the same ops, through the same renderer, as the PDF — so the page count, the parts on each page and the part spanning two pages are the template's own answers. An earlier version packed the parts onto a field of A4 sheets of its own devising; the moment that disagrees with the template, the user believes the wrong one. On screen it is **not** full scale (hence the note, and hence the printed ruler).
- **The guide branches on the route too, and reads it through `paperP`.** On cardboard the page describes the mold that route *makes*: the material thickness becomes the board thickness, thick material clamps the rib count, the ribs are drawn with a **smooth outer edge and no lightening windows** (the template cuts neither), and the stand steps are filtered out rather than reworded. The **ring step is not** — both routes end up with a hoop at each opening, so it is one step with a `paperBody`, and every figure that draws a ring picks the printed one or the bent one off the same `smooth` flag. Building it from the design on screen instead is the same bug the washi panel had — a page that counts ribs the template does not cut.
- **On a phone the sheets are ONE COLUMN and they TOUCH** (`PagePreview.tsx`, the `narrow:` utilities on the pane). Both halves are the document's own structure, not a small-screen accommodation: the template's layout is one column wide, and consecutive sheets are **butt-joined** — cut both on the blue trim box, put the cut edges together, tape from behind. So the preview is the strip you will tape, in the order you will tape it, and a gap between two sheets would draw a join the finished template does not have. It reads: the half-diamonds of a seam sit directly above their partners and a part's cut line runs on across. This replaced a 2-up grid of 150px tracks, inherited from when the pane was `40vh`; the pane is now the whole phone at rest, so that was trading a readable 355px page for two thumbnails nothing could be read on.
- **`grid-auto-rows: max-content` is load-bearing, and `auto` is a bug** (the pane's layout is utilities in `PagePreview.tsx`; only the sheet itself — `.pages .pg` — is still a CSS rule, because papercraft writes that class into an SVG string). This pane is a flex item with a *definite* height, and an `auto` row in a grid whose own height is definite gets sized against that height rather than against its contents — so with the inspector sheet pulled up the four rows came out **8.5px** each while every page still rendered 243px, and each sheet was drawn straight through the three below it. It was never narrow-only: on a 1440×900 desktop the same design gave 170px rows for 742px pages. A row has to be as tall as the sheet standing in it, and the sheet's size is the one thing here that is not ours to choose (the SVG carries A4's ratio).
- **The choice is offered on the welcome card**, and switched in the print view by the segmented chip **on the viewport, next to the mode tabs** — not in the inspector. It changes what the whole view *is*, so it does not belong at the bottom of a long scroll; the panel below it only holds that route's settings (bed size / material thickness) and names the route in its section hint.

## Architecture — the decisions behind the layout

`CONTRIBUTING.md` has the file map; this is why the map is shaped that way.

- **`geometry.ts` is a barrel, and everything imports through it.** The implementation is one module
  per part in `src/geometry/`, but the public surface was left exactly as it was before the split, so
  moving a function between modules stays a non-event for callers. Dependencies run one way —
  profile ← groove ← rib, shape is a leaf — and **anything mutually recursive with `outerR` belongs in
  `profile.ts` by construction**, or you have made a cycle. `check:hash` makes any such move provably
  shape-neutral: the split itself was verified at zero vertex diff across all 1152 parts.
- **`src/` holds only the entry, the two barrels and what more than one area shares**, and a
  directory owns its own head — `ui/panel/InspectorPanel.tsx`, `ui/section/SectionEditor.tsx`,
  `guide/GuidePage.tsx`, `studio/TomoshibiStudio.tsx`. What decides the folder is who imports the
  file, not what it is about: `bed.ts` stays at the root because `three/scenes.ts` reads it too and
  `three/` must not depend on `studio/`, and `WASHI_PDF` sits in `config.ts` so `ui/panel/` does not
  have to reach up into `studio/kit.ts` for a filename. The three `import type` edges from `ui/` into
  `studio/` are erased at build and are not edges.
- **`io/pdf.ts` is the paper route's only consumer, and still must not live in `src/paper/`.**
  `check:glyphs` reads that directory rather than a file list, so a module moved into it is scanned
  for the characters it prints — and `pdf.ts` carries `FOLD`, fourteen characters (`← → ↑ ▼ ⚠ ≤ …`)
  that deliberately have **no** outline because they are folded to ASCII. Moving it there fails the
  gate on its own fallback table.
- **`types.ts` holds values-free types, and that is what keeps `geometry/` from importing `config.ts`.**
  Every import of it is `import type` and erased, so it creates no dependency edge. `DEFAULTS` is
  checked against `Design`, and `SIL_ROWS` and persist's `BOUNDS` are both keyed by
  `NumericDesignKey` — so a numeric field added without a range to clamp it into fails the build
  instead of reaching `outerR` unclamped from a corrupt file.
- **`TomoshibiStudio.tsx` is state and composition only.** It renders no control of its own and
  builds no 3D. Keep it that way: the moment a scene detail or a button's styling lands back in it,
  the file starts growing towards the 1,400 lines it used to be.
- **`three/viewport.ts` is everything created once per mount**; `scenes.ts` empties and refills the
  group per view. Two views draw no 3D at all and say so by returning early — `2d`, and `print` on
  the cardboard route — both being documents drawn over the same canvas. The only geometry
  `scenes.ts` touches is rotating parts flat for the print preview, which is preview-only: the export
  lays its own plates out.
- **`bed.ts` is one function shared by three callers** — the overflow warning, the recommended max
  height, and the plate layout — so those three can never disagree.
- **`hooks.ts`: `useUndoRedo` watches `p` and commits once it settles**, because there is no single
  choke point for edits; `useNarrow` uses `useSyncExternalStore` so the first render already knows.
- **`index.css` is 17 rules**, and only what a utility cannot be. See the Tailwind section.
- **`SectionEditor.tsx` reads `geometry.ts` directly**, dimensional constants included, so what it
  draws is what gets printed. The groove half-width is `grooveR(p)`; it was once split between
  `higoD/2+0.15` and `+0.25`, and the section view drew a thinner groove than the STL.
- **`ui/` holds the palette and type scale (`theme.ts`), the controls, and the panel's larger
  pieces.** `theme.ts` stays the source of truth because SVG presentation attributes need a literal
  value — a `var()` does not resolve in an XML attribute — and `@theme` in index.css is a hand-written
  mirror that `check:style` compares against it.
- **`papercraft.ts` and `pdf.ts` are one drawing in two encodings.** Pages are built once as drawing
  ops (`pageOps`) and rendered as SVG *or* PDF, so a full-scale bug cannot hide in one of them; add a
  page element there, not in a renderer. **`pdf.ts` declares the op vocabulary**, because a renderer
  can only draw what it knows how to draw and an op it has never heard of is a line that silently
  does not print. Stroke names and text names are separate types, so a path drawn with a text style
  fails to compile instead of printing a hairline where a cut line belongs.
- **Everything WinAnsi cannot encode is drawn as filled outlines** from `pdf-glyphs.ts` (generated by
  `tools/pdffont` for the characters the templates print — 24 outlines, 12 kB, of which 13 are
  actually drawn (the rest are `EXTRA`'s hand-kept reserve and characters that only ever appear
  in a `/Title`, which `pdfString` writes as UTF-16BE hex rather than as outlines); a whole CJK
  font would dwarf the file). That is what ended the templates' English-only era: `winAnsi()` DROPS
  what it cannot draw, so a Japanese translator silently produced parts labelled `" ×8"`. Two rules
  follow: a glyph is *text*, so anything reading the content stream must strip glyph blocks before
  counting paths, and **the matrix that scales a glyph needs more than 3dp**.
- **`stl.ts` writes both formats with libraries rather than by hand** — three's `STLExporter` (whose
  face-normal maths matched the hand-rolled writer byte for byte across four designs) and fflate's
  `zipSync`, which brings DEFLATE and takes a default kit from ~1.0 MB to ~0.19 MB. `zipSync`
  tree-shakes to 9.5 kB gzip 4.8, the only reason a dependency was worth it here; contrast `pdf.ts`,
  where the equivalent library costs hundreds of kB for a handful of vector ops.
- **`PagePreview.tsx` renders the template's own pages, never its own layout.** An earlier version
  packed the parts onto a field of A4 sheets of its own devising; the moment that disagrees with the
  template, the user believes the wrong one.
- **`Welcome.tsx` and `GuidePage.tsx` are presentational and own no app state.** See "Onboarding" for
  the card, and the guide's own section below.
- **`three/figures.ts` renders the guide's drawings off-screen to PNG data URLs.** `SCENES` holds
  thirty-odd of them, which as live canvases would be thirty-odd WebGL contexts against a browser cap
  of ~16. The file itself is now only that catalogue and the camera; the drawings live in
  `three/figures/`, one file per thing they are of — `ink.ts` (the house style: palette, view
  directions, `part`, the strokes, the accent rod), `mold.ts`, `lit.ts`, `kit-tools.ts`,
  `kit-lamps.ts`, `fitting.ts`, `hang.ts`. **The per-figure reasoning lives next to each drawing —
  do not copy it back here.** What is worth knowing before opening any of them: a surface of
  revolution has no creases, so the pasted shade is one lathe PER BAY (a full lathe gives
  `EdgesGeometry` nothing but its two rims); the frustum is fitted to the projected drawing, not to
  the bounding box, because a diagonal shape's box corners are all empty; and the `kit*` scenes are
  the only ones never built from `p`, their numbers being proportions rather than dimensions.
- **`three/figures.ts` is NOT a barrel, and `geometry.ts` is** — the difference is the caller count.
  `geometry.ts` has five plus two gate scripts, so moving a function between its modules has to stay
  a non-event. `figures.ts` has one caller importing two names, so a re-export layer would buy no
  stability and would only invite reaching past it for `part` or `silhouetteLines`. Its leaves are
  private on purpose.
- **No gate can see any of `three/figures/`.** `check:style` does not check it (below), `check:hash` and
  `check:manifold` never import it, and `figureImage` catches every error and returns a blank PNG so
  the guide survives losing one drawing. A change to a figure is therefore checked by RENDERING the
  set — all 35 scenes on both routes — and comparing PNG hashes before and after. That harness needs
  a WebGL context (headless Chrome with SwiftShader), which is exactly why it is not an `npm run
  check:*`: a gate that skips when it cannot run is worse than one that is missing.

### The build guide (`src/guide/GuidePage.tsx`)

It is a document, so it takes the whole window and scrolls, and it is the app's one addressable
**page** — `/guide` — opened from the `☰` menu and closed with ×, Esc, or the browser's back button.
**It was a fifth view tab and must not go back**: the other four views each render YOUR design, this
one does not, and as a tab it had to be excepted out of the dimension chip, the viewport alerts, the
inspector and the phone's tab strip, one gate at a time. **The name is 作り方, not 組み立て方** —
winding bamboo, pasting washi, drying and lighting are not assembly, and half of them happen after
the mold comes apart.

- **The page is generic.** Every figure is drawn from one fixed design (`GUIDE_P` = `DEFAULTS` **with
  the leg sockets pinned on**, plus a `paperP` copy for cardboard), and **no dimension is printed
  anywhere**. It used to measure everything off `geometry.ts` and rebuild on every slider move — two
  dozen WebGL scenes per edit, bought with numbers nobody needs. Figures are built at most **once per
  route per session**.
- **Nothing on it may state a QUANTITY the design decides.** The rib's line reads 「設計した枚数」
  rather than ×8: a fixed picture of eight ribs is an illustration, a printed 8 is a claim. ×2 koma,
  ×2 posts, ×1 base and ×1 ring stay — those are facts about the mold. The **route** is the one thing
  that still follows the app, because it changes which parts exist.
- **`GUIDE_P` pins `legSockets: true` because a default that is right for the editor once deleted a
  section of the manual.** `DEFAULTS` ships the sockets off, and the third way of lighting it —
  figure and three sub-steps — silently vanished with every gate still green. Anything else the page
  must SHOW belongs in that override.
- **`KIT` is plain strings, no numbers, nothing derived**: a bamboo length summed over the grooves
  was tried and taken back out. What is optional is a judgement (`opt`), not a category — the wire
  and pliers serve only the two lighting ways with wire in them, the brushes and mister can be done
  without, and everything else is unconditional. Tape and thread are **one card named for the job**,
  because anything that holds the bamboo while the paste dries will do.
- **Every step is drawn**, and the drawings say things a photograph of somebody else's lantern
  cannot: the rings come from the same `grooveList`/`higoSpiralPath` that cut the grooves, and the
  panels are one lathe per bay at `outerR + higoD`, so the seams fall on the ribs of the mold being
  drawn. Pasted panels are **ivory**, breaking the white-parts rule, because paper over a white part
  on a white card is invisible. The paper's surface is the mold's offset along its **normal**, not
  along x — horizontally, a face at angle θ keeps only `higoD·cos θ`, and a squat body drew its
  bamboo outside the shade.
- **The light step's three ways are `options`: SECTIONS, not steps.** Numbering them 11/12/13 would
  tell the reader to do all three. Each way's title and body sit above its figure, spanning both
  columns. An option may carry `detail` (numbered sub-steps — numbered because they are sequential,
  which the options are not), a `note` (a footnote at the foot: a caveat about the WAY, not a
  condition on doing it at all), and `needs(p, stl)` to drop a way this design cannot offer. `needs`
  gates on the DESIGN, not the route — cardboard prints no ring, but the finished lantern has one
  either way, so that route gets the same option with a `paperBody`.
- **A step can be marked `wip`** (a draft badge plus a one-line reason). **Nothing carries it now.**
  Keep the mechanism, and keep any future wording clear of 「口輪」, since cardboard prints no rings.
  The step used to offer a ⌀65 lamp-holder base to print; the file was deleted from `public/` before
  merge, because an unreferenced 284kB binary still ships with every deploy. **Don't put a download
  on a step whose part is undecided.**
- **The folded `more`/「詳しく」 blocks are gone** (2026-08-31): four `<details>` with a photograph
  well each, of which only one was written and the rest stood open on 「未記入」. The mechanism was
  sound — folded content still prints — but it was scaffolding for photography that has not been
  done. Bring the whole shape back if the photographs get taken; do not leave a well standing empty.
- **Print styles are in `index.css`, and the app writes no PDF for this page** — the browser's own
  "Save as PDF" is the paper version, which is the whole reason it is a page. Two rules there are
  load-bearing and were both found broken: **the shell has to be released first** (the app is a
  100%-tall `overflow: hidden` box from `<html>` down, which clipped the printed guide to exactly one
  page), and **the two-column layout has to be forced back on paper** (sheet width is under the 860px
  breakpoint, so every figure grew to full width and Chrome dropped the blocks it could not split).
  Both are still working, verified under print emulation: the shell's five siblings all compute to
  `display: none`, and the first step's columns come back as `534px 851px`.
  - **It prints 20 sheets, 17 on cardboard** — content, not a rule: if you change either, print it
    and count. **The 7 / 6 this note used to give was measuring the wrong thing**, so here is how to
    reproduce the real number rather than re-derive the old one. A sheet is **794px** wide (A4 at
    96dpi), which is under the 860px breakpoint — that is the whole reason the two-column rule above
    has to be forced — so on paper a figure gets ~38% of 794px ≈ 300px and the document runs long.
    Load `/guide` in headless Chrome and ask for `Page.printToPDF` at A4 (8.27×11.69in, 0.4in
    margins), then read `/Count` off the page tree. Seed the route through
    `Page.addScriptToEvaluateOnNewDocument`, not from an already-booted page: the app rewrites
    `tomoshibi.studio` from its own state shortly after boot, and losing that race silently measures
    the 3D route twice.
  - **7 is what you get by dividing the guide's on-screen height by a sheet**, which is not the same
    document: at a 1440px viewport the page is 7153px tall and a sheet holds 1045px (11.69in less
    two 0.4in margins, at 96dpi), so 7153 ÷ 1045 = 6.8. That column is nearly twice a sheet's width,
    the figures are correspondingly larger, and it reflows to a third of the length. Wait for the
    figures either way — though the wells hold their box whether the drawing has arrived or not, so
    the height is honest before they land.
## Onboarding (first-time visitors)

The app is published on a static host, so most first-time visitors arrive knowing nothing — and in English (`loadLang()` defaults to `en`). Two pieces cover them, split by the question they answer:

- **"What is this?" → `src/ui/Welcome.tsx`**, one card on the first visit, and **the heading is where it answers that**: 「好きな形の和紙提灯を、型からつくれます」. Everything else on the card *shows* rather than tells — three drawn steps for how, two route buttons for what you need and where to start. It carried prose under those steps for a while, and that was **the heading's fault**: while the heading read 和紙提灯の「張型」をつくる — the correct trade word for the object, and the app's own subtitle — a first-time reader did not know the word, so a sentence had to follow explaining that the shape on screen was not a lantern. That is a caption defending a term rather than telling anyone what they can do. Leading with the outcome (a lantern, theirs, any shape) makes it unnecessary: 「型から」 plants the same fact in passing, and the steps below draw it. The second bullet beside it said the washi template comes with either output, which `WashiSection` already says **beside the washi download itself** and the ZIP contents list names on both routes — a first-run card was the third place to say it and the earliest place it was useless. **Do not add a third register.** The failure this card keeps returning to is saying one thing as a heading, a bullet and a caption at once; both removals bought card height and cost nothing, 595px on a phone → 497. **One card, not a step-through tour** — the app is a single screen with no empty state, and a spotlight overlay would have to track a viewport that stretches. Esc / backdrop / button all close it, and it never blocks anything.
- **"3D printer or cardboard?" → the two buttons on that same card.** The route decides whether the bed constrains the design at all, and the bed's warning starts nagging long before anyone opens the print view, so it is asked once, up front. **Each button is also the start action.** Leaving without choosing is a **× in the corner**, not a third button on a footer row — it replaced a 「とりあえず見る」 that cost a whole row and read like a third option beside the two routes.
- **"How do I work the ◇?" → the legend at the top-right of `SectionEditor`.** It sat bottom-left until a wide, low body was found filling the bottom of the frame with the very drawing the legend explains. **On a phone it is a pill at the bottom-left that you tap open**: at 300px wide against a 375px screen the card IS the drawing. It **redraws the canvas marks themselves** at legend size in the same shapes and colours rather than describing them in words, and its content follows `editMode` — in curve-adjust mode the `+` ghosts are hidden and the point itself doesn't move, which reads as a bug unless the legend says so.

Fixed points:

- **The dismissal flag is `tomoshibi.welcome` (`persist.ts`), separate from the design state.** Exporting a design must not carry "has this person seen the intro", and clearing one must not touch the other.
- **Auto-open keys on that flag ALONE — do not add "…and there is no saved design".** The autosave flushes on `pagehide`, so a first-time visitor who merely reloads already has saved state and would never see the card, which is exactly the person it is for. The cost is that an existing user meets it once.
- **The three steps share ONE white panel with arrows between them; the route buttons are accent-bordered, full-width and stacked. Do not let the two converge again.** They used to wear the same white card, 1px edge and 11px radius, so the three things you cannot press looked exactly like the two you must — worst once the steps stack on a phone and each becomes a full-width boxed row. A single `--card` ground reads as one block of explanation; three read as three targets. The `→` between them are what make it a sequence, and on a phone the SAME glyph is turned a quarter turn by CSS rather than written twice. The buttons answer with the opposite emphasis (accent border, a lift, a `:active` press, a `→`), and both weigh the same — two equal answers to one question, not a recommendation and an alternative.
- **The cost is height, and it came back out again**: the shared panel and stacked buttons took a phone from 560 to 656px, and dropping the closing hint paragraph brought it to 606 against 720 before any of this. Folding the type scale took another 4–5px, and the wordmark's `display: block` (see `ui/Logo.tsx`) another 7. Measured 2026-09-01: **595px (ja) / 615 (en) on a phone, 524 on the desktop**. At 375×667 the card still reaches both ends — top 36, bottom 631.
- **The cardboard button keeps its `beta` badge here.** This card is where someone chooses that route, and offering it without the caveat would sell a route that has had far less real building behind it.
- **The `☰` menu's 「はじめかた」 row is the only way back.** Once dismissed the card never auto-opens again, so don't remove that row.
- **Its layout is `max-[480px]:` utilities, not `narrow` ternaries, and 480 rather than `useNarrow(860)`.** The component takes no layout props and should keep it that way; and the card is `min(560px, 100%)`, so what decides the layout is whether the CARD has room for three columns — about 460px of viewport — not whether the app is stacked, which a tablet with plenty of room would trip. **The three steps stack into rows on a phone**: three columns of ~85px is where the card fell apart (every caption wrapped to three or four lines and that row alone ran to ~330px). The → arrows go with the columns — in a vertical list the order already says "then".
- **The card is centred by `m-auto` on the dialog, NOT by the overlay's `align-items`, and that is load-bearing.** Centred by `align-items`, a card taller than the window overflows in BOTH directions, and a scroll container cannot reach what is above its start edge: on a 375×667 phone the wordmark was cut off with no way to scroll up to it — the first thing a first-time visitor sees. An auto margin resolves to 0 once the free space goes negative, so the card starts at the padding edge and all of it scrolls into reach. `align-items: safe center` would do the same job; plain `center` would not.
## Narrow screens (phones)

`useNarrow(860)` had always stacked the viewport above the inspector, and until 2026-08-29 that was the ONLY thing that changed — an app you could read and could not work. These measurements on a 375×812 phone are the acceptance criteria for anything changed here:

| | before | after |
|---|---|---|
| ◇ hit target, section editor | **11px** across | **30px** (20px for the `+` ghosts) |
| smallest control in the inspector | **22px** (the "?") | 36px; sliders and value fields 44 |
| section view | 325px tall, drawn at 0.436 | **717px** at rest, drawn at 0.778 |
| inspector scroll area (of ~1250px of controls) | **216px** | 212px at `half`, **491px** at `full` |
| chip bar | 46px (ja) / **85px** (en) | 51px, identical in both |
| …with a viewport alert showing | **146px**, or **88px** in the print view | unchanged: the alert strip costs 37px |
| mm the design moves per px of ◇ drag | ran away — 40px took ⌀192 to **⌀392** | linear: 40px → ⌀243 |

**The wide layout is untouched, deliberately.** Every change below is behind `narrow`, and a 1440×900 desktop still renders the same `0 0 860 780` viewBox at the same scale with the same 24–25px targets. A shared code path was tempting only in the section editor (a content-fitted frame is better at any size) and is not taken, because the fixed frame is where every label position and half of this file's stated geometry live.

- **The section editor takes a `compact` flag.** Nothing under it touches geometry — the file draws, it does not generate.
  - **The viewBox is fitted to the content** instead of the fixed 860×780 frame, which is twice the width the drawing uses and is what pinned a phone at 0.44×. The fit comes from quantities the drawing already has (`maxR`, `komaR`, the tabs, the axis stub) plus `FIT_PAD`, so a mark that moves takes the frame with it.
  - **Hit radii AND glyph sizes are derived from the measured on-screen scale** (`HIT_PT` 30, `HIT_ADD` 20, `GLYPH_PT` 16, `GLYPH_H`/`GLYPH_ADD`/`GLYPH_TAN`), not written as SVG-unit constants — a constant target shrinks with the drawing. Leaving the GLYPHS out of that was a bug for as long as the hit circles had it: the touch surface grew while the mark shrank to 8.6px, and the legend **redraws these very marks at legend size**, so a canvas mark half the size of its own legend entry reads as broken. Stroke weight and radius ride along, and the label offset is `rPt + 9.5` rather than a constant 15. The wide path keeps the old numbers as floors.
  - **The pane is measured with a layout read AND a ResizeObserver.** An observer only delivers for an element the browser is laying out, so a hidden or throttled tab leaves it silent — and the `pane.w === 0` fallback is scale 1, which hands a phone the small targets this path exists to remove. Hit for real, not hypothesised.
  - **The legend steps out of a short pane** (`showLegend`, gated on the measured `pane.h`): below 220px the drawing is context, not a work surface, and a 34px pill would be a fifth of it.
  - **A drag freezes the screen→model mapping at pointerdown (`freezeMap`), and that is a correctness fix.** Both halves of the mapping depend on the design being dragged — `s` shrinks as `maxRadius` grows, the fitted viewBox stretches as the silhouette widens — so reading it live closes a positive feedback loop: one ◇ dragged 40px took the design from ⌀192 to **⌀392**. Frozen, 40px moves it to ⌀243, exactly what the scale says. The wide path barely showed this (fixed viewBox, `s` pinned at 2.0 until ~200mm radius), which is why the bug arrived with the fitted frame.
  - **Compact drops the NAMES, never the NUMBERS.** Out go the region labels (首/火袋/首 — the colour bands already say it, and they hang off the LEFT of the widest part of the body, which `cx0` reserves nothing for), the 羽根板 caption, the 開口/首 tag and the 火袋の高さ caption. Every mm readout stays: they answer the question the drawing exists to answer, and the inspector that would state them is behind the sheet. Dropping them too was tried and left a shape with no dimensions on it anywhere; widening `FIT_PAD.r` from 64 to 78 to keep them cost 3% of scale.
- **The mode/route chips are a bar in FLOW above the viewport (`chipBar`), and in it they are two `<select>`s, not six chips.** Floating, the two rows were ~100px of a 357px pane, over exactly where the top opening's ◇ is. In a bar they covered nothing, but six chips still wrapped to two rows (85px) in English. **Do not shorten the labels to force one row** — these are the app's top-level navigation, and a phone is where you can least afford to guess what an abbreviation meant.
  - **They are NATIVE `<select>`s, deliberately**: on a phone that opens the OS picker, a better touch target than anything hand-rolled, with keyboard and screen-reader behaviour already correct and no focus-trap code to own. Only the closed state is styled. The `beta` badge becomes text, an `<option>` not being able to carry markup. Filled accent for the view (this is where you ARE), plain for the route (a setting).
  - **The header's `☰` lives at the bar's top RIGHT on a phone** — not in the panel (there is none) and not in the sheet's bar (it would be the only thing in the app that scrolls out of reach at rest). This strip is on screen in every view and at every sheet stop, **including lit**, where the whole inspector is hidden.
  - **Any control whose label changes with the language must take its height from `min-height`**, not from padding + line-height: the old toggle read "EN" or "日本語", and the taller CJK line box made the bar 16px taller in English.
  - `.pages` therefore has **no chip clearance to leave on narrow** (padding-top 12, not the ~120 the wide path needs), and **lit keeps the view control and drops only the route one** — the inspector is hidden there, so this bar is the only way out.
- **The inspector is a bottom sheet, and the viewport is everything the sheet is not using.** It rests at `peek` — its grabber bar and the live summary, 44px — so the section editor gets **717px of an 812px phone**. Pulling it up trades that back a stop at a time (`half` = 45% of the shared budget, `full` = the budget minus `MIN_VIEW`), and the viewport is a plain `flex: 1 1 auto` at every stop. There is no `40vh` any more and **lit needs no exception**.
  - **The stops are fractions of the budget the sheet SHARES WITH THE VIEWPORT, not of the window.** Those look equivalent and are not: the chip bar above them is one row in Japanese and two in English, so a window-relative `full` gave Japanese a 76px section view and English **37px**. Budget-relative, both get exactly `MIN_VIEW` (140px). The budget is `main + aside`, whose sum is invariant while the sheet animates — which is also why observing both does not re-render every frame.
  - **`peek` is the bar ALONE, and it is MEASURED rather than assumed** (`barRef`), since the summary wraps on a narrow enough screen. Including the CTA made it 128px — 16% of the phone resting. The trade is the print view, where the download button now needs the sheet opened first: at `peek` the pinned CTA sits past the sheet's bottom edge and is clipped (`overflow: hidden`), and appears from `half` up.
  - **The CTA stays pinned at the BOTTOM and the DOM order is the plain one** — bar, scroll area, footer, on both layouts. At `peek` the scroll area collapses to zero, so no reordering is needed. Giving the footer `order: 1` was tried: it put a full-width button between the drag handle and the first control and left the list sliding under it with nothing to disappear behind — **a half-cut row reads as a rendering fault, not as a scroll**.
  - **The scroll area carries NO vertical padding on a phone**, and that is not cosmetic: `min-height: 0` floors a border box at its padding, so 4+14px of it was 18px this element could not shrink past, which overflowed the sheet and cut the bottom off the CTA. The wordmark block at the end of the list gives the spacing back.
  - **What `peek` shows is the live summary**, because it is the readout you watch WHILE dragging a ◇. The grabber pill is positioned against the bar rather than laid out in it; the wordmark went the other way, to the END of the scroll, since identity may not take the first 40px of a pull.
  - **The grabber is a `div` with `role="button"`, not a `<button>`, and that is load-bearing**: `onSheetDown` bails out of anything inside a real `<button>` so a button in the bar would stay pressable, which makes a `<button>` grabber the one part of the bar you cannot pull. The pointer path already treats a press that never travels (`< SHEET_TAP` = 6px) as a tap that cycles stops, so the div only adds Enter/Space.
  - **Only the bar drags; the scroll area scrolls.** Arbitrating "is this finger scrolling or pulling" is the one thing `vaul` buys that this does not: measured, **+21.4 kB gzip and 11 packages** against a 105 kB app and a four-dependency policy, where this sheet cost **+0.94 kB** and none. If the hand-off is ever actually missed, `vaul` is the swap and nothing above it changes.
- **The viewport alerts move in flow too, between the viewport and the panel — folded into a strip you tap open.** A three-line card is a quarter of the pane and it lands on the bottom opening's ◇ — an alert reading "widen the opening in the section view" while covering the handle that widens it. But in flow it comes out of the SAME budget as the inspector: one open alert cut the panel's scroll window from 261px to **146**, and in the print view (taller footer, and the koma-wall warning fires on the default cardboard design) to **88px** — 7% of 1333px of controls, i.e. the exact failure this layout was written to remove, arriving through the thing meant to help. Collapsed the strip costs ~36px and still says it: the tint, the ⚠, the first alert's headline and a `+N`. **Do not make it open by default to be safe.**
  - **The alerts are built as DATA (`alerts: {key, head, hint}[]`), not as markup**, because the strip has to count them and quote one headline. That also retired a `hasAlert` predicate gating on a fragment — a fragment is truthy even when every card inside it is false, so it rendered an empty band.
- **The selected ◇ gets a contextual bar in flow** (`ui/PointBar.tsx`), and it fixes a trade rather than a tap count: `PointCard` needs no scrolling at `full`, but `full` is `MIN_VIEW`, so reaching it drops the section view to **140px** and you cannot see the point you are editing; at `half` the window is 212px and the 256px card does not fit either. The bar costs **57px while a point is selected and nothing otherwise**, and tapping empty canvas already dismisses it.
  - **The H field is 56px, sized to its content, and it has a `min-width`.** As `flex: 1 1 auto` it took 99px of box for a three-digit number; `margin-right: auto` takes the slack now, which also separates the point's VALUE from the buttons that act on it. The floor matters more: a 2000mm design puts FOUR digits in a right-aligned input, and an overflow shows the END of the number — `000` for 2000, silently, in a field you are about to type into.
  - **It carries H and NOT R.** The section view already prints every point's radius beside its ◇, so a radius field here was the same number twice 20px apart; height position is the one dimension the drawing states nowhere, and radius is set by dragging, the app's primary gesture. The tag is a mono letter and the value a number, so the row cannot change height between languages. Everything in it is a 44px target.
  - **All three glyph buttons carry a 9px caption** (◇ なめらか / ■ 角 / ◠ カーブ). The glyphs carry the meaning, but a row of bare glyphs is the discoverability problem the ☰ menu's rows avoid by being labelled, and captions cost 4px of width and none of the height. The glyph `<span>` is `aria-hidden`, so the accessible name is the word alone.
  - **The curve-adjust mode is a TOGGLE, not a segmented pair** — "move" is the resting state and "curve" is a thing you turn on, so a pressed button says it in one 44px square where two segments cost 88. It sits behind a **rule**, because in the same `SEG_SKIN`, ◠ hard against the ◇/■ pair reads as a third exclusive option however much air is between them (6px of margin did not say it). The rule before delete goes with delete under 360px. **The entry rule is shared**: `makeSetMode` in `pointEdit.ts` bakes the Bézier handles on first entry, shape-neutral but exactly once.
  - **`PointCard` renders NOTHING on a phone** (its `compact` prop is an early return). The last thing left in it was the radius, which is exactly what dragging a ◇ sideways sets. The inspector list goes from 1333px to **1057**. The wide layout keeps the whole card and has no bar.
  - **Delete lives in the bar unconditionally**, and the 360px rule drops the identity label instead — the section view already rings the selected ◇, while delete now exists nowhere else on a phone. One tap from a persistent bar is only acceptable because ⌘Z covers it; do not add a second destructive control on the same reasoning.
  - **The legend's `sel` row changes with it**: 「選ぶ → 右パネルで編集」 is a wide-layout fact, and on a phone it reads 「選ぶ → 下のバーで編集」. A legend that names a panel the layout does not have is worse than no legend.
  - **The editing rules live in `ui/pointEdit.ts`, not in any surface.** THREE things edit the same ◇ — this bar, `PointCard`, and the drag on the drawing — and the neighbour clamp (`tBounds`, ±0.04, which keeps `p.pts` ascending for `fukuroTangents`), the radius clamp (`clampR`), the `LIMITS.pts[0]` delete guard and clearing the selection on delete are exactly the invariants that would rot if written twice. **The drag was the surface this claim did not cover**, and the one that runs them most often: it carried its own copy of the ±0.04 bounds, character for character, while this line said it did not. Fixed 2026-09-02, verified against both original formulas over 200,000 random `(pts, i)` cases.
- **The inspector's chrome is compact**: no panel header (its buttons moved to the sheet's bar), tighter padding, and the three-row summary folded to one mono line. Header + footer were 237px of a 455px panel. The compact summary keeps the rib length's **warn colour**, the one signal in that block rather than a fact.
- **Every control in the inspector is a touch target, and almost all of it was free.** They were mouse-sized (± squares 26px, value buttons 62×24, sliders a 24px strip) but the slider row was ALREADY `min-height: 44px` and the stepper row came out at 40 — the controls simply were not filling rows the layout had reserved. So sliders and value fields grow into their own row, and the ± squares keep their 26px box and get a 40×44 `::after` overlay (the same glyph-vs-hit-circle split the section editor draws). Nothing in that block costs a row.
  - **The ☰ button is 36px on BOTH layouts, in its base definition.** It was 22px wide / 36px narrow, which made "too small" a phone problem. It is not: 22px is small for a pointer too, this button is the app's whole menu, and the wide panel header loses nothing by it being bigger because the row's height comes from the 44px wordmark beside it. **Prefer fixing the base rule to adding a narrow override.**
- **What is NOT done, and why.** The `+` ghosts sit at the midpoint between two control points, so they are ~19px from each on a phone; they cannot be given the same target without swallowing the points, and adding a point is the rarer action. Don't "fix" this by growing `HIT_ADD` — measure the point-to-ghost distance first.
## What the export says about itself (`KitNote`)

Under each export CTA there used to be a paragraph: duplicate the koma in your slicer, a config.json rides along, the washi PDF is bundled, print at 100%. Five lines on a phone — about 95px of a sheet whose whole job is to leave room for the drawing, and 4 lines of a 336px panel on the desktop.

**The fix was not shorter prose. It was noticing that none of it helps you decide to press the button.** "Duplicate the koma", "set the printer to 100%", "a config.json is included" all matter once you *have* the file, in another application. A paragraph of them pinned above the button is Apple HIG's overwhelm-upfront in miniature. So:

- **Nothing at all is drawn until the export has actually run.** Following the observation above to its end: *every* line here is about the file you already have, in your slicer or at your printer — so before the download there is no reader for any of it, and the whole block appears as the download's own confirmation (`success-feedback`), manifest already open. On a 375×812 phone that is the pinned footer at **67px instead of 131**, i.e. 509px of inspector scroll instead of 445, at every sheet stop; on the desktop the panel gets the same 64px back. **Do not put it back on screen "so people see it"** — a paragraph read on the way past the button is the thing this section exists to have deleted, and it was measured at five lines.
- **The split within it is by consequence, not by length.** Loud once it appears: the one step that ruins the output if it is missed — printing at anything but 100% on the cardboard route, printing one koma where two are needed on the STL one. Everything else is the ZIP's **manifest**, reference material, folded behind a `同梱物` disclosure.
- **`kitNote` is three-valued (`null` / `"open"` / `"shut"`), and that is not a style choice.** Two booleans (downloaded? open?) admit "folded but never downloaded", a state this has no drawing for. The CTAs set `"open"`; the disclosure toggles the other two.
- **A list, not a sentence.** The manifest is one line per file, filename in mono. Prose has to be read; a list is scanned, and "what is in this ZIP" is a lookup, not an argument.
- **Both layouts, not just the phone.** This is an information-architecture change rather than a narrow-screen accommodation, and keeping prose on the desktop would mean two copies of the same copy drifting apart. It is the one place in this branch where the wide layout deliberately moved.

## Routing (`src/studio/route.ts`)

**One thing in this app has a URL, and that is the point.** Which view you are in, which ◇ is selected, how far the sheet is pulled — all transient, and an address for any of them would be a link that means something else tomorrow. The design is not in the URL either: it lives in localStorage and leaves as a file (`persist.ts`), because a silhouette is a dozen floats and a query string is not where anyone wants their work kept. The **build guide** is the exception because it is the one DOCUMENT here — worth linking to from a README or a message, and worth leaving with the back button.

- **The base path is read from the entry URL, not from `import.meta.env.BASE_URL`.** `vite.config.ts` sets `base: "./"` deliberately (the artifact is position-independent — the same `dist/` works at a user site's root and under `/tomoshibi/` with no rebuild), and the price of that is that the bundle genuinely does not know where it is mounted. It finds out by looking, once, at the path it loaded from: everything up to the last `/` is the mount, the segment after it is a known route or nothing. `/tomoshibi/` from a normal visit and `/tomoshibi/guide` from the 404 fallback both yield the same base.
- **Routes are ONE segment deep and must stay that way.** Relative asset URLs resolve against the *directory* of the current path, so `/tomoshibi/guide` loads `./assets/x.js` as `/tomoshibi/assets/x.js` and boots; `/tomoshibi/guide/print` would look one level too deep and the page would not start at all.
- **`dist/404.html` is a copy of `dist/index.html`, written by the `spa-404` plugin in `vite.config.ts`.** A static host has no rewrite rules, so a request for `/guide` never reaches index.html; GitHub Pages serves 404.html for anything it cannot match, the browser renders it, and `location.pathname` is left alone — which is what the router reads. It is copied from the EMITTED index.html rather than written from source, so it can never go stale against the hashed asset names. **This is the one thing `base: "./"` does not carry across hosts**: a host that ignores 404.html will 404 on `/guide` itself, though the app's own root still works everywhere.
- **Open pushes, close goes back** — one entry in, one entry out, so × and the browser's back button are the same gesture. **Except after a deep link**, where there is no entry to go back to and `back()` would take a first-time visitor off the site from the page somebody sent them; the first close then REPLACES instead.
- **A path naming no page is normalised away.** It renders the app, so the URL should say the app — otherwise a mistyped or stale link leaves `/nope` in the bar for the rest of the session, being copied back out of it.
- **Every history write is wrapped (`writeUrl`) and its failure is swallowed.** The history API throws on a `file://` document, and opening `dist/index.html` off the disk is a case `base: "./"` deliberately supports. An exception on the way into the guide would take the whole app down, which is far worse than the URL not changing — so it falls back to plain state: the page still opens and closes, it just has no address.
- **Verified against a mock of GitHub Pages, not just the dev server.** Vite's dev server and `preview` both do SPA fallback of their own, so neither can tell you whether 404.html works. `scratchpad/pages-server.mjs` in the session that added this served `dist/` under a `/tomoshibi/` prefix with no rewrites: `/tomoshibi/guide` → 404.html → app boots, guide renders, relative assets resolve. Re-do that, not `npm run preview`, if you touch any of this.

## The header's `☰` (`ui/Menu.tsx`)

One menu at the top right — on the phone's chip bar, and in the wide panel header, the same button in both. It holds what acts on the **app** or on the design **as a file**: the intro card, the language, backup save/restore, and reset. It replaced a `?` and a language toggle standing in the row itself.

- **It is a `☰` even though nothing in it is navigation, and that is a knowing departure from the convention** (☰ = navigation drawer, ⋯/⋮ = overflow of actions). By the convention this should be `⋯`: the app's navigation is the two selects immediately to its left, they stay visible, and the view one is filled accent precisely because it says where you are. What decided it the other way is that `⋯` is materially harder to find — it reads as "more options for the thing next to me" — while `☰` is read as "this app's menu" by everyone, which is what the contents are. The usual case against hamburgers (NN/g) is about hiding NAVIGATION, and nothing navigational is hidden here. **Do not put a destination in this menu** — that line is what the trade rests on.
  - **That rule is spent, and the glyph turned out not to need it.** 「作り方」 is now a real page at `/guide` with an address of its own (see "Routing" below), so there IS a destination in this menu — and a menu with a place to go in it is a navigation menu, which is what ☰ has meant all along. The departure closed itself. What the rule was actually guarding is worth keeping in its place: **the app's primary navigation stays visible.** The two selects to the left are how you move between views and are never folded away; what may join them in here is the occasional document, alongside the settings. Do not fold a VIEW in here. The button is a rounded SQUARE for the same reason it is at that end of the row: it stands among the view/route selects with the same corners, and a lone circle read as a different kind of control.
- **What justified folding anything away was measured, not assumed.** On a 375px phone the chip bar in **English** came to exactly 375px — view select 99 ("Assembly") + route select 144 ("Cardboard (beta)") + the two buttons 88 + 24 of gaps + 20 of padding — with its flex spacer collapsed to **zero**. Japanese, whose labels are shorter (64 / 129), had 55px spare. One 36px button in place of those two returns 52px / 47px, and the row that carries the app's top-level navigation stops being full in the language that fills it. **The binding language here is English, not Japanese** — the opposite of the usual assumption in this file, and the reason to re-measure both before adding anything to that bar.
- **Undo and redo deliberately stayed out**, and `Toolbar.tsx` is now those two and nothing else. They are the recovery path for a direct-manipulation editor that fills the screen — the frequent case an overflow menu exists to make room *for*. They do not fit the bar either: in English the right-hand cluster has 88px to spend and `⋯` + undo + redo is 124.
- **Reset is separated and states its consequence.** It sits below a rule, in warn colour, with the sentence that used to be its `title=` as a second line — a phone has no tooltips, and a destructive row in a menu needs the separation (`destructive-nav-separation`).
- **The two file rows are named for what they are FOR** — 「バックアップを保存」/「バックアップから復元」, not 「設計を書き出す/読み込む」. There are exactly two moments either is reached: browser data gone, and restoring the `tomoshibi_config.json` out of a kit ZIP downloaded months ago — which is also the ONLY reader that file has, so neither row may be deleted while the ZIP still ships it. `KitNote`'s manifest already calls it 設計のバックアップ; the menu now says the same word.
- **The language row is a setting, not a verb**: the row is named 「言語」 and the right-hand side shows what it would become. The old control was a button captioned with its own opposite (「EN」 while in Japanese), which also made the bar 16px taller in one language than the other.
- **The file `<input>` lives in `TomoshibiStudio`, not in the menu.** A menu row unmounts the instant it is clicked, and an input that is gone cannot open its own dialog. For the same reason the row runs `onClick()` *before* closing.
- **Focus moves into the menu only when it was opened from the keyboard** (`detail === 0` on the click is how Enter/Space announces itself). Focusing the first row after a tap lights it up under a focus ring for someone who never asked; not focusing it at all leaves a keyboard user Tabbing into a list that just appeared. Escape is handled on the wrapper rather than on the rows, because after a pointer open the focus is still on the trigger.

## Tailwind (v4, `@tailwindcss/vite`)

The app's look is utilities on the elements. `src/index.css` is **17 rules and about 100 lines of actual code**, and every one is something a utility cannot be: the reset on `*`/`html`/`body`/`#root` (there is no element to put a class on), the range slider and its five vendor pseudo-elements, the global `:focus-visible` ring, the two `.pg` rules that style markup **papercraft generates as a string**, and the print rules that hide everything which is not the guide (`#root > div > *:not(.guide)` reaches elements the guide does not render). Tailwind is a **devDependency**, so the four runtime dependencies are still four.

**`.pages` and `.guide` are MARKERS and carry no declarations** — the sheet is an SVG string, so there is no element to put a utility on, while the pane's own grid is utilities in `PagePreview.tsx`. **A style attribute is not banned, and three survive on purpose**: the viewport's `background` (a gradient that follows `isLit`; as an arbitrary class it is ninety characters of punctuation), the sheet's `height` and transition (a live px number mid-drag), and the chips' two colours. The test is whether the thing is a VALUE the app computes or a look the app has.

Six decisions are load-bearing, and four depart from how Tailwind is normally set up:

- **No preflight.** index.css imports `tailwindcss/theme.css` and `tailwindcss/utilities.css` and declares the layers itself. This app already has a reset, and one line of it — `html { height: 100svh }` — is what keeps the layout from collapsing on iOS. Two resets arguing over `html`/`body` is not something to discover on a phone. The one thing preflight is genuinely needed for is border-style, and v4 does not need it: `.border` emits `border-style: var(--tw-border-style)` with `solid` as the registered initial, checked in the built CSS rather than assumed.
- **The app's own CSS lives in `@layer components`.** An **unlayered rule beats every layered one regardless of specificity**, so while the app's CSS sat outside a layer, `* { margin: 0; padding: 0 }` silently defeated every spacing utility: `px-12` computed to **0px** with the class in the DOM and the rule in the stylesheet, and nothing warned. Found by measuring, not by reading. `check:style` fails if the wrapper is removed.
- **`--spacing: 1px`, so a spacing utility's number IS its pixel count.** `gap-10` is 10px here and 40px everywhere else in the world; this **will** surprise anyone who knows Tailwind and is the one convention deliberately broken. Measured first: only **40%** of this app's spacing values land on a 4px grid (5, 6, 7, 9, 10, 11, 13, 14, 18, 22, 26 are all in use), because the layout was built by measuring a 375px phone rather than by picking off a scale. At the default base every second utility would be `p-[9px]` — an inline style in a costume.
- **`--color-*` and `--text-*` are cleared with `initial`**, so `text-red-500` and `text-xs` do not silently exist. The palette is `UI`/`accent` and the scale is `FS`, both in `ui/theme.ts`, which stays the **source of truth** because SVG presentation attributes need a literal value. `@theme` is a hand-written mirror and `check:style` is the link.
- **The alpha ladder is spelled out as colours (`--color-accent-45`, …) rather than reached through Tailwind's `/45` modifier.** That modifier resolves to a `color-mix` in oklab — a round trip through another colour space for a value this app already publishes as exact rgba — and its no-color-mix fallback for `/6` is `#d95b180f`, alpha 0.0588 rather than 0.06.
- **`@custom-variant narrow` is the app's one breakpoint, and it is 859px rather than 860.** `useNarrow(860)` builds `(max-width: 859px)` while the hand-written blocks it replaced said `max-width: 860px`, so at **exactly** 860px the stylesheet was in the narrow layout and React was rendering the wide one. Two other breakpoints stay inline as `max-[480px]:` (the welcome card, which keys off whether the CARD has room) and `max-[360px]:` (the point bar).

**A big rule belongs in a COMPONENT.** The objection to converting the 11–15 declaration rules assumed the call sites stay raw HTML; measuring found they were nearly all used from exactly one place already. What exists now: `Button`, `Badge`, and the two shared skins `SEG_SKIN` and `NOTE_SKIN`. **`@apply` is used nowhere**, and should stay that way — it is the class again with worse tooling.

**Two traps that cost real time, and will again:**

- **Utilities do not override each other by string order.** They share a specificity, so which wins is decided by ORDER IN THE GENERATED SHEET: Tailwind emits `p-*` before `px-*`/`py-*`, so `p-0` written after `px-4 py-7` loses. That is why `SEG_SKIN` is a shared string each caller composes with its own box rather than a base a caller overrides, and why `CTA`'s border lives in the outline BRANCH — `border` on both plus `border-transparent` on the filled one looks equivalent and is not, because box-sizing is border-box and a transparent 1px border still eats 1px of padding.
- **A stylesheet read one class at a time loses its GROUPED selectors.** `.ptbar-seg > .seg, .ptbar-mode { … }` gave all three point-bar buttons one box; converted per class, the ◇/■ pair silently lost its column layout and its 9px caption and rendered as italic text beside a glyph. Read whole rule blocks, selector list and media context included.

**`npm run check:style` is what makes any of this safe**, and it grew from one section to five while the conversion was going on — every one added after a bug got through:

1. the type scale in three encodings (`FS`, index.css literals, `@theme`) plus the palette in two, both directions;
2. the `@layer components` wrapper, whose absence is invisible;
3. **every class in an index.css selector must be rendered by something in `src/`** — this catches a rule left behind by an element that moved to utilities (`.guide-steps .btn { margin-top: 12px }` outlived the `.btn` it targeted, and the guide's button lost its 12px);
4. **every class attribute token must match a rule in the BUILT stylesheet** — the same problem from the other side, covering project classes and utilities alike. A typo'd utility (`rounded-8`, which looks fine and generates nothing because v4's `rounded-*` reads a `--radius-*` namespace) and a dead project class (`className="sec"` after `.sec` was deleted) are both a class in the DOM with no rule behind it. **It reads the SKIN CONSTANTS too** — `SEG_SKIN`, `NOTE_SKIN`, `PT_BTN`, `PT_CAP`, `CHIP_BOX`, `TAB_SKIN`, the biggest class strings in the app — and which constants those are is **not guessed from their names**: the identifiers are read out of the `className={…}` expressions that use them, so a new skin is covered the moment it is used;
5. `x--y` modifiers used but never defined — narrower than (4) but it names the file and line.

Both the CSS scan and the source scan **strip comments first**: this repo documents the rules it enforces, and the layer guard first failed on a correct stylesheet by finding the reset quoted in the paragraph explaining it.

**The corner scale is `RADII` in `ui/theme.ts`, six steps**, and it got the same fold the type scale did: `xs` 4 / `sm` 6 / `md` 8 / `lg` 10 / `xl` 12 / `2xl` 14, plus `rounded-full` for a circle, which is not on the scale because a circle is not a size. It was **thirteen** values before — one integer per person who reached for one. Values round DOWN. `check:style` fails on a raw `border-radius: Npx` in index.css (write `var(--radius-<step>)`, safe here unlike a font size because `@theme` emits these statically), on a `rounded-[Npx]` in JSX, on an inline `borderRadius`, and on `@theme` drifting from `RADII`. Pairs that had to keep matching still do — the `☰` and the row of selects were both 9px and are both `md`.

**Verification for a change here is a screenshot diff over 29 states** — 2 viewports × section / menu open / point selected / sheet pulled / assembly / print / lit / welcome / guide ×3, **plus 8 on the CARDBOARD ROUTE** (print preview, scrolled, guide, guide scrolled) — and a **computed-style diff over every element** (264 in the guide, ~230 in the app) for anything touching those. The 21 wide-route states do not exercise the cardboard route at all: `route` defaults to `stl`, so the print state is the 3D plates and `PagePreview` never renders. The rigs live in the session scratchpad rather than the repo; rebuild them if you need them. **Take every capture TWICE**: one screen in about twenty comes out with a few hundred anti-aliased pixels different for no reason, and a single capture will send you looking for a bug that is not there. It did.
## Conventions

**Proving an edit is comment-only.** Transpile each changed file with TypeScript's `removeComments`
and diff against `git show HEAD:<file>`; a parse failure is a FAILURE, never a pass (two empty
strings compare equal). Two things will fail that check for real reasons rather than a broken
verifier: merging two ADJACENT `{/* … */}` blocks removes an expression container from the emitted
child list, and **the built bundle is not a valid proof at all** — Tailwind v4 scans this project by
TEXT, `.md` files and comments included, so a class-like token written in prose ships a real CSS
rule (`p-[9px]` below is one; the comment explaining why not to write it is what generates it).


- **The type scale is `FS` in `ui/theme.ts`, nine steps, and nothing else may set a font size.** 9 / 10 / 11 / 12 / 13 / 14 / 16 / 20 / 25 px, named `2xs`…`3xl`. `npm run check:style` fails on a CSS `font-size` off the scale, a JS `fontSize` written as a raw number, an `FS.<name>` that does not exist (a typo is `undefined`, which React drops and CSS never sees — the text renders at the inherited size and nothing warns), and a step nothing uses.
  - **It used to be sixteen steps, five of them half-pixel**, carrying 36 of the app's 84 type declarations — `12.5px` alone on sixteen, which was every label in the inspector. None of them was chosen; each was a nudge that stuck, and once there are two the next one is free. The `.5`s were folded **down** and the sparse top end (15 / 15.5 / 17) merged into 16.
  - **Down rather than up, deliberately.** Several things here fit by a hair — the chip bar in English measured exactly 375px on a 375px phone — and every one of them has room for smaller text while none is guaranteed room for larger. Measured after the fold: the welcome card lost 4–5px, the chip bar's spare width went 52 → 58px in English, and the three numbers the narrow layout is specified by (chip bar 51, section view 717, inspector peek 44) did not move at all.
  - **`2xs` (9px) is not a rounding artefact and must not be folded into `xs`.** It is the PointBar's button captions, whose width was measured against a 46px button, plus the `beta` badge and the select carets.
  - **The scale is a JS export mirrored into `@theme`, and index.css sets no font size at all any more.** `check:style` compares the two. The reason the type scale was kept out of a `var()` when index.css still had font sizes has expired with the thing it was about: theme.ts used to WRITE its palette onto `<html>` at startup, so a `var()` was empty until the module ran — harmless for a colour (it inherits one), visible for a text size (the page resizes on boot). `@theme` emits statically, so that window is gone, the runtime block is deleted, and `var(--radius-sm)` in index.css is safe for exactly that reason.
  - **`three/figures.ts` (with `three/figures/`) and `papercraft.ts` are out of scope**, and the check does not read them. They draw into a WebGL frame and onto A4 at 1:1, where the unit is a world unit or a millimetre and 12 has nothing to do with 12px.
- **A component that spreads `...rest` onto an element must not also hand that element a `style`.** `ui/Logo.tsx` did both — `style={{ display: "block", overflow: "visible" }} {...rest}` — and every one of its three call sites passed `style={{ color: … }}`, so the two declarations it set were overwritten at each of them and the wordmark had been an INLINE svg since the day it was written. Two of the three are flex children, which blockify anyway; the third is the welcome card, where the inline box's descender space was 7px of card height. The shape that cannot go wrong is a `className` the component prepends its own classes to, because class strings merge and style objects replace. Nothing in the app renders differently for it except that card, which the fix took to 595px on a phone and 524 on the desktop — 497 / 462 since its prose came off (see "Onboarding").
- **Comments are in English** (match the existing style). Write units and intent for formulas and dimensions.
- **`<html lang>` follows the dictionary** (`useLang`). `index.html` can only ship one value and the app restores Japanese from localStorage, so without the effect the document claims to be English while showing Japanese. Not cosmetic on a phone: `lang` is what a mobile browser picks a CJK font fallback from and what a screen reader picks a voice from.
- **UI strings are Japanese, and the Japanese IS the dictionary key** (`i18n.ts`). So **editing any user-facing wording means editing `EN` in the same commit** — the old key does not warn, it just stops matching. Run `npm run check:i18n`; it fails on both halves of that mistake (the new wording with no translation, and the old entry left stranded).
- Keep `geometry.ts` as **pure functions** (don't bring in React/DOM). Otherwise the section view and STL will drift.
- So the shape matches across views, always draw the section view (SectionEditor) using `geometry.ts`'s functions (**including the dimensional constants** — don't reimplement them yourself). The groove half-width is consolidated into `grooveR(p)` (this used to be split between `higoD/2+0.15` and `+0.25`, and the section view drew a thinner groove than the STL).

