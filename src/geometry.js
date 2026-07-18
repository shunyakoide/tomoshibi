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
// シルエットは「制御点配列 pts」を単調 Hermite 補間でつないだ半径関数で決まる。
// 図面上の◇を直接ドラッグして pts を編集する方式。首(くび)は最外制御点より外側の
// 垂直な長方形で、竹ひごは巻かない。

// 火袋スプライン: P=[{首下端,rBot}, …制御点…, {首上端,rTop}]。単調 Hermite(Fritsch–Carlson)で
// 反り・急な折れを抑えた滑らかな曲線にする。各点の接線 dr/dt を隣接弦から求め、隣接弦と同符号・
// 3倍以内にクランプ(overshoot と不要な急カーブを防ぐ)。端点は次点への弦。
function fukuroTangents(P) {
  const n = P.length, d = new Array(n - 1), T = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (P[i + 1].r - P[i].r) / ((P[i + 1].t - P[i].t) || 1); // 区間の弦(dr/dt)
  for (let i = 0; i < n; i++) {
    let t;
    if (P[i] && P[i].sharp) t = i === 0 ? d[0] : i === n - 1 ? d[n - 2] : (Math.abs(d[i - 1]) < Math.abs(d[i]) ? d[i - 1] : d[i]);
    else if (i === 0) t = d[0];
    else if (i === n - 1) t = d[n - 2];
    else t = (d[i - 1] + d[i]) / 2;                                   // 中央差分
    // 単調化: 隣接弦と符号が違えば0、同符号なら弦の3倍以内
    const near = i === 0 ? d[0] : i === n - 1 ? d[n - 2] : (Math.abs(d[i - 1]) < Math.abs(d[i]) ? d[i - 1] : d[i]);
    if (near === 0) t = 0;
    else { const a = t / near; t = (a < 0 ? 0 : Math.min(a, 3)) * near; }
    T[i] = t;
  }
  return T;
}
function fukuroSpline(P, x, T) {
  T = T || fukuroTangents(P);
  let i = 0;
  while (i < P.length - 2 && x > P[i + 1].t) i++;
  const p1 = P[i], p2 = P[i + 1], h = p2.t - p1.t, s = h > 1e-6 ? (x - p1.t) / h : 0;
  const m1 = T[i] * h, m2 = T[i + 1] * h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p1.r + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2.r + (s3 - s2) * m2;
}
// 実効外周半径。t∈[0,1] → 半径mm。端(t=0/1)から頂点まで1本の連続スプラインにする
// (垂直の首は作らない)。首を挟むと「平ら→急カーブ」の折れ角が出るため、端も制御点
// (rBot/rTop)としてスプラインに含め、少ない点でも滑らかな輪郭になるようにする。
// 竹ひごを巻かない上下端の帯(首)は cutT/cutY で別に扱う(半径は連続のまま)。
// 火袋(カーブ+竹ひご溝)の t 範囲 = 最外の制御点の間。首は最外制御点より外側(開口側)。
// 開口(=首)の半径は最外の制御点にちょうど一致 → 首→火袋に無駄なフレア/Sカーブが出ない。
export function fukuroRange(p) {
  const pts = (p.pts && p.pts.length >= 2) ? p.pts : null;
  if (!pts) return { lo: cutTbot(p), hi: 1 - cutTtop(p) };
  const nB = p.neckBot ?? p.neckOn ?? true, nT = p.neckTop ?? p.neckOn ?? true;
  return { lo: nB ? pts[0].t : 0, hi: nT ? pts[pts.length - 1].t : 1 };
}
// 首・爪の設計基準は「制御点の半径」= 首の有無に依存しない(爪サイズが首トグルで変わらない)。
function openMin(p) {
  const pts = p.pts;
  return (pts && pts.length) ? Math.min(pts[0].r, pts[pts.length - 1].r) : Math.min(p.rTop ?? 60, p.rBot ?? 60);
}
function bodyMinR(p) {
  const pts = p.pts;
  if (!pts || pts.length < 2) return openMin(p);
  let m = Math.min(pts[0].r, pts[pts.length - 1].r);
  for (let i = 0; i <= 40; i++) { const t = pts[0].t + (pts[pts.length - 1].t - pts[0].t) * i / 40; m = Math.min(m, fukuroSpline(pts, t)); }
  return m;
}
export function outerR(p, t) {
  t = Math.max(0, Math.min(1, t));
  const pts = (p.pts && p.pts.length) ? p.pts : [{ t: 0.5, r: (p.rTop + p.rBot) / 2 }];
  if (pts.length === 1) return Math.max(8, pts[0].r);
  const fp = pts[0], lp = pts[pts.length - 1];
  const nB = p.neckBot ?? p.neckOn ?? true, nT = p.neckTop ?? p.neckOn ?? true;
  const kR = komaR(p); // 爪(コマ)の大きさ = 首なし時の開口
  // 首あり=開口を制御点まで外側へ広げ、そこから y=0/1 まで垂直な長方形。
  // 首なし=開口が爪の大きさになる(火袋端を kR にして開口へ閉じる。斜めテーパにしない)。
  const loT = nB ? fp.t : 0, loR = nB ? fp.r : kR;
  const hiT = nT ? lp.t : 1, hiR = nT ? lp.r : kR;
  if (t <= loT) return Math.max(8, loR);
  if (t >= hiT) return Math.max(8, hiR);
  const P = [{ t: loT, r: loR }, ...pts.slice(1, -1), { t: hiT, r: hiR }];
  return Math.max(8, fukuroSpline(P, t));                          // 火袋(制御点間)
}
export function maxRadius(p) {
  let m = 0;
  for (let i = 0; i <= 120; i++) m = Math.max(m, outerR(p, i / 120));
  return m + p.higoD;
}
// 首(くび)= 最外の制御点より外側(開口側)の垂直な長方形。首の高さ = 最外制御点の位置。
// 上下独立に有無選択(neckBot / neckTop)。首なし側は outerR で直線(提灯系)にする。
export function cutTbot(p) { const pts = p.pts; return (pts && pts.length) ? pts[0].t : 0; }
export function cutTtop(p) { const pts = p.pts; return (pts && pts.length) ? 1 - pts[pts.length - 1].t : 0; }
export function cutYbot(p) { return cutTbot(p) * (p.height || 1); }
export function cutYtop(p) { return cutTtop(p) * (p.height || 1); }
function cutY(p) { return Math.max(cutYbot(p), cutYtop(p)); }
export function cutT(p) { return cutY(p) / Math.max(1, p.height); }
// コマ外径 = 爪を纏める小さなハブの半径。爪(内端Ri〜Ri+td)がコマの縁(外周)に来る。
// Ri・tabDepth は上下対称なので、コマは上下で完全に同一(1種類のみ)。
export function komaR(p) {
  // コマ外径(=爪の大きさ)は制御点の小さい方の半径(openMin)を基準に決める(首の有無に
  // 依存しない)。首なしのときはこの kR が開口になる。基準は「従来の内端 nominalRi」なので、
  // 爪先を中心側へ深めても(innerRi を下げても)komaR=土台寸法は動かない。
  return Math.min(nominalRi(p) + tabDepth(p) + 3, openMin(p));
}
// タブ(羽根の差し込み部)の半径方向の奥行き = コマのノッチ深さ。制御点基準で首に依存しない。
export function tabDepth(p) {
  return Math.min(p.tabW, Math.max(6, openMin(p) * 0.4));
}
// 羽根幅の上限: 乾燥後に大きい方の開口(端半径)から抜けるよう、開口以下に抑える
export function effBoardWidth(p) {
  return Math.min(p.boardWidth, Math.max(outerR(p, 0), outerR(p, 1)) - 1);
}

