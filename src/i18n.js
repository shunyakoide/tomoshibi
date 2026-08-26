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
export const LANG_KEY = "tomoshibi.lang";

// Japanese→English. Keys are the Japanese as it appears in the UI (interpolation via {name}).
// Keys not present here are shown in Japanese as-is.
const EN = {
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
  "プリンタの設定は「実際のサイズ / 100%」にしてください(「用紙に合わせる」は不可)。":
    "Set your printer to \"Actual size / 100%\" (never \"fit to page\").",
  " は別 PDF として同梱されます(そのまま原寸で印刷)。": " is bundled as a separate PDF (print it at 100% as-is).",
  // The PDF's own title line — it becomes the document title, which a viewer shows in its window.
  "TOMOSHIBI 段ボール型紙 {name} 原寸": "TOMOSHIBI cardboard template {name} (full scale)",
  // Printed on every sheet. Both languages reach paper now (the writer carries outlines for the
  // Japanese), so keep both SHORT: the note shares its band with the right-aligned footer.
  "← 定規で確認": "<- check with a ruler",
  // ---- Summary ----
  "最大径": "Max diameter",
  "羽根板の全長": "Rib length",
  "上下の開口(半径)": "Openings (radius)",
  // ---- CTA / export ----
  "STL 書き出し": "Export STL",
  "印刷・書き出しへ進む →": "Go to print / export →",
  "コマ・柱は上下同一のため各1つ入っています。スライサーで":
    "Koma and columns are identical top & bottom, so one of each is included. In your slicer, ",
  "2つに複製": "duplicate to two",
  "して印刷してください。設定は ": " and print them. Settings are bundled as ",
  " として同梱されます(バックアップ用)。": " (for backup).",
  "和紙の型紙 ": "The washi template ",
  " も同梱されます(そのまま原寸で印刷)。": " is bundled too (print it at 100% as-is).",
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
  // Kept short: it shares the bottom band with the right-aligned footer, and the PDF draws either
  // language at the same size (a longer line collides with the footer).
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

  // ---- Assembly guide (the 作り方 view) ----
  // Body text is long by the standards of this file: it is the only place in the app that explains a
  // hand movement rather than labelling a control, and it is read once, away from the screen.
  "作り方": "Guide",
  "組立説明書": "Assembly guide",
  "3Dプリントで型をつくる": "Build the mold by 3D printing",
  "段ボールで型をつくる": "Build the mold from cardboard",
  // The figures draw one representative lantern and the page prints no dimensions at all, so the
  // lead says so — a reader who counts eight ribs in every picture has to be told they are not a
  // specification. See the GuidePage header.
  "型を組み、竹ひごを巻き、和紙を貼って、乾いたら型を抜く。図は一例で、大きさや枚数は設計によって変わります。":
    "Assemble the mold, wind the bamboo, paste the washi, and pull the mold once it is dry. The figures show one example — sizes and counts follow your own design.",
  "設計した枚数": "per your design",
  "部品": "Parts",
  "手順": "Steps",
  "支柱": "Post",
  "土台": "Base",
  "口輪(下)": "Ring (bottom)",
  "口輪(上)": "Ring (top)",
  "編集中": "draft",
  "図を描けませんでした": "Figure unavailable",
  // The folded detail block (GuidePage's `more`). "In detail" rather than "More": what is inside is
  // the same step gone into further, not extra material — and the summary sits under a body that
  // has already said what to do.
  "詳しく": "In detail",
  // The well while the photograph has not been taken. It names the file it is waiting for beside
  // this word, so the word carries no colon or ellipsis of its own.
  "写真": "Photo",
  "段ボールの型には支柱・土台・口輪はありません(型紙は型そのものだけです)。回すときは手で持つか、箱などに載せてください。":
    "The cardboard mold has no posts, base or rings — the template cuts the mold itself. Hold it in your hands as you turn it, or rest it on a box.",
  "「印刷」ビューへ →": "Go to the Print view →",
  "部品をつくる": "Make the parts",
  "「印刷」ビューから STL を書き出し、羽根板・コマ・支柱・土台・口輪を印刷します。コマと支柱は上下で同じ部品なので、スライサーで2つに複製してください。":
    "Export the STLs from the Print view and print the ribs, koma, posts, base and rings. The koma and the posts are the same part top and bottom, so duplicate each one in your slicer.",
  "「印刷」ビューから型紙 ZIP をダウンロードし、原寸(100%)で刷ります。段ボールに貼るか下敷きにして、線のとおりに切り出します。刃は新しいものを。":
    "Download the template ZIP from the Print view and print it at 100%. Glue the sheets to the cardboard or slip them underneath, and cut along the lines. Use a fresh blade.",
  "土台を組む": "Assemble the stand",
  "土台のスリットに支柱の爪をまっすぐ差し込みます。肩が襟の上面に当たるまで押し込めば正しい深さです。2本とも、くぼみを上に向けて同じ向きに。":
    "Push each post straight down into its slot in the base. When the shoulders meet the top of the collar it is in far enough. Both posts face the same way, saddle up.",
  "コマに羽根板を差す": "Plug the ribs into a koma",
  "コマを平らに置き、まわりのノッチに羽根板の爪を差し込みます。爪の先の欠きがコマの内側に噛むので、奥まで入れば止まります。太い側の向きをすべて揃えてください。":
    "Lay one koma flat and plug a rib tab into each notch around it. The notch at the tip of the tab catches the koma's hub, so a tab that is all the way in stops there. Point every rib's wider end the same way.",
  "もう1枚のコマをかぶせる": "Cap it with the second koma",
  "反対側の爪をすべてノッチに合わせてから、コマを平行に押し下げます。1か所ずつ入れると割れやすいので、全体を少しずつ。上下のコマは同じ部品です。":
    "Line every tab up with a notch first, then press the koma down flat. Seating one tab at a time is what cracks them — work around the whole circle a little at a time. The two koma are the same part.",
  "土台に載せる": "Set it in the stand",
  "型を横向きにして、両端のコマを支柱のくぼみに載せます。こうすると型が回るので、1面貼っては回し、を繰り返せます。まず手で1回転させて、振れや引っかかりがないか確認してください。":
    "Turn the mold on its side and rest a koma in each post's saddle. Now it turns: paste one panel, roll it round, paste the next. Spin it once by hand first and check that it runs true and catches on nothing.",
  "竹ひごを巻く": "Wind the bamboo",
  "羽根板の外縁の溝に竹ひごを沿わせ、下から上へ巻いていきます。溝が受けるので滑り落ちません。「螺旋巻き」で設計した型なら、溝が段ごとにずれていて1本の連続した螺旋になります。":
    "Lay the bamboo into the grooves on the ribs' outer edges and wind upward from the bottom. The grooves hold it, so it cannot slip. If you designed with spiral winding, they step round rib by rib and the bamboo becomes one continuous helix.",
  "溝は等間隔に切ってあるので、巻きながら間隔を測る必要はありません。溝の返しは胴の中央を向いているので、竹ひごは中央へ寄せるように押しつけると座ります。螺旋巻きの型は羽根板ごとに溝がずれています。羽根板に刻まれた通し番号の順に組んであれば、そのまま1本の連続した螺旋になります。":
    "The grooves are cut evenly spaced, so there is nothing to measure as you wind. Each barb leans toward the middle of the body, so press the bamboo towards the middle and it seats. On a spiral mold the grooves step round from rib to rib — assemble them in the order of the serial numbers cut into them and the winding falls into one continuous helix on its own.",
  "和紙を貼る": "Paste the washi",
  "でんぷん糊を竹ひごに置き、和紙をのせて刷毛で撫でて密着させます。羽根板と羽根板の間を1面ずつ、1つ飛ばしに。一周したら戻って間を埋めます — 縁を重ねる相手が濡れていない面になります。和紙の型紙(ZIP に同梱)で先に切っておくと、濡れた紙を切らずに済みます。":
    "Dab starch paste onto the bamboo, lay the washi over it and stroke it down with a brush. Work one rib-to-rib panel at a time, skipping every other bay; go round once, then come back and fill the gaps — each overlap then lands on a panel that is no longer wet. Cut the paper first with the washi template in the ZIP — trimming it wet is the fiddly part.",
  "乾かす": "Let it dry",
  "糊と和紙が完全に乾くまで置きます。乾くと紙が張って形が決まります。急がないこと — 生乾きで型を抜くと歪みます。":
    "Leave it until the paste and the paper are completely dry. Drying is what pulls the paper taut and sets the shape. Do not rush it: pulling the mold from a damp shade warps it.",
  "型を抜く": "Pull the mold",
  "コマを爪先の側(外向き)へ抜き、羽根板を開口から1枚ずつ引き出します。羽根板の内側は中央がえぐってあるので、開口より小さくなって抜けます。口輪は提灯側に残ります。はみ出した和紙は開口の縁で切り揃えてください。":
    "Draw each koma off outward, the way the tabs point, then take the ribs out through the opening one at a time. Their inner edges are hollowed at the middle, which is what lets them pass through a mouth narrower than they are. The rings stay behind with the lantern; trim the overhanging washi at the rim.",
  "口輪をはめる": "Fit the opening rings",
  "上下の開口に口輪をはめます。内径が開口に合わせてあるので、羽根板の外側にすっと入ります。口輪も組んだ型も、まだ何にも留まっていません。輪ゴムやクリップで押さえてください(コマのすぐ外側に輪ゴムを1本ずつ巻くと羽根板の開きも揃います)。和紙は端の被せ代をこの口輪に折り返して貼るため、口輪は型を抜いたあとも提灯に残ります。脚ソケットが付いている方が下です。":
    "Slip a ring over each opening. Their bore follows the opening, so they drop onto the ribs' outer edge. Nothing holds either the rings or the assembly yet, so use rubber bands or clips — a band round the tabs just outside each koma also evens out how far the ribs splay. The washi's cover allowance is folded over the rings when you paste, which is why they stay in the lantern after the mold comes out. The one with the leg sockets is the bottom.",
  "灯りをつける": "Put a light in it",
  "灯具の付け方は{n}通りあります。どれを選んでも電球は和紙のすぐ内側に来るので、熱を持ちにくい LED にしてください。":
    "There are {n} ways to light it. Whichever you pick, the bulb sits just inside the washi, so use an LED rather than a filament bulb.",
  "未記入": "Not written yet",
  "材料と道具": "Materials and tools",
  "材料": "Materials",
  "道具": "Tools",
  // One entry serves the inspector's section heading and the kit card both: the dictionary is keyed
  // by the Japanese, so a word cannot have two translations. (It had two — "Bamboo" for the panel,
  // "Bamboo ribs" for the card — and the second silently retranslated the first. See check:i18n.)
  "竹ひご": "Bamboo ribs",
  "ワイヤー": "Wire",
  "任意": "optional",
  "脚を付けるか吊るす場合": "for the legs or for hanging it",
  "ワイヤーを曲げる": "for bending the wire",
  "のり": "Paste",
  "でんぷんのり、または木工用ボンド": "starch paste or wood glue",
  "テープや糸など": "Tape, thread, or the like",
  "竹ひごを留める": "holds the bamboo in place",
  "のりを塗るはけ": "Brush for the paste",
  "障子貼り用の糊刷毛など": "a paste brush for shoji paper, or similar",
  "紙を張るブラシ": "Brush for laying the paper",
  "靴磨き用など": "a shoe brush, or similar",
  "霧吹き": "Spray bottle",
  "貼るときと、貼ったあとに": "As you paste, and again after",
  "ペンチ": "Pliers",
  "カミソリ": "Razor blade",
  "はみ出した和紙を切る": "trims the washi that overhangs",
  "ライト": "Lamp",
  "熱を持ちにくい LED のもの": "an LED one, so it stays cool",
  "置いたライトに被せる": "Cover a lamp you stand on the floor",
  "LED ライトを床に置き、上からシェードを被せます。脚も金具も要りません。ライトは下の開口を通る大きさのものを。":
    "Stand an LED lamp on the floor and drop the shade over it. No legs, no fittings. Pick a lamp that fits through the bottom opening.",
  "上から吊るす": "Hang it from above",
  // Hanging. One wire, bowed into an arch over the top opening: the SOCKET hangs in the U bent
  // into its middle (the gap passes the cord and stops the socket) and the shade hangs on the
  // wire, whose ends drape over the rim. 「吊り線」 is that wire once it is bent for the job — the
  // material is 「ワイヤー」 on the kit list, and the two words have to stay in their places or the
  // page is naming one thing twice.
  "ソケットを大きいほうの開口から入れ、コードを上の開口から出します。吊り線1本のUにコードを入れてソケットを引っ掛け、両端を上の開口の縁の下に入れます。":
    "Put the socket in through the wider opening and bring the cord out of the top one. Drop the cord into the U of one hanger so the socket catches in it, and tuck the hanger's two ends under the rim of the top opening.",
  "上の開口の大きさによっては安定しないことがあります。長さや曲げ方は現物に合わせて調整してください。":
    "Depending on how big the top opening is, it may not sit steadily. Adjust the length and the bends to suit the lantern you have made.",
  "吊り線を曲げる": "Bend the hanger",
  "ワイヤーの中央をUの字に曲げます。間はコードが通ってソケットが通らない幅に。中央が高くなるようゆるい弧に曲げ、両端は上の開口の縁の下を通って外まで出る長さに伸ばします。":
    "Bend the middle of the wire into a U, its gap wide enough to pass the cord and narrow enough to stop the socket. Bow the wire into a shallow arch, highest in the middle, and leave the two ends long enough to pass under the rim of the top opening and out the other side.",
  "ソケットを引っ掛ける": "Hang the socket in it",
  "Uにコードを入れると、ソケットが引っ掛かります。両端は上の開口の縁の下に入れます。":
    "Drop the cord into the U and the socket catches in it. Tuck the two ends under the rim of the top opening.",
  "脚を付けて下から留める": "Add legs and fix it from below",
  "段ボールの型では口輪を刷りません。下の開口に厚紙で輪をつくって貼り、脚の先を挿す穴を3ヶ所あけておきます。あとは同じで、脚を付けたライトを下の開口から差し入れて立て、コードは脚のあいだから逃がします。":
    "The cardboard route prints no opening ring. Make one from card, glue it into the bottom opening and pierce three holes in it for the leg ends. The rest is the same: take the lamp with its legs on it in through the bottom opening to stand it up, and run the cord out between the legs.",
  "脚を付けたライトを下の開口から差し入れ、脚の先を下の口輪の脚ソケットに挿して立てます。コードは脚のあいだから下へ逃がします。":
    "Take the lamp with its legs on it in through the bottom opening and push the leg ends into the bottom ring's leg sockets to stand it up. The cord runs down and out between the legs.",
  // The wire work under that one. ネジ is the socket's threaded stem and ナット the fixing nut
  // that runs on it — one pair of words, so the three sub-steps have to keep calling them the same
  // thing in both languages or the reader loses which part is which between figures.
  // Not 「ワイヤーを曲げる」 for this one: that is already the pliers' line on the kit list, where
  // it reads "for bending the wire" — a note about when you need the tool, not an instruction.
  // The dictionary is keyed by the Japanese, so one wording cannot carry both (check:i18n).
  "脚を曲げる": "Bend the legs",
  "ペンチで先端を輪に曲げます。輪はソケットのネジが通る大きさに。残りは外へ渡してから下へ折り、床に届く長さにします。3本とも同じ形に。":
    "Bend a loop in one end with the pliers, big enough to pass over the socket's threaded stem. Take the rest outward, then turn it down and cut it long enough to reach the floor. All three the same shape.",
  "ネジに通す": "Onto the stem",
  "ソケットの固定ナットを外し、3本の輪をネジに重ねて通します。脚が120°ずつ開くように向きを揃えてください。":
    "Take the socket's fixing nut off and stack the three loops on the stem. Set them so the legs come out 120° apart.",
  "ナットで締める": "Tighten the nut",
  "ナットを戻して締めます。これでライトと3本の脚が1つになります。":
    "Run the nut back up and tighten it. The lamp and its three legs are now one piece.",
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
