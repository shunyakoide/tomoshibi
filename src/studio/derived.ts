/**
 * One direction of flow: the design plus the machine settings in, numbers and warnings out. No JSX,
 * no view state — `isLit` / `bedRules` / `paperPreview` are view predicates and stay with the view.
 *
 * The memo boundaries are the point. `washiG` sweeps a 0.5mm meridian, `bedFit` builds five
 * geometries, `heightLimit` walks up to 1,941 heights: all of it runs once per design change, in the
 * studio, and NOT once per panel section — which is what would happen if these moved into the
 * components that read them, since the inspector unmounts in lit view and on every route switch.
 *
 * Not named `figures.ts`: `three/figures.ts` is the guide's off-screen drawings.
 */
import { useMemo } from "react";
import type * as THREE from "three";
import {
  maxRadius, outerR, standBoardLength,
  ribGeometry, komaGeometry, standGeometry, boardGeometry, ringGeometry, ringLegsFit, ribPullFit, ribMouthBand,
  washiGore,
} from "../geometry.ts";
import { paperFit, paperP, templateOverflow } from "../papercraft.ts";
import { fitOnBed } from "../bed.ts";
import { LIMITS } from "../config.ts";
import type { T } from "../i18n.ts";
import type { Design, Route } from "../types.ts";

export type Figures = ReturnType<typeof useFigures>;
/** A warning line, and usually a "→ do this instead" under it. */
export type AlertItem = { key: string; head: string; hint?: string };