// ============ 2D断面(確定形状) ============
// 内縁をまっすぐな芯(半径 Ri)にし、その内側に上下同じ位置で爪。外縁は本体カーブ＋首。
// 中央は肉抜き(外縁の帯=溝を保持 と 内縁の芯=爪を支える を残す)。羽根の断面ビューで使う。
//
// 従来基準の爪内端(= コマ外径 komaR の算出基準)。自己交差ガード込み。制御点基準=首に依存しない。
// 実際の爪先/ノッチ底は innerRi でこれより中心側へ深める(が komaR はこの nominalRi 基準で不動)。
function nominalRi(p) {
  const td = tabDepth(p);
  // 芯(Ri)は火袋の最小外径内に収める(自己交差防止)。制御点基準=首の有無に依存しない。
  const lim = Math.min(openMin(p) - td - 2, bodyMinR(p) - 3);
  return Math.max(6, Math.min(p.tabR ?? 15, lim));
}
// 爪内端を中心側へ深める量(mm)。爪先/ノッチ底を長くして握りを増やす(まっすぐの舌のまま)。
const TAB_DEEPEN = 5;
// コマの隣り合う爪ノッチの間に残す最低壁厚(mm)。歯数が多い・小コマだと壁が薄くなり
// 非多様体化するため。深める下限(ribCoreFloor)と最大枚数(maxBoards)の両方の基準。
const MIN_WALL = 1.6;
// ノッチ幅(=爪厚 + プリント公差 fit)。
function notchWidth(p) { return p.boardT + Math.max(0, p.fit ?? 0); }
// 深める際の中心側リミット。ノッチ底半径 notchR=Ri-0.5 で評価:
//   notchR*(2π/boards) - notchW ≥ MIN_WALL  →  notchR ≥ (MIN_WALL+notchW)*boards/2π。
function ribCoreFloor(p) {
  const rNotchMin = (MIN_WALL + notchWidth(p)) * p.boards / (2 * Math.PI);
  return Math.max(6, rNotchMin + 0.5);
}
// この開口・板厚・公差で、コマのノッチ壁を MIN_WALL 以上に保てる最大の羽根板枚数。
// ノッチは notchR=nominalRi-0.5 付近に切られ、壁 = 2π·notchR/boards − notchW。これを
// MIN_WALL 以上にする boards の上限。開口が小さい・板が厚い・枚数が多い の組で、ノッチ同士が
// 中心付近で重なりコマが非水密になる(壁が負になる)のを防ぐため、UI の枚数上限に使う。
// nominalRi は boards に依存しないので、この値も現在の boards には依存しない(単調な上限)。
export function maxBoards(p) {
  const notchR = nominalRi(p) - 0.5;
  return Math.max(4, Math.floor((2 * Math.PI * notchR) / (MIN_WALL + notchWidth(p))));
}
// 実際の爪先/ノッチ底。従来基準 nominalRi より TAB_DEEPEN だけ中心側へ深く(下限=ribCoreFloor)。
// ribOutline2D(爪)と komaShape(ノッチ底)が同じこの値を呼ぶので噛み合いは常に一致(不変量の集約点)。
// 上限は nominalRi(浅くはしない)。歯数が多くて floor>nominalRi の場合は深めず従来どおり。
export function innerRi(p) {
  const nom = nominalRi(p);
  return Math.min(nom, Math.max(ribCoreFloor(p), nom - TAB_DEEPEN));
}
// 竹ひご溝を外縁に彫った outerX 関数を返す(通常/分割/2D で共有)。
// ・基準は「溝中心の外径」ではなく各 y の局所外径。→ 斜面でも溝が片側だけに寄らず
//   上下に壁ができ、竹ひごがずり落ちずに引っかかる。
// ・急斜面(radial の溝は実効深さが cosθ 倍に浅くなる)では深さを 1/cosθ=√(1+勾配²)
//   倍(上限2.2)して、傾いた面でも竹ひごが嵌まる実効深さを確保する。
// 火袋の赤道(最大外径)の高さ(mm)。溝の返しはこの赤道側へ倒す(開口へ滑る竹ひごを
// 引っかける)。返しの向きが反転する点は「傾き dR/dy が 0 になる点=最大外径」なので、
// 決め打ちの h/2 ではなく実際の argmax を使う(非対称なプロファイルで返しが逆を向くのを防ぐ)。
export function equatorY(p) {
  const h = p.height;
  let bestT = 0.5, bestR = -1;
  for (let i = 0; i <= 120; i++) { const t = i / 120, r = outerR(p, t); if (r > bestR) { bestR = r; bestT = t; } }
  return bestT * h;
}
export function grooveOuterX(p, grooves, gR) {
  const h = p.height, mid = equatorY(p);
  const DEEP = 2.1; // 溝を深く=フランクを急に=鋭い爪状の歯。竹ひごが深く沈んで噛む(大きめの溝)。
  // 各溝: 深さ + 非対称(返し)。「中央(赤道)側フランクを緩く・開口側を急に」して歯先を中央へ
  // 倒す(爪のような返し)→ 開口へ滑ろうとする竹ひごを引っかける。急斜面ほど強い返し。ただし
  // 円筒/たる等の低傾斜でも最低限の返し(floor)を必ず残す(=傾斜ゼロで返しが消えるのを防ぐ)。
  const info = grooves.map((g) => {
    const sl = (outerR(p, Math.min(1, (g + 0.6) / h)) - outerR(p, Math.max(0, (g - 0.6) / h))) / 1.2; // dR/dy
    // 深さは竹ひご径の 1.5 倍で頭打ち(大きめだが掘りすぎの反転・自己交差は下の分割帯 MIN_BAND=6 と
    // manifold スイープで担保)。急斜面は実効深さ確保のため 1/cosθ 倍(上限2.2)。
    const depth = Math.min(p.higoD * 1.5, gR * DEEP * Math.min(2.2, Math.hypot(1, sl)));
    // 返し = floor 0.24(平坦でも必ず引っ掛かる)+ 傾斜比例。上限 0.62(開口側フランクをほぼ壁に)。
    const skew = Math.min(0.62, 0.24 + Math.abs(sl) * 0.32);
    const centerDir = g < mid ? 1 : -1;             // 中央(赤道)の向き(y方向)
    return { g, depth, skew, centerDir };
  });
  return (y) => {
    let dip = 0;
    for (const { g, depth, skew, centerDir } of info) {
      const delta = y - g;
      // 中央側を緩く(広い)、開口側を急に(狭い)→ 歯先が中央へ倒れる返し。
      const w = gR * (delta * centerDir > 0 ? 1 + skew : 1 - skew);
      const ad = Math.abs(delta);
      if (ad < w) { const d = depth * (1 - ad / w); if (d > dip) dip = d; }
    }
    return outerR(p, Math.min(Math.max(y, 0), h) / h) - dip;
  };
}
// 竹ひごの溝位置。火袋を「等間隔」に割り付けるが、首(開口)のすぐ際には溝を置かない。
// 上下端に半ピッチのバッファ(=開口/首側のクリアランス)を持たせ、内側から等間隔に並べる。
// 溝の半幅(mm)= 竹ひごの半径 + 逃がし。溝を作る側(ribOutline2D / ribEdges)と描く側
// (SectionEditor)が必ず同じ値を使うよう、ここ1箇所に集約する(断面図と STL のズレ防止)。
const GROOVE_CLEAR = 0.25;
export function grooveR(p) { return p.higoD / 2 + GROOVE_CLEAR; }
export function grooveList(p, gR) {
  const h = p.height, fr = fukuroRange(p), gM = gR * 1.6;
  const gLo = fr.lo * h + gM, gHi = fr.hi * h - gM, span = gHi - gLo;
  if (span <= 0.5) return [];
  const n = Math.max(1, Math.round(span / p.pitch));
  const step = span / n, gs = [];
  for (let i = 0; i < n; i++) gs.push(gLo + step * (i + 0.5)); // 端に step/2 のバッファ
  return gs;
}
// コマのノッチ底の半径(= これより内側がコマの無垢部)。爪の内端 innerRi から 0.5 逃がす。
// ノッチを切る komaShape と、その無垢部に掛ける出っ張りを作る komaStop2D が共有する。
export function notchR(p) { return Math.max(1, innerRi(p) - 0.5); }

