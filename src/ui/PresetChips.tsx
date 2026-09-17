/**
 * Starting shapes, each drawn as a miniature of its own profile through the same `outerR` as the 3D
 * view. They are TEMPLATES, not modes, so which chip is lit is DERIVED from the control points
 * (`matchPreset`) rather than remembered from the click — undo, import and restore then need no flag.
 */
import { PRESETS } from "../config.ts";
import { useT } from "./theme.ts";
import { presetMini, matchPreset } from "./presetChip.ts";
import { SectionLabel } from "./controls.tsx";
import type { Preset } from "../config.ts";
import type { Design } from "../types.ts";

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
                {/* The whole design goes in, not a height: a pick replaces rTop/rBot/pts and (for a
                    ratio preset) the height, and leaves the maker's necks and rib count alone — all
                    of which `outerR` reads. `presetDesign` is the one place that says so. */}
                <path d={presetMini(pr, p).d} fill={on ? "rgba(255,255,255,0.25)" : "rgba(59,52,43,0.05)"}
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
