/**
 * ============================================================================
 * 型紙 (PAPERCRAFT) — 段ボール・厚紙で作るための 1:1 印刷用ページ
 * ============================================================================
 * 3Dプリンタが無くても作れるように、各部品の2D外形を **原寸(1:1)** で A4 に並べた
 * 印刷用 HTML を生成する。ブラウザで開いて「拡大縮小なし(100%)」で印刷 → 段ボールに
 * 貼って切り抜けば同じ型が組める。
 *
 * 設計方針:
 * ・形の出どころは geometry.js の純粋関数**だけ**。寸法を独自に再実装しない
 *   (SectionEditor と同じ規約。ここがズレると型紙と STL で違う型ができてしまう)。
 * ・**溝(ヒゴ目)は切らない**。段ボールに 0.5mm 精度の V ノッチは刻めないので、外縁は
 *   滑らかな曲線のまま切り(`ribOutline2D(p,k,{smooth:true})`)、竹ひごを巻く位置は
 *   破線の**目盛線**で示す。溝位置そのものは STL と同じ `grooveList()` 由来。
 * ・材料厚 `matT` は段ボールの実測厚。コマのノッチ幅がこれで決まるため、
 *   `{...p, boardT: matT, komaT: matT, fit: 0}` を **全部品に同じように**通して、型紙内の
 *   部品同士が必ず噛み合うようにする(3D 側の p は一切変更しない)。`fit=0` はプリント公差を
 *   足さないという意味で、段ボールは繊維が潰れて入るため公称ぴったりのほうがしっかり噛む。
 * ・**土台は出さない**。3Dプリント用の土台は薄い柱でコマを受ける設計で、段ボールでは
 *   自立に必要な剛性が出ない(潰れる・撓む)。中途半端な土台を刷らせるより、型紙は
 *   「型そのもの(羽根板+コマ)」に絞る。立てる台は各自で用意する前提。
 *
 * React/DOM 非依存の純粋モジュール(HTML 文字列を返すだけ。タブで開くのは stl.js の openHTML)。
 * ============================================================================
 */
import {
  ribOutline2D, grooveList, grooveR, outerR, komaShape, maxBoards, komaStop2D, notchR, komaR,
} from "./geometry.js";

// ---- 用紙(A4) ----
export const A4 = { w: 210, h: 297, name: "A4" };
const MARGIN = 8;    // 紙の端の余白(mm)。多くの家庭用プリンタの印刷不可領域(約5mm)より外側。
const FOOTER = 14;   // ページ下部の情報帯(ページ番号・原寸確認スケール)の高さ(mm)
const OVERLAP = 10;  // ページ跨ぎ部品の「のりしろ」(mm)。次ページの先頭がこの分だけ重なる。
const GAP = 6;       // 部品同士の隙間(mm)。切り分けの余裕。
const TICK = 5;      // 竹ひご目盛線の長さ(mm)。外縁から内側へ引く。

// ---- 上端の爪の内側ストッパ(棚)を段ボール向けに大きくする ----
// 3Dプリント既定のままだと、厚い材料では爪先が ribCoreFloor まで外へ押し戻され、棚の干渉限界と
// ほぼ重なって **厚 3mm 以上で棚が消える**(= 出っ張りが無い)。段ボールは手切りで隣の羽根板の
// 棚が多少触れても実害が無いので、クリアランスと採用下限を詰めて中心の余地いっぱいまで出す。
const STOP = {
  wRatio: 1.6,  // 張り出し目標 = 材料厚 × これ(実際は下の gap 由来の干渉限界で頭打ち)
  gap: 0.4,     // 隣の羽根板の棚との周方向クリア(mm)。3D の 1.0 では厚材で余地が消える。
  min: 0.4,     // これ未満の張り出しなら棚を作らない
};
const stopOpts = (matT) => ({ w: Math.max(3, matT * STOP.wRatio), gap: STOP.gap, min: STOP.min });

// 点列の外接矩形
function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * 部品を「y下向き・原点=外接矩形の左上」のページ座標へ正規化する。
 * geometry.js は y 上向き、SVG は y 下向きなので、ここで一度だけ反転して以降は素直に扱う。
 * rot=true なら先に 90° 回して縦長にする(横長のまま置くと紙幅に収まらない部品用)。
 */