// 【上コマの内側ストッパ】上のコマが火袋側(内側)へ入り込むのを止める、爪の内縁の出っ張り(棚)。
// ・コマは作業後に「外側(爪先の側)」へ抜くので、棚はコマの内側だけに置き上下で挟まない
//   → 乗り越え不要で抜き差しは自由なまま、内側へのズレだけが止まる。
// ・棚の高さ yShelf = height + tabLen - komaT = コマを爪先まで嵌めた時の「コマ内面」の位置。
//   standSlotSep = height + 2*tabLen - komaT が前提にしている位置と一致するので、
//   これまで「先端まで押し込む」運用任せだった位置を形状で保証するだけ ⇒ 土台は動かない。
// ・棚は notchR より内側へ張り出してコマ無垢部の下面を受ける。ただし張り出しすぎると隣の
//   羽根板の出っ張り同士が中心付近で干渉するため、周方向クリアランスから最小半径を掛ける。
// ・余地が無い(爪が短い / 多歯で中心が混む)場合は null = 従来どおり出っ張り無し。
const KOMA_STOP_W = 3;     // 棚の張り出し目標(mm)
const KOMA_STOP_MIN = 0.8; // 張り出しがこれ未満なら作らない
export function komaStop2D(p) {
  const yShelf = p.height + p.tabLen - p.komaT;
  if (yShelf - p.height < 1) return null;                     // 爪が短く棚を置く余地がない
  const nR = notchR(p);
  const rMin = ((p.boardT + 1.0) * p.boards) / (2 * Math.PI); // 隣の羽根と干渉しない最小半径
  const Rd = Math.max(rMin, nR - KOMA_STOP_W);
  if (nR - Rd < KOMA_STOP_MIN) return null;                   // 張り出しが取れない
  return { yShelf, Rd };
}

