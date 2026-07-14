/**
 * ============================================================================
 * プリセット / パラメータ定義 (CONFIG)
 * ============================================================================
 * 形プリセット(制御点テンプレート)と初期値をまとめる。シルエットは
 * スライダーではなく断面図上のハンドル/制御点を直接ドラッグして編集する
 * (SectionEditor)。ここでは pts の初期配置テンプレートだけを持つ。
 * ============================================================================
 */

// 形プリセット = 制御点(pts)の初期配置テンプレート。選ぶと rTop/rBot/pts を差し替え、
// 他パラメータ(高さ・枚数・竹ひご等)は保持する。プリセットアイコンは実プロファイルから生成。
export const PRESETS = [
  { key: "egg", name: "たまご", rTop: 19, rBot: 58, pts: [{ t: 0.07, r: 84 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.9, r: 45 }] }, // ツール調整版
  { key: "sphere", name: "球", rTop: 26, rBot: 28, pts: [{ t: 0.5, r: 88 }] },
  { key: "gourd", name: "ひょうたん", rTop: 28, rBot: 30, pts: [{ t: 0.28, r: 88 }, { t: 0.55, r: 48 }, { t: 0.8, r: 72 }] },
  { key: "barrel", name: "たる", rTop: 52, rBot: 56, pts: [{ t: 0.1, r: 82, sharp: true }, { t: 0.9, r: 78, sharp: true }] },
];

// 初期状態。シルエットは H(火袋の高さ)/ rTop / rBot / pts。首(NECK)は geometry.js で15mm固定。
// 爪(claw=tabR15 / clawLen=tabLen10)・肉抜き(lighten)・公差(fit=tol0.3)は
// 既定値のまま(UIには出さず内部で使用)。
export const DEFAULTS = {
  shape: "egg", height: 205, rTop: 19, rBot: 58,
  pts: [{ t: 0.07, r: 84 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.9, r: 45 }],
  boards: 8, boardWidth: 35, boardT: 2, higoD: 2, pitch: 6, // AKARI 1A 風: 竹ひごは密
  fit: 0.3, spiral: true, tabLen: 10, tabW: 10, komaT: 8,
  tabR: 15, lighten: true,
};

// シルエットのスクラブ行(左右ドラッグで微調整)。値域と感度。
export const SIL_ROWS = [
  { key: "height", label: "火袋の高さ", min: 140, max: 400, sens: 0.5, round: 1, unit: "mm" },
  { key: "rTop", label: "上部半径", min: 12, max: 80, sens: 0.5, round: 1, unit: "mm" },
  { key: "rBot", label: "下部半径", min: 12, max: 80, sens: 0.5, round: 1, unit: "mm" },
];
