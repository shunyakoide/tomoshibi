/**
 * ============================================================================
 * THE WARNINGS, IN THEIR THREE FORMS
 * ============================================================================
 * One card, and the two places a list of them goes: floating in the viewport's bottom-right on a
 * wide screen, a fold-out strip below the viewport on a phone. All three render the same
 * `AlertItem[]`, which `derived.ts` builds once — the strip has to count the list and quote one
 * headline, which markup cannot be asked for.
 *
 * `open` is NOT owned here. The strip unmounts the moment the last alert clears, so a flag held
 * locally would silently re-fold itself; the studio keeps it across an alert coming and going.
 * ============================================================================
 */
import type { AlertItem } from "../derived.ts";

/** Two fields rather than free children, so the narrow strip can quote `head` without rendering the
 *  whole card. */
export function Alert({ head, hint }: { head: string; hint?: string }) {
  return (
    <div className="flex items-center gap-10 px-14 py-10 bg-card border border-accent-4
      rounded-lg shadow-[0_3px_12px_rgba(59,52,43,0.1)] font-sans text-base text-text text-left">
      <span className="flex-none text-lg">⚠️</span>
      <span>{head}{hint && <><br /><span className="text-sub">{hint}</span></>}</span>
    </div>
  );
}

/** Wide: the column floating in the canvas's bottom-right (bottom-left is the lit hint's). */
export function AlertColumn({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="absolute bottom-20 right-20 max-w-[60%] flex flex-col items-end gap-10">
      {alerts.map((a) => <Alert key={a.key} head={a.head} hint={a.hint} />)}
    </div>
  );
}

/**
 * Narrow: the column becomes a strip you tap open.
 *
 * In flow an expanded alert costs 115px and two ~200, out of the SAME budget as the inspector. On a
 * 375×812 phone one open alert cut the panel's scroll window from 261px to 146, and in the print
 * view to 88px — 7% of the controls reachable at once. Folded it costs ~36px and still SAYS it: the
 * tint, the ⚠, the first headline (the "→ do this" hint is what the tap is for) and a count.
 * **Never open by default to be safe.**
 */
export function AlertBar({ alerts, open, onToggle }: {
  alerts: AlertItem[]; open: boolean; onToggle: () => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex-none bg-panel border-t border-edge">
      <button onClick={onToggle} aria-expanded={open}
        className="flex items-center gap-8 w-full min-h-36 px-12 py-6 bg-accent-07 border-0
          border-l-3 border-l-accent-5 border-solid cursor-pointer [font:inherit] text-base
          text-text text-left">
        <span className="flex-none text-lg">⚠️</span>
        {/* min-width 0 is what allows the ellipsis: a flex item's automatic minimum size is its own
            content, so without it the headline pushes the count and the caret off. */}
        <span className="flex-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {alerts[0].head}
        </span>
        {alerts.length > 1 && (
          <span className="flex-none font-mono text-sm text-sub">+{alerts.length - 1}</span>
        )}
        <span aria-hidden="true" className="flex-none text-faint">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-6 px-10 pb-8">
          {alerts.map((a) => <Alert key={a.key} head={a.head} hint={a.hint} />)}
        </div>
      )}
    </div>
  );
}
