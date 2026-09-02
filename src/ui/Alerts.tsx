// `open` is NOT owned here: the strip unmounts the moment the last alert clears, so a flag held
// locally would silently re-fold itself.
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
 * Narrow: the column becomes a strip you tap open. It comes out of the same budget as the inspector,
 * so an open alert costs the controls a third of their scroll window. **Never open by default.**
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
        {/* `min-w-0` is what allows the ellipsis: a flex item's automatic minimum size is its own
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
