/**
 * ============================================================================
 * THE PHONE'S BOTTOM SHEET
 * ============================================================================
 * The inspector on a narrow screen: a panel you pull up from the bottom edge, parked at one of three
 * stops. Everything here is measurement and pointer state — `peekH`, `budgetH`, `sheetH`, the two
 * ResizeObservers and the drag — and nothing outside reads any of it. What escapes is the height to
 * put on the panel, which stop it is at, the three refs and the handlers.
 *
 * In `ui/` rather than `hooks.ts`: hooks.ts is the stateful behaviours that draw nothing and measure
 * nothing, and this one reads DOM boxes and captures pointers.
 * ============================================================================
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "../util.ts";
import type { Lang } from "../i18n.ts";

// Stops: `peek` (grabber bar alone), `half`, `full` = the shared budget minus `MIN_VIEW`. Fractions
// of the height the sheet SHARES WITH THE VIEWPORT, not of the window: the chip bar above is one row
// in Japanese and two in English, so window-relative `full` gave English a 37px section view where
// Japanese got 76.
const SHEET = { half: 0.45 } as const;
// The drawing never leaves the screen, at any stop — the sheet is a set of controls FOR it.
const MIN_VIEW = 140;
export type SheetStop = "peek" | "half" | "full";
const SHEET_ORDER: SheetStop[] = ["peek", "half", "full"];
// Under this much travel a drag is a tap, which cycles to the next stop: 6px is the slop a finger
// puts into a deliberate press.
const SHEET_TAP = 6;

export type SheetCtl = {
  sheet: SheetStop;
  /** The panel's height, as a style value, and whether it should animate to it. */
  sheetHeight: string;
  animate: boolean;
  barRef: React.RefObject<HTMLDivElement | null>;
  asideRef: React.RefObject<HTMLElement | null>;
  mainRef: React.RefObject<HTMLElement | null>;
  cycleSheet: () => void;
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
};

export function useBottomSheet({ narrow, isLit, lang }: {
  narrow: boolean; isLit: boolean; lang: Lang;
}): SheetCtl {
  const [sheet, setSheet] = useState<SheetStop>("peek");
  const [sheetH, setSheetH] = useState<number | null>(null);   // px while a drag is in progress, else null
  const [peekH, setPeekH] = useState(44);                      // measured: the bar = the `peek` height
  const [budgetH, setBudgetH] = useState(0);                   // measured: viewport + sheet, the height they share
  const barRef = useRef<HTMLDivElement>(null);                 // the sheet's grabber + summary bar
  const asideRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // `peek` is the grabber bar alone — MEASURED, because the summary it carries wraps on a narrow
  // enough screen. (With the CTA too it was 128px: 16% of the phone at rest.) Seeded by a layout read:
  // an observer stays silent for an element the browser is not laying out.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const read = () => setPeekH((h) => {
      const next = Math.round(bar.getBoundingClientRect().height);
      return next > 0 && next !== h ? next : h;
    });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [narrow, lang]);

  // The budget the viewport and the sheet share. Their SUM is invariant — one grows exactly as the
  // other shrinks — so observing both and adding gives a number that does not move while the sheet
  // animates; the guard below keeps the transition from re-rendering every frame. Excludes the chip
  // bar and the alert strip.
  useEffect(() => {
    const a = asideRef.current, m = mainRef.current;
    if (!a || !m) return;
    const read = () => setBudgetH((b) => {
      const next = Math.round(a.getBoundingClientRect().height + m.getBoundingClientRect().height);
      return next > 0 && Math.abs(next - b) >= 1 ? next : b;
    });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(a); ro.observe(m);
    return () => ro.disconnect();
  }, [narrow, isLit]);

  // The three stops, in px. `peek` can be the tallest on a very short screen, so every stop is
  // floored at it rather than assumed to be above it.
  const sheetStops = useMemo(() => ({
    peek: peekH,
    half: Math.max(peekH, Math.round(budgetH * SHEET.half)),
    full: Math.max(peekH, budgetH - MIN_VIEW),
  }), [peekH, budgetH]);
  const cycleSheet = useCallback(
    () => setSheet((st) => SHEET_ORDER[(SHEET_ORDER.indexOf(st) + 1) % SHEET_ORDER.length]),
    [],
  );

  // Header only — arbitrating "is this finger scrolling the list or pulling the sheet" is the one
  // genuinely hard part of a bottom sheet and is not worth writing until someone misses it. A drag
  // shorter than SHEET_TAP is a tap, so the header is also the button.
  const dragRef = useRef<{ y0: number; h0: number; moved: boolean } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Let any real <button> inside the bar be pressed normally. Defensive: it holds none today.
    if ((e.target as HTMLElement).closest("button")) return;
    // The bar's PARENT is the panel being resized. Wrap the bar in anything and this reads the
    // wrapper's height instead — no error, no type failure, no gate: just a drag that jumps.
    const el = e.currentTarget.parentElement as HTMLElement | null;
    if (!el) return;
    dragRef.current = { y0: e.clientY, h0: el.getBoundingClientRect().height, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = d.y0 - e.clientY;                       // up is bigger
    if (!d.moved && Math.abs(dy) < SHEET_TAP) return;  // still inside the tap slop
    d.moved = true;
    setSheetH(clamp(sheetStops.peek, sheetStops.full, d.h0 + dy));
  }, [sheetStops]);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (!d.moved) { cycleSheet(); return; }            // never travelled: it was a press
    const at = sheetH ?? d.h0;
    // Snap to whichever stop the sheet was left nearest to.
    const best = SHEET_ORDER.reduce((x, y) =>
      (Math.abs(sheetStops[y] - at) < Math.abs(sheetStops[x] - at) ? y : x));
    setSheet(best);
    setSheetH(null);
  }, [cycleSheet, sheetStops, sheetH]);

  // How tall the sheet is: mid-drag a px number with the transition off, so it tracks the finger;
  // otherwise the current stop, animated.
  return {
    sheet,
    sheetHeight: `${Math.round(sheetH ?? sheetStops[sheet])}px`,
    animate: sheetH == null,
    barRef, asideRef, mainRef, cycleSheet,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
