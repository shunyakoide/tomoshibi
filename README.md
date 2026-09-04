<p align="center">
  <img src="public/mark-512-transparent.png" alt="" width="88" />
</p>

# 灯 Tomoshibi — washi lantern molds

A browser generator for the **3D-printable forming mold ("harigata")** that washi paper lanterns are
built on. Shape the cross-section and it writes the print-ready STLs — or, with no printer, a
full-scale A4 template for cutting the same mold out of cardboard. No backend: everything runs
client-side and the build output is static files.

> **灯 Tomoshibi** — 和紙提灯（紙のランプ）を自作するための
> **3Dプリント用「張型（はりがた）」ジェネレーター**。ブラウザ上で断面を編集すると STL が、
> 3Dプリンタが無ければ原寸 A4 の段ボール型紙が出ます。

**→ [Open the app](https://shunyakoide.github.io/tomoshibi/)** — nothing to install.

![The section editor: an egg-shaped lantern profile with draggable control points, dimensions and a live rib outline](docs/screenshots/section.png)

*Drag the ◇ handles to sculpt the silhouette. The rib outline drawn beside it — grooves, tabs and lightening windows included — is the same geometry the STL is written from.*

| Assembly | Print | Lit |
| --- | --- | --- |
| ![The assembled mold cradled on its stand](docs/screenshots/assembly.png) | ![Print plates laid out on the bed](docs/screenshots/print.png) | ![The finished lantern, lit, standing on three legs](docs/screenshots/lit.png) |
| The mold on its stand, held clear of the table so you can turn it as you wind. | Every part laid out on your bed. | What you are building towards. |

---

## What it makes

Real paper lanterns are made by **winding bamboo ribs around a mold, pasting washi over them,
letting it dry, then taking the mold apart and pulling it out through the opening**. This app
generates that mold as split parts you can make yourself.

| Part | Role |
| --- | --- |
| **Rib (羽根板)** | The radial boards that form the mold surface (N of them, like orange segments). The outer edge carries the lamp-body curve and V-notch grooves for the bamboo; both ends have tabs. |
| **Koma / hub (コマ)** | Two identical gear-like hubs, top and bottom. Notches around the rim hold the rib tabs. |
| **Stand (土台)** | A base that holds the assembled mold off the table on two U-shaped saddles, so you can turn it while you work. 3D-print route only. |
| **Opening rings (口輪)** | Thin hoops for the finished lantern's two openings, which keep their shape once the koma are gone. The **bottom one can carry leg sockets** (a checkbox, off by default): three pads with a ⌀6 bore, for legs you supply. Where the opening is too small for them it falls back to a plain hoop with a tab on its inner rim, which tells the two apart once made. |

### Features

- **Direct-manipulation section editor** — drag control points to sculpt the silhouette; the 3D preview and the STL stay in exact agreement.
- **A mold that comes back out** — a deep body on a small opening makes ribs too wide to pull out of the lantern they shaped. The app measures that while you are still shaping the silhouette, along with whether every part fits your bed.
- **Bamboo-rib grooves** — evenly spaced V-notches with barbs so the bamboo seats and won't slip. Optional **spiral winding (螺旋巻き)** offsets them per rib into one continuous helix; each rib is then unique, so it exports as its own STL engraved with its serial number.
- **Cardboard route** (beta) — no 3D printer needed: full-scale A4 pages to cut the mold from cardboard.
- **Washi template (和紙の型紙)** (beta) — the paper skin developed flat, one rib-to-rib panel at full scale, so you cut the washi *before* pasting instead of trimming it after. It ships with whichever route you pick.
- **Build guide** — a step-by-step page of its own (`/guide`, under wherever the app is mounted), drawn from the same `geometry.ts` the STLs are, running past the mold to winding, pasting, drying, pulling the mold out and lighting it.
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

Requires **Node.js 22.18+** (or 24+). The check scripts are TypeScript run directly by `node`, which
strips types without a flag from that version on. An older Node fails at `npm install` rather than
degrading.

---

## Using it

- **View tabs** — **Section / Assembly / Print / Lit**, all four rendered from the design in front of you.
- **Right panel** — pick a preset, then drag the section's control points; the sections below (Frame, Bamboo ribs, Washi, Print bed…) hold the finer settings.
- **Export** — the Print view downloads the whole kit as one ZIP, with a `tomoshibi_config.json` backup of your design in it. (STL compresses well: a default kit is about 190 KB zipped.)
- **☰ menu** — the intro card, the build guide, the language, backup save / restore, reset, and a link to this repository.

### From mold to lantern

1. Make the parts. Push the rib tabs into the two koma hubs' notches.
2. Set the assembly on the stand.
3. Wind bamboo ribs into the outer-edge grooves; paste washi paper over them.
4. Let it dry, then pull the koma out (toward the tab side) and slip the ribs out through the openings.
5. Glue the opening rings into the two openings, and fit your own light.

> **制作フロー**: 出力 → コマ2枚のノッチに羽根板を差し込む → 溝に竹ひごを巻く → 糊＋和紙を
> 張る → 乾燥 → コマを外し羽根板を開口から抜く → 火袋の完成 → 口輪を貼る → 照明化。

The app's **build guide** (☰ → How to build it) walks the same route with every step drawn, lists
what you supply yourself, and ends with three ways to light it: cover a lamp standing on the floor,
hang it from a pendant cord, or add legs and fix the lamp in from below.

### The two beta routes

> Both are checked automatically against the same geometry as the printed parts, but far fewer
> people have built anything this way. Expect rough edges, and please open an issue if something
> doesn't fit.

**Cardboard** needs no printer, only a blade and a ruler. The Print view downloads two full-scale
A4 PDFs — the mold (`tomoshibi_katagami_a4.pdf`) and the washi one — and you enter the thickness you
measured, so the koma notches are cut to it and the ribs push in with no glue or hardware. The sheet
carries the ribs, the koma, and the two opening hoops as a blue line to **bend 2mm wire along, not to
cut**. There is no stand: stand the mold on whatever is to hand. Grooves are not cut either — you
can't carve a 0.5 mm V-notch into cardboard — so the outer edge is a smooth curve with dashed ticks
marking where each bamboo rib goes. Print at **100%**, never "fit to page"; one sheet carries a check
square to measure with a ruler. A part too tall for a page continues on the next (cut both on the
blue frame, butt the edges so the coded half-diamonds close into ◇, tape from behind), but pages only
split downward, so a part wider than A4 does not fit at all — the app says so before you print.

**The washi template** is a full-scale drawing of one panel: the surface between two adjacent ribs,
developed flat, with the side overlap and the allowance that folds over the openings. Slip it under
the washi, trace it, and cut all N panels before you paste anything — trimming a pasted, wet edge is
the fiddliest part of the build and it shows. Its length is the length **along the curve**, not the
body height. Flattening a doubly-curved surface is approximate by nature, so cut one panel and offer
it up before cutting them all.

---

## Tech stack

Minimal by design — Vite + React 19 + three.js, plus fflate for the export ZIP, in TypeScript. The
PDFs are written by the app itself, with no dependency. The geometry is pure functions returning
three.js `Shape`/`ExtrudeGeometry`, shared by the 2D section drawing, the 3D preview, the STL and
both templates, which is what makes what you see what you print.

## Contributing

Geometry changes must stay **watertight**. See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup
and the verification gates (`lint` / `typecheck` / `check:manifold` / `check:hash` / `check:persist` /
`check:paper` / `check:glyphs` / `check:i18n` / `check:style`). CI runs all of them on every push and
pull request except `check:hash`, which needs a before and an after and so is run locally around a
change meant to leave the STL identical. The design decisions behind the mold — the part roles, the
print-fit invariants, why each shape is the shape it is — are in
[docs/design-notes.md](docs/design-notes.md).

## License

[MIT](LICENSE) © 2026 Shunya Koide

---

## 日本語（概要）

提灯づくりの工程は「**型に竹ひごを巻く → 和紙を貼る → 乾いたら型をばらして抜く**」。
その型を分割部品として出力するのが本アプリです。

- **羽根板** — 型の面を作る放射状の板（N枚）。外縁に竹ひご用の V 溝、両端に爪。
- **コマ** — 爪を束ねる歯車状のハブ（上下2個）。
- **土台** — コマを U 字サドルで受けて型を宙に浮かせ、回しながら作業できる台（3Dプリントのみ）。
- **口輪** — 完成した提灯の開口に貼る薄い平リング（完成品にコマは残らないため）。開口の形を保つ。
  下側は輪の内側に脚ソケット（3ヶ所の平パッド＋⌀6の穴）を付けられる。開口が小さく入らない場合は、
  内ふちに小さな出っ張りを付けた輪のみになる（上下の見分け用）。段ボールでは針金(2mm)を曲げる線として出力。

**特長**: 断面の直接編集 / 竹ひご溝（螺旋巻き対応・羽根に通し番号を刻印）/
3Dプリンタが無くても作れる段ボール型紙（原寸 A4・**開発中/beta**）/
貼る前に切るための和紙の型紙（原寸 A4・**検証中/beta**）/ 作り方ページ / 英日 UI 切替 /
全パーツ水密（自動スイープで検証）。

**使い方**: 上部タブで **断面/組立/印刷/点灯** を切替、右パネルで断面の制御点をドラッグして形を調整、
印刷ビューから一式を ZIP で書き出し。作り方・言語・バックアップ・ソースコードへのリンクは
ヘッダーの **☰** メニューに。ライセンスは [MIT](LICENSE)。
アプリは **[こちら](https://shunyakoide.github.io/tomoshibi/)**（インストール不要・ブラウザのみで動作）。