function toPage(part, rot) {
  const conv = ([x, y]) => (rot ? [y, -x] : [x, y]);   // 90°回転(y上向きのまま)
  const all = [part.outline, ...(part.holes || [])].flat().concat((part.marks || []).flatMap((m) => [[m[0], m[1]], [m[2], m[3]]]));
  const b = bbox(all.map(conv));
  const fix = (q) => { const [x, y] = conv(q); return [x - b.x0, b.y1 - y]; }; // y 反転
  return {
    name: part.name,
    outline: part.outline.map(fix),
    holes: (part.holes || []).map((hh) => hh.map(fix)),
    marks: (part.marks || []).map((m) => [...fix([m[0], m[1]]), ...fix([m[2], m[3]])]),
    w: b.w, h: b.h,
  };
}

// ============ 各部品の 2D 外形(すべて geometry.js 由来) ============

// 羽根板: 溝を彫らない滑らかな外縁 + 竹ひごを巻く位置の目盛線。
// 肉抜き窓は開けない(段ボールは軽く、窓は強度を落として切る手間だけ増えるため)。
function ribPart(pk, k, nRibs, matT) {
  const h = pk.height;
  const outline = ribOutline2D(pk, k, { smooth: true, stop: stopOpts(matT) });
  // 目盛線の位置は STL の溝と同一基準(grooveList)。外縁から内側へ TICK mm の水平線。
  // 螺旋巻きでは羽根ごとに溝がずれるので k を渡す(3D と同じ位置に印を出す)。
  const marks = grooveList(pk, grooveR(pk), k).map((y) => {
    const x = outerR(pk, Math.min(Math.max(y, 0), h) / h);
    return [x, y, x - TICK, y];
  });
  return { name: `羽根板 ${k + 1}/${nRibs}`, outline, marks };
}

// コマ: 3D と同じ komaShape(=同じノッチ底 notchR・同じノッチ幅)。厚み方向だけが違う。
function komaPart(pk, i) {
  const pts = komaShape(pk).extractPoints(1).shape.map((v) => [v.x, v.y]);
  return { name: `コマ ${i + 1}/2`, outline: pts };
}

// ---- 十字スタンド(段ボールの帯2枚をX字に組んで型を立てる) ----
// 竹ひごを巻く・和紙を貼る作業は型を立てて全周にアクセスしたい。型は「腹(最大径)が太く
// 下コマ(⌀38)に向けてすぼまる卵形」なので、中央の下コマだけを受ければ腹は宙に浮く。
// 帯2枚を中央スロットで噛み合わせX字にし、上辺のV字くぼみ2枚で下コマの縁を受ける。
// 軽い紙殻なので足(帯長)は転倒余裕からごく控えめでよい(既定形状で⌀70)。
const STAND = {
  H: 42,        // 帯の高さ(mm)= V受けの深さ + 床クリアランス
  vDepth: 12,   // V受けくぼみの深さ(mm)。下コマの縁がここに沈んで中央に決まる
  slotDepth: 22, // 噛み合いスロットの深さ(mm)。vDepth + これ < H で中央に橋を残す(切断防止)
};
const SLOT_FIT = 0.3; // 噛み合いスロットのはめあい(mm)。段ボールは潰れるので小さめ
// スタンドの足の直径(mm)。転倒しない最小径を型の重心高さから出し、5mm 丸め・下限70。
function standFootD(pk) {
  const full = pk.height + 2 * pk.tabLen, cg = full * 0.45;   // 薄い回転殻の重心は概ね全高の45%
  const need = 2 * cg * Math.tan((15 * Math.PI) / 180);       // 15°傾けても戻る足径
  return Math.max(70, Math.ceil(need / 5) * 5);
}
// 帯1枚の外形。中央スロットは slotTop=true なら上辺から、false なら下辺から切る
// (2枚で上下逆にして噛み合わせる)。上辺中央には必ず V 受けを付ける。vw = V の開口幅。
function standStrip(L, matT, vw, slotTop, name) {
  const H = STAND.H, sw = matT + SLOT_FIT, vd = STAND.vDepth, sd = STAND.slotDepth;
  const o = [];
  // 下辺(左→右)。下スロットのときは中央を凹ませる。
  if (!slotTop) { o.push([-L / 2, 0], [-sw / 2, 0], [-sw / 2, sd], [sw / 2, sd], [sw / 2, 0], [L / 2, 0]); }
  else { o.push([-L / 2, 0], [L / 2, 0]); }
  // 右辺 → 上辺(右→左, V受け)。上スロットのときは V の底からさらに細いスロットを下へ。
  o.push([L / 2, H], [vw / 2, H], [0, H - vd]);
  if (slotTop) { o.push([sw / 2, H - vd], [sw / 2, H - sd], [-sw / 2, H - sd], [-sw / 2, H - vd]); }
  o.push([-vw / 2, H], [-L / 2, H]);
  return { name, outline: o };
}
function standParts(pk, matT) {
  const L = standFootD(pk);
  // V の開口幅は下コマ径より**狭く**する。広いとコマがV底へ抜けて縁に乗るだけになり中央に
  // 決まらない。狭ければコマは開口の左右の角で受けられ、2枚分の4角でコマを中央に拘束する。
  const vw = Math.min(L - 8, Math.max(matT + 8, 2 * komaR(pk) - 6));
  return [
    standStrip(L, matT, vw, false, "スタンド帯 1/2 (下スロット)"),
    standStrip(L, matT, vw, true, "スタンド帯 2/2 (上スロット)"),
  ];
}

