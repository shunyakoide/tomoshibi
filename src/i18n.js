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
  "スタンド帯": "Stand strip",
  "下スロット": "bottom slot",
  "上スロット": "top slot",
  "▼ここから下は次のページと重なります(のりしろ)": "▼ From here down overlaps the next page (glue tab)",
  "50mm ← 定規で確認(合わなければ「実際のサイズ/100%」で印刷し直し)": "50mm ← check with a ruler (if it's off, reprint at \"Actual size / 100%\")",
  "張型スタジオ 型紙 {name} 原寸": "Harigata Studio papercraft {name} (full scale)",
  "⚠ コマの<b>溝と溝の間の壁が {wall}mm</b> しかありません(溝の幅は材料厚どおりの {matT}mm)。手で切ると裂けやすい細さです。太くするには <b>羽根板の枚数を減らす</b>・<b>薄い材料にする</b>・断面図で<b>開口を広げてコマを大きくする</b> のいずれかが効きます。": "⚠ The koma has <b>only {wall}mm of wall between grooves</b> (groove width matches the material at {matT}mm). That's thin enough to tear when hand-cut. To thicken it: <b>reduce the number of ribs</b>, <b>use thinner material</b>, or in the section view <b>widen the opening to make the koma larger</b>.",
  "⚠ 爪の長さ({tabLen}mm)が材料厚({matT}mm)に対して短いため、<b>上端の爪のストッパ(段)が作れませんでした</b>。コマが内側へずれ落ちるのを形で止められません。「爪の長さ」を材料厚の 2倍以上({min}mm 程度)にすると段が付きます。": "⚠ The tab length ({tabLen}mm) is short for the material thickness ({matT}mm), so <b>the stopper (shelf) on the top tab could not be made</b>. Nothing in the shape stops the koma from sliding inward. Set \"Tab length\" to at least twice the material thickness (around {min}mm) and the shelf appears.",
  "⚠ 材料厚 {matT}mm では羽根板は最大 {nMax} 枚です(溝が広がり、コマの中心で溝どうしが重なるため)。{boards} 枚 → <b>{nMax} 枚</b>に減らして出力しました。枚数を保ちたい場合は薄い材料を使ってください。": "⚠ At {matT}mm material thickness, at most {nMax} ribs fit (the grooves widen and overlap at the koma's center). Exported with {boards} reduced to <b>{nMax} ribs</b>. To keep the count, use thinner material.",
  "張型スタジオ — 段ボール用 型紙({name} 原寸 / 全 {pages} ページ)": "Harigata Studio — cardboard papercraft ({name} full scale / {pages} pages)",
  "印刷 / PDFで保存": "Print / Save as PDF",
  "HTMLで保存": "Save as HTML",
  "PDF が欲しいときは、印刷ダイアログの<b>「送信先」を「PDFに保存」</b>にしてください。": "For a PDF, set the print dialog's <b>Destination to \"Save as PDF\"</b>.",
  "いずれの場合も<b>「実際のサイズ / 100%」「余白: なし」</b>を選び、「用紙に合わせる」は外してください。": "Either way, choose <b>\"Actual size / 100%\" and \"Margins: none\"</b>, and turn off \"Fit to page\".",
  "<b>「実際のサイズ / 100%」で印刷</b>してください(「用紙に合わせる」は禁止)。刷ったら各ページ下の <b>50mm スケール</b>を定規で必ず確認。": "<b>Print at \"Actual size / 100%\"</b> (\"Fit to page\" is not allowed). After printing, always check the <b>50mm scale</b> at the bottom of each page with a ruler.",
  "ページを跨ぐ部品は、<b>のりしろ(灰色の破線より下)</b>を次ページに重ね、四隅のトンボを合わせて貼り合わせます。": "For parts that span pages, overlap the <b>glue tab (below the gray dashed line)</b> onto the next page and align the registration crosses in the four corners.",
  "紙を段ボールに貼り、<b>実線だけ</b>を切り抜きます。<b>破線の目盛は切りません</b> — 竹ひごを巻く位置の印です。": "Glue the paper to cardboard and cut out <b>only the solid lines</b>. <b>Do not cut the dashed ticks</b> — they mark where the bamboo ribs wind.",
  "段ボールの<b>波の向き(目)は羽根板の長手方向</b>に合わせると折れにくくなります。": "Aligning the cardboard's <b>flute direction with the rib's long axis</b> makes it less likely to fold.",
  "材料厚 <code>{matT}mm</code> 前提でコマの溝の幅を決めています。実測厚と違うと嵌まりません(緩い/入らない)。": "The koma notch width assumes a material thickness of <code>{matT}mm</code>. If your measured thickness differs, it won't fit (too loose / won't go in).",
  "コマ2枚は<b>同一形状</b>です(上下で同じものを使います)。": "The two koma are <b>identical</b> (use the same one top and bottom).",
  "組み立て: 羽根板の爪を上下2枚のコマに放射状に差し込みます。上端の爪の内側にある<b>段(ストッパ)</b>が、上のコマが内側へ入り込むのを止めます。差し込みが緩ければ接着してください。": "Assembly: plug the rib tabs radially into the two koma. The <b>shelf (stopper)</b> on the inner side of the top tab stops the top koma from sliding inward. If the fit is loose, glue it.",
  "<b>スタンド(帯2枚)</b>: 中央のスロットを噛み合わせて<b>X字に立て</b>ます(一方は上から、一方は下からスロットを切ってあるので直交して組めます)。上辺のV字に<b>下のコマの縁を載せる</b>と、型が立って腹(最大径)が宙に浮き、竹ひごや和紙の作業が全周からできます。ぐらつく場合は接着してください。": "<b>Stand (two strips)</b>: interlock the central slots to <b>stand them in an X</b> (one slot is cut from the top, the other from the bottom, so they cross). Rest the <b>bottom koma's rim</b> in the V-notches on the top edges; the mold then stands with its belly (max diameter) floating free, so you can work the bamboo and washi all the way around. If it wobbles, glue it.",
  "火袋の高さ {height}mm / 羽根板 {boards}枚 / 竹ひごピッチ {pitch}mm — この帯は画面表示だけで、印刷はされません。": "Body height {height}mm / {boards} ribs / bamboo pitch {pitch}mm — this band is on-screen only and is not printed.",
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

// Default to English; a saved "ja" keeps Japanese. First-time visitors see English.
export function loadLang() {
  try { const v = localStorage.getItem(LANG_KEY); return v === "ja" ? "ja" : "en"; } catch { return "en"; }
}
export function saveLang(l) { try { localStorage.setItem(LANG_KEY, l); } catch { /* works even if saving fails */ } }
