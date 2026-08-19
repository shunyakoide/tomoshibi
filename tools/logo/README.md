# Logo generator

Rebuilds every file in `public/` that carries the 灯 mark. Run it instead of editing the SVGs by
hand: the wordmark's letterspacing and its optical centring against the kanji's ink box are
computed, so a nudge to one file puts it out of step with the other eleven.

```bash
python3 -m venv .venv && .venv/bin/pip install fonttools
.venv/bin/python build.py            # writes the SVGs next to itself
```

`glyphs.json` and `latin.json` hold the glyph outlines already extracted from the fonts, so the
build needs no network and no font files — only `fonttools` for the `Transform` helper.

## Where the outlines came from

Both families are SIL OFL 1.1, which permits deriving artwork from their outlines.

| Element | Font |
| --- | --- |
| 灯 | Shippori Mincho 700 |
| `TOMOSHIBI`, tagline | IBM Plex Mono 500 / 400 |

They were pulled from the Google Fonts `text=` endpoint (which returns a font subset to the
requested characters) and converted with `fontTools`' `SVGPathPen`, flipping Y and normalising to a
1000-unit em. `latin.json` carries only the 14 letters the two strings use.

## PNGs

The raster exports (`favicon-32`, `favicon-64`, `favicon-180-apple-touch`, `icon-512`,
`mark-512-transparent`) are a separate manual step, because rasterising needs a native library that
is not worth making a prerequisite of this repo:

```bash
.venv/bin/pip install cairosvg && .venv/bin/python png.py
```

Regenerate them only when the mark itself changes — they are committed, so a normal checkout never
needs this.
