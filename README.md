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

![The section editor: an egg-shaped lantern profile with draggable control points, dimensions and a live rib outline](docs/screenshots/section.png)

*Drag the ◇ handles to sculpt the silhouette. The rib outline drawn beside it — grooves, tabs and lightening windows included — is the same geometry the STL is written from.*

| Assembly | Print | Lit |
| --- | --- | --- |
| ![The assembled mold cradled on its stand](docs/screenshots/assembly.png) | ![Print plates laid out on the bed](docs/screenshots/print.png) | ![The finished lantern, lit, standing on three legs](docs/screenshots/lit.png) |
| The mold on its stand, held clear of the table so you can turn it as you wind. | Every part laid out on your bed. | What you are building towards. |

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
| **Opening rings (口輪)** | Thin flat hoops for the finished lantern's openings, which have no koma left in them, so the openings keep their shape. The **bottom one can carry leg sockets** (a checkbox, off by default) — three flat pads inside the hoop, each with a 6mm bore, for standing the finished lantern on legs of your own. Where the opening is too small for them it falls back to a plain hoop with a small tab on its inner rim, which tells the two apart once printed. |

### Features

- **Direct-manipulation section editor** — drag control points to sculpt the silhouette; 3D preview and STL stay in exact agreement.
- **A mold that comes back out** — a deep body on a small opening makes ribs too wide to pull out of the lantern they shaped, and every part still prints, fits the bed and is watertight. The app measures it and says so while you are still shaping the silhouette.
- **Bamboo-rib grooves** — evenly spaced V-notches with barbs so the bamboo seats and won't slip.
- **Spiral winding (螺旋巻き)** — optional mode that offsets grooves per rib so the bamboo forms one continuous descending helix. Each rib is then unique, so it's exported as a separate STL and **engraved with its serial number** (7-segment cut) so you can place them in order.
- **Cardboard papercraft mode** (beta) — for those without a 3D printer: full-scale (1:1) A4 print pages to cut the ribs and koma hubs from cardboard. Notch widths follow the thickness you measured, so the parts still mesh.
- **Washi template (和紙の型紙)** (beta) — the paper skin itself, developed flat: one rib-to-rib panel at full scale, so you cut the washi *before* pasting instead of trimming it after. Includes the side overlap, the cover allowance past the openings, and dashed guides for the rib lines and bamboo positions. It ships with whichever output you choose, as its own PDF inside that download.
- **Build guide** — a step-by-step page at `/guide`, every step drawn from the same `geometry.ts` the STLs are written from. It runs past the mold — winding the bamboo, pasting the washi, drying, pulling the mold out, and putting a light in it — and lists what you supply yourself (bamboo, washi, paste, a razor, a lamp…), each one drawn. The drawings are of one example lantern rather than of your design, and no dimension is printed on the page: the method does not change with the shape. Print it straight from the browser if you want it on paper.
- **English / Japanese UI** — a row in the ☰ menu. Both templates print in the language the app is showing.
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

Requires **Node.js 22.18+** (or 24+). The check scripts are TypeScript run directly by
`node`, which strips types without a flag from that version on; Node 20 reached end of
life in April 2026. An older Node fails at `npm install` rather than degrading.

---

## Using it

- **View tabs** — switch between **Section / Assembly / Print / Lit**. (The build guide is a page of its own, at `/guide`, opened from the **☰** menu.)
- **Right panel** — pick a preset, then drag the section's control points to reshape; the sections below (Frame, Bamboo ribs, Washi, Print bed…) hold the finer settings.
- **Preview** — drag to orbit, wheel / pinch to zoom.
- **Export** — the Print view downloads a ZIP of every part as separate STLs, plus a `tomoshibi_config.json` backup of your design. (STL compresses well: a default kit is about 190 KB zipped.)
- **If you're lost** — a card on your first visit says what the object on screen actually is (the mold, not the lantern); the **☰** menu's first row reopens it any time. The legend at the top-right of the section view redraws the ◇ marks themselves, and follows the edit mode you are in.

### From print to lantern

1. Print the parts. Push the rib tabs into the two koma hubs' notches.
2. Set the assembly on the stand.
3. Wind bamboo ribs into the outer-edge grooves; paste washi paper over them.
4. Let it dry, then pull the koma out (toward the tab side) and slip the ribs out through the openings.
5. Glue the opening rings into the top & bottom openings — the bottom one is the one with the leg sockets, or, if you left those off, the one with the small tab on its inner rim.
   Then fit your own light.

> **制作フロー**: 印刷 → コマ2枚のノッチに羽根板を差し込む → 溝に竹ひごを巻く → 糊＋和紙を
> 張る → 乾燥 → コマを外し羽根板を開口から抜く → 火袋の完成 → 口輪を貼る → 照明化。

