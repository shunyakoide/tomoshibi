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
 *
 * The sweep is split across every core: each worker runs the same loops and takes every Nth
 * design, the counts are summed and the report printed once. MANIFOLD_WORKERS=1 runs it in this
 * thread (for --cpu-prof, or a runner that has nothing to spare).
 */
import type * as THREE from "three";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import os from "node:os";
import * as G from "../src/geometry.ts";
import { PRESETS, DEFAULTS, LIMITS, T_GAP } from "../src/config.ts";
import { neckFloor } from "../src/ui/pointEdit.ts";
import { paperP } from "../src/papercraft.ts";   // the cardboard route's own design: the hoop there is bent wire
import type { Design, Pt } from "../src/types.ts";

/** One part's verdict. `reason` is what gets printed when it fails. */
type Result = { name?: string; ok: boolean; reason?: string };

/** Every count the report prints, by name. A worker's are partial; the parent sums them. */
type Tally = Record<string, number>;
const WORKERS = Math.max(1, Number(process.env.MANIFOLD_WORKERS) || os.availableParallelism());
const SHARDS: number = isMainThread ? 1 : workerData.shards, SHARD: number = isMainThread ? 0 : workerData.shard;
// Every section numbers its designs in the order its loops produce them — the same order in every
// worker — and a worker keeps those whose number is its own modulo the worker count, so the shards
// partition the sweep exactly and a failure is printed by exactly one of them (up to 40 per section
// per worker). The parent thread with workers to spawn sweeps nothing itself.
let serial = 0;
const mine = () => serial++ % SHARDS === SHARD;

function report(t: Tally): void {
  console.log(`\n=== ${t.total} checks, ${t.fail} FAIL ===`);
  console.log(`tab-tip dent (koma stop): cut ${t.stopOn} / plain tab, no room ${t.stopOff}`);
  console.log(`combos where maxBoards clamped the count: ${t.clamped} (= invalid counts the UI cannot make)`);
  console.log(`\n=== handle editing: ${t.htotal} checks, ${t.hfail} FAIL ===`);
  console.log(`\n=== spiral winding: ${t.spTotal} checks, ${t.spFail} FAIL ===`);
  console.log(`\n=== silhouette extremes (h ${hLo}..${hHi} × r ${rLo}..${rHi}): ${t.exTotal} checks, ${t.exFail} FAIL ===`);
  console.log(`\n=== control-point spacing (gap ${T_GAP}..0.1 × ${LIMITS.pts[0]}..${LIMITS.pts[1]} points): ${t.spcTotal} checks, ${t.spcFail} FAIL ===`);
  console.log(`\n=== bottom-ring leg sockets: ${t.lgTotal} checks, ${t.lgFail} FAIL ===`);
  console.log(`sockets cut: ${t.lgOn} / plain hoop + marker (off, or no room): ${t.lgOff}`);
  console.log(`\n=== the self-intersection guard (bodyMinR vs an independent scan): ${t.gmTotal} checks, ${t.gmFail} FAIL ===`);
  console.log(`\n=== how a hoop goes on (hoopTurn vs a search, hoopLean vs its room): ${t.hpTotal} checks, ${t.hpFail} FAIL ===`);
}
const [hLo, hHi] = LIMITS.height, [rLo, rHi] = LIMITS.r;

if (isMainThread && WORKERS > 1) {
  const parts = await Promise.all(Array.from({ length: WORKERS }, (_, i) => new Promise<Tally>((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { shard: i, shards: WORKERS } });
    w.on("message", res);
    w.on("error", rej);
    w.on("exit", (code) => { if (code) rej(new Error(`worker ${i} exited with ${code}`)); });
  })));
  const sum: Tally = {};
  for (const t of parts) for (const k in t) sum[k] = (sum[k] || 0) + t[k];
  report(sum);
  process.exit(sum.fail + sum.hfail + sum.spFail + sum.spcFail + sum.exFail + sum.lgFail ? 1 : 0);
}

