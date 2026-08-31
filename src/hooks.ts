/**
 * ============================================================================
 * APP HOOKS
 * ============================================================================
 * The stateful behaviours that are not about drawing anything: undo/redo history, the autosave,
 * the responsive-layout flag, the UI language, and the one page that has a URL. Each was inline in TomoshibiStudio, where they
 * pushed the interesting code — what the app actually renders — a hundred lines further down.
 *
 * No geometry and no three.js here; these only touch React, localStorage, and window events.
 * ============================================================================
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { saveState } from "./persist.ts";
import { makeT, loadLang, saveLang } from "./i18n.ts";
import { currentRoute, routeHref } from "./route.ts";
import type { SavedState } from "./persist.ts";
import type { Lang, T } from "./i18n.ts";
import type { PageRoute } from "./route.ts";
import type { Design } from "./types.ts";

/** What the toolbar's two buttons need: the actions, and whether each has anywhere to go. */
export type UndoRedo = { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };

/**
 * Undo/redo over the shape `p`.
 *
 * There is no single choke point for edits — `setP` is called from the section editor, the sliders,
 * the preset chips and the point card — so instead of instrumenting every call site this watches `p`
 * and commits a snapshot once it settles. That coalesces a continuous drag into one history entry
 * and still catches discrete edits (preset switch, add/delete point, sharp⇄smooth) through the same
 * path.
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

  // Both directions first flush the pending edit, so it is reachable again afterwards. For redo
  // that is a no-op whenever a new edit already discarded the redo target — standard behaviour,
  // and nothing is lost.
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
 * Auto-save the working state to localStorage. The debounce keeps a continuous drag from flooding
 * writes; `pagehide` (tab close / navigation) flushes immediately so the last action is never lost.
 * Mount this AFTER the rib-count clamp so what gets saved is always post-clamp — never a design
 * that would rebuild into a non-watertight koma.
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
 * True while the window is narrower than `px` — the app stacks the viewport above the inspector
 * instead of placing them side by side. useSyncExternalStore rather than a resize listener plus
 * useState: one subscription, and the first render already has the right answer, so a phone never
 * paints the side-by-side layout for a frame before correcting itself.
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
  // Keep <html lang> in step with the dictionary. index.html can only ship one value, and the app
  // starts in English but restores Japanese from localStorage — so without this the document claims
  // to be English while showing Japanese. It is not cosmetic on a phone: `lang` is what a mobile
  // browser uses to pick a CJK font fallback and what a screen reader uses to pick a voice.
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return { lang, toggleLang: toggle, t: makeT(lang) };
}

/**
 * The current page, and the one way to change it. See route.ts for what is addressable and why so
 * little of it is.
 *
 * Opening PUSHES and closing goes BACK, so a guide opened from the app leaves the history exactly
 * as it found it — one entry in, one entry out — and the browser's own back button is the same
 * gesture as the ×. Arriving directly at `/guide` has no entry to go back to, though, and calling
 * `back()` there would take a first-time visitor off the site from the page somebody linked them.
 * So the first close after a deep link REPLACES instead: the URL becomes the app's, no entry is
 * added, and back still leads wherever they actually came from.
 */
export function usePageRoute(): { route: PageRoute; go: (r: PageRoute) => void } {
  const [route, setRoute] = useState<PageRoute>(currentRoute);
  // Whether this session has pushed an entry we are still standing on. A popstate means the
  // browser moved us, so whatever we pushed is behind us now and is no longer ours to go back to.
  const pushed = useRef(false);

  useEffect(() => {
    const onPop = () => { pushed.current = false; setRoute(currentRoute()); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A path that names no page renders the app, so the URL should say the app. Without this a
  // mistyped or stale link leaves `/nope` in the address bar for the rest of the session, which is
  // an address that will keep being copied out of it. `index.html` is tidied the same way.
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
 * Run a history write, and say whether it happened.
 *
 * The history API throws on a `file://` document — and opening `dist/index.html` straight off the
 * disk is a case this build deliberately supports (`base: "./"`, see vite.config.ts). An exception
 * on the way into the guide would take the whole app down with it, which is far worse than the URL
 * simply not changing, so the failure is swallowed and the caller falls back to plain state: every
 * page still opens and closes, it just has no address to be linked by. That is exactly the trade
 * `base: "./"` already makes everywhere else.
 */
function writeUrl(write: () => void): boolean {
  try { write(); return true; } catch { return false; }
}
