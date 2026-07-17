/**
 * ============================================================================
 * ジオメトリ頂点ハッシュ(STL リグレッション検出)
 * ============================================================================
 * 代表パラメータでの全部品の頂点座標を SHA1 化して1行ずつ出力する。
 * 「STL を変えないはずのリファクタ」で、改修前後の出力を diff すれば頂点が
 * 1つでも動けば検出できる(manifold は水密性だけを見るので、形の同一性はこちらで担保)。
 *
 * 使い方(例: リファクタ前に基準を取り、後で突き合わせる):
 *   git stash            # or 対象ブランチのベースを checkout
 *   node scripts/hash.mjs > /tmp/base.txt
 *   git stash pop        # 改修を戻す
 *   node scripts/hash.mjs > /tmp/after.txt
 *   diff /tmp/base.txt /tmp/after.txt   # 差分ゼロ = STL 完全不変
 *
 * 座標は 1e-6mm に量子化してから丸め、浮動小数の非決定性を排除する。
 * ============================================================================
 */
import crypto from "node:crypto";
import * as G from "../src/geometry.js";
import { PRESETS, DEFAULTS } from "../src/config.js";

const hash = (g) => {
  const a = g.getAttribute("position").array;
  const q = Buffer.from(Float64Array.from(a, (x) => Math.round(x * 1e6)).buffer);
  return crypto.createHash("sha1").update(q).digest("hex").slice(0, 12);
};

const out = [];
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const boards of [6, 8, 12, 16])
      for (const fit of [0, 0.3])
        for (const higoD of [1.5, 2, 3]) {
          const p = { ...DEFAULTS, ...preset, height, boards, fit, higoD };
          const tag = `${preset.key} h${height} b${boards} fit${fit} hd${higoD}`;
          const sp = G.ribSplitParts(p, 0);
          out.push(`${tag} rib          ${hash(G.ribGeometry(p, 0))}`);
          out.push(`${tag} koma         ${hash(G.komaGeometry(p))}`);
          out.push(`${tag} stand        ${hash(G.standGeometry(p))}`);
          out.push(`${tag} board        ${hash(G.boardGeometry(p))}`);
          out.push(`${tag} split.bottom ${hash(sp.bottom)}`);
          out.push(`${tag} split.top    ${hash(sp.top)}`);
          out.push(`${tag} split.splice ${hash(sp.splice)}`);
        }
console.log(out.join("\n"));
