/**
 * ============================================================================
 * STL 水密性(manifold)スイープ検証
 * ============================================================================
 * このプロジェクトにはテストランナーが無い。正しさは「ビルドが通る」＋
 * 「STL が水密(閉じた多様体)」で担保する。本スクリプトは代表的なパラメータ範囲を
 * スイープし、全部品(羽根板/コマ/土台/ベース板/2分割)のジオメトリが水密かを検査する。
 *
 * 判定(CLAUDE.md「STL の水密性」準拠):
 *   - 無向エッジの共有数 = 2 で閉(正常)。1 = 開口エッジ、>2 = 非多様体 → FAIL。
 *   - NaN 頂点があれば FAIL。
 *   - ゼロ面積(退化)三角形があれば FAIL。
 *
 * 実行:  npm run check:manifold
 * geometry を触ったら必ず通すこと。0 FAIL 以外は印刷スライサが破綻し得る。
 * ============================================================================
 */
import * as G from "../src/geometry.js";
import { PRESETS, DEFAULTS } from "../src/config.js";

const Q = 1e4; // 量子化(0.0001mm)。頂点座標基準でエッジの共有を判定する。
const key = (a) => [Math.round(a[0] * Q), Math.round(a[1] * Q), Math.round(a[2] * Q)].join(",");

function checkGeom(geom) {
  const pos = geom.getAttribute("position");
  const arr = pos.array;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return { ok: false, reason: "NaN頂点" };
  const idx = geom.index ? geom.index.array : null;
  const nTri = idx ? idx.length / 3 : pos.count / 3;
  const edges = new Map();
  const v = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
  for (let t = 0; t < nTri; t++) {
    const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const ks = [key(v(ia)), key(v(ib)), key(v(ic))];
    if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2]) return { ok: false, reason: "退化三角形" };
    for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) {
      const e = ks[x] < ks[y] ? ks[x] + "|" + ks[y] : ks[y] + "|" + ks[x];
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  let open = 0, nonman = 0;
  for (const c of edges.values()) { if (c === 1) open++; else if (c > 2) nonman++; }
  if (open || nonman) return { ok: false, reason: `開口エッジ${open} / 非多様体エッジ${nonman}` };
  return { ok: true };
}

function checkParts(p) {
  const results = [];
  const push = (name, geom) => results.push({ name, ...checkGeom(geom) });
  try {
    for (const k of [0, 1, Math.floor(p.boards / 2)]) push(`rib(k=${k})`, G.ribGeometry(p, k));
    push("koma", G.komaGeometry(p));
    push("stand", G.standGeometry(p));
    push("board", G.boardGeometry(p));
    const sp = G.ribSplitParts(p, 0);
    push("ribSplit.bottom", sp.bottom); push("ribSplit.top", sp.top); push("ribSplit.splice", sp.splice);
  } catch (e) { return [{ name: "EXCEPTION", ok: false, reason: e.message }]; }
  return results;
}

const heights = [140, 205, 300, 400];
const higos = [1.5, 2, 3];
const pitches = [6, 9, 14];
const boardTs = [1.5, 2, 3];
const fits = [0, 0.3, 0.5];
const boardsArr = [6, 8, 12, 16];

let fail = 0, total = 0, stopOn = 0, stopOff = 0;
for (const preset of PRESETS)
  for (const height of heights)
    for (const higoD of higos)
      for (const pitch of pitches)
        for (const boardT of boardTs)
          for (const fit of fits)
            for (const boards of boardsArr) {
              const p = { ...DEFAULTS, ...preset, height, higoD, pitch, boardT, fit, boards };
              if (G.komaStop2D(p)) stopOn++; else stopOff++;
              for (const r of checkParts(p)) {
                total++;
                if (!r.ok) {
                  fail++;
                  if (fail <= 40) console.log(`✗ ${preset.key} h${height} hd${higoD} pi${pitch} bt${boardT} fit${fit} b${boards} :: ${r.name} → ${r.reason}`);
                }
              }
            }

console.log(`\n=== ${total} checks, ${fail} FAIL ===`);
console.log(`komaStop2D: 生成あり ${stopOn} / 見送り(余地なし) ${stopOff}`);
process.exit(fail ? 1 : 0);
