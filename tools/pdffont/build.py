"""Rebuild src/io/pdf-glyphs.ts — the Japanese glyph outlines the PDF writer draws.

A self-contained PDF has no Japanese font to fall back on, and src/io/pdf.ts carries base-14 Helvetica
only, so every non-Latin character it is handed would be dropped silently. Rather than embed a CJK
font (megabytes, for a few dozen characters), the characters the templates actually print are
pulled from an OFL font as outlines and drawn as filled paths — the same trick tools/logo uses for
the wordmark, and for the same reason: the artwork then needs neither the font nor a network.

    python3 -m venv .venv && .venv/bin/pip install fonttools brotli
    .venv/bin/python build.py            # writes ../../src/io/pdf-glyphs.ts

The character set is COLLECTED FROM THE SOURCE (see SOURCES), never hand-listed: a template that
starts printing a new word must not be able to print it as a blank. scripts/glyphs.test.mts runs the
same collection and fails when the table no longer covers it.
"""
import json
import pathlib
import re
import urllib.parse
import urllib.request

from fontTools.pens.qu2cuPen import Qu2CuPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "src" / "io" / "pdf-glyphs.ts"

# Modules whose strings reach a PDF. Read from the DIRECTORY rather than listed file by file: the
# template is spread over src/paper/, and a hand-listed path stops covering a label the moment
# someone moves it to a neighbouring module — which prints a blank and fails nothing. papercraft.ts
# is the barrel and prints nothing itself, but it is scanned too, so a string added there is not
# invisible. Anything drawn by a module OUTSIDE this set still has to be added here by hand, in the
# same commit that starts printing from it. Keep in step with SOURCES in scripts/glyphs.test.mts.
SOURCES = ["src/papercraft.ts"] + sorted(
    "src/paper/" + q.name for q in (ROOT / "src" / "paper").glob("*.ts"))
# Symbols worth drawing properly rather than folding to ASCII in pdf.ts (FOLD). They are not
# Japanese, but they are outside WinAnsi, which is the same problem.
EXTRA = "←→↑▼—"

FAMILY = "IBM Plex Sans JP"   # SIL OFL 1.1, and the Japanese voice of the IBM Plex Mono wordmark
WEIGHT = 400                  # every text style in papercraft's STYLE table is plain
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")   # woff2 is served to modern UAs only


def source_chars():
    """Characters WinAnsi cannot carry, taken from the string literals of SOURCES.

    Comments are stripped first: this project writes them in English, but a Japanese term quoted in
    one is explaining the code, not printing on paper. Latin-1 (U+00FF and below, "×" among them) is
    left out too — WinAnsi covers it, so pdf.ts keeps drawing those in Helvetica, where the text
    stays real text rather than becoming a picture of itself."""
    chars = set(EXTRA)
    for rel in SOURCES:
        src = (ROOT / rel).read_text(encoding="utf-8")
        src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
        src = re.sub(r"//[^\n]*", "", src)
        for m in re.finditer(r"\"([^\"\\\n]*)\"|'([^'\\\n]*)'|`([^`\\]*)`", src):
            for ch in (m.group(1) or m.group(2) or m.group(3) or ""):
                if ord(ch) > 0xFF:
                    chars.add(ch)
    return "".join(sorted(chars))


def fetch_subset(text):
    """The Google Fonts css2 endpoint returns a font subset to `text` — a few kB, not a few MB."""
    url = ("https://fonts.googleapis.com/css2?family="
           + urllib.parse.quote_plus(FAMILY) + f":wght@{WEIGHT}&text=" + urllib.parse.quote(text))
    css = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA})).read().decode()
    m = re.search(r"src: url\((https://[^)]+)\) format\('woff2'\)", css)
    if not m:
        raise SystemExit("no woff2 in the Google Fonts response:\n" + css)
    return urllib.request.urlopen(urllib.request.Request(m.group(1), headers={"User-Agent": UA})).read()


def glyph_ops(font, glyph_set, name, scale):
    """One glyph as PDF path operators in 1000-unit em, y UP (pdf.ts flips it onto the baseline).

    Quadratics are converted to cubics because PDF has no quadratic operator; `h` closes each
    contour so the non-zero winding fill leaves counters (the hole in 日) open."""
    rec = RecordingPen()
    # all_cubic, because PDF has no quadratic operator and Qu2CuPen otherwise passes a segment it
    # cannot convert straight through as `qCurveTo` — which this loop would skip, quietly joining the
    # two ends with a straight line. That is how マ came out as a filled wedge: not a missing glyph,
    # a glyph with its curves deleted. Anything unrecognised now raises rather than vanishing.
    glyph_set[name].draw(Qu2CuPen(rec, max_err=0.6, all_cubic=True))
    n = lambda v: f"{round(v * scale)}"
    ops = []
    for op, args in rec.value:
        if op == "moveTo":
            ops.append(f"{n(args[0][0])} {n(args[0][1])} m")
        elif op == "lineTo":
            ops.append(f"{n(args[0][0])} {n(args[0][1])} l")
        elif op == "curveTo":
            ops.append(" ".join(n(v) for pt in args for v in pt) + " c")
        elif op == "closePath":
            ops.append("h")
        elif op == "endPath":
            pass                                    # an open contour: nothing to fill, nothing to draw
        else:
            raise SystemExit(f"{name}: unhandled pen operator {op!r} — the glyph would lose a curve")
    return " ".join(ops)


def main():
    text = source_chars()
    print(f"{len(text)} characters: {text}")
    data = fetch_subset(text)
    (HERE / "subset.woff2").write_bytes(data)          # kept for inspection; not read back
    font = TTFont(HERE / "subset.woff2")
    cmap, hmtx = font.getBestCmap(), font["hmtx"]
    glyph_set = font.getGlyphSet()
    scale = 1000 / font["head"].unitsPerEm
    glyphs, missing = {}, []
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            missing.append(ch)
            continue
        glyphs[ch] = {"w": round(hmtx[name][0] * scale), "d": glyph_ops(font, glyph_set, name, scale)}
    if missing:
        print("NOT IN THE FONT (pdf.ts folds these to ASCII instead): " + "".join(missing))
    # A module rather than a .json file: both consumers (Vite and the plain-node checks) import it
    # without an import attribute, and the header travels with the data.
    body = json.dumps(glyphs, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        f"// GENERATED by tools/pdffont/build.py — do not edit. Rerun the tool instead.\n"
        f"// {FAMILY} {WEIGHT} (SIL OFL 1.1), outlines in a 1000-unit em, y up: `w` is the advance,\n"
        f"// `d` is a PDF path pdf.ts fills under one scale-and-flip matrix.\n"
        f"export const GLYPHS: Record<string, {{ w: number; d: string }} | undefined> = {body};\n",
        encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(glyphs)} glyphs, {OUT.stat().st_size / 1024:.1f} kB")


main()
