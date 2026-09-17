/**
 * persist.ts sanitize verification (manual check, no test runner)
 * Save/restore can receive corrupt values from external sources (hand-written,
 * old versions, JSON round-trips). This confirms they neither crash, produce NaN
 * nor yield a non-watertight koma, but fall back to DEFAULTS or are salvaged,
 * against an in-memory localStorage mock.
 *
 * Run:  npm run check:persist
 */
const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: unknown) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
} as unknown as Storage;

const P = await import("../src/studio/persist.ts");
const G = await import("../src/geometry.ts");
const { DEFAULTS, LIMITS, T_GAP, NECK_MIN, OPENING_MIN } = await import("../src/config.ts");
const { FRESH } = P;
type SavedState = import("../src/studio/persist.ts").SavedState;

// Most of what goes in below is deliberately NOT a valid SavedState. The casts live here rather
// than being bought by widening what persist.ts claims to accept, and the `!`s say what the
// assertions say: these calls are expected to give a state back.
const save = (state: unknown) => P.saveState(state as SavedState);
const load = () => P.loadSaved()!;
const serialize = (state: unknown) => P.serializeState(state as SavedState);
const parse = (text: string) => P.parseImport(text)!;

const openEdges = (g: import("three").BufferGeometry) => {
  const pos = g.getAttribute("position"), idx = g.index ? g.index.array : null;
  const n = idx ? idx.length / 3 : pos.count / 3, E = new Map<string, number>();
  const key = (i: number) => [Math.round(pos.getX(i) * 1e4), Math.round(pos.getY(i) * 1e4), Math.round(pos.getZ(i) * 1e4)].join(",");
  for (let t = 0; t < n; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const ks = [key(a), key(b), key(c)];
    for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) { const e = ks[x] < ks[y] ? ks[x] + "|" + ks[y] : ks[y] + "|" + ks[x]; E.set(e, (E.get(e) || 0) + 1); }
  }
  let o = 0; for (const c of E.values()) if (c === 1) o++; return o;
};
const finiteP = (p: any) => Object.entries(p).every(([k, v]) => k === "shape" || k === "pts" || typeof v === "boolean" || Number.isFinite(v))
  && p.pts.every((q: any) => Number.isFinite(q.t) && Number.isFinite(q.r));
const manifoldOK = (p: any) => {
  // The rings are in here because `legSockets` is persisted and decides which of two solids the
  // bottom ring is — the pads' own dimensions are constants in geometry/ring.ts and cannot be corrupt.
  try { return [G.ribGeometry(p, 0), G.komaGeometry(p), G.standGeometry(p), G.boardGeometry(p),
    G.ringGeometry(p, false), G.ringGeometry(p, true)].every((g) => openEdges(g) === 0); }
  catch (e) { return "EXC:" + (e as Error).message; }
};
const KEY = P.STORAGE_KEY;

