/**
 * ============================================================================
 * persist.ts sanitize verification (manual check, no test runner)
 * ============================================================================
 * Save/restore can receive corrupt values from external sources (hand-written,
 * old versions, JSON round-trips). This confirms they neither crash, produce
 * NaN, nor yield a non-watertight koma, and are safely fallen back to DEFAULTS /
 * salvaged. Runs with localStorage mocked by an in-memory implementation.
 *
 * Run:  npm run check:persist
 * ============================================================================
 */
const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: unknown) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
} as unknown as Storage;

const P = await import("../src/persist.ts");
const G = await import("../src/geometry.ts");
const { DEFAULTS, LIMITS } = await import("../src/config.ts");
type SavedState = import("../src/persist.ts").SavedState;

// This file's whole job is handing the restore path what a corrupt, hand-edited or older client
// wrote, so most of what goes in below is deliberately NOT a valid SavedState. The casts live here,
// in the test, rather than being bought by widening what persist.ts claims to accept — and the `!`s
// say the same thing the assertions do: these calls are expected to give a state back.
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
  // The rings are in here because legN/legD are persisted and feed a mesh: a corrupt pair is the
  // one way a restore can hand the bottom ring pads it cannot build.
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

save({ p: { ...DEFAULTS, neckOn: false }, bedW: 256, bedD: 256, printRibs: 1 });
t("legacy neckOn preserved", load().p.neckOn === false);

// ---- bottom-ring leg sockets (legSockets) ----
// One flag, but it decides which of two solids the bottom ring is, so both have to survive the
// round-trip watertight — and a design saved before the flag existed has to come back with sockets.
save({ p: { ...DEFAULTS, legSockets: false }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("legSockets off preserved", r.p.legSockets === false);
t("legSockets off → no sockets cut", G.ringLegs(r.p) === null);
t("legSockets off → watertight", manifoldOK(r.p) === true);

const noLegs: Partial<typeof DEFAULTS> = { ...DEFAULTS };
delete noLegs.legSockets;
save({ p: noLegs, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("pre-flag save → sockets on", r.p.legSockets === true && G.ringLegs(r.p) !== null);
t("pre-flag save → watertight", manifoldOK(r.p) === true);

// A tiny opening has no room for pads; the ring must fall back to a hoop rather than fold up, and
// say so through ringLegsFit rather than by silently producing a different part.
save({ p: { ...DEFAULTS, pts: [{ t: 0.05, r: 10 }, { t: 0.5, r: 40 }, { t: 0.95, r: 10 }] },
  bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("opening too small → no sockets", G.ringLegs(r.p) === null && G.ringLegsFit(r.p) === false);
t("opening too small → still watertight", manifoldOK(r.p) === true);

save({ p: { ...DEFAULTS, height: 333 }, bedW: 256, bedD: 256, printRibs: 3 });
r = load();
t("normal round-trip (height/printRibs)", r.p.height === 333 && r.printRibs === 3);

// pitch=0 (broken value) → range clamp. Left as-is, grooveList loops forever with n=Infinity.
save({ p: { ...DEFAULTS, pitch: 0 }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("pitch=0 → clamped to positive range", r.p.pitch >= 8);
t("grooveList returns a finite count even after pitch=0 restore", (() => {
  const gs = G.grooveList(r.p, r.p.higoD / 2 + 0.25);
  return Array.isArray(gs) && gs.length < 1000;
})());

// Out-of-range numbers (negative / huge) → clamp to the allowed range.
save({ p: { ...DEFAULTS, height: -5, boardT: 99, boards: 999 }, bedW: 9, bedD: 9999, printRibs: 1 });
r = load();
// Read the floor from LIMITS rather than restating it: the point of the assertion is "a corrupt
// height lands back inside the range the editor works in", not the number itself.
t(`height negative → ${LIMITS.height[0]} or more`, r.p.height >= LIMITS.height[0]);
t("boardT huge → 4 or less", r.p.boardT <= 4);
t(`pts radius → within ${LIMITS.r.join("..")}`, r.p.pts.every((q) => q.r >= LIMITS.r[0] && q.r <= LIMITS.r[1]));
t("boards huge → maxBoards or less", r.p.boards <= G.maxBoards(r.p));
t("bedW/bedD out of range → 100..420", r.bedW >= 100 && r.bedD <= 420);

// pts t out of range → clamp to [0,1] and sort ascending.
save({ p: { ...DEFAULTS, pts: [{ t: -3, r: 60 }, { t: 9, r: 20 }] }, bedW: 256, bedD: 256, printRibs: 1 });
r = load();
t("clamp pts t to [0,1]", r.p.pts.every((q) => q.t >= 0 && q.t <= 1));

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
t("ZIP config load: missing printRibs/matT filled with defaults", fromZipCfg && fromZipCfg.printRibs === 1 && fromZipCfg.matT === 5);
t("ZIP config load: watertight", manifoldOK(fromZipCfg.p) === true);

// ---- build route (3D print / cardboard) ----
// It is not a design value but it decides whether the print bed constrains anything, so a corrupt or
// missing one must land on the safe side: "stl", where the bed warning still runs.
const rt = (v: unknown) => parse(JSON.stringify({ schemaVersion: 1, p: { ...DEFAULTS }, route: v }));
t("route round-trip: paper preserved", rt("paper").route === "paper");
t("route missing → stl", rt(undefined).route === "stl");
t("route garbage → stl", rt("cardboard").route === "stl" && rt(7).route === "stl" && rt(null).route === "stl");

// Broken input → null (the app shows an alert → keeps current state). Does not crash.
t("broken JSON → null", P.parseImport("{ not json") === null);
t("empty string → null", P.parseImport("") === null);
t("non-object JSON → null", P.parseImport("42") === null);

console.log(`\n=== ${pass} pass / ${fail} fail ===`);
process.exit(fail ? 1 : 0);
