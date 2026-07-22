/**
 * ============================================================================
 * 型紙(段ボール)の検証
 * ============================================================================
 * STL は「水密(manifold)」で正しさを担保するが、型紙は紙なので判定基準が違う。
 * 型紙で壊れると困るのは次の3つ:
 *
 *   1. **原寸(1:1)であること**  — 紙面の寸法 = 実寸 mm。ここがズレたら型紙は無価値。
 *      geometry.js の不変量(羽根板の全長 / コマ外径 / 溝幅 / 溝の壁厚)と突き合わせる。
 *   2. **部品の載り漏れが無いこと** — 羽根板 N + コマ2 が全て紙に出る。
 *      ページ割り付け(行詰め+ページ跨ぎ)の取りこぼしはここでしか気付けない。
 *      併せて「**跨ぐ部品が無ければのりしろを出さない**」も検査する(不要な貼り合わせを
 *      強いていないか。以前は全ページを一律に重ねていた)。
 *   3. **NaN/undefined を出さないこと** — SVG の path に NaN が混ざるとその部品が消える
 *      (ブラウザは黙って無視するので、印刷して初めて気付く = 最悪)。
 *
 * 実行:  npm run check:paper
 * papercraft.js / geometry.js の 2D 側を触ったら通すこと。
 * ============================================================================
 */
import { paperHTML, paperParts, A4 } from "../src/papercraft.js";
import { komaR, komaStop2D, innerRi } from "../src/geometry.js";
import { PRESETS, DEFAULTS } from "../src/config.js";

