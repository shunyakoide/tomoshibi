/**
 * Plain functions, no React — the state they need arrives as arguments and the state they change
 * goes back through an `apply` callback, so the caller keeps owning it.
 *
 * Named `kit.ts` rather than `exports.ts`: "export" already means something else on every line.
 */
import { maxRadius } from "../geometry.ts";
import { printParts, ribRange, type PartKey } from "../parts.ts";
import { exportZip, zipBundle, downloadFile, type Part } from "../io/stl.ts";
import { paperPDF, washiPDF } from "../papercraft.ts";
import { serializeState, parseImport, STORAGE_KEY, FRESH, type SavedState } from "./persist.ts";
import { WASHI_PDF } from "../config.ts";
import type { T } from "../i18n.ts";
import type { Design } from "../types.ts";

// File name per non-rib part. Keyed by `PartKey`, so a part added to `printParts` fails the build
// here until it has a file. Koma and post are printed twice — the name says so.
const FILE: Record<Exclude<PartKey, "rib">, string> = {
  koma: "tomoshibi_koma_print2.stl",
  stand: "tomoshibi_stand_column_print2.stl",
  board: "tomoshibi_stand_base.stl",
  ringBot: "tomoshibi_ring_bottom.stl",
  ringTop: "tomoshibi_ring_top.stl",
};

/** The STL kit: every printed part, the design as a backup, and the washi template. */
export function downloadKit(s: SavedState, nRibs: number, t: T): void {
  const { p, washiSide, washiEnd } = s;
  const parts = printParts(p, ribRange(nRibs));
  // Rib file layout. Spiral: one rib per file (tomoshibi_rib_01.stl …), placeable individually in
  // the slicer. Otherwise the ribs are identical and go in one file, side by side (print one,
  // duplicate it).
  const w = maxRadius(p) + 12;
  const ribs = parts.filter((x) => x.key === "rib");
  for (const r of ribs) r.geo.translate(p.spiral ? 0 : r.k * w, p.tabLen, p.boardT / 2);
  const ribEntries: Part[] = p.spiral
    ? ribs.map((r) => ({ name: `tomoshibi_rib_${String(r.k + 1).padStart(2, "0")}.stl`, geos: [r.geo] }))
    : [{ name: `tomoshibi_ribs_x${nRibs}.stl`, geos: ribs.map((r) => r.geo) }];
  // The config JSON rides along so the ZIP is itself a design backup — the WHOLE record, through the
  // same serializer as 「バックアップを保存」, so a restore from the ZIP loses no setting.
  // The washi template too: its panel width follows the rib count you are about to print and,
  // unlike the parts, cannot be re-derived from the STLs. A PDF, so it prints at 100%, in the UI's
  // language.
  const cfg = serializeState(s);
  exportZip([
    ...ribEntries,
    ...parts.flatMap((x) => (x.key === "rib" ? [] : [{ name: FILE[x.key], geos: [x.geo] }])),
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
  // The WHOLE state, and `FRESH` is the whole state by definition. A `Pick` of five fields left
  // `matT`, `washiSide` and `washiEnd` standing while the dialog promised すべて — a reset design
  // whose washi PDF was still cut to the allowances you set before it. And the removeItem above
  // cannot cover for that: the next state change re-runs useAutosave, which writes the survivors
  // straight back under the same key. Resetting is what apply does; removeItem only handles closing
  // the tab immediately after. Spelling the fields out here again is what let them drift the first
  // time, so this file no longer knows any default.
  apply(FRESH);
}
