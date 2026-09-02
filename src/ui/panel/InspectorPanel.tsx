/**
 * The inspector's shell. On a wide screen a fixed column; on a phone a bottom sheet, SIZED rather
 * than flexed — its height is the stop it is parked at, so that pair stays a style: a live px
 * number, transition off mid-drag so the sheet tracks the finger.
 *
 * The three children are the point of the file. Bar, scroll area, footer, in that DOM order, on both
 * layouts — it is what makes `peek` work without reordering, and giving the footer `order: 1` was
 * tried. Nothing may make the footer conditional.
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
      {/* Between the bar and the pinned CTA on both layouts, which is what makes `peek` work without
          reordering: at rest the sheet is exactly bar-tall, so this collapses to zero and every stop
          above it grows this and only this. */}
      {/* No VERTICAL padding on a phone: `min-height: 0` floors the border box at padding + border, so
          4+14 of it is 18px this element cannot shrink past — which overflowed `peek` by exactly that
          and cut the bottom off the CTA. The wordmark block at the end gives that spacing back.
          `overscroll-behavior: contain` because iOS momentum scrolling stops dead at the last row
          without it, this being the only scrollable thing on the page (body is touch-action: none). */}
      <div className="flex-auto min-h-0 overflow-y-auto [touch-action:pan-y] [overscroll-behavior:contain]
        px-20 pt-6 pb-16 narrow:px-14 narrow:py-0">
        {children}
      </div>
      {footer}
    </aside>
  );
}
