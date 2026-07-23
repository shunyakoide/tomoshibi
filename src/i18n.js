/**
 * ============================================================================
 * 多言語化 (I18N) — 日本語 / 英語
 * ============================================================================
 * 方式: 「日本語の文字列そのものをキー」にして英語辞書 EN を引く。日本語ソースの可読性を
 * 保ち、未訳は日本語へ自動フォールバックする。補間は `{name}` プレースホルダで行う
 * (キー文字列に {name} を含め、t(key, { name: 値 }) で置換)。
 *
 * React/DOM 非依存の純粋モジュール(localStorage の言語設定のみ扱う)。UI 文字列だけを
 * 対象にし、コード内コメントは日本語のまま(CLAUDE.md 規約)。
 * ============================================================================
 */
export const LANG_KEY = "harigata.lang";

// 日本語→英語。キーは UI に現れる日本語(補間は {name})。ここに無いキーは日本語のまま出る。
const EN = {
  // ---- ビュー / タブ ----
  "断面": "Section",
  "組立": "Assembly",
  "印刷": "Print",
  "点灯": "Lit",
  // ---- ヘッダー ----
  "張型": "Harigata",
  "スタジオ": "Studio",
  // ---- ツールバー ----
  "元に戻す": "Undo",
  "やり直し": "Redo",
  "初期化": "Reset",
  "すべての設定を初期状態に戻します。よろしいですか?": "Reset all settings to their defaults. Continue?",
  // ---- セクション見出し ----
  "形": "Shape",
  "シルエット": "Silhouette",
  "左右にドラッグで調整": "Drag left/right to adjust",
  "骨組み": "Frame",
  "プリントベッド": "Print bed",
  "竹ひご": "Bamboo",
  // ---- プリセット名 ----
  "たまご": "Egg",
  "球": "Sphere",
  "たる": "Barrel",
  // ---- ラベル(スクラブ / ステッパ / 入力) ----
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
  // ---- チェックボックス / 首 ----
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
  // ---- 型紙(段ボール) ----
  "型紙(段ボール)": "Paper template",
  "A4 原寸": "A4 · 1:1",
  "材料の厚み": "Material thickness",
  "型紙を開く (A4 原寸)": "Open template (A4, 1:1)",
  "新しいタブで開きます。「実際のサイズ(100%)」で印刷し、50mm スケールを定規で確認してください。竹ひご溝は切らず目盛線で示します。":
    "Opens in a new tab. Print at \"Actual size (100%)\" and check the 50mm scale with a ruler. Bamboo grooves are shown as tick marks, not cut.",
  // ---- サマリー ----
  "最大径": "Max diameter",
  "羽根板の全長": "Rib length",
  " (2分割)": " (split)",
  "上下の開口(半径)": "Openings (radius)",
  // ---- CTA / 書き出し ----
  "STL 書き出し": "Export STL",
  "印刷・書き出しへ進む →": "Go to print / export →",
  "コマ・柱は上下同一のため各1つ入っています。スライサーで":
    "Koma and columns are identical top & bottom, so one of each is included. In your slicer, ",
  "2つに複製": "duplicate to two",
  "して印刷してください。設定は ": " and print them. Settings are bundled as ",
  " として同梱されます(バックアップ用)。": " (for backup).",
  // ---- 警告 / 状態 ----
  "⚠ 3Dプレビューを初期化できませんでした": "⚠ Could not initialize the 3D preview",
  "お使いのブラウザで WebGL が無効の可能性があります。STLの生成・DLは引き続き利用できます。":
    "WebGL may be disabled in your browser. STL generation and download still work.",
  "羽根板 {n}mm": "Rib {n}mm",
  "連結板 {n}mm": "Connector {n}mm",
  "{parts} がベッド {w}×{d}mm を超過": "{parts} exceeds the {w}×{d}mm bed",
  "→ 火袋の高さを {h}mm 以下に": "→ Reduce body height to {h}mm or less",
  "鑑賞モード — 編集はタブで「断面」へ": "Viewing mode — switch to the Section tab to edit",
  // ---- 断面エディタ(SectionEditor) ----
  "羽根板": "Rib",
  "首": "Neck",
  "火袋": "Body",
  "開口/首": "Opening/Neck",
  "点をドラッグで動かす · クリックで選択(右で数値·なめらか/角·削除) · 緑の＋で点を追加":
    "Drag a point to move it · click to select (edit values, smooth/corner, delete on the right) · add a point with the green +",
  // ---- 選択中の点カード(インスペクタ) ----
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

// 言語 lang の翻訳関数を返す。t(key, params?): 英語なら EN を引き(無ければ日本語)、
// {name} を params[name] で置換する。日本語は key をそのまま補間して返す。
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
export function saveLang(l) { try { localStorage.setItem(LANG_KEY, l); } catch { /* 保存不可でも動く */ } }
