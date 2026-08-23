/**
 * ============================================================================
 * STATE PERSISTENCE (PERSIST)
 * ============================================================================
 * Auto-saves the working state (shape p + machine settings bedW/bedD + printRibs)
 * to localStorage and restores it on startup. If a reload reverted to DEFAULTS, the
 * seam values needed to reuse the stand (boardT/tabLen/komaT/boards/fit) would also
 * be lost; preventing that is the main goal.
 *
 * No dependency on React/DOM components (only localStorage and pure validation). Being
 * a separate file from geometry.js, it also doesn't violate the "geometry stays pure"
 * constraint. Adds no dependencies (only the browser-standard localStorage).
 *
 * Restore always goes through sanitize: prevents externally-sourced (hand-written / old
 * version / JSON round-trip) corrupt values from making outerR NaN → non-manifold STL,
 * or an oversized boards producing a non-watertight koma on the first render.
 * ============================================================================
 */
import { DEFAULTS, LIMITS } from "./config.js";
import { maxBoards, WASHI_SIDE, WASHI_END } from "./geometry.js";
import { clamp } from "./util.js";

export const STORAGE_KEY = "tomoshibi.studio";
export const SCHEMA_VERSION = 1;

// First-run onboarding card: a separate key from the design state, because it is not part of the
// design (exporting / importing a design must not carry "has this person seen the intro" with it,
// and clearing the flag must not touch the shape). Same shape as i18n's language key.
export const WELCOME_KEY = "tomoshibi.welcome";
export function loadWelcomeSeen() {
  try { return localStorage.getItem(WELCOME_KEY) === "1"; }
  catch { return true; }   // storage blocked → don't nag on every load
}
export function saveWelcomeSeen() {
  try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* the card simply shows again next time */ }
}

// Allowed range [min, max] per numeric field. Restored values don't pass through the
// UI's clamping, so out-of-range values from corrupt localStorage or external JSON flow
// straight into geometry and break it (in particular pitch:0 makes grooveList's
// n=Math.round(span/pitch)=Infinity loop forever). Always clamp into range here.
// Ranges match the UI slider/stepper allowed domains (unknowns get a safely wide range).
// The two silhouette ranges come from LIMITS rather than being written out again: a saved design
// is only "safe" if it is a design the editor could have produced, and r's floor in particular is
// a geometric wall (below it the rib cannot close), not a UI preference — the 8 that used to sit
// here let a corrupt file through at a radius the editor itself refuses.
const BOUNDS = {
  height: LIMITS.height, rTop: LIMITS.r, rBot: LIMITS.r, boards: [4, 16],
  boardWidth: [10, 120], boardT: [1, 4], higoD: [1, 4], pitch: [8, 30],
  fit: [0, 1], tabLen: [5, 40], tabW: [4, 40], komaT: [3, 20], tabR: [6, 40],
};
const NUM_KEYS = Object.keys(BOUNDS);

// Validate a Bezier tangent handle (ho/hi). Accept if both {dt,dr} are finite; otherwise
// (missing, non-object, NaN, JSON-serialized Infinity=null, etc.) discard it. Prevents a
// corrupt handle from making outerR NaN.
function validHandle(h) {
  return h && Number.isFinite(h.dt) && Number.isFinite(h.dr) ? { dt: h.dt, dr: h.dr } : undefined;
}
// Validate pts: must be an array, 2+ points, each element {t,r} finite. If not, substitute
// DEFAULTS.pts. Clamp t to [0,1] and r to a valid range, and sort ascending by t (a geometry
// precondition; externally-sourced data has no guaranteed order).
// ho/hi (optional) are made safe via validHandle and omitted if invalid (= that point falls
// back to an auto tangent).
function validatePts(pts) {
  if (!Array.isArray(pts) || pts.length < 2) return DEFAULTS.pts.map((q) => ({ ...q }));
  for (const q of pts) {
    if (!q || !Number.isFinite(q.t) || !Number.isFinite(q.r)) return DEFAULTS.pts.map((q2) => ({ ...q2 }));
  }
  return pts
    .map((q) => {
      const out = { t: clamp(0, 1, q.t), r: clamp(...LIMITS.r, q.r) };
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
function coerceNums(p) {
  for (const k of NUM_KEYS) {
    const [lo, hi] = BOUNDS[k];
    const v = Number(p[k]);
    p[k] = Number.isFinite(v) ? clamp(lo, hi, v) : DEFAULTS[k];
  }
  return p;
}

// Sanitize a shape p: shallow-merge to fill missing fields from DEFAULTS, then validate pts,
// coerce numbers, and clamp boards. The boards clamp brings TomoshibiStudio's self-healing
// effect forward (so the first render doesn't produce a non-watertight koma).
function sanitizeP(rawP) {
  const p = { ...DEFAULTS, ...rawP };   // missing fields are filled from the single source of truth, DEFAULTS
  p.pts = validatePts(rawP && rawP.pts);
  coerceNums(p);
  p.boards = Math.min(p.boards, maxBoards(p));
  return p;
}

// Save: swallow failures (quota exceeded / private mode / localStorage disabled).
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...state }));
  } catch { /* the app works even if saving fails (next launch simply starts from DEFAULTS) */ }
}

