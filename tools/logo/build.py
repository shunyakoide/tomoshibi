"""Builds every 灯 mark in public/, plus src/ui/Logo.jsx.

Run this instead of editing the SVGs: the wordmark's letterspacing and its optical centring
against the kanji's ink box are computed, so hand-nudging one file puts it out of step with the
others. See README.md.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
G = json.load(open(os.path.join(HERE, "glyphs.json")))
L = json.load(open(os.path.join(HERE, "latin.json")))

INK, WASHI, MUTED, ACC = "#3b342b", "#fbf8f1", "#8a7c66", "#D95B18"
INK_L, MUTED_L = "#fbf8f1", "#b5ac9a"
ACC_L = "#E8834A"          # accent lightened for the dark ground; the base orange sits too close
                           # to INK to read on it (contrast 2.8 → 3.8)
KANJI = "shippori700"
WORD, TAG = "TOMOSHIBI", "WASHI LANTERN MOLDS"

# ---------------------------------------------------------------- primitives
def kparts(size, x, y):
    """Kanji, ink box placed at (x, y) with ink height = size. -> [(d, transform)]"""
    g = G[KANJI]; x0, y0, x1, y1 = g["bbox"]; s = size / max(g["w"], g["h"])
    tx = x - x0 * s + (size - g["w"] * s) / 2
    ty = y - y0 * s + (size - g["h"] * s) / 2
    return [(g["d"], f"translate({tx:.2f} {ty:.2f}) scale({s:.5f})")]

def measure(text, font, size, track):
    f = L[font]
    w = sum((f["g"][c]["adv"] * size / 1000 if c != " " else size * 0.34) + track * size
            for c in text)
    return w - track * size, f["cap"] * size / 1000

def wparts(text, font, size, track, x, baseline):
    f = L[font]; cur = x; out = []
    for c in text:
        if c == " ":
            cur += size * 0.34 + track * size
            continue
        g = f["g"][c]
        if g["bbox"]:
            out.append((g["d"], f"translate({cur:.2f} {baseline:.2f}) scale({size/1000:.5f})"))
        cur += g["adv"] * size / 1000 + track * size
    return out

def render(parts, fill):
    return "".join(f'<path d="{d}" fill="{fill}" transform="{t}"/>' for d, t in parts)

def wrap(w, h, body, label, bg=None, rx=None):
    r = ""
    if bg:
        r = f'<rect width="{w:.0f}" height="{h:.0f}" fill="{bg}"' + (f' rx="{rx}"' if rx else "") + "/>"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" '
            f'width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{label}">{r}{body}</svg>')

# ---------------------------------------------------------------- lockups
def full_parts():
    """-> (viewBox w, h, ink parts, tagline parts)

    K is the one number to be careful with: it sets how much of the lockup the kanji eats. At 64 the
    mark ran 3.4x the wordmark's cap height, which reads as a big 灯 with small English stapled to
    it — and in a width-limited slot like the inspector header that forces the whole lockup down
    until the tagline is unreadable. 50 puts the ratio at 2.65 and buys the text back.
    """
    PAD, K, GAP = 10, 50, 22
    WS, WT, TS, TT, LEAD = 27.0, 0.185, 9.5, 0.26, 9.0
    ww, wcap = measure(WORD, "lat-mono500", WS, WT)
    tw, tcap = measure(TAG, "lat-mono400", TS, TT)
    top = PAD + K / 2 - (wcap + LEAD + tcap) / 2
    wb = top + wcap
    x = PAD + K + GAP
    ink = kparts(K, PAD, PAD) + wparts(WORD, "lat-mono500", WS, WT, x, wb)
    tag = wparts(TAG, "lat-mono400", TS, TT, x + 1, wb + LEAD + tcap)
    return x + max(ww, tw) + PAD, K + PAD * 2, ink, tag

def compact_parts():
    PAD, K, GAP, WS, WT = 5, 30, 14, 17.0, 0.18
    ww, wcap = measure(WORD, "lat-mono500", WS, WT)
    x = PAD + K + GAP
    ink = kparts(K, PAD, PAD) + wparts(WORD, "lat-mono500", WS, WT, x, PAD + K / 2 + wcap / 2)
    return x + ww + PAD, K + PAD * 2, ink, []

def lockup(parts_fn, ink_fill, tag_fill, bg=None):
    w, h, ink, tag = parts_fn()
    return wrap(w, h, render(ink, ink_fill) + render(tag, tag_fill),
                f"灯 {WORD}" + (f" — {TAG}" if tag else ""), bg)

def mark(size=64, ink=INK, bg=None, rx=None, ratio=0.74):
    k = size * ratio
    return wrap(size, size, render(kparts(k, (size - k) / 2, (size - k) / 2), ink), "灯", bg, rx)

# ---------------------------------------------------------------- outputs
# White (washi) is the primary ground; the accent tagline is the primary lockup.
A = {
 "logo-tomoshibi":                 lockup(full_parts, INK, ACC),        # PRIMARY
 "logo-tomoshibi-inverse":         lockup(full_parts, INK_L, ACC_L),    # dark grounds
 "logo-tomoshibi-mono":            lockup(full_parts, INK, MUTED),      # single-colour / print
 "logo-tomoshibi-mono-inverse":    lockup(full_parts, INK_L, MUTED_L),
 "logo-tomoshibi-compact":         lockup(compact_parts, INK, INK),
 "logo-tomoshibi-compact-inverse": lockup(compact_parts, INK_L, INK_L),
 "logo-tomoshibi-mark":            mark(64, INK, ratio=0.80),
 "favicon":                        mark(64, INK, WASHI, rx=0, ratio=0.72),   # primary
 "favicon-transparent":            mark(64, INK, ratio=0.80),
 "favicon-dark":                   mark(64, WASHI, INK, rx=0, ratio=0.72),
 "favicon-accent":                 mark(64, WASHI, ACC, rx=0, ratio=0.72),
 "icon-512":                       mark(512, INK, WASHI, ratio=0.60),
 "mark-512-transparent":           mark(512, INK, ratio=0.80),
}
OUT = os.path.join(HERE, "..", "..", "public")
for k, v in A.items():
    open(os.path.join(OUT, f"{k}.svg"), "w").write(v)
json.dump(A, open(os.path.join(HERE, "assets.json"), "w"))

# ---------------------------------------------------------------- Logo.jsx
def js(parts):
    return "[\n" + "".join(f'  {{ d: "{d}", t: "{t}" }},\n' for d, t in parts) + "]"

fw, fh, fink, ftag = full_parts()
cw, ch, cink, _ = compact_parts()
jsx = f'''/**
 * ============================================================================
 * LOGO — 灯 TOMOSHIBI
 * ============================================================================
 * GENERATED by tools/logo/build.py. Do not edit by hand: the same numbers produce the SVGs in
 * public/, and a nudge here would make the in-app logo disagree with the favicon and the README.
 *
 * The glyphs are outlines, not text, for the same reason the standalone SVGs are: 灯 is set in
 * Shippori Mincho, which ships on no operating system, so live text would silently fall back to
 * whatever mincho the visitor happens to have — a different logo per machine.
 *
 * The mark and wordmark are `currentColor`, so one component serves the light inspector and any
 * dark ground; only the tagline carries its own colour.
 * ============================================================================
 */
import {{ accent }} from "./theme.js";

const FULL = {{ w: {fw:.0f}, h: {fh:.0f}, ink: {js(fink)}, tag: {js(ftag)} }};

const COMPACT = {{ w: {cw:.0f}, h: {ch:.0f}, ink: {js(cink)}, tag: [] }};

/**
 * `height` is the only size knob — the viewBox keeps the aspect, so the caller never has to know
 * the lockup's proportions. `tagColour` exists for the one case the accent cannot serve: a dark
 * ground, where the base orange sits too close to the ink brown to read.
 */
export default function Logo({{ variant = "compact", height = 30, tagColour = accent, ...rest }}) {{
  const L = variant === "full" ? FULL : COMPACT;
  return (
    <svg viewBox={{`0 0 ${{L.w}} ${{L.h}}`}} height={{height}} width={{(height * L.w) / L.h}}
      role="img" aria-label="灯 Tomoshibi" style={{{{ display: "block", overflow: "visible" }}}} {{...rest}}>
      {{L.ink.map((p, i) => <path key={{`i${{i}}`}} d={{p.d}} transform={{p.t}} fill="currentColor" />)}}
      {{L.tag.map((p, i) => <path key={{`t${{i}}`}} d={{p.d}} transform={{p.t}} fill={{tagColour}} />)}}
    </svg>
  );
}}
'''
open(os.path.join(HERE, "..", "..", "src", "ui", "Logo.jsx"), "w").write(jsx)

for k, v in A.items():
    print(f"  public/{k}.svg  {v.split('viewBox=\"')[1].split('\"')[0]}")
print(f"  src/ui/Logo.jsx  full={fw:.0f}x{fh:.0f} compact={cw:.0f}x{ch:.0f}")
