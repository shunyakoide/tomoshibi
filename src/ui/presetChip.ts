/**
 * Everything about a preset chip except its markup: **the design picking it yields**, the miniature
 * drawn from that design, and which chip is lit.
 *
 * **A plain `.ts`, so a gate can import it**, and that is the point rather than a convenience. The
 * check scripts are run by plain node, which cannot load a `.tsx` at all, and this is where the same
 * bug kept coming back: something here answered "what will I get if I click this?" differently from
 * the pick. Three times, each time invisible to every gate —
 *   - the miniature built its design from `pr.pts` raw while the pick floored the openings, so
 *     `たまご` advertised ⌀38 and `平丸` ⌀46 against the ⌀52 either one gives;
 *   - the miniature resolved `Preset.height` while `matchPreset` did not, so `平丸` stayed LIT at a
 *     60mm body while drawing its 150mm silhouette;
 *   - and the miniature drew with `DEFAULTS`' neck flags and rib count rather than the maker's, so
 *     with both necks off its silhouette was out by half the chip's own width — `outerR` reads those
 *     flags, and a neck-less end IS the koma size, which the rib count sets.
 *
 * So there is ONE function that says what a pick produces (`presetDesign`), and the pick, the picture
 * and the lit state are all it. A pick replaces `rTop`/`rBot`/`pts` and, for a preset whose identity
 * is a ratio, the height — everything else is the maker's and stays theirs.
 */
import { outerR } from "../geometry.ts";
import { PRESETS } from "../config.ts";
import { presetPts, presetHeight } from "./pointEdit.ts";
import type { Preset } from "../config.ts";
import type { Design, Pt } from "../types.ts";

/** The design `onPick` stores — and therefore the one the chip must draw and be lit by. */
export function presetDesign(pr: Preset, p: Design): Design {
  return { ...p, rTop: pr.rTop, rBot: pr.rBot, height: presetHeight(pr, p.height), pts: presetPts(pr, p.height) };
}

/**
 * The chip's miniature: the same `outerR` the 3D view and the section draw, sampled 41 times and
 * normalized to the 60×46 viewBox `PresetChips` gives it. Returns the design it drew alongside the
 * path, which is what `check:persist` compares against `presetDesign` — a drawing that drifts from
 * the pick fails there rather than on screen.
 */
export function presetMini(pr: Preset, p: Design): { d: string; q: Design } {
  const q = presetDesign(pr, p);
  const N = 40, rr: number[] = [];
  let mx = 0;
  for (let i = 0; i <= N; i++) { const r = outerR(q, i / N); rr.push(r); if (r > mx) mx = r; }
  const kx = 16 / mx;
  const Xc = (r: number) => 30 + r * kx, Xm = (r: number) => 30 - r * kx, Yc = (t: number) => 42 - t * 36;
  let d = `M ${Xc(rr[0]).toFixed(1)} ${Yc(0).toFixed(1)}`;
  for (let i = 1; i <= N; i++) d += ` L ${Xc(rr[i]).toFixed(1)} ${Yc(i / N).toFixed(1)}`;
  for (let i = N; i >= 0; i--) d += ` L ${Xm(rr[i]).toFixed(1)} ${Yc(i / N).toFixed(1)}`;
  return { d: d + " Z", q };
}

// Compare on pts alone: rTop/rBot are only a fallback for an empty pts and are never edited. The
// handles go in as plain pairs — a design that has been through JSON has its {dt,dr} rebuilt, and
// key order must not decide this.
const ptKey = (q: Pt) =>
  JSON.stringify([q.t, q.r, !!q.sharp, q.ho ? [q.ho.dt, q.ho.dr] : 0, q.hi ? [q.hi.dt, q.hi.dr] : 0]);
const ptsKey = (pts: Pt[]) => (pts || []).map(ptKey).join("|");

/**
 * Key of the preset whose control points the design still matches exactly, or null once edited.
 * "Exactly" means what picking that chip yields FROM THIS DESIGN — a short body pushes a preset's
 * necks out to `NECK_MIN` on pick, and the chip must stay lit on the design it just made — so it
 * reads `presetDesign`, the same call that draws the picture. It is DERIVED rather than remembered
 * from the click, which is why undo, import and restore need no flag.
 *
 * Here rather than in the component because the lit state is half of "the picture is the shape you
 * have", and in a `.tsx` no gate could see it.
 */
export function matchPreset(p: Design): string | null {
  const key = ptsKey(p.pts);
  return PRESETS.find((pr) => ptsKey(presetDesign(pr, p).pts) === key)?.key ?? null;
}
