/**
 * ============================================================================
 * OVERFLOW MENU — the app-level actions that are not navigation
 * ============================================================================
 * A "☰" button and the popover it opens. It holds the handful of things that act on the APP or on
 * the design AS A FILE — the intro card, the language, JSON export/import, reset — as opposed to
 * the design itself (the inspector) or where you are in it (the two selects to its left).
 *
 * **The ☰ was a knowing departure from the convention and no longer is.** ☰ means a navigation
 * drawer and ⋯/⋮ means an overflow of actions, and when this menu held only help, language, backup
 * and reset, the convention said ⋯. It was a ☰ anyway, because ⋯ is materially harder to find — it
 * reads as "more options for the thing next to me" — while ☰ is read as "this app's menu" by
 * everyone, and the case against hamburgers (NN/g) is about hiding NAVIGATION, of which there was
 * none in here. The rule written alongside that reasoning was "do not put a destination in here".
 *
 * 「作り方」 is now a destination — a real page at `/guide` with an address of its own (src/route.ts)
 * — so that rule is spent, and the glyph it was protecting turns out not to have needed protecting:
 * a menu with one place to go in it is a navigation menu, which is what ☰ has meant all along. What
 * remains true is the thing the rule was really guarding, so keep this instead: **the app's primary
 * navigation stays VISIBLE.** The two selects to the left are how you move between views and they
 * are never folded away; what may live in here is the occasional document, alongside the settings.
 *
 * What justifies folding them away at all is space, measured rather than assumed: on a 375px phone
 * the chip bar in ENGLISH came to exactly 375px — the view select (99, "Assembly") + the route
 * select (144, "Cardboard (beta)") + the "?" and language buttons (88) + gaps (24) + padding (20) —
 * with its flex spacer collapsed to zero. Japanese, whose labels are shorter (64 / 129), had 55px to
 * spare. One 36px button in place of those two hands back 52px / 47px, and the row that carries the
 * app's top-level navigation stops being full in the language that fills it.
 *
 * Undo and redo deliberately did NOT move in here. They are the recovery path for the direct-
 * manipulation editor that fills the screen, and an overflow menu is for what is rare.
 *
 * The trigger's ☰ is DRAWN, not typed. U+2630 is not in the mono stack this button asks for, so it
 * fell through to whatever the platform substitutes, and a substituted glyph sits wherever THAT
 * font's metrics put it in the em box: measured in Chrome on macOS, the ink landed ~2px below and
 * ~1px right of the centre of the 36px square, which is plainly visible at that size.
 * `align-items: center` cannot fix it — that centres the LINE BOX, and the glyph is off-centre
 * inside the line box. Nudging with padding or line-height only moves the error to the next
 * platform, since the substituted face differs per OS (Apple Symbols here, Segoe UI Symbol on
 * Windows) and none of them agrees on where in the em to sit. Three strokes in an SVG are centred
 * because they are drawn centred, on every platform — 0.00px on both axes, against the button's own
 * box — and the app already draws its marks this way (Logo, the section editor's legend).
 *
 * Rules of the shape:
 * - **Every row carries a text label.** The trigger is the only icon-only control, and it has an
 *   `aria-label`; a menu of glyphs would just be the discoverability problem one level deeper.
 * - **The destructive row is separated and states its consequence.** Reset sits below a rule, in
 *   warn colour, with the sentence that used to be its `title=` as a second line — a tooltip is not
 *   a thing a phone has.
 * - **A row is 44px.** This is the one place in the app where new touch targets were being drawn
 *   from scratch, so they are drawn at the size the guidelines ask for rather than the 36 the older
 *   header buttons grew to.
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
  // Whether this opening came from the keyboard. A pointer user who taps "⋯" should not have a row
  // light up under a focus ring; a keyboard user must land inside the menu or they have to Tab into
  // a list that just appeared. `detail === 0` is how a click says it came from Enter/Space.
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
    // Escape is caught here rather than on the rows: opened by pointer, focus is still on the
    // trigger, and a menu you cannot dismiss from the keyboard is a trap.
    <div className="menu" ref={box}
      onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); shut(); } }}>
      <button ref={btn} className="icon-btn" aria-haspopup="menu" aria-expanded={open}
        aria-label={label} title={label}
        onClick={(e) => { setByKey(e.detail === 0); setOpen((v) => !v); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setByKey(true); setOpen(true); } }}>
        {/* `display: block` so the svg brings no inline baseline gap of its own — with that, the
            flex centring above lands the box exactly, and the box is the mark. */}
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" style={{ display: "block" }}>
          <path d="M2.5 5h13M2.5 9h13M2.5 13h13" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="menu-pop" role="menu" aria-label={label}>
          {items.map((it, i) => (it.kind === "sep" ? (
            <div key={`s${i}`} className="menu-sep" role="separator" />
          ) : (
            <button key={it.label} role="menuitem" tabIndex={-1}
              ref={(n) => { rows.current[i] = n; }}
              className={`menu-item${it.danger ? " menu-item--danger" : ""}`}
              onKeyDown={(e) => onKey(e, i)}
              // The action runs first: `onClick` may open a file picker, and that has to happen
              // inside the user gesture rather than after a state update has re-rendered the row away.
              onClick={() => { it.onClick(); setOpen(false); }}>
              <span className="menu-item-l">
                {it.label}
                {it.hint && <em>{it.hint}</em>}
              </span>
              {it.value && <span className="menu-item-v">{it.value}</span>}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}
