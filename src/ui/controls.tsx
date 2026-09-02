import React, { useEffect, useId, useRef, useState } from "react";
import { clamp } from "../util.ts";
import { useT } from "./theme.ts";

/** `key` is the row's identity for the shared drag highlight; `round` is the step and the snap. */
export type ScrubCfg = {
  key: string; label: string; value: number;
  min: number; max: number; round: number; unit: string;
  curve?: number; display?: string | number;
  onChange: (v: number) => void;
};
/** The row currently being dragged, by `key` — shared so only one row tints at a time. */
export type DragState = { drag: string | null; setDrag: (k: string | null) => void };

export function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  const t = useT();
  return (
    <div className="flex items-baseline justify-between mb-10">
      <b className="text-xs font-bold tracking-[0.14em] text-faint">{t(title)}</b>
      {hint && <i className="text-xs not-italic text-faintest">{t(hint)}</i>}
    </div>
  );
}

export function ScrubRow({ cfg, drag, setDrag }: { cfg: ScrubCfg } & DragState) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const { value, min, max, round, unit, curve } = cfg;
  const snap = (v: number) => clamp(min, max, +(Math.round(v / round) * round).toFixed(4));
  // Optional non-linear travel for a range far wider than the sizes anyone works at. `curve: k`
  // maps slider position u∈[0,1] to min+(max-min)·u^k: over 60–2000mm a linear slider spends 93% of
  // itself above 200mm, while k=2.5 gives 60–400mm half the bar. The input runs in u (0..U) only
  // when a curve is set; elsewhere exact mm, since a u-space step quantizes the arrow keys.
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
    <div data-active={drag === cfg.key}
      className="group flex items-center gap-10 min-h-44 py-4 data-[active=true]:bg-accent-06 narrow:p-0">
      <label htmlFor={id} className="flex-none whitespace-nowrap text-base text-text">{t(cfg.label)}</label>
      <input
        id={id} type="range" className="flex-auto min-w-60 narrow:h-44"
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
        <input ref={inputRef} type="number" inputMode="decimal" defaultValue={value}
          className="w-62 px-6 py-4 rounded-sm flex-none text-right bg-card border border-accent
            text-text font-mono text-base font-semibold"
          min={min} max={max} step={round}
          onKeyDown={(e) => { if (e.key === "Enter") commit(e.currentTarget.value); else if (e.key === "Escape") setEditing(false); }}
          onBlur={(e) => commit(e.currentTarget.value)} />
      ) : (
        <button onClick={() => setEditing(true)} title={t("クリックで数値を入力")}
          /* Follows the ROW's active state, which is what `group` on the row is for. */
          className="min-w-62 px-2 py-4 flex-none text-right bg-transparent border-0 text-text
            cursor-text font-mono text-base font-semibold hover:text-accent
            group-data-[active=true]:text-accent narrow:self-stretch narrow:py-0">
          {cfg.display ?? cfg.value}
          <span className="font-normal text-faintest"> {unit}</span>
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
    <button disabled={off} aria-label={`${t(label)} ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`}
      onClick={() => onChange(clamp(min, max, +(value + delta).toFixed(2)))}
      /* 26px to look at, 40x44 to hit: an overlay, since the box is what the row's spacing is
         built from. */
      className="w-26 h-26 p-0 rounded-sm flex items-center justify-center bg-card text-accent
        border border-accent-45 text-xl font-semibold leading-none cursor-pointer
        enabled:hover:bg-accent-08 disabled:bg-transparent disabled:text-faintest
        disabled:border-card-edge disabled:opacity-55 disabled:cursor-default
        narrow:relative narrow:after:content-[''] narrow:after:absolute
        narrow:after:-inset-y-7 narrow:after:-inset-x-9">{txt}</button>
  );
  return (
    <div className="flex items-center justify-between py-7">
      <span className="text-base text-text">{t(label)}</span>
      <div className="flex items-center gap-10">
        {sq("−", -step, value <= min)}
        <span className="min-w-44 text-center text-text font-mono text-md font-semibold">{children}</span>
        {sq("＋", step, value >= max)}
      </div>
    </div>
  );
}

/**
 * What an mm field DOES, shared by the two that look different — the box is NOT shared: `check:style`
 * reads class lists out of `className` attributes and out of ALLCAPS constants named inside one, so a
 * class list passed as a prop would still be in the DOM with nothing checking it.
 *
 * `key={value}` stays at each call site — spreading a `key` is a React warning — and it is what
 * re-mounts the field so `defaultValue` follows an external change (a drag).
 */
export function mmField(value: number, min: number, max: number, onChange: (v: number) => void) {
  return {
    type: "number" as const, defaultValue: value, min, max, step: 1,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      const v = Math.round(Number(e.target.value));
      onChange(Number.isFinite(v) && v > 0 ? clamp(min, max, v) : value);
    },
  };
}

