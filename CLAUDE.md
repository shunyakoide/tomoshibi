# CLAUDE.md

Harigata Studio (張型スタジオ) — a web app that generates **3D-printable forming molds (harigata)** for building washi paper lanterns (paper lamps). Editing the cross-section directly produces STLs for the ribs, koma (hubs), and stand.

## Terminology and roles (read this first)

The real-world lantern-making process: **wind bamboo ribs onto the mold → paste on washi paper → once dry, disassemble the mold and pull it out**. This app is about 3D-printing that mold as separable parts.

> **Currently the grooves are horizontal rings** (identical position across every rib). If you want a spiral, the person winding does it diagonally. Each part's role is as follows (**these definitions and relationships are fixed — do not change them arbitrarily in the implementation or explanations**).

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
| **tab (tsume / tab)** | The **straight tongue** at the rib's end. It plugs into the koma's notch. Width = **board thickness `boardT`** (nominally equal to the koma's notch width). Only the notch side adds the **print tolerance `fit`** to become `boardT + fit`, leaving a real-world fit clearance (the tab itself stays `boardT`). No **outward** steps, hooks, or protrusions. **Only the top tab** has an **inward shelf** on its inner edge (a stopper preventing the top koma from sliding inward). In a lantern maker's mold there is no neck and "tab = neck" (which is why the neck is an optional design element). |
| **koma (コマ)** | The **small gear-like hub** that gathers and bundles the tabs (two of them, top and bottom, completely identical). Notches around the rim where the tabs plug in. Outer diameter = `komaR`. The stand receives it. This is a **real craft term**; in the trade it is also called "**kagami (mirror / 鏡)**" (the forming mold is assembled and fixed by inserting it into the grooves of the top and bottom koma = kagami). |
| **stand (dodai / 土台)** | The **base** that supports the assembled mold. Two **posts** of constant thickness receive the koma's rim in a U-shaped saddle, and a single base plate holds the posts at the correct spacing. Fully flat, needs no print supports. Users often reuse it (they don't print it every time). |

**Assembly relationships**: rib (tab) → plugs into → **koma** → sits on → **stand**. The bamboo rib winds into the **grooves** on the rib's outer edge. The rib's outer edge revolved forms the **lamp body** surface onto which the washi is pasted. The **neck** positions the opening (a vertical rectangle) and is **independent of the tab size**.

## Commands

```bash
npm run dev       # Vite dev server (HMR, --host). Default http://localhost:5173/
npm run build     # Production build (= npx vite build). Always confirm it passes after changes.
npm run preview   # Preview the build output
```

No test runner. **Correctness is verified by "the build passes" + "the STL is watertight (manifold)"** (see below).

## Tech stack

Vite 7 + React 18 + three.js 0.169 (all plain JS/JSX, no TypeScript). Minimal dependencies.

## Architecture

- **`src/geometry.js`** — the core. **Pure functions** that generate the cross-section profile and the 2D cross-sections / 3D geometry of the three parts. They return three.js Shape/ExtrudeGeometry but **have no dependency on React or the DOM** (shared by both section drawing and STL export). If you add logic, start here.
- **`src/config.js`** — `PRESETS` (control-point templates for shapes) / `DEFAULTS` (initial parameters) / `SIL_ROWS` (scrub-row definitions).
- **`src/SectionEditor.jsx`** — the **direct-manipulation editor** for the cross-section (SVG). Drag/add/delete control-point ◇ handles, toggle corner/smooth, and visualize the neck/lamp-body/tab (rib). It uses `geometry.js`'s `outerR` etc. directly so it matches the 3D/STL exactly.
- **`src/HarigataStudio.jsx`** — the app itself. The various control UIs in the right panel plus the four 3D views (`2d` = cross-section / `mold` = assembly / `print` = printing / `lit` = lit).
- **`src/stl.js`** — STL export (+ `openHTML`, which opens the papercraft HTML in a tab).
- **`src/papercraft.js`** — **papercraft** (A4 full-scale 1:1 print pages for building the mold from cardboard/thick paper). A pure module that derives the SVG from `geometry.js`'s 2D functions (see "Papercraft" below).
- `main.jsx` / `index.css` — entry point and styles.

