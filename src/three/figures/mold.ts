/**
 * `moldPieces` is the one builder here: every step figure is that function under different options,
 * because the steps ARE one assembly at different stages, and a second builder would let two of them
 * disagree about where a koma sits.
 */
import * as THREE from "three";
import type { Design } from "../../types.ts";
import {
  fukuroRange, komaGeometry, komaR, maxRadius, openingR,
  ribGeometry, ringGeometry, wireRingGeometry, boardGeometry, standCollarTop, standGeometry, standSaddleH,
  standSlotSep, washiSurface,
} from "../../geometry.ts";
import { higoGeometries } from "../higo.ts";
import { HI, HI_FACE, INK, LIT_FACE, VIEW_DIR, part } from "./ink.ts";

/**
 * The rib as the reader's route makes it: cardboard cuts a SMOOTH outer edge (no 0.5mm V in board)
 * and no lightening windows. `smooth` carries the route in; the rest is `p`, via `paperP`.
 */
export const ribGeo = (p: Design, k: number, smooth: boolean) => ribGeometry(smooth ? { ...p, lighten: false } : p, k, { smooth });

/**
 * The rubber bands holding the assembly while you work: one just outside each koma, the only thing
 * here that is not a part — a plain torus sized off `komaR`. Accent while the step is ABOUT them.
 */
const BAND_OFF = 0xe3b39d;
export function bands(p: Design, hot: boolean): THREE.Group {
  const g = new THREE.Group();
  const r = komaR(p);
  for (const y of [-p.tabLen * 0.45, p.height + p.tabLen * 0.45]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r + 0.8, 1.1, 8, 64),
      new THREE.MeshBasicMaterial({ color: hot ? HI : BAND_OFF }));
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    g.add(t);
  }
  return g;
}

/**
 * The bamboo, wound into the grooves: rings at `grooveList`'s heights on `outerR`'s radius, the same
 * two functions that cut the grooves, so a spiral draws as `higoSpiralPath`'s one helix. Centred ON
 * the outer edge, not sunk in (`grooveR` = higoD/2 + 0.25, so the V is 0.5mm wider than the rod). No
 * route branch: cardboard's ticks are at the same heights.
 */
const HIGO_OFF = 0xbfa06a;      // bamboo tan, once the step has moved on (see `bands` for why muted)
// `near` draws only the camera-facing half of each ring, for the one see-through figure: eight far
// rings over eight near ones is a rattan basket. The arc ends at the silhouette; a spiral stays whole.
function higoWinding(p: Design, hot: boolean, near = false): THREE.Group {
  const g = new THREE.Group();
  const mat = () => new THREE.MeshBasicMaterial({ color: hot ? HI : HIGO_OFF });
  for (const { geo, y } of higoGeometries(p, { radial: 8, near })) {
    const ring = new THREE.Mesh(geo, mat());
    ring.position.y = y;
    g.add(ring);
  }
  return g;
}

/**
 * Rib k's meridian as a LatheGeometry angle. A lathe's point is (r·sin φ, y, r·cos φ) while rib k's
 * `rotation.y = k·2π/N` is azimuth −k·2π/N — a quarter turn and a sign apart, so at the naive angle a
 * panel straddles a rib. Bay k = [ribPhi(k), ribPhi(k+1)].
 */
const ribPhi = (k: number, d: number) => Math.PI / 2 + k * d;

/**
 * The washi, pasted. One `LatheGeometry` PER BAY, not one skin with a slice missing: the seams are
 * the instruction. Surface = the mold's own, offset `higoD` along the NORMAL, not x (`washiProfile`);
 * `fukuroRange` only; no cover allowance drawn. Double-sided and IVORY (white on white is invisible).
 */
const WASHI_FACE = 0xf3ede2;
function washiProfile(p: Design): THREE.Vector2[] {
  return washiSurface(p).map(([r, y]: [number, number]) => new THREE.Vector2(r, y));
}

function washiSkin(p: Design, bays: number[], hotBay: number | null, face = WASHI_FACE, opacity = 1): THREE.Group {
  const g = new THREE.Group();
  const prof = washiProfile(p);
  const d = (Math.PI * 2) / p.boards;
  for (const k of bays) {
    const hot = k === hotBay;
    const geo = new THREE.LatheGeometry(prof, 16, ribPhi(k, d), d);
    // A see-through shade is TWO passes: the FAR wall (back faces, opaque, depth) hides the far-side
    // bamboo, then the NEAR wall (front faces, translucent, no depth) draws last, over the fitting.
    const skin = (side: THREE.Side, o: number, order: number) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: hot ? HI_FACE : face, side,
        transparent: o < 1, opacity: o, depthWrite: o >= 1,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      }));
      m.renderOrder = order;
      return m;
    };
    if (opacity < 1) g.add(skin(THREE.BackSide, 1, -1), skin(THREE.FrontSide, opacity, 2));
    else g.add(skin(THREE.DoubleSide, 1, 0));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24),
      new THREE.LineBasicMaterial({ color: hot ? HI : INK })));
  }
  return g;
}

