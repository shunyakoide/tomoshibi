/**
 * ============================================================================
 * APP HOOKS
 * ============================================================================
 * The stateful behaviours that are not about drawing anything: undo/redo history, the autosave,
 * the responsive-layout flag, and the UI language. Each was inline in TomoshibiStudio, where they
 * pushed the interesting code — what the app actually renders — a hundred lines further down.
 *
 * No geometry and no three.js here; these only touch React, localStorage, and window events.
 * ============================================================================
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { saveState } from "./persist.js";
import { makeT, loadLang, saveLang } from "./i18n.js";

/**
 * Undo/redo over the shape `p`.
 *
 * There is no single choke point for edits — `setP` is called from the section editor, the sliders,
 * the preset chips and the point card — so instead of instrumenting every call site this watches `p`
 * and commits a snapshot once it settles. That coalesces a continuous drag into one history entry
 * and still catches discrete edits (preset switch, add/delete point, sharp⇄smooth) through the same
 * path.
 */
export function useUndoRedo(p, setP, { cap = 60, settle = 350 } = {}) {
  const hist = useRef([p]);         // snapshots, oldest first
  const idx = useRef(0);            // current position in `hist`
  const restoring = useRef(false);  // a setP caused BY undo/redo must not be re-committed
  const timer = useRef(null);
  const [, bump] = useState(0);     // re-render so the buttons' enabled state follows

  const commitNow = useCallback((np) => {
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
  const step = useCallback((dir) => {
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
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
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
export function useAutosave(state, delay = 300) {
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
export function useNarrow(px = 860) {
  const query = `(max-width: ${px - 1}px)`;
  const subscribe = useCallback((cb) => {
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
export function useLang() {
  const [lang, setLang] = useState(loadLang);
  const toggle = useCallback(() => setLang((l) => {
    const next = l === "ja" ? "en" : "ja";
    saveLang(next);
    return next;
  }), []);
  return { lang, toggleLang: toggle, t: makeT(lang) };
}
