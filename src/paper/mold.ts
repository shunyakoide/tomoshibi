import { ribOutline2D, seatTicks2D, komaShape, maxBoards, midKomaList, notchR, wireRing2D } from "../geometry.ts";
import { A4, layout } from "./layout.ts";
import { pagesPDF, pagesSVG, tid } from "./render.ts";
import type { RawPart } from "./layout.ts";
import type { Page } from "../io/pdf.ts";
import type { Design, Pt2 } from "../types.ts";
import type { T } from "../i18n.ts";

// Cardboard does NOT get the 3D route's tab-tip dent (`paperP` sets `noTabDent`): the dent's 6x6mm
// comes out of the tip's inner corner, exactly where a cardboard tab tears along its flutes.
// Friction holds the koma instead (`fit: 0`). `check:paper` asserts it.

// Rib: a smooth outer edge with no grooves carved + ticks at the bamboo-rib winding positions. No
// lightening windows — cardboard is light, and windows only weaken it and add cutting effort.
function ribPart(pk: Design, k: number, name: string): RawPart {
  // `seatTicks2D` is the one source for where the bamboo goes on this route — the section overlay
  // and the assembly preview draw the same lines (geometry/rib.ts).
  return { name, outline: ribOutline2D(pk, k, { smooth: true }), marks: seatTicks2D(pk, k) };
}

// Koma: the same `komaShape` as 3D, but from `paperP()` — three inputs differ, not just the
// thickness, so the notch WIDTH is the material thickness (boardT = matT, fit = 0) and the notch is
// FULL-DEPTH, the tab being undented. `check:paper` pins notchR(pk) === innerRi(pk) - 0.5.
function komaPart(pk: Design, name: string): RawPart {
  const pts = komaShape(pk).extractPoints(1).shape.map((v): Pt2 => [v.x, v.y]);
  return { name, outline: pts };
}

/**
 * An opening hoop, as a line to bend WIRE against rather than anything to cut. The 3D route prints
 * these two parts; cardboard has nothing to print them with, so the template draws them full scale
 * and the maker bends them (`wireRing2D` — the same `openingR()` the printed ring is sized from).
 *
 * The only part on the sheet with an empty `outline`, and the reason `note` exists: every other line
 * on this paper is a cut line or a hint beside one, so a hoop that said nothing would be cut out.
 */
function wirePart(pk: Design, top: boolean, t: T): RawPart {
  return {
    name: t(top ? "口輪(上)" : "口輪(下)"),
    outline: [],
    bend: [wireRing2D(pk, top)],
    note: t("針金(2mm)を曲げる線"),
  };
}

/**
 * The design as the CARDBOARD route builds it: measured material thickness in place of the printed
 * board thickness, the rib count clamped to what that thickness still allows, `fit: 0` (the 3D-print
 * 0.3mm would leave a cardboard joint wobbling), `noTabDent` (see the dent note above) and
 * `noCrescent` — the rib's inner edge runs straight, being cut by hand with a knife.
 *
 * Exported because the **washi PDF that ships with this route must be built from it too**: the panel
 * is one rib-to-rib arc wide, so a clamped rib count means wider panels, and a skin cut from the
 * design as edited would not meet itself on the mold this template makes.
 */
// The joint, sized for board rather than for plastic (see `Design.joint`). Both PROVISIONAL — the
// kind of number this project takes from a build, and nothing has been cut to them yet.
//   wall = the material's own thickness. The 3D route's 1.6mm is a printed wall; on board it is a
//     strip of two liners, and it is what the app's own "too thin" alert has been reporting all
//     along (that alert calls anything under half the thickness too thin — this is twice it).
//   grip = 20mm of tab inside the notch, a REQUEST that `komaR` caps at the opening. It was 10, under
//     what the mouth hands the tab anyway, and so never did anything. 20 is the band the default egg
//     has in 2mm board (26 − 6), so it asks for real width on a wide mouth — `たる` gets 20mm of tab
//     out of a 46mm band instead of all 46 — and on a narrow one the cap answers with the band.
//     What it must never do is decide the tab may stand outside the opening — that is `komaR`'s
//     call, and the maker's answer there was no.
const JOINT_GRIP = 20;
export function paperP(p: Design, matT: number, midKoma = false): Design {
  const pk = { ...p, boardT: matT, komaT: matT, fit: 0, noTabDent: true, noCrescent: true, midKoma,
    joint: { wall: matT, grip: JOINT_GRIP } };
  pk.boards = Math.min(pk.boards, maxBoards(pk));
  return pk;
}

