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
 * setting). It targets UI strings only; in-code comments are in English (CLAUDE.md convention).
 * ============================================================================
 */

/** The two UI languages. Anything else in storage is not one, and loadLang folds it to "en". */
export type Lang = "ja" | "en";
/**
 * The translation function every component receives as `t`. The key is the Japanese string itself
 * (see CLAUDE.md "Conventions"), so this is `string`, not a union of known keys: keys are built by
 * template literal in several places, and a union would only move the check to where the string is
 * assembled — which is exactly what `npm run check:i18n` already does over the real source.
 */
export type T = (s: string, params?: Record<string, string | number>) => string;
export const LANG_KEY = "tomoshibi.lang";

// Japanese→English. Keys are the Japanese as it appears in the UI (interpolation via {name}).
// Keys not present here are shown in Japanese as-is.
const EN: Record<string, string> = {
  // ---- Views / tabs ----
  "断面": "Section",
  "組立": "Assembly",
  "印刷": "Print",
  "点灯": "Lit",
  // ---- Header ----
  // ---- Welcome / onboarding (first run, reopened from the "?" in the header) ----
  "はじめかた": "Getting started",
  "和紙提灯の「張型」をつくる": "Design the forming mold for a washi paper lantern",
  "断面を決める": "Draw the section",
  "◇ドラッグで形をつくる": "Drag the ◇ to shape the curve",
  "出力する": "Export it",
  "STL か 原寸の型紙": "STL, or a 1:1 paper template",
  "貼る": "Build it",
  "竹ひごを巻いて和紙を貼る": "Wind bamboo, paste the washi",
  "画面に映っているのは提灯そのものではなく、その上で組み立てる「型」です":
    "What you see is not the lantern itself — it is the mold the lantern is built on",
  "和紙の型紙(先に切っておく用・beta)は、どちらの出力にも付いてきます":
    "The washi template (beta) — for cutting the paper before pasting — comes with either output",
  "上のタブで「組立」「点灯」の見え方も確認できます。この案内は右上の「?」でいつでも開けます。":
    "The tabs above also show the assembly and the lantern lit. Reopen this with the \"?\" at the top right.",
  // ---- Welcome / the route choice (3D print vs cardboard) ----
  "どちらでつくりますか?": "How will you make it?",
  "後からいつでも変更できます": "Changeable at any time",
  "3Dプリンタ": "3D printer",
  "STL 一式をダウンロード": "Download the STL set",
  "A4 原寸の型紙を印刷 · 大きさの制限なし": "Print the A4 1:1 template · no size limit",
  "とりあえず見る": "Just look around",
  // ---- Toolbar ----
  "元に戻す": "Undo",
  "やり直し": "Redo",
  "初期化": "Reset",
  "すべての設定を初期状態に戻します。よろしいですか?": "Reset all settings to their defaults. Continue?",
  // ---- Section headings ----
  "形": "Shape",
  "ひな形 · 選んでから断面で調整": "Templates · pick one, then edit in the section view",
  "シルエット": "Silhouette",
  "ドラッグ / 値クリックで入力": "Drag or click the value to type",
  "骨組み": "Frame",
  "印刷・書き出し": "Print / export",
  "プリントベッド": "Print bed",
  "3Dプリント": "3D print",
  "段ボール": "Cardboard",
  "大きさの制限はありません。A4 に収まらない部品は次のページに続きます(両方を青い枠で切り、同じ番号の半ダイヤが◇になるよう突き合わせて裏からテープ)。":
    "There is no size limit: a part too big for A4 simply continues on the next page. Trim both sheets on the blue box, butt the cut edges until each pair of half-diamonds closes into a full ◇, and tape from behind.",
  "定番サイズ": "Common size",
  "カスタム": "Custom",
  "配置": "Layout",
  "竹ひご": "Bamboo",
  // ---- Preset names ----
  "たまご": "Egg",
  "たる": "Barrel",
  "平丸": "Flat round",
  // ---- Labels (scrub / stepper / input) ----
  "火袋の高さ": "Body height",
  "羽根板の枚数": "Rib count",
  "クリックで数値を入力": "Click to type a value",
  "板厚": "Board thickness",
  "爪の長さ": "Tab length",
  "竹ひご径": "Bamboo dia.",
  "ひごピッチ": "Bamboo pitch",
  "幅": "Width",
  "奥行き": "Depth",
  "印刷する羽根板": "Ribs to print",
  " 枚": " pcs",
  // ---- Checkboxes / neck ----
  "首の高さ・張り出しは断面図の◇(最外の制御点)を上下/左右にドラッグ":
    "Drag the outermost ◇ in the section view (up/down = neck height, left/right = flare).",
  "この開口・板厚では最大 {n} 枚(コマのノッチが重なるため)。板を薄くすると増やせます":
    "Up to {n} ribs at this opening/thickness (koma notches would overlap). Thinner boards allow more.",
  // ---- Paper template (cardboard) ----
  "型紙プレビュー · 全 {n} ページ": "Template preview · {n} pages",
  "画面上は原寸ではありません。PDF をダウンロードして原寸で印刷してください。":
    "Not to scale on screen — download the PDF and print it at 100%.",
  "型紙(段ボール)": "Paper template",
  "A4 原寸 · beta": "A4 1:1 · beta",
  "この出力は開発中です。寸法は3Dプリント版と同じ計算から出していますが、実際に組んだ報告がまだ少ないルートです。材料の厚みは必ず実測し、刷った紙の 50mm スケールを定規で確認してください。":
    "This output is still in development. Its dimensions come from the same maths as the 3D-printed parts, but far fewer people have actually built one this way. Measure your material's real thickness, and check the printed 50 mm scale bar with a ruler.",
  "材料の厚み": "Material thickness",
  "型紙 ZIP をダウンロード (A4 原寸)": "Download the template ZIP (A4, 1:1)",
  // The one line that stays out in the open under the cardboard CTA: a PDF is already A4 at exact
  // size, so the printer's own scaling is the only way left to lose that.
  "原寸 100% で印刷": "Print at 100%",
  "(「用紙に合わせる」は不可)": " — never \"fit to page\"",
  // The PDF's own title line. English on purpose: base-14 Helvetica cannot draw Japanese (see paperPDF).
  "TOMOSHIBI 段ボール型紙 {name} 原寸": "TOMOSHIBI cardboard template {name} (full scale)",
  // Printed on every sheet, so it has to survive winAnsi() — plain Latin-1 only (the arrow folds).
  "← 定規で確認": "<- check with a ruler",
  // ---- Summary ----
  "最大径": "Max diameter",
  "羽根板の全長": "Rib length",
  "上下の開口(半径)": "Openings (radius)",
  "開口": "Openings",   // compact footer: the short form of 上下の開口(半径)
  "設定パネル": "Settings panel",   // the bottom sheet's grabber, on a phone
  "表示": "View",              // aria-label of the narrow chip bar's view <select>
  "つくりかた": "How to make",   // aria-label of the narrow chip bar's route <select>
  // ---- CTA / export ----
  "STL 書き出し": "Export STL",
  "印刷・書き出しへ進む →": "Go to print / export →",
  // Miss this one and you print half a mold, so it is the line that is not folded away.
  "コマ・柱は各1つ。スライサーで": "One koma and one column only — in your slicer, ",
  "2つに複製": "duplicate to two",
  // The export's manifest, folded behind a disclosure and opened when the download happens.
  "同梱物": "In the ZIP",
  " — 型紙": " — the template",
  " — 和紙の型紙(原寸で印刷)": " — washi template (print at 100%)",
  " — 羽根板・コマ・土台・口輪": " — ribs, koma, stand, opening rings",
  " — 設計のバックアップ": " — design backup",
  // ---- Warnings / status ----
  "⚠ 3Dプレビューを初期化できませんでした": "⚠ Could not initialize the 3D preview",
  "お使いのブラウザで WebGL が無効の可能性があります。STLの生成・DLは引き続き利用できます。":
    "WebGL may be disabled in your browser. STL generation and download still work.",
  "{name} {n}mm": "{name} {n}mm",
  "柱": "Post",
  "連結板": "Connector",
  "開口リング": "Opening ring",
  // ---- Opening ring (kuchiwa) ----
  "完成品に残る輪": "stays in the finished lantern",
  "脚ソケット(下)": "Leg sockets (bottom)",
  "この開口には脚ソケットが入りません(下の輪のみになります)。開口を広げると入ります":
    "No room for leg sockets at this opening (the bottom ring stays a plain hoop). A wider opening will fit them.",
  "{parts} がベッド {w}×{d}mm を超過": "{parts} exceeds the {w}×{d}mm bed",
  "→ 火袋の高さを {h}mm 以下に": "→ Reduce body height to {h}mm or less",
  "コマの溝と溝の壁が {wall}mm — 手で切ると裂けやすい細さです": "Only {wall}mm of koma left between notches — thin enough to tear when hand-cut",
  "→ 羽根板を減らす / 薄い材料にする / 断面図で開口を広げる": "→ Fewer ribs / thinner material / widen the opening in the section view",
  // The rib has to come back out of the shade it shaped, through one of the two openings. "抜けません"
  // is about the finished lantern, not about the print, so the English says come out rather than fit.
  "羽根板の幅 {w}mm — 開口 ⌀{d}mm から抜けません": "The rib is {w}mm wide — it cannot come out of the ⌀{d}mm opening",
  "→ 断面図で開口を広げる / ふくらみを抑える": "→ Widen the opening in the section view / flatten the bulge",
  "鑑賞モード — 編集はタブで「断面」へ": "Viewing mode — switch to the Section tab to edit",
  // ---- Section editor (SectionEditor) ----
  "羽根板": "Rib",
  "首": "Neck",
  "火袋": "Body",
  "開口/首": "Opening/Neck",
  // Legend at the bottom-left of the section view (glyph / verb / description columns).
  // Keep the description column short — it sits next to a fixed-width verb column in a corner card.
  "点の操作": "Editing the points",
  "カーブ調整中": "Curve mode",
  "ドラッグ": "Drag",
  "クリック": "Click",
  "ふくらみを変える": "Reshape the curve",
  "選ぶ → 右パネルで編集": "Select → edit on the right",
  "点を増やす": "Add a point",
  "点は動きません(「点を動かす」へ)": "Points stay put (switch to Move)",
  "カーブの向き・強さ": "Curve angle & tension",
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
  // ---- Toolbar / save & load ----
  "編集": "Edit",
  "すべての設定を初期状態に戻す": "Reset all settings to defaults",
  "保存": "Save",
  "書き出す": "Export",
  "設計を JSON ファイルに保存": "Save the design to a JSON file",
  "読み込む": "Import",
  "設計 JSON ファイルから復元": "Restore the design from a JSON file",
  "設計ファイルを読み込めませんでした(JSON が壊れています)。": "Couldn't load the design file (the JSON is corrupted).",
  // ---- Spiral winding ----
  "螺旋巻き": "Spiral winding",
  "(溝を下へ連続させる)": "(grooves descend continuously)",
  "螺旋: 全": "Spiral: all ",
  "枚(各1枚)": " (one file each)",
  // ---- Papercraft (cardboard) ----
  "コマ": "Koma",
  // Kept short: it shares the bottom band with the right-aligned footer, and the PDF draws the
  // English text at the same size (a longer line collides with the footer).
  // ---- Washi template (cut the paper before pasting) ----
  "和紙": "Washi",
  "羽根板の間 1面分 · beta": "one rib-to-rib panel · beta",
  "のりしろ(左右)": "Overlap (sides)",
  "被せ代(上下)": "Cover (ends)",
  "1面のサイズ": "Panel size",
  "貼る前に和紙を切るための原寸型紙です。どちらの出力にも別 PDF で同梱されます。":
    "A full-scale template for cutting the washi before you paste it. Either output bundles it as its own PDF.",
  "この型紙は検証中です。全面を切る前に、まず 1 面だけ合わせてみてください。":
    "Still being verified: cut one panel and offer it up before you cut them all.",
  "TOMOSHIBI 和紙型紙 {name} 原寸": "TOMOSHIBI washi template {name} (full scale)",
};

// Return the translation function for language `lang`. t(key, params?): for English, look up EN
// (falling back to Japanese if absent) and substitute {name} with params[name]. For Japanese,
// interpolate and return the key as-is.
export function makeT(lang: Lang): T {
  const dict = lang === "en" ? EN : null;
  return (s, params) => {
    let out = dict && dict[s] != null ? dict[s] : s;
    if (params) for (const k in params) out = out.split("{" + k + "}").join(String(params[k]));
    return out;
  };
}

// Default to English; a saved "ja" keeps Japanese. First-time visitors see English.
export function loadLang(): Lang {
  try { const v = localStorage.getItem(LANG_KEY); return v === "ja" ? "ja" : "en"; } catch { return "en"; }
}
export function saveLang(l: Lang): void { try { localStorage.setItem(LANG_KEY, l); } catch { /* works even if saving fails */ } }