// 【羽根板の内縁カーブ = バナナ(三日月)形】乾燥後に開口から羽根板を抜きやすくするため、
// 内縁も外縁に沿って湾曲させ中央をくびれさせる。外縁(=火袋の面)は一切変えないので、
// 型の形状・爪・コマ・土台には波及しない(内側の材料が減るだけ)。
//
// 定義: 内縁は基本「真っ直ぐな芯 Ri」のまま。**中央付近だけ**内向きのカーブを足して
// くびれさせる(羽根全体を曲げると端が無理な形になるため、局所に留める)。
//   ・カーブは t∈[tC-HW, tC+HW] の内側だけ。その外では bump=0 ⇒ 内縁は厳密に Ri のまま
//     ⇒ 端の形・爪(コマ)との繋がりは一切変わらない。
//   ・bump=(1-u²)² は端で値も傾きも 0 ⇒ 真っ直ぐな芯へ滑らかに繋がる(角が出ない)。
//   ・振幅 A は「中央での羽根の深さ(外縁−芯)× RIB_CURVE_D」。実物の型(参考写真)では
//     えぐりはその位置の深さの2割ほどで、限界まで削ってはいない。深さ比で決めることで
//     プロファイルが変わっても同じ見た目の比率になる。
//   ・最後に「帯幅 W を割らない上限」でクランプ ⇒ 内縁が外縁を越えない(自己交差しない)
//     ことが保証され、中央がくびれた形では自動的に控えめになる。
const RIB_MIN_BAND = 12;  // 帯の最低肉厚(mm)。溝の深さ(最大 higoD*1.5)を引いても残る。
const RIB_CURVE_C = 0.5;  // カーブの中心(t)= 羽根の中央
const RIB_CURVE_HW = 0.3; // カーブの半幅(t)。中央60%だけに入り、上下20%ずつは芯のまま。
const RIB_CURVE_D = 0.3;  // えぐり量 = 中央の羽根の深さ × これ(実物の型は約2割。抜きやすさ優先で少し深め)
export function ribInnerX(p) {
  const h = p.height, Ri = innerRi(p);
  const W = Math.max(RIB_MIN_BAND, effBoardWidth(p)); // 残したい帯幅
  const bump = (t) => {
    const u = (t - RIB_CURVE_C) / RIB_CURVE_HW;
    if (Math.abs(u) >= 1) return 0;
    const v = 1 - u * u;
    return v * v; // 端で値・傾きとも0 → 芯へ滑らかに接続
  };
  // 振幅 = 中央の深さの一定割合(実物基準)。
  let A = Math.max(0, (outerR(p, RIB_CURVE_C) - Ri) * RIB_CURVE_D);
  // 帯幅 W を割らない上限でクランプ(くびれた形では自動的に浅くなる)。
  for (let i = 0; i <= 200; i++) {
    const t = i / 200, b = bump(t);
    if (b < 1e-3) continue;
    A = Math.min(A, (outerR(p, t) - W - Ri) / b);
  }
  A = Math.max(0, A);
  return (y) => {
    const t = Math.min(1, Math.max(0, y / h));
    return Math.max(Ri, Math.min(Ri + A * bump(t), outerR(p, t) - RIB_MIN_BAND));
  };
}

