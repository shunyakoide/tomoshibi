/**
 * ============================================================================
 * プリセット / パラメータ定義 (CONFIG)
 * ============================================================================
 * シルエットのプリセット、スライダーの値域、初期値、インスペクタの
 * セクション分けをまとめる。UI とジオメトリが参照する単一の設定源。
 * ============================================================================
 */
export const PRESETS = [
  { name: "たまご", curve: "egg", bulge: 62, topR: 22, bottomR: 34, height: 200 },
  { name: "球", curve: "sphere", bulge: 75, topR: 25, bottomR: 25, height: 210 },
  { name: "ひょうたん", curve: "gourd", bulge: 65, topR: 28, bottomR: 30, height: 280 },
];
export const SLIDERS = [
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
export const DEFAULTS = {
  ...PRESETS[0], boards: 8, boardWidth: 35, boardT: 2, higoD: 2,
  pitch: 15, fit: 0.3, spiral: true, tabLen: 10, tabW: 10, komaT: 8, // 爪は短く(先端にコマ)
  cutBottom: 15, // 上下端のまっすぐな首
  tabR: 15,      // 爪(タブ)の半径 = 内縁のまっすぐな芯。上下同じ位置で内側
  lighten: true, // 羽根の中央を肉抜き(外縁の帯と内縁の芯を残す)
};
// インスペクタのセクション分け(キーは SLIDERS の key を参照)
export const GROUPS = [
  { title: "シルエット", keys: ["height", "topR", "bottomR", "bulge", "cutBottom"] },
  { title: "羽根の芯・爪", keys: ["tabR", "tabLen"] },
  { title: "骨組み", keys: ["boards", "boardT"] },
  { title: "竹ひご", keys: ["higoD", "pitch"] },
  { title: "組立公差", keys: ["fit"] },
];
export const SLIDER_BY_KEY = Object.fromEntries(SLIDERS.map((s) => [s.key, s]));
