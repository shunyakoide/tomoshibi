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

// 数値フィールド: 保存/復元で Number 化し、非有限は DEFAULTS 値へ戻す。
const NUM_KEYS = [
  "height", "rTop", "rBot", "boards", "boardWidth", "boardT", "higoD", "pitch",
  "fit", "tabLen", "tabW", "komaT", "tabR",
];

// pts の検証: 配列・2点以上・各要素 {t,r} が有限。満たさなければ DEFAULTS.pts に差し替える。
// t 昇順は geometry の前提(fukuroSpline 等)なので外部由来はソートし直す。
function validatePts(pts) {
  if (!Array.isArray(pts) || pts.length < 2) return DEFAULTS.pts.map((q) => ({ ...q }));
  for (const q of pts) {
    if (!q || !Number.isFinite(q.t) || !Number.isFinite(q.r)) return DEFAULTS.pts.map((q2) => ({ ...q2 }));
  }
  return pts.map((q) => ({ ...q })).sort((a, b) => a.t - b.t);
}

// 数値の強制。非有限(文字列/欠損/NaN)は DEFAULTS 値へ。
function coerceNums(p) {
  for (const k of NUM_KEYS) {
    const v = Number(p[k]);
    p[k] = Number.isFinite(v) ? v : DEFAULTS[k];
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
  const bedW = Number.isFinite(Number(saved.bedW)) ? Number(saved.bedW) : 256;
  const bedD = Number.isFinite(Number(saved.bedD)) ? Number(saved.bedD) : 256;
  const printRibs = Number.isFinite(Number(saved.printRibs)) ? Number(saved.printRibs) : 1;
  return { p: sanitizeP(saved.p), bedW, bedD, printRibs };
}