/**
 * Panels on every other bay, plus the yaw that makes it legible: the mold is turned so a bay CENTRE
 * sits on the camera axis, panel · gap · panel — any other phase lays a bay (360/N wide) across the
 * silhouette, and a mold has no preferred rotation, so the yaw costs nothing.
 */
export function washiYaw(p: Design, dir: THREE.Vector3): number {
  const d = (Math.PI * 2) / p.boards;
  // `dir` is the view direction in the GROUP'S frame: the mold is turned a quarter turn into the
  // stand, and its bays go with it.
  const camPhi = Math.PI / 2 - Math.atan2(dir.z, dir.x);
  return camPhi - ribPhi(0, d) - d / 2;
}

/** Every bay pasted — the shade left to dry, still one lathe per bay. Nothing is highlighted. */
function washiWhole(p: Design, face: number, opacity = 1): THREE.Group {
  const bays: number[] = [];
  for (let k = 0; k < p.boards; k++) bays.push(k);
  return washiSkin(p, bays, null, face, opacity);
}

export function washiPieces(p: Design): THREE.Group {
  const d = (Math.PI * 2) / p.boards;
  const bays: number[] = [];
  // Out from the centre bay, every other one, while the WHOLE bay stays within ~78° of the axis —
  // scoring by the centre is not enough, a bay centred at 67° reaching past 90°.
  for (let i = 1; i * d + d / 2 <= 1.36; i += 2) bays.push(-i, i);
  if (!bays.length) bays.push(-1, 1);      // a very coarse mold (few, wide ribs): show the pair anyway
  return washiSkin(p, bays, 1);            // one of the pair is the one going on now
}

/**
 * Which rib is drawn FACE-ON from `dir`. A rib is a flat plate extruded along its own z, so rib k's
 * faces look out at azimuth π/2 − k·2π/N; the nearest to the camera's is the only readable one.
 */
function faceOnRib(p: Design, dir: THREE.Vector3): number {
  const d = (Math.PI * 2) / p.boards;
  const k = Math.round((Math.PI / 2 - Math.atan2(dir.z, dir.x)) / d);
  return ((k % p.boards) + p.boards) % p.boards;
}

/**
 * Which paper is on the mold: a whole shade ("all"), a whole shade lit ("lit"), or the pasting step's
 * alternating panels — which is the VIEW DIRECTION, the mold being yawed to suit (`washiYaw`).
 */
type WashiKind = "all" | "lit" | THREE.Vector3 | null;

/** One rib on its way out: the direction it faces (which picks the rib) and how far it has come. */
type PullState = { dir: THREE.Vector3; slide: number } | null;

/** What of the mold to draw. `hot` names the piece the step being drawn ADDS; null highlights none. */
type MoldOpts = {
  ribs?: boolean; komaBot?: boolean; komaTop?: boolean; hot?: string | null; smooth?: boolean;
  rings?: boolean; band?: boolean; higo?: boolean; washi?: WashiKind; washiOpacity?: number; pull?: PullState;
};

export function moldPieces(p: Design, { ribs = true, komaBot = true, komaTop = true, hot = null, smooth = false, rings = false, band = false, higo = false, washi = null, washiOpacity = 1, pull = null }: MoldOpts = {}): THREE.Group {
  const g = new THREE.Group();
  if (band) g.add(bands(p, hot === "bands"));
  if (higo) g.add(higoWinding(p, hot === "higo", washiOpacity < 1));
  if (washi === "all" || washi === "lit") g.add(washiWhole(p, washi === "lit" ? LIT_FACE : WASHI_FACE, washiOpacity));
  else if (washi) g.add(washiPieces(p));
  if (rings) {
    const { lo: t0, hi: t1 } = fukuroRange(p);
    for (const top of [false, true]) {
      // Cardboard bends its hoops from wire (see `wireRing2D`); 3D prints them.
      const r = part(smooth ? wireRingGeometry(p, top) : ringGeometry(p, top), hot === "rings");
      r.rotation.x = -Math.PI / 2;
      r.position.y = (top ? t1 : t0) * p.height;    // the openings, which is where they seat
      g.add(r);
    }
  }
  // `pull` draws one rib on its way out (see `pullScene`); the rest stay hidden inside the shade.
  const pulled = pull ? faceOnRib(p, pull.dir) : -1;
  if (ribs) for (let k = 0; k < p.boards; k++) {
    // In `pull` the others are already out: the last is the only state where the mouth is not a
    // packed ring of rib edges seen end-on.
    if (pull && k !== pulled) continue;
    // "oneRib" colours a single rib: they are plugged in one at a time, and all eight highlighted
    // would say "everything is new".
    const geo = ribGeo(p, k, smooth);
    const m = part(geo, hot === "ribs" || (hot === "oneRib" && k === 0) || k === pulled);
    const a = (k / p.boards) * Math.PI * 2;
    m.rotation.y = a;
    if (k === pulled) {
      // Onto the axis before it slides: a rib is wider than the mouth it leaves by, so it is brought
      // to the middle first — what the hollowed inner edge is for. Centred by the geometry's own
      // bounding box, not `innerRi`/`maxRadius`, which a window or a smooth edge would skew.
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      const inward = (b.min.x + b.max.x) / 2;
      // `position` is in the parent's frame, so the radial move has to be turned with the rib.
      m.position.set(-inward * Math.cos(a), pull!.slide, inward * Math.sin(a));
    }
    g.add(m);
  }
  if (komaBot) {
    const kb = part(komaGeometry(p), hot === "komaBot");
    kb.rotation.x = -Math.PI / 2; kb.position.y = -p.tabLen;
    g.add(kb);
  }
  if (komaTop) {
    const kt = part(komaGeometry(p), hot === "komaTop");
    kt.rotation.x = Math.PI / 2; kt.position.y = p.height + p.tabLen;
    g.add(kt);
  }
  // The yaw turns the mold, not the panels, which sit on bays. Wrapped rather than set on `g`, so a
  // caller's own rotation still composes.
  if (washi && washi !== "all" && washi !== "lit") {
    const w = new THREE.Group();
    g.rotation.y = washiYaw(p, washi);
    w.add(g);
    return w;
  }
  return g;
}

