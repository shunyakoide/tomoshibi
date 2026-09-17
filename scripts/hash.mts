/**
 * Geometry vertex hash (STL regression detection)
 * Hashes (SHA1) the vertex coordinates of every part at representative
 * parameters, one line each. For a refactor that should not change the STL,
 * diffing before and after catches a single moved vertex — check:manifold only
 * proves watertightness, so shape identity is this script's job.
 *
 * Usage (e.g. take a baseline before a refactor, then compare afterward):
 *   git stash            # or check out the target branch's base
 *   node scripts/hash.mts > /tmp/base.txt
 *   git stash pop        # restore the changes
 *   node scripts/hash.mts > /tmp/after.txt
 *   diff /tmp/base.txt /tmp/after.txt   # zero diff = STL completely unchanged
 *
 * Coordinates are quantized to 1e-6mm and rounded to eliminate floating-point
 * non-determinism.
 */
import type * as THREE from "three";
import crypto from "node:crypto";
import * as G from "../src/geometry.ts";
import { PRESETS, DEFAULTS } from "../src/config.ts";
import { FRESH } from "../src/studio/persist.ts";   // the state a first visit opens on

const hash = (g: THREE.BufferGeometry) => {
  const a = g.getAttribute("position").array;
  const q = Buffer.from(Float64Array.from(a, (x: number) => Math.round(x * 1e6)).buffer);
  return crypto.createHash("sha1").update(q).digest("hex").slice(0, 12);
};

const out: string[] = [];
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const boards of [6, 8, 12, 16])
      for (const fit of [0, 0.3])
        for (const higoD of [1.5, 2, 3]) {
          const p = { ...DEFAULTS, ...preset, height, boards, fit, higoD };
          const tag = `${preset.key} h${height} b${boards} fit${fit} hd${higoD}`;
          out.push(`${tag} rib   ${hash(G.ribGeometry(p, 0))}`);
          out.push(`${tag} koma  ${hash(G.komaGeometry(p))}`);
          out.push(`${tag} stand ${hash(G.standGeometry(p))}`);
          out.push(`${tag} board ${hash(G.boardGeometry(p))}`);
          // The opening rings are parts too. Left out, a change in geometry/ring.ts could move every
          // ring vertex and still merge as "zero hash diff" — the one gate whose whole job is to
          // prove a refactor changed nothing, blind to a fifth of what it ships.
          out.push(`${tag} ring.bot ${hash(G.ringGeometry(p, false))}`);
          out.push(`${tag} ring.top ${hash(G.ringGeometry(p, true))}`);
        }
// And the design the app actually OPENS on. Everything above merges a preset over `DEFAULTS`, so it
// hashes the presets' own point lists — which is not a state the app is ever in: `OPENING_MIN` floors
// two of the three the moment they are picked, and `FRESH` floors the starting design the same way.
// The one design every visitor gets was the one design this gate could not see.
for (const [tag, p] of [["fresh", FRESH.p]] as [string, typeof FRESH.p][]) {
  out.push(`${tag} rib   ${hash(G.ribGeometry(p, 0))}`);
  out.push(`${tag} koma  ${hash(G.komaGeometry(p))}`);
  out.push(`${tag} stand ${hash(G.standGeometry(p))}`);
  out.push(`${tag} board ${hash(G.boardGeometry(p))}`);
  out.push(`${tag} ring.bot ${hash(G.ringGeometry(p, false))}`);
  out.push(`${tag} ring.top ${hash(G.ringGeometry(p, true))}`);
}
console.log(out.join("\n"));
