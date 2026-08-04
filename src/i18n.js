/**
 * ============================================================================
 * INTERNATIONALIZATION (I18N) — Japanese / English
 * ============================================================================
 * Approach: use "the Japanese string itself as the key" to look up the English dictionary EN.
 * This keeps the Japanese source readable, and untranslated strings automatically fall back to
 * Japanese. Interpolation uses `{name}` placeholders (include {name} in the key string and
 * substitute via t(key, { name: value })).
 *
 * A pure module with no React/DOM dependency (it only handles the localStorage language
 * setting). It targets UI strings only; in-code comments stay in Japanese (CLAUDE.md convention).
 * ============================================================================
 */
export const LANG_KEY = "harigata.lang";

// Japanese→English. Keys are the Japanese as it appears in the UI (interpolation via {name}).
// Keys not present here are shown in Japanese as-is.
const EN = {
  // ---- Views / tabs ----
  "断面": "Section",
  "組立": "Assembly",
  "印刷": "Print",
  "点灯": "Lit",
  // ---- Header ----
  "張型": "Harigata",
  "スタジオ": "Studio",
  // ---- Toolbar ----
  "元に戻す": "Undo",
  "やり直し": "Redo",
  "初期化": "Reset",
  "すべての設定を初期状態に戻します。よろしいですか?": "Reset all settings to their defaults. Continue?",
  // ---- Section headings ----
  "形": "Shape",
  "シルエット": "Silhouette",
  "左右にドラッグで調整": "Drag left/right to adjust",
  "骨組み": "Frame",
  "プリントベッド": "Print bed",
  "竹ひご": "Bamboo",
  // ---- Preset names ----
  "たまご": "Egg",
  "球": "Sphere",
  "たる": "Barrel",
  // ---- Labels (scrub / stepper / input) ----
  "火袋の高さ": "Body height",
  "羽根板の枚数": "Rib count",
  "板厚": "Board thickness",
  "爪の長さ": "Tab length",
  "竹ひご径": "Bamboo dia.",
  "ひごピッチ": "Bamboo pitch",
  "幅": "Width",
  "奥行き": "Depth",
  "印刷する羽根板": "Ribs to print",
  " 枚": " pcs",
  // ---- Checkboxes / neck ----
  "下の首": "Bottom neck",
  "上の首": "Top neck",
  "首の高さ・張り出しは断面図の◇(最外の制御点)を上下/左右にドラッグ":
    "Drag the outermost ◇ in the section view (up/down = neck height, left/right = flare).",
  "羽根板を上下2分割": "Split rib top & bottom",
  "(大型用)": "(for large)",
  "⚠ 試験中: 分割部品の爪が現行のコマに嵌まりません(要修正)":
    "⚠ Experimental: split-part tabs don't fit the current koma (needs fixing).",
  "この開口・板厚では最大 {n} 枚(コマのノッチが重なるため)。板を薄くすると増やせます":
    "Up to {n} ribs at this opening/thickness (koma notches would overlap). Thinner boards allow more.",
  // ---- Paper template (cardboard) ----
  "型紙(段ボール)": "Paper template",
  "A4 原寸": "A4 · 1:1",
  "材料の厚み": "Material thickness",
  "型紙を開く (A4 原寸)": "Open template (A4, 1:1)",
  "新しいタブで開きます。「実際のサイズ(100%)」で印刷し、50mm スケールを定規で確認してください。竹ひご溝は切らず目盛線で示します。":
    "Opens in a new tab. Print at \"Actual size (100%)\" and check the 50mm scale with a ruler. Bamboo grooves are shown as tick marks, not cut.",
  // ---- Summary ----
  "最大径": "Max diameter",
  "羽根板の全長": "Rib length",
  " (2分割)": " (split)",
  "上下の開口(半径)": "Openings (radius)",
  // ---- CTA / export ----
  "STL 書き出し": "Export STL",
  "印刷・書き出しへ進む →": "Go to print / export →",
  "コマ・柱は上下同一のため各1つ入っています。スライサーで":
    "Koma and columns are identical top & bottom, so one of each is included. In your slicer, ",
  "2つに複製": "duplicate to two",
  "して印刷してください。設定は ": " and print them. Settings are bundled as ",
  " として同梱されます(バックアップ用)。": " (for backup).",
  // ---- Warnings / status ----
  "⚠ 3Dプレビューを初期化できませんでした": "⚠ Could not initialize the 3D preview",
  "お使いのブラウザで WebGL が無効の可能性があります。STLの生成・DLは引き続き利用できます。":
    "WebGL may be disabled in your browser. STL generation and download still work.",
  "羽根板 {n}mm": "Rib {n}mm",
  "連結板 {n}mm": "Connector {n}mm",
  "{parts} がベッド {w}×{d}mm を超過": "{parts} exceeds the {w}×{d}mm bed",
  "→ 火袋の高さを {h}mm 以下に": "→ Reduce body height to {h}mm or less",
  "鑑賞モード — 編集はタブで「断面」へ": "Viewing mode — switch to the Section tab to edit",
  // ---- Section editor (SectionEditor) ----
  "羽根板": "Rib",
  "首": "Neck",
  "火袋": "Body",
  "開口/首": "Opening/Neck",
  "点をドラッグで動かす · クリックで選択(右で数値·なめらか/角·削除) · 緑の＋で点を追加":
    "Drag a point to move it · click to select (edit values, smooth/corner, delete on the right) · add a point with the green +",
  // ---- Selected-point card (inspector) ----
  "選択中の点": "Selected point",
  "✥ 点を動かす": "✥ Move",
  "◠ カーブ調整": "◠ Curve",
  "張り出し(半径)": "Radius",
  "高さ位置": "Height position",
  "◇ なめらか": "◇ Smooth",
  "■ 角": "■ Corner",
  "この点を削除": "Delete this point",
  "断面図の点をクリックすると、数値・なめらか/角・削除がここに出ます。曲線上の緑の＋で点を追加できます。":
    "Click a point in the section view to edit its values, smooth/corner, and delete here. Add points with the green + on the curve.",
};

// Return the translation function for language `lang`. t(key, params?): for English, look up EN
// (falling back to Japanese if absent) and substitute {name} with params[name]. For Japanese,
// interpolate and return the key as-is.
export function makeT(lang) {
  const dict = lang === "en" ? EN : null;
  return (s, params) => {
    let out = dict && dict[s] != null ? dict[s] : s;
    if (params) for (const k in params) out = out.split("{" + k + "}").join(params[k]);
    return out;
  };
}

export function loadLang() {
  try { const v = localStorage.getItem(LANG_KEY); return v === "en" ? "en" : "ja"; } catch { return "ja"; }
}
export function saveLang(l) { try { localStorage.setItem(LANG_KEY, l); } catch { /* works even if saving fails */ } }