// 羽根の外形点列を返す(2D断面描画 と 3D羽根geometry で共有 = 両者が必ず一致する)。
// k = 羽根番号。現在は**全羽根が同一形状**(溝は水平なリング)なので k は形に影響しない。
// 呼び出し側が羽根ごとに呼ぶため引数は残す(将来ずらす場合の識別子)。
export function ribOutline2D(p, k = 0) {
  const h = p.height, tl = p.tabLen, gR = grooveR(p);
  // 竹ひごの溝は火袋(最外制御点の間)全体に作る。カーブには必ず溝を入れ、上下端にも溝を置く。
  const grooves = grooveList(p, gR);
  const outerX = grooveOuterX(p, grooves, gR);
  const Ri = innerRi(p), STEP = 0.5, pts = []; // 返しの急フランクを拾うため細かく
  // 爪 = 真っ直ぐな舌。先端をコマ外径 kR にちょうど合わせる(はみ出さない)。
  const kR = komaR(p);
  // 下端の爪: 真っ直ぐな長方形のまま(ストッパは上コマ側だけ)。
  pts.push([Ri, 0], [Ri, -tl], [kR, -tl], [kR, 0], [outerR(p, 0), 0]);
  for (let y = STEP; y <= h; y += STEP) pts.push([outerX(Math.min(y, h)), Math.min(y, h)]);
  // 上端の爪: 先端(外側)からコマを差し込み、内縁の棚でコマ無垢部の下面を受けて内側へのズレを止める。
  pts.push([outerR(p, 1), h], [kR, h], [kR, h + tl], [Ri, h + tl]);
  const stop = komaStop2D(p);
  if (stop) pts.push([Ri, stop.yShelf], [stop.Rd, stop.yShelf], [stop.Rd, h]); // 棚(出っ張り)
  // 内縁: バナナ(三日月)カーブを上から下へ。両端は Ri に戻るので爪と繋がる。
  const innerX = ribInnerX(p);
  pts.push([Ri, h]);
  for (let y = h - STEP; y > 0; y -= STEP) pts.push([innerX(y), y]);
  pts.push([Ri, 0]);
  return pts;
}
// 肉抜き窓(外縁の帯 bandW と 内縁の芯 spineW を残し、桟 strut で分割)。
// 窓の外側境界は溝の凹凸を無視した「滑らかな外周(outerR)」基準にする(ぼこぼこ防止)。
const Y_STAGGER = 0.13; // 窓のy端を外形サンプル格子(0.5mm)から外す量(mm)
export function lightenHoles2D(p) {
  const h = p.height, td = tabDepth(p);
  const spineW = Math.max(9, td + 3), bandW = 11, strut = 8, MIN_MAT = 12;
  const oS = (y) => outerR(p, Math.min(Math.max(y, 0), h) / h); // 滑らかな外周
  // 窓の内側は内縁のバナナカーブに追従させる(芯 spineW を一定幅で残す) → 中央の窓も
  // えぐりに沿った形になる。共線点は cleanPoly で間引かれるので earcut は壊れない。
  const rIn = ribInnerX(p);
  const xi = (y) => rIn(Math.min(Math.max(y, 0), h)) + spineW;
  // 下端: 首の急な立ち上がり(フレア)を無垢で残し補強 → 折れやすい細い桟を作らない。
  // 上端: 細く尖るので少しだけ余白。窓は「落とす」のではなく肉の残る範囲まで縮めて作る
  //       (細る上端でも小さな窓を出して肉抜きの効きを均す)。
  const yBot = cutYbot(p) + 14, yTop = h - cutYtop(p) - 6;
  const nWin = Math.max(1, Math.round((yTop - yBot) / 46)), winH = (yTop - yBot) / nWin, holes = [];
  const thin = (y) => oS(y) - bandW - xi(y) < MIN_MAT;
  for (let i = 0; i < nWin; i++) {
    let y0 = yBot + i * winH + strut / 2, y1 = yBot + (i + 1) * winH - strut / 2;
    // 肉が薄い端(細る上端など)は窓端をその手前まで詰める(全滅させず縮める)。
    while (y1 - y0 > 4 && thin(y1)) y1 -= 2;
    while (y1 - y0 > 4 && thin(y0)) y0 += 2;
    if (y1 - y0 < 14) continue;
    // くびれ(中央が細る形)で窓の途中に薄い帯が残ると earcut が破綻するので全域を確認。
    let ok = true;
    for (let y = y0; y <= y1; y += 2) if (thin(y)) { ok = false; break; }
    if (!ok) continue;
    // 窓のy端を外形のサンプル格子(STEP=0.5mm刻み)から僅かにずらす。厳密に同じ走査線に
    // 乗ると、窓の角と外形の頂点が共線になり earcut がゼロ面積の三角形を作って open edge に
    // なる(boardGeometry の STAGGER と同じ既知の退化。ずれは肉抜きの効きに影響しない)。
    const ya = y0 + Y_STAGGER, yb = y1 - Y_STAGGER;
    if (yb - ya < 10) continue;
    // 外側(帯の内)を上へ辿り、内側(芯の外=バナナカーブ)を下へ戻る閉ループ。
    // 両辺を同じ分割数で刻み、端を厳密に一致させる(角で半端な点を出さない)。
    const ns = Math.max(2, Math.ceil((yb - ya) / 2));
    const poly = [];
    for (let i = 0; i <= ns; i++) { const y = ya + ((yb - ya) * i) / ns; poly.push([oS(y) - bandW, y]); }
    for (let i = ns; i >= 0; i--) { const y = ya + ((yb - ya) * i) / ns; poly.push([xi(y), y]); }
    holes.push(poly);
  }
  return { holes, spineW, bandW };
}