const Q = 1e4; // Quantization (0.0001mm). Edge sharing is judged by vertex coordinates.
// A quantized coordinate is packed two to a number, so a vertex is found in a Map of numbers rather
// than by a string built for every corner of every triangle: that string was half the sweep's time.
// |coordinate| < 2^25 / Q = 3355mm covers LIMITS.height's 2000 with room; past it the packing would
// collide, so it is a failure rather than a wrong answer.
const PACK = 2 ** 26, COORD_MAX = 2 ** 25;

function checkGeom(geom: THREE.BufferGeometry): Result {
  const pos = geom.getAttribute("position");
  const arr = pos.array;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return { ok: false, reason: "NaN vertex" };
  const idx = geom.index ? geom.index.array : null;
  const nTri = idx ? idx.length / 3 : pos.count / 3;
  // Vertex → id, by quantized coordinates: (x, y) packed into one key, z the second level.
  const ids = new Map<number, Map<number, number>>();
  let nextId = 0;
  const vid = (i: number): number => {
    const x = Math.round(arr[i * 3] * Q), y = Math.round(arr[i * 3 + 1] * Q), z = Math.round(arr[i * 3 + 2] * Q);
    if (Math.abs(x) >= COORD_MAX || Math.abs(y) >= COORD_MAX || Math.abs(z) >= COORD_MAX) return -1;
    const k1 = x * PACK + y;
    let m = ids.get(k1);
    if (!m) { m = new Map(); ids.set(k1, m); }
    let id = m.get(z);
    if (id === undefined) { id = nextId++; m.set(z, id); }
    return id;
  };
  const edges = new Map<number, number>();
  const edge = (a: number, b: number) => { const k = a < b ? a * PACK + b : b * PACK + a; edges.set(k, (edges.get(k) || 0) + 1); };
  for (let t = 0; t < nTri; t++) {
    const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const a = vid(ia), b = vid(ib), c = vid(ic);
    if (a < 0 || b < 0 || c < 0) return { ok: false, reason: "coordinate beyond ±3355mm" };
    if (a === b || b === c || a === c) return { ok: false, reason: "degenerate triangle" };
    edge(a, b); edge(b, c); edge(c, a);
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
              if (!mine()) continue;
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
        if (!mine()) continue;
        const base = { ...DEFAULTS, ...preset, height, boards: Math.min(boards, G.maxBoards({ ...DEFAULTS, ...preset })) };
        const baked = G.bakeBezierHandles(base.pts);
        const p = { ...base, pts: kind === "baked" ? baked : perturb(baked, kind) };
        for (const r of checkParts(p)) {
          htotal++;
          if (!r.ok) { hfail++; if (hfail <= 40) console.log(`✗[H] ${preset.key} h${height} b${boards} ${kind} :: ${r.name} → ${r.reason}`); }
        }
      }

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
          if (!mine()) continue;
          const base = { ...DEFAULTS, ...preset, height, higoD, pitch, spiral: true };
          const boards = Math.min(reqBoards, G.maxBoards(base));
          const p = { ...base, boards };
          for (let k = 0; k < boards; k++) {
            const r = checkGeom(G.ribGeometry(p, k));
            spTotal++;
            if (!r.ok) { spFail++; if (spFail <= 40) console.log(`✗[S] ${preset.key} h${height} hd${higoD} pi${pitch} b${boards} k${k} → ${r.reason}`); }
          }
        }