export function useFigures(p: Design, m: {
  bedW: number; bedD: number; matT: number; route: Route;
  washiSide: number; washiEnd: number; t: T;
}) {
  const { bedW, bedD, matT, route, washiSide, washiEnd, t } = m;

  const maxDia = Math.round(maxRadius(p) * 2);
  // The mold this route actually makes: on cardboard `paperP`, not the design on screen, since thick
  // material sets the board thickness and can clamp the rib count. The washi panel is one rib-to-rib
  // bay wide, so it must be cut for that mold — as must the pull-out check further down.
  const moldSrc = useMemo(() => (route === "paper" ? paperP(p, matT) : p), [route, p, matT]);
  // Washi panel figures for the readout. A 0.5mm meridian sweep, so memoized (dragging re-renders
  // constantly).
  // `moldSrc`, NOT `p`: the panel the readout describes has to be the panel the PDF cuts, and
  // `downloadPaperKit` has always passed `moldSrc`. Reading `p` here made the two disagree the
  // moment `maxBoards` clamped the count — at matT 8 the screen said 80x223 x8 while the file in
  // the ZIP was 124x223 x5, understating the width by 55%.
  const washiG = useMemo(() => washiGore(moldSrc, { side: washiSide, end: washiEnd }), [moldSrc, washiSide, washiEnd]);
  // Whether this opening has room for the sockets at all — asked apart from the checkbox, so the
  // panel can say "they will not fit here" without saying it to someone who turned them off. The
  // function the geometry reads, so the two cannot disagree.
  const legsFit = useMemo(() => ringLegsFit(p), [p]);
  // Opening radii, informational only: ribs come out by removing a koma and tilting them, so
  // "opening ≥ rib width" would not decide whether they clear. `ribPullFit` does, with its own alert.
  const topOpen = Math.round(outerR(p, 1));
  const botOpen = Math.round(outerR(p, 0));

  // Real footprint of every printed part (rebuilt only when the design changes). Actual bounding
  // boxes rather than "rib along depth, base along width", which broke on non-square (W≠D) beds: the
  // fit test can then use a 90° turn or a diagonal tilt, per part.
  const bedFit = useMemo(() => {
    const dim = (g: THREE.BufferGeometry): [number, number] => { g.computeBoundingBox(); const b = g.boundingBox!; return [b.max.x - b.min.x, b.max.y - b.min.y]; };
    const rb = dim(ringGeometry(p, false)), rt = dim(ringGeometry(p, true));
    return {
      rib: dim(ribGeometry(p, 0)), koma: dim(komaGeometry(p)), col: dim(standGeometry(p)),
      base: dim(boardGeometry(p)), ring: Math.max(...rb) >= Math.max(...rt) ? rb : rt,
    };
  }, [p]);
  const overParts = ([["羽根板", bedFit.rib], ["コマ", bedFit.koma], ["柱", bedFit.col], ["連結板", bedFit.base], ["開口リング", bedFit.ring]] as [string, [number, number]][])
    .filter(([, d]) => !fitOnBed(d, bedW, bedD).fits)
    .map(([name, d]) => t("{name} {n}mm", { name: t(name), n: Math.round(Math.max(...d)) }));
  const ribFits = fitOnBed(bedFit.rib, bedW, bedD).fits;
  const ribLen = Math.round(Math.max(...bedFit.rib));   // rib overall length, for the summary
  const ribBaseOver = !ribFits || !fitOnBed(bedFit.base, bedW, bedD).fits;
  // Tallest body at which BOTH length-driven parts still fit (usually the rib: wider than the base,
  // so it hits the diagonal limit sooner). Widths don't depend on height, so heights are tested
  // without rebuilding geometry, and fit is monotonic in height — walk up, stop at the first miss.
  const heightLimit = useMemo(() => {
    const ribW = Math.min(...bedFit.rib), baseW = Math.min(...bedFit.base);
    const baseConst = Math.round(standBoardLength(p) - p.height);   // base length minus height
    // 0 = no height fits at all: the parts are too WIDE, and the hint then stays away rather than
    // telling someone to shrink a body that was never the problem. (Seeded with the minimum it read
    // "→ reduce to 60mm" for a ⌀1.1m design.)

    let limit = 0;
    for (let h = LIMITS.height[0]; h <= LIMITS.height[1]; h++) {
      if (!fitOnBed([ribW, h + 2 * p.tabLen], bedW, bedD).fits || !fitOnBed([baseW, h + baseConst], bedW, bedD).fits) break;
      limit = h;
    }
    return limit;
  }, [bedFit, p, bedW, bedD]);

  // The cardboard counterpart to the bed-overflow check. Cheap enough to run every render, and
  // deliberately NOT limited to the print view: every way out of it (fewer ribs, thinner material, a
  // wider opening) is a control you reach for while designing. What it still reports is the rib-count
  // clamp; the koma wall it used to warn about is now the GEOMETRY's promise (see `buildAlerts`).
  const fit = useMemo(() => (route === "paper" ? paperFit(p, matT) : null), [route, p, matT]);
  // Stable identity, so the preview's memo isn't invalidated by every unrelated render.
  const washiOpts = useMemo(() => ({ side: washiSide, end: washiEnd }), [washiSide, washiEnd]);
  // Parts of the templates this route ships that are wider than A4's content column. The layout
  // clips them away rather than continuing them sideways, so without this nobody finds out until
  // they hold the sheet: a clip is the one fault a preview does not announce, the sheet looking
  // complete and the cut line simply stopping at the trim box.
  const overSheet = useMemo(() => templateOverflow(p, matT, washiOpts, route, t), [p, matT, washiOpts, route, t]);
  // Can the ribs still come out once the paste has dried? A deep body on a small mouth traps them in
  // the shade, and nothing else notices: every part prints, fits the bed and is watertight. Not a
  // route question — a cardboard mold leaves by the same hole.
  const pull = useMemo(() => ribPullFit(moldSrc), [moldSrc]);
  // Board left where a rib passes the narrower mouth — cardboard only: on the 3D route the hub is not
  // sized from the material and this never binds.
  const mouthBand = route === "paper" ? ribMouthBand(moldSrc) : null;

  return {
    maxDia, washiG, legsFit, topOpen, botOpen, overParts,
    ribFits, ribLen, ribBaseOver, heightLimit, fit, washiOpts, moldSrc, pull, overSheet, mouthBand,
  };
}

// The flute pitch of ordinary box board (6-8.5mm): under it the strip at the mouth may not hold one
// whole flute across, which is the point at which "thin" stops being a proportion and becomes a
// material fact. Under it the rim is at the opening rather than at `innerRi + grip`, so it is the
// tab's width too and one line covers both.
const MOUTH_BAND_WARN = 10;
/**
 * One COLUMN: bed (3D print) and koma wall (cardboard) are gated on opposite routes, but the
 * pull-out warning belongs to both, so stacking is the only arrangement that cannot overprint.
 * DATA rather than markup, because the narrow strip has to count them and quote one headline, and
 * a fragment is truthy even with every card inside it false.
 */
