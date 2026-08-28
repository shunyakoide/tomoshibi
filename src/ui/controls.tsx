/**
 * ============================================================================
 * INSPECTOR CONTROLS
 * ============================================================================
 * The small labelled controls the right-hand panel is built from. They used to be closures defined
 * inside TomoshibiStudio's render, rebuilt on every keystroke, each carrying an inline style object
 * with a ternary per property for its active state.
 *
 * The looks now live in index.css (.btn, .seg, .scrub-row …), which is what makes :hover, :active
 * and :disabled possible at all — an inline style cannot express them. What stays inline is only
 * what genuinely varies per instance.
 *
 * All of them are native interactive elements (<input>, <button>) rather than styled <div>s, so
 * keyboard, screen readers and touch targets work without re-implementing any of it. Minimum touch
 * target is 44px wherever the control is the primary way to change a value.
 * ============================================================================
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { clamp } from "../util.ts";
import { useT } from "./theme.ts";

/**
 * What a scrub row edits. `key` is the row's identity for the shared drag highlight (which row is
 * currently being pulled), `display` an optional pre-formatted readout, and `curve` the optional
 * non-linear travel documented below.
 */
export type ScrubCfg = {
  key: string; label: string; value: number;
  min: number; max: number; round: number; unit: string;
  curve?: number; display?: string | number;
  onChange: (v: number) => void;
};
/** The row currently being dragged, by `key` — or null. Shared so only one row tints at a time. */
export type DragState = { drag: string | null; setDrag: (k: string | null) => void };

/** Small caps section heading, with an optional hint on the right. */
export function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  const t = useT();
  return (
    <div className="sec-label">
      <b>{t(title)}</b>
      {hint && <i>{t(hint)}</i>}
    </div>
  );
}

/**
 * A labelled parameter: a native range slider with a filled track, plus a value you can click to
 * type an exact number. (It replaced a drag-only "scrub" row that had no track, no keyboard access
 * and no direct entry — hence the name.)
 *   cfg: { key, label, value, min, max, round, unit, display?, onChange }   round = step / snap quantum
 *   drag/setDrag: shared highlight state, so the row tints while this control is the active one.
 */
export function ScrubRow({ cfg, drag, setDrag }: { cfg: ScrubCfg } & DragState) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const { value, min, max, round, unit, curve } = cfg;
  const snap = (v: number) => clamp(min, max, +(Math.round(v / round) * round).toFixed(4));
  // Optional non-linear travel, for a row whose range spans far more than the sizes anyone
  // actually works at. `curve: k` maps slider position u∈[0,1] to min+(max-min)·u^k, so the small
  // end gets the travel: over 60–2000mm a linear slider spends 93% of itself above 200mm, while
  // k=2.5 gives 60–400mm — where nearly every lantern lives — half the bar. The input runs in u
  // (0..U) only when a curve is set; every other row keeps its exact mm markup, because there a
  // u-space step would quantize the arrow keys into doing nothing and then jumping.
  const U = 1000;
  const bent = curve !== undefined && curve > 1 && max > min;
  const toU = (v: number) => Math.round(U * Math.pow(Math.max(0, (v - min) / (max - min)), 1 / curve!));
  const toV = (u: number) => min + (max - min) * Math.pow(u / U, curve!);
  const pct = max > min ? (bent ? toU(value) / U : (value - min) / (max - min)) * 100 : 0;

  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  const commit = (raw: string) => {
    const v = Number(raw);
    if (Number.isFinite(v)) cfg.onChange(snap(v));
    setEditing(false);
  };

  return (
    <div className="scrub-row" data-active={drag === cfg.key}>
      <label htmlFor={id}>{t(cfg.label)}</label>
      <input
        id={id} type="range"
        min={bent ? 0 : min} max={bent ? U : max} step={bent ? 1 : round} value={bent ? toU(value) : value}
        aria-label={`${t(cfg.label)} (${unit})`} aria-valuetext={`${cfg.display ?? value} ${unit}`}
        onChange={(e) => cfg.onChange(snap(bent ? toV(+e.target.value) : +e.target.value))}
        onPointerDown={() => setDrag(cfg.key)}
        onPointerUp={() => setDrag(null)}
        onFocus={() => setDrag(cfg.key)}
        onBlur={() => setDrag(null)}
        // A CSS custom property drives the filled track; CSSProperties has no slot for one.
        style={{ "--pct": pct + "%" } as React.CSSProperties}
      />
      {editing ? (
        <input ref={inputRef} className="val-field" type="number" inputMode="decimal" defaultValue={value}
          min={min} max={max} step={round}
          onKeyDown={(e) => { if (e.key === "Enter") commit(e.currentTarget.value); else if (e.key === "Escape") setEditing(false); }}
          onBlur={(e) => commit(e.currentTarget.value)} />
      ) : (
        <button className="val-btn" onClick={() => setEditing(true)} title={t("クリックで数値を入力")}>
          {cfg.display ?? cfg.value}
          <span className="unit-soft"> {unit}</span>
        </button>
      )}
    </div>
  );
}

