/**
 * ============================================================================
 * INSPECTOR CONTROLS
 * ============================================================================
 * The small labelled controls the right-hand panel is built from. They used to be closures defined
 * inside HarigataStudio's render, which meant they were rebuilt on every keystroke and each one had
 * to be handed the palette and the translator by hand.
 *
 * All of them are native interactive elements (<input>, <button>) rather than styled <div>s, so
 * keyboard, screen readers and touch targets work without re-implementing any of it. Minimum touch
 * target is 44px where the control is the primary way to change a value.
 * ============================================================================
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { clamp } from "../util.js";
import { UI, accent, mono, sans, useT } from "./theme.js";

/** Small caps section heading, with an optional hint on the right. */
export function SectionLabel({ title, hint }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", color: UI.faint }}>{t(title)}</span>
      {hint && <span style={{ fontSize: 10, color: UI.faintest }}>{t(hint)}</span>}
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
  const on = drag === cfg.key;
  const snap = (v) => clamp(min, max, +(Math.round(v / round) * round).toFixed(4));

  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  const commit = (raw) => {
    const v = Number(raw);
    if (Number.isFinite(v)) cfg.onChange(snap(v));
    setEditing(false);
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "4px 0",
      background: on ? "rgba(217,91,24,0.06)" : "transparent",
    }}>
      <label htmlFor={id} style={{ fontSize: 12.5, color: UI.text, flex: "0 0 auto", whiteSpace: "nowrap" }}>
        {t(cfg.label)}
      </label>
      <input
        id={id} type="range" min={min} max={max} step={round} value={value}
        aria-label={`${t(cfg.label)} (${unit})`} aria-valuetext={`${cfg.display ?? value} ${unit}`}
        onChange={(e) => cfg.onChange(snap(+e.target.value))}
        onPointerDown={() => setDrag(cfg.key)}
        onPointerUp={() => setDrag(null)}
        onFocus={() => setDrag(cfg.key)}
        onBlur={() => setDrag(null)}
        style={{ flex: "1 1 auto", minWidth: 60, "--pct": pct + "%", "--fill": accent, "--track": "#ccd2da" }}
      />
      {editing ? (
        <input
          ref={inputRef} type="number" inputMode="decimal" defaultValue={value}
          min={min} max={max} step={round}
          onKeyDown={(e) => { if (e.key === "Enter") commit(e.currentTarget.value); else if (e.key === "Escape") setEditing(false); }}
          onBlur={(e) => commit(e.currentTarget.value)}
          style={{
            width: 62, padding: "4px 6px", textAlign: "right", fontFamily: mono, fontSize: 12.5, fontWeight: 600,
            color: UI.text, background: "#fff", border: `1px solid ${accent}`, borderRadius: 6, flex: "0 0 auto",
          }} />
      ) : (
        <button onClick={() => setEditing(true)} title={t("クリックで数値を入力")} style={{
          minWidth: 62, textAlign: "right", fontFamily: mono, fontSize: 12.5, fontWeight: 600,
          color: on ? accent : UI.text, background: "transparent", border: "none", cursor: "text",
          padding: "4px 2px", flex: "0 0 auto",
        }}>
          {cfg.display ?? cfg.value}
          <span style={{ color: UI.faintest, fontWeight: 400 }}> {unit}</span>
        </button>
      )}
    </div>
  );
}

/** ± stepper for discrete values. `children` is the formatted readout between the buttons. */
export function Stepper({ label, value, min, max, step, onChange, children }) {
  const t = useT();
  const sq = (txt, delta, off) => (
    <button onClick={off ? undefined : () => onChange(clamp(min, max, +(value + delta).toFixed(2)))} disabled={off}
      aria-label={`${t(label)} ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`}
      style={{
        width: 26, height: 26, borderRadius: 7, cursor: off ? "default" : "pointer",
        background: UI.card, color: off ? UI.faintest : accent,
        border: `1px solid ${off ? UI.cardEdge : "rgba(217,91,24,0.45)"}`, fontSize: 15, fontWeight: 600, lineHeight: 1,
        opacity: off ? 0.5 : 1, padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
      }}>{txt}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0" }}>
      <span style={{ fontSize: 12.5, color: UI.text }}>{t(label)}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {sq("−", -step, value <= min)}
        <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: UI.text, minWidth: 44, textAlign: "center" }}>
          {children}
        </span>
        {sq("＋", step, value >= max)}
      </div>
    </div>
  );
}

