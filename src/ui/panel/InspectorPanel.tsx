/**
 * The inspector's shell: a fixed column on a wide screen, a bottom sheet on a phone, SIZED rather
 * than flexed — the height is a live px number mid-drag, which is why that pair stays a style.
 *
 * Bar, scroll area, footer, in that DOM order on both layouts: at `peek` the scroll area collapses to
 * zero, which is what makes the stop work with no reordering. Nothing may make the footer conditional.
 *
 * `overflow-hidden` because at `peek` the sheet is only as tall as its bar, which leaves the pinned
 * CTA past its own bottom edge.
 */
import type { SheetCtl } from "../sheet.ts";

export default function InspectorPanel({ narrow, ctl, bar, header, children, footer }: {
  narrow: boolean; ctl: SheetCtl;
  bar: React.ReactNode; header: React.ReactNode;
  children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <aside ref={ctl.asideRef}
      className="flex flex-col min-h-0 w-336 flex-[0_0_336px] bg-panel text-text border-l border-edge
        narrow:w-auto narrow:flex-none narrow:border-l-0 narrow:border-t narrow:rounded-t-2xl
        narrow:overflow-hidden narrow:shadow-[0_-6px_22px_rgba(59,52,43,0.13)]"
      style={narrow ? {
        height: ctl.sheetHeight,
        transition: ctl.animate ? "height 0.22s cubic-bezier(0.32,0.72,0,1)" : undefined,
      } : undefined}>
      {bar}
      {header}
      {/* No VERTICAL padding on a phone: `min-height: 0` floors a border box at its padding, so 18px
          of it is 18px this cannot shrink past — which overflowed `peek` and cut the CTA off. The
          wordmark block at the end of the list gives that spacing back. `overscroll-behavior` is
          `contain` because iOS momentum scrolling stops dead at the last row without it. */}
      <div className="flex-auto min-h-0 overflow-y-auto [touch-action:pan-y] [overscroll-behavior:contain]
        px-20 pt-6 pb-16 narrow:px-14 narrow:py-0">
        {children}
      </div>
      {footer}
    </aside>
  );
}