// ============ Silhouette extremes sweep (the corners of LIMITS) ============
// Everything above runs the presets at their own radii, so it only sees a moderately sloped body —
// and slope is what the groove notch, and so the lightening window, is sensitive to: a groove is cut
// along the surface NORMAL, so on a steep face its tip reaches inward in x by `depth × √(1+slope²)`,
// and a window standing a constant 11mm off the smooth edge was swallowed by it, opening edges on
// any wide, low body. This is the only section that scales the control points, which is why nothing
// else saw it: each preset is stretched to the edges of LIMITS in both axes, the radius target
// applied by scaling every point until the widest lands on it, so the shape is kept and the slope
// scales with it. higoD 3 is included because the notch reach is largest there. The points then go
// through `neckFloor` as the editor's would: at the 60mm floor NECK_MIN is a quarter of the body at
// each end, and the ends pushed out carry the presets' first and last interior points with them.
let exFail = 0, exTotal = 0;
for (const preset of PRESETS)
  for (const height of [hLo, 205, hHi])
    for (const rMax of [rLo * 2, 130, rHi])
      for (const higoD of [2, 3]) {
        if (!mine()) continue;
        const widest = Math.max(...preset.pts.map((q) => q.r));
        const pts = neckFloor(preset.pts.map((q) => ({ ...q, r: Math.min(rHi, Math.max(rLo, (q.r * rMax) / widest)) })), height);
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
  const base = { ...DEFAULTS, pts: neckFloor([{ t: 0.075, r }, { t: 0.5, r }, { t: 0.925, r }], height), height };
  return checkParts({ ...base, boards: Math.min(8, G.maxBoards(base)) });
};
for (const height of [hLo, 205, hHi]) {
  for (const r of [rLo, 40, rHi]) {
    if (!mine()) continue;
    for (const res of cyl(height, r)) {
      exTotal++;
      if (!res.ok) { exFail++; if (exFail <= 40) console.log(`✗[X] cylinder h${height} r${r} :: ${res.name} → ${res.reason}`); }
    }
  }
  // The floor is only meaningful if it is the actual wall: 2mm under it the rib must NOT come out
  // watertight, or the floor has drifted above the wall and the app is refusing valid designs.
  if (!mine()) continue;
  exTotal++;
  if (cyl(height, rLo - 2).every((res) => res.ok)) {
    exFail++;
    console.log(`✗[X] cylinder h${height} r${rLo - 2} is watertight — LIMITS.r[0] is above the real floor`);
  }
}

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
            if (!mine()) continue;
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
        if (!mine()) continue;
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
// ============ The self-intersection guard itself (`bodyMinR`) ============
// **A guard read too HIGH is what makes an open edge here.** `nominalRi` (printed) and `jointCap`
// (cardboard) both hold the rib's inner edge inside `bodyMinR`, so if that number comes back above
// the body's true least radius, the inner edge is drawn OUTSIDE the outer curve: `grooveOuterPts`
// folds the outline through itself and the extruded rib has open edges. That is a failure of the
// STL, which makes it this script's.
//
// It was 41 samples of the curve for a long time, and three rounds of review found three ways past
// it: a `sharp` control point between two samples, a smooth dip between two samples, and TWO dips,
// where refining the lowest sample's bracket polishes the wrong one. The last of those returned
// 20.00 on a five-point silhouette whose true minimum was 9.21 — 8 open edges on three printed ribs,
// and every sweep above reported 0 FAIL, because the design was nothing like a preset.
//
// So this section does not sweep shapes hoping to catch one. It measures the GUARD, against a truth
// sampled independently of it, over silhouettes that are deliberately not preset-shaped: random
// counts, radii, spacings, `sharp` flags and dragged Bézier handles, plus the one design that got
// past all three fixes. Reading LOW is safe (the cap is conservative) and is not a failure; reading
// HIGH by more than a rounding error is.
let gmFail = 0, gmTotal = 0, gmWorst = 0;
{
  // The truth: `profileR` is what `bodyMinR` claims a minimum of, and `outerR` is that floored at
  // 8mm, so the comparison is against a dense scan of `outerR` with its own floor applied. 20,001
  // samples of a curve whose guard is allowed 2mm.
  const truth = (p: Design) => {
    const t0 = p.pts[0].t, t1 = p.pts[p.pts.length - 1].t;
    let m = Infinity;
    for (let i = 0; i <= 20000; i++) m = Math.min(m, G.outerR(p, t0 + (t1 - t0) * i / 20000));
    return m;
  };
  const measure = (p: Design, tag: string) => {
    if (!mine()) return;
    gmTotal++;
    const high = Math.max(8, G.bodyMinR(p)) - truth(p);   // floored the way `outerR` floors what it draws
    if (high > gmWorst) gmWorst = high;
    if (high > 0.01) {
      gmFail++;
      if (gmFail <= 40) console.log(`✗[G] ${tag} :: bodyMinR ${G.bodyMinR(p).toFixed(3)} reads ${high.toFixed(3)}mm ABOVE the body's least radius ${truth(p).toFixed(3)}`);
    }
  };
  // **The family the design that survived the first three fixes belongs to**, not just that design:
  // a SHALLOW dip that owns the lowest sample — so a refinement polishes its bracket — plus a deeper
  // undershoot somewhere else, which is then never looked at. Swept deliberately, because a random
  // sweep meets this shape only by luck (it found 7 of 1200; this grid fails 20 of 108 against the
  // version that shipped it, the worst by 12.0mm).
  for (const decoy of [12, 20, 30])
    for (const big of [300, 500])
      for (const mid of [20, 24, 40])
        for (const dt of [0.80, 0.84, 0.88])
          for (const height of [205, 400])
            measure({ ...DEFAULTS, height, boards: 16, pts: neckFloor([
              { t: 0.08, r: 60 }, { t: 0.24, r: decoy }, { t: 0.72, r: big, sharp: true },
              { t: dt, r: mid, sharp: true }, { t: 0.92, r: 600 },
            ], height) }, `two dips decoy${decoy} big${big} mid${mid} dt${dt} h${height}`);
  // And a deterministic pseudo-random sweep of the silhouette space. A fixed seed, because a gate
  // that fails on some runs and not others is a gate nobody trusts — and the point is coverage of
  // shapes no preset resembles, not novelty per run.
  let seed = 20260917;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let k = 0; k < 1200; k++) {
    const nPts = LIMITS.pts[0] + Math.floor(rnd() * (LIMITS.pts[1] - LIMITS.pts[0] + 1));
    const height = hLo + rnd() * (hHi - hLo);
    const pts: Pt[] = [];
    let t = 0.02 + rnd() * 0.08;
    for (let i = 0; i < nPts; i++) { pts.push({ t, r: rLo + rnd() * (rHi - rLo), sharp: rnd() < 0.4 }); t += T_GAP + rnd() * (0.8 / nPts); }
    if (pts[nPts - 1].t > 0.98) continue;                 // past the top opening: not a design at all
    if (rnd() < 0.4) for (const q of pts) if (rnd() < 0.7) {   // dragged handles → the Bézier path
      q.ho = { dt: rnd() * 0.1, dr: (rnd() - 0.5) * 200 };
      q.hi = { dt: -rnd() * 0.1, dr: (rnd() - 0.5) * 200 };
    }
    // Through the editor's own floors, so every design here is one a maker could be holding.
    measure({ ...DEFAULTS, height, pts: neckFloor(pts, height) }, `random #${k} n${nPts}`);
  }
}