/**
 * 型紙に載せる全部品を作る。返り値の p は「材料厚を反映した型紙用の p」。
 * boards は材料厚によっては maxBoards を超える(ノッチ同士が中心で重なる)ので必ず切り詰め、
 * 切り詰めたかどうかを clamped で返して UI/紙面で警告できるようにする。
 */
export function paperParts(p, matT) {
  // fit=0: プリント公差を足さない(公称=材料厚ぴったり)。段ボールは繊維が潰れて入るので、
  // 3Dプリント用の fit(既定0.3mm)を足すと逆にガタつき、爪がコマを保持できなくなる。
  const pk = { ...p, boardT: matT, komaT: matT, fit: 0 };
  const nMax = maxBoards(pk);
  const clamped = pk.boards > nMax;
  if (clamped) pk.boards = nMax;

  const parts = [];
  for (let k = 0; k < pk.boards; k++) parts.push(ribPart(pk, k, pk.boards, matT));
  for (let i = 0; i < 2; i++) parts.push(komaPart(pk, i));
  parts.push(...standParts(pk, matT));   // 型を立てる十字スタンド(帯2枚)
  // 上端の爪のストッパ(棚)が作れたか。棚の位置は「コマを爪先まで嵌めた時のコマ内面」=
  // height + tabLen - matT なので、材料が爪の長さに近いと置き場が無くなり作られない。
  const stop = komaStop2D(pk, stopOpts(matT));
  // コマの溝どうしの間に残る壁厚。3Dプリント基準(MIN_WALL=1.6mm)で詰まるので、厚い材料ほど
  // 溝に対して壁が細くなる。形は変えない(枚数を勝手に減らさない)が、手で切ると裂ける水準
  // (材料厚の半分未満)なら紙面で知らせて、枚数・材料・開口を選ぶ判断材料にしてもらう。
  const wall = (2 * Math.PI * notchR(pk)) / pk.boards - matT;
  return { parts, pk, clamped, nMax, wall, stop: !!stop, stopW: stop ? notchR(pk) - stop.Rd : 0 };
}

// ============ ページ割り付け ============
// 2段階でやる。(1) ページのことを考えずに部品を上から「行」へ詰める。(2) 行をページへ割り付ける。
//
// 割り付けの原則: **1ページに収まる行は絶対に跨がせない**。入らなければ次のページをその行の
// 先頭から始めるだけで、のりしろは要らない(紙を貼り合わせずに切り抜ける)。のりしろが要るのは
// 「1ページより高い行」= 長い羽根板のように1枚に収まらない部品だけで、そのときだけページを
// OVERLAP 分重ねる。以前は全ページを一律に重ねていたため、跨ぐ部品が無くても毎ページ
// のりしろ帯が出て、有効高さも OVERLAP 分だけ無駄に削れていた。
function layout(parts, page) {
  const CW = page.w - 2 * MARGIN;              // コンテンツ幅
  const CH = page.h - 2 * MARGIN - FOOTER;     // コンテンツ高さ(1ページに使える高さ)

  // --- (1) 行へ詰める ---
  const placed = [], rows = [];
  let y = 0, rowX = 0, rowH = 0;
  const endRow = () => { if (rowH > 0) { rows.push({ y, h: rowH }); y += rowH + GAP; rowX = 0; rowH = 0; } };
  for (const raw of parts) {
    // 紙幅に収まらない横長の部品は 90° 回して縦長にする
    let q = toPage(raw, false);
    if (q.w > CW) { const r = toPage(raw, true); if (r.w <= CW) q = r; }
    if (rowX > 0 && rowX + q.w > CW) endRow();   // 幅が尽きたら改行
    placed.push({ ...q, x: rowX, y });
    rowX += q.w + GAP;
    rowH = Math.max(rowH, q.h);
  }
  endRow();

  // --- (2) 行をページへ ---
  const pages = [];
  let cur = null;
  for (const r of rows) {
    if (r.h > CH) {
      // 1ページに収まらない行 → のりしろ分だけ重ねながら必要枚数を起こす
      for (let t = r.y; t < r.y + r.h; t += CH - OVERLAP) pages.push({ top: t, row: r });
      cur = pages[pages.length - 1];  // 最後のページに余白があれば次の行も載せる
    } else if (!cur || r.y + r.h > cur.top + CH) {
      cur = { top: r.y, row: r };     // 今のページに入らない → 次ページをこの行から始める
      pages.push(cur);
    }
  }
  if (!pages.length) pages.push({ top: 0, row: null });
  // 各ページの下端。**次のページが同じ行の続き**(= 1枚に収まらない部品を分割している)の
  // ときだけ CH いっぱいまで描き、次ページと OVERLAP 分重ねる(のりしろ)。それ以外は
  // 「次のページが始まる位置」で切る → 次の行の頭が前ページに食い込まない。
  // (この区別が無いと、跨ぎページの下端に次の行まで写り込み、貼り合わせ不要な箇所にも
  //  のりしろが出て「全ページ重なっている」ように見える)
  pages.forEach((pg, i) => {
    const next = pages[i + 1];
    pg.bot = !next || (pg.row && next.row === pg.row) ? pg.top + CH : Math.min(pg.top + CH, next.top);
  });
  return { placed, CW, CH, pages };
}

