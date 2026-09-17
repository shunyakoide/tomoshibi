/**
 * Starting shapes, each drawn as a miniature of its own profile through the same `outerR` as the 3D
 * view. They are TEMPLATES, not modes, so which chip is lit is DERIVED from the control points
 * (`matchPreset`) rather than remembered from the click — undo, import and restore then need no flag.
 */
import { PRESETS } from "../config.ts";
import { useT } from "./theme.ts";
import { presetPts } from "./pointEdit.ts";
import { presetMini } from "./presetMini.ts";
import { SectionLabel } from "./controls.tsx";
import type { Preset } from "../config.ts";
import type { Design, Pt } from "../types.ts";

// Compare on pts alone: rTop/rBot are only a fallback for an empty pts and are never edited. The
// handles go in as plain pairs — a design that has been through JSON has its {dt,dr} rebuilt, and
// key order must not decide this.
const ptKey = (q: Pt) =>
  JSON.stringify([q.t, q.r, !!q.sharp, q.ho ? [q.ho.dt, q.ho.dr] : 0, q.hi ? [q.hi.dt, q.hi.dr] : 0]);
const ptsKey = (pts: Pt[]) => (pts || []).map(ptKey).join("|");

// Key of the preset whose control points the design still matches exactly, or null once edited.
// "Exactly" means what picking the chip yields from THIS design: a short body pushes a preset's necks
// out to NECK_MIN on pick, and the chip must stay lit on the design it just made. The height is
// `presetPts`'s to resolve, so the chip is lit by the same call that DRAWS it — a preset carrying its
// own height (`平丸`) otherwise stayed lit at a body height whose silhouette the chip was not showing.
export function matchPreset(p: Design): string | null {
  const key = ptsKey(p.pts);
  return PRESETS.find((pr) => ptsKey(presetPts(pr, p.height)) === key)?.key ?? null;
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
                {/* The maker's height goes in; `presetMini` decides whether this preset keeps it
                    (`presetHeight`), exactly as `matchPreset` and `onPick` do. */}
                <path d={presetMini(pr, p.height).d} fill={on ? "rgba(255,255,255,0.25)" : "rgba(59,52,43,0.05)"}
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
