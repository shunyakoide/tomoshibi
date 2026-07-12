/**
 * ============================================================================
 * 幾何生成 (GEOMETRY)
 * ============================================================================
 * 張型(はりがた)の3部品 — 羽根板(rib) / コマ(koma) / 土台(stand) — の
 * 断面形状と 3D ジオメトリを生成する純粋関数群。three.js の Shape/ExtrudeGeometry
 * を返すが、React・DOM には一切依存しない(2D断面描画・STL出力の両方から共有)。
 *
 * 【座標系・単位】全寸法mm。羽根板/コマ/土台は XY平面シェイプ + Z押し出し
 *   (=そのまま平置き印刷向き)。prof(p, t): 高さ正規化 t∈[0,1] → 半径mm。
 * ============================================================================
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ============ プロファイル ============
// curve種別でシルエット決定: egg/sphere/cocoon/gourd/barrel/bud (AKARI系)
export function prof(p, t) {
  const base = p.bottomR + (p.topR - p.bottomR) * t;
  let b = 0;
  const s = Math.sin(Math.PI * t);
  if (p.curve === "sphere") b = s;
  else if (p.curve === "egg") b = Math.sin(Math.PI * Math.pow(t, 0.72)); // たまご(重心低め)
  else if (p.curve === "cocoon") b = Math.sin(Math.PI * Math.pow(t, 1.25));
  else if (p.curve === "gourd") b = s - 0.55 * Math.exp(-Math.pow((t - 0.58) / 0.13, 2)) * s;
  else if (p.curve === "barrel") b = Math.pow(s, 0.4);
  else if (p.curve === "bud") b = Math.sin(Math.PI * Math.pow(t, 1.8));
  return Math.max(12, base + p.bulge * b);
}
export function maxRadius(p) {
  let m = 0;
  for (let i = 0; i <= 120; i++) m = Math.max(m, prof(p, i / 120));
  return m + p.higoD;
}
// 首(くび): 上下端に cutBottom(mm) の高さぶん、外周を「肩の外径のまま垂直」にした
// まっすぐな首を作る。外側へ張り出さず、爪(タブ)は羽根の一番外側の縁(この外径)に来る。
// 首には竹ひごを巻かない。cutT = 首の正規化高さ。
export function cutT(p) {
  return Math.min(0.45, Math.max(0, (p.cutBottom || 0) / Math.max(1, p.height)));
}
export function cutY(p) {
  return cutT(p) * p.height; // 首の高さ(mm)
}
// 実効外周半径。上下端の首は肩の外径(prof(cutT)/prof(1-cutT))で垂直、中央は本体カーブ。
export function outerR(p, t) {
  const c = cutT(p);
  if (c <= 0) return prof(p, t);
  if (t < c) return prof(p, c);          // 下の首(垂直, 爪=外端)
  if (t > 1 - c) return prof(p, 1 - c);  // 上の首(垂直, 爪=外端)
  return prof(p, t);
}
// コマ外径 = 爪を纏める小さなハブの半径。爪(内端Ri〜Ri+td)がコマの縁(外周)に来る。
// Ri・tabDepth は上下対称なので、コマは上下で完全に同一(1種類のみ)。
export function komaR(p) {
  return innerRi(p) + tabDepth(p) + 3;
}
// タブ(羽根の差し込み部)の半径方向の奥行き = コマのノッチ深さ。
// 上下・全羽根で一律(細い方の端に合わせる)。→ どの羽根もどちらのコマにも同じ深さで嵌まる。
export function tabDepth(p) {
  const minEnd = Math.min(outerR(p, 0), outerR(p, 1));
  return Math.min(p.tabW, Math.max(6, minEnd * 0.4));
}
// 羽根幅の上限: 乾燥後に大きい方の開口(端半径)から抜けるよう、開口以下に抑える
export function effBoardWidth(p) {
  return Math.min(p.boardWidth, Math.max(outerR(p, 0), outerR(p, 1)) - 1);
}

// ============ 2D断面(確定形状) ============
// 内縁をまっすぐな芯(半径 Ri = tabR)にし、その内側に上下同じ位置で爪。外縁は本体カーブ＋首。
// 中央は肉抜き(外縁の帯=溝を保持 と 内縁の芯=爪を支える を残す)。羽根の断面ビューで使う。
export function innerRi(p) {
  const td = tabDepth(p);
  const lim = Math.min(outerR(p, 0), outerR(p, 1)) - td - 2;
  return Math.max(6, Math.min(p.tabR ?? 15, lim));
}
// 羽根の外形点列 + 溝位置 + outerX関数を返す(2D描画 と 3D羽根geometry で共有)。
// k = 羽根番号(螺旋巻きで溝を k*pitch/boards ずらす)。
export function ribOutline2D(p, k = 0) {
  const h = p.height, tl = p.tabLen, gR = p.higoD / 2 + 0.15;
  const off = p.spiral ? (k * p.pitch) / p.boards : 0;
  const yBot = cutY(p), yTop = h - yBot;
  const grooves = [];
  for (let y = yBot + p.pitch / 2 + off; y < yTop - gR; y += p.pitch) grooves.push(y);
  const outerX = (y) => {
    let x = outerR(p, y / h);
    for (const g of grooves) { const dy = Math.abs(y - g); if (dy < gR) x = Math.min(x, outerR(p, g / h) - Math.sqrt(gR * gR - dy * dy) - 0.01); }
    return x;
  };
  const Ri = innerRi(p), td = tabDepth(p), STEP = 1.0, pts = [];
  pts.push([Ri, 0], [Ri, -tl], [Ri + td, -tl], [Ri + td, 0], [outerR(p, 0), 0]);
  for (let y = STEP; y <= h; y += STEP) pts.push([outerX(Math.min(y, h)), Math.min(y, h)]);
  pts.push([outerR(p, 1), h], [Ri + td, h], [Ri + td, h + tl], [Ri, h + tl], [Ri, h], [Ri, 0]);
  return { pts, grooves, outerX, Ri, td, gR };
}
// 肉抜き窓(外縁の帯 bandW と 内縁の芯 spineW を残し、桟 strut で分割)。
// 窓の外側境界は溝の凹凸を無視した「滑らかな外周(outerR)」基準にする(ぼこぼこ防止)。
export function lightenHoles2D(p) {
  const h = p.height, Ri = innerRi(p), td = tabDepth(p);
  const spineW = Math.max(9, td + 3), bandW = 11, strut = 8;
  const oS = (y) => outerR(p, Math.min(Math.max(y, 0), h) / h); // 滑らかな外周
  const xi = Ri + spineW, yBot = 10, yTop = h - 10;
  const nWin = Math.max(1, Math.round((yTop - yBot) / 46)), winH = (yTop - yBot) / nWin, holes = [];
  for (let i = 0; i < nWin; i++) {
    const y0 = yBot + i * winH + strut / 2, y1 = yBot + (i + 1) * winH - strut / 2;
    if (y1 - y0 < 10) continue;
    if (oS((y0 + y1) / 2) - bandW - xi < 12) continue;
    const poly = [[xi, y0]];
    for (let y = y0; y <= y1; y += 2) poly.push([Math.max(xi + 2, oS(y) - bandW), y]);
    poly.push([xi, y1]);
    holes.push(poly);
  }
  return { holes, spineW, bandW };
}

// ============ 羽根板 ============
// 羽根板の内外エッジ関数(通常/分割で共有)
export function ribEdges(p, k) {
  const { height, higoD, pitch, spiral, boards } = p;
  const boardWidth = effBoardWidth(p); // 抜き取り可能な幅に制限
  const oB = outerR(p, 0), oT = outerR(p, 1);
  const twB = tabDepth(p), twT = tabDepth(p); // 上下一律
  const gR = higoD / 2 + 0.15;
  const off = spiral ? (k * pitch) / boards : 0;
  const yBot = cutY(p), yTop = height - yBot; // 首の範囲。首(上下端)には竹ひごの溝を作らない
  const grooves = [];
  for (let y = yBot + pitch / 2 + off; y < yTop - gR; y += pitch) grooves.push(y);
  const outerX = (y) => {
    let x = outerR(p, y / height);
    for (const g of grooves) {
      const dy = Math.abs(y - g);
      if (dy < gR) x = Math.min(x, outerR(p, g / height) - Math.sqrt(gR * gR - dy * dy) - 0.01);
    }
    return x;
  };
  // 内縁の下限。板幅に応じた下限で下端の尖り(トゲ)を防ぐ。
  const mInner = Math.max(8, boardWidth * 0.4);
  const innerX = (y) => Math.max(mInner, outerR(p, y / height) - boardWidth);
  return { oB, oT, twB, twT, outerX, innerX };
}
// 3D羽根板 = 2D確定形状(内縁まっすぐ＋上下同位置の内側の爪＋外縁カーブ＋肉抜き)を押し出す。
export function ribShape(p, k) {
  const { pts } = ribOutline2D(p, k);
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  if (p.lighten) {
    for (const hole of lightenHoles2D(p).holes) {
      const path = new THREE.Path();
      hole.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
      path.closePath();
      s.holes.push(path);
    }
  }
  return s;
}
export const ribGeometry = (p, k) => {
  const g = new THREE.ExtrudeGeometry(ribShape(p, k), { depth: p.boardT, bevelEnabled: false });
  g.translate(0, 0, -p.boardT / 2);
  return g;
};

// ---- 羽根板の上下2分割(大型ランプ用) ----
// 割り面で突き合わせ、内側の面に「当て板(スプライス)＋一体スタッド」を差して繋ぐ。
// 薄板なので当て板が面外曲げを支える。位置決め穴はスタッドで兼ねる。
const SPLICE_T = 3, SPLICE_HALF = 22, PIN_D = 3, PIN_FIT = 0.5;
function ribBandShape(p, k, y0, y1, pins) {
  const { height, tabLen } = p;
  const { oB, oT, twB, twT, outerX, innerX } = ribEdges(p, k);
  const STEP = 0.4;
  const s = new THREE.Shape();
  s.moveTo(innerX(y0), y0);
  if (y0 <= 0.001) { // 実際の下端: 底辺＋タブ
    s.lineTo(oB - twB, 0); s.lineTo(oB - twB, -tabLen); s.lineTo(oB, -tabLen); s.lineTo(oB, 0);
  } else {
    s.lineTo(outerX(y0), y0); // 割り面で真っ直ぐ横断
  }
  for (let y = y0 + STEP; y < y1; y += STEP) s.lineTo(outerX(y), y);
  if (y1 >= height - 0.001) { // 実際の上端: タブ
    s.lineTo(oT, height); s.lineTo(oT, height + tabLen); s.lineTo(oT - twT, height + tabLen); s.lineTo(oT - twT, height);
    s.lineTo(innerX(height), height);
  } else {
    s.lineTo(outerX(y1), y1); s.lineTo(innerX(y1), y1);
  }
  for (let y = y1 - STEP; y > y0; y -= STEP) s.lineTo(innerX(y), y);
  s.closePath();
  if (pins) for (const [hx, hy] of pins) { const h = new THREE.Path(); h.absarc(hx, hy, (PIN_D + PIN_FIT) / 2, 0, Math.PI * 2, true); s.holes.push(h); }
  return s;
}
export function ribSplitParts(p, k) {
  const { height, boardT } = p;
  const splitY = height / 2;
  const { outerX, innerX } = ribEdges(p, k);
  const wLo = innerX(splitY), wHi = outerX(splitY);
  const px1 = wLo + 9, px2 = wHi - 9;
  const pinsB = [[px1, splitY - 10], [px2, splitY - 10]];
  const pinsT = [[px1, splitY + 10], [px2, splitY + 10]];
  const bottom = new THREE.ExtrudeGeometry(ribBandShape(p, k, 0, splitY, pinsB), { depth: boardT, bevelEnabled: false });
  const top = new THREE.ExtrudeGeometry(ribBandShape(p, k, splitY, height, pinsT), { depth: boardT, bevelEnabled: false });
  const sh = new THREE.Shape(); // 当て板
  const sx0 = wLo + 3, sx1 = wHi - 3;
  sh.moveTo(sx0, splitY - SPLICE_HALF); sh.lineTo(sx1, splitY - SPLICE_HALF);
  sh.lineTo(sx1, splitY + SPLICE_HALF); sh.lineTo(sx0, splitY + SPLICE_HALF); sh.closePath();
  const parts = [new THREE.ExtrudeGeometry(sh, { depth: SPLICE_T, bevelEnabled: false })];
  for (const [hx, hy] of [...pinsB, ...pinsT]) { // 一体スタッド
    const stud = new THREE.CylinderGeometry(PIN_D / 2 - 0.1, PIN_D / 2 - 0.1, boardT, 16);
    stud.rotateX(Math.PI / 2);
    stud.translate(hx, hy, SPLICE_T + boardT / 2);
    parts.push(stud);
  }
  // ExtrudeGeometry(非index) と CylinderGeometry(index) が混在するので揃える
  const splice = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  return { bottom, top, splice };
}

// ============ コマ(爪を纏める小さな歯車ハブ) ============
// main 同様、縁が開いたノッチ(平行壁)を持つ小さな歯車。爪(内端 Ri〜Ri+td)がコマの縁に来る。
// ノッチは爪の内端(Ri)まで届き、羽根はノッチを通って外へ伸びる。土台はコマを受ける。
export function komaShape(p) {
  const { boards, boardT, fit } = p;
  const R = komaR(p);
  const sw = boardT + fit; // ノッチ幅 = 板厚 + 公差(平行壁)
  const eps = Math.asin(Math.min(0.9, (sw / 2) / R));
  const rOut = Math.sqrt(Math.max(1, R * R - (sw / 2) * (sw / 2)));
  const notchR = Math.max(1, innerRi(p) - 0.5); // 爪の内端(Ri)まで届く深さ
  const shape = new THREE.Shape();
  shape.moveTo(R * Math.cos(eps), R * Math.sin(eps));
  for (let k = 0; k < boards; k++) {
    const a0 = (k / boards) * Math.PI * 2;
    const a1 = ((k + 1) / boards) * Math.PI * 2;
    for (let i = 1; i <= 12; i++) {
      const a = a0 + eps + (i / 12) * (a1 - a0 - 2 * eps);
      shape.lineTo(R * Math.cos(a), R * Math.sin(a));
    }
    const dx = Math.cos(a1), dy = Math.sin(a1), nx = -dy, ny = dx;
    shape.lineTo(notchR * dx - nx * sw / 2, notchR * dy - ny * sw / 2);
    shape.lineTo(notchR * dx + nx * sw / 2, notchR * dy + ny * sw / 2);
    shape.lineTo(rOut * dx + nx * sw / 2, rOut * dy + ny * sw / 2);
  }
  shape.closePath();
  return shape;
}
export function komaGeometry(p) {
  return new THREE.ExtrudeGeometry(komaShape(p), { depth: p.komaT, bevelEnabled: false });
}

// ============ 土台(シンプルな差し込み式) ============
// コマの縁をU字サドルで受ける薄板の柱×2を、1枚の薄いベース板に差し込むだけ。
// 柱は下端が中央ホゾ(差し込み)まで絞り込まれ、ベース板のスリットへ落とし込む。
// 両柱を1枚の板が正しい間隔で保持 → クリップや連結金具は不要。
const GROOVE_FIT = 1.0;   // サドル溝のコマ厚クリアランス
const WALL_H = 4;         // サドルフランジがコマ縁に被る深さ(軸方向保持)
const FLANGE_T = 3;       // サドルフランジ厚(z)
const BASE_T = 5;         // ベース板の厚み(mm, 薄く)
const TENON_W = 44;       // 柱の差し込みホゾ幅(mm)
const TENON_D = BASE_T + 1; // ホゾ差し込み深さ(板を貫通)
const FOOT_HW = 29;       // 柱脚の半幅(ベース板に接地する足)
const SLOT_FIT = 0.4;     // スリットのはめあいクリアランス
const BASE_MARGIN = 8;    // ベース板の端マージン
function standFullW(p) { return p.komaT + GROOVE_FIT + FLANGE_T * 2; } // 柱の厚み(z)

// 柱プロファイル(局所 x=幅, y=高さ)。foot=true で下端の差し込みホゾ＋肉抜き窓を作る。
function standProfile(seatR, H, halfOpen, colW, opts = {}) {
  const { yBase = 0, foot = false } = opts;
  const lipY = H - seatR * Math.cos(halfOpen);
  const lipX = seatR * Math.sin(halfOpen);
  const topY = lipY + 8;
  const shoulder = 26;               // 脚→本体へ広がる高さ
  const s = new THREE.Shape();
  if (foot) {                        // 下端: 中央ホゾ→足→肩へテーパ
    s.moveTo(-TENON_W / 2, -TENON_D);
    s.lineTo(TENON_W / 2, -TENON_D);
    s.lineTo(TENON_W / 2, 0);
    s.lineTo(FOOT_HW, 0);
    s.lineTo(colW, shoulder);
  } else {
    s.moveTo(-colW, yBase);
    s.lineTo(colW, yBase);
  }
  s.lineTo(colW, topY);
  s.lineTo(lipX, topY);
  s.lineTo(lipX, lipY);
  for (let i = 0; i <= 32; i++) {
    const a = halfOpen - (i / 32) * (2 * halfOpen); // 右縁→底→左縁
    s.lineTo(seatR * Math.sin(a), H - seatR * Math.cos(a));
  }
  s.lineTo(-lipX, topY);
  s.lineTo(-colW, topY);
  if (foot) {
    s.lineTo(-colW, shoulder);
    s.lineTo(-FOOT_HW, 0);
    s.lineTo(-TENON_W / 2, 0);
    s.lineTo(-TENON_W / 2, -TENON_D);
  }
  s.closePath();
  if (foot) {                        // 肉抜き窓(大きめ)。縁の脚を残しつつ中央を広く抜く。
    const wx = colW - 8;             // 外脚を8mmだけ残す
    const wy0 = shoulder + 5, wy1 = H - seatR - 6; // 足の肩上〜サドル底の直下まで
    if (wx > 8 && wy1 - wy0 > 40) {  // 高い柱は2分割(桟を残す)
      const mid = (wy0 + wy1) / 2, strut = 8;
      for (const [a, b] of [[wy0, mid - strut / 2], [mid + strut / 2, wy1]]) {
        if (b - a < 14) continue;
        const w = new THREE.Path();
        w.moveTo(-wx, a); w.lineTo(wx, a); w.lineTo(wx, b); w.lineTo(-wx, b); w.closePath();
        s.holes.push(w);
      }
    } else if (wx > 8 && wy1 - wy0 > 16) {
      const w = new THREE.Path();
      w.moveTo(-wx, wy0); w.lineTo(wx, wy0); w.lineTo(wx, wy1); w.lineTo(-wx, wy1); w.closePath();
      s.holes.push(w);
    }
  }
  return s;
}
export function standGeometry(p) {
  const R = maxRadius(p);
  const kR = komaR(p);
  const H = R + 15;                  // コマ中心高さ(最大径+床クリアランス15mm)
  const saddleR = kR + 0.8;          // 溝の受け半径(コマ縁+0.8クリアランス)
  const halfOpen = Math.PI * 0.40;
  const colW = saddleR * Math.sin(halfOpen) + 12;
  const grooveW = p.komaT + GROOVE_FIT;      // 溝幅 = コマ厚 + クリアランス
  const fullW = grooveW + FLANGE_T * 2;
  const geos = [];
  const core = new THREE.ExtrudeGeometry(
    standProfile(saddleR, H, halfOpen, colW, { foot: true }),
    { depth: grooveW, bevelEnabled: false });
  core.translate(0, 0, -grooveW / 2);         // 溝(受け面)は全幅の中央
  geos.push(core);
  const flSeat = saddleR - WALL_H;
  const flColW = flSeat * Math.sin(halfOpen) + 8;
  const flBase = H - flSeat - 8;              // サドル直下だけの小フランジ(コマ軸抜け止め)
  for (const zside of [-1, 1]) {
    const fl = new THREE.ExtrudeGeometry(
      standProfile(flSeat, H, halfOpen, flColW, { yBase: flBase }),
      { depth: FLANGE_T, bevelEnabled: false });
    fl.translate(0, 0, zside < 0 ? -fullW / 2 : fullW / 2 - FLANGE_T);
    geos.push(fl);
  }
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}
// ベース板: 薄い平板に柱ホゾ用スリットを2つ。羽根板とほぼ同じ全長(=火袋+爪×2)。
export function standBoardLength(p) {
  return p.height + 2 * p.tabLen; // 羽根板と同じ全長
}
export function boardGeometry(p) {
  const len = standBoardLength(p);
  const W = TENON_W + 2 * BASE_MARGIN;                   // ベース板の幅
  const sep = len - standFullW(p) - 2 * BASE_MARGIN;     // スリットは端から余白を空けて配置
  const s = new THREE.Shape();
  s.moveTo(-len / 2, -W / 2);
  s.lineTo(len / 2, -W / 2);
  s.lineTo(len / 2, W / 2);
  s.lineTo(-len / 2, W / 2);
  s.closePath();
  const sx = (standFullW(p) + SLOT_FIT) / 2, sy = (TENON_W + SLOT_FIT) / 2;
  for (const cx of [-sep / 2, sep / 2]) {                // 柱ホゾ用スリット×2
    const slot = new THREE.Path();
    slot.moveTo(cx - sx, -sy); slot.lineTo(cx + sx, -sy);
    slot.lineTo(cx + sx, sy); slot.lineTo(cx - sx, sy); slot.closePath();
    s.holes.push(slot);
  }
  // 肉抜き: スリットより内側(中央)を窓で大きく抜く。桟で分割し、端とスリット周りは残す。
  const wall = 9, hw = W / 2 - wall, innerHalf = sep / 2 - sx - wall;
  if (hw > 4 && innerHalf > 16) {
    const nWin = Math.max(1, Math.round((innerHalf * 2) / 70)), cellL = (innerHalf * 2) / nWin;
    for (let i = 0; i < nWin; i++) {
      const cx = -innerHalf + (i + 0.5) * cellL, hl = (cellL - wall) / 2;
      if (hl < 6) continue;
      const h = new THREE.Path();
      h.moveTo(cx - hl, -hw); h.lineTo(cx + hl, -hw); h.lineTo(cx + hl, hw); h.lineTo(cx - hl, hw); h.closePath();
      s.holes.push(h);
    }
  }
  return new THREE.ExtrudeGeometry(s, { depth: BASE_T, bevelEnabled: false });
}
