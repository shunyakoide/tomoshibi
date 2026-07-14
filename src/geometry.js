/**
 * ============================================================================
 * 幾何生成 (GEOMETRY)
 * ============================================================================
 * 張型(はりがた)の3部品 — 羽根板(rib) / コマ(koma) / 土台(stand) — の
 * 断面形状と 3D ジオメトリを生成する純粋関数群。three.js の Shape/ExtrudeGeometry
 * を返すが、React・DOM には一切依存しない(2D断面描画・STL出力の両方から共有)。
 *
 * 【座標系・単位】全寸法mm。羽根板/コマ/土台は XY平面シェイプ + Z押し出し
 *   (=そのまま平置き印刷向き)。outerR(p, t): 高さ正規化 t∈[0,1] → 半径mm(制御点スプライン)。
 * ============================================================================
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ============ プロファイル(制御点スプライン) ============
// シルエットは「制御点配列 pts + 上下半径 rTop/rBot」を Catmull-Rom型エルミート補間で
// つないだ半径関数で決まる。図面上のハンドルを直接ドラッグして pts を編集する方式。
// 首(くび=上下端の NECK mm)は rBot/rTop の一定半径で垂直。首には竹ひごを巻かない。
export const NECK = 5; // 首(竹ひご無し=光らない開口)の高さ(mm, 固定)。上コマ用の僅かな余白のみ。本体はほぼ全高が光る

// エルミート補間(Catmull-Rom接線)。P = 昇順の [{ t, r, sharp? }]、x∈[0,1] → r(mm)。
// sharp な点は接線を区分直線の勾配に差し替えて「角」を作る(その点で折れる)。
function splineR(P, x) {
  let i = 0;
  while (i < P.length - 2 && x > P[i + 1].t) i++;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
  const h = p2.t - p1.t, s = h > 1e-6 ? (x - p1.t) / h : 0;
  const m1 = p1.sharp ? (p2.r - p1.r) : ((p2.r - p0.r) / (p2.t - p0.t)) * h;
  const m2 = p2.sharp ? (p2.r - p1.r) : ((p3.r - p1.r) / (p3.t - p1.t)) * h;
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p1.r + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2.r + (s3 - s2) * m2;
}
// 実効外周半径。t∈[0,1] → 半径mm。端(t=0/1)から頂点まで1本の連続スプラインにする
// (垂直の首は作らない)。首を挟むと「平ら→急カーブ」の折れ角が出るため、端も制御点
// (rBot/rTop)としてスプラインに含め、少ない点でも滑らかな輪郭になるようにする。
// 竹ひごを巻かない上下端の帯(首)は cutT/cutY で別に扱う(半径は連続のまま)。
export function outerR(p, t) {
  const P = [{ t: 0, r: p.rBot }, ...(p.pts || []), { t: 1, r: p.rTop }];
  return Math.max(8, splineR(P, Math.max(0, Math.min(1, t))));
}
export function maxRadius(p) {
  let m = 0;
  for (let i = 0; i <= 120; i++) m = Math.max(m, outerR(p, i / 120));
  return m + p.higoD;
}
// 首(くび)の正規化高さ/実寸。竹ひごの溝を作らない上下端の範囲。
export function cutT(p) {
  return NECK / Math.max(1, p.height);
}
export function cutY(p) {
  return NECK; // 首の高さ(mm, 固定)
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
  const minEnd = Math.min(outerR(p, 0), outerR(p, 1));
  // スプラインは中央が端より細くなり得る(くびれ)。芯(Ri)は全高で本体内に収める必要が
  // あるため、端だけでなく全域の最小外径も見て上限を決める(自己交差する断面を防ぐ)。
  let minO = Infinity;
  for (let i = 0; i <= 60; i++) minO = Math.min(minO, outerR(p, i / 60));
  const lim = Math.min(minEnd - td - 2, minO - 3);
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
    // くびれ(スプラインで中央が細る形)では窓の外縁が芯に近づき、薄い帯ができると
    // earcut が三角化できず open edge を生む。窓の「全域」で ≥12mm の肉を確認して作る
    // (中点だけの確認では、くびれが窓端に来たとき薄い帯を見逃す)。
    let minMat = Infinity;
    for (let y = y0; y <= y1; y += 2) minMat = Math.min(minMat, oS(y) - bandW - xi);
    if (minMat < 12) continue;
    const poly = [[xi, y0]];
    for (let y = y0; y <= y1; y += 2) poly.push([oS(y) - bandW, y]);
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
  // 内縁の下限。板幅に応じた下限で下端の尖り(トゲ)を防ぐ。ただしくびれ(細い中央)では
  // 下限が外縁を上回り帯が反転(自己交差)し得るため、外縁から最低 MIN_BAND を必ず残すよう
  // 上側もクランプして帯幅を保証する(分割部品の非多様体を防ぐ)。
  const mInner = Math.max(8, boardWidth * 0.4), MIN_BAND = 6;
  const innerX = (y) => {
    const oR = outerR(p, y / height);
    return Math.min(Math.max(mInner, oR - boardWidth), oR - MIN_BAND);
  };
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
  const pts = [];
  pts.push([innerX(y0), y0]);
  if (y0 <= 0.001) { // 実際の下端: 底辺＋タブ
    pts.push([oB - twB, 0], [oB - twB, -tabLen], [oB, -tabLen], [oB, 0]);
  } else {
    pts.push([outerX(y0), y0]); // 割り面で真っ直ぐ横断
  }
  for (let y = y0 + STEP; y < y1; y += STEP) pts.push([outerX(y), y]);
  if (y1 >= height - 0.001) { // 実際の上端: タブ
    pts.push([oT, height], [oT, height + tabLen], [oT - twT, height + tabLen], [oT - twT, height], [innerX(height), height]);
  } else {
    pts.push([outerX(y1), y1], [innerX(y1), y1]);
  }
  for (let y = y1 - STEP; y > y0; y -= STEP) pts.push([innerX(y), y]);
  // 連続するほぼ重複点を除去。内縁が下限で一定になる区間とタブ端の接合で重複頂点が生じ、
  // ExtrudeGeometry(earcut)が退化三角形→非多様体を出すため、押し出し前に掃除する。
  const clean = [];
  for (const q of pts) { const l = clean[clean.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 1e-3) clean.push(q); }
  while (clean.length > 1 && Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) <= 1e-3) clean.pop();
  const s = new THREE.Shape();
  clean.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  if (pins) for (const [hx, hy] of pins) { const h = new THREE.Path(); h.absarc(hx, hy, (PIN_D + PIN_FIT) / 2, 0, Math.PI * 2, true); s.holes.push(h); }
  return s;
}
export function ribSplitParts(p, k) {
  const { height, boardT } = p;
  const splitY = height / 2;
  const { outerX, innerX } = ribEdges(p, k);
  const wLo = innerX(splitY), wHi = outerX(splitY);
  // スタッド穴は「その穴のy位置(splitY±10)と割り面」全てで帯の内側に、穴半径+マージン
  // 以上のクリアランスを持つ位置に置く。くびれで帯が細ると穴が縁を突き抜け非多様体に
  // なるため、安全なx区間 [lo, hi] に収める(狭ければ1本・中央、極端に狭ければ当て板のみ)。
  const pinR = (PIN_D + PIN_FIT) / 2, M = 2.5;
  const yB = splitY - 10, yT = splitY + 10;
  // 穴は y方向に ±pinR 広がるので、中心yだけでなく穴の y全域にわたって縁からの安全域を
  // 確保する(くびれ近くで穴が曲面の縁を突き抜けて非多様体になるのを防ぐ)。上下バンド
  // 両方で安全な x区間の交わりにピンを置く。狭ければ1本・中央、極端に狭ければ当て板のみ。
  const span = (py) => {
    let lo = -Infinity, hi = Infinity;
    for (let y = py - pinR - 1; y <= py + pinR + 1; y += 0.5) { lo = Math.max(lo, innerX(y)); hi = Math.min(hi, outerX(y)); }
    return [lo + pinR + M, hi - pinR - M];
  };
  const [aLo, aHi] = span(yB), [bLo, bHi] = span(yT);
  const lo = Math.max(aLo, bLo), hi = Math.min(aHi, bHi);
  const pxs = hi - lo >= 2 * pinR + 6 ? [lo, hi] : hi > lo ? [(lo + hi) / 2] : [];
  const pinsB = pxs.map((px) => [px, yB]);
  const pinsT = pxs.map((px) => [px, yT]);
  const bottom = new THREE.ExtrudeGeometry(ribBandShape(p, k, 0, splitY, pinsB), { depth: boardT, bevelEnabled: false });
  const top = new THREE.ExtrudeGeometry(ribBandShape(p, k, splitY, height, pinsT), { depth: boardT, bevelEnabled: false });
  const sh = new THREE.Shape(); // 当て板
  const sm = Math.min(3, (wHi - wLo) / 3);   // 帯が細い時は当て板マージンも縮めて反転を防ぐ
  const sx0 = wLo + sm, sx1 = wHi - sm;
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
    // ノッチ外側の戻り点は次の歯の起点。最後の板の分は開始点(moveTo)と厳密に一致
    // するため省略し、closePath に任せる(重複点による退化三角形を防ぐ)。
    if (k < boards - 1) shape.lineTo(rOut * dx + nx * sw / 2, rOut * dy + ny * sw / 2);
  }
  shape.closePath();
  return shape;
}
export function komaGeometry(p) {
  return new THREE.ExtrudeGeometry(komaShape(p), { depth: p.komaT, bevelEnabled: false });
}

// ============ 土台(シンプルな差し込み式) ============
// コマの縁をU字サドル(切り欠き)で受ける「均一厚の平板」の柱×2を、
// 1枚の薄いベース板のスリットへ差し込むだけ。柱は一定厚なので底面が完全に
// フラット → 平置きで宙に浮く箇所なく(サポート不要で)印刷できる。
// 両柱を1枚の板が正しい間隔で保持 → クリップや連結金具は不要。
const GROOVE_FIT = 1.0;   // U字サドルのコマ厚クリアランス(コマがすっと嵌まる遊び)
const SADDLE_FIT = 1.5;   // サドル受け半径のクリアランス(コマ縁を上から落とし込む余裕)
const BASE_T = 5;         // ベース板の厚み(mm, 中央は薄く保つ)
const COLLAR_H = 10;      // スリット周りに立てる襟(ソケット)の高さ → 差し込みを深くしぐらつき抑制
const COLLAR_W = 4;       // 襟の壁厚(mm)
const TENON_W = 44;       // 柱の差し込みホゾ幅(mm)
const TENON_D = BASE_T + COLLAR_H; // ホゾ差し込み深さ = 襟の天面〜板の底(全長で受ける)
const FOOT_HW = 29;       // 柱脚の半幅(襟の天面に接地する足)
const SLOT_FIT = 0.4;     // スリットのはめあいクリアランス
const BASE_MARGIN = 8;    // ベース板の端マージン
// 柱の厚み(z) = コマ厚 + クリアランス。この一定厚の平板1枚で柱を作る。
function standFullW(p) { return p.komaT + GROOVE_FIT; }

// 柱プロファイル(局所 x=幅, y=高さ)。下端の差し込みホゾ＋上端のU字サドル＋肉抜き窓を含む。
function standProfile(seatR, H, halfOpen, colW) {
  const lipY = H - seatR * Math.cos(halfOpen);
  const lipX = seatR * Math.sin(halfOpen);
  const topY = lipY + 8;
  const shoulder = 26;               // 脚→本体へ広がる高さ
  const s = new THREE.Shape();
  s.moveTo(-TENON_W / 2, -TENON_D);  // 下端: 中央ホゾ→足→肩へテーパ
  s.lineTo(TENON_W / 2, -TENON_D);
  s.lineTo(TENON_W / 2, 0);
  s.lineTo(FOOT_HW, 0);
  s.lineTo(colW, shoulder);
  s.lineTo(colW, topY);
  s.lineTo(lipX, topY);
  s.lineTo(lipX, lipY);
  for (let i = 0; i <= 32; i++) {
    const a = halfOpen - (i / 32) * (2 * halfOpen); // 右縁→底→左縁(U字サドル)
    s.lineTo(seatR * Math.sin(a), H - seatR * Math.cos(a));
  }
  s.lineTo(-lipX, topY);
  s.lineTo(-colW, topY);
  s.lineTo(-colW, shoulder);
  s.lineTo(-FOOT_HW, 0);
  s.lineTo(-TENON_W / 2, 0);
  s.lineTo(-TENON_W / 2, -TENON_D);
  s.closePath();
  // 肉抜き窓。縁の脚を残しつつ中央を広く抜く(高い柱は桟で2分割し剛性を残す)。
  const wx = colW - 8;               // 外脚を8mmだけ残す
  const wy0 = shoulder + 5, wy1 = H - seatR - 6; // 足の肩上〜サドル底の直下まで
  if (wx > 8 && wy1 - wy0 > 40) {    // 高い柱は2分割(桟を残す)
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
  return s;
}
// 柱 = 一定厚(=コマ厚+クリアランス)の平板1枚。上端のU字切り欠きでコマの縁を受け、
// 下端の中央ホゾをベース板スリットへ差し込む。厚みが均一なので平置き印刷で底面が
// 完全フラット → 宙に浮く箇所なし・サポート不要。コマの厚み方向はU字溝に嵌まって
// 収まり、軸方向は左右2つの柱で挟んで位置決めする。
// 組立プレビューで土台を正しい高さに置くための寸法(床基準):
export function standCollarTop() { return BASE_T + COLLAR_H; } // 柱脚が乗る高さ(=襟の天面)
export function standSaddleH(p) { return maxRadius(p) + 15; }  // 柱ローカルのサドル中心高さ
export function standGeometry(p) {
  const R = maxRadius(p);
  const kR = komaR(p);
  const H = standSaddleH(p);         // サドル中心(コマ中心)の高さ(最大径+床クリアランス15mm)
  const saddleR = kR + SADDLE_FIT;   // U字溝の受け半径(コマ縁+クリアランス)
  const halfOpen = Math.PI * 0.5;    // 半円サドル: 口の幅=直径 → コマを上から落として載せられる
  const colW = saddleR * Math.sin(halfOpen) + 12;
  const T = standFullW(p);           // 板厚 = コマ厚 + クリアランス
  const g = new THREE.ExtrudeGeometry(
    standProfile(saddleR, H, halfOpen, colW),
    { depth: T, bevelEnabled: false });
  g.translate(0, 0, -T / 2);
  return g;
}
// 2つの柱(サドル)は、2つのコマの真下に来なければ溝に嵌まらない。
// → 柱スリット間隔 = コマ中心の間隔。コマは爪(長さtabLen)に差し込み先端まで押し込むので、
//   コマ中心は端から komaT/2 の位置に来る。よって間隔 = 火袋 + 2*(tabLen - komaT/2)
//   = 火袋 + 2*tabLen - komaT(爪の先端＝差し込みの止まり位置基準)。
export function standSlotSep(p) { return p.height + 2 * p.tabLen - p.komaT; }
// ベース板: 薄い平板に柱ホゾ用スリットを2つ。全長 = コマ間隔 + スリット幅 + 両端マージン。
// (スリットをコマ真下=±間隔/2 に置き、その外側に材料を残すため羽根板より少し長い)
export function standBoardLength(p) {
  return standSlotSep(p) + standFullW(p) + SLOT_FIT + 2 * BASE_MARGIN;
}
// 角丸長方形の穴パス(中心cx,cy / 半幅hx,hy / 角半径r)。
// 角を丸めると「複数の穴が同じ走査線を共有する」退化を避けられ、three.js の
// ExtrudeGeometry が非多様体(open edge)を出さずに済む。ホゾ差し込みにも優しい。
function roundedRectPath(cx, cy, hx, hy, r) {
  r = Math.max(0.2, Math.min(r, hx - 0.05, hy - 0.05));
  const p = new THREE.Path();
  p.moveTo(cx - hx + r, cy - hy);
  p.lineTo(cx + hx - r, cy - hy); p.absarc(cx + hx - r, cy - hy + r, r, -Math.PI / 2, 0, false);
  p.lineTo(cx + hx, cy + hy - r); p.absarc(cx + hx - r, cy + hy - r, r, 0, Math.PI / 2, false);
  p.lineTo(cx - hx + r, cy + hy); p.absarc(cx - hx + r, cy + hy - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(cx - hx, cy - hy + r); p.absarc(cx - hx + r, cy - hy + r, r, Math.PI, Math.PI * 1.5, false);
  p.closePath();
  return p;
}
export function boardGeometry(p) {
  const len = standBoardLength(p);
  const sep = standSlotSep(p);                          // 柱スリット間隔 = コマ間隔
  const W = TENON_W + 2 * BASE_MARGIN;                   // ベース板の幅
  const s = new THREE.Shape();
  s.moveTo(-len / 2, -W / 2);
  s.lineTo(len / 2, -W / 2);
  s.lineTo(len / 2, W / 2);
  s.lineTo(-len / 2, W / 2);
  s.closePath();
  const sx = (standFullW(p) + SLOT_FIT) / 2, sy = (TENON_W + SLOT_FIT) / 2;
  // 柱ホゾ用スリット×2。角は直角のまま(角柱ホゾがぴったり差し込めるように)。
  // ただし2スリットのy端が厳密に同一走査線だと earcut が破綻し open edge が
  // 出るので、上下に ±0.1mm だけ互い違いにずらして退化を回避する
  // (ずれは SLOT_FIT=0.4mm 内なので嵌合には影響しない)。
  const STAGGER = 0.1;
  const slots = [[-sep / 2, STAGGER], [sep / 2, -STAGGER]];
  const slotRect = (cx, dy, hx, hy) => {
    const p = new THREE.Path();
    p.moveTo(cx - hx, dy - hy); p.lineTo(cx + hx, dy - hy);
    p.lineTo(cx + hx, dy + hy); p.lineTo(cx - hx, dy + hy); p.closePath();
    return p;
  };
  for (const [cx, dy] of slots) s.holes.push(slotRect(cx, dy, sx, sy));
  // 肉抜き: スリット間の中央を1つの大きな窓で抜く(桟なし)。端とスリット周りだけ残す。
  const wall = 9, hw = W / 2 - wall, innerHalf = sep / 2 - sx - wall;
  if (hw > 4 && innerHalf > 8) {
    s.holes.push(roundedRectPath(0, 0, innerHalf, hw, 2));
  }
  const geos = [new THREE.ExtrudeGeometry(s, { depth: BASE_T, bevelEnabled: false })];
  // スリット周りに襟(ソケット)を立て、差し込み深さを BASE_T→BASE_T+COLLAR_H に。
  // 各襟は独立した密閉ソリッド。板へ僅かに沈めて自己交差(=スライサでunion)させ、
  // 面の完全一致による非多様体エッジを避ける。中央は薄いままなので材料は最小。
  const SINK = 1.5, EPS = 0.03;
  for (const [cx, dy] of slots) {
    const c = new THREE.Shape();
    const oX = sx + COLLAR_W, oY = sy + COLLAR_W;
    c.moveTo(cx - oX, dy - oY); c.lineTo(cx + oX, dy - oY);
    c.lineTo(cx + oX, dy + oY); c.lineTo(cx - oX, dy + oY); c.closePath();
    c.holes.push(slotRect(cx, dy, sx + EPS, sy + EPS)); // 板スリットと僅かに非一致
    const g = new THREE.ExtrudeGeometry(c, { depth: COLLAR_H + SINK, bevelEnabled: false });
    g.translate(0, 0, BASE_T - SINK);
    geos.push(g);
  }
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}
