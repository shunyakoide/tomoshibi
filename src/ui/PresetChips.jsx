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
 * ============================================================================
 */
import React from "react";
import { outerR } from "../geometry.js";
import { PRESETS } from "../config.js";
import { useT } from "./theme.js";
import { SectionLabel } from "./controls.jsx";

// Miniature of a preset's profile: sample the radius, then trace down the right side and back up
// the left. Box is 60×46 with the body inset, so all three read at the same scale.
function miniPath(pr) {
  const q = { height: 280, rTop: pr.rTop, rBot: pr.rBot, pts: pr.pts };
  const N = 40, rr = [];
  let mx = 0;
  for (let i = 0; i <= N; i++) { const r = outerR(q, i / N); rr.push(r); if (r > mx) mx = r; }
  const kx = 16 / mx;
  const Xc = (r) => 30 + r * kx, Xm = (r) => 30 - r * kx, Yc = (t) => 42 - t * 36;
  let d = `M ${Xc(rr[0]).toFixed(1)} ${Yc(0).toFixed(1)}`;
  for (let i = 1; i <= N; i++) d += ` L ${Xc(rr[i]).toFixed(1)} ${Yc(i / N).toFixed(1)}`;
  for (let i = N; i >= 0; i--) d += ` L ${Xm(rr[i]).toFixed(1)} ${Yc(i / N).toFixed(1)}`;
  return d + " Z";
}

export default function PresetChips({ active, onPick }) {
  const t = useT();
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
              <span style={{ fontSize: 11, fontWeight: 500 }}>{t(pr.name)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