// ============ SVG / HTML 生成 ============
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const n2 = (v) => (Math.round(v * 100) / 100).toString();
const pathOf = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${n2(x)} ${n2(y)}`).join("") + "Z";

// 1ページ分の SVG。ページ i はコンテンツ座標の [top, top+CH] の帯を映す。
function pageSVG(lay, i, page, info) {
  const { top, bot } = lay.pages[i];
  const parts = [];
  for (const q of lay.placed) {
    if (q.y >= bot || q.y + q.h <= top) continue;          // この帯に無い部品は描かない
    const g = [`<path d="${pathOf(q.outline)}" class="cut"/>`];
    for (const hh of q.holes) g.push(`<path d="${pathOf(hh)}" class="cut"/>`);
    for (const m of q.marks) g.push(`<line x1="${n2(m[0])}" y1="${n2(m[1])}" x2="${n2(m[2])}" y2="${n2(m[3])}" class="tick"/>`);
    // 部品名は切り抜いた後の識別用に**部品の内側**へ薄く入れる。上端寄りに置くと柱の
    // U字サドルなど「切り落とす側」に乗るので、材料が残っている中央やや下(62%)に置く。
    g.push(`<text x="${n2(q.w / 2)}" y="${n2(q.h * 0.62)}" class="pname">${esc(q.name)}</text>`);
    parts.push(`<g transform="translate(${n2(q.x)} ${n2(q.y)})">${g.join("")}</g>`);
  }
  // トンボ(四隅の十字)。貼り合わせの位置合わせに使う。
  const cross = (x, y) => `<path d="M${n2(x - 3)} ${n2(y)}H${n2(x + 3)}M${n2(x)} ${n2(y - 3)}V${n2(y + 3)}" class="reg"/>`;
  const marks = [cross(MARGIN, MARGIN), cross(MARGIN + lay.CW, MARGIN), cross(MARGIN, MARGIN + lay.CH), cross(MARGIN + lay.CW, MARGIN + lay.CH)].join("");
  // のりしろ帯。次ページがこのページの帯に食い込む(= 部品がページを跨ぐ)ときだけ引く。
  // 跨ぐ部品が無ければページは重ならないので、線も注意書きも出ない。
  const next = lay.pages[i + 1];
  const glueTop = next && next.top < bot ? next.top : null;   // 実際に重なる時だけ
  const glueY = MARGIN + (glueTop - top);
  const glue = glueTop == null ? ""
    : `<line x1="${MARGIN}" y1="${n2(glueY)}" x2="${n2(MARGIN + lay.CW)}" y2="${n2(glueY)}" class="glue"/>`
      + `<text x="${n2(MARGIN + 2)}" y="${n2(glueY - 1.5)}" class="note">▼ここから下は次のページと重なります(のりしろ)</text>`;
  // 原寸確認スケール(50mm)。プリンタの拡大縮小が入っていないかを定規で必ず確認する。
  const sy = page.h - MARGIN - 5, sx = MARGIN;
  const ruler = `<path d="M${sx} ${n2(sy)}h50M${sx} ${n2(sy - 2)}v4M${n2(sx + 25)} ${n2(sy - 1.5)}v3M${n2(sx + 50)} ${n2(sy - 2)}v4" class="reg"/>`
    + `<text x="${n2(sx + 53)}" y="${n2(sy + 1.5)}" class="note">50mm ← 定規で確認(合わなければ「実際のサイズ/100%」で印刷し直し)</text>`;
  const foot = `<text x="${n2(page.w - MARGIN)}" y="${n2(sy + 1.5)}" class="foot">${esc(info.title)} — ${i + 1} / ${info.pages}</text>`;

  // 部品はページの帯(top..bot)でクリップする。跨ぐ部品が下部の情報帯へはみ出すのを防ぎ、
  // ページの切れ目もここで決まる(クリップが無いと隣のページの内容が紙にはみ出す)。
  const clip = `clip${i}`;
  return `<svg class="pg" width="${page.w}mm" height="${page.h}mm" viewBox="0 0 ${page.w} ${page.h}" xmlns="http://www.w3.org/2000/svg">`
    + `<defs><clipPath id="${clip}"><rect x="${MARGIN}" y="${MARGIN}" width="${n2(lay.CW)}" height="${n2(bot - top)}"/></clipPath></defs>`
    + `<g clip-path="url(#${clip})"><g transform="translate(${MARGIN} ${n2(MARGIN - top)})">${parts.join("")}</g></g>`
    + marks + glue + ruler + foot + `</svg>`;
}

/**
 * 型紙の印刷用 HTML(自己完結・1ファイル)を返す。
 * ブラウザで開いて Ctrl/⌘+P →「実際のサイズ(100%)・余白なし」で印刷する。
 */
export function paperHTML(p, matT, page = A4) {
  const { parts, pk, clamped, nMax, stop, wall } = paperParts(p, matT);
  const lay = layout(parts, page);
  const info = { pages: lay.pages.length, title: `張型スタジオ 型紙 ${page.name} 原寸` };
  const svgs = [];
  for (let i = 0; i < lay.pages.length; i++) svgs.push(pageSVG(lay, i, page, info));

  const warnWall = wall < matT / 2
    ? `<p class="warn">⚠ コマの<b>溝と溝の間の壁が ${wall.toFixed(1)}mm</b> しかありません(溝の幅は材料厚どおりの ${matT}mm)。手で切ると裂けやすい細さです。太くするには <b>羽根板の枚数を減らす</b>・<b>薄い材料にする</b>・断面図で<b>開口を広げてコマを大きくする</b> のいずれかが効きます。</p>`
    : "";
  const warnStop = !stop
    ? `<p class="warn">⚠ 爪の長さ(${p.tabLen}mm)が材料厚(${matT}mm)に対して短いため、<b>上端の爪のストッパ(段)が作れませんでした</b>。コマが内側へずれ落ちるのを形で止められません。「爪の長さ」を材料厚の 2倍以上(${Math.max(12, matT * 2)}mm 程度)にすると段が付きます。</p>`
    : "";
  const warn = clamped
    ? `<p class="warn">⚠ 材料厚 ${matT}mm では羽根板は最大 ${nMax} 枚です(溝が広がり、コマの中心で溝どうしが重なるため)。${p.boards} 枚 → <b>${nMax} 枚</b>に減らして出力しました。枚数を保ちたい場合は薄い材料を使ってください。</p>`
    : "";

  return `<meta charset="utf-8"><title>${esc(info.title)}</title>
