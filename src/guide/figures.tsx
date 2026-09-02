/**
 * ============================================================================
 * THE GUIDE'S FIGURES — one fixed design, drawn once per route
 * ============================================================================
 * The page's drawings and the well they sit in. Everything the page renders comes from `GUIDE_P` and
 * nothing from the design on screen, which is what makes the guide a manual rather than a report on
 * your lantern.
 *
 * A `.tsx` because `Fig` is a component; the cache under it is module state on purpose — see there.
 * ============================================================================
 */
import React from "react";
import { DEFAULTS } from "../config.ts";
import { paperP } from "../papercraft.ts";
import { figureImage } from "../three/figures.ts";
import { PARTS, KIT_FIGS, STEPS } from "./content.ts";
import type { PartRow } from "./content.ts";
import type { T } from "../i18n.ts";

/**
 * The lantern every figure on this page is drawn from — the app's own starting design, not the one
 * being edited: the page explains a method, and a method does not change shape. The cardboard route
 * keeps its own copy, at a representative thickness rather than the `matT` the user measured, because
 * that route cuts a genuinely different mold (smooth outer edge, no lightening windows, no tab dent —
 * `paperP`).
 *
 * **The leg sockets are pinned ON here, whatever `DEFAULTS` says.** With them off, `needs()` quietly
 * dropped the whole third way of lighting it — figure and all — off a page whose only job is to show
 * the ways. Anything else this page must SHOW belongs in this override, and `needs()` stays as it is,
 * to catch the next one.
 */
const GUIDE_MAT_T = 3;                                    // mm, ordinary single-wall cardboard
const GUIDE_BASE = { ...DEFAULTS, legSockets: true };
export const GUIDE_P = { stl: GUIDE_BASE, paper: paperP(GUIDE_BASE, GUIDE_MAT_T) };

const WELL = "flex items-center justify-center overflow-hidden rounded-lg ";
/* A part or kit thumbnail sits on the card's own ground, so it draws no box of its own; a step's
   figure is the only thing in its column and gets one. */
const WELL_PART = "aspect-[3/2] mb-8 border border-transparent bg-transparent";
const WELL_STEP = "aspect-[4/3] border border-edge bg-[#fff]";
const WELL_IMG = "w-full h-full object-contain";
const WELL_FAIL = "text-sm text-fine text-center p-8";

/**
 * The figure well. It keeps its box whether the drawing has arrived, has failed, or neither exists:
 * a step that reflows when its image loads is a step you lose your place in. `null` (not undefined)
 * means the drawing FAILED rather than not having arrived, and saying so beats an empty well, which
 * nobody reads as a bug.
 */
export function Fig({ src, t, part = false }: { src?: string | null; t: T; part?: boolean }) {
  return (
    <div className={`${WELL}${part ? WELL_PART : WELL_STEP}`}>
      {src && <img src={src} alt="" className={WELL_IMG} />}
      {src === null && <span className={WELL_FAIL}>{t("図を描けませんでした")}</span>}
    </div>
  );
}

/**
 * Small wells for the two grids of thumbnails and for the sub-steps inside an option — those sit in
 * a 150px column, where a step's own 620px figure is four times the pixels the page will ever show.
 * A big one for a step.
 */
const SMALL_FIGS = new Set([
  ...PARTS.map((q: PartRow) => q.id),
  ...KIT_FIGS,
  ...STEPS.flatMap((s) => (s.options ?? []).flatMap((o) => (o.detail ?? []).map((d) => d.fig))),
].filter((f): f is string => !!f));
const sizeOf = (id: string) => (SMALL_FIGS.has(id) ? { width: 300, height: 220 } : { width: 620, height: 460 });

/**
 * Every figure ever rendered, for the life of the tab. Nothing they are drawn from can change any
 * more (see the header), so a figure is built at most once per route per session and coming back to
 * the guide costs no WebGL. `null` — the drawing failed — is cached too; a retry would fail alike.
 */
const CACHE = new Map<string, string | null>();
const cacheKey = (id: string, smooth: boolean) => `${id}|${smooth ? "paper" : "stl"}`;
export const drawn = (id: string, smooth: boolean) => CACHE.has(cacheKey(id, smooth));
export function figure(id: string, smooth: boolean): string | null {
  const key = cacheKey(id, smooth);
  if (!CACHE.has(key)) {
    CACHE.set(key, figureImage(smooth ? GUIDE_P.paper : GUIDE_P.stl, id, { ...sizeOf(id), smooth }));
  }
  return CACHE.get(key) ?? null;
}
