# Brand assets — 灯 TOMOSHIBI

The mark is the single kanji **灯** ("a light / a lamp") — the same character that sits inside
提灯 (chōchin). The romaji name is **Tomoshibi**; the tagline is **WASHI LANTERN MOLDS**.

## Files (`public/`)

| File | Use |
| --- | --- |
| `logo-tomoshibi.svg` | **Primary lockup** — ink mark and wordmark, accent tagline. Light grounds. |
| `logo-tomoshibi-inverse.svg` | Same, for dark grounds (the tagline orange is lightened to `#E8834A`; the base accent sits too close to the ink brown to read on it). |
| `logo-tomoshibi-mono.svg` / `-mono-inverse.svg` | Single-colour lockup — print, embroidery, anywhere the accent cannot be reproduced. |
| `logo-tomoshibi-compact.svg` / `-compact-inverse.svg` | Mark + wordmark, no tagline. For headers and narrow bars. |
| `logo-tomoshibi-mark.svg` | Mark alone, 64×64, transparent. |
| `favicon.svg` | **Primary favicon** — ink 灯 on a washi square. |
| `favicon-transparent.svg` / `-dark.svg` / `-accent.svg` | Alternates. The dark and accent versions carry further at 16 px if the washi square ever proves too quiet in a tab. |
| `favicon-32.png`, `favicon-64.png`, `favicon-180-apple-touch.png`, `icon-512.png` | Raster fallbacks and app icons. |
| `mark-512-transparent.png` | Mark alone, transparent, for slide decks and README headers. |
| `manifest.webmanifest` | Web app manifest — the name and icons an Android home-screen install uses. iOS reads the `apple-*` tags in `index.html` instead, so both are needed. |

## Colours

Taken from `src/ui/theme.ts`, not invented here — the logo and the app share one palette.

| Token | Hex | Role |
| --- | --- | --- |
| ink | `#3b342b` | Mark and wordmark |
| washi | `#fbf8f1` | Primary ground |
| accent | `#D95B18` | Tagline (`accent` in `theme.ts` — "the orange of washi lamplight") |
| accent (dark ground) | `#E8834A` | Tagline on ink |
| muted | `#8a7c66` | Tagline in the mono lockup |

## Typography — and why every glyph is an outline

Nothing in these files is live `<text>`. Every glyph is a converted path, so the marks render
identically on a machine that has none of the fonts installed. That matters more than usual here:
the kanji is set in a webfont that ships on no operating system, so a `<text>` version would
silently fall back to whatever mincho the viewer happens to have.

灯 is Shippori Mincho 700; the wordmark and tagline are IBM Plex Mono 500 / 400. Both families are
SIL OFL 1.1, which permits deriving artwork from their outlines, and IBM Plex is already the app's
typeface (`src/ui/theme.ts`), so the wordmark and the UI are the same voice.

## Regenerating

Every file above is generated. Run [`tools/logo`](tools/logo/README.md) rather than editing an SVG
by hand — the letterspacing and the optical centring of the wordmark against the kanji's ink box are
computed, so a nudge to one file puts it out of step with the other eleven.