The app says the same thing on its **build guide** page — every step drawn, and a list of what you
supply yourself (bamboo, washi, paste, a razor, a lamp) drawn beside it. The drawings are of one
example lantern rather than of your design, and the page prints no dimensions at all: the method
does not change with the shape. The last step gives the **three ways to light it** — cover a lamp
stood on the floor, hang it from a pendant cord, or add legs and fix the lamp in from below — each
drawn, and the third only where the bottom ring has the leg sockets to take it. The two that need a
fitting are worked through in numbered sub-steps of their own, and neither needs anything you have
to print — a length of wire does both. On legs: bend a loop in the end of three wires, stack them on the lamp
holder's threaded stem and tighten its nut, and the lamp and its legs come off the bench as one
piece. Hanging: bow one wire into a shallow arch with a U in the middle, drop the cord into the U — its
gap passes the cord and stops the socket — and run the wire's two ends under the rim of the top
opening and out past it.

### No 3D printer? Use cardboard (beta)

> **This route is still in development.** Its dimensions come from the same functions as the
> printed parts and are checked automatically, but far fewer people have actually built a mold
> this way, so expect rough edges — and please open an issue if something doesn't fit.

The Print view downloads a ZIP of two full-scale A4 PDFs: the mold's template
(`tomoshibi_katagami_a4.pdf`) and the washi one (`tomoshibi_washi_a4_beta.pdf`). Measure your
cardboard and enter its thickness — the koma notches are cut to it, so the ribs push in
and hold with no glue or hardware. It prints the mold itself (ribs + koma); stand it on
whatever is to hand. Grooves are not cut — you can't carve a 0.5 mm V-notch into
cardboard — so the outer edge is a smooth curve with dashed ticks marking where each
bamboo rib goes. A part too tall for one page continues on the next: cut both sheets on
the blue frame, butt the cut edges so the coded half-diamonds close into ◇, and tape from
behind. One sheet carries an L-shaped check square (3in across, 3cm down) — measure it
with a ruler, and make sure your printer prints at 100% (not "fit to page").

### Cutting the washi first (beta)

> **Still being verified.** Flattening a doubly-curved surface is approximate by nature (see the
> panel size the app reports), and how much a damp sheet takes up is still being checked against
> real builds. Cut one panel and offer it up before you cut them all.

Trimming the washi after it is pasted is the fiddliest part of the build, and a torn wet
edge shows. The app also gives you a full-scale template of one panel — the surface between two
adjacent ribs, developed flat. Slip it under the washi (it is translucent), trace it, and
cut all N panels before you paste anything. Its length is the length **along the curve**,
not the body height, so it reaches the openings exactly.

It is not a separate download: the panel's allowances live in the **Washi** section of the
side panel, and the template itself comes with whichever output you pick — as
`tomoshibi_washi_a4_beta.pdf` inside that route's ZIP, next to the STLs or next to the mold's
own template. The PDF is written directly by the app — no dependencies — and it prints in
whichever language the app is set to.

---

## Tech stack

Minimal by design — Vite + React 19 + three.js, plus fflate for the export ZIP, written
in TypeScript. The geometry is pure functions returning three.js
`Shape`/`ExtrudeGeometry`, shared by both the 2D section drawing and the STL export, so
what you see is exactly what you print.

## Contributing

Geometry changes must stay **watertight**. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
dev setup, the verification gates (`npm run lint` / `typecheck` / `check:manifold` / `check:hash` /
`check:persist` / `check:paper` / `check:glyphs` / `check:i18n` / `check:style`), and the design invariants to preserve.
CI runs all of them on every push and pull request except `check:hash`, which needs a before
and an after and so is run locally around a change meant to leave the STL identical. The design decisions behind the mold — the part
roles, the print-fit invariants, why each shape is the shape it is — are in
[docs/design-notes.md](docs/design-notes.md).

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
3Dプリンタが無くても作れる段ボール型紙（原寸 A4・**開発中/beta**）/ 貼る前に切るための和紙の型紙（原寸 A4・**検証中/beta**）/ 英日 UI 切替 /
全パーツ水密（自動スイープで検証）。

**使い方**: 上部タブで **断面/組立/印刷/点灯** を切替、右パネルで断面の制御点をドラッグして
形を調整、印刷ビューから全パーツの STL（ZIP）を書き出し。初回に出る案内カードは
ヘッダーの **☰** メニューからいつでも開き直せます。作り方は上記「From print to lantern」を参照。
ライセンスは [MIT](LICENSE)。アプリは **[こちら](https://shunyakoide.github.io/tomoshibi/)**（インストール不要・ブラウザのみで動作）。