// 押し出し前の点列クリーンアップ(外形・窓の両方で使う)。
// ・近接重複点を除去: 返し(急フランク)や首の合流で出る。放置すると退化三角形→open edge。
// ・共線点を除去: これが無いと、内縁カーブの平坦区間などで「同じ直線上の点」が数百個並ぶ。
//   earcut は共線点を落として三角形分割するため、キャップの境界が側壁の境界とズレて
//   open edge になる(側壁は点列どおりに作られるのに、キャップは点を捨てるため)。
//   判定は「前後の点を結ぶ直線からの垂直距離」で行う(長さに依らず安定)。
function cleanPoly(pts, eps = 1e-3) {
  const out = [];
  for (const q of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > eps) out.push(q); }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  if (out.length < 4) return out;
  const keep = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
    const dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy);
    // a-c が潰れている場合は b を残す(判定不能)
    if (len < eps) { keep.push(b); continue; }
    const dist = Math.abs(dx * (a[1] - b[1]) - dy * (a[0] - b[0])) / len; // b から直線 a-c への距離
    if (dist > eps) keep.push(b);
  }
  return keep.length >= 3 ? keep : out;
}
// 点列(+穴の点列)から押し出し用の Shape を作る。外形・穴とも必ず cleanPoly を通す
// (どちらか片方でも掃除を忘れると earcut がキャップを壊して open edge を出す)。
function shapeFromPts(pts, holes = []) {
  const outline = cleanPoly(pts);
  const s = new THREE.Shape();
  outline.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  for (const hole of holes) {
    const hp = cleanPoly(hole);
    if (hp.length < 3) continue;
    const path = new THREE.Path();
    hp.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
    s.holes.push(path);
  }
  return s;
}