let pass = 0, fail = 0;
const t = (name: string, cond: unknown) => { const ok = cond === true; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : " → " + cond}`); ok ? pass++ : fail++; };

delete store[KEY];
t("empty → null", P.loadSaved() === null);

store[KEY] = "{not json";
t("broken JSON → null", P.loadSaved() === null);

save({ p: { ...DEFAULTS, pts: [] }, bedW: 256, bedD: 256, printRibs: 1 });
let r = load();
t("empty pts → restored finite", r && finiteP(r.p));
t("empty pts → watertight", manifoldOK(r.p) === true);

save({ p: { ...DEFAULTS, pts: [{ t: 0.5, r: 60 }] }, bedW: 256, bedD: 256, printRibs: 1 });
t("1 pt → restored to 2+ pts", load().p.pts.length >= 2);

save({ p: { ...DEFAULTS, pts: [{ t: NaN, r: 60 }, { t: 0.9, r: 20 }] }, bedW: 256, bedD: 256, printRibs: 1 });
t("non-finite pts → restored finite", finiteP(load().p));

save({ p: { ...DEFAULTS, boardT: "3" }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("boardT string → number", r.p.boardT === 3 && typeof r.p.boardT === "number");

save({ p: { ...DEFAULTS, boardT: 4, boards: 16 }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("boards too high → clamped to maxBoards", r.p.boards <= G.maxBoards(r.p));
t("boards too high → watertight (former non-watertight koma bug range)", manifoldOK(r.p) === true);

save({ p: { ...DEFAULTS, boardT: 3 }, bedW: 300, bedD: 250, printRibs: 2 });
store[KEY] = store[KEY].replace('"schemaVersion":1', '"schemaVersion":99');
r = load();
t("unknown version → machine-invariant salvage", r && r.p.boardT === 3 && r.bedW === 300);

save({ p: DEFAULTS, printRibs: 1 });
r = load();
t("bedW missing → 256", r.bedW === 256 && r.bedD === 256);

// ---- bottom-ring leg sockets (legSockets) ----
// One flag deciding which of two solids the bottom ring is, so both must survive the round-trip
// watertight. Neither state may be left to DEFAULTS: a test that saved only the default would stop
// exercising the socketed ring the day the default flipped.
save({ p: { ...DEFAULTS, legSockets: false }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("legSockets off preserved", r.p.legSockets === false);
t("legSockets off → no sockets cut", G.ringLegs(r.p) === null);
t("legSockets off → watertight", manifoldOK(r.p) === true);

save({ p: { ...DEFAULTS, legSockets: true }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("legSockets on preserved", r.p.legSockets === true);
t("legSockets on → sockets cut", G.ringLegs(r.p) !== null);
t("legSockets on → watertight", manifoldOK(r.p) === true);

// A save from before the flag existed carries no key, so it comes back as DEFAULTS says: OFF, the
// same reading `ringLegs` gives a missing flag. Absent must mean off in the sanitizer and in the
// geometry alike, or a restored design and its ring disagree.
const noLegs: Partial<typeof DEFAULTS> = { ...DEFAULTS };
delete noLegs.legSockets;
save({ p: noLegs, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("pre-flag save → sockets off", r.p.legSockets === false && G.ringLegs(r.p) === null);
t("pre-flag save → watertight", manifoldOK(r.p) === true);

// A tiny opening has no room for pads; the ring must fall back to a hoop rather than fold up, and
// say so through ringLegsFit rather than by silently producing a different part. Asked of the
// GEOMETRY directly: since `OPENING_MIN` a saved file's openings are floored to 26mm, where the pads
// do fit, so a round trip can no longer deliver a design this small — the guard still has to hold
// for the geometry, which `check:manifold` also sweeps below the editor's floor.
const tiny = { ...DEFAULTS, legSockets: true, pts: [{ t: 0.05, r: 10 }, { t: 0.5, r: 40 }, { t: 0.95, r: 10 }] };
t("opening too small → no sockets", G.ringLegs(tiny) === null && G.ringLegsFit(tiny) === false);
// And through persist, which is where the floor now acts: the same file comes back with openings it
// CAN hang pads on, and the ring says so — the flag having asked for them.
save({ p: tiny, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("saved tiny opening → floored, and the pads then fit", G.ringLegsFit(r.p) === true && G.ringLegs(r.p) !== null);
t("opening too small → still watertight", manifoldOK(r.p) === true);

save({ p: { ...DEFAULTS, height: 333 }, bedW: 256, bedD: 256, printRibs: 3 });
r = load();
t("normal round-trip (height/printRibs)", r.p.height === 333 && r.printRibs === 3);

// pitch=0 (broken value) → range clamp. Left as-is, grooveList loops forever with n=Infinity.
save({ p: { ...DEFAULTS, pitch: 0 }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("pitch=0 → clamped to positive range", r.p.pitch >= 8);
t("grooveList returns a finite count even after pitch=0 restore", (() => {
  const gs = G.grooveList(r.p, G.grooveR(r.p));
  return Array.isArray(gs) && gs.length < 1000;
})());

// Out-of-range numbers (negative / huge) → clamp to the allowed range.
save({ p: { ...DEFAULTS, height: -5, boardT: 99, boards: 999 }, bedW: 9, bedD: 9999, printRibs: 1 });
r = load();
// Read the floor from LIMITS rather than restating it: the assertion is that a corrupt height lands
// back inside the editor's range, not the number itself.
t(`height negative → ${LIMITS.height[0]} or more`, r.p.height >= LIMITS.height[0]);
t("boardT huge → 4 or less", r.p.boardT <= 4);
t(`pts radius → within ${LIMITS.r.join("..")}`, r.p.pts.every((q) => q.r >= LIMITS.r[0] && q.r <= LIMITS.r[1]));
t("boards huge → maxBoards or less", r.p.boards <= G.maxBoards(r.p));
t("bedW/bedD out of range → 100..420", r.bedW >= 100 && r.bedD <= 420);

// pts t out of range → clamp to [0,1] and sort ascending.
save({ p: { ...DEFAULTS, pts: [{ t: -3, r: 60 }, { t: 9, r: 20 }] }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("clamp pts t to [0,1]", r.p.pts.every((q) => q.t >= 0 && q.t <= 1));

// ---- the two silhouette rules a file can break that the editor cannot ----
// Clamping `r` and `t` is not enough: the point COUNT ceiling and the minimum spacing are the rules
// that keep `grooveOuterPts`' outline from folding through itself. A 30-point hand-edited file used
// to restore as 30 points and hand the slicer a rib with 18 open edges, and check:manifold never saw
// it because no sweep varied control-point spacing. Both directions are asserted: legal after
// restore, AND watertight.
const packed = Array.from({ length: 30 }, (_, i) => ({ t: i / 29, r: i % 2 ? 50 : 30 }));
save({ p: { ...DEFAULTS, pts: packed }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t(`30 pts → thinned to ${LIMITS.pts[1]} or fewer`, r.p.pts.length <= LIMITS.pts[1]);
t(`30 pts → still ${LIMITS.pts[0]} or more`, r.p.pts.length >= LIMITS.pts[0]);
t("30 pts → spacing at or above T_GAP", r.p.pts.every((q, i) => i === 0 || q.t - r.p.pts[i - 1].t >= T_GAP - 1e-9));
t("30 pts → watertight", manifoldOK(r.p) === true);

// Sub-T_GAP spacing at a legal count: nothing above catches this, and it is the exact shape the
// editor's own clamp refuses.
save({ p: { ...DEFAULTS, pts: [{ t: 0.30, r: 80 }, { t: 0.30 + 1e-9, r: 120 }, { t: 0.34, r: 80 }] },
  bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("1e-9 gap → spacing at or above T_GAP", r.p.pts.every((q, i) => i === 0 || q.t - r.p.pts[i - 1].t >= T_GAP - 1e-9));
t("1e-9 gap → watertight", manifoldOK(r.p) === true);

// ---- the tab length is pinned ----
// Its row left the panel (2026-09-08): a saved 25 would otherwise set the rib's length and the
// stand's slot spacing from a number nothing on screen can show.
save({ p: { ...DEFAULTS, tabLen: 25 }, bedW: 256, bedD: 256, printRibs: 1 });
t("tabLen 25 → DEFAULTS.tabLen", load().p.tabLen === DEFAULTS.tabLen);

// ---- the opening floor ----
// `OPENING_MIN` applies to the two ENDS only: they ARE the openings, and the mouth is what the rib
// has left to be there. An interior point may still pinch to `LIMITS.r[0]`, which is a geometric
// wall rather than a taste, and a waisted body needs it.
save({ p: { ...DEFAULTS, pts: [{ t: 0.075, r: 9 }, { t: 0.5, r: 9 }, { t: 0.925, r: 9 }] }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t(`opening floor → both ends at or above ${OPENING_MIN}mm`,
  r.p.pts[0].r >= OPENING_MIN - 1e-6 && r.p.pts[r.p.pts.length - 1].r >= OPENING_MIN - 1e-6);
t("opening floor → an interior point is left alone", Math.abs(r.p.pts[1].r - 9) < 1e-6);
t("opening floor → watertight", manifoldOK(r.p) === true);
// A design already above it is not touched. Spelled out rather than reusing DEFAULTS, whose own top
// opening sits under the floor and is raised by it.
const wideMouth = { ...DEFAULTS, pts: DEFAULTS.pts.map((q, i) => ({ ...q, r: i === DEFAULTS.pts.length - 1 ? 30 : q.r })) };
save({ p: wideMouth, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("opening floor → a design above it keeps its radii",
  r.p.pts.every((q, i) => Math.abs(q.r - wideMouth.pts[i].r) < 1e-6));

// ---- the neck floor ----
// `NECK_MIN` is millimetres of a body whose control points are fractions, so a file can sit under
// it three ways: necks the editor never allowed (t = 0.01), a height the file lowered past the
// necks it saved, or a legal design at LIMITS' 60mm floor, where 15mm is a quarter of the body and
// the ends pushed out land on interior points. In every case the ends reach the floor, the spacing
// `legalizePts` enforced survives the push, and the result is watertight.
const neckMm = (p: import("../src/types.ts").Design) => [p.pts[0].t * p.height, (1 - p.pts[p.pts.length - 1].t) * p.height];
for (const [name, p] of [
  ["t=0.01 necks", { ...DEFAULTS, pts: [{ t: 0.01, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.99, r: 19 }] }],
  ["height 80 under 0.075 necks", { ...DEFAULTS, height: 80 }],
  ["height 60 with the default points", { ...DEFAULTS, height: LIMITS.height[0] }],
  ["height 60, eight points packed at T_GAP", { ...DEFAULTS, height: LIMITS.height[0],
    pts: Array.from({ length: LIMITS.pts[1] }, (_, i) => ({ t: 0.05 + i * T_GAP * 1.01, r: 40 + (i % 2) * 30 })) }],
] as const) {
  save({ p, bedW: 256, bedD: 256, printRibs: 1 });
  r = load();
  const [nb, nt] = neckMm(r.p);
  t(`${name} → both necks at or above ${NECK_MIN}mm`, nb >= NECK_MIN - 1e-6 && nt >= NECK_MIN - 1e-6);
  t(`${name} → spacing at or above T_GAP`, r.p.pts.every((q, i) => i === 0 || q.t - r.p.pts[i - 1].t >= T_GAP - 1e-9));
  t(`${name} → point count kept`, r.p.pts.length === p.pts.length);
  t(`${name} → watertight`, manifoldOK(r.p) === true);
}
// A design already above the floor is not touched — not even re-allocated, which is what keeps
// `bodyMinR`'s memo and React's identity checks honest.
save({ p: { ...DEFAULTS, height: 400 }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("necks above the floor keep their t", r.p.pts.every((q, i) => q.t === DEFAULTS.pts[i].t));

// ---- boolean fields ----
// Every numeric field is coerced and none of the booleans were, so a hand-edited or foreign file
// could keep a STRING in one: `"neckBot": "false"` is truthy where profile.ts reads it, and
// serializeState writes it back out, so the design stays a Design that fails its own type.
save({ p: { ...DEFAULTS, neckBot: "false", lighten: 1, spiral: "yes", legSockets: null },
  bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("non-boolean flags → real booleans",
  ["neckBot", "neckTop", "lighten", "spiral", "legSockets"].every((k) => typeof (r.p as any)[k] === "boolean"));
t("wrong-typed flag → the DEFAULTS answer, not !!value",
  r.p.neckBot === DEFAULTS.neckBot && r.p.spiral === DEFAULTS.spiral && r.p.legSockets === DEFAULTS.legSockets);
t("coerced flags survive the round trip as booleans", typeof parse(serialize(r)).p.lighten === "boolean");
t("non-boolean flags → watertight", manifoldOK(r.p) === true);

// The OPTIONAL flag means something by being absent, so a wrong type drops it rather than
// defaulting it: `noTabDent` unset is "the app's own state", and a defaulted `false` would state one.
save({ p: { ...DEFAULTS, noTabDent: 7 }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("wrong-typed optional flag → dropped, not defaulted", r.p.noTabDent === undefined);
save({ p: { ...DEFAULTS, noTabDent: true }, bedW: 256, bedD: 256, printRibs: 1 });
t("a real optional flag is still preserved", load().p.noTabDent === true);

// ---- sanitize of Bézier tangent handles (ho/hi) ----
// Valid handles preserved. Broken handles (non-finite, JSON-serialized Infinity=null,
// non-object) are dropped and fall back to automatic tangents (outerR must not become NaN).
const bakedPts = G.bakeBezierHandles({ ...DEFAULTS }.pts);
save({ p: { ...DEFAULTS, pts: bakedPts }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("valid ho/hi preserved", r.p.pts.some((q) => q.ho && Number.isFinite(q.ho.dt) && Number.isFinite(q.ho.dr)));
t("with handles, watertight after round-trip", manifoldOK(r.p) === true);
t("outerR finite with handles", (() => { for (let i = 0; i <= 50; i++) if (!Number.isFinite(G.outerR(r.p, i / 50))) return false; return true; })());

// Broken handles: dt=NaN / dr=Infinity (nulled by JSON) / ho is an array, etc.
const brokenPts: any[] = [
  { t: 0.05, r: 74, ho: { dt: NaN, dr: 2 }, hi: { dt: Infinity, dr: 0 } },
  { t: 0.4, r: 94, ho: [1, 2], hi: { dt: 0.02 } },      // non-object / missing dr
  { t: 0.95, r: 19, ho: null, hi: "x" },
];
save({ p: { ...DEFAULTS, pts: brokenPts }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("broken ho/hi discarded (no invalid dt/dr remains)",
  r.p.pts.every((q) => (!q.ho || (Number.isFinite(q.ho.dt) && Number.isFinite(q.ho.dr)))
    && (!q.hi || (Number.isFinite(q.hi.dt) && Number.isFinite(q.hi.dr)))));
t("outerR finite even with broken ho/hi", (() => { for (let i = 0; i <= 50; i++) if (!Number.isFinite(G.outerR(r.p, i / 50))) return false; return true; })());
t("watertight even with broken ho/hi", manifoldOK(r.p) === true);

// ---- file export/import (serializeState / parseImport) ----
// Even if localStorage is lost, the original state can be round-tripped back from the
// exported JSON (the core of the restore path).
const roundTrip = parse(serialize({ p: { ...DEFAULTS }, bedW: 300, bedD: 200, printRibs: 3, matT: 6 }));
t("JSON round-trip: p preserved", roundTrip && roundTrip.p.height === DEFAULTS.height);
t("JSON round-trip: device settings preserved", roundTrip.bedW === 300 && roundTrip.bedD === 200 && roundTrip.printRibs === 3 && roundTrip.matT === 6);
t("JSON round-trip: watertight", manifoldOK(roundTrip.p) === true);

// Even a ZIP config.json equivalent (only {schemaVersion, p, bedW, bedD}) has missing fields filled by DEFAULTS.
const fromZipCfg = parse(JSON.stringify({ schemaVersion: 1, p: { ...DEFAULTS }, bedW: 256, bedD: 256 }));
t("ZIP config load: missing printRibs/matT filled with defaults", fromZipCfg && fromZipCfg.printRibs === 1 && fromZipCfg.matT === FRESH.matT);
t("ZIP config load: watertight", manifoldOK(fromZipCfg.p) === true);

// ---- build route (3D print / cardboard) ----
// Not a design value, but it decides whether the print bed constrains anything, so a corrupt or
// missing one must land on the safe side: "stl", where the bed warning still runs.
const rt = (v: unknown) => parse(JSON.stringify({ schemaVersion: 1, p: { ...DEFAULTS }, route: v }));
t("route round-trip: paper preserved", rt("paper").route === "paper");
t("route missing → stl", rt(undefined).route === "stl");
t("route garbage → stl", rt("cardboard").route === "stl" && rt(7).route === "stl" && rt(null).route === "stl");

// Broken input → null (the app shows an alert → keeps current state). Does not crash.
t("broken JSON → null", P.parseImport("{ not json") === null);
t("empty string → null", P.parseImport("") === null);
t("non-object JSON → null", P.parseImport("42") === null);

// ---- the floors are the EDITOR's too, not only a saved file's ----
// persist is the last line, and a last line that keeps having to catch the same thing is a bug
// somewhere earlier: a design the app holds should already be legal, or the file it writes and the
// file it reads back are different shapes and the drawing moves under the user. Two surfaces used to
// hand it points nothing had floored — deleting a ◇, and picking a preset, which is the first design
// most makers will ever have — and a third handed it points too CLOSE TOGETHER, adding one.
// `check:persist` is the only gate that can reach any of them: they live in `src/ui`, and plain node
// cannot load a `.tsx`, which is why everything about a chip except its markup is a `.ts` of its own
// (`ui/presetChip.ts` — the design a pick yields, the picture, and the lit state).
{
  const { pointOps, presetPts, presetHeight, neckFloor, tBounds } = await import("../src/ui/pointEdit.ts");
  const { spacedOK } = await import("../src/config.ts");
  const { presetMini, presetDesign, matchPreset } = await import("../src/ui/presetChip.ts");
  const { PRESETS } = await import("../src/config.ts");
  // 1. Deleting an END ◇ promotes its neighbour to a mouth, and only the ENDS have the opening
  //    floor — an interior ◇ may legally pinch to `LIMITS.r[0]`, 18mm under it. `del` did not
  //    re-legalize, so this exact sequence gave an r8 MOUTH: 2mm of board where a rib passes it
  //    instead of 20, a koma shrunk to ⌀16, no clamp, no alert, and the shape silently floored back
  //    to 26 the next time the file was read.
  const p0: any = { ...DEFAULTS, pts: presetPts(PRESETS[0], DEFAULTS.height).map((q) => ({ ...q })) };
  p0.pts[p0.pts.length - 2].r = LIMITS.r[0];
  let after: any = null;
  const ops = pointOps(p0, (f: any) => { after = f(p0); }, p0.pts.length - 1, () => {});
  t("an end ◇ is deletable at all (the guard is about the point COUNT)", ops.canDelete === true && ops.isEnd === true);
  ops.del();
  t(`delete an end ◇ → the new mouth is at or above ${OPENING_MIN}mm`,
    after.pts[after.pts.length - 1].r >= OPENING_MIN - 1e-6);
  t("delete an end ◇ → spacing still at or above T_GAP",
    after.pts.every((q: any, i: number) => i === 0 || q.t - after.pts[i - 1].t >= T_GAP - 1e-9));
  t("delete an end ◇ → the necks still reach NECK_MIN",
    after.pts[0].t * after.height >= NECK_MIN - 1e-9 && (1 - after.pts[after.pts.length - 1].t) * after.height >= NECK_MIN - 1e-9);
  save({ p: after, bedW: 256, bedD: 256, printRibs: 1 });
  const back = load();
  t("delete an end ◇ → a save and reload does not move the shape",
    back.p.pts.every((q: any, i: number) => Math.abs(q.r - after.pts[i].r) < 1e-6 && Math.abs(q.t - after.pts[i].t) < 1e-6));
  t("delete an end ◇ → watertight", manifoldOK(after) === true);
  // 2. `presetPts` is the ONE answer to "the points a picked preset yields", and `presetHeight` to
  //    "at what height" — read by the pick, by the lit chip and by the chip's own drawing. The
  //    drawing used to floor nothing, so two of the three chips drew a mouth (⌀38, ⌀46) the app
  //    would never build (⌀52).
  //
  //    A DEEP snapshot of the presets first, because the thing to prove about a function three
  //    surfaces call on every render is that it does not touch its input — and `pr` IS the element
  //    of `PRESETS`, so comparing `pr` against `PRESETS.find(...)` compares it with itself and
  //    passes however much it was mutated. It also has to compare `t`: `neckFloor` is the half that
  //    moves t, and it is the half a preset with its own height goes through.
  const frozen = JSON.stringify(PRESETS);
  // `presetPts` hands back a fresh list, and its own copy is what keeps `neckFloor` off the preset.
  // Asserted by identity, because the deep snapshot below passes with that copy removed — the floors
  // are copy-on-write as well, and an assertion that needs two bugs to fire guards neither.
  t("presetPts returns its own list, not the preset's",
    PRESETS.every((pr) => { const out = presetPts(pr, 205); return out !== pr.pts && out.every((q, i) => q !== pr.pts[i]); }));
  for (const pr of PRESETS) {
    // One RAW height per distinct resolved one, and the raw value is what goes in — the chip passes
    // the maker's height and `presetDesign` decides whether this preset keeps it. Resolving it here
    // would hand the assertion the answer: with `平丸`'s own 150 passed in, the height half of the
    // drawing cannot disagree with the pick, and backing `presetHeight` out of the drawing left this
    // gate at 0 fail.
    const seen = new Set<number>();
    const heights = [LIMITS.height[0], 150, 205, 400, LIMITS.height[1]]
      .filter((h) => { const H = presetHeight(pr, h); if (seen.has(H)) return false; seen.add(H); return true; });
    for (const height of heights) {
      const H = presetHeight(pr, height);
      const pts = presetPts(pr, height);
      const tag = `${pr.name} h${height}→${H}`;
      t(`${tag}: both openings at or above ${OPENING_MIN}mm`,
        pts[0].r >= OPENING_MIN - 1e-6 && pts[pts.length - 1].r >= OPENING_MIN - 1e-6);
      t(`${tag}: the necks reach NECK_MIN`,
        pts[0].t * H >= NECK_MIN - 1e-9 && (1 - pts[pts.length - 1].t) * H >= NECK_MIN - 1e-9);
      // The design a pick stores is one persist will hand straight back: the chip stays lit, and the
      // shape a maker picked is the shape their file reopens as. **Five heights is not enough** —
      // see the sweep below, which is the same question asked at every height there is.
      save({ p: { ...DEFAULTS, height: H, rTop: pr.rTop, rBot: pr.rBot, pts }, bedW: 256, bedD: 256, printRibs: 1 });
      const r2 = load();
      t(`${tag}: a picked preset survives a save and reload unchanged`,
        r2.p.pts.length === pts.length && r2.p.pts.every((q: any, i: number) => Math.abs(q.r - pts[i].r) < 1e-6 && Math.abs(q.t - pts[i].t) < 1e-6));
      // THE chip assertions, over the fields `outerR` actually reads — the maker's neck flags and rib
      // count as well as the points and the height. The miniature drew with `DEFAULTS`' flags for a
      // long time, and with both necks off that is a silhouette out by half the chip's own width.
      for (const [nb, nt, boards] of [[true, true, 8], [false, false, 16], [false, true, 4]] as const) {
        const base = { ...DEFAULTS, neckBot: nb, neckTop: nt, boards, height, rTop: 42, rBot: 42 };
        const want = presetDesign(pr, base);
        const mini = presetMini(pr, base);
        const tag2 = `${tag} necks${nb ? 1 : 0}${nt ? 1 : 0} b${boards}`;
        t(`${tag2}: the chip draws the design the pick yields`, JSON.stringify(mini.q) === JSON.stringify(want));
        t(`${tag2}: and it keeps the maker's own fields`,
          mini.q.neckBot === nb && mini.q.neckTop === nt && mini.q.boards === boards && mini.q.height === H);
        t(`${tag2}: the chip's path is drawn`, /^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+){81} Z$/.test(mini.d));
        // The lit state is the other half of "the picture is the shape you have", and it is in this
        // module for the same reason: so a gate can ask it. The design a pick yields must light the
        // chip that yielded it.
        t(`${tag2}: picking it lights its own chip`, matchPreset(want) === pr.key);
      }
    }
  }
  t("no preset was mutated by any of that", JSON.stringify(PRESETS) === frozen);

  //    EVERY height, not five round ones. `neckFloor` writes `m + i * T_GAP`, and that arithmetic
  //    can land a hair short in doubles — at h86 it put `たる`'s two lower points
  //    0.039999999999999994 apart, 7e-18 under `T_GAP` — so persist answered a design the editor had
  //    just made by DROPPING a point, at 7 of the 1941 heights the editor allows, and the chip went
  //    dark on the shape it had drawn a moment before. The five heights above are all clean; this is
  //    1941 × 3 saves and reloads, and it costs about a tenth of a second.
  const dropped: string[] = [], darkened: string[] = [];
  for (const pr of PRESETS)
    for (let h = LIMITS.height[0]; h <= LIMITS.height[1]; h++) {
      const H = presetHeight(pr, h), pts = presetPts(pr, h);
      save({ p: { ...DEFAULTS, height: H, rTop: pr.rTop, rBot: pr.rBot, pts }, bedW: 256, bedD: 256, printRibs: 1 });
      const back = load().p.pts;
      if (back.length !== pts.length || !back.every((q: any, i: number) => Math.abs(q.t - pts[i].t) < 1e-12)) dropped.push(`${pr.name}@${H}`);
      if (matchPreset({ ...DEFAULTS, height: H, pts: back }) !== pr.key) darkened.push(`${pr.name}@${H}`);
    }
  t(`a picked preset survives a save and reload at every height (${LIMITS.height[0]}..${LIMITS.height[1]})`,
    dropped.length === 0 || `${dropped.length} lose a point: ${dropped.slice(0, 8).join(", ")}`);
  t("and the chip stays lit at every one of them", darkened.length === 0 || `${darkened.length}: ${darkened.slice(0, 8).join(", ")}`);

  // 2b. And the PRODUCERS have to emit what the rule accepts. `neckFloor`'s own doc says the list
  //     "stays as spaced as [`tBounds`] guards it", and that claim was false — it is the sentence
  //     the h86 bug above was hiding behind. Both are swept here rather than asserted once, because
  //     what broke it was a particular height's arithmetic, not the formula.
  {
    const bad: string[] = [];
    for (let h = LIMITS.height[0]; h <= LIMITS.height[1]; h++)
      for (const n of [LIMITS.pts[0], 3, 5, LIMITS.pts[1]]) {
        // Every point crushed against the bottom, so the floor has to push all of them: the case
        // that produces `m + i * T_GAP` for every i.
        const out = neckFloor(Array.from({ length: n }, () => ({ t: 0.001, r: 40 })), h);
        for (let i = 1; i < out.length; i++)
          if (!spacedOK(out[i].t - out[i - 1].t)) bad.push(`h${h} n${n} gap ${(out[i].t - out[i - 1].t).toExponential(3)}`);
        // And the same against the top.
        const top = neckFloor(Array.from({ length: n }, () => ({ t: 0.999, r: 40 })), h);
        for (let i = 1; i < top.length; i++)
          if (!spacedOK(top[i].t - top[i - 1].t)) bad.push(`h${h} n${n} top gap ${(top[i].t - top[i - 1].t).toExponential(3)}`);
      }
    t("neckFloor emits gaps the spacing rule accepts, at every height",
      bad.length === 0 || `${bad.length}: ${bad.slice(0, 6).join(", ")}`);
    // `tBounds` is the other producer: a ◇ dragged onto either bound must leave a legal gap.
    const tb: string[] = [];
    for (let h = LIMITS.height[0]; h <= LIMITS.height[1]; h += 7)
      for (const n of [3, 5, LIMITS.pts[1]]) {
        const pts = neckFloor(Array.from({ length: n }, (_, i) => ({ t: 0.1 + i * 0.1, r: 40 })), h);
        for (let i = 0; i < n; i++)
          for (const to of tBounds(pts, i, h)) {
            const moved = pts.map((q, j) => (j === i ? { ...q, t: to } : q));
            for (let k = 1; k < moved.length; k++)
              if (!spacedOK(moved[k].t - moved[k - 1].t)) tb.push(`h${h} n${n} #${i}→${to}`);
          }
      }
    t("a ◇ dragged onto either tBounds edge still leaves a legal gap",
      tb.length === 0 || `${tb.length}: ${tb.slice(0, 6).join(", ")}`);
  }

  // 3. ADDING a ◇ is the third such surface. The `+` ghost is the plain midpoint of a consecutive
  //    pair, and `tBounds` lets a pair sit at exactly `T_GAP`, so on a tight pair the new point
  //    landed `T_GAP/2` from both — and `legalizePts` answered by dropping TWO of them, the new one
  //    and the neighbour it crowded. A design came back from a save with a ◇ the maker had put there
  //    themselves missing. `sectionDrag` is reachable here because `addAtT` touches no DOM (the
  //    `svgRef` is only read inside a drag).
  const { sectionDrag } = await import("../src/ui/section/drag.ts");
  const addAt = (pts: any[], mt: number) => {
    let out: any = null;
    const design: any = { ...DEFAULTS, pts };
    sectionDrag({
      p: design, setP: (f: any) => { out = typeof f === "function" ? f(design) : f; },
      setDrag: () => {}, setSel: () => {}, editMode: "move",
      svgRef: { current: null } as any, s: 1,
    }).addAtT(mt);
    return out;
  };
  // A pair at exactly T_GAP: there is no room for a midpoint, so the add is refused outright.
  const tight = [{ t: 0.075, r: 74 }, { t: 0.28, r: 94 }, { t: 0.28 + T_GAP, r: 90 }, { t: 0.925, r: 26 }];
  t("add a ◇ between two that are T_GAP apart → refused", addAt(tight, 0.28 + T_GAP / 2) === null);
  // And a gap that is `2 × T_GAP` in intent and 0.07999999999999996 in doubles — `.28` and `.36` are
  // both what `tBounds`' floor returns, so it is two ordinary drags. The add is TAKEN, and the file
  // keeps it: the rule is `spacedOK`, one predicate with a tolerance far under anything the geometry
  // can feel, and the editor and persist read the same one. An add taken by a rule that persist
  // states a hair differently is a point offered and then lost.
  const floaty = [{ t: 0.075, r: 74 }, { t: 0.28, r: 94 }, { t: 0.36, r: 90 }, { t: 0.925, r: 26 }];
  const fadd = addAt(floaty, (0.28 + 0.36) / 2);
  t("add a ◇ into a gap 7e-18 under 2×T_GAP → taken", fadd !== null && fadd.pts.length === floaty.length + 1);
  if (fadd) {
    save({ p: fadd, bedW: 256, bedD: 256, printRibs: 1 });
    t("…and the file keeps it", load().p.pts.length === fadd.pts.length);
  }
  // A pair with room: the point goes in, and the file keeps every one of them.
  const roomy = [{ t: 0.075, r: 74 }, { t: 0.28, r: 94 }, { t: 0.66, r: 80 }, { t: 0.925, r: 26 }];
  const added = addAt(roomy, (0.28 + 0.66) / 2);
  t("add a ◇ where there is room → added", added !== null && added.pts.length === roomy.length + 1);
  if (added) {
    save({ p: added, bedW: 256, bedD: 256, printRibs: 1 });
    const r3 = load();
    t("add a ◇ → a save and reload keeps every point",
      r3.p.pts.length === added.pts.length
      && r3.p.pts.every((q: any, i: number) => Math.abs(q.t - added.pts[i].t) < 1e-6));
  }
}

