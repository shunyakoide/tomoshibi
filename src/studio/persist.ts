/**
 * Auto-saves the working state to localStorage and restores it on startup. The point is the SEAM
 * values — boardT / tabLen / komaT / boards / fit —
 * that a reload back to DEFAULTS would lose, taking the reuse of an already-printed stand with it.
 *
 * **Restore always goes through `sanitizeP`**: a hand-written, old-version or round-tripped file
 * must not make `outerR` NaN (a non-manifold STL) or hand the first render an oversized `boards`
 * (a koma whose notches overlap). Verified by `npm run check:persist`.
 */
import { DEFAULTS, LIMITS } from "../config.ts";
import { maxBoards, WASHI_SIDE, WASHI_END } from "../geometry.ts";
import { clamp } from "../util.ts";
import type { Design, NumericDesignKey, Pt, Route } from "../types.ts";

/**
 * Everything one save holds: the design plus the machine settings, which are facts about the maker
 * rather than the lantern. Also the shape of the exported JSON and the ZIP's config.json, so a
 * design mailed to someone else restores the way it was saved.
 */
export type SavedState = {
  p: Design;
  bedW: number; bedD: number; printRibs: number;
  matT: number; washiSide: number; washiEnd: number;
  route: Route;
};

export const STORAGE_KEY = "tomoshibi.studio";
export const SCHEMA_VERSION = 1;

// First-run onboarding card, on its own key: exporting a design must not carry "has this person
// seen the intro", and clearing the flag must not touch the shape. Same shape as i18n's lang key.
export const WELCOME_KEY = "tomoshibi.welcome";
export function loadWelcomeSeen() {
  try { return localStorage.getItem(WELCOME_KEY) === "1"; }
  catch { return true; }   // storage blocked → don't nag on every load
}
export function saveWelcomeSeen() {
  try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* the card simply shows again next time */ }
}

// Allowed range [min, max] per numeric field. Restored values skip the UI's clamping, so a bad
// value from corrupt localStorage or external JSON flows straight into geometry — `pitch: 0` makes
// `grooveList`'s `n = Math.round(span/pitch)` Infinity and loops forever. Ranges match the UI's own
// domains; unknown fields get a safely wide one. The two silhouette ranges come from `LIMITS`
// rather than being restated: a saved design is only safe if the editor could have produced it, and
// r's floor is a geometric wall (below it the rib cannot close), not a UI preference.
const BOUNDS: Record<NumericDesignKey, readonly [number, number]> = {
  height: LIMITS.height, rTop: LIMITS.r, rBot: LIMITS.r, boards: [4, 16],
  boardWidth: [10, 120], boardT: [1, 4], higoD: [1, 4], pitch: [8, 30],
  fit: [0, 1], tabLen: [5, 40], tabW: [4, 40], komaT: [3, 20], tabR: [6, 40],
};
const NUM_KEYS = Object.keys(BOUNDS) as NumericDesignKey[];

// Validate a Bezier tangent handle (ho/hi): keep it only if both {dt,dr} are finite, else discard
// (missing, non-object, NaN, JSON-serialized Infinity=null). A corrupt handle makes outerR NaN.
function validHandle(h: unknown): { dt: number; dr: number } | undefined {
  const q = h as { dt?: unknown; dr?: unknown } | null;
  return q && Number.isFinite(q.dt) && Number.isFinite(q.dr) ? { dt: q.dt as number, dr: q.dr as number } : undefined;
}
// Validate pts: an array of 2+ points with finite {t,r}, else DEFAULTS.pts. Clamps t to [0,1] and r
// to a valid range, and sorts ascending by t — a geometry precondition external data cannot promise.
// ho/hi go through validHandle and are omitted if invalid (that point falls back to an auto tangent).
function validatePts(pts: unknown): Pt[] {
  if (!Array.isArray(pts) || pts.length < 2) return DEFAULTS.pts.map((q) => ({ ...q }));
  for (const q of pts) {
    if (!q || !Number.isFinite(q.t) || !Number.isFinite(q.r)) return DEFAULTS.pts.map((q2) => ({ ...q2 }));
  }
  return pts
    .map((q) => {
      const out: Pt = { t: clamp(0, 1, q.t), r: clamp(...LIMITS.r, q.r) };
      if (q.sharp) out.sharp = true;
      const ho = validHandle(q.ho), hi = validHandle(q.hi);
      if (ho) out.ho = ho;
      if (hi) out.hi = hi;
      return out;
    })
    .sort((a, b) => a.t - b.t);
}

