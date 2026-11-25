// What a 3D-printed kit is made of — the ONE list of printed parts. The STL kit, the print-plate
// preview, the bed-overflow check and both geometry gates iterate it, so a part added here reaches
// all of them, and a consumer's own per-part table (`Record<PartKey, …>`) fails the build until it
// says what to do with the new key. It was six hand-written lists, and one of them drifted: the
// rings were missing from `check:hash`, the gate that proves a refactor moved no vertex.
// At the root, beside `bed.ts`, because `studio/`, `three/` and the gates all read it and `three/`
// must not depend on `studio/`. Pure: three.js geometry, no React, no DOM.
import type * as THREE from "three";
import { ribGeometry, komaGeometry, standGeometry, boardGeometry, ringGeometry } from "./geometry.ts";
import type { Design } from "./types.ts";

export type PartKey = "rib" | "koma" | "stand" | "board" | "ringBot" | "ringTop";
/** `label` is the Japanese UI name, hence also its i18n key. `k` is the rib index (0 for the rest). */
export type PrintPart = { key: PartKey; label: string; k: number; geo: THREE.BufferGeometry };

/**
 * Ribs to print (1..boards). Spiral winding gives every rib different groove positions, so all of
 * them are printed; otherwise the ribs are identical and the user prints `printRibs` and duplicates.
 */
export const printedRibs = (p: Design, printRibs: number): number =>
  p.spiral ? p.boards : Math.min(printRibs, p.boards);

/**
 * Every printed part, in kit order, built fresh (callers translate / rotate them freely).
 * `ribs` is which rib indices to build: the kit wants all it prints, a footprint wants one, and the
 * manifold gate a spread — building all sixteen there would multiply its run time for nothing.
 * Koma and post are identical top and bottom, so one of each (duplicated in the slicer).
 */
export function printParts(p: Design, ribs: readonly number[]): PrintPart[] {
  return [
    ...ribs.map((k): PrintPart => ({ key: "rib", label: "羽根板", k, geo: ribGeometry(p, k) })),
    { key: "koma", label: "コマ", k: 0, geo: komaGeometry(p) },
    { key: "stand", label: "柱", k: 0, geo: standGeometry(p) },
    { key: "board", label: "連結板", k: 0, geo: boardGeometry(p) },
    // Opening rings: set into the finished lantern's openings to hold the bamboo and washi.
    { key: "ringBot", label: "開口リング", k: 0, geo: ringGeometry(p, false) },
    { key: "ringTop", label: "開口リング", k: 0, geo: ringGeometry(p, true) },
  ];
}

/** 0, 1, … n-1 — the rib indices of a kit that prints `n`. */
export const ribRange = (n: number): number[] => Array.from({ length: n }, (_, k) => k);