## Coordinate system and units

- **All dimensions in mm.** Ribs/koma/stand are a **Shape on the XY plane + extruded along Z** (= oriented for flat printing as-is).
- `outerR(p, t)`: height-normalized `t∈[0,1]` (0 = bottom, 1 = top) → outer radius in mm. The heart of the profile.

## Profile model (important)

The silhouette is a radius function connecting the **control-point array `p.pts = [{t, r, sharp?}]`** (ascending) via **monotone Hermite interpolation** (Fritsch–Carlson, `fukuroTangents`/`fukuroSpline`). To suppress warping and unwanted sharp curves, tangents are clamped to the same sign as the adjacent chords and to within 3×.

- **The outermost control points (`pts[0]` / last) = the opening = the neck radius.** Matching them here removes any wasteful flare (S-curve) from the neck into the lamp body.
- **The neck (kubi)** = a **vertical rectangle** outside the outermost control point (always a rectangle — never angled). Presence is independent top/bottom via `neckBot` / `neckTop`. The neck's height and overhang are adjusted with the ◇ handle in the section view (horizontal = overhang / vertical = neck height).
- **The lamp body (hibukuro)** = the curve **between** the outermost control points + bamboo-rib grooves. `fukuroRange(p)` gives its t range.
- **The design reference for the neck and tab is "the control-point radius"** (`openMin`/`bodyMinR`), and it **does not depend on whether the neck exists**. Toggling the neck does not change the tab (koma) size. On the side without a neck, the opening becomes the tab size (`komaR`).

## Design rules (repeatedly raised points — fixed items so they don't need re-explaining)

Always obey the following when changing the shape. Removing these has caused reverts in the past:

- **The neck is always a vertical rectangle.** No slanted taper or angle. Its only role is positioning the opening.
- **Do not change the tab (koma) size based on whether a neck exists.** The neck widens the opening outward. Without a neck, opening = tab size.
- **The tab is a straight tongue.** No **outward** steps, hooks, or protrusions (the outer edge matches the koma outer diameter `kR` exactly and does not stick out).
- **Exception: the top koma's inner stopper** (added by reference to a real paper-lamp mold). **Only the top tab** gets an **inward shelf** on its inner edge (`komaStop2D()`) to **stop the top koma from sliding into the lamp-body side (inward)**. The bottom tab stays a plain straight rectangle.
  - **The koma is pulled out "outward" (toward the tab tip) after work.** So the shelf sits **only on the inner side of the koma** and does not clamp it from both sides → no need to ride over it, so insertion/removal stays free. Blocking this makes the mold impossible to disassemble.
  - The shelf's height is `height + tabLen - komaT` = the position of the "koma inner face" when the koma is seated all the way to the tab tip. This **matches** the position `standSlotSep` assumes, so **adding the shelf does not move the stand** (it just guarantees by shape a position that was previously left to operation).
- **Tab width = board thickness `boardT`** (nominally equal to notch width). Notch width = `boardT + fit` (`fit` = print tolerance, added in `komaShape()`). Rather than "cramming it tight", match nominally and leave only the real-world clearance `fit`. With `fit=0` there is no gap, as before.
- **Hollow the rib's inner edge "only at the center"** (`ribInnerX()`). Real paper-lamp molds have this shape, to make the rib easy to pull out through the opening. **Do not bend the whole rib** (bending it end-to-end makes an impossible shape / a constant-width band gives an opening ≫ koma shape that never reaches the tab, splitting the rib in two). The top and bottom ends stay at **core `Ri`**, so the connection to the tab is unchanged. The hollow amount is the center depth × `RIB_CURVE_D` (real ones are about 20%). **It does not propagate to the outer edge, grooves, tab, koma, or stand** (only the inner material is reduced).
- **The groove's barb (tooth tip) leans toward the center = the equator** (not toward the opening). Do not place grooves right next to the opening; leave a half-pitch buffer (barbs at the very end don't work).
- **Grooves go evenly spaced across the entire lamp-body curve.** The curve always needs grooves.
- **Curves stay smooth.** Do not create wasteful sharp curves or S-warps derived from the control points (matching the outermost control point = the opening removes the flare at the neck).
- **Don't casually change the height or the stand.** Users reuse the stand. Dimension changes propagate to the joints (below).

