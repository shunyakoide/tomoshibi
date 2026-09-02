/**
 * ============================================================================
 * SECTION VIEW — the drawing's own colours
 * ============================================================================
 * Literals rather than `UI` tokens because these are SVG presentation attributes, where a `var()`
 * does not resolve (see ui/theme.ts). Shared by the canvas and by the legend that redraws the
 * canvas's marks at legend size, which is the whole reason it is a module: a legend entry in a
 * slightly different green from the mark it explains reads as two different things.
 * ============================================================================
 */
export const C = {
  axis: "#b8a888", outline: "#c4b492", higo: "#c9b593", spine: "#d8c7a3",
  label: "#8a7c66", value: "#3b342b", faint: "#c0b298", handleFill: "#fffdf8",
  neck: "#d9ccb0", bound: "#5aa774", // neck band / lamp body boundary dashes (green = neck/lamp-body seam)
  board: "#caa96f", boardLine: "#9e7f4a", // rib (actual cross-section overlaid on one side)
};
