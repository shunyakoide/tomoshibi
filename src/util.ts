import * as THREE from "three";
import type { Pt, Pts } from "./types.ts";

export const clamp = (lo: number, hi: number, v: number): number => Math.max(lo, Math.min(hi, v));

/** `map` keeps a list's length, which TypeScript forgets for a tuple type such as `Pts`. */
export const mapSame = <L extends unknown[]>(xs: L, f: (x: L[number], i: number) => L[number]): L => xs.map(f) as L;

/** A plain point list as `Pts`, checked rather than cast: a shorter list breaks every outline. */
export function toPts(pts: Pt[]): Pts {
  if (pts.length < 2) throw new Error(`a silhouette needs two points, got ${pts.length}`);
  return pts as Pts;
}

/**
 * N points evenly around a circle, UNCLOSED — a start point equal to the end point extrudes a
 * degenerate triangle, and `Shape`/`Path` close themselves. Shared by `geometry/ring.ts`, which
 * cuts holes with it, and `three/figures/kit-tools.ts`, which draws with it: the two had a copy
 * each, and the second one's comment already named the first.
 */
export function circlePts(r: number, n: number, cx = 0, cy = 0): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
}
