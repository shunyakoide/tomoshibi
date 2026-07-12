/**
 * ============================================================================
 * 張型スタジオ (HARIGATA STUDIO) v5
 * ============================================================================
 * 【概要】
 * 岐阜提灯 / イサム・ノグチAKARI方式の「あかりランプ」を自作するための
 * 3Dプリント用張型(はりがた=竹ひご巻き・和紙張りの型)ジェネレーター。
 * プロファイル曲線をパラメトリックに調整し、以下3種のSTLを出力する:
 *   1. 羽根板 (rib)   … 型の縦骨。外周縁に竹ひご用の半円溝を持つ板×N枚
 *   2. コマ (koma)    … 上下端の丸板。縁から切り込む開放ノッチ(歯車状)で
 *                        羽根板の端タブを保持。和紙乾燥後に外して型を抜く
 *   3. 土台 (stand)   … 作業台。コマの縁をU字サドルで受ける薄板の柱×2 を、
 *                        1枚の薄いベース板のスリットへ差し込むだけのシンプル構成。
 *                        型を横置きし回しながらひご巻き/和紙張りできる
 *                        (心棒は使わない — akari-ozeki.com/make/ の写真準拠)
 *
 * 【制作フロー(実物側)】
 * 印刷 → コマ2枚のノッチに羽根板8枚を番号順に差し込み(0番はキー=深い) →
 * 溝に竹ひごを螺旋or平行に巻く → 糊+和紙を張る → 乾燥 → コマを外し
 * 羽根板を上下開口から1枚ずつ抜く → 火袋完成 → 三本脚等の照明化
 *
 * 【座標系・単位】
 * - 全寸法mm。Three.jsのY-up。STL出力はZ-up変換なし
 *   (羽根板/コマ/土台はXY平面シェイプ+Z押し出し=そのまま平置き印刷向き)
 * - prof(p, t): 高さ正規化 t∈[0,1] → 半径mm。curve種別でシルエット決定
 *   egg/sphere/cocoon/gourd/barrel/bud (AKARI系プリセット対応)
 *
 * 【主要パラメータ (state p)】
 * height(火袋高), topR/bottomR(端半径), bulge(ふくらみ), curve(形状式),
 * boards(羽根板枚数6-12), boardWidth(板幅), boardT(板厚),
 * higoD(竹ひご径→溝半径=higoD/2+0.15クリアランス), pitch(溝間隔),
 * spiral(true=板kごとに溝をk*pitch/Nずらす巻掛け技法),
 * tabW(タブ掛かり深さ, 端半径40%で自動クランプ), fit(ノッチ幅公差),
 * tabLen(タブ突出10), komaT(コマ厚8)
 *
 * 【組立機構の設計意図】
 * - タブは板の「外縁側」。コマのノッチは縁まで開放(閉じた穴なし)
 * - ノッチ壁は平行、幅=boardT+fit → ガタつき防止。fitスライダーで調整
 * - 0番板のみタブ+3mm深い=キー → 組み間違い防止
 * - 番号穴: 板kにφ2穴が(k+1)個 → 順番識別
 * - タブ先端1.2mm面取り → 差し込み容易
 *
 * 【印刷ビュー】
 * Bambu Lab A1 (256×256mm)想定。種別ごと(羽根板/小物)に別セルで
 * グリッド整列し、プレートは田の字配置。羽根板長=height+2*tabLen が
 * 256超過時はUIに警告(高さ236mm以下推奨)
 *
 * 【既知の注意点・カメラ実装】
 * - frame()がfar平面をbaseDist*3へ自動拡張(遠距離クリップ対策済み)
 * - フォグは印刷ビューのみ無効(遠景黒沈み対策)
 * - 自動回転なし。ドラッグ=オービット、ピンチ/ホイール=ズーム
 * - lit(点灯)ビュー: LatheGeometryの和紙スキン+内部PointLight+
 *   AKARI 1AY風三本ワイヤー脚(legH=height*0.42)
 *
 * 【未実装/TODO候補】
 * - STLのZIP一括出力 / 3MF対応
 * - コマを外すための分割羽根(現状は上下開口から抜く前提)
 * - 溝ピッチの不等間隔(曲率対応) / ひご総長の自動計算
 * - E26/E17ソケットリング・シェード金具パーツ
 * ============================================================================
 */
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ============ プロファイル ============
function prof(p, t) {
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
function maxRadius(p) {
  let m = 0;
  for (let i = 0; i <= 120; i++) m = Math.max(m, prof(p, i / 120));
  return m + p.higoD;
}
// 首(くび): 上下端に cutBottom(mm) の高さぶん、外周を「肩の外径のままま垂直」にした
// まっすぐな首を作る。外側へ張り出さず、爪(タブ)は羽根の一番外側の縁(この外径)に来る。
// 首には竹ひごを巻かない。cutT = 首の正規化高さ。
function cutT(p) {
  return Math.min(0.45, Math.max(0, (p.cutBottom || 0) / Math.max(1, p.height)));
}
function cutY(p) {
  return cutT(p) * p.height; // 首の高さ(mm)
}
// 実効外周半径。上下端の首は肩の外径(prof(cutT)/prof(1-cutT))で垂直、中央は本体カーブ。
function outerR(p, t) {
  const c = cutT(p);
  if (c <= 0) return prof(p, t);
  if (t < c) return prof(p, c);          // 下の首(垂直, 爪=外端)
  if (t > 1 - c) return prof(p, 1 - c);  // 上の首(垂直, 爪=外端)
  return prof(p, t);
}
// コマ外径 = 爪を纏める小さなハブの半径。爪(内端Ri〜Ri+td)がコマの縁(外周)に来る。
// 上下共通(Ri・tabDepthは共通)。土台は別途、羽根の外周円で受ける。
function komaR(p, top) {
  return innerRi(p) + tabDepth(p) + 3;
}
// タブ(羽根の差し込み部)の半径方向の奥行き = コマのノッチ深さ。
// 上下・全羽根で一律(細い方の端に合わせる)。→ どの羽根もどちらのコマにも同じ深さで嵌まる。
function tabDepth(p) {
  const minEnd = Math.min(outerR(p, 0), outerR(p, 1));
  return Math.min(p.tabW, Math.max(6, minEnd * 0.4));
}
// 羽根幅の上限: 乾燥後に大きい方の開口(端半径)から抜けるよう、開口以下に抑える
function effBoardWidth(p) {
  return Math.min(p.boardWidth, Math.max(outerR(p, 0), outerR(p, 1)) - 1);
}

// ============ 2D断面(確定形状) ============
// 内縁をまっすぐな芯(半径 Ri = tabR)にし、その内側に上下同じ位置で爪。外縁は本体カーブ＋首。
// 中央は肉抜き(外縁の帯=溝を保持 と 内縁の芯=爪を支える を残す)。羽根の断面ビューで使う。
function innerRi(p) {
  const td = tabDepth(p);
  const lim = Math.min(outerR(p, 0), outerR(p, 1)) - td - 2;
  return Math.max(6, Math.min(p.tabR ?? 15, lim));
}
// 羽根の外形点列 + 溝位置 + outerX関数を返す(2D描画 と 3D羽根geometry で共有)。
// k = 羽根番号(螺旋巻きで溝を k*pitch/boards ずらす)。
function ribOutline2D(p, k = 0) {
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
function lightenHoles2D(p) {
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
function ribEdges(p, k) {
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
function ribShape(p, k) {
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
const ribGeometry = (p, k) => {
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
function ribSplitParts(p, k) {
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
function komaShape(p, top) {
  const { boards, boardT, fit } = p;
  const R = komaR(p, top);
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
function komaGeometry(p, top) {
  return new THREE.ExtrudeGeometry(komaShape(p, top), { depth: p.komaT, bevelEnabled: false });
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
function standGeometry(p, top) {
  const R = maxRadius(p);
  const kR = komaR(p, top);
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
function standBoardLength(p) {
  return p.height + 2 * p.tabLen; // 羽根板と同じ全長
}
function boardGeometry(p) {
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

// ============ STL ============
// バイナリSTLを ArrayBuffer で生成(DL/ZIP どちらにも使う)
function buildSTL(geometries) {
  const geos = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  let tri = 0;
  for (const g of geos) tri += g.attributes.position.count / 3;
  const buf = new ArrayBuffer(84 + tri * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tri, true);
  let off = 84;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const cb = new THREE.Vector3(), ab = new THREE.Vector3();
  for (const g of geos) {
    const pos = g.attributes.position;
    for (let f = 0; f < pos.count; f += 3) {
      for (let i = 0; i < 3; i++) v[i].fromBufferAttribute(pos, f + i);
      cb.subVectors(v[2], v[1]); ab.subVectors(v[0], v[1]); cb.cross(ab).normalize();
      dv.setFloat32(off, cb.x, true); dv.setFloat32(off + 4, cb.y, true); dv.setFloat32(off + 8, cb.z, true);
      off += 12;
      for (const q of v) {
        dv.setFloat32(off, q.x, true); dv.setFloat32(off + 4, q.y, true); dv.setFloat32(off + 8, q.z, true);
        off += 12;
      }
      dv.setUint16(off, 0, true); off += 2;
    }
  }
  return buf;
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function exportSTL(geometries, filename) {
  triggerDownload(new Blob([buildSTL(geometries)], { type: "application/octet-stream" }), filename);
}

// ---- 最小 ZIP(無圧縮 STORE + CRC32)。依存を増やさず複数STLを1ファイルに ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(files) { // files: [{ name, bytes: Uint8Array }]
  const enc = new TextEncoder();
  const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.bytes, crc = crc32(data);
    const lh = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    chunks.push(lh, name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset)]), name);
    offset += lh.length + name.length + data.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) { chunks.push(c); cdSize += c.length; }
  chunks.push(new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(cdStart), ...u16(0)]));
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}
function exportZip(parts, filename) { // parts: [{ name, geos }]
  const files = parts.map((pt) => ({ name: pt.name, bytes: new Uint8Array(buildSTL(pt.geos)) }));
  triggerDownload(new Blob([makeZip(files)], { type: "application/zip" }), filename);
}

// ============ プリセット / スライダー ============
const PRESETS = [
  { name: "たまご", curve: "egg", bulge: 62, topR: 22, bottomR: 34, height: 200 },
  { name: "球", curve: "sphere", bulge: 75, topR: 25, bottomR: 25, height: 210 },
  { name: "ひょうたん", curve: "gourd", bulge: 65, topR: 28, bottomR: 30, height: 280 },
];
const SLIDERS = [
  { key: "height", label: "火袋の高さ", min: 100, max: 500, step: 5, unit: "mm" },
  { key: "topR", label: "上部半径", min: 20, max: 120, step: 1, unit: "mm" },
  { key: "bottomR", label: "下部半径", min: 20, max: 120, step: 1, unit: "mm" },
  { key: "bulge", label: "ふくらみ量", min: 0, max: 160, step: 1, unit: "mm" },
  { key: "cutBottom", label: "首の高さ(上下)", min: 0, max: 80, step: 5, unit: "mm" },
  { key: "tabR", label: "爪の位置(内縁半径)", min: 6, max: 45, step: 1, unit: "mm" },
  { key: "tabLen", label: "爪の長さ", min: 10, max: 45, step: 1, unit: "mm" },
  { key: "boards", label: "羽根板の枚数", min: 6, max: 12, step: 2, unit: "枚" },
  { key: "boardT", label: "板厚", min: 2, max: 10, step: 0.5, unit: "mm" },
  { key: "higoD", label: "竹ひご径", min: 1, max: 4, step: 0.1, unit: "mm" },
  { key: "pitch", label: "ひごピッチ", min: 8, max: 40, step: 1, unit: "mm" },
  { key: "fit", label: "はめあい公差", min: 0.1, max: 0.6, step: 0.05, unit: "mm" },
];
const DEFAULTS = {
  ...PRESETS[0], boards: 8, boardWidth: 35, boardT: 2, higoD: 2,
  pitch: 15, fit: 0.3, spiral: true, tabLen: 10, tabW: 10, komaT: 8, // 爪は短く(先端にコマ)
  cutBottom: 15, // 上下端のまっすぐな首
  tabR: 15,      // 爪(タブ)の半径 = 内縁のまっすぐな芯。上下同じ位置で内側
  lighten: true, // 羽根の中央を肉抜き(外縁の帯と内縁の芯を残す)
};
// インスペクタのセクション分け(キーは SLIDERS の key を参照)
const GROUPS = [
  { title: "シルエット", keys: ["height", "topR", "bottomR", "bulge", "cutBottom"] },
  { title: "羽根の芯・爪", keys: ["tabR", "tabLen"] },
  { title: "骨組み", keys: ["boards", "boardT"] },
  { title: "竹ひご", keys: ["higoD", "pitch"] },
  { title: "組立公差", keys: ["fit"] },
];
const SLIDER_BY_KEY = Object.fromEntries(SLIDERS.map((s) => [s.key, s]));

export default function HarigataStudio() {
  const [p, setP] = useState(DEFAULTS);
  const [view, setView] = useState("2d"); // 既定は2D断面ビュー(形が分かりやすい)
  const cv2dRef = useRef(null);           // 2D断面キャンバス
  const [printRibs, setPrintRibs] = useState(1); // 印刷ビューで一度に並べる羽根板の枚数
  const [splitRibs, setSplitRibs] = useState(false); // 羽根板を上下2分割(大型ランプ用)
  const [bedW, setBedW] = useState(256); // プリントベッド幅(mm)。機種で異なるので可変
  const [bedD, setBedD] = useState(256); // プリントベッド奥行き(mm)
  const [glError, setGlError] = useState(null);
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 860 : false
  );
  const mountRef = useRef(null);
  const T = useRef({});

  // 画面幅で左右レイアウト / 縦積みを切替
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 860);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    let cleanup;
    try {
      const scene = new THREE.Scene();
    // 背景は mount 側の CSS グラデーションで描く。canvas は透過にして
    // ビューごとに CAD調(明) / 点灯(暗) を切り替える。fog は再構築側で設定。
    const camera = new THREE.PerspectiveCamera(36, 1, 1, 4000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // スタジオ風の環境光(IBL)。Standard/Physical マテリアルに柔らかな映り込みを与え、
    // のっぺり感を解消する。組立/印刷ビューで使用(点灯ビューは暗室演出のため外す)。
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(amb);
    const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(240, 380, 280); scene.add(key);
    const rim = new THREE.DirectionalLight(0x8890a8, 0.35); rim.position.set(-260, 120, -260); scene.add(rim);
    const bulb = new THREE.PointLight(0xffc37a, 0, 900, 1.5); scene.add(bulb);

    // CAD調の地面グリッド(組立ビューのみ表示)。遠方はフォグでbgへ溶ける。
    const groundGrid = new THREE.GridHelper(2400, 48, 0xaab0ba, 0xc7ccd4);
    groundGrid.position.y = 0;
    groundGrid.visible = false;
    scene.add(groundGrid);
    const shadowTex = (() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
      g.addColorStop(0, "rgba(0,0,0,0.5)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(cv);
    })();
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.5;
    scene.add(shadow);

    const group = new THREE.Group();
    scene.add(group);
    T.current = {
      scene, camera, renderer, group, bulb, shadow, amb, key, groundGrid, envMap,
      // 羽根板: コート系フィラメント風にごく薄いクリアコートを載せて上質な艶を出す
      ribMat: new THREE.MeshPhysicalMaterial({
        color: 0xc3b291, roughness: 0.5, metalness: 0.0,
        clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.9,
      }),
      // コマ: マットな樹脂。羽根板と仕上げ差をつけて部品の区別を明快に
      komaMat: new THREE.MeshStandardMaterial({ color: 0x94897c, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.85 }),
      // 土台: 焼き締めた陶のような暗いつや消し
      standMat: new THREE.MeshStandardMaterial({ color: 0x6b6156, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.75 }),
      washiMat: new THREE.MeshStandardMaterial({
        color: 0xf7f3ea, roughness: 0.9, transparent: true, opacity: 0.94,
        emissive: 0xffb96a, emissiveIntensity: 0, side: THREE.FrontSide,
      }),
      rot: { x: -0.15, y: 0.5 }, baseDist: 700, zoom: 1, idle: 0,
    };

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    // ビューポートの実サイズ変化(左右レイアウト切替・パネル幅など)にも追従
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(mount);

    let drag = false, px = 0, py = 0, pinch = 0;
    const el = renderer.domElement;
    const down = (x, y) => { drag = true; T.current.idle = 0; px = x; py = y; };
    const move = (x, y) => {
      if (!drag) return;
      const s = T.current;
      s.idle = 0;
      s.rot.y += (x - px) * 0.008;
      s.rot.x = Math.min(0.4, Math.max(-1.3, s.rot.x + (y - py) * 0.006));
      px = x; py = y;
    };
    el.addEventListener("mousedown", (e) => down(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => move(e.clientX, e.clientY));
    window.addEventListener("mouseup", () => (drag = false));
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      T.current.idle = 0;
      T.current.zoom = Math.min(3, Math.max(0.45, T.current.zoom + e.deltaY * 0.0012));
    }, { passive: false });
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY);
      if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY);
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        T.current.idle = 0;
        T.current.zoom = Math.min(3, Math.max(0.45, T.current.zoom - (d - pinch) * 0.004));
        pinch = d;
      }
    }, { passive: true });
    el.addEventListener("touchend", () => (drag = false));

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const s = T.current;
      const dist = s.baseDist * s.zoom;
      s.camera.position.set(
        dist * Math.sin(s.rot.y) * Math.cos(s.rot.x),
        (s.lookY ?? 120) - dist * Math.sin(s.rot.x),
        dist * Math.cos(s.rot.y) * Math.cos(s.rot.x)
      );
      s.camera.lookAt(0, s.lookY ?? 120, 0);
      s.renderer.render(s.scene, s.camera);
    };
    animate();
      cleanup = () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); if (ro) ro.disconnect(); if (el.parentNode === mount) mount.removeChild(el); renderer.dispose(); };
    } catch (e) {
      // WebGL 初期化失敗(古い端末 / コンテキスト取得不可 等)。
      // 画面全体を黒にせず UI は残し、原因メッセージだけ表示する。
      setGlError((e && e.message) || String(e));
    }
    return () => { if (cleanup) cleanup(); };
  }, []);

  // プレビュー再構築 + 自動フレーミング
  useEffect(() => {
    const s = T.current;
    if (!s.group) return;
    while (s.group.children.length) {
      const m = s.group.children[0];
      s.group.remove(m);
      m.traverse((o) => o.geometry && o.geometry.dispose());
    }
    if (view === "2d") return; // 2D断面ビューは別キャンバスで描画(3D構築はスキップ)
    const R = maxRadius(p);
    const lightVP = view !== "lit"; // 組立/印刷は CAD調の明るい背景、点灯だけ暗い
    s.shadow.scale.set(R * 3.2, R * 3.2, 1);
    s.shadow.visible = view !== "print";
    s.shadow.material.opacity = lightVP ? 0.3 : 1; // 明背景ではコンタクトシャドウを淡く
    s.groundGrid.visible = view === "mold";
    // 環境光は明ビューのみ。点灯は暗室に灯りだけ浮かせたいので外す。
    s.scene.environment = lightVP ? s.envMap : null;
    s.scene.fog = view === "print" ? null
      : new THREE.Fog(lightVP ? 0xbfb5a3 : 0x070a11, 1000, 2400);
    // IBL がフィルを担うぶんアンビエントは控えめに。キーを強めてフォルムの陰影を立て、
    // 背景から浮かせる(白飛び防止しつつ図と地のコントラストを確保)。
    s.amb.intensity = view === "print" ? 0.5 : lightVP ? 0.3 : 0.5;
    s.key.intensity = view === "print" ? 0.85 : lightVP ? 1.1 : 0.85;
    s.key.position.set(view === "print" ? 80 : 240, view === "print" ? 500 : 380, view === "print" ? 120 : 280);
    s.bulb.intensity = 0;
    s.washiMat.emissiveIntensity = 0;

    const frame = (contentH, contentR, centerY) => {
      const cam = s.camera;
      const fovV = (cam.fov * Math.PI) / 180;
      const fovH = 2 * Math.atan(Math.tan(fovV / 2) * cam.aspect);
      const dV = (contentH / 2) / Math.tan(fovV / 2);
      const dH = contentR / Math.tan(fovH / 2);
      s.baseDist = Math.max(dV, dH) * 1.45;
      cam.far = Math.max(4000, s.baseDist * 3);
      cam.updateProjectionMatrix();
      s.zoom = 1;
      s.lookY = centerY;
    };

    if (view === "lit") {
      const legH = p.height * 0.42; // 三本脚(1AYスタイル)
      // 首(上下端の垂直部)には竹ひご・和紙が無い ＝ 何も張られないので描かない。
      // 火袋(和紙が張られる中央)だけを発光スキンとして表示し、首は開いたまま。
      const cB = cutT(p); // 首の割合(0..0.45)
      const t0 = cB, t1 = 1 - cB;
      const pts = [];
      const N = 48;
      for (let i = 0; i <= N; i++) {
        const t = t0 + (t1 - t0) * (i / N);
        pts.push(new THREE.Vector2(outerR(p, t) + p.higoD, legH + t * p.height));
      }
      s.group.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 96), s.washiMat));
      // 脚: 火袋の底縁から外に開いて床へ。暗背景に沈まないグラファイト(黒鉄の質感は保つ)
      const legMat = new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.4, metalness: 0.3 });
      const r0 = outerR(p, 0) * 0.75, r1 = maxRadius(p) * 0.62;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const topP = new THREE.Vector3(r0 * Math.cos(a), legH + p.height * 0.04, r0 * Math.sin(a));
        const botP = new THREE.Vector3(r1 * Math.cos(a), 2, r1 * Math.sin(a));
        const dir = new THREE.Vector3().subVectors(botP, topP);
        const len = dir.length();
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, len, 12), legMat);
        leg.position.copy(topP).addScaledVector(dir, 0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        s.group.add(leg);
        const foot = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), legMat);
        foot.position.copy(botP);
        s.group.add(foot);
      }
      s.washiMat.emissiveIntensity = 0.5;
      s.bulb.intensity = 1.6;
      s.bulb.position.set(0, legH + p.height * 0.55, 0);
      frame((legH + p.height) * 1.12, R, (legH + p.height) * 0.55);
      return;
    }

    const mold = new THREE.Group();
    for (let k = 0; k < p.boards; k++) {
      const mesh = new THREE.Mesh(ribGeometry(p, k), s.ribMat);
      mesh.rotation.y = (k / p.boards) * Math.PI * 2;
      mold.add(mesh);
    }
    const kb = new THREE.Mesh(komaGeometry(p, false), s.komaMat);
    kb.rotation.x = -Math.PI / 2; kb.position.y = -p.tabLen; // 下コマ(開口=首の外径)
    mold.add(kb);
    const kt = new THREE.Mesh(komaGeometry(p, true), s.komaMat);
    kt.rotation.x = Math.PI / 2; kt.position.y = p.height + p.tabLen;
    mold.add(kt);

    if (view === "mold") {
      mold.position.y = p.tabLen; // 下コマ/タブ先端を床へ(埋まり防止)
      s.group.add(mold);
      frame((p.height + p.tabLen * 2 + p.komaT * 2) * 1.1, R, p.height * 0.5 + p.tabLen);
    } else {
      // 印刷ビュー: Bambu Lab A1 (256×256mm)。種別ごとにセル計算しプレートを田の字配置
      const BEDW = bedW, BEDD = bedD, GAP = 8;
      const nRibs = Math.min(printRibs, p.boards); // 印刷する羽根板の枚数(1..boards)
      const ribs = [];
      for (let k = 0; k < nRibs; k++) {
        if (splitRibs) {
          const sp = ribSplitParts(p, k);
          ribs.push({ geo: sp.bottom, mat: s.ribMat }, { geo: sp.top, mat: s.ribMat }, { geo: sp.splice, mat: s.komaMat });
        } else {
          ribs.push({ geo: ribGeometry(p, k), mat: s.ribMat });
        }
      }
      // コマと土台は STL 出力が別々なので、プレビューでも別プレートに分ける
      const komas = [
        { geo: komaGeometry(p, false), mat: s.komaMat },
        { geo: komaGeometry(p, true), mat: s.komaMat },
      ];
      const stands = [
        { geo: standGeometry(p, false), mat: s.standMat },
        { geo: standGeometry(p, true), mat: s.standMat },
      ];
      // ベース板は長さが火袋高さで変わるため別プレートに。柱の配置が動かないようにする
      const boards = [{ geo: boardGeometry(p), mat: s.standMat }];

      let plateIdx = 0;
      const placed = [];
      const layout = (items) => {
        if (!items.length) return;
        let mW = 0, mD = 0;
        items.forEach((pt) => {
          pt.geo.computeBoundingBox();
          pt.bb = pt.geo.boundingBox;
          mW = Math.max(mW, pt.bb.max.x - pt.bb.min.x);
          mD = Math.max(mD, pt.bb.max.y - pt.bb.min.y);
        });
        const cW = mW + GAP, cD = mD + GAP;
        const cols = Math.max(1, Math.floor((BEDW - GAP) / cW));
        const rows = Math.max(1, Math.floor((BEDD - GAP) / cD));
        const per = cols * rows;
        items.forEach((pt, i) => {
          const w = pt.bb.max.x - pt.bb.min.x, d = pt.bb.max.y - pt.bb.min.y;
          const onPlate = Math.min(per, items.length - Math.floor(i / per) * per); // このプレートの部品数
          const uc = Math.min(cols, onPlate), ur = Math.ceil(onPlate / cols);       // 実使用の列・行数
          const gridW = uc * cW - GAP, gridD = ur * cD - GAP;
          const ox0 = Math.max(2, (BEDW - gridW) / 2), oz0 = Math.max(2, (BEDD - gridD) / 2); // ベッド中央に配置
          placed.push({
            ...pt,
            plate: plateIdx + Math.floor(i / per),
            ox: ox0 + (i % per % cols) * cW + (mW - w) / 2,
            oz: oz0 + Math.floor((i % per) / cols) * cD + (mD - d) / 2,
          });
        });
        plateIdx += Math.ceil(items.length / per);
      };
      layout(ribs);
      layout(komas);
      layout(stands);
      layout(boards);

      const plates = plateIdx;
      const pCols = Math.ceil(Math.sqrt(plates));
      const pRows = Math.ceil(plates / pCols);
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x1e1e23, roughness: 0.9 });
      const platePos = (pl) => [(pl % pCols) * (BEDW + 40), Math.floor(pl / pCols) * (BEDD + 40)];
      const gridDivs = Math.max(2, Math.round(BEDW / 32)); // ≒32mm セル
      for (let pl = 0; pl < plates; pl++) {
        const [px, pz] = platePos(pl);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(BEDW, 2, BEDD), plateMat);
        plate.position.set(px + BEDW / 2, -1, pz + BEDD / 2);
        s.group.add(plate);
        const grid = new THREE.GridHelper(BEDW, gridDivs, 0x3f3f46, 0x2c2c31);
        grid.scale.z = BEDD / BEDW; // 長方形ベッドに合わせて奥行き方向を伸縮
        grid.position.set(px + BEDW / 2, 0.15, pz + BEDD / 2);
        s.group.add(grid);
      }
      placed.forEach((pt) => {
        const [px, pz] = platePos(pt.plate);
        const m = new THREE.Mesh(pt.geo, pt.mat);
        m.rotation.x = -Math.PI / 2;
        // rotation.x=-90° で local z → world y。部品の z 下端がプレートに乗るよう持ち上げる
        // (土台の柱は z 中央基準なので、固定 0.6 だと厚みの半分めり込む)
        m.position.set(px + pt.ox - pt.bb.min.x, 0.6 - pt.bb.min.z, pz + pt.oz + pt.bb.max.y);
        s.group.add(m);
      });

      const totalW = pCols * (BEDW + 40) - 40;
      const totalD = pRows * (BEDD + 40) - 40;
      s.group.children.forEach((m) => { m.position.x -= totalW / 2; m.position.z -= totalD / 2; });
      const span = Math.max(totalW, totalD) + 50;
      s.rot.x = -1.35;
      s.rot.y = 0;
      frame(span * 0.95, span / 2, 0);
    }
  }, [p, view, printRibs, bedW, bedD, splitRibs]);

  // ---- 2D断面ビューの描画(羽根板の輪郭・爪・首・溝・肉抜き) ----
  useEffect(() => {
    if (view !== "2d") return;
    const cv = cv2dRef.current;
    if (!cv) return;
    const drawn = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = cv.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      cv.width = rect.width * dpr; cv.height = rect.height * dpr;
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = rect.width, H = rect.height;
      ctx.clearRect(0, 0, W, H);
      const C = { rib: "#cdbb96", ribLine: "#7a6a48", neck: "#e79b6a", groove: "#b98a4e",
        axis: "#b9b0a0", grid: "#e6e0d5", ink: "#242019", muted: "#8f8676", accent: "#e8590c" };

      const h = p.height, tl = p.tabLen, c = cutT(p);
      const { pts, grooves, outerX, Ri, td } = ribOutline2D(p);
      const maxX = Math.max(...Array.from({ length: 121 }, (_, i) => outerR(p, i / 120)));
      const pad = 60, sc = Math.min((W - pad * 2) / (maxX * 1.75), (H - pad * 2) / (h + 2 * tl));
      const ax = pad + 20, baseY = H - pad;
      const Y = (y) => baseY - (y + tl) * sc, X = (x) => ax + x * sc;
      const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      for (let r = 0; r <= maxX; r += 20) line(X(r), Y(h + tl), X(r), Y(-tl));
      ctx.strokeStyle = C.axis; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5;
      line(ax, Y(-tl) - 8, ax, Y(h + tl) + 8); ctx.setLineDash([]);
      ctx.fillStyle = C.muted; ctx.font = "11px ui-monospace, Menlo, monospace";
      ctx.save(); ctx.translate(ax - 10, (Y(0) + Y(h)) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center"; ctx.fillText("中心軸", 0, 0); ctx.restore();

      const outline = new Path2D();
      pts.forEach((q, i) => { const sx = X(q[0]), sy = Y(q[1]); i ? outline.lineTo(sx, sy) : outline.moveTo(sx, sy); });
      outline.closePath();
      const lh = p.lighten ? lightenHoles2D(p) : { holes: [], bandW: 11, spineW: Math.max(9, td + 3) };
      const holePaths = lh.holes.map((hole) => { const hp = new Path2D();
        hole.forEach((q, i) => { const sx = X(q[0]), sy = Y(q[1]); i ? hp.lineTo(sx, sy) : hp.moveTo(sx, sy); }); hp.closePath(); return hp; });
      const fill = new Path2D(); fill.addPath(outline); holePaths.forEach((hp) => fill.addPath(hp));
      ctx.fillStyle = C.rib; ctx.fill(fill, "evenodd");

      // 外縁の帯(溝=連続) と 内縁の芯 を色分け
      ctx.save(); ctx.clip(fill, "evenodd");
      const oS = (y) => outerR(p, Math.min(y, h) / h); // 滑らかな外周(帯の内側=穴と揃える)
      const band = new Path2D(); let f = true;
      for (let y = 0; y <= h; y += 2) { const xo = outerX(Math.min(y, h)); f ? (band.moveTo(X(xo), Y(y)), f = false) : band.lineTo(X(xo), Y(y)); }
      for (let y = h; y >= 0; y -= 2) band.lineTo(X(oS(y) - lh.bandW), Y(y));
      band.closePath();
      ctx.fillStyle = C.groove; ctx.globalAlpha = 0.20; ctx.fill(band);
      ctx.fillStyle = C.accent; ctx.globalAlpha = 0.15;
      ctx.fillRect(X(Ri), Y(h + tl), X(Ri + lh.spineW) - X(Ri), Y(-tl) - Y(h + tl));
      ctx.globalAlpha = 1; ctx.restore();

      ctx.strokeStyle = C.groove; ctx.lineWidth = 2;
      for (const g of grooves) { const rr = outerR(p, g / h); ctx.beginPath(); ctx.arc(X(rr), Y(g), (p.higoD / 2 + 0.15) * sc, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
      ctx.strokeStyle = C.ribLine; ctx.lineWidth = 2; ctx.stroke(outline);
      ctx.lineWidth = 1.4; holePaths.forEach((hp) => ctx.stroke(hp));

      // 爪(上下とも Ri の内側で同じ位置)
      ctx.fillStyle = C.accent;
      const tab = (yy) => { const P = new Path2D(); P.moveTo(X(Ri), Y(yy)); P.lineTo(X(Ri), Y(yy < 1 ? -tl : h + tl)); P.lineTo(X(Ri + td), Y(yy < 1 ? -tl : h + tl)); P.lineTo(X(Ri + td), Y(yy)); P.closePath(); ctx.fill(P); };
      tab(0); tab(h);
      ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.4;
      line(X(Ri), Y(0), X(Ri), Y(h)); ctx.setLineDash([]); ctx.globalAlpha = 1;

      // 注釈
      ctx.font = "600 12px 'Hiragino Sans', system-ui"; ctx.textAlign = "left";
      const note = (x, y, txt, col) => { ctx.fillStyle = col; ctx.fillText(txt, x, y); };
      const farR = X(maxX);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2;
      line(X(Ri + td), Y(-tl / 2), farR + 12, Y(-tl / 2)); note(farR + 16, Y(-tl / 2) + 4, "爪（上下同位置・内側）", C.accent);
      ctx.strokeStyle = C.groove;
      const midY = (cutY(p) + h - cutY(p)) / 2;
      line(X(outerR(p, midY / h)) + 4, Y(midY), farR + 12, Y(midY)); note(farR + 16, Y(midY) + 4, "外縁の帯（溝）", C.groove);
      if (c > 0) { ctx.strokeStyle = C.neck; line(X(outerR(p, 0)) + 4, Y(cutY(p) * 0.5), farR + 12, Y(cutY(p) * 0.5)); note(farR + 16, Y(cutY(p) * 0.5) + 4, "首（竹ひご無し）", C.neck); }
    };
    drawn();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(drawn) : null;
    if (ro) ro.observe(cv);
    return () => { if (ro) ro.disconnect(); };
  }, [p, view, narrow]);

  const set = (key) => (e) => setP((o) => ({ ...o, [key]: parseFloat(e.target.value) }));

  // 印刷する羽根板の枚数(1..boards)。boards が減った場合に備えて clamp。
  const nRibs = Math.min(printRibs, p.boards);

  const dlAll = () => { // 全部品を別STLとして1つのZIPにまとめる
    const spread = (geos, gap) => { // X方向に並べて重なり回避
      let x = 0;
      for (const g of geos) {
        g.computeBoundingBox();
        const bb = g.boundingBox;
        g.translate(x - bb.min.x, 0, 0);
        x += (bb.max.x - bb.min.x) + gap;
      }
      return geos;
    };
    let ribs = [];
    if (splitRibs) {
      const parts = [];
      for (let k = 0; k < nRibs; k++) { const sp = ribSplitParts(p, k); parts.push(sp.bottom, sp.top, sp.splice); }
      ribs = spread(parts, 15);
    } else {
      const w = maxRadius(p) + 12;
      for (let k = 0; k < nRibs; k++) {
        const g = ribGeometry(p, k);
        g.translate(k * w, p.tabLen, p.boardT / 2);
        ribs.push(g);
      }
    }
    const komas = spread([komaGeometry(p, false), komaGeometry(p, true)], 30);
    const cols = spread([standGeometry(p, false), standGeometry(p, true)], 20);
    const board = boardGeometry(p);
    exportZip([
      { name: `harigata_ribs_x${nRibs}.stl`, geos: ribs },
      { name: "harigata_koma.stl", geos: komas },
      { name: "harigata_stand_columns.stl", geos: cols },
      { name: "harigata_stand_base.stl", geos: [board] },
    ], "harigata_kit.zip");
  };

  const maxDia = Math.round(maxRadius(p) * 2);
  const boardLen = Math.round(p.height + p.tabLen * 2); // 羽根板の全長
  const connLen = Math.round(standBoardLength(p));      // 連結板の全長(最も長い部品)
  const partMax = Math.max(boardLen, connLen);
  const bedOver = partMax > bedD; // 最長部品がベッド奥行きに収まるか
  const heightLimit = bedD - Math.round(standBoardLength(p) - p.height); // 収めるための高さ上限
  // 抜き取り判定: 乾燥後、コマを外して羽根を上下どちらかの開口から抜く。
  // 開口=上端/下端の円(半径)。羽根の幅より広い開口が片側にあれば取り出せる。
  const topOpen = Math.round(outerR(p, 1)); // 上の円 半径
  const botOpen = Math.round(outerR(p, 0)); // 下の円 半径
  const canExtract = Math.max(topOpen, botOpen) >= effBoardWidth(p);

  const PANEL = 340; // インスペクタ幅(px)
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const isLit = view === "lit";   // 点灯ビューだけ暗背景(グローを映えさせる)
  const accent = "#e8590c";       // アクセント = あかりの灯りのオレンジ

  // インスペクタは常に明るい暖色ニュートラルのパネル(和紙・竹の世界に寄せる)
  const UI = {
    panel: "#f6f4f0", edge: "#e5e1d9", head: "#1d1a16",
    muted: "#8e867a", label: "#5e574c", value: "#242019",
    ctrlBg: "#ffffff", ctrlEdge: "#dbd5cb", warn: "#c6392b",
  };
  // ビューポート背景(組立/印刷=明るい暖色CAD調、点灯=暗)
  const vpBg = isLit
    ? "radial-gradient(circle at 50% 40%, #1b2230 0%, #070a11 100%)"
    // 暖色のフィラメント部品(タン系)が沈まないよう、ステージ背景は寒色ニュートラルに。
    : "radial-gradient(circle at 50% 34%, #eef0f3 0%, #c3c8d0 52%, #939ba6 100%)";
  // ビューポート上のオーバーレイ・チップ(背景の明暗に追従)
  const chip = isLit
    ? { bg: "rgba(16,16,18,0.72)", edge: "rgba(255,255,255,0.08)", txt: "#8a8a96", val: "#c8c8d0" }
    : { bg: "rgba(255,255,255,0.82)", edge: "#d6dae0", txt: "#5a626c", val: "#1b1c20" };

  const sliderRow = (key) => {
    const s = SLIDER_BY_KEY[key];
    if (!s) return null;
    return (
      <label key={key} style={{ display: "block", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
          <span style={{ color: UI.label }}>{s.label}</span>
          <span style={{ fontFamily: mono, color: UI.value }}>{p[key]}<span style={{ color: UI.muted }}>{s.unit}</span></span>
        </div>
        <input type="range" min={s.min} max={s.max} step={s.step} value={p[key]}
          onChange={set(key)} style={{ width: "100%", accentColor: accent, display: "block" }} />
      </label>
    );
  };

  const dlBtn = (label, onClick, primary) => (
    <button onClick={onClick} style={{
      flex: 1, padding: "11px 0", borderRadius: 10, fontSize: 12.5, fontWeight: 600,
      cursor: "pointer", whiteSpace: "nowrap",
      background: primary ? accent : UI.ctrlBg,
      color: primary ? "#fff" : UI.label,
      border: primary ? "none" : `1px solid ${UI.ctrlEdge}`,
      transition: "all 0.15s",
    }}>{label}</button>
  );

  // ±ボタンのステッパー(離散的な整数値向け。スライダー単独UIを避ける)
  const stepper = (key, label, value, min, max, step, onChange, valueText) => {
    const clampStep = (v) => Math.min(max, Math.max(min, +v.toFixed(2)));
    const sq = (txt, fn, off) => (
      <button onClick={off ? undefined : fn} disabled={off} style={{
        width: 30, height: 30, borderRadius: 8, cursor: off ? "default" : "pointer",
        background: UI.ctrlBg, color: off ? UI.muted : accent,
        border: `1px solid ${UI.ctrlEdge}`, fontSize: 18, fontWeight: 600, lineHeight: 1,
        opacity: off ? 0.45 : 1, padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{txt}</button>
    );
    return (
      <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11.5, color: UI.label }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {sq("−", () => onChange(clampStep(value - step)), value <= min)}
          <span style={{ fontFamily: mono, fontSize: 13, color: UI.value, minWidth: 60, textAlign: "center" }}>{valueText}</span>
          {sq("+", () => onChange(clampStep(value + step)), value >= max)}
        </div>
      </div>
    );
  };

  // GROUPS のキーを描画: 離散整数はステッパー、それ以外はスライダー
  const paramRow = (k) => {
    if (k === "boards") {
      return stepper("boards", "羽根板の枚数", p.boards, 6, 12, 2,
        (v) => setP((o) => ({ ...o, boards: v })),
        <>{p.boards}<span style={{ color: UI.muted, fontSize: 11 }}> 枚</span></>);
    }
    return sliderRow(k);
  };

  // 抜き取り警告(関連する「板の幅」スライダーの直下に表示)
  const extractWarn = !canExtract && (
    <div style={{
      margin: "2px 0 14px", padding: "9px 11px", borderRadius: 8,
      background: "rgba(198,57,43,0.10)", border: `1px solid ${UI.warn}`,
      color: UI.warn, fontFamily: "'Hiragino Sans', system-ui, sans-serif",
      fontSize: 11, lineHeight: 1.55,
    }}>
      ⚠ 羽根が抜けません — 乾燥後に上下どちらの開口からも取り出せません。
      上下いずれかの端の半径を {p.boardWidth}mm 以上にしてください。
    </div>
  );

  // 数値入力(値域が広く任意入力したいもの向け。Enter/フォーカス外しで確定・クランプ)
  const numInput = (label, value, setValue, min, max) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
      <span style={{ fontSize: 11.5, color: UI.label }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input key={value} type="number" defaultValue={value} min={min} max={max} step={1}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onBlur={(e) => {
            const v = Math.round(Number(e.target.value));
            setValue(Number.isFinite(v) && v > 0 ? Math.min(max, Math.max(min, v)) : value);
          }}
          style={{
            width: 66, padding: "6px 8px", borderRadius: 8, textAlign: "right",
            fontFamily: mono, fontSize: 13, color: UI.value,
            background: UI.ctrlBg, border: `1px solid ${UI.ctrlEdge}`,
          }} />
        <span style={{ fontSize: 11, color: UI.muted }}>mm</span>
      </div>
    </div>
  );

  // ============ 左:3Dビューポート ============
  const viewport = (
    <main style={{
      position: "relative", minWidth: 0, minHeight: 0,
      flex: narrow ? "0 0 auto" : "1 1 auto",
      height: narrow ? "44vh" : "auto",
    }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0, background: vpBg, transition: "background 0.3s" }} />
      {/* 2D断面ビュー(WebGLキャンバスの上に重ねる) */}
      <canvas ref={cv2dRef} style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        display: view === "2d" ? "block" : "none",
        background: "radial-gradient(circle at 50% 40%, #f6f1e9 0%, #e6ddcd 100%)",
      }} />

      {glError && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 10, padding: 24,
          textAlign: "center", pointerEvents: "none",
        }}>
          <div style={{ fontSize: 13, color: "#e0a060", fontWeight: 600 }}>⚠ 3Dプレビューを初期化できませんでした</div>
          <div style={{ fontSize: 11, color: "#8a8a96", fontFamily: mono, wordBreak: "break-word" }}>{glError}</div>
          <div style={{ fontSize: 11, color: "#6f6f7a" }}>
            お使いのブラウザで WebGL が無効の可能性があります。STLの生成・DLは引き続き利用できます。
          </div>
        </div>
      )}

      {/* ビュー切替(セグメンテッド) */}
      <div style={{
        position: "absolute", top: 14, left: 14, display: "flex", gap: 3, padding: 3,
        borderRadius: 11, background: chip.bg,
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${chip.edge}`,
      }}>
        {[["2d", "断面"], ["mold", "組立"], ["print", "印刷"], ["lit", "点灯"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            borderRadius: 8, border: "none",
            background: view === k ? accent : "transparent",
            color: view === k ? "#fff" : chip.txt, transition: "all 0.15s",
          }}>{l}</button>
        ))}
      </div>

      {/* 寸法リードアウト */}
      <div style={{
        position: "absolute", top: 16, right: 16, fontSize: 11, color: chip.txt,
        fontFamily: mono, textAlign: "right", pointerEvents: "none",
      }}>
        ⌀{maxDia} × H{p.height} mm
      </div>

      {/* 印刷ビューの補足 */}
      {view === "print" && (
        <div style={{
          position: "absolute", bottom: 16, left: 16, padding: "7px 12px",
          borderRadius: 9, fontSize: 10.5, color: chip.txt, fontFamily: mono,
          background: chip.bg, backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)", border: `1px solid ${chip.edge}`,
        }}>
          プリントベッド {bedW}×{bedD}mm
          {bedOver && (
            <span style={{ color: UI.warn }}> ⚠ ベッド超過（羽根{boardLen}／連結板{connLen}mm）— 高さを{heightLimit}mm以下に</span>
          )}
        </div>
      )}
    </main>
  );

  // ============ 右:インスペクタ ============
  const inspector = (
    <aside style={{
      display: "flex", flexDirection: "column",
      width: narrow ? "auto" : PANEL, flex: narrow ? "1 1 auto" : `0 0 ${PANEL}px`,
      minHeight: 0,
      background: UI.panel, color: UI.value,
      borderLeft: narrow ? "none" : `1px solid ${UI.edge}`,
      borderTop: narrow ? `1px solid ${UI.edge}` : "none",
    }}>
      {/* ヘッダー */}
      <div style={{
        padding: "16px 18px 14px", borderBottom: `1px solid ${UI.edge}`,
        display: "flex", alignItems: "baseline", gap: 10,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.14em", color: UI.head }}>張型</span>
        <span style={{ fontSize: 11, color: UI.muted }}>スタジオ</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, color: UI.muted, fontFamily: mono }}>Lamp Kit</span>
      </div>

      {/* スクロール領域 */}
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "16px 18px 18px" }}>
        {/* プリセット */}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: UI.muted, marginBottom: 10, textTransform: "uppercase" }}>形</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 22 }}>
          {PRESETS.map((pr) => {
            const active = p.curve === pr.curve;
            return (
              <button key={pr.name} onClick={() => setP((o) => ({ ...o, ...pr }))} style={{
                padding: "9px 4px", fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 9,
                background: active ? accent : UI.ctrlBg,
                color: active ? "#fff" : UI.label,
                border: "1px solid " + (active ? accent : UI.ctrlEdge),
                transition: "all 0.15s",
              }}>{pr.name}</button>
            );
          })}
        </div>

        {/* パラメータ(セクション別) */}
        {GROUPS.map((g) => (
          <div key={g.title} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: UI.muted, marginBottom: 12, textTransform: "uppercase" }}>{g.title}</div>
            {g.keys.map((k) => paramRow(k))}
            {g.title === "シルエット" && extractWarn}
            {g.title === "羽根の芯・爪" && (
              <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: UI.label, cursor: "pointer", marginTop: 2 }}>
                <input type="checkbox" checked={p.lighten}
                  onChange={(e) => setP((o) => ({ ...o, lighten: e.target.checked }))}
                  style={{ accentColor: accent, width: 15, height: 15 }} />
                中央を肉抜き(フィラメント節約)
              </label>
            )}
            {g.title === "骨組み" && (
              <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: UI.label, cursor: "pointer", marginTop: 2 }}>
                <input type="checkbox" checked={splitRibs}
                  onChange={(e) => setSplitRibs(e.target.checked)}
                  style={{ accentColor: accent, width: 15, height: 15 }} />
                羽根板を上下2分割(大型ランプ用)
              </label>
            )}
            {g.title === "竹ひご" && (
              <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: UI.label, cursor: "pointer", marginTop: 2 }}>
                <input type="checkbox" checked={p.spiral}
                  onChange={(e) => setP((o) => ({ ...o, spiral: e.target.checked }))}
                  style={{ accentColor: accent, width: 15, height: 15 }} />
                螺旋巻き用に溝をずらす
              </label>
            )}
          </div>
        ))}

        {/* 情報 */}
        <div style={{
          borderTop: `1px solid ${UI.edge}`, paddingTop: 14, marginTop: 4,
          fontSize: 11, color: UI.label, fontFamily: mono, lineHeight: 1.9,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>最大径</span><span style={{ color: UI.value }}>⌀{maxDia} mm</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>羽根板の全長</span>
            <span style={{ color: bedOver ? UI.warn : UI.value }}>{boardLen} mm{bedOver ? " ⚠" : ""}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>羽根板の枚数</span><span style={{ color: UI.value }}>{p.boards} 枚</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>上下の開口(半径)</span>
            <span style={{ color: canExtract ? UI.value : UI.warn }}>{topOpen} / {botOpen} mm{canExtract ? "" : " ⚠"}</span>
          </div>
        </div>
      </div>

      {/* 印刷ビューでのみ表示: 印刷枚数の選択 + STL 書き出し(スティッキー) */}
      {view === "print" && (
        <div style={{
          padding: "14px 18px 16px", borderTop: `1px solid ${UI.edge}`,
          background: "#eeeae3",
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: UI.muted, marginBottom: 9, textTransform: "uppercase" }}>プリントベッド</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {[180, 220, 250, 256, 300, 350].map((sz) => {
              const active = bedW === sz && bedD === sz;
              return (
                <button key={sz} onClick={() => { setBedW(sz); setBedD(sz); }} style={{
                  padding: "6px 11px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", borderRadius: 8,
                  background: active ? accent : UI.ctrlBg, color: active ? "#fff" : UI.label,
                  border: "1px solid " + (active ? accent : UI.ctrlEdge),
                }}>{sz}</button>
              );
            })}
          </div>
          {numInput("幅", bedW, setBedW, 100, 420)}
          {numInput("奥行き", bedD, setBedD, 100, 420)}
          <div style={{ height: 1, background: UI.edge, margin: "10px 0 14px" }} />

          {stepper("printRibs", "印刷する羽根板", nRibs, 1, p.boards, 1,
            (v) => setPrintRibs(v),
            <>{nRibs}<span style={{ color: UI.muted, fontSize: 11 }}> / {p.boards} 枚</span></>)}

          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: UI.muted, margin: "4px 0 9px", textTransform: "uppercase" }}>STL 書き出し</div>
          <div style={{ display: "flex", gap: 8 }}>
            {dlBtn("ダウンロード", dlAll, true)}
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <div style={{
      display: "flex", flexDirection: narrow ? "column" : "row",
      height: "100%", overflow: "hidden",
      background: "#ece8e2", color: UI.value,
      fontFamily: "'Hiragino Sans', system-ui, sans-serif",
    }}>
      {viewport}
      {inspector}
    </div>
  );
}
