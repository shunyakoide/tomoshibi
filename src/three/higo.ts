import * as THREE from "three";
import { grooveList, grooveR, higoSpiralPath, outerR } from "../geometry.ts";
import type { Design } from "../types.ts";

/**
 * The bamboo winding, as geometry: one torus per groove, or one tube along the helix when the design
 * winds spirally. Shared by the lit viewport (`three/scenes.ts`) and the guide's drawings
 * (`three/figures/mold.ts`), which had a copy each — the same branch, the same `grooveList` and
 * `outerR`, and by the time they were noticed their torus tessellation had already drifted apart.
 *
 * Nothing here reaches an STL: the winding is what the maker wraps, not a part the mold prints, so
 * this is a drawing helper and lives in `three/` rather than in `geometry/`. The dimensions are all
 * still geometry's — the groove heights, their radius, and the bamboo's own diameter.
 *
 * Each entry is positioned in the lamp body's own frame: `y` is the height the ring sits at, and the
 * geometry is already turned flat, so a caller adds its own material and whatever vertical offset
 * its scene uses. `radial` is each caller's own — 10 in the viewport, 8 in the figures, a difference
 * that was an accident rather than a decision. Unifying it is safe but re-renders every guide
 * figure, so it stays a parameter until someone runs the figure-hash harness over the change.
 */
export function higoGeometries(
  p: Design,
  { radial, near = false }: { radial: number; near?: boolean },
): { geo: THREE.BufferGeometry; y: number }[] {
  const r = p.higoD / 2;
  if (p.spiral) {
    // One continuous descending helix, from the same path the grooves are cut on.
    const path = higoSpiralPath(p);
    if (path.length < 2) return [];
    const curve = new THREE.CatmullRomCurve3(path.map(([a, y, rad]) =>
      new THREE.Vector3(rad * Math.cos(a), y, rad * Math.sin(a))));
    return [{ geo: new THREE.TubeGeometry(curve, path.length * 2, r, 8, false), y: 0 }];
  }
  return grooveList(p, grooveR(p)).map((y) => {
    // `near` draws only the camera-facing half, for the one see-through figure: eight far rings over
    // eight near ones is a rattan basket. Aim the half-arc by turning the GEOMETRY in its own plane —
    // a `rotation.y` on the mesh composes with the flattening quarter turn and tilts the ring
    // instead. A torus's arc starts at its own 0, so its midpoint sits a quarter turn on; -45° lands
    // it on the camera's bearing after the rotateX below.
    const geo = near
      ? new THREE.TorusGeometry(outerR(p, y / p.height), r, radial, 64, Math.PI)
      : new THREE.TorusGeometry(outerR(p, y / p.height), r, radial, 96);
    if (near) geo.rotateZ(-Math.PI / 4);
    geo.rotateX(Math.PI / 2);
    return { geo, y };
  });
}
