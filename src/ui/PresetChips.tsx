/**
 * ============================================================================
 * SHAPE PRESET CHIPS
 * ============================================================================
 * The three starting shapes, each drawn as a miniature of its own profile rather than a generic
 * icon — the silhouette on the chip is the silhouette you get, sampled through the same `outerR`
 * the 3D view and the STL use.
 *
 * They are TEMPLATES, not modes: picking one replaces the control points and you then edit the
 * curve freely in the section view. The subheading says so, because three chips on their own read
 * as "the shape is one of these three".
 *
 * Which chip is lit follows from that: it is DERIVED from the current control points (matchPreset),
 * not remembered from the click. Once the curve has been edited the chip goes dark, because a lit
 * chip on a shape that no longer resembles it is the "one of these three" misreading again. Deriving
 * it also means undo/redo, importing a design and restoring from localStorage are all right for
 * free -- there is no flag for an edit path to forget to clear (and every edit path would have to).
 * ============================================================================
 */
import React from "react";
import { outerR } from "../geometry.ts";
import { DEFAULTS, PRESETS } from "../config.ts";
import { FS, useT } from "./theme.ts";
import { SectionLabel } from "./controls.tsx";
import type { Preset } from "../config.ts";
import type { Design, Pt } from "../types.ts";

// Miniature of a preset's profile: sample the radius, then trace down the right side and back up
// the left. Box is 60×46 with the body inset, so all three read at the same scale.
function miniPath(pr: Preset): string {
  // A whole design, not just the four fields the curve needs: `outerR` reads the neck flags and,
  // on a neck-less end, the koma size derived from the rib count. The icon has always been drawn
  // with the neck on both ends (the flags default to true when absent), which is what DEFAULTS
  // says too — so the curve is the one it always was, now with nothing left undefined.
  const q: Design = { ...DEFAULTS, height: 280, rTop: pr.rTop, rBot: pr.rBot, pts: pr.pts };
  const N = 40, rr: number[] = [];
  let mx = 0;
  for (let i = 0; i <= N; i++) { const r = outerR(q, i / N); rr.push(r); if (r > mx) mx = r; }
  const kx = 16 / mx;
  const Xc = (r: number) => 30 + r * kx, Xm = (r: number) => 30 - r * kx, Yc = (t: number) => 42 - t * 36;
  let d = `M ${Xc(rr[0]).toFixed(1)} ${Yc(0).toFixed(1)}`;
  for (let i = 1; i <= N; i++) d += ` L ${Xc(rr[i]).toFixed(1)} ${Yc(i / N).toFixed(1)}`;
  for (let i = N; i >= 0; i--) d += ` L ${Xm(rr[i]).toFixed(1)} ${Yc(i / N).toFixed(1)}`;
  return d + " Z";
}

// Compare on pts alone: they are the silhouette. rTop/rBot are only a fallback for an empty pts
// (see config.ts) and are never edited, so a design whose curve matches a preset should light its
// chip regardless of what they hold. Handles are compared as plain pairs -- a design that has been
// through JSON has its {dt,dr} rebuilt, and key order must not decide this.
const ptKey = (q: Pt) =>
  JSON.stringify([q.t, q.r, !!q.sharp, q.ho ? [q.ho.dt, q.ho.dr] : 0, q.hi ? [q.hi.dt, q.hi.dr] : 0]);
const ptsKey = (pts: Pt[]) => (pts || []).map(ptKey).join("|");

// Key of the preset whose control points the design still matches exactly, or null once edited.
export function matchPreset(p: Design): string | null {
  const key = ptsKey(p.pts);
  return PRESETS.find((pr) => ptsKey(pr.pts) === key)?.key ?? null;
}

export default function PresetChips({ p, onPick }: { p: Design; onPick: (pr: Preset) => void }) {
  const t = useT();
  const active = matchPreset(p);
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel title="形" hint="ひな形 · 選んでから断面で調整" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
        {PRESETS.map((pr) => {
          const on = active === pr.key;
          return (
            <button key={pr.key} className="chip" aria-pressed={on} onClick={() => onPick(pr)}>
              <svg viewBox="0 0 60 46" style={{ width: 40, height: 32, display: "block" }} aria-hidden="true">
                <path d={miniPath(pr)} fill={on ? "rgba(255,255,255,0.25)" : "rgba(59,52,43,0.05)"}
                  stroke={on ? "#fff" : "#8a7c66"} strokeWidth="2" />
              </svg>
              <span style={{ fontSize: FS.sm, fontWeight: 500 }}>{t(pr.name)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
