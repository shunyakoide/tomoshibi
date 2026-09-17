/**
 * The chip's miniature of a preset — the same `outerR` the 3D view and the section draw, sampled 41
 * times and normalized to the 60×46 viewBox `PresetChips` gives it.
 *
 * **A plain `.ts` and not part of the chip, so a gate can import it.** The check scripts are run by
 * plain node, which cannot load a `.tsx` at all, and this function had the one bug that matters here
 * for two of the three chips: it built its design from `pr.pts` raw while the pick and `matchPreset`
 * went through `presetPts`, so the picture was of a shape the app will not build (`たまご` ⌀38 and
 * `平丸` ⌀46 against the ⌀52 either one yields). It returns the DESIGN it drew along with the path,
 * which is what `check:persist` asserts against — a drawing that stops flooring fails there rather
 * than on screen.
 */
import { outerR } from "../geometry.ts";
import { DEFAULTS } from "../config.ts";
import { presetPts, presetHeight } from "./pointEdit.ts";
import type { Preset } from "../config.ts";
import type { Design } from "../types.ts";

export function presetMini(pr: Preset, height: number): { d: string; q: Design } {
  // A whole design, not just the four fields the curve needs: `outerR` reads the neck flags and, on
  // a neck-less end, the koma size derived from the rib count. And the points AND HEIGHT the pick
  // would give, which is the whole of `presetPts` / `presetHeight` — the caller passes the maker's
  // height and does not decide whether this preset keeps it.
  const H = presetHeight(pr, height);
  const q: Design = { ...DEFAULTS, height: H, rTop: pr.rTop, rBot: pr.rBot, pts: presetPts(pr, H) };
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
