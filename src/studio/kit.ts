/**
 * Plain functions, no React — the state they need arrives as arguments and the state they change
 * goes back through an `apply` callback, so the caller keeps owning it.
 *
 * Named `kit.ts` rather than `exports.ts`: "export" already means something else on every line.
 */
import type * as THREE from "three";
import {
  maxRadius, ribGeometry, komaGeometry, standGeometry, boardGeometry, ringGeometry,
  WASHI_SIDE, WASHI_END,
} from "../geometry.ts";
import { exportZip, zipBundle, downloadFile, type Part } from "../io/stl.ts";
import { paperPDF, washiPDF } from "../papercraft.ts";
import { serializeState, parseImport, STORAGE_KEY, SCHEMA_VERSION, MAT_T, type SavedState } from "./persist.ts";
import { DEFAULTS, WASHI_PDF } from "../config.ts";
import type { T } from "../i18n.ts";
import type { Design } from "../types.ts";

/** The STL kit: every printed part, the design as a backup, and the washi template. */
export function downloadKit(a: {
  p: Design; nRibs: number; bedW: number; bedD: number;
  washiSide: number; washiEnd: number; t: T;
}): void {
  const { p, nRibs, bedW, bedD, washiSide, washiEnd, t } = a;
  // Rib file layout. Spiral: one rib per file (tomoshibi_rib_01.stl …), placeable individually in
  // the slicer. Otherwise the ribs are identical and go in one file (print one, duplicate it).
  let ribEntries: Part[];
  if (p.spiral) {
    ribEntries = [];
    for (let k = 0; k < nRibs; k++) {
      const g = ribGeometry(p, k);
      g.translate(0, p.tabLen, p.boardT / 2);
      ribEntries.push({ name: `tomoshibi_rib_${String(k + 1).padStart(2, "0")}.stl`, geos: [g] });
    }
  } else {
    const w = maxRadius(p) + 12, ribs: THREE.BufferGeometry[] = [];
    for (let k = 0; k < nRibs; k++) {
      const g = ribGeometry(p, k);
      g.translate(k * w, p.tabLen, p.boardT / 2);
      ribs.push(g);
    }
    ribEntries = [{ name: `tomoshibi_ribs_x${nRibs}.stl`, geos: ribs }];
  }
  // The config JSON rides along so the ZIP is itself a design backup (same schema as persist.ts).
  // The washi template too: its panel width follows the rib count you are about to print and,
  // unlike the parts, cannot be re-derived from the STLs. A PDF, so it prints at 100%, in the UI's
  // language.
  const cfg = JSON.stringify({ schemaVersion: SCHEMA_VERSION, p, bedW, bedD }, null, 2);
  exportZip([
    ...ribEntries,
    // Koma and posts are identical top and bottom, so one of each (duplicated in the slicer).
    { name: "tomoshibi_koma_print2.stl", geos: [komaGeometry(p)] },
    { name: "tomoshibi_stand_column_print2.stl", geos: [standGeometry(p)] },
    { name: "tomoshibi_stand_base.stl", geos: [boardGeometry(p)] },
    // Opening rings: set into the finished lantern's openings to hold the bamboo and washi.
    { name: "tomoshibi_ring_bottom.stl", geos: [ringGeometry(p, false)] },
    { name: "tomoshibi_ring_top.stl", geos: [ringGeometry(p, true)] },
  ], "tomoshibi_kit.zip", [
    { name: "tomoshibi_config.json", bytes: new TextEncoder().encode(cfg) },
    { name: WASHI_PDF, bytes: washiPDF(p, { side: washiSide, end: washiEnd }, undefined, t) },
  ]);
}

/**
 * The cardboard bundle, shaped like the STL kit's: one download, washi a separate PDF inside it.
 * Both follow the UI's language.
 */
export function downloadPaperKit(a: {
  p: Design; matT: number; moldSrc: Design; washiOpts: { side: number; end: number }; t: T;
}): void {
  const { p, matT, moldSrc, washiOpts, t } = a;
  zipBundle({
    "tomoshibi_katagami_a4.pdf": paperPDF(p, matT, undefined, t),
    // moldSrc, not p: on this route the panel follows the possibly-clamped rib count.
    [WASHI_PDF]: washiPDF(moldSrc, washiOpts, undefined, t),
  }, "tomoshibi_katagami.zip");
}

/**
 * The design as JSON — localStorage is a volatile cache, this file is the backup. Same schema as the
 * config.json inside the ZIP.
 */
export function exportDesign(s: SavedState): void {
  downloadFile(serializeState(s), "tomoshibi_design.json", "application/json");
}

/**
 * The standalone export, or the config.json out of the ZIP. parseImport sanitizes, so broken / old
 * / hand-edited values fall back safely rather than breaking geometry.
 */
export function importDesign(file: File | undefined, t: T, apply: (s: SavedState) => void): void {
  if (!file) return;
  const reader = new FileReader();
  const fail = () => window.alert(t("設計ファイルを読み込めませんでした(JSON が壊れています)。"));
  reader.onload = () => {
    const s = parseImport(String(reader.result));
    if (!s) return fail();
    apply(s);
  };
  reader.onerror = fail;
  reader.readAsText(file);
}

/** Back to the defaults, localStorage included. `apply` runs only if the confirm is accepted. */
export function resetAll(t: T, apply: (s: SavedState) => void): void {
  if (!window.confirm(t("すべての設定を初期状態に戻します。よろしいですか?"))) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* continue even if storage is disabled */ }
  // The WHOLE state, and the type says so. A `Pick` of five fields left `matT`, `washiSide` and
  // `washiEnd` standing while the dialog promised すべて — a reset design whose washi PDF was still
  // cut to the allowances you set before it. And the removeItem above cannot cover for that: the
  // next state change re-runs useAutosave, which writes the survivors straight back under the same
  // key. Resetting is what apply does; removeItem only handles closing the tab immediately after.
  apply({ p: DEFAULTS, bedW: 256, bedD: 256, printRibs: 1, matT: MAT_T, washiSide: WASHI_SIDE, washiEnd: WASHI_END, route: "stl" });
}
