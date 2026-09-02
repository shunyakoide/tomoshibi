import { ribOutline2D, grooveList, grooveR, outerR, komaShape, maxBoards, notchR } from "../geometry.ts";
import { A4, layout } from "./layout.ts";
import { pagesPDF, pagesSVG, tid } from "./render.ts";
import type { RawPart } from "./layout.ts";
import type { Mark } from "../geometry.ts";
import type { Page } from "../io/pdf.ts";
import type { Design, Pt2 } from "../types.ts";
import type { T } from "../i18n.ts";

const TICK = 5;      // Length of the bamboo-rib tick line (mm). Drawn inward from the outer edge.

// Cardboard does NOT get the 3D route's tab-tip dent (`paperP` sets `noTabDent`): the dent's 6x6mm
// comes out of the tip's inner corner, exactly where a cardboard tab tears along its flutes.
// Friction holds the koma instead (`fit: 0`). `check:paper` asserts it.

// Rib: a smooth outer edge with no grooves carved + ticks at the bamboo-rib winding positions. No
// lightening windows — cardboard is light, and windows only weaken it and add cutting effort.
function ribPart(pk: Design, k: number, name: string): RawPart {
  const h = pk.height;
  const outline = ribOutline2D(pk, k, { smooth: true });
  // Ticks come from the same `grooveList()` as the STL grooves: horizontal lines TICK mm inward from
  // the outer edge. Pass k, so spiral winding's per-rib shift is marked where 3D cuts it.
  const marks = grooveList(pk, grooveR(pk), k).map((y): Mark => {
    const x = outerR(pk, Math.min(Math.max(y, 0), h) / h);
    return [x, y, x - TICK, y];
  });
  return { name, outline, marks };
}

// Koma: the same `komaShape` as 3D, but from `paperP()` — three inputs differ, not just the
// thickness, so the notch WIDTH is the material thickness (boardT = matT, fit = 0) and the notch is
// FULL-DEPTH, the tab being undented. `check:paper` pins notchR(pk) === innerRi(pk) - 0.5.
function komaPart(pk: Design, name: string): RawPart {
  const pts = komaShape(pk).extractPoints(1).shape.map((v): Pt2 => [v.x, v.y]);
  return { name, outline: pts };
}

/**
 * The design as the CARDBOARD route builds it: measured material thickness in place of the printed
 * board thickness, the rib count clamped to what that thickness still allows, `fit: 0` (the 3D-print
 * 0.3mm would leave a cardboard joint wobbling) and `noTabDent` (see the dent note above).
 *
 * Exported because the **washi PDF that ships with this route must be built from it too**: the panel
 * is one rib-to-rib arc wide, so a clamped rib count means wider panels, and a skin cut from the
 * design as edited would not meet itself on the mold this template makes.
 */
export function paperP(p: Design, matT: number): Design {
  const pk = { ...p, boardT: matT, komaT: matT, fit: 0, noTabDent: true };
  pk.boards = Math.min(pk.boards, maxBoards(pk));
  return pk;
}

/**
 * What the measured material thickness does to the mold, without building a part — so the app can ask
 * on every render (paperParts returns the same numbers, at the cost of every outline). Two facts,
 * both fixable by changing the design: `wall`, the koma left BETWEEN two notches at the notch bottom,
 * which thicker material thins until it tears when hand-cut (below half the material thickness); and
 * `clamped`/`nMax`, whether the rib count had to come down, the widened notches otherwise overlapping
 * at the koma's centre.
 */
export function paperFit(p: Design, matT: number) {
  const pk = paperP(p, matT);
  const nMax = maxBoards(pk);
  return {
    wall: (2 * Math.PI * notchR(pk)) / pk.boards - matT,
    thin: matT / 2,                      // the threshold: thinner than half the material tears when cut by hand
    clamped: p.boards > nMax,
    nMax,
  };
}

/**
 * Every part to lay out: ribs + koma and nothing else — the washi panel is a separate document. The
 * returned p is `paperP()`'s, so `boards` is already clamped to maxBoards;
 * `clamped` reports it so the UI/page can warn.
 */
export function paperParts(p: Design, matT: number, t: T = tid) {
  const pk = paperP(p, matT);            // = the mold this template actually cuts (thickness applied, count clamped)
  const { wall, clamped, nMax } = paperFit(p, matT);   // one source for the fit warnings, shared with the app's alert

  // All ribs are identical unless spiral winding shifts the tick positions per rib; identical ones
  // are emitted as a single sheet labelled "×N" rather than N duplicates.
  const ribParts: RawPart[] = [];
  if (pk.spiral) {
    for (let k = 0; k < pk.boards; k++) ribParts.push(ribPart(pk, k, `${t("羽根板")} ${k + 1}/${pk.boards}`));
  } else {
    ribParts.push(ribPart(pk, 0, `${t("羽根板")} ×${pk.boards}`)); // Number stays outside t() so the default name still contains the plain word for the tests.
  }
  // Koma: two identical sheets (top & bottom) normally, or a single "×2" sheet when two would spill
  // onto an extra koma-only page. Decided by comparing the page count on A4 (the print page).
  const twoKoma = [komaPart(pk, `${t("コマ")} 1/2`), komaPart(pk, `${t("コマ")} 2/2`)];
  const oneKoma = [komaPart(pk, `${t("コマ")} ×2`)];
  const pageCount = (ks: RawPart[]) => layout([...ribParts, ...ks], A4).pages.length;
  const komas = pageCount(twoKoma) > pageCount(oneKoma) ? oneKoma : twoKoma;
  // Mold only — the washi panel is its own document.
  const parts = [...ribParts, ...komas];
  return { parts, pk, clamped, nMax, wall };
}

/**
 * The template's pages as SVG, for the print view's in-app preview: the same pages, ops and renderer
 * as the PDF, so what is on screen is the sheet that comes out of the printer, page count included.
 * The preview never lays parts out itself — a second opinion about the layout is how a preview starts
 * lying about how many pages there are.
 */
export function paperPagesSVG(p: Design, matT: number, t: T = tid, page: Page & { name?: string } = A4) {
  const { parts, pk, clamped, nMax } = paperParts(p, matT, t);
  // The fit facts ride along with the sheets because the print view shows both at once; the sheets
  // themselves are `pagesSVG`'s, the same ones the washi template gets.
  return { ...pagesSVG(parts, page, t), pk, clamped, nMax };
}

/**
 * The cardboard template as a print-ready PDF — the mold itself (ribs + koma) — downloaded inside the
 * route's ZIP next to the washi PDF, the same way the STL kit carries its own. `t` is the UI's
 * translator: the writer carries outlines for the characters WinAnsi cannot encode (pdf.ts /
 * tools/pdffont), so the sheet prints in the language the app was showing rather than dropping the
 * labels it cannot encode (`" ×8"`, the word gone).
 */
export function paperPDF(p: Design, matT: number, page = A4, t: T = tid): Uint8Array {
  const { parts } = paperParts(p, matT, t);
  return pagesPDF(parts, page, t, t("TOMOSHIBI 段ボール型紙 {name} 原寸", { name: page.name }));
}
