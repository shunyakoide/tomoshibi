/**
 * ============================================================================
 * persist.js の sanitize 検証(テストランナー無しの手動チェック)
 * ============================================================================
 * 保存/復元は外部由来(手書き・旧バージョン・JSON往復)の壊れた値を受けうる。
 * それらがクラッシュ・NaN・非水密コマを生まず、安全に DEFAULTS へフォールバック/
 * サルベージされることを確認する。localStorage をメモリ実装でモックして走らせる。
 *
 * 実行:  npm run check:persist
 * ============================================================================
 */
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const P = await import("../src/persist.js");
const G = await import("../src/geometry.js");
const { DEFAULTS } = await import("../src/config.js");

const openEdges = (g) => {
  const pos = g.getAttribute("position"), idx = g.index ? g.index.array : null;
  const n = idx ? idx.length / 3 : pos.count / 3, E = new Map();
  const key = (i) => [Math.round(pos.getX(i) * 1e4), Math.round(pos.getY(i) * 1e4), Math.round(pos.getZ(i) * 1e4)].join(",");
  for (let t = 0; t < n; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const ks = [key(a), key(b), key(c)];
    for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) { const e = ks[x] < ks[y] ? ks[x] + "|" + ks[y] : ks[y] + "|" + ks[x]; E.set(e, (E.get(e) || 0) + 1); }
  }
  let o = 0; for (const c of E.values()) if (c === 1) o++; return o;
};
const finiteP = (p) => Object.entries(p).every(([k, v]) => k === "shape" || k === "pts" || typeof v === "boolean" || Number.isFinite(v))
  && p.pts.every((q) => Number.isFinite(q.t) && Number.isFinite(q.r));
const manifoldOK = (p) => {
  try { return [G.ribGeometry(p, 0), G.komaGeometry(p), G.standGeometry(p), G.boardGeometry(p)].every((g) => openEdges(g) === 0); }
  catch (e) { return "EXC:" + e.message; }
};
const KEY = P.STORAGE_KEY;

