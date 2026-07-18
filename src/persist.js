/**
 * ============================================================================
 * 状態の永続化 (PERSIST)
 * ============================================================================
 * 作業状態(形状 p + 機種設定 bedW/bedD + printRibs)を localStorage に自動保存し、
 * 起動時に復元する。リロードで DEFAULTS に戻ると、土台の再利用に必要な合わせ目の値
 * (boardT/tabLen/komaT/boards/fit)まで失われるため、それを防ぐのが主目的。
 *
 * React/DOM のコンポーネントには依存しない(localStorage と純粋な検証だけ)。geometry.js
 * とは別ファイルなので「geometry は純粋関数のまま」の制約にも抵触しない。依存は増やさない
 * (ブラウザ標準の localStorage のみ)。
 *
 * 復元は必ず sanitize を通す: 外部由来(手書き/旧バージョン/JSON往復)の壊れた値で
 * outerR が NaN 化 → STL 非多様体、や、過大な boards で初回レンダに非水密コマ、を防ぐ。
 * ============================================================================
 */
import { DEFAULTS } from "./config.js";
import { maxBoards } from "./geometry.js";

export const STORAGE_KEY = "harigata.studio";
export const SCHEMA_VERSION = 1;

// 数値フィールドの許容範囲 [min, max]。復元値は UI のクランプを経由しないため、壊れた
// localStorage や外部 JSON の範囲外値がそのまま geometry に流れると破綻する(特に pitch:0 は
// grooveList の n=Math.round(span/pitch)=Infinity で無限ループ)。ここで必ず範囲に収める。
// 範囲は UI のスライダー/ステッパーの許容域に合わせる(不明なものは安全側の広めの域)。
const BOUNDS = {
  height: [140, 400], rTop: [8, 130], rBot: [8, 130], boards: [4, 16],
  boardWidth: [10, 120], boardT: [1, 4], higoD: [1, 4], pitch: [8, 30],
  fit: [0, 1], tabLen: [5, 40], tabW: [4, 40], komaT: [3, 20], tabR: [6, 40],
};
const NUM_KEYS = Object.keys(BOUNDS);

// pts の検証: 配列・2点以上・各要素 {t,r} が有限。満たさなければ DEFAULTS.pts に差し替える。
// t は [0,1]・r は妥当域にクランプし、t 昇順にソート(geometry の前提。外部由来は順序無保証)。
function validatePts(pts) {
  if (!Array.isArray(pts) || pts.length < 2) return DEFAULTS.pts.map((q) => ({ ...q }));
  for (const q of pts) {
    if (!q || !Number.isFinite(q.t) || !Number.isFinite(q.r)) return DEFAULTS.pts.map((q2) => ({ ...q2 }));
  }
  return pts
    .map((q) => ({ ...q, t: Math.min(1, Math.max(0, q.t)), r: Math.min(140, Math.max(8, q.r)) }))
    .sort((a, b) => a.t - b.t);
}

// 数値の強制。非有限(文字列/欠損/NaN)は DEFAULTS へ、範囲外は許容域にクランプする。
function coerceNums(p) {
  for (const k of NUM_KEYS) {
    const [lo, hi] = BOUNDS[k];
    const v = Number(p[k]);
    p[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DEFAULTS[k];
  }
  return p;
}

// 形状 p を sanitize: 浅マージで欠損を DEFAULTS で埋め、pts 検証・数値強制・boards クランプ。
// boards クランプは HarigataStudio の自己修復 effect の前倒し(初回レンダで非水密コマを出さない)。
function sanitizeP(rawP) {
  const p = { ...DEFAULTS, ...rawP };   // 欠損フィールドは唯一の真実源 DEFAULTS が埋める
  p.pts = validatePts(rawP && rawP.pts);
  coerceNums(p);
  p.boards = Math.min(p.boards, maxBoards(p));
  return p;
}

// 保存: 失敗(容量超過/プライベートモード/localStorage無効)は握り潰す。
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...state }));
  } catch { /* 保存できなくてもアプリは動く(次回は DEFAULTS 起動になるだけ) */ }
}

// 復元: 「マージ・検証・クランプ済みの {p, bedW, bedD, printRibs}」か、無効なら null。
// version が既知でなくても saved.p があれば読む(浅マージは前方互換なので、機械不変量を
// 捨てない)。真に互換不能な破壊的変更をしたときだけ、その version を破棄リストに載せる。
const INCOMPATIBLE_VERSIONS = new Set(); // 例: 破壊的変更をしたら該当 version をここに追加
export function loadSaved() {
  let saved;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    saved = JSON.parse(raw);
  } catch { return null; }
  if (!saved || typeof saved !== "object") return null;
  if (INCOMPATIBLE_VERSIONS.has(saved.schemaVersion)) return null;
  const clampNum = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const bedW = clampNum(saved.bedW, 100, 420, 256);   // UI の numInput 許容域
  const bedD = clampNum(saved.bedD, 100, 420, 256);
  const printRibs = Math.round(clampNum(saved.printRibs, 1, 16, 1)); // 1..boards、上限は boards 側で更にクランプ
  return { p: sanitizeP(saved.p), bedW, bedD, printRibs };
}
