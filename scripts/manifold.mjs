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
    push("ring.bot", G.ringGeometry(p, false)); push("ring.top", G.ringGeometry(p, true)); // 口輪(開口リング)
    const sp = G.ribSplitParts(p, 0);
    push("ribSplit.bottom", sp.bottom); push("ribSplit.top", sp.top); push("ribSplit.splice", sp.splice);
  } catch (e) { return [{ name: "EXCEPTION", ok: false, reason: e.message }]; }
  return results;
}

const heights = [140, 205, 300, 400];
const higos = [1.5, 2, 3];
const pitches = [6, 9, 14];
const boardTs = [1.5, 2, 3, 4]; // UI の板厚上限は 4mm。全域を覆う。
const fits = [0, 0.3, 0.5];
const boardsArr = [6, 8, 12, 16];

let fail = 0, total = 0, stopOn = 0, stopOff = 0, clamped = 0;
for (const preset of PRESETS)
  for (const height of heights)
    for (const higoD of higos)
      for (const pitch of pitches)
        for (const boardT of boardTs)
          for (const fit of fits)
            for (const reqBoards of boardsArr) {
              // UI と同じく枚数をコマに挿さる上限へ clamp する(開口が小さい×厚板×多枚数で
              // ノッチが重なり非水密になる組は UI 側で作れない ⇒ 検証も同じ制約下で見る)。
              const base = { ...DEFAULTS, ...preset, height, higoD, pitch, boardT, fit, boards: reqBoards };
              const boards = Math.min(reqBoards, G.maxBoards(base));
              if (boards < reqBoards) clamped++;
              const p = { ...base, boards };
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
console.log(`maxBoards で枚数を clamp した組: ${clamped}(= UI では作れない不正な枚数)`);

// ============ ベジェ接線ハンドルの水密性スイープ ============
// カーブ調整モードは outerR をベジェ評価へ切り替える。ハンドルを様々に編集した形が
// 依然として水密STLになるか(急な角度で火袋がコマ側にえぐれて非水密化しないか)を検査する。
// 中間点にハンドルを焼き込み→摂動し、全部品の watertight を見る。
function perturb(pts, kind) {
  const mid = Math.max(1, Math.min(pts.length - 2, Math.floor(pts.length / 2)));
  return pts.map((q, i) => {
    if (i !== mid || !q.ho || !q.hi) return { ...q };
    const scale = (h, sd, sr) => ({ dt: h.dt * sd, dr: h.dr * sr });
    switch (kind) {
      case "bulge":  return { ...q, ho: scale(q.ho, 1, 3), hi: scale(q.hi, 1, 3) };   // 大きく膨らませる
      case "flat":   return { ...q, ho: scale(q.ho, 1, 0.1), hi: scale(q.hi, 1, 0.1) }; // 平坦化
      case "inward": return { ...q, ho: scale(q.ho, 1, -2), hi: scale(q.hi, 1, -2) };  // 内向き(えぐり)
      case "long":   return { ...q, ho: scale(q.ho, 5, 4), hi: scale(q.hi, 5, 4) };    // 極端に長い(tはeval側でクランプ)
      case "corner": return { ...q, sharp: true, ho: scale(q.ho, 1, 2.5), hi: scale(q.hi, 2, -1) }; // 角=左右独立
      default:       return { ...q };
    }
  });
}
const HKINDS = ["baked", "bulge", "flat", "inward", "long", "corner"];
let hfail = 0, htotal = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const boards of [6, 8, 12])
      for (const kind of HKINDS) {
        const base = { ...DEFAULTS, ...preset, height, boards: Math.min(boards, G.maxBoards({ ...DEFAULTS, ...preset })) };
        const baked = G.bakeBezierHandles(base.pts);
        const p = { ...base, pts: kind === "baked" ? baked : perturb(baked, kind) };
        for (const r of checkParts(p)) {
          htotal++;
          if (!r.ok) { hfail++; if (hfail <= 40) console.log(`✗[H] ${preset.key} h${height} b${boards} ${kind} :: ${r.name} → ${r.reason}`); }
        }
      }
console.log(`\n=== ハンドル編集: ${htotal} checks, ${hfail} FAIL ===`);

// ============ 螺旋巻き(spiral)の水密性スイープ ============
// 螺旋巻きは grooveList が羽根ごと(k)に溝を step/boards ずつずらす。ずらし量は k で連続に
// 変わり、端の格子点に溝が乗る羽根もある。offset は全羽根で異なるので **全ての k** を検査
// する(通常スイープは k=0,1,mid の抜き取り)。溝位置に効く preset/高さ/ひご径/ピッチ/枚数を
// 掛け合わせる。判定は通常と同じ watertight。
let spFail = 0, spTotal = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const higoD of [1.5, 2, 3])
      for (const pitch of [6, 9, 14])
        for (const reqBoards of [6, 8, 12, 16]) {
          const base = { ...DEFAULTS, ...preset, height, higoD, pitch, spiral: true };
          const boards = Math.min(reqBoards, G.maxBoards(base));
          const p = { ...base, boards };
          for (let k = 0; k < boards; k++) {
            const r = checkGeom(G.ribGeometry(p, k));
            spTotal++;
            if (!r.ok) { spFail++; if (spFail <= 40) console.log(`✗[S] ${preset.key} h${height} hd${higoD} pi${pitch} b${boards} k${k} → ${r.reason}`); }
          }
        }
console.log(`\n=== 螺旋巻き: ${spTotal} checks, ${spFail} FAIL ===`);

if (fail + hfail + spFail > 0) process.exitCode = 1;
process.exit(fail + hfail + spFail ? 1 : 0);