export function buildAlerts(f: Figures, a: {
  isLit: boolean; bedRules: boolean; bedW: number; bedD: number; t: T;
}): AlertItem[] {
  const { isLit, bedRules, bedW, bedD, t } = a;
  const alerts: AlertItem[] = [];
  if (isLit) return alerts;
  // Bed-overflow. Each part lies along a different axis, so the bed is width×depth. Gated on the
  // whole 3D-print ROUTE, not just the print view: cardboard has no machine to overflow, and
  // shortening the body would shrink a design for a limit that route does not have.
  if (bedRules && f.overParts.length > 0) alerts.push({
    key: "bed",
    head: t("{parts} がベッド {w}×{d}mm を超過", { parts: f.overParts.join(" · "), w: bedW, d: bedD }),
    // The height hint applies only to the length-driven parts (rib / base): skip it when only a
    // height-independent part (ring / koma / post) overflows, or when no height is small enough.
    hint: f.ribBaseOver && f.heightLimit >= LIMITS.height[0]
      ? t("→ 火袋の高さを {h}mm 以下に", { h: f.heightLimit }) : undefined,
  });
  // **There was a koma-wall alert here and it could not fire.** Thick material used to eat the wall
  // between two notches until it would tear when hand-cut, and this warned at half the thickness.
  // Then the joint started ASKING for a wall of `matT` (`Design.joint`, 2026-09-14) and the koma hub
  // grows until it has one, so over 1,854 designs — every preset, 4..16 ribs, 1..10mm board, openings
  // down to the floor — the wall never came in under `matT` at all, let alone under half of it. The
  // thinnest was exactly 1.000 × matT. Raising the threshold would not have helped: `wall < matT` is
  // 0 of 1,854 too. The risk did not vanish, it MOVED — the hub can only grow to the opening, and
  // past that `maxBoards` trims the rib count instead, which is the alert below this one (140 of the
  // same 1,854). A warning that cannot fire is the same lie as a gate that passes on anything, so it
  // is gone rather than left to reassure. `check:paper` pins the wall at `matT` or better, which is
  // the promise this used to be the fallback for.
  // Cardboard: the rib count the template actually cuts, when it is not the one the editor shows.
  // `maxBoards` still clamps for one reason — the notches meeting at the koma's centre, which is not
  // buildable at any thickness. Said out loud because the stepper reads the count you asked for.
  if (f.fit?.clamped) alerts.push({
    key: "ribs",
    head: t("羽根板を {n} 枚に減らして型紙にしています", { n: f.fit.nMax }),
    hint: t("→ 薄い材料にする / 断面図で開口を広げる"),
  });
  // Cardboard: how much board a rib still has where it passes the narrower mouth. Thick board fattens
  // the koma hub, the hub is the rib's inner edge, so the strip at the mouth thins — and it is the
  // strip that carries the koma. Under one flute pitch it may hold no whole flute across. Reported,
  // never designed around: the count is the maker's. Below the threshold it IS the tab's width too,
  // the rim stopping at the opening, so this one line covers both.
  if (f.mouthBand !== null && f.mouthBand < MOUTH_BAND_WARN) alerts.push({
    key: "mouth",
    head: t("開口ぎわの羽根板が {b}mm — 段の間隔より細く、爪もこの幅になります", { b: f.mouthBand.toFixed(1) }),
    hint: t("→ 薄い材料にする / 羽根板を減らす / 断面図で開口を広げる"),
  });
  // A part wider than the sheet is CLIPPED, not continued: pages split downward only. Loud, because
  // the sheet looks complete — the cut line simply stops at the trim box, and the piece you fold is
  // short. Named parts and the widest overhang, so the size of the problem is on screen.
  if (f.overSheet.length > 0) alerts.push({
    key: "sheet",
    head: t("{parts} が A4 の幅に収まりません — はみ出す {mm}mm は印刷されません", {
      parts: [...new Set(f.overSheet.map((o) => o.name))].join(" · "),
      mm: Math.ceil(Math.max(...f.overSheet.map((o) => o.over))),
    }),
    hint: t("→ 断面図で最大半径を小さくする / 羽根板を増やす"),
  });
  // The mold has to come back out of the shade it made. The one warning here about a design that
  // cannot be BUILT rather than printed or cut, so it is the last thing anyone finds out on their
  // own, with a dry lantern in their hands.
  if (!f.pull.ok) alerts.push({
    key: "pull",
    head: t("羽根板の幅 {w}mm — 開口 ⌀{d}mm から抜けません", { w: Math.round(f.pull.band), d: Math.round(2 * f.pull.openR) }),
    hint: t("→ 断面図で開口を広げる / ふくらみを抑える"),
  });
  return alerts;
}
