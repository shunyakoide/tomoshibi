/**
 * ============================================================================
 * OVERFLOW MENU — the app-level actions that are not navigation
 * ============================================================================
 * A "☰" button and its popover, holding what acts on the APP or on the design AS A FILE — the intro
 * card, the language, backup save/restore, reset — as opposed to the design itself (the inspector)
 * or where you are in it (the two selects to its left).
 *
 * **The ☰ was a knowing departure from the convention and no longer is.** ☰ means a navigation
 * drawer and ⋯/⋮ an overflow of actions, and while this menu held only help, language, backup and
 * reset the convention said ⋯. It was a ☰ anyway, because ⋯ reads as "more options for the thing
 * next to me" while ☰ is read as "this app's menu" by everyone, and the case against hamburgers
 * (NN/g) is about hiding NAVIGATION, of which there was none in here.
 *
 * 「作り方」 is now a destination — a real page at `/guide` — so the rule that came with that
 * reasoning ("do not put a destination in here") is spent, and the glyph turns out not to have
 * needed protecting: a menu with a place to go in it is a navigation menu. **What the rule was
 * really guarding is what to keep: the app's primary navigation stays VISIBLE.** The two selects to
 * the left are never folded away. Do not fold a VIEW in here; a document may join the settings.
 *
 * What justified folding anything away was measured. On a 375px phone the chip bar in **English**
 * came to exactly 375px — view select 99 + route select 144 + two buttons 88 + 24 of gaps + 20 of
 * padding — with its flex spacer collapsed to ZERO. One 36px button in place of those two returns
 * 52px. **The binding language here is English, not Japanese**, which is the opposite of the usual
 * assumption in this project: re-measure both before adding anything to that bar.
 *
 * **Undo and redo deliberately stayed out.** They are the recovery path for a direct-manipulation
 * editor that fills the screen — the frequent case an overflow menu exists to make room FOR — and
 * they do not fit the bar either (`⋯` + undo + redo is 124px against 88 available in English).
 * ============================================================================
 */
import React, { useEffect, useRef, useState } from "react";

export type MenuItem =
  | { kind: "sep" }
  | {
      kind: "item";
      label: string;
      /** Right-aligned current value, for a row that is a setting rather than a verb. */
      value?: string;
      /** A second line under the label. Used where a title= would have been. */
      hint?: string;
      danger?: boolean;
      onClick: () => void;
    };

export default function OverflowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  // Whether this opening came from the keyboard. A pointer user who taps ☰ should not have a row
  // light up under a focus ring; a keyboard user must land inside the menu, or they Tab into a list
  // that just appeared. `detail === 0` is how a click says it came from Enter/Space.
  const [byKey, setByKey] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  // The indices that can hold focus, in DOM order — separators are skipped when arrowing.
  const focusable = items.map((it, i) => (it.kind === "item" ? i : -1)).filter((i) => i >= 0);

  // Close on a press anywhere outside. pointerdown rather than click, so the menu is already gone
  // by the time the press lands on whatever is underneath.
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
    // Escape is caught here as well as on the rows: opened by pointer, focus is still on the
    // trigger, and a menu you cannot dismiss from the keyboard is a trap.
    <div className="relative inline-flex" ref={box}
      onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); shut(); } }}>
      <button ref={btn} aria-haspopup="menu" aria-expanded={open}
        /* A rounded SQUARE, not a circle: it stands at the end of a row of view/route selects with
           the same `md` corners, and a lone circle read as a different kind of control. */
        className="w-36 h-36 p-0 rounded-md flex items-center justify-center
          bg-card text-sub border border-card-edge font-mono font-bold text-xl leading-none
          cursor-pointer hover:text-accent hover:border-accent-45"
        aria-label={label} title={label}
        onClick={(e) => { setByKey(e.detail === 0); setOpen((v) => !v); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setByKey(true); setOpen(true); } }}>
        {/* `display: block` so the svg brings no inline baseline gap of its own — with that, the
            flex centring above lands the box exactly, and the box is the mark. */}
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" className="block">
          <path d="M2.5 5h13M2.5 9h13M2.5 13h13" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label={label}
          /* Right-anchored: the trigger is the last thing in its row on both layouts, and a
             left-anchored popover would open off the edge of the phone. */
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
              // The action runs first: `onClick` may open a file picker, and that has to happen
              // inside the user gesture rather than after a state update has re-rendered the row away.
              onClick={() => { it.onClick(); setOpen(false); }}>
              <span className="flex-auto min-w-0 flex flex-col gap-2">
                {it.label}
                {/* The consequence line for the destructive row. It was a title= before, which a phone has not got. */}
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
