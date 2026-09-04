/**
 * The stateful behaviours that draw nothing. No geometry and no three.js — only React, localStorage
 * and window events.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { saveState } from "./persist.ts";
import { makeT, loadLang, saveLang } from "../i18n.ts";
import { currentRoute, routeHref } from "./route.ts";
import type { SavedState } from "./persist.ts";
import type { Lang, T } from "../i18n.ts";
import type { PageRoute } from "./route.ts";
import type { Design } from "../types.ts";

/** What the toolbar's two buttons need: the actions, and whether each has anywhere to go. */
export type UndoRedo = { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };

/**
 * Undo/redo over the shape `p`.
 *
 * There is no single choke point for edits — `setP` is called from the section editor, the sliders,
 * the preset chips and the point card — so rather than instrument every call site this watches `p`
 * and commits once it settles: a drag coalesces into one entry, and discrete edits (preset switch,
 * add/delete point, sharp⇄smooth) come through the same path.
 */
export function useUndoRedo(
  p: Design,
  setP: (np: Design) => void,
  { cap = 60, settle = 350 }: { cap?: number; settle?: number } = {},
): UndoRedo {
  const hist = useRef<Design[]>([p]);         // snapshots, oldest first
  const idx = useRef(0);            // current position in `hist`
  const restoring = useRef(false);  // a setP caused BY undo/redo must not be re-committed
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [, bump] = useState(0);     // re-render so the buttons' enabled state follows

  const commitNow = useCallback((np: Design) => {
    const h = hist.current;
    if (JSON.stringify(h[idx.current]) === JSON.stringify(np)) return;   // unchanged → nothing to push
    h.splice(idx.current + 1);      // drop the redo branch
    h.push(np);
    if (h.length > cap) h.shift();
    idx.current = h.length - 1;
    bump((n) => n + 1);
  }, [cap]);

  useEffect(() => {
    if (restoring.current) { restoring.current = false; return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commitNow(p), settle);
    return () => clearTimeout(timer.current);
  }, [p, commitNow, settle]);

  // Both directions flush the pending edit first, so it stays reachable. For redo that is a no-op
  // whenever a new edit already discarded the redo target — standard behaviour, nothing lost.
  const step = useCallback((dir: number) => {
    clearTimeout(timer.current);
    commitNow(p);
    const next = idx.current + dir;
    if (next < 0 || next > hist.current.length - 1) return;
    idx.current = next;
    restoring.current = true;
    setP(hist.current[next]);
    bump((n) => n + 1);
  }, [p, setP, commitNow]);

  const undo = useCallback(() => step(-1), [step]);
  const redo = useCallback(() => step(1), [step]);

  // Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z or Ctrl+Y = redo. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement | null)?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || !(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return { undo, redo, canUndo: idx.current > 0, canRedo: idx.current < hist.current.length - 1 };
}

/**
 * Auto-save to localStorage. The debounce keeps a drag from flooding writes; `pagehide` flushes so
 * the last action is never lost. Mount this AFTER the rib-count clamp, so what is saved is always
 * post-clamp and never a design that rebuilds into a non-watertight koma.
 */
export function useAutosave(state: SavedState, delay = 300): void {
  useEffect(() => {
    const id = setTimeout(() => saveState(state), delay);
    const flush = () => { clearTimeout(id); saveState(state); };
    window.addEventListener("pagehide", flush);
    return () => { clearTimeout(id); window.removeEventListener("pagehide", flush); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's object is rebuilt per render; compare its contents
  }, [JSON.stringify(state), delay]);
}

/**
 * True while the window is narrower than `px` — the app then stacks the viewport above the
 * inspector. useSyncExternalStore rather than a resize listener plus useState: the first render
 * already has the right answer, so a phone never paints the wide layout for a frame first.
 */
export function useNarrow(px = 860): boolean {
  const query = `(max-width: ${px - 1}px)`;
  const subscribe = useCallback((cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, [query]);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,          // server/prerender: assume the wide layout
  );
}

/** UI language (ja/en) with its own localStorage key, plus the translation function it feeds. */
export function useLang(): { lang: Lang; toggleLang: () => void; t: T } {
  const [lang, setLang] = useState(loadLang);
  const toggle = useCallback(() => setLang((l) => {
    const next = l === "ja" ? "en" : "ja";
    saveLang(next);
    return next;
  }), []);
  // Keep <html lang> in step with the dictionary: index.html ships one value and the app restores
  // Japanese from localStorage, so without this the document claims English while showing Japanese.
  // Not cosmetic — `lang` picks a mobile browser's CJK font fallback and a screen reader's voice.
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  // Memoized on `lang`, so `t` is a stable identity between renders. An unmemoized `makeT(lang)`
  // is a fresh closure every render, which silently defeats every memo that lists `t` in its
  // deps — `derived.ts`'s overSheet was recomputing the whole template layout on every frame of
  // a drag, and PagePreview had to depend on `lang` instead and opt out of exhaustive-deps.
  const t = useMemo(() => makeT(lang), [lang]);
  return { lang, toggleLang: toggle, t };
}

/**
 * The current page and the one way to change it (route.ts says what is addressable and why little
 * is). Opening PUSHES and closing goes BACK — one entry in, one out, so the browser's back button
 * is the same gesture as the ×. A deep link has no entry to go back to and `back()` would take a
 * first-time visitor off the site, so the first close after one REPLACES instead.
 */
export function usePageRoute(): { route: PageRoute; go: (r: PageRoute) => void } {
  const [route, setRoute] = useState<PageRoute>(currentRoute);
  // Whether this session pushed the entry we are standing on. A popstate means the browser moved
  // us, so whatever we pushed is no longer ours to go back to.
  const pushed = useRef(false);

  useEffect(() => {
    const onPop = () => { pushed.current = false; setRoute(currentRoute()); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A path naming no page renders the app, so the URL should say the app: otherwise a mistyped or
  // stale link stays in the address bar all session, being copied back out of it. So is index.html.
  useEffect(() => {
    if (currentRoute() === null && window.location.pathname !== routeHref(null)) {
      writeUrl(() => window.history.replaceState(null, "", routeHref(null)));
    }
  }, []);

  const go = useCallback((next: PageRoute) => {
    if (next === currentRoute()) { setRoute(next); return; }
    if (next === null && pushed.current) {
      // popstate will set the state; do not set it here as well, or the two disagree for a frame.
      if (writeUrl(() => window.history.back())) return;
    } else if (next === null) {
      writeUrl(() => window.history.replaceState(null, "", routeHref(null)));
    } else if (writeUrl(() => window.history.pushState(null, "", routeHref(next)))) {
      pushed.current = true;
    }
    setRoute(next);
  }, []);

  return { route, go };
}

/**
 * Run a history write, and say whether it happened. The history API throws on a `file://` document,
 * which this build deliberately supports (`base: "./"`, vite.config.ts). An exception on the way
 * into the guide would take the whole app down — far worse than the URL not changing — so it is
 * swallowed and the caller falls back to plain state: pages open and close, with no address.
 */
function writeUrl(write: () => void): boolean {
  try { write(); return true; } catch { return false; }
}