/** Numeric field in mm. Commits and clamps on Enter / blur (never mid-typing). */
export function NumInput({ label, value, onChange, min, max }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
      <span style={{ fontSize: 12.5, color: UI.text }}>{t(label)}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* key={value} re-mounts on an external change so defaultValue follows it */}
        <input key={value} type="number" defaultValue={value} min={min} max={max} step={1}
          aria-label={`${t(label)} (mm)`}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onBlur={(e) => {
            const v = Math.round(Number(e.target.value));
            onChange(Number.isFinite(v) && v > 0 ? clamp(min, max, v) : value);
          }}
          style={{
            width: 66, padding: "6px 8px", borderRadius: 8, textAlign: "right",
            fontFamily: mono, fontSize: 13, color: UI.text,
            background: UI.card, border: `1px solid ${UI.cardEdge}`,
          }} />
        <span style={{ fontSize: 11, color: UI.sub }}>mm</span>
      </div>
    </div>
  );
}

/** Checkbox as a real <button role="checkbox">, so Tab/Space/Enter and screen readers work. */
export function Checkbox({ checked, onToggle, label }) {
  const t = useT();
  return (
    <button role="checkbox" aria-checked={checked} onClick={onToggle} style={{
      display: "flex", alignItems: "center", gap: 9, padding: "8px 0", minHeight: 44,
      width: "100%", textAlign: "left", background: "transparent", border: "none",
      font: "inherit", cursor: "pointer",
    }}>
      <span aria-hidden="true" style={{
        width: 18, height: 18, borderRadius: 5, flex: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: "#fff",
        background: checked ? accent : UI.card,
        border: checked ? "none" : "1px solid rgba(59,52,43,0.3)",
      }}>{checked ? "✓" : ""}</span>
      <span style={{ fontSize: 12.5, color: UI.text }}>{typeof label === "string" ? t(label) : label}</span>
    </button>
  );
}

/** One option of a segmented control (edit mode, smooth/corner, output method). */
export function SegButton({ label, active, onClick, style }) {
  const t = useT();
  return (
    <button onClick={onClick} aria-pressed={active} style={{
      flex: 1, padding: "7px 4px", fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer",
      borderRadius: 8, background: active ? accent : UI.card, color: active ? "#fff" : UI.text,
      border: "1px solid " + (active ? accent : UI.cardEdge), ...style,
    }}>{typeof label === "string" ? t(label) : label}</button>
  );
}

/** Full-width call to action at the foot of the panel. `variant`: "solid" (primary) | "outline". */
export function CTA({ label, onClick, variant = "solid" }) {
  const t = useT();
  const solid = variant === "solid";
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: 12, borderRadius: 10, cursor: "pointer",
      fontFamily: sans, fontSize: 13.5, fontWeight: 700, letterSpacing: "0.08em",
      background: solid ? accent : "#fff", color: solid ? "#fff" : accent,
      border: solid ? "none" : "1px solid rgba(217,91,24,0.5)",
      boxShadow: solid ? "0 3px 10px rgba(217,91,24,0.3)" : "none",
    }}>{t(label)}</button>
  );
}

/** Small note under a control or CTA. Accepts rich children, so it is not translated here. */
export function Note({ children, style }) {
  return (
    <div style={{ fontSize: 10.5, color: UI.faint, lineHeight: 1.6, marginTop: 9, ...style }}>{children}</div>
  );
}
