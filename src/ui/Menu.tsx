// The app's primary navigation stays VISIBLE: do not fold a VIEW in here — a document may.
import React, { useEffect, useRef, useState } from "react";

export type MenuItem =
  | { kind: "sep" }
  | {
      kind: "item";
      label: string;
      /** Right-aligned current value, for a row that is a setting rather than a verb. */
      value?: string;
      /** A second line under the label, for a row whose consequence needs stating. */
      hint?: string;
      danger?: boolean;
      onClick: () => void;
    };

export default function OverflowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  // Whether this opening came from the keyboard (`detail === 0` is how Enter/Space announces
  // itself): a tap must not light a row under a focus ring, a keyboard open must land in the menu.
  const [byKey, setByKey] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const focusable = items.map((it, i) => (it.kind === "item" ? i : -1)).filter((i) => i >= 0);

  // pointerdown rather than click, so the menu is gone by the time the press lands on what is under it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => { if (open && byKey) rows.current[focusable[0]]?.focus(); }, [open, byKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const shut = () => { setOpen(false); btn.current?.focus(); };

  const step = (from: number, d: number) => {
    const at = focusable.indexOf(from);
    const next = focusable[(at + d + focusable.length) % focusable.length];
    rows.current[next]?.focus();
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Escape") { e.preventDefault(); shut(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); step(i, 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); step(i, -1); }
    else if (e.key === "Home") { e.preventDefault(); rows.current[focusable[0]]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); rows.current[focusable[focusable.length - 1]]?.focus(); }
    else if (e.key === "Tab") setOpen(false);   // let focus leave, but do not leave a menu hanging open
  };

  return (
    // Escape is caught here as well as on the rows: after a pointer open focus is still on the trigger.
    <div className="relative inline-flex" ref={box}
      onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); shut(); } }}>
      <button ref={btn} aria-haspopup="menu" aria-expanded={open}
        className="w-36 h-36 p-0 rounded-md flex items-center justify-center
          bg-card text-sub border border-card-edge font-mono font-bold text-xl leading-none
          cursor-pointer hover:text-accent hover:border-accent-45"
        aria-label={label} title={label}
        onClick={(e) => { setByKey(e.detail === 0); setOpen((v) => !v); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setByKey(true); setOpen(true); } }}>
        {/* `block` so the svg brings no inline baseline gap and the flex centring lands exactly. */}
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" className="block">
          <path d="M2.5 5h13M2.5 9h13M2.5 13h13" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label={label}
          /* Right-anchored: the trigger is last in its row, so a left-anchored popover would open
             off the edge of the phone. */
          className="absolute top-[calc(100%+6px)] right-0 z-40 min-w-208 flex flex-col p-5
            bg-panel border border-edge rounded-xl shadow-[0_10px_28px_rgba(59,52,43,0.18)]">
          {items.map((it, i) => (it.kind === "sep" ? (
            <div key={`s${i}`} className="h-1 mx-6 my-5 bg-edge" role="separator" />
          ) : (
            <button key={it.label} role="menuitem" tabIndex={-1}
              ref={(n) => { rows.current[i] = n; }}
              className={`flex items-center gap-10 min-h-44 px-10 py-6 bg-transparent border-0
                rounded-md cursor-pointer text-left font-sans text-base
                ${it.danger ? "text-warn hover:bg-warn-08 hover:text-warn"
                            : "text-text hover:bg-accent-06 hover:text-accent"}`}
              onKeyDown={(e) => onKey(e, i)}
              // The action runs FIRST: it may open a file picker, which needs the row still mounted.
              onClick={() => { it.onClick(); setOpen(false); }}>
              <span className="flex-auto min-w-0 flex flex-col gap-2">
                {it.label}
                {it.hint && <em className="not-italic text-xs leading-[1.35] text-faint">{it.hint}</em>}
              </span>
              {it.value && <span className="flex-none font-mono text-sm text-faint">{it.value}</span>}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}
