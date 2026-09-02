/**
 * ============================================================================
 * PAPERCRAFT — 1:1 printable pages for building the mold from cardboard/thick paper
 * ============================================================================
 * Each part's 2D outline at **full scale (1:1)** on A4, written as a **PDF** (pdf.ts), so the mold
 * can be built without a 3D printer.
 *
 * Design policy:
 * ・The shape comes **only** from geometry.ts's pure functions — reimplement a dimension here and the
 *   papercraft and the STL make different molds.
 * ・**Don't cut the grooves (higo-me).** A 0.5mm V cannot be scored into cardboard: the outer edge is
 *   cut smooth (`ribOutline2D(p,k,{smooth:true})`), the bamboo positions dashed ticks from the same
 *   `grooveList()` as the STL.
 * ・**Material thickness `matT` goes to every part identically** — `{...p, boardT: matT, komaT: matT,
 *   fit: 0}` — so the parts always mesh; the 3D side's `p` is never modified. `fit: 0` because
 *   cardboard fibres crush going in and a nominal-exact fit meshes more firmly.
 * ・**Don't emit the stand.** Ribs + koma only; the user provides their own (a cardboard cross stand
 *   was removed at the user's request).
 *
 * The **washi template** (`washiParts` / `washiPDF`), the paper skin's flat pattern cut BEFORE
 * pasting, ships with both routes as its **own PDF** rather than as more pages of this one: the two
 * are printed at different moments, and `pagesPDF` numbers and seams the sheets of ONE document. On
 * the cardboard route it must be built from `paperP()`, not the design as edited (see there), and it
 * has **no on-screen preview** — `washiPagesSVG` is only the verification's second encoding.
 *
 * Every page is built once as drawing ops (`pageOps`) and rendered as SVG or PDF, so a full-scale bug
 * cannot hide in one of them. React/DOM-free (stl.ts opens or downloads the bytes).
 * ============================================================================
 */
/**
 * ---- The barrel ----
 * The implementation is one module per job in `src/paper/`; this surface is exactly what it was
 * before the split, so a function moving between those modules stays a non-event for callers
 * (`PagePreview.tsx`, `TomoshibiStudio.tsx`, `GuidePage.tsx`, `scripts/paper.test.mts`). Import from
 * HERE, never from `./paper/*` — the same rule `geometry.ts` carries, for the same reason.
 *
 * Dependencies run one way: layout ← draw ← render ← {mold, skin}, with style and svg as leaves.
 */
export { A4, MARGIN, TOPBAR } from "./paper/layout.ts";
export { STYLE } from "./paper/style.ts";
export { pagesPDF } from "./paper/render.ts";
export { paperP, paperFit, paperParts, paperPagesSVG, paperPDF } from "./paper/mold.ts";
export { washiParts, washiPDF, washiPagesSVG } from "./paper/skin.ts";