// ============ How a hoop goes ON the mold (`hoopTurn`, `hoopLean`) ============
// Neither angle moves a vertex of an exported part — they are how the assembly view and the guide's
// figures SEAT a hoop on the assembled mold — but both are arithmetic in `geometry/ring.ts`, and the
// last round's lesson was that a number no gate can read is a number nothing checks. Two claims:
//
//  * **`hoopTurn` is the best turn there is.** Everything on the hoop's inner rim reaches inside the
//    mouth — a leg pad by ~14mm, the bent wire's eyes by ~10mm, the marker tab by 1.35mm — while the
//    rib plate there is solid from the tab out to the opening, so those features have to pass BETWEEN
//    the plates. The closed form takes the pads' azimuths modulo one rib pitch and puts a rib in the
//    middle of their largest gap; here it is checked against a 3,600-step search over every turn, and
//    the two values it predicts are pinned: half a pitch where the rib count is a multiple of the pad
//    count (all the residues coincide) and a sixth of it otherwise.
//  * **`hoopLean` cannot spend more room than it was given.** The viewport leans the hoop away from
//    the body and the standing pose then puts the mold on the floor by its own extent, so a lean that
//    overspent its room would hover the mold or push the hoop through the table. Checked on the
//    ring's OWN vertices, turned the way the viewport turns them, rather than on `2·rOuter·sin α`.
//    It must not bind on the neck either, and the fit that decides THAT is read off the plain top
//    hoop's geometry — a constant copied into a gate agrees with itself forever.
let hpFail = 0, hpTotal = 0;
{
  const pos = (geo: THREE.BufferGeometry) => geo.getAttribute("position");
  // The hoop's smallest radius in its own plane. On the plain top hoop that IS the inner rim, the
  // hole's polygon sitting exactly on it; on the bottom one a pad or the tab reaches further in.
  const rimR = (geo: THREE.BufferGeometry) => {
    const a = pos(geo);
    let m = Infinity;
    for (let i = 0; i < a.count; i++) m = Math.min(m, Math.hypot(a.getX(i), a.getY(i)));
    return m;
  };
  // What the lean costs along the mold's axis. The viewport stands the hoop up (`rotation.x = -π/2`,
  // local y → world -z, local z → world y) and leans it about world Z, so a local vertex lands at
  // `x·sin α + z·cos α` and the hoop occupies the span of that over every vertex — whatever the
  // placement then does with it, since the placement only slides the whole thing.
  const leanSpan = (geo: THREE.BufferGeometry, lean: number) => {
    const a = pos(geo), s = Math.sin(lean), c = Math.cos(lean);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < a.count; i++) {
      const y = a.getX(i) * s + a.getZ(i) * c;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    return hi - lo;
  };
  // Where the inward features sit in the hoop's own frame: the pad centres the ray test already
  // reads, or the marker tab, which `annulusGeo` splices in on the +x side.
  const featureAz = (p: Design) => {
    const pads = padCentres(p);
    return pads.length ? pads.map(([x, y]) => Math.atan2(y, x)) : [0];
  };
  // The nearest rib, in radians, for the worst of those features at a given turn.
  const toNearestRib = (p: Design, az: number[], turn: number) => {
    const pitch = (2 * Math.PI) / p.boards;
    let m = Infinity;
    for (const a of az) {
      const d = Math.abs((((a + turn) % pitch) + pitch + pitch / 2) % pitch - pitch / 2);
      if (d < m) m = d;
    }
    return m;
  };
  const check = (p: Design, tag: string, wire: boolean) => {
    if (!mine()) return;
    hpTotal++;
    const pitch = (2 * Math.PI) / p.boards;
    const az = featureAz(p);
    const turn = G.hoopTurn(p, false);
    const got = toNearestRib(p, az, turn);
    // (1) no turn anywhere does better
    let best = 0;
    for (let i = 0; i < 3600; i++) best = Math.max(best, toNearestRib(p, az, (i / 3600) * 2 * Math.PI));
    if (got < best - 1e-9) {
      hpFail++;
      if (hpFail <= 40) console.log(`✗[H] ${tag} :: hoopTurn clears ${(got * 180 / Math.PI).toFixed(3)}° where ${(best * 180 / Math.PI).toFixed(3)}° was available`);
    }
    // (2) and it is the value the closed form promises
    const want = az.length > 1 && p.boards % az.length !== 0 ? pitch / (2 * az.length) : pitch / 2;
    if (Math.abs(got - want) > 1e-9) {
      hpFail++;
      if (hpFail <= 40) console.log(`✗[H] ${tag} :: clearance ${(got * 180 / Math.PI).toFixed(3)}° is not the promised ${(want * 180 / Math.PI).toFixed(3)}°`);
    }
    // (3) the lean spends only the room it was given, and does not bind on the neck
    const { lo, hi } = G.fukuroRange(p);
    const fit = rimR(G.ringGeometry(p, true)) - G.openingR(p, true);   // the part's own clearance
    for (const top of [false, true]) {
      const openY = (top ? hi : lo) * p.height;
      const room = top ? p.height + p.tabLen - openY : openY + p.tabLen;
      const lean = G.hoopLean(p, top, room);
      const geo = wire ? G.wireRingGeometry(p, top) : G.ringGeometry(p, top);
      geo.rotateZ(G.hoopTurn(p, top));                                  // as the viewport builds it
      const span = leanSpan(geo, lean);
      // 1e-3mm, for the reason the binding tolerance below carries one: these are Float32 vertices,
      // and at the ⌀1200 ceiling a last-bit error is ~4e-5mm — while the cap is meant to spend the
      // room exactly, so the comparison sits right on the boundary. The defect this found was 1.10mm.
      if (span > room + 1e-3) {
        hpFail++;
        if (hpFail <= 40) console.log(`✗[H] ${tag} ${top ? "top" : "bot"} :: leaning ${(lean * 180 / Math.PI).toFixed(2)}° spends ${span.toFixed(2)}mm of ${room.toFixed(2)}mm`);
      }
      const r = G.openingR(p, top);
      const bind = Math.acos(Math.min(1, r / (r + fit)));               // where the rim binds on the neck
      // 1e-5 rad, because `fit` was read off Float32 vertices: at the ⌀16 floor the binding angle
      // goes as √(2f/r), so a last-bit error in a 0.15mm clearance moves it by ~3e-7 rad and an
      // exact comparison failed 1104 times on angles that print the same to three decimals. A lean
      // that is really past its clearance is out by degrees.
      if (lean > bind + 1e-5) {
        hpFail++;
        if (hpFail <= 40) console.log(`✗[H] ${tag} ${top ? "top" : "bot"} :: leaning ${(lean * 180 / Math.PI).toFixed(3)}° past the ${(bind * 180 / Math.PI).toFixed(3)}° its ${fit.toFixed(2)}mm of clearance allows`);
      }
    }
  };
  // The hoop answers to the opening, the rib count and the sockets, and the room answers to the
  // height — so those four are swept, both hoops each time. The bent wire rides a coarser radius
  // grid: it is the same two angles on a 3.8m centreline sampled every 2mm.
  for (const rBot of [8, 13, 26, 40, 74, 120, 300, 600])
    for (const boards of [3, 4, 5, 6, 7, 8, 9, 10, 12, 16])
      for (const legSockets of [true, false])
        for (const height of [60, 205, 900]) {
          const pts: Pt[] = [{ t: 0.075, r: rBot }, { t: 0.5, r: Math.max(rBot, 60) }, { t: 0.925, r: 30 }];
          const base = { ...DEFAULTS, height, rBot, rTop: 30, pts: neckFloor(pts, height), legSockets };
          const p = { ...base, boards: Math.min(boards, G.maxBoards(base)) };
          if (p.boards !== boards) continue;                            // a count the UI cannot make here
          const tag = `r${rBot} b${boards} legs${legSockets ? 1 : 0} h${height}`;
          check(p, tag, false);
          if (rBot === 26 || rBot === 74) check(paperP(p, 3), `${tag} wire`, true);
        }
}

const tally: Tally = { total, fail, stopOn, stopOff, clamped, htotal, hfail, spTotal, spFail, exTotal, exFail, spcTotal, spcFail, lgTotal, lgFail, lgOn, lgOff, gmTotal, gmFail, hpTotal, hpFail };
if (!isMainThread) parentPort!.postMessage(tally);
else {
  report(tally);
  process.exit(fail + hfail + spFail + spcFail + exFail + lgFail + gmFail + hpFail ? 1 : 0);
}
