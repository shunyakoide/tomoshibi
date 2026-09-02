/**
 * ============================================================================
 * RENDER — the layer both templates go through
 * ============================================================================
 * Parts → laid out → drawn once as ops → handed to a renderer. The cardboard template and the washi
 * template share every line of it; the only thing that differs between them is which parts go in and
 * what the document is called.
 * ============================================================================
 */
import { layout } from "./layout.ts";
import { pageOps } from "./draw.ts";
import { STYLE } from "./style.ts";
import { buildPDF } from "../pdf.ts";
import type { RawPart } from "./layout.ts";
import type { Op, Page } from "../pdf.ts";
import type { T } from "../i18n.ts";

// Default translator: an interpolating identity — the Japanese key with its {name} placeholders
// substituted — so callers that omit one (the check scripts) get the Japanese page and this module
// stays React/DOM-free. The UI passes the real i18n `t`.
export const tid: T = (s, params) => (params ? Object.keys(params).reduce((a, k) => a.split("{" + k + "}").join(String(params[k])), s) : s);

/**
 * Parts → a print-ready PDF (Uint8Array) of the same pages the preview shows, labelled in whatever
 * language `t` speaks: Latin is Helvetica, the rest is drawn from the outlines pdf.ts carries.
 * Nothing dimensional depends on the labels.
 */
export function pagesPDF(parts: RawPart[], page: Page, t: T, title: string): Uint8Array {
  const lay = layout(parts, page);
  const pages: Op[][] = [];
  for (let i = 0; i < lay.pages.length; i++) pages.push(pageOps(lay, i, page, t));
  return buildPDF(pages, page, STYLE, title);
}