// Restore: either a merged / validated / clamped {p, bedW, bedD, printRibs, matT, washi*, route}, or null if
// invalid. Read saved.p even when the version is unknown (shallow merge is forward-compatible,
// so we don't throw away machine invariants). Only add a version to the discard list when a
// truly incompatible breaking change was made.
const INCOMPATIBLE_VERSIONS = new Set(); // e.g. on a breaking change, add the affected version here

// Parsed object → sanitized {p, bedW, bedD, printRibs, matT, washiSide, washiEnd, route} (null if invalid).
// Every "single externally-sourced object" — localStorage restore, file load, ZIP-embedded
// config, etc. — passes through here. Making corrupt values safe (sanitizeP / clamp) is
// consolidated into one path instead of being written per route.
export function sanitizeSaved(saved) {
  if (!saved || typeof saved !== "object") return null;
  if (INCOMPATIBLE_VERSIONS.has(saved.schemaVersion)) return null;
  const clampNum = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? clamp(lo, hi, n) : def; };
  const bedW = clampNum(saved.bedW, 100, 420, 256);   // UI numInput allowed range
  const bedD = clampNum(saved.bedD, 100, 420, 256);
  const printRibs = Math.round(clampNum(saved.printRibs, 1, 16, 1)); // 1..boards; upper bound further clamped on the boards side
  const matT = clampNum(saved.matT, 1, 10, 5);        // paper-template material thickness (mm). UI stepper allowed range
  // How this person builds the mold: "stl" (3D print) or "paper" (cardboard). A setup fact about the
  // maker, not about the design — but it decides whether the print bed constrains anything at all, so
  // it is restored alongside the bed like any other machine setting. Anything else falls back to "stl".
  const route = saved.route === "paper" ? "paper" : "stl";
  // Washi-template allowances (mm). Purely a paper margin — nothing in the mold depends on them,
  // so any out-of-range value just clamps back into the UI stepper's range.
  const washiSide = clampNum(saved.washiSide, 0, 15, WASHI_SIDE);
  const washiEnd = clampNum(saved.washiEnd, 0, 15, WASHI_END);
  return { p: sanitizeP(saved.p), bedW, bedD, printRibs, matT, washiSide, washiEnd, route };
}

export function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeSaved(JSON.parse(raw));
  } catch { return null; }
}

// Export: serialize the current working state to a JSON string with the same schema as
// saveState / the ZIP-embedded config.json. Saving this to a file lets the design be restored
// even if localStorage (a volatile cache layer) is cleared.
export function serializeState(state) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...state }, null, 2);
}

// Import: a string (from a file, etc.) → sanitized state (null if the JSON/content is invalid).
// Whether it's a ZIP-embedded config.json ({schemaVersion, p, bedW, bedD}) or a standalone
// exported state, sanitizeSaved fills missing fields from DEFAULTS so it restores as-is.
export function parseImport(text) {
  try { return sanitizeSaved(JSON.parse(text)); }
  catch { return null; }
}
