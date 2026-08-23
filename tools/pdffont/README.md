# PDF glyph outlines

Rebuilds `src/pdf-glyphs.js` — the characters `src/pdf.js` draws when WinAnsi cannot encode them
(the Japanese, the arrows). Run it whenever a template starts printing a word it did not print
before; `npm run check:glyphs` is what tells you that day has come.

```bash
python3 -m venv .venv && .venv/bin/pip install fonttools brotli
.venv/bin/python build.py            # writes ../../src/pdf-glyphs.js
```

## Why outlines and not a font

A self-contained PDF has no system fonts to fall back on. Embedding a CJK face would put megabytes
into a file whose whole job is to print two dozen characters — so those characters are extracted as
outlines and filled as paths, exactly the trade `tools/logo` makes for the wordmark. The templates
were English-only until this existed, because `winAnsi()` **drops** what it cannot encode: the
part names printed as `" ×8"`, with the word gone and every structural check still green.

The cost is that the words are artwork, not text: they do not select, copy or search. For a part
label on a sheet you are about to cut up, that is not a cost worth a font for.

## The character set is collected, never listed

`build.py` reads the string literals of the modules in `SOURCES` (comments stripped) and takes every
character above U+00FF. Latin-1 stays with Helvetica, where it is real text at a tenth of the bytes.
`scripts/glyphs.test.mjs` runs the same collection against the committed table and fails both ways —
a character with no outline, and an outline nothing prints any more (the fingerprint of a reworded
label, the same drift `check:i18n` hunts in the dictionary).

A module that starts drawing text has to be added to `SOURCES` **and** to the copy of that list in
the check. Nothing can detect its absence: the words simply never reach the paper.

## Where the outlines come from

| Element | Font | Licence |
| --- | --- | --- |
| Japanese, arrows | IBM Plex Sans JP 400 | SIL OFL 1.1 |

Pulled from the Google Fonts `text=` endpoint, which returns a subset to the requested characters,
and converted with `fontTools` — quadratics to cubics (PDF has no quadratic operator), normalised to
a 1000-unit em with y up. `subset.woff2` is left behind for inspection and is not committed; the
build needs the network, the app never does.

IBM Plex Sans JP is the Japanese voice of the IBM Plex Mono the wordmark and the UI are set in, so
the sheet and the screen speak with the same one.