// ============ 羽根板 ============
// 羽根板の内外エッジ関数(通常/分割で共有)
export function ribEdges(p, k) {
  const { height } = p;
  const boardWidth = effBoardWidth(p); // 抜き取り可能な幅に制限
  const oB = outerR(p, 0), oT = outerR(p, 1);
  const tw = tabDepth(p); // タブの奥行き(上下一律)
  const gR = grooveR(p);
  // 溝は火袋全体。ribOutline2D と同じ規則(grooveR/grooveList)で揃える。
  const grooves = grooveList(p, gR);
  const outerX = grooveOuterX(p, grooves, gR);
  // 内縁の下限。板幅に応じた下限で下端の尖り(トゲ)を防ぐ。ただしくびれ(細い中央)では
  // 下限が外縁を上回り帯が反転(自己交差)し得るため、外縁から最低 MIN_BAND を必ず残すよう
  // 上側もクランプして帯幅を保証する(分割部品の非多様体を防ぐ)。
  const mInner = Math.max(8, boardWidth * 0.4), MIN_BAND = 6;
  const innerX = (y) => {
    const oR = outerR(p, y / height);
    return Math.min(Math.max(mInner, oR - boardWidth), oR - MIN_BAND);
  };
  return { oB, oT, tw, outerX, innerX };
}
// 3D羽根板 = 2D確定形状(内縁まっすぐ＋上下同位置の内側の爪＋外縁カーブ＋肉抜き)を押し出す。
export function ribShape(p, k) {
  return shapeFromPts(ribOutline2D(p, k), p.lighten ? lightenHoles2D(p).holes : []);
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
  const { oB, oT, tw, outerX, innerX } = ribEdges(p, k);
  const STEP = 0.4;
  const pts = [];
  pts.push([innerX(y0), y0]);
  if (y0 <= 0.001) { // 実際の下端: 底辺＋タブ
    pts.push([oB - tw, 0], [oB - tw, -tabLen], [oB, -tabLen], [oB, 0]);
  } else {
    pts.push([outerX(y0), y0]); // 割り面で真っ直ぐ横断
  }
  for (let y = y0 + STEP; y < y1; y += STEP) pts.push([outerX(y), y]);
  if (y1 >= height - 0.001) { // 実際の上端: タブ
    pts.push([oT, height], [oT, height + tabLen], [oT - tw, height + tabLen], [oT - tw, height], [innerX(height), height]);
  } else {
    pts.push([outerX(y1), y1], [innerX(y1), y1]);
  }
  for (let y = y1 - STEP; y > y0; y -= STEP) pts.push([innerX(y), y]);
  // 外形は cleanPoly を通す(重複点・共線点の除去)。内縁が下限で一定になる区間とタブ端の
  // 接合で重複頂点が、外縁の平坦部で共線点が出る。放置すると earcut が退化三角形を作り
  // キャップと側壁の境界がズレて非多様体になる。スタッド穴は円弧なのでこの後で足す。
  const s = shapeFromPts(pts);
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
  const { boards, boardT } = p;
  const R = komaR(p);
  // ノッチ幅 = 板厚 + プリント公差 fit。爪自体は boardT のまま(公称は「爪幅=ノッチ幅=板厚」で
  // 一致、fit は実寸のはめあいクリアランスだけを空ける)。fit=0 なら従来どおり隙間なし。
  const sw = boardT + Math.max(0, p.fit ?? 0);
  const eps = Math.asin(Math.min(0.9, (sw / 2) / R));
  const rOut = Math.sqrt(Math.max(1, R * R - (sw / 2) * (sw / 2)));
  const nR = notchR(p); // 爪の内端(Ri)まで届く深さ。komaStop2D と共有(出っ張りはこれより内側)。
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
    shape.lineTo(nR * dx - nx * sw / 2, nR * dy - ny * sw / 2);
    shape.lineTo(nR * dx + nx * sw / 2, nR * dy + ny * sw / 2);
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