<style>
  /* 用紙ぴったりに1ページ1枚。余白は SVG 側に持たせるのでここは 0 にする */
  @page { size: ${page.name}; margin: 0 }
  body { margin: 0; font-family: system-ui, "Hiragino Sans", sans-serif; color: #2b2118; background: #eae6df }
  .pg { display: block; background: #fff; page-break-after: always; break-after: page; margin: 0 auto 12px }
  .cut  { fill: none; stroke: #000; stroke-width: 0.25 }               /* 切り取り線 */
  .tick { fill: none; stroke: #000; stroke-width: 0.25; stroke-dasharray: 1.2 1 } /* 竹ひご目盛(切らない) */
  .reg  { fill: none; stroke: #000; stroke-width: 0.2 }                /* トンボ・スケール */
  .glue { fill: none; stroke: #888; stroke-width: 0.2; stroke-dasharray: 3 2 }
  .pname { font-size: 3.4px; fill: #999; text-anchor: middle; font-family: sans-serif }
  .note  { font-size: 2.6px; fill: #888; font-family: sans-serif }
  .foot  { font-size: 2.8px; fill: #666; text-anchor: end; font-family: sans-serif }
  .head { max-width: 190mm; margin: 16px auto; padding: 16px 20px; background: #fff; border-radius: 10px; line-height: 1.75; font-size: 13px }
  .head h1 { font-size: 16px; margin: 0 0 10px }
  .head ol { padding-left: 1.2em; margin: 8px 0 } .head li { margin: 3px 0 }
  .head code { background: #f2efe9; padding: 1px 5px; border-radius: 4px }
  .warn { background: #fff4e8; border-left: 3px solid #d95b18; padding: 8px 12px; border-radius: 4px }
  /* 操作ボタン(画面のみ)。印刷では .head ごと消えるので紙には出ない */
  .acts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 0 0 14px }
  .acts button { font: inherit; font-weight: 700; padding: 10px 18px; border-radius: 9px; cursor: pointer;
    border: 1px solid #d95b18; background: #d95b18; color: #fff }
  .acts button.sub { background: #fff; color: #d95b18 }
  .acts button:hover { filter: brightness(1.06) }
  .acts .hint { font-size: 12px; color: #8a7f6e; line-height: 1.5 }
  @media print { .head { display: none } body { background: #fff } .pg { margin: 0 } }
</style>
<div class="head">
  <h1>張型スタジオ — 段ボール用 型紙(${page.name} 原寸 / 全 ${lay.pages.length} ページ)</h1>
  <div class="acts">
    <button onclick="window.print()">印刷 / PDFで保存</button>
    <button class="sub" onclick="saveHtml()">HTMLで保存</button>
    <span class="hint">PDF が欲しいときは、印刷ダイアログの<b>「送信先」を「PDFに保存」</b>にしてください。<br>
      いずれの場合も<b>「実際のサイズ / 100%」「余白: なし」</b>を選び、「用紙に合わせる」は外してください。</span>
  </div>
  ${warn}${warnWall}${warnStop}
  <ol>
    <li><b>「実際のサイズ / 100%」で印刷</b>してください(「用紙に合わせる」は禁止)。刷ったら各ページ下の <b>50mm スケール</b>を定規で必ず確認。</li>
    <li>ページを跨ぐ部品は、<b>のりしろ(灰色の破線より下)</b>を次ページに重ね、四隅のトンボを合わせて貼り合わせます。</li>
    <li>紙を段ボールに貼り、<b>実線だけ</b>を切り抜きます。<b>破線の目盛は切りません</b> — 竹ひごを巻く位置の印です。</li>
    <li>段ボールの<b>波の向き(目)は羽根板の長手方向</b>に合わせると折れにくくなります。</li>
    <li>材料厚 <code>${matT}mm</code> 前提でコマの溝の幅を決めています。実測厚と違うと嵌まりません(緩い/入らない)。</li>
    <li>コマ2枚は<b>同一形状</b>です(上下で同じものを使います)。</li>
    <li>組み立て: 羽根板の爪を上下2枚のコマに放射状に差し込みます。上端の爪の内側にある<b>段(ストッパ)</b>が、上のコマが内側へ入り込むのを止めます。差し込みが緩ければ接着してください。</li>
    <li><b>スタンド(帯2枚)</b>: 中央のスロットを噛み合わせて<b>X字に立て</b>ます(一方は上から、一方は下からスロットを切ってあるので直交して組めます)。上辺のV字に<b>下のコマの縁を載せる</b>と、型が立って腹(最大径)が宙に浮き、竹ひごや和紙の作業が全周からできます。ぐらつく場合は接着してください。</li>
  </ol>
  <p style="color:#8a7f6e;font-size:12px;margin:6px 0 0">火袋の高さ ${p.height}mm / 羽根板 ${pk.boards}枚 / 竹ひごピッチ ${p.pitch}mm — この帯は画面表示だけで、印刷はされません。</p>
</div>
${svgs.join("\n")}
<script>
// このページ自身を HTML ファイルとして保存する(あとで刷り直す・他の端末へ渡す用)。
// 型紙は自己完結(外部参照なし)なので、この1ファイルだけで再現できる。
function saveHtml() {
  var html = "<!doctype html>\\n" + document.documentElement.outerHTML;
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  a.download = "harigata_katagami_${page.name.toLowerCase()}.html";
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
}
</script>`;
}
