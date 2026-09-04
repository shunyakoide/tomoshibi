/**
 * Two steps, because the drawing's extent has to be known before the frame can be fitted to it, and
 * the frame has to be known before anything can be positioned:
 *
 *   sampleSection(p)              — millimetres. Also what the frame is fitted to.
 *   sectionPaths(p, f, sample, …) — the same sample, put through the frame's transforms.
 *
 * Every dimension comes from the `geometry.ts` barrel, so what is drawn here is what gets printed.
 */
import { outerR, cutYbot, cutYtop, fukuroRange, grooveList, grooveOuterPts, komaR, ribOutline2D, lightenHoles2D } from "../../geometry.ts";
import { C } from "./palette.ts";
import type { SectionFrame } from "./frame.ts";
import type { Design, Pt2 } from "../../types.ts";

/** The drawing in millimetres, sampled once and read by both the frame and the paths. */
export type SectionSample = {
  /** t range of the lamp body = between the outermost control points. */
  fr: { lo: number; hi: number };
  /** Groove positions (mm). */
  gs: number[];
  /** Outer edge with normal-cut groove notches (matches the STL). */
  op: Pt2[];
  /** The widest the silhouette gets (mm), plus the 4mm the drawing keeps around it. */
  maxR: number;
  /** Koma outer radius (mm). */
  komaR: number;
  /** Bottom/top neck height as a fraction of the body height. */
  tnB: number; tnT: number;
};

export function sampleSection(p: Design): SectionSample {
  const H = p.height;
  const gs = grooveList(p);
  const op = grooveOuterPts(p, gs);
  return {
    fr: fukuroRange(p),
    gs,
    op,
    maxR: Math.max(...op.map((q) => q[0])) + 4,
    komaR: komaR(p),
    tnB: cutYbot(p) / H, tnT: cutYtop(p) / H,
  };
}

/** One band of the region colour-coding (neck / lamp body), clipped to the silhouette. */
export type Band = { t0: number; t1: number; fill: string; op?: number };

export function sectionPaths(p: Design, f: SectionFrame, sample: SectionSample, accent: string): {
  d: string; higo: string; ribD: string; bands: Band[];
} {
  const H = p.height;
  const { X, Xm, Y, Ymm } = f;
  const { op, gs, fr } = sample;

  // Right side up, then the mirrored left side down — the same points, so the two sides match.
  let d = `M ${X(op[0][0]).toFixed(1)} ${Y(op[0][1] / H).toFixed(1)}`;
  for (let i = 1; i < op.length; i++) d += ` L ${X(op[i][0]).toFixed(1)} ${Y(op[i][1] / H).toFixed(1)}`;
  for (let i = op.length - 1; i >= 0; i--) d += ` L ${Xm(op[i][0]).toFixed(1)} ${Y(op[i][1] / H).toFixed(1)}`;
  d += " Z";

  // The bamboo, drawn on the groove centre lines — the same positions as the notches above.
  let higo = "";
  for (const mm of gs) {
    const t = mm / H, r = outerR(p, t);
    higo += `M ${Xm(r).toFixed(1)} ${Y(t).toFixed(1)} L ${X(r).toFixed(1)} ${Y(t).toFixed(1)} `;
  }

  const bands: Band[] = [
    { t0: 0, t1: fr.lo, fill: C.neck },       // bottom neck
    { t0: fr.lo, t1: fr.hi, fill: accent, op: 0.12 }, // lamp body
    { t0: fr.hi, t1: 1, fill: C.neck },       // top neck
  ].filter((b) => b.t1 - b.t0 > 0.001);

  // The rib's own cross-section, overlaid on the right side: the exact printed part, in millimetres
  // on both axes (x = radius, y = height).
  const poly2d = (pl: Pt2[]) => "M " + pl.map(([px, py], i) => `${i ? "L " : ""}${X(px).toFixed(1)} ${Ymm(py).toFixed(1)}`).join(" ") + " Z";
  let ribD = poly2d(ribOutline2D(p));
  for (const hole of lightenHoles2D(p).holes) ribD += " " + poly2d(hole); // punch out the windows via evenodd

  return { d, higo, ribD, bands };
}
