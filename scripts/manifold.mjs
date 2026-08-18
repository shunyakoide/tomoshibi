/**
 * ============================================================================
 * STL watertightness (manifold) sweep verification
 * ============================================================================
 * This project has no test runner. Correctness is guaranteed by "the build
 * passes" + "the STL is watertight (a closed manifold)". This script sweeps a
 * representative parameter range and checks that the geometry of every part
 * (rib / koma / stand / base board / 2-way split) is watertight.
 *
 * Criteria (per CLAUDE.md "STL watertightness"):
 *   - Undirected edge share count = 2 is closed (OK). 1 = open edge,
 *     >2 = non-manifold → FAIL.
 *   - Any NaN vertex → FAIL.
 *   - Any zero-area (degenerate) triangle → FAIL.
 *
 * Run:  npm run check:manifold
 * Always run this after touching geometry. Anything other than 0 FAIL can break
 * the print slicer.
 * ============================================================================
 */
import * as G from "../src/geometry.js";
import { PRESETS, DEFAULTS } from "../src/config.js";

const Q = 1e4; // Quantization (0.0001mm). Edge sharing is judged by vertex coordinates.
const key = (a) => [Math.round(a[0] * Q), Math.round(a[1] * Q), Math.round(a[2] * Q)].join(",");

function checkGeom(geom) {
  const pos = geom.getAttribute("position");
  const arr = pos.array;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return { ok: false, reason: "NaN vertex" };
  const idx = geom.index ? geom.index.array : null;
  const nTri = idx ? idx.length / 3 : pos.count / 3;
  const edges = new Map();
  const v = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
  for (let t = 0; t < nTri; t++) {
    const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const ks = [key(v(ia)), key(v(ib)), key(v(ic))];
    if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2]) return { ok: false, reason: "degenerate triangle" };
    for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) {
      const e = ks[x] < ks[y] ? ks[x] + "|" + ks[y] : ks[y] + "|" + ks[x];
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  let open = 0, nonman = 0;
  for (const c of edges.values()) { if (c === 1) open++; else if (c > 2) nonman++; }
  if (open || nonman) return { ok: false, reason: `open edges ${open} / non-manifold edges ${nonman}` };
  return { ok: true };
}

function checkParts(p) {
  const results = [];
  const push = (name, geom) => results.push({ name, ...checkGeom(geom) });
  try {
    for (const k of [0, 1, Math.floor(p.boards / 2)]) push(`rib(k=${k})`, G.ribGeometry(p, k));
    push("koma", G.komaGeometry(p));
    push("stand", G.standGeometry(p));
    push("board", G.boardGeometry(p));
    push("ring.bot", G.ringGeometry(p, false)); push("ring.top", G.ringGeometry(p, true)); // opening rings
  } catch (e) { return [{ name: "EXCEPTION", ok: false, reason: e.message }]; }
  return results;
}

const heights = [140, 205, 300, 400];
const higos = [1.5, 2, 3];
const pitches = [6, 9, 14];
const boardTs = [1.5, 2, 3, 4]; // The UI's board-thickness cap is 4mm. Cover the full range.
const fits = [0, 0.3, 0.5];
const boardsArr = [6, 8, 12, 16];

let fail = 0, total = 0, stopOn = 0, stopOff = 0, clamped = 0;
for (const preset of PRESETS)
  for (const height of heights)
    for (const higoD of higos)
      for (const pitch of pitches)
        for (const boardT of boardTs)
          for (const fit of fits)
            for (const reqBoards of boardsArr) {
              // As the UI does, clamp the count to the max that fits in the koma
              // (combos of small opening × thick board × high count where notches
              // overlap and become non-watertight cannot be made in the UI ⇒
              // verify under the same constraint).
              const base = { ...DEFAULTS, ...preset, height, higoD, pitch, boardT, fit, boards: reqBoards };
              const boards = Math.min(reqBoards, G.maxBoards(base));
              if (boards < reqBoards) clamped++;
              const p = { ...base, boards };
              if (G.komaStop2D(p)) stopOn++; else stopOff++;
              for (const r of checkParts(p)) {
                total++;
                if (!r.ok) {
                  fail++;
                  if (fail <= 40) console.log(`✗ ${preset.key} h${height} hd${higoD} pi${pitch} bt${boardT} fit${fit} b${boards} :: ${r.name} → ${r.reason}`);
                }
              }
            }