export function NumInput({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number;
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-between mb-9">
      <span className="text-base text-text">{t(label)}</span>
      <div className="flex items-center gap-6">
        <input key={value} {...mmField(value, min, max, onChange)}
          className="w-66 px-8 py-6 rounded-md text-right bg-card border border-card-edge
            text-text font-mono text-md"
          aria-label={`${t(label)} (mm)`} />
        <span className="text-sm text-sub">mm</span>
      </div>
    </div>
  );
}

export function Checkbox({ checked, onToggle, label }: {
  checked: boolean; onToggle: () => void; label: string | React.ReactNode;
}) {
  const t = useT();
  return (
    <button role="checkbox" aria-checked={checked} onClick={onToggle}
      className="group flex items-center gap-9 w-full min-h-44 py-8 text-left bg-transparent
        border-0 [font:inherit] cursor-pointer">
      <span aria-hidden="true"
        className="w-18 h-18 flex-none rounded-xs text-base text-[#fff] flex items-center
          justify-center bg-card border border-[rgba(59,52,43,0.3)]
          group-aria-checked:bg-accent group-aria-checked:border-transparent">{checked ? "✓" : ""}</span>
      <span className="text-base text-text">{typeof label === "string" ? t(label) : label}</span>
    </button>
  );
}

/**
 * A small labelled button — undo/redo in the panel, "go to the print view" in the guide.
 * Deliberately no `variant` prop: a second look is an edit here.
 */
export function Button({ onClick, disabled, title, className = "", children }: {
  onClick: () => void; disabled?: boolean; title?: string;
  /** POSITION only — margin, alignment, order. Not a way to restyle the button from outside. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`${className} flex items-center gap-5 h-32 px-12 rounded-md font-sans text-base font-semibold
        whitespace-nowrap cursor-pointer transition-[background-color,border-color] duration-[130ms]
        border bg-card text-accent border-accent/40 hover:bg-[#fffaf5] hover:border-accent/55
        disabled:bg-transparent disabled:text-faintest disabled:border-card-edge
        disabled:opacity-55 disabled:cursor-default`}>
      {children}
    </button>
  );
}

/**
 * A status marker on something else — "beta" on a route, an optional badge on a kit item. All
 * `currentColor`, so a host needs nothing of its own, pressed state included.
 */
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <em className="ml-5 narrow:ml-3 px-4 border border-current rounded-xs text-2xs not-italic
      font-bold tracking-[0.04em] uppercase opacity-72 align-[1px]">{children}</em>
  );
}

/**
 * The look of one segmented option, without its BOX — the point bar wears the same skin at a
 * different size, and utilities do not override each other by string order, so each caller states
 * its own box rather than overriding a base.
 */
export const SEG_SKIN = "rounded-md cursor-pointer bg-card text-text border border-card-edge "
  + "font-sans text-base font-semibold hover:border-accent-45 "
  + "aria-pressed:bg-accent aria-pressed:text-[#fff] aria-pressed:border-accent";

/** One option of a segmented control (edit mode, smooth/corner). */
export function SegButton({ label, active, onClick }: {
  label: string | React.ReactNode; active: boolean; onClick: () => void;
}) {
  const t = useT();
  return (
    <button aria-pressed={active} onClick={onClick}
      className={`flex-1 px-4 py-7 ${SEG_SKIN}`}>
      {typeof label === "string" ? t(label) : label}
    </button>
  );
}

/** Full-width call to action at the foot of the panel. */
export function CTA({ label, onClick, outline }: { label: string; onClick: () => void; outline?: boolean }) {
  const t = useT();
  return (
    <button onClick={onClick}
      /* The border belongs to the OUTLINE branch, not the base: box-sizing is border-box, so a
         transparent 1px border on the filled one would make it 2px taller. */
      className={`w-full p-12 rounded-lg cursor-pointer font-sans text-md font-bold
        tracking-[0.08em] hover:brightness-[1.06] ${outline
          ? "bg-card text-accent border border-accent-5 shadow-none"
          : "bg-accent text-[#fff] border-0 shadow-[0_3px_10px_var(--color-accent-3)]"}`}>
      {t(label)}
    </button>
  );
}

/** The small-print look. Shared with the export manifest, which is a note that is not a `Note`. */
export const NOTE_SKIN = "text-xs leading-[1.6] text-faint [&_strong]:text-text";

/**
 * Small note under a control or CTA. Accepts rich children, so it is not translated here.
 * `className` REPLACES the default margin rather than adding to it — two margin utilities on one
 * element share a specificity, so the sheet's order would decide.
 */
export function Note({ children, className = "mt-9" }: { children?: React.ReactNode; className?: string }) {
  return <div className={`${NOTE_SKIN} ${className}`}>{children}</div>;
}
