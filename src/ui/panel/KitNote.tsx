/**
 * Under the export CTA: the one thing you must not get wrong, the ZIP's manifest folded behind it.
 * It renders NOTHING until the export has run, because none of it helps you DECIDE to press the
 * button — worth ~60px of pinned footer at every sheet stop against the five-line / ~95px paragraph
 * it was. **Do not put it back on screen "so people see it".**
 *
 * `state` is three-valued — `null` = no export yet (draw nothing), "open"/"shut" = the manifest's
 * fold. Two booleans would allow "folded but never downloaded", which has no drawing.
 */
import { NOTE_SKIN } from "../controls.tsx";
import type { T } from "../../i18n.ts";

export type KitNoteState = null | "open" | "shut";

export default function KitNote({ warn, state, onToggle, t, children }: {
  warn: React.ReactNode; state: KitNoteState; onToggle: () => void; t: T; children: React.ReactNode;
}) {
  if (state === null) return null;
  const open = state === "open";
  return (
    <div className="mt-9">
      <div className={NOTE_SKIN}>{warn}</div>
      <button aria-expanded={open} onClick={onToggle}
        className="flex items-center gap-5 min-h-36 mt-2 p-0 bg-transparent border-0 cursor-pointer
          font-sans text-sm font-semibold text-sub hover:text-accent">
        {t("同梱物")}<span aria-hidden="true" className="text-2xs text-faint">{open ? "▾" : "▸"}</span>
      </button>
      {open && <ul className={`${NOTE_SKIN} mt-2 mb-0 mx-0 p-0 list-none [&>li]:py-[1.5px]`}>{children}</ul>}
    </div>
  );
}