// Coerce numbers. Non-finite (string / missing / NaN) fall back to DEFAULTS; out-of-range
// values are clamped into the allowed range.
function coerceNums(p: Design): Design {
  for (const k of NUM_KEYS) {
    const [lo, hi] = BOUNDS[k];
    const v = Number(p[k]);
    p[k] = Number.isFinite(v) ? clamp(lo, hi, v) : DEFAULTS[k];
  }
  return p;
}

// Sanitize a shape p: shallow-merge missing fields from DEFAULTS, validate pts, coerce numbers,
// clamp boards. The boards clamp brings TomoshibiStudio's self-healing effect forward, so the first
// render cannot produce a non-watertight koma.
function sanitizeP(rawP: unknown): Design {
  const raw = rawP as Partial<Design> | null | undefined;
  const p: Design = { ...DEFAULTS, ...raw };   // missing fields are filled from the single source of truth, DEFAULTS
  p.pts = validatePts(raw && raw.pts);
  coerceNums(p);
  p.boards = Math.min(p.boards, maxBoards(p));
  return p;
}

// Save: swallow failures (quota exceeded / private mode / localStorage disabled).
export function saveState(state: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...state }));
  } catch { /* the app works even if saving fails (next launch simply starts from DEFAULTS) */ }
}

// Read saved.p even when the version is unknown — the shallow merge is forward-compatible, so
// machine invariants are not thrown away. Only add a version here on a real breaking change.
const INCOMPATIBLE_VERSIONS = new Set<unknown>(); // e.g. on a breaking change, add the affected version here

// Parsed object → sanitized SavedState (null if invalid). Every externally-sourced object —
// localStorage restore, file load, ZIP-embedded config — passes through here, so making corrupt
// values safe is one path rather than one per caller.
export function sanitizeSaved(saved: unknown): SavedState | null {
  if (!saved || typeof saved !== "object") return null;
  // The one cast in the file: past this line every field is read through a coercion that cannot
  // return anything but a number.
  const raw = saved as Record<string, unknown>;
  if (INCOMPATIBLE_VERSIONS.has(raw.schemaVersion)) return null;
  const clampNum = (v: unknown, lo: number, hi: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? clamp(lo, hi, n) : def; };
  const bedW = clampNum(raw.bedW, 100, 420, 256);   // UI numInput allowed range
  const bedD = clampNum(raw.bedD, 100, 420, 256);
  const printRibs = Math.round(clampNum(raw.printRibs, 1, 16, 1)); // 1..boards; upper bound further clamped on the boards side
  const matT = clampNum(raw.matT, 1, 10, 5);        // paper-template material thickness (mm). UI stepper allowed range
  // How this person builds the mold: "stl" (3D print) or "paper" (cardboard). A fact about the
  // maker, not the design, but it decides whether the print bed constrains anything at all, so it is
  // restored alongside the bed. Anything else falls back to "stl".
  const route = raw.route === "paper" ? "paper" : "stl";
  // Washi-template allowances (mm). Purely a paper margin — nothing in the mold depends on them,
  // so any out-of-range value just clamps back into the UI stepper's range.
  const washiSide = clampNum(raw.washiSide, 0, 15, WASHI_SIDE);
  const washiEnd = clampNum(raw.washiEnd, 0, 15, WASHI_END);
  return { p: sanitizeP(raw.p), bedW, bedD, printRibs, matT, washiSide, washiEnd, route };
}

export function loadSaved(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeSaved(JSON.parse(raw));
  } catch { return null; }
}

// Export: the working state as JSON, same schema as saveState and the ZIP's config.json, so a
// design survives localStorage being cleared.
export function serializeState(state: SavedState): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...state }, null, 2);
}

// Import: a string → sanitized state (null if invalid). ZIP-embedded config.json or a standalone
// export alike — sanitizeSaved fills missing fields from DEFAULTS, so either restores as-is.
export function parseImport(text: string): SavedState | null {
  try { return sanitizeSaved(JSON.parse(text)); }
  catch { return null; }
}
