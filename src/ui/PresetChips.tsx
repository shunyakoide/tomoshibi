/**
 * Starting shapes, each drawn as a miniature of its own profile through the same `outerR` as the 3D
 * view. They are TEMPLATES, not modes, so which chip is lit is DERIVED from the control points
 * (`matchPreset`) rather than remembered from the click — undo, import and restore then need no flag.
 */
import React from "react";
import { outerR } from "../geometry.ts";
import { DEFAULTS, PRESETS } from "../config.ts";
import { useT } from "./theme.ts";
import { SectionLabel } from "./controls.tsx";
import type { Preset } from "../config.ts";
import type { Design, Pt } from "../types.ts";

function miniPath(pr: Preset): string {
  // A whole design, not just the four fields the curve needs: `outerR` reads the neck flags and, on
  // a neck-less end, the koma size derived from the rib count.
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

// Compare on pts alone: rTop/rBot are only a fallback for an empty pts and are never edited. The
// handles go in as plain pairs — a design that has been through JSON has its {dt,dr} rebuilt, and
// key order must not decide this.
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
    <div className="mb-20">
      <SectionLabel title="形" hint="ひな形 · 選んでから断面で調整" />
      <div className="grid grid-cols-[repeat(4,1fr)] gap-7">
        {PRESETS.map((pr) => {
          const on = active === pr.key;
          return (
            <button key={pr.key} aria-pressed={on} onClick={() => onPick(pr)}
              className="flex flex-col items-center gap-4 pt-8 px-4 pb-7 rounded-lg cursor-pointer
                font-sans bg-card text-text border border-card-edge hover:border-accent-45
                aria-pressed:bg-accent aria-pressed:text-[#fff] aria-pressed:border-accent
                aria-pressed:shadow-[0_3px_8px_var(--color-accent-25)]">
              <svg viewBox="0 0 60 46" className="w-40 h-32 block" aria-hidden="true">
                <path d={miniPath(pr)} fill={on ? "rgba(255,255,255,0.25)" : "rgba(59,52,43,0.05)"}
                  stroke={on ? "#fff" : "#8a7c66"} strokeWidth="2" />
              </svg>
              <span className="text-sm font-medium">{t(pr.name)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
