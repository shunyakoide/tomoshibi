<p align="center">
  <img src="public/mark-512-transparent.png" alt="" width="88" />
</p>

# 灯 Tomoshibi — washi lantern molds

A browser-based generator for the **3D-printable forming mold ("harigata")** used to
build **washi paper lanterns** (paper lamps).

Shape the lantern's silhouette parametrically in your browser, then export
print-ready STL parts. No backend — everything runs client-side, and the build
output is static files.

> **灯 Tomoshibi** — 和紙提灯（紙のランプ）を自作するための
> **3Dプリント用「張型（はりがた）」ジェネレーター**。ブラウザ上で断面を直接編集し、
> 印刷用の STL を書き出せます。

**→ [Open the app](https://shunyakoide.github.io/tomoshibi/)** — nothing to install; it runs entirely in the browser.

---

## What it makes

Real paper lanterns are made by **winding bamboo ribs around a mold, pasting washi
over them, letting it dry, then disassembling the mold and pulling it out through the
opening**. This app generates that mold as 3D-printable split parts.

| Part | Role |
| --- | --- |
| **Rib (羽根板)** | The radial boards that form the mold surface (N of them, like orange segments). The outer edge carries the lamp-body curve and V-notch grooves for the bamboo ribs; both ends have tabs. |
| **Koma / hub (コマ)** | Two identical gear-like hubs (top & bottom). Notches around the rim hold the rib tabs; the stand cradles them. |
| **Stand (土台)** | A base that holds the assembled mold off the table with two U-shaped saddles, so it can be rotated while you work. |
| **Opening rings (口輪)** | Thin flat hoops for the finished lantern's openings, which have no koma left in them, so the openings keep their shape. The **bottom one can carry leg sockets** — three flat pads inside the hoop, each with a 6mm bore, for standing the finished lantern on legs of your own. Where the opening is too small for them it falls back to a plain hoop with a small tab on its inner rim, which tells the two apart once printed. |

### Features

- **Direct-manipulation section editor** — drag control points to sculpt the silhouette; 3D preview and STL stay in exact agreement.
- **Bamboo-rib grooves** — evenly spaced V-notches with barbs so the bamboo seats and won't slip.
- **Spiral winding (螺旋巻き)** — optional mode that offsets grooves per rib so the bamboo forms one continuous descending helix. Each rib is then unique, so it's exported as a separate STL and **engraved with its serial number** (7-segment cut) so you can place them in order.
- **Cardboard papercraft mode** (beta) — for those without a 3D printer: full-scale (1:1) A4 print pages to cut the ribs and koma hubs from cardboard. Notch widths follow the thickness you measured, so the parts still mesh.
- **Washi template (和紙の型紙)** — the paper skin itself, developed flat: one rib-to-rib panel at full scale, so you cut the washi *before* pasting instead of trimming it after. Includes the side overlap, the cover allowance past the openings, and dashed guides for the rib lines and bamboo positions. It ships with whichever output you choose — a PDF in the STL kit ZIP, or one more sheet in the cardboard template.
- **English / Japanese UI** — toggle in the top bar.
- **Watertight by construction** — every exported part is a closed manifold, verified by an automated sweep (see [CONTRIBUTING](CONTRIBUTING.md)).

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:8173  (served with --host, so a phone on the
                   # same Wi-Fi can open http://<your-computer-ip>:8173 )
npm run build      # production build into dist/
npm run preview    # preview the built output on http://localhost:8174
```

Requires **Node.js 20.19+** (or 22.13+, or 24+). Vite 8 and ESLint 10 both refuse
anything older, so on Node 18 the install fails rather than degrading.

---

## Using it

- **Top tabs** — switch between **Section / Assembly / Print / Lit** views.
- **Right panel** — pick a preset, then drag the section's control points to reshape; open the accordions (Frame, Bamboo, Print bed…) for finer settings.
- **Preview** — drag to orbit, wheel / pinch to zoom.
- **Export** — the Print view downloads a ZIP of every part as separate STLs, plus a `config.json` backup of your design. (STL compresses well: a default kit is about 190 KB zipped.)
- **If you're lost** — a card on your first visit says what the object on screen actually is (the mold, not the lantern); the **?** in the panel header reopens it any time. The legend at the bottom-left of the section view redraws the ◇ marks themselves, and follows the edit mode you are in.

### From print to lantern

1. Print the parts. Push the rib tabs into the two koma hubs' notches.
2. Set the assembly on the stand.
3. Wind bamboo ribs into the outer-edge grooves; paste washi paper over them.
4. Let it dry, then pull the koma out (toward the tab side) and slip the ribs out through the openings.
5. Glue the opening rings into the top & bottom openings — the one with the leg sockets is the bottom.
   Then fit your own light.

> **制作フロー**: 印刷 → コマ2枚のノッチに羽根板を差し込む → 溝に竹ひごを巻く → 糊＋和紙を
> 張る → 乾燥 → コマを外し羽根板を開口から抜く → 火袋の完成 → 口輪を貼る → 照明化。

### No 3D printer? Use cardboard (beta)

> **This route is still in development.** Its dimensions come from the same functions as the
> printed parts and are checked automatically, but far fewer people have actually built a mold
> this way, so expect rough edges — and please open an issue if something doesn't fit.

The Print view's **"Open papercraft"** button opens full-scale A4 pages. Measure your
cardboard and enter its thickness — the koma notches are cut to it, so the ribs push in
and hold with no glue or hardware. It prints the mold itself (ribs + koma); stand it on
whatever is to hand. Grooves are not cut — you can't carve a 0.5 mm V-notch into
cardboard — so the outer edge is a smooth curve with dashed ticks marking where each
bamboo rib goes. A part too wide for one page is split across two with a 10 mm glue tab.
Every page includes a 50 mm scale bar; make sure your printer prints at 100% (not "fit to
page").

### Cutting the washi first

Trimming the washi after it is pasted is the fiddliest part of the build, and a torn wet
edge shows. The app also gives you a full-scale template of one panel — the surface between two
adjacent ribs, developed flat. Slip it under the washi (it is translucent), trace it, and
cut all N panels before you paste anything. Its length is the length **along the curve**,
not the body height, so it reaches the openings exactly.

It is not a separate download: the panel's allowances live in the **Washi** section of the
side panel, and the template itself comes with whichever output you pick — a print-ready
`tomoshibi_washi_a4.pdf` inside the STL kit ZIP, or one more sheet among the cardboard
template's pages. The PDF is written directly by the app — no dependencies — and its
labels are English, since a self-contained PDF can't carry a Japanese font.

---

## Tech stack

Minimal by design — Vite + React 19 + three.js, plus fflate for the export ZIP (plain
JS/JSX, no TypeScript). The geometry is pure functions returning three.js
`Shape`/`ExtrudeGeometry`, shared by both the 2D section drawing and the STL export, so
what you see is exactly what you print.

## Contributing

Geometry changes must stay **watertight**. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
dev setup, the verification gates (`npm run lint` / `check:manifold` / `check:hash` /
`check:persist` / `check:paper` / `check:i18n`), and the design invariants to preserve.
CI runs them on every push and pull request.

## License

[MIT](LICENSE) © 2026 Shunya Koide

---

## 日本語（概要）

現実の提灯づくりの工程は「**型に竹ひごを巻く → 和紙を貼る → 乾いたら型をばらして抜く**」。
その型を分割部品として 3D プリントするのが本アプリです。出力パーツ:

- **羽根板** — 型の面を作る放射状の板（N枚）。外縁に竹ひご用の V 溝、両端に爪。
- **コマ** — 爪を束ねる歯車状のハブ（上下2個）。
- **土台** — コマを U 字サドルで受けて型を宙に浮かせ、回しながら作業できる台。
- **口輪** — 完成した提灯の開口に貼る薄い平リング（完成品にコマは残らないため）。開口の形を保つ。
  下側は輪の内側に脚ソケット（3ヶ所の平パッド＋⌀6の穴）を付けられる。完成品を脚で立てるための受けで、脚は各自で用意する。
  開口が小さくソケットが入らない場合は、内ふちに小さな出っ張りを付けた輪のみになる（上下の見分け用）。

**特長**: 断面の直接編集 / 竹ひご溝（螺旋巻きにも対応・羽根に通し番号を刻印）/
3Dプリンタが無くても作れる段ボール型紙（原寸 A4・**開発中/beta**）/ 貼る前に切るための和紙の型紙（原寸 A4）/ 英日 UI 切替 /
全パーツ水密（自動スイープで検証）。

**使い方**: 上部タブで **断面/組立/印刷/点灯** を切替、右パネルで断面の制御点をドラッグして
形を調整、印刷ビューから全パーツの STL（ZIP）を書き出し。初回に出る案内カードは
パネル右上の **?** でいつでも開き直せます。作り方は上記「From print to lantern」を参照。
ライセンスは [MIT](LICENSE)。アプリは **[こちら](https://shunyakoide.github.io/tomoshibi/)**（インストール不要・ブラウザのみで動作）。