/** ± stepper for discrete values. `children` is the formatted readout between the buttons. */
export function Stepper({ label, value, min, max, step, onChange, children }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; children?: React.ReactNode;
}) {
  const t = useT();
  const sq = (txt: string, delta: number, off: boolean) => (
    <button className="step-btn" disabled={off} aria-label={`${t(label)} ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`}
      onClick={() => onChange(clamp(min, max, +(value + delta).toFixed(2)))}>{txt}</button>
  );
  return (
    <div className="row">
      <span className="row-label">{t(label)}</span>
      <div className="step-group">
        {sq("−", -step, value <= min)}
        <span className="step-val">{children}</span>
        {sq("＋", step, value >= max)}
      </div>
    </div>
  );
}

/** Numeric field in mm. Commits and clamps on Enter / blur (never mid-typing). */
export function NumInput({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number;
}) {
  const t = useT();
  return (
    <div className="field-row">
      <span className="row-label">{t(label)}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* key={value} re-mounts on an external change so defaultValue follows it */}
        <input key={value} className="mm-field" type="number" defaultValue={value} min={min} max={max} step={1}
          aria-label={`${t(label)} (mm)`}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onBlur={(e) => {
            const v = Math.round(Number(e.target.value));
            onChange(Number.isFinite(v) && v > 0 ? clamp(min, max, v) : value);
          }} />
        <span className="unit">mm</span>
      </div>
    </div>
  );
}

/** Checkbox as a real <button role="checkbox">, so Tab/Space/Enter and screen readers work. */
export function Checkbox({ checked, onToggle, label }: {
  checked: boolean; onToggle: () => void; label: string | React.ReactNode;
}) {
  const t = useT();
  return (
    <button className="check" role="checkbox" aria-checked={checked} onClick={onToggle}>
      <span className="check-box" aria-hidden="true">{checked ? "✓" : ""}</span>
      <span className="check-label">{typeof label === "string" ? t(label) : label}</span>
    </button>
  );
}

/** One option of a segmented control (edit mode, smooth/corner). */
export function SegButton({ label, active, onClick }: {
  label: string | React.ReactNode; active: boolean; onClick: () => void;
}) {
  const t = useT();
  return (
    <button className="seg" aria-pressed={active} onClick={onClick}>
      {typeof label === "string" ? t(label) : label}
    </button>
  );
}

/** Full-width call to action at the foot of the panel. */
export function CTA({ label, onClick, outline }: { label: string; onClick: () => void; outline?: boolean }) {
  const t = useT();
  return <button className={outline ? "cta cta--outline" : "cta"} onClick={onClick}>{t(label)}</button>;
}

/** Small note under a control or CTA. Accepts rich children, so it is not translated here. */
export function Note({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="note" style={{ marginTop: 9, ...style }}>{children}</div>;
}
