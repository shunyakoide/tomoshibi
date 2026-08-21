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
import { clamp } from "../util.js";
import { useT } from "./theme.js";

/** Small caps section heading, with an optional hint on the right. */
export function SectionLabel({ title, hint }) {
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
export function ScrubRow({ cfg, drag, setDrag }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const id = useId();
  const { value, min, max, round, unit } = cfg;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const snap = (v) => clamp(min, max, +(Math.round(v / round) * round).toFixed(4));

  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  const commit = (raw) => {
    const v = Number(raw);
    if (Number.isFinite(v)) cfg.onChange(snap(v));
    setEditing(false);
  };

  return (
    <div className="scrub-row" data-active={drag === cfg.key}>
      <label htmlFor={id}>{t(cfg.label)}</label>
      <input
        id={id} type="range" min={min} max={max} step={round} value={value}
        aria-label={`${t(cfg.label)} (${unit})`} aria-valuetext={`${cfg.display ?? value} ${unit}`}
        onChange={(e) => cfg.onChange(snap(+e.target.value))}
        onPointerDown={() => setDrag(cfg.key)}
        onPointerUp={() => setDrag(null)}
        onFocus={() => setDrag(cfg.key)}
        onBlur={() => setDrag(null)}
        style={{ "--pct": pct + "%" }}
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
export function Stepper({ label, value, min, max, step, onChange, children }) {
  const t = useT();
  const sq = (txt, delta, off) => (
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
export function NumInput({ label, value, onChange, min, max }) {
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
export function Checkbox({ checked, onToggle, label }) {
  const t = useT();
  return (
    <button className="check" role="checkbox" aria-checked={checked} onClick={onToggle}>
      <span className="check-box" aria-hidden="true">{checked ? "✓" : ""}</span>
      <span className="check-label">{typeof label === "string" ? t(label) : label}</span>
    </button>
  );
}

/** One option of a segmented control (edit mode, smooth/corner). */
export function SegButton({ label, active, onClick }) {
  const t = useT();
  return (
    <button className="seg" aria-pressed={active} onClick={onClick}>
      {typeof label === "string" ? t(label) : label}
    </button>
  );
}

/** Full-width call to action at the foot of the panel. */
export function CTA({ label, onClick, outline }) {
  const t = useT();
  return <button className={outline ? "cta cta--outline" : "cta"} onClick={onClick}>{t(label)}</button>;
}

/** Small note under a control or CTA. Accepts rich children, so it is not translated here. */
export function Note({ children, style }) {
  return <div className="note" style={{ marginTop: 9, ...style }}>{children}</div>;
}
