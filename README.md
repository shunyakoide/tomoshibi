# Lamp Kit Generator — 張型スタジオ (Harigata Studio)

A browser-based generator for the **3D-printable forming mold ("harigata")** used to
build **washi paper lanterns** (paper lamps).

Shape the lantern's silhouette parametrically in your browser, then export
print-ready STL parts. No backend — everything runs client-side, and the build
output is static files.

> **張型スタジオ** — 和紙提灯（紙のランプ）を自作するための
> **3Dプリント用「張型（はりがた）」ジェネレーター**。ブラウザ上で断面を直接編集し、
> 印刷用の STL を書き出せます。

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
| **Opening rings (口輪)** | Thin hoops that drop into the finished lantern's top & bottom openings to keep them round. |

### Features

- **Direct-manipulation section editor** — drag control points to sculpt the silhouette; 3D preview and STL stay in exact agreement.
- **Bamboo-rib grooves** — evenly spaced V-notches with barbs so the bamboo seats and won't slip.
- **Spiral winding (螺旋巻き)** — optional mode that offsets grooves per rib so the bamboo forms one continuous descending helix. Each rib is then unique, so it's exported as a separate STL and **engraved with its serial number** (7-segment cut) so you can place them in order.
- **Cardboard papercraft mode** — for those without a 3D printer: full-scale (1:1) A4 print pages to cut the parts from cardboard, plus a fold-together cross stand.
- **Washi template (和紙の型紙)** — the paper skin itself, developed flat: one rib-to-rib panel at full scale, so you cut the washi *before* pasting instead of trimming it after. Includes the side overlap, the cover allowance past the openings, and dashed guides for the rib lines and bamboo positions.
- **English / Japanese UI** — toggle in the top bar.
- **Watertight by construction** — every exported part is a closed manifold, verified by an automated sweep (see [CONTRIBUTING](CONTRIBUTING.md)).

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173  (served with --host, so a phone on the
                   # same Wi-Fi can open http://<your-computer-ip>:5173 )
npm run build      # production build into dist/
npm run preview    # preview the built output locally
```

Requires Node.js 18+.

---

## Using it

- **Top tabs** — switch between **Section / Assembly / Print / Lit** views.
- **Right panel** — pick a preset, then drag the section's control points to reshape; open the accordions (Frame, Bamboo, Print bed…) for finer settings.
- **Preview** — drag to orbit, wheel / pinch to zoom.
- **Export** — the Print view downloads a ZIP of every part as separate STLs, plus a `config.json` backup of your design.

### From print to lantern

1. Print the parts. Push the rib tabs into the two koma hubs' notches.
2. Set the assembly on the stand.
3. Wind bamboo ribs into the outer-edge grooves; paste washi paper over them.
4. Let it dry, then pull the koma out (toward the tab side) and slip the ribs out through the openings.
5. Drop the opening rings into the top & bottom openings, then fit your own light.

> **制作フロー**: 印刷 → コマ2枚のノッチに羽根板を差し込む → 溝に竹ひごを巻く → 糊＋和紙を
> 張る → 乾燥 → コマを外し羽根板を開口から抜く → 火袋の完成 → 口輪を入れて照明化。

### No 3D printer? Use cardboard

The Print view's **"Open papercraft"** button opens full-scale A4 pages. Cut the ribs,
hubs and a fold-together cross stand from cardboard — no glue or hardware needed. Every
page includes a 50 mm scale bar; make sure your printer prints at 100% (not "fit to page").

### Cutting the washi first

Trimming the washi after it is pasted is the fiddliest part of the build, and a torn wet
edge shows. The Print view's **"Washi"** mode opens a full-scale template of one panel —
the surface between two adjacent ribs, developed flat. Slip it under the washi (it is
translucent), trace it, and cut all N panels before you paste anything. Its length is the
length **along the curve**, not the body height, so it reaches the openings exactly.

The same template is bundled in the STL kit ZIP as a print-ready `harigata_washi_a4.pdf`
(also downloadable on its own), so the kit already contains everything needed for the
paper skin. The PDF is written directly by the app — no dependencies — and its labels are
English, since a self-contained PDF can't carry a Japanese font.

---

## Tech stack

Minimal by design — Vite + React 18 + three.js (plain JS/JSX, no TypeScript). The
geometry is pure functions returning three.js `Shape`/`ExtrudeGeometry`, shared by both
the 2D section drawing and the STL export, so what you see is exactly what you print.

## Contributing

Geometry changes must stay **watertight**. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
dev setup, the verification gates (`npm run check:manifold` / `check:hash` / `check:persist`
/ `check:paper`), and the design invariants to preserve.

## License

[MIT](LICENSE) © 2026 Shunya Koide

---

## 日本語（概要）

現実の提灯づくりの工程は「**型に竹ひごを巻く → 和紙を貼る → 乾いたら型をばらして抜く**」。
その型を分割部品として 3D プリントするのが本アプリです。出力パーツ:

- **羽根板** — 型の面を作る放射状の板（N枚）。外縁に竹ひご用の V 溝、両端に爪。
- **コマ** — 爪を束ねる歯車状のハブ（上下2個）。
- **土台** — コマを U 字サドルで受けて型を宙に浮かせ、回しながら作業できる台。
- **口輪** — 完成した提灯の上下開口に入れて真円を保つ薄い輪。

**特長**: 断面の直接編集 / 竹ひご溝（螺旋巻きにも対応・羽根に通し番号を刻印）/
3Dプリンタが無くても作れる段ボール型紙（原寸 A4）/ 貼る前に切るための和紙の型紙（原寸 A4）/ 英日 UI 切替 /
全パーツ水密（自動スイープで検証）。

**使い方**: 上部タブで **断面/組立/印刷/点灯** を切替、右パネルで断面の制御点をドラッグして
形を調整、印刷ビューから全パーツの STL（ZIP）を書き出し。作り方は上記「From print to
lantern」を参照。ライセンスは [MIT](LICENSE)。
