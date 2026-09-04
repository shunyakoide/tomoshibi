/**
 * STL watertightness (manifold) sweep verification
 * No test runner here: correctness is "the build passes" + "the STL is
 * watertight". This sweeps a representative parameter range and checks every
 * part (rib / koma / stand / base board / opening rings).
 *
 * Criteria: undirected edge share count 2 =
 * closed, 1 = open edge and >2 = non-manifold → FAIL; any NaN vertex → FAIL;
 * any zero-area triangle → FAIL.
 *
 * Run:  npm run check:manifold — always, after touching geometry. Anything
 * other than 0 FAIL can break the print slicer.
 */
import type * as THREE from "three";
import * as G from "../src/geometry.ts";
import { PRESETS, DEFAULTS, LIMITS, T_GAP } from "../src/config.ts";
import type { Design, Pt } from "../src/types.ts";

/** One part's verdict. `reason` is what gets printed when it fails. */
type Result = { name?: string; ok: boolean; reason?: string };

const Q = 1e4; // Quantization (0.0001mm). Edge sharing is judged by vertex coordinates.
const key = (a: number[]) => [Math.round(a[0] * Q), Math.round(a[1] * Q), Math.round(a[2] * Q)].join(",");

function checkGeom(geom: THREE.BufferGeometry): Result {
  const pos = geom.getAttribute("position");
  const arr = pos.array;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return { ok: false, reason: "NaN vertex" };
  const idx = geom.index ? geom.index.array : null;
  const nTri = idx ? idx.length / 3 : pos.count / 3;
  const edges = new Map<string, number>();
  const v = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
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

function checkParts(p: Design): Result[] {
  const results: Result[] = [];
  const push = (name: string, geom: THREE.BufferGeometry) => results.push({ name, ...checkGeom(geom) });
  try {
    for (const k of [0, 1, Math.floor(p.boards / 2)]) push(`rib(k=${k})`, G.ribGeometry(p, k));
    push("koma", G.komaGeometry(p));
    push("stand", G.standGeometry(p));
    push("board", G.boardGeometry(p));
    push("ring.bot", G.ringGeometry(p, false)); push("ring.top", G.ringGeometry(p, true)); // opening rings
  } catch (e) { return [{ name: "EXCEPTION", ok: false, reason: (e as Error).message }]; }
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
              // Clamp the count to what fits in the koma, as the UI does: small opening × thick
              // board × high count overlaps the notches, and the UI cannot make it either.
              const base = { ...DEFAULTS, ...preset, height, higoD, pitch, boardT, fit, boards: reqBoards };
              const boards = Math.min(reqBoards, G.maxBoards(base));
              if (boards < reqBoards) clamped++;
              const p = { ...base, boards };
              if (G.tabDented(p)) stopOn++; else stopOff++;   // the koma stop = the tab-tip dent
              for (const r of checkParts(p)) {
                total++;
                if (!r.ok) {
                  fail++;
                  if (fail <= 40) console.log(`✗ ${preset.key} h${height} hd${higoD} pi${pitch} bt${boardT} fit${fit} b${boards} :: ${r.name} → ${r.reason}`);
                }
              }
            }

console.log(`\n=== ${total} checks, ${fail} FAIL ===`);
console.log(`tab-tip dent (koma stop): cut ${stopOn} / plain tab, no room ${stopOff}`);
console.log(`combos where maxBoards clamped the count: ${clamped} (= invalid counts the UI cannot make)`);

// ============ Bézier tangent handle watertightness sweep ============
// Curve-adjust mode switches outerR to Bézier evaluation. Bake handles onto the
// midpoint → perturb → check every part, so a steep angle cannot carve the body
// toward the koma and open the mesh.
function perturb(pts: Pt[], kind: string): Pt[] {
  const mid = Math.max(1, Math.min(pts.length - 2, Math.floor(pts.length / 2)));
  return pts.map((q, i) => {
    if (i !== mid || !q.ho || !q.hi) return { ...q };
    const scale = (h: { dt: number; dr: number }, sd: number, sr: number) => ({ dt: h.dt * sd, dr: h.dr * sr });
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
// Spiral winding shifts each rib's grooves by step/boards, so the offset differs
// on every rib and on some a groove lands on an end grid point: **all k** are
// checked here, where the main sweep samples only k=0,1,mid. Cross-multiplies
// everything affecting groove position; same watertightness criterion.
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

// ============ Silhouette extremes sweep (the corners of LIMITS) ============
// Everything above runs the presets at their own radii, so it only sees a moderately sloped body —
// and slope is what the groove notch, and so the lightening window, is sensitive to: a groove is cut
// along the surface NORMAL, so on a steep face its tip reaches inward in x by `depth × √(1+slope²)`,
// and a window standing a constant 11mm off the smooth edge was swallowed by it, opening edges on
// any wide, low body. This is the only section that scales the control points, which is why nothing
// else saw it: each preset is stretched to the edges of LIMITS in both axes, the radius target
// applied by scaling every point until the widest lands on it, so the shape is kept and the slope
// scales with it. higoD 3 is included because the notch reach is largest there.
let exFail = 0, exTotal = 0;
const [hLo, hHi] = LIMITS.height, [rLo, rHi] = LIMITS.r;
for (const preset of PRESETS)
  for (const height of [hLo, 205, hHi])
    for (const rMax of [rLo * 2, 130, rHi])
      for (const higoD of [2, 3]) {
        const widest = Math.max(...preset.pts.map((q) => q.r));
        const pts = preset.pts.map((q) => ({ ...q, r: Math.min(rHi, Math.max(rLo, (q.r * rMax) / widest)) }));
        const base = { ...DEFAULTS, ...preset, pts, height, higoD };
        const p = { ...base, boards: Math.min(8, G.maxBoards(base)) };
        for (const r of checkParts(p)) {
          exTotal++;
          if (!r.ok) { exFail++; if (exFail <= 40) console.log(`✗[X] ${preset.key} h${height} rMax${rMax} hd${higoD} :: ${r.name} → ${r.reason}`); }
        }
      }
// A straight cylinder isolates the radius floor from every shape effect: the one family where "how
// small may r be" has a single answer, and that answer (LIMITS.r[0]) is what the editor, the typed
// field and persist all clamp to.
const cyl = (height: number, r: number) => {
  const base = { ...DEFAULTS, pts: [{ t: 0.05, r }, { t: 0.5, r }, { t: 0.95, r }], height };
  return checkParts({ ...base, boards: Math.min(8, G.maxBoards(base)) });
};
for (const height of [hLo, 205, hHi]) {
  for (const r of [rLo, 40, rHi])
    for (const res of cyl(height, r)) {
      exTotal++;
      if (!res.ok) { exFail++; if (exFail <= 40) console.log(`✗[X] cylinder h${height} r${r} :: ${res.name} → ${res.reason}`); }
    }
  // The floor is only meaningful if it is the actual wall: 2mm under it the rib must NOT come out
  // watertight, or the floor has drifted above the wall and the app is refusing valid designs.
  exTotal++;
  if (cyl(height, rLo - 2).every((res) => res.ok)) {
    exFail++;
    console.log(`✗[X] cylinder h${height} r${rLo - 2} is watertight — LIMITS.r[0] is above the real floor`);
  }
}
console.log(`\n=== silhouette extremes (h ${hLo}..${hHi} × r ${rLo}..${rHi}): ${exTotal} checks, ${exFail} FAIL ===`);

// ============ Control-point spacing / count sweep ============
// Every sweep above rewrites `pts` by scaling `q.r` and copying `q.t` — three separate places do it,
// each spreading `{...q}` — so `t` is preserved by construction and the tightest spacing any of them
// exercises is a preset's own 0.09, against an editor floor of T_GAP = 0.04. The largest count they
// reach is 5, against a permitted LIMITS.pts[1]. Spacing and count are the two degrees of freedom
// direct manipulation exposes, and nothing swept either: which is how a silhouette reachable by
// DRAGGING ALONE folded `grooveOuterPts`' outline through itself and extruded a rib with open edges,
// while this script printed 0 FAIL on 48,801 checks.
// The radius alternates because a fold needs a sharp turn, not merely a tight gap. higoD 3 is in
// because the notch reach, and so the fold, is largest there.
let spcFail = 0, spcTotal = 0;
for (const preset of PRESETS)
  for (const nPts of [3, 5, LIMITS.pts[1]])
    for (const gap of [T_GAP, T_GAP * 1.5, 0.1])
      for (const swing of [0, 20])
        for (const height of [hLo, 205, 400])
          for (const higoD of [2, 3]) {
            const mid = preset.pts.reduce((s, q) => s + q.r, 0) / preset.pts.length;
            const pts: Pt[] = Array.from({ length: nPts }, (_, i) => ({
              t: 0.05 + i * gap,
              r: Math.min(rHi, Math.max(rLo, mid + (i % 2 ? swing : -swing))),
            }));
            if (pts[nPts - 1].t > 0.99) continue;   // past the top opening — not a design the editor can make
            const base = { ...DEFAULTS, ...preset, pts, height, higoD };
            const p = { ...base, boards: Math.min(8, G.maxBoards(base)) };
            for (const r of checkParts(p)) {
              spcTotal++;
              if (!r.ok) { spcFail++; if (spcFail <= 40) console.log(`✗[C] ${preset.key} n${nPts} gap${gap} sw${swing} h${height} hd${higoD} :: ${r.name} → ${r.reason}`); }
            }
          }
console.log(`\n=== control-point spacing (gap ${T_GAP}..0.1 × ${LIMITS.pts[0]}..${LIMITS.pts[1]} points): ${spcTotal} checks, ${spcFail} FAIL ===`);

// ============ Bottom-ring leg sockets sweep ============
// The bottom ring carries three onigiri pads with a leg bore each, unless `p.legSockets` is off or
// the opening is too small; the sweeps above only run it on, at the presets' own radii. Both
// branches are exercised here across the whole radius range, the failure being invisible in the
// preview — on a small opening the pads fold through the ring's axis and each other. What is checked
// is that `ringLegs`'s verdict is right in BOTH directions: every design it accepts is watertight,
// and every one it refuses falls back to a plain hoop that still is.
// The pad centres = where a leg goes in, in the ring's own XY plane.
const padCentres = (p: Design): [number, number][] => {
  const l = G.ringLegs(p);
  if (!l) return [];
  return Array.from({ length: l.n }, (_, k): [number, number] => {
    const a = (k / l.n) * Math.PI * 2;
    return [l.Rc * Math.cos(a), l.Rc * Math.sin(a)];
  });
};
// How many of the mesh's faces cover (x, y) when projected onto the XY plane.
const faceHits = (geom: THREE.BufferGeometry, x: number, y: number) => {
  const pos = geom.getAttribute("position"), idx = geom.index ? geom.index.array : null;
  const n = idx ? idx.length / 3 : pos.count / 3;
  const side = (ax: number, ay: number, bx: number, by: number) => (ax - x) * (by - y) - (bx - x) * (ay - y);
  let hits = 0;
  for (let t = 0; t < n; t++) {
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const d1 = side(pos.getX(i0), pos.getY(i0), pos.getX(i1), pos.getY(i1));
    const d2 = side(pos.getX(i1), pos.getY(i1), pos.getX(i2), pos.getY(i2));
    const d3 = side(pos.getX(i2), pos.getY(i2), pos.getX(i0), pos.getY(i0));
    if (!(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)))) hits++;
  }
  return hits;
};
let lgFail = 0, lgTotal = 0, lgOn = 0, lgOff = 0;
for (const preset of PRESETS)
  for (const height of [hLo, 205, 400])
    for (const rMax of [rLo, 20, 40, 130, rHi])
      for (const legSockets of [true, false]) {
        {
          const widest = Math.max(...preset.pts.map((q) => q.r));
          const pts = preset.pts.map((q) => ({ ...q, r: Math.min(rHi, Math.max(rLo, (q.r * rMax) / widest)) }));
          const p = { ...DEFAULTS, ...preset, pts, height, legSockets };
          if (G.ringLegs(p)) lgOn++; else lgOff++;
          // The flag and the room are separate answers, and the UI shows different text for each.
          lgTotal++;
          if (!legSockets && G.ringLegs(p)) { lgFail++; console.log(`✗[L] ${preset.key} :: legSockets:false still cut sockets`); }
          lgTotal++;
          if (legSockets && G.ringLegsFit(p) !== (G.ringLegs(p) !== null)) { lgFail++; console.log(`✗[L] ${preset.key} :: ringLegsFit disagrees with ringLegs`); }
          const tag = `${preset.key} h${height} rMax${rMax} legs${legSockets ? 1 : 0}`;
          for (const [name, g] of [["ring.bot", G.ringGeometry(p, false)], ["ring.top", G.ringGeometry(p, true)]] as [string, THREE.BufferGeometry][]) {
            const r = checkGeom(g);
            lgTotal++;
            if (!r.ok) { lgFail++; if (lgFail <= 40) console.log(`✗[L] ${tag} :: ${name} → ${r.reason}`); }
          }
          // Edge counting is blind to a hole that got FILLED IN — the shell stays closed either way,
          // and a socket with no bore is a ring you cannot put a leg in. So shoot a ray up each
          // pad's middle: 0 faces = open, 2 = capped. The one check that treats a hole as a hole.
          for (const [x, y] of padCentres(p)) {
            lgTotal++;
            const c = faceHits(G.ringGeometry(p, false), x, y);
            if (c !== 0) { lgFail++; if (lgFail <= 40) console.log(`✗[L] ${tag} :: leg bore blocked (${c} faces over it)`); }
          }
          // The pads are separate closed shells merged into the hoop, so edge counting alone passes
          // a set folded through itself. Assert the two shape conditions the guard exists for.
          const legs = G.ringLegs(p);
          lgTotal++;
          if (legs && legs.Rc - legs.triR < 0) { lgFail++; console.log(`✗[L] ${tag} :: pad crosses the axis`); }
          lgTotal++;
          if (legs) {
            const cx = legs.Rc + legs.triR / 2, cy = (legs.triR * Math.sqrt(3)) / 2;
            if (2 * Math.atan2(cy, cx) >= (2 * Math.PI) / legs.n) { lgFail++; console.log(`✗[L] ${tag} :: pads overlap each other`); }
          }
        }
      }
console.log(`\n=== bottom-ring leg sockets: ${lgTotal} checks, ${lgFail} FAIL ===`);
console.log(`sockets cut: ${lgOn} / plain hoop + marker (off, or no room): ${lgOff}`);

const bad = fail + hfail + spFail + spcFail + exFail + lgFail;
process.exit(bad ? 1 : 0);
