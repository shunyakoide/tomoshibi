/**
 * The sheet's grabber and its live summary: everything above the fold at `peek`. The drag surface
 * and, for a press that never travels, the button that cycles to the next stop.
 *
 * Its root element must stay a DIRECT CHILD of the panel — the drag reads
 * `e.currentTarget.parentElement` for the height it starts from.
 */
import { useT } from "../theme.ts";
import type { SheetCtl } from "../sheet.ts";

export default function SheetBar({ ctl, maxDia, ribLen, topOpen, botOpen, warnRib }: {
  ctl: SheetCtl; maxDia: number; ribLen: number; topOpen: number; botOpen: number; warnRib: boolean;
}) {
  const t = useT();
  return (
    // `touchAction: none` so the browser does not claim the vertical gesture first.
    <div ref={ctl.barRef} {...ctl.handlers}
      className="flex-none relative flex items-center px-14 pt-14 pb-9 border-b border-edge
        cursor-grab [touch-action:none]">
      {/* Positioned against the BAR, not laid out in the row, where it would be centred on the
          summary rather than on the sheet (37% off, when the bar still carried two buttons). */}
      <span aria-hidden="true" className="absolute top-6 left-1/2 -translate-x-1/2 w-38 h-4
        rounded-xs bg-edge" />
      {/* A div with role=button, not a <button>: the drag bails out of anything inside a real
          <button> to keep the bar's buttons pressable, so a <button> grabber would be the one part
          of the bar you could not pull. It cannot contain a real button either, hence the left part
          of the bar rather than all of it. A press that never travels is already a tap, so this only
          adds the keyboard. */}
      <div role="button" tabIndex={0} aria-label={t("設定パネル")} title={t("設定パネル")}
        aria-expanded={ctl.sheet !== "peek"}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ctl.cycleSheet(); } }}
        className="flex-auto flex items-center justify-center min-h-20 cursor-pointer">
        {/* The readout you watch while dragging a ◇, so it is all the sheet shows at rest.
            Centring only works now that the header controls have moved to the chip bar. */}
        <span className="flex flex-wrap justify-center gap-x-12 gap-y-0 font-mono text-sm text-faint">
          <span>⌀{maxDia}</span>
          <span className={warnRib ? "text-warn" : "text-faint"}>{t("羽根板")} {ribLen}</span>
          <span>{t("開口")} {topOpen}/{botOpen}</span>
          <span>mm</span>
        </span>
      </div>
    </div>
  );
}