console.log(`\n=== ${total} checks, ${fail} FAIL ===`);
console.log(`komaStop2D: generated ${stopOn} / skipped (no room) ${stopOff}`);
console.log(`combos where maxBoards clamped the count: ${clamped} (= invalid counts the UI cannot make)`);

// ============ Bézier tangent handle watertightness sweep ============
// Curve-adjust mode switches outerR to Bézier evaluation. This checks that
// shapes with variously edited handles still produce watertight STLs (that a
// steep angle does not carve the body toward the koma and become non-watertight).
// Bake handles onto the midpoint → perturb → check watertightness of every part.
function perturb(pts, kind) {
  const mid = Math.max(1, Math.min(pts.length - 2, Math.floor(pts.length / 2)));
  return pts.map((q, i) => {
    if (i !== mid || !q.ho || !q.hi) return { ...q };
    const scale = (h, sd, sr) => ({ dt: h.dt * sd, dr: h.dr * sr });
    switch (kind) {
      case "bulge":  return { ...q, ho: scale(q.ho, 1, 3), hi: scale(q.hi, 1, 3) };   // bulge out strongly
      case "flat":   return { ...q, ho: scale(q.ho, 1, 0.1), hi: scale(q.hi, 1, 0.1) }; // flatten
      case "inward": return { ...q, ho: scale(q.ho, 1, -2), hi: scale(q.hi, 1, -2) };  // inward (carve in)
      case "long":   return { ...q, ho: scale(q.ho, 5, 4), hi: scale(q.hi, 5, 4) };    // extremely long (t is clamped on the eval side)
      case "corner": return { ...q, sharp: true, ho: scale(q.ho, 1, 2.5), hi: scale(q.hi, 2, -1) }; // corner = left/right independent
      default:       return { ...q };
    }
  });
}
const HKINDS = ["baked", "bulge", "flat", "inward", "long", "corner"];
let hfail = 0, htotal = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const boards of [6, 8, 12])
      for (const kind of HKINDS) {
        const base = { ...DEFAULTS, ...preset, height, boards: Math.min(boards, G.maxBoards({ ...DEFAULTS, ...preset })) };
        const baked = G.bakeBezierHandles(base.pts);
        const p = { ...base, pts: kind === "baked" ? baked : perturb(baked, kind) };
        for (const r of checkParts(p)) {
          htotal++;
          if (!r.ok) { hfail++; if (hfail <= 40) console.log(`✗[H] ${preset.key} h${height} b${boards} ${kind} :: ${r.name} → ${r.reason}`); }
        }
      }
console.log(`\n=== handle editing: ${htotal} checks, ${hfail} FAIL ===`);

// ============ Spiral winding watertightness sweep ============
// Spiral winding makes grooveList shift the grooves by step/boards per rib (k).
// The shift varies continuously with k, and on some ribs a groove lands on an
// end grid point. Since the offset differs on every rib, **all k** are checked
// (the normal sweep only samples k=0,1,mid). Cross-multiply the preset/height/
// higo diameter/pitch/count that affect groove position. The criterion is the
// same watertightness as normal.
let spFail = 0, spTotal = 0;
for (const preset of PRESETS)
  for (const height of [140, 205, 300, 400])
    for (const higoD of [1.5, 2, 3])
      for (const pitch of [6, 9, 14])
        for (const reqBoards of [6, 8, 12, 16]) {
          const base = { ...DEFAULTS, ...preset, height, higoD, pitch, spiral: true };
          const boards = Math.min(reqBoards, G.maxBoards(base));
          const p = { ...base, boards };
          for (let k = 0; k < boards; k++) {
            const r = checkGeom(G.ribGeometry(p, k));
            spTotal++;
            if (!r.ok) { spFail++; if (spFail <= 40) console.log(`✗[S] ${preset.key} h${height} hd${higoD} pi${pitch} b${boards} k${k} → ${r.reason}`); }
          }
        }
console.log(`\n=== spiral winding: ${spTotal} checks, ${spFail} FAIL ===`);

if (fail + hfail + spFail > 0) process.exitCode = 1;
process.exit(fail + hfail + spFail ? 1 : 0);
