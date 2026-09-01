/**
 * ============================================================================
 * PRINT BED FIT (BED)
 * ============================================================================
 * Can a flat part be laid on the print bed, and at what in-plane angle?
 *
 * One function serves three callers — the overflow warning, the recommended maximum body height and
 * the print-plate preview layout — so those three can never disagree. Pure: no three.js, no DOM.
 * ============================================================================
 */

// Footprint [a, b] on a W×D bed → { fits, angle } (angle in degrees, in the bed plane).
// Policy: axis-aligned whenever it fits that way, tilting only when the part would overrun the bed
// edge. A needed tilt sweeps 0..90° for the best-fitting angle — ≈45° on a square bed, steeper or
// shallower on a rectangular one, which takes a noticeably larger part than a fixed 45° would.
export function fitOnBed([a, b]: [number, number], W: number, D: number): { fits: boolean; angle: number } {
  const EPS = 0.01;
  if (Math.max(a, b) <= Math.max(W, D) + EPS && Math.min(a, b) <= Math.min(W, D) + EPS) {
    return { fits: true, angle: (a >= b) === (W >= D) ? 0 : 90 };   // long side along the bed's long side
  }
  let best = Infinity, angle = 0;
  for (let deg = 1; deg < 90; deg += 1) {
    const th = (deg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    const bw = a * c + b * s, bh = a * s + b * c;   // rotated bounding box (0<deg<90 ⇒ cos,sin ≥ 0)
    const r = Math.max(bw / W, bh / D);             // ≤1 ⇒ fits at this angle
    if (r < best) { best = r; angle = deg; }
  }
  return { fits: best <= 1.0001, angle };
}