let pass = 0, fail = 0;
const t = (name, cond) => { const ok = cond === true; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : " → " + cond}`); ok ? pass++ : fail++; };

delete store[KEY];
t("空なら null", P.loadSaved() === null);

store[KEY] = "{not json";
t("壊れJSONは null", P.loadSaved() === null);

P.saveState({ p: { ...DEFAULTS, pts: [] }, bedW: 256, bedD: 256, printRibs: 1 });
let r = P.loadSaved();
t("pts空→復旧 有限", r && finiteP(r.p));
t("pts空→水密", manifoldOK(r.p) === true);

P.saveState({ p: { ...DEFAULTS, pts: [{ t: 0.5, r: 60 }] }, bedW: 256, bedD: 256, printRibs: 1 });
t("pts1点→2点以上に復旧", P.loadSaved().p.pts.length >= 2);

P.saveState({ p: { ...DEFAULTS, pts: [{ t: NaN, r: 60 }, { t: 0.9, r: 20 }] }, bedW: 256, bedD: 256, printRibs: 1 });
t("pts非有限→復旧 有限", finiteP(P.loadSaved().p));

P.saveState({ p: { ...DEFAULTS, boardT: "3" }, bedW: 256, bedD: 256, printRibs: 1 });
r = P.loadSaved();
t("boardT文字列→数値", r.p.boardT === 3 && typeof r.p.boardT === "number");

P.saveState({ p: { ...DEFAULTS, boardT: 4, boards: 16 }, bedW: 256, bedD: 256, printRibs: 1 });
r = P.loadSaved();
t("boards過大→maxBoardsへクランプ", r.p.boards <= G.maxBoards(r.p));
t("boards過大→水密(元のコマ非水密バグ域)", manifoldOK(r.p) === true);

P.saveState({ p: { ...DEFAULTS, boardT: 3 }, bedW: 300, bedD: 250, printRibs: 2 });
store[KEY] = store[KEY].replace('"schemaVersion":1', '"schemaVersion":99');
r = P.loadSaved();
t("未知version→機械不変量サルベージ", r && r.p.boardT === 3 && r.bedW === 300);

P.saveState({ p: DEFAULTS, printRibs: 1 });
r = P.loadSaved();
t("bedW欠損→256", r.bedW === 256 && r.bedD === 256);

P.saveState({ p: { ...DEFAULTS, neckOn: false }, bedW: 256, bedD: 256, printRibs: 1 });
t("旧neckOn温存", P.loadSaved().p.neckOn === false);

P.saveState({ p: { ...DEFAULTS, height: 333 }, bedW: 256, bedD: 256, printRibs: 3 });
r = P.loadSaved();
t("正常往復(height/printRibs)", r.p.height === 333 && r.printRibs === 3);

// pitch=0(壊れた値)→ 範囲クランプ。放置すると grooveList が n=Infinity で無限ループする。
P.saveState({ p: { ...DEFAULTS, pitch: 0 }, bedW: 256, bedD: 256, printRibs: 1 });
r = P.loadSaved();
t("pitch=0→正の域にクランプ", r.p.pitch >= 8);
t("pitch=0復元でも grooveList が有限本数で返る", (() => {
  const gs = G.grooveList(r.p, r.p.higoD / 2 + 0.25);
  return Array.isArray(gs) && gs.length < 1000;
})());

// 範囲外の数値(負/極大)→ 許容域にクランプ。
P.saveState({ p: { ...DEFAULTS, height: -5, boardT: 99, boards: 999 }, bedW: 9, bedD: 9999, printRibs: 1 });
r = P.loadSaved();
t("height負→140以上", r.p.height >= 140);
t("boardT極大→4以下", r.p.boardT <= 4);
t("boards極大→maxBoards以下", r.p.boards <= G.maxBoards(r.p));
t("bedW/bedD範囲外→100..420", r.bedW >= 100 && r.bedD <= 420);

// pts の t が範囲外 → [0,1] にクランプして昇順。
P.saveState({ p: { ...DEFAULTS, pts: [{ t: -3, r: 60 }, { t: 9, r: 20 }] }, bedW: 256, bedD: 256, printRibs: 1 });
r = P.loadSaved();
t("pts の t を [0,1] にクランプ", r.p.pts.every((q) => q.t >= 0 && q.t <= 1));

// ---- ベジェ接線ハンドル(ho/hi)の sanitize ----
// 正常なハンドルは温存。壊れたハンドル(非有限・JSON化された Infinity=null・非オブジェクト)は
// 捨てて自動接線に戻す(outerR が NaN 化しないこと)。
const bakedPts = G.bakeBezierHandles({ ...DEFAULTS }.pts);
P.saveState({ p: { ...DEFAULTS, pts: bakedPts }, bedW: 256, bedD: 256, printRibs: 1 });
r = P.loadSaved();
t("正常な ho/hi は温存", r.p.pts.some((q) => q.ho && Number.isFinite(q.ho.dt) && Number.isFinite(q.ho.dr)));
t("ハンドル付きも往復で水密", manifoldOK(r.p) === true);
t("ハンドル付き outerR が有限", (() => { for (let i = 0; i <= 50; i++) if (!Number.isFinite(G.outerR(r.p, i / 50))) return false; return true; })());

// 壊れたハンドル: dt=NaN / dr=Infinity(JSONで null 化) / ho が配列 など
const brokenPts = [
  { t: 0.05, r: 74, ho: { dt: NaN, dr: 2 }, hi: { dt: Infinity, dr: 0 } },
  { t: 0.4, r: 94, ho: [1, 2], hi: { dt: 0.02 } },      // 非オブジェクト / dr 欠損
  { t: 0.95, r: 19, ho: null, hi: "x" },
];
P.saveState({ p: { ...DEFAULTS, pts: brokenPts }, bedW: 256, bedD: 256, printRibs: 1 });
r = P.loadSaved();
t("壊れた ho/hi は破棄(不正な dt/dr が残らない)",
  r.p.pts.every((q) => (!q.ho || (Number.isFinite(q.ho.dt) && Number.isFinite(q.ho.dr)))
    && (!q.hi || (Number.isFinite(q.hi.dt) && Number.isFinite(q.hi.dr)))));
t("壊れた ho/hi でも outerR 有限", (() => { for (let i = 0; i <= 50; i++) if (!Number.isFinite(G.outerR(r.p, i / 50))) return false; return true; })());
t("壊れた ho/hi でも水密", manifoldOK(r.p) === true);

console.log(`\n=== ${pass} pass / ${fail} fail ===`);
process.exit(fail ? 1 : 0);