let fail = 0;
const bad = (msg) => { console.log("FAIL:", msg); fail++; };
const eq = (a, b, msg, tol = 0.01) => { if (Math.abs(a - b) > tol) bad(`${msg}: ${a} != ${b}`); };
// 点列の外接矩形(外形+穴)
const bb = (q) => {
  const a = [q.outline, ...(q.holes || [])].flat();
  const xs = a.map((v) => v[0]), ys = a.map((v) => v[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

// ---- 1. 原寸: 紙面の寸法が geometry.js の値と一致するか ----
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const matT of [1, 2, 5, 10]) {
      const p = { ...DEFAULTS, ...preset, height };
      const { parts, pk } = paperParts(p, matT);
      const tag = `${preset.key} h${height} t${matT}`;
      const find = (pre) => parts.find((q) => q.name.startsWith(pre));
      eq(bb(find("羽根板")).h, p.height + 2 * p.tabLen, `${tag} 羽根板の全長`);
      // コマのノッチ幅 = 材料厚ぴったり(fit=0)。ここがズレると爪が入らない/ガタつく。
      eq(pk.boardT + Math.max(0, pk.fit ?? 0), matT, `${tag} ノッチ幅`);
      // 爪の内側ストッパが**必ず存在**し、3Dプリント既定より大きく張り出していること。
      // (既定のままだと厚 3mm 以上で「余地なし」となり棚が消える = 段ボールで効かない)
      // 棚の位置 = コマを爪先まで嵌めた時のコマ内面(height + tabLen - matT)なので、
      // 材料厚が爪の長さに迫ると置き場が無くなる。その場合は紙面で警告する仕様(棚は作らない)。
      const st = komaStop2D(pk, { w: Math.max(3, matT * 1.6), gap: 0.4, min: 0.4 });
      const room = p.tabLen - matT >= 1;
      if (room && !st) bad(`${tag} 余地があるのにストッパが生成されない`);
      if (!room && st) bad(`${tag} 置き場が無いのにストッパを作った`);
      const st3 = komaStop2D(pk);
      if (st && st3 && st.Rd > st3.Rd + 1e-9) bad(`${tag} ストッパが 3D 既定より小さい`);
      if (!st && !paperHTML(p, matT, A4).includes("ストッパ(段)が作れません")) bad(`${tag} 棚なしの警告が出ていない`);
      // コマの溝どうしの壁が細いとき(材料厚の半分未満)は、形は変えずに紙面で知らせる仕様。
      const wall = (2 * Math.PI * (innerRi(pk) - 0.5)) / pk.boards - matT;
      if (wall < matT / 2 && !paperHTML(p, matT, A4).includes("しかありません")) bad(`${tag} 壁が細いのに警告が出ていない`);
      // コマは多角形近似(弦)+ 縁のノッチ抜きなので、外接径は直径をわずかに下回る
      // (材料が厚いほどノッチが広く、下回る量も増える)。komaR を**上回ったら**異常。
      const kw = bb(find("コマ")).w, kd = 2 * komaR(pk);
      if (!(kw <= kd + 0.01 && kw >= kd * 0.9)) bad(`${tag} コマ外径 ${kw} vs ${kd}`);
    }

// ---- 2/3. 載り漏れ・NaN・ページ整合のスイープ ----
let n = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const boards of [4, 6, 8, 12, 16])
      for (const matT of [1, 2, 3, 5, 8, 10])
        for (const pitch of [8, 15, 30]) {
          n++;
          const p = { ...DEFAULTS, ...preset, height, boards, pitch };
          const tag = `${preset.key} h${height} b${boards} t${matT} pi${pitch}`;
          const { parts, pk, clamped, nMax } = paperParts(p, matT);
          if (parts.length !== pk.boards + 4) bad(`${tag}: 部品数 ${parts.length}`); // 羽根板N + コマ2 + スタンド帯2
          if (clamped && pk.boards !== nMax) bad(`${tag}: clamp 不整合`);
          for (const q of parts) {
            const pts = [q.outline, ...(q.holes || [])].flat();
            if (!pts.length) bad(`${tag}: ${q.name} 空`);
            for (const [x, y] of pts) if (!Number.isFinite(x) || !Number.isFinite(y)) bad(`${tag}: ${q.name} に NaN`);
            for (const m of q.marks || []) for (const v of m) if (!Number.isFinite(v)) bad(`${tag}: ${q.name} の目盛に NaN`);
          }
          const html = paperHTML(p, matT, A4);
          if (/NaN|Infinity|undefined/.test(html)) bad(`${tag}: HTML に NaN/undefined`);
          const pages = (html.match(/class="pg"/g) || []).length;
          if (pages < 1 || pages > 60) bad(`${tag}: ページ数 ${pages}`);
          // 全ページに原寸確認スケールが出ていること(1枚でも欠けると縮尺事故に気付けない)
          if ((html.match(/50mm ←/g) || []).length !== pages) bad(`${tag}: スケール欠落`);
          for (const q of parts) if (!html.includes(q.name)) bad(`${tag}: ${q.name} が紙に無い`);
          // のりしろは「1ページ(コンテンツ高さ CH)に収まらない部品」がある時だけ出す。
          // A4: CH = 297 - 2*8(余白) - 14(下部の帯) = 267mm。
          const CH = 297 - 2 * 8 - 14;
          const tallest = Math.max(...parts.map((q) => {
            const a = [q.outline, ...(q.holes || [])].flat();
            const ys = a.map((v) => v[1]), xs = a.map((v) => v[0]);
            // 紙幅に収まらなければ 90° 回されるので、その場合は幅が高さになる
            const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
            return w > 210 - 2 * 8 ? w : h;
          }));
          // 判定は紙面に実際に引かれる注記で行う(説明文にも「のりしろ」の語があるため)
          const glued = html.includes("ここから下は次のページと重なります");
          if (tallest <= CH && glued) bad(`${tag}: 跨ぐ部品が無いのにのりしろが出ている`);
          if (tallest > CH && !glued) bad(`${tag}: 跨ぐ部品があるのにのりしろが無い`);
        }

console.log(`\n=== ${n} 組 (原寸検証 ${PRESETS.length * 16} 組含む), ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