## Part joints (invariants for printing and assembling)

The mold is **rib × N + koma × 2 + stand**. Whether a reprint "fits the previous koma/stand" is determined by these values:

- **Rib tab ↔ koma**: board thickness `boardT` (the tab's thickness; notch width is `boardT + fit`) / `innerRi` (tab tip = notch-bottom radius) / `boards` (tooth count). If these three are the same, the tab plugs in to the same depth. `fit` only adds tangential fit clearance and does not affect engagement depth. `komaR` (koma outer diameter) only sets the koma's outward overhang and does not affect engagement.
  - **Implementation**: this engagement is **consolidated into the single function `innerRi()`** (`src/geometry.js`). Because `ribOutline2D()` (which makes the tab) and `komaShape()` (which cuts the notch) **call the same `innerRi()`**, the tab-tip depth and the notch bottom necessarily match. The only place that can break this invariant is `innerRi()` alone. Check the impact on both before touching it.
  - **Tab depth (engagement) and stand independence**: `innerRi()` is the legacy reference `nominalRi()` deepened toward the center by `TAB_DEEPEN` (tab tip / notch bottom). Meanwhile `komaR()` is based on `nominalRi()`, so **deepening the tab does not move komaR = the stand dimensions**. To prevent the wall between adjacent tab notches from getting thin and non-manifold from over-deepening, `ribCoreFloor()` (computed from the minimum inter-tooth wall thickness MIN_WALL) imposes a center-side limit.
  - **Notch bottom `notchR()` is also shared**: `komaShape()` (which cuts the notch) and `komaStop2D()` (which hangs the shelf on the solid part inside it) call the same `notchR()`. The shelf overhangs inside `notchR`, but **overhanging too far makes adjacent ribs' shelves interfere near the center**, so a minimum radius is imposed from the circumferential clearance (if there is no room, no shelf is made and it falls back to the legacy shape). The deeper `TAB_DEEPEN`, the less room for this shelf (both fight over the same inner space).
- **Koma ↔ stand**: `komaR` (saddle receiving radius = `komaR + SADDLE_FIT`) / `komaT` (koma thickness = post thickness) / `standSlotSep(p) = height + 2*tabLen - komaT` (post spacing) / `maxRadius(p)` (post height = floor clearance).
  - **Implementation**: `komaR()` (koma side) being called by `standGeometry()` (stand side) is **the single cross-edge bridging koma ↔ stand**. The post height traces back through `standSaddleH() → maxRadius() → outerR()`, so it **depends on the profile core `outerR()`** ⇒ changing the profile automatically moves the stand dimensions too (the substance of the caveat below).
- `komaR`/`tabDepth`/`innerRi` are based on the smaller opening (`openMin`). Note that **changing the opening radius changes the koma size**.

## STL watertightness (mandatory verification)

The ribs, koma, and stand must be **watertight (closed manifold)** or the print slicer breaks. After touching geometry, verify by sweeping across a representative parameter range. The test is the "shared count of undirected edges":

- 2 = closed (normal) / 1 = open edge / >2 = non-manifold. Additionally, no NaN vertices and no degenerate (zero-area) triangles.

**Verification is `npm run check:manifold`** (`scripts/manifold.mjs`). It sweeps 3 presets × height/bamboo-rib diameter/pitch/board thickness/tolerance/plate count and inspects 46,656 parts. Anything other than `0 FAIL` does not get merged. Additionally, for "refactors that shouldn't change the STL", use `npm run check:hash` (`scripts/hash.mjs`) to diff vertex hashes before and after the change and prove the shape didn't move (usage is in the comment at the top of the script). The save feature's sanitize is verified by `npm run check:persist` (`scripts/persist.test.mjs`), confirming that corrupt localStorage (broken pts, numeric strings, oversized boards, unknown version, etc.) recovers safely without crashing or producing a non-watertight koma. Papercraft is `npm run check:paper` (`scripts/paper.test.mjs`).

Past failure causes and fixes: grooves too deep (→ cap depth at `higoD*1.5`), near-duplicate points on the barb's sharp flank (→ clean duplicate points before extruding), single-control-point presets (→ div-0 guard in `splineR` / denominators), a thin strip remaining in the lightening window at a waist (→ shrink/drop the window where it's thin).