/** The stand: base plate flat on the floor, two posts in its slots. */
export function standPieces(p: Design, hot: string | null): THREE.Group {
  const g = new THREE.Group();
  const board = part(boardGeometry(p), hot === "base");
  board.rotation.x = -Math.PI / 2;
  g.add(board);
  const sep = standSlotSep(p), collarTop = standCollarTop();
  for (const sgn of [-1, 1]) {
    const col = part(standGeometry(p), hot === "column");
    col.rotation.y = Math.PI / 2;
    col.position.set((sgn * sep) / 2, collarTop, 0);
    g.add(col);
  }
  return g;
}

/** The mold lying in the stand, exactly as the assembly view shows it (same maths, same result). */
export function moldOnStand(p: Design, hot: string | null, smooth: boolean, washi: WashiKind = null): THREE.Group {
  const g = new THREE.Group();
  g.add(standPieces(p, null));
  // Rings and bamboo included: by then the guide has fitted the one and wound the other.
  const mold = moldPieces(p, { hot: hot === "mold" ? "ribs" : null, smooth, rings: true, band: true, higo: true, washi });
  mold.rotation.z = Math.PI / 2;
  mold.position.set(p.height / 2, standCollarTop() + standSaddleH(p), 0);
  g.add(mold);
  return g;
}

/**
 * The mold coming out: the shade dry, both koma off, the LAST rib half drawn out of the opening.
 * Lying on its side, because a rib leaves along the axis and upright the action points at the camera.
 * One rib, not all — with the others still in the mouth reads as a turbine. The koma lie flat, and
 * the bands are gone with nothing to hold.
 */
// Yaw off square: at 0° the frame fills with the inside of the lantern, at 45° the shade flattens
// into a leaf. 15° keeps the mouth a readable ellipse.
const PULL_YAW = (15 * Math.PI) / 180;
export function pullScene(p: Design, smooth: boolean): THREE.Group {
  const root = new THREE.Group();
  const w = new THREE.Group();
  w.rotation.y = PULL_YAW;
  // Out of the WIDER opening: a rib is as wide as the body is deep and the mouths are rarely equal
  // (the default is ⌀148 bottom, ⌀38 top). The other way up it reads as the rib tearing through.
  const top = openingR(p, true) >= openingR(p, false);
  const dir = top ? -1 : 1;                // which way along the axis the rib leaves
  // The exit points along world +x, so the rib comes out rightwards whichever end it leaves by.
  const rz = (dir * Math.PI) / 2;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PULL_YAW, rz, "YXZ"));
  const mold = moldPieces(p, {
    komaBot: false, komaTop: false, smooth, rings: true, higo: true, washi: "all",
    pull: {
      dir: VIEW_DIR.clone().applyQuaternion(q.invert()),   // the camera, in the mold's own frame
      slide: -dir * (p.height + p.tabLen * 2) * 0.62,
    },
  });
  mold.rotation.z = rz;
  mold.position.x = (dir * p.height) / 2;  // ...and the body sits in the middle of the frame
  w.add(mold);
  root.add(w);
  // Both koma, off: flat on the same table and IN FRONT of the shade, where the isometric leaves the
  // frame empty. Beside the ends, the body's bulge pushes a koma clear of the silhouette so far out
  // that it takes the drawing down a size.
  const kR = komaR(p), R = maxRadius(p);
  for (const sgn of [-1, 1]) {
    const k = part(komaGeometry(p), false);
    k.rotation.x = -Math.PI / 2;
    k.position.set(sgn * (kR + 5), -R, R * 0.7 + kR + 8);
    root.add(k);                           // outside the yaw: they are on the table, not on the mold
  }
  return root;
}