// ---- The state a first visit opens on is the state a reload gives back ----
// `FRESH` is what the studio's `useState` starts from and what 「初期化」 returns to, and it used to
// hand out `DEFAULTS` raw while every other surface put a point list through `silhouetteFloors`.
// `DEFAULTS.pts` ends at r19 where `OPENING_MIN` is 26, so the app opened on a ⌀38 mouth the editor
// would not let you draw, no chip lit for it, and the FIRST SAVE widened it to ⌀52 — and the mouth
// sizes `komaR`/`tabDepth`/`innerRi`, so the kit exported before that save was not the kit exported
// after. The invariant is the fix stated in one line: a round trip through the file must not move a
// fresh state. Asserted on the point list and on the mouth, which is the number that moved.
{
  const { matchPreset } = await import("../src/ui/presetChip.ts");
  const { openingR } = await import("../src/geometry.ts");
  const back = P.sanitizeSaved(JSON.parse(P.serializeState(FRESH)));
  const same = !!back && back.p.pts.length === FRESH.p.pts.length
    && back.p.pts.every((q: any, i: number) => Math.abs(q.t - FRESH.p.pts[i].t) < 1e-9 && Math.abs(q.r - FRESH.p.pts[i].r) < 1e-9);
  t("a fresh state survives a save and reload unchanged", same);
  t("a fresh state's openings are already legal (OPENING_MIN)",
    Math.min(openingR(FRESH.p, false), openingR(FRESH.p, true)) >= OPENING_MIN - 1e-9);
  // And it is therefore ON a template, which is what the chip is derived from: a first visit that
  // lights no chip is one whose shape is not one the app will build.
  t("a fresh state lights the chip it is the shape of", matchPreset(FRESH.p) !== null);
}

console.log(`\n=== ${pass} pass / ${fail} fail ===`);
process.exit(fail ? 1 : 0);