**Two kinds of earcut degeneracy (you will always hit these as you increase the point count; handled by `cleanPoly()` and `Y_STAGGER`)**:
- **Collinear points**: sampling the curve finely lays hundreds of "points on the same straight line" along a flat span. The side walls are built exactly along the point list, but **earcut drops collinear points**, so the boundary between cap and side wall shifts and becomes an open edge. → `cleanPoly()` thins out collinear points in addition to duplicates. **Apply it to both the outline and the lightening window** (the window side originally had no cleaning, and that was the hole).
  - **Implementation**: the point-list → `THREE.Shape` conversion is **consolidated into the single function `shapeFromPts(pts, holes)`**, which always applies `cleanPoly()` to both the outline and the holes. Build extrusion Shapes through here (writing it by hand forgets the cleaning and hits the degeneracy above — in fact `ribBandShape` had a copy of the cleaning that was missing only the collinear-point removal).
- **Same scanline**: if a lightening window's y-end lands at exactly the same height as an outline sample (`STEP=0.5mm`), the window corner and the outline vertex become collinear, producing a **zero-area triangle** and an open edge. → `Y_STAGGER=0.13` shifts the window's y-ends off the grid (`boardGeometry`'s `STAGGER=0.1` is the same fix).

## Papercraft (building from cardboard)

So it can be built without a 3D printer, the app outputs a print HTML laying out each part's 2D outline at **A4 full scale (1:1)** (`src/papercraft.js` → `paperHTML(p, matT)`). Open it in a new tab from "Open papercraft" in the print view and print it in the browser. **The paper side has its own fixed items too**:

- **The shape comes only from `geometry.js`'s pure functions.** Do not reimplement dimensions on the paper side (same rule as SectionEditor — if this drifts, the papercraft and STL produce different molds).
- **Don't cut the grooves (higo-me).** You can't carve a 0.5mm-precision V-notch into cardboard, so the outer edge is cut as a smooth curve (`ribOutline2D(p, k, { smooth: true })`) and the winding positions of the bamboo rib are shown with **dashed tick lines**. The positions come from the same `grooveList()` as the STL.
- **Don't open lightening windows.** Cardboard is light, and the windows only weaken it and add cutting work.
- **Material thickness `matT`** is the actual cardboard thickness the user measured. The koma's notch width is determined by it, so pass `{ ...p, boardT: matT, komaT: matT, fit: 0 }` **to all parts identically** (so the parts within the papercraft always mesh). Do not change the 3D side's `p`. `fit=0` (adding no print tolerance) is because cardboard's fibers crush as it goes in, so a nominal-exact fit meshes more firmly. For thick material it exceeds `maxBoards`, so **trim the rib count** and print a warning on the page.
- **Widen the tab's inner stopper (shelf) for cardboard.** With the 3D-print defaults, on thick material the tab tip gets pushed back out to `ribCoreFloor` and nearly coincides with the shelf's interference limit, so **the shelf disappears at ≥3mm thickness** (the room = `MIN_WALL 1.6 − shelf clearance 1.0`, independent of material thickness). Papercraft tightens `komaStop2D(p, { w, gap, min })`'s `gap`/`min` to push out to the full center room (these are default arguments, so 3D is unchanged). Note the shelf's position is `height + tabLen - komaT`, so **when the material thickness approaches the tab length the placement itself vanishes** → in that case no shelf is made and the page warns to "lengthen the tab".
- **Don't output the stand. Output a "cross stand" instead.** The 3D-print stand (`boardGeometry`/`standGeometry`) is designed to **support the koma** on thin posts, which in cardboard lacks the rigidity to stand on its own (it crushes / bends). For the requirement of wanting to stand the mold up while winding bamboo ribs and pasting washi, the papercraft outputs a **cross stand made of two strips crossed in an X** (`standParts`). Because the mold is an "egg shape with a fat belly = max diameter tapering toward the ⌀38 bottom koma", receiving only the central bottom koma leaves the whole belly floating in the air and out of the way of the work. The strips' top edges have a **V receiver (opening width < bottom koma diameter)** that constrains the koma centrally at 4 corners (2 strips' worth), and a central slot (one cut from the top, one from the bottom) interlocks them into an X. The foot diameter `standFootD` is set by the tipping margin from the center-of-gravity height of the thin paper shell, with a lower bound of 70mm (self-standing in the default shape; even at max height ⌀110, within A4). **Completed with household materials only** ([[household-materials-only]]): cardboard + cuts only, no glue, hardware, or shafts. **The koma, ribs, and 3D are not changed at all** (the stand is an independent new part).
- **Every page must include a 50mm full-scale ruler.** Shrinking under the printer's "fit to page" is the biggest source of accidents, and this is the only way to notice it with a ruler after printing. **Glue tabs (10mm) are added only when splitting a part that doesn't fit on one page.** Page layout is two stages: (1) pack parts into rows → (2) pack rows into pages, and **a row that fits on one page is never straddled** (if it doesn't fit, start the next page at the beginning of that row = no gluing). Each page is clipped by `top`〜`bot`, where `bot` is "if the next page is a continuation of the same row, `top+CH` (= overlap), otherwise the next page's start position". Without this distinction, the head of the next row prints onto the previous page's bottom edge and a glue tab appears where no gluing is needed.

Verification is `npm run check:paper` (`scripts/paper.test.mjs`). The test is not watertightness but **① being full scale (page dimensions = geometry.js invariants) ② no parts missing from the layout ③ no NaN in the SVG** (the browser silently ignores NaN, so you'd only notice after printing). It additionally checks that **notch width = material thickness** and that **the stopper is always generated as long as there is room** (both directly cause "won't fit when assembled" and can't be caught by looking at the paper).

## Future work (not yet implemented — homework from studying a real mold)

- **Continuous bamboo-rib grooves**: real molds have **grooves so fine and continuous there is no flat span**, and the craftsperson picks "every so many grooves" to wind (= the mold doesn't dictate the winding pitch / the bamboo rib always drops into some groove). Currently they are isolated V-notches at `pitch` (default 9mm) intervals with flat spans between. Implementing this requires changing `grooveList`'s step to be groove-width-based and rebuilding `grooveOuterX` as a **periodic sawtooth** (it's currently a `max` composite of isolated Vs, so packing them shaves the tooth tips and doesn't give the intended sawtooth). It also requires deciding the meaning of `pitch` (make it just a winding-guideline display / reinterpret it as "how many grooves apart to wind" / etc.).
- **Spiral winding**: let the bamboo rib be wound in a spiral by offsetting the grooves per rib. There used to be a `spiral` parameter and a UI checkbox, but **it was passed to a third argument `grooveList` doesn't accept and so had no effect** (all ribs had identical groove positions = horizontal rings), so it was removed as misleading dead code. To implement, have `grooveList` accept a groove-position offset and pass a shift amount derived from the rib number `k` from both `ribOutline2D` and `ribEdges` (both must be aligned by the same rule).
- **`ribSplitParts` (2-split mode) tabs don't match the body**: the split parts' top/bottom tabs are at `outerR±tabDepth` (based on the lamp body's outer diameter), which doesn't match `ribOutline2D`'s `Ri〜kR` (koma-based). **They shouldn't fit the current koma.** If you use split mode, this needs fixing.

## Conventions

- **Comments are in English** (match the existing style). Write units and intent for formulas and dimensions.
- Keep `geometry.js` as **pure functions** (don't bring in React/DOM). Otherwise the section view and STL will drift.
- So the shape matches across views, always draw the section view (SectionEditor) using `geometry.js`'s functions (**including the dimensional constants** — don't reimplement them yourself). The groove half-width is consolidated into `grooveR(p)` (this used to be split between `higoD/2+0.15` and `+0.25`, and the section view drew a thinner groove than the STL).

## Privacy

Do not write paths or usernames that identify a personal environment in externally shared documents (README, PR bodies, etc.); use repository-relative notation.