/**
 * What the measured material thickness does to the mold, without building a part — so the app can ask
 * on every render (paperParts returns the same numbers, at the cost of every outline). Two facts,
 * both fixable by changing the design: `wall`, the koma left BETWEEN two notches at the notch bottom,
 * which thicker material thins until it tears when hand-cut (below half the material thickness); and
 * `clamped`/`nMax`, whether the rib count had to come down, the notches otherwise overlapping each
 * other at the deepest the hub may go (`maxBoards`). A thin strip of board where a rib passes the
 * mouth does NOT clamp the count — that is reported and left to the maker (`ribMouthBand`).
 */
export function paperFit(p: Design, matT: number, midKoma = false) {
  const pk = paperP(p, matT, midKoma);
  const nMax = maxBoards(pk);
  return {
    wall: (2 * Math.PI * notchR(pk)) / pk.boards - matT,
    thin: matT / 2,                      // the threshold: thinner than half the material tears when cut by hand
    clamped: p.boards > nMax,
    nMax,
  };
}

/**
 * Every part to lay out: the mold (ribs + koma) plus the two opening hoops — and nothing else, the
 * washi panel being a separate document. The returned p is `paperP()`'s, so `boards` is already
 * clamped to maxBoards; `clamped` reports it so the UI/page can warn.
 */
export function paperParts(p: Design, matT: number, t: T = tid, midKoma = false) {
  const pk = paperP(p, matT, midKoma);   // = the mold this template actually cuts (thickness applied, count clamped)
  const { wall, clamped, nMax } = paperFit(p, matT, midKoma);   // one source for the fit warnings, shared with the app's alert

  // All ribs are identical unless spiral winding shifts the tick positions per rib; identical ones
  // are emitted as a single sheet labelled "×N" rather than N duplicates.
  const ribParts: RawPart[] = [];
  if (pk.spiral) {
    for (let k = 0; k < pk.boards; k++) ribParts.push(ribPart(pk, k, `${t("羽根板")} ${k + 1}/${pk.boards}`));
  } else {
    ribParts.push(ribPart(pk, 0, `${t("羽根板")} ×${pk.boards}`)); // Number stays outside t() so the default name still contains the plain word for the tests.
  }
  // Koma: the two on the ends, plus a mid koma for each one a long mold takes. On CARDBOARD they are
  // one outline — the tab is undented here, so the end koma's notch already runs full depth to the
  // rib's inner edge, which is exactly where the mid koma's goes (`check:paper` pins the two radii
  // equal). So this is a count, not a second part; only the 3D route cuts a separate shape.
  const nKoma = 2 + (midKomaList(pk)?.length ?? 0);
  // Laid out as one sheet per koma normally, or a single "×N" sheet when the copies would spill onto
  // an extra koma-only page. Decided by comparing the page count on A4 (the print page).
  const eachKoma = Array.from({ length: nKoma }, (_, i) => komaPart(pk, `${t("コマ")} ${i + 1}/${nKoma}`));
  const oneSheet = [komaPart(pk, `${t("コマ")} ×${nKoma}`)];
  // The hoops go LAST — they are the one thing here nobody cuts, and the given order is the order
  // the parts are cut in. They ride in the page-count comparison below because that comparison has
  // to be made on the document that actually prints, not on the mold half of it.
  const wires = [wirePart(pk, false, t), wirePart(pk, true, t)];
  const pageCount = (ks: RawPart[]) => layout([...ribParts, ...ks, ...wires], A4).pages.length;
  const komas = pageCount(eachKoma) > pageCount(oneSheet) ? oneSheet : eachKoma;
  // The mold and the hoops it will be pulled out of — the washi panel is its own document.
  const parts = [...ribParts, ...komas, ...wires];
  return { parts, pk, clamped, nMax, wall };
}

/**
 * The template's pages as SVG, for the print view's in-app preview: the same pages, ops and renderer
 * as the PDF, so what is on screen is the sheet that comes out of the printer, page count included.
 * The preview never lays parts out itself — a second opinion about the layout is how a preview starts
 * lying about how many pages there are.
 */
export function paperPagesSVG(p: Design, matT: number, t: T = tid, page: Page & { name?: string } = A4, midKoma = false) {
  const { parts, pk, clamped, nMax } = paperParts(p, matT, t, midKoma);
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
export function paperPDF(p: Design, matT: number, page = A4, t: T = tid, midKoma = false): Uint8Array {
  const { parts } = paperParts(p, matT, t, midKoma);
  return pagesPDF(parts, page, t, t("TOMOSHIBI 段ボール型紙 {name} 原寸", { name: page.name }));
}
