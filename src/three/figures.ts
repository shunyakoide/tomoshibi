/**
 * ============================================================================
 * FIGURES — the assembly guide's line drawings, rendered from the real parts
 * ============================================================================
 * Every figure is built from a design `p` and from `geometry.ts`, so a figure cannot show a mold the
 * STL does not make. (GuidePage passes the same FIXED design to every call; nothing here knows that.)
 *
 * [Look] White faces + `EdgesGeometry` outlines = a hidden-line drawing; the step's part is accented.
 * [Camera] Orthographic and isometric: in perspective a flat part reads as a wrong shape.
 * [Output] PNG data URLs, not live canvases — thirty-odd scenes against a ~16 WebGL context cap.
 * ============================================================================
 */
import type { Design } from "../types.ts";
import * as THREE from "three";
import {
  ribGeometry, komaGeometry, standGeometry, boardGeometry, ringGeometry,
  standCollarTop, standSaddleH, standSlotSep, fukuroRange, komaR, maxRadius,
  grooveList, grooveR, higoSpiralPath, outerR, openingR, ringLegs,
} from "../geometry.ts";
import {
  VIEW_DIR, DIR_ON_STAND, DIR_UPSIDE_DOWN, INK, HI, HI_FACE, CORD_INK, CORD_R, WIRE_R,
  part, solid, inkLines, bristleFringe, silhouetteLines, silhouetteCircle, coil, wireTube,
} from "./figures/ink.ts";
import {
  pasteTub, tapeAndThread, pasteBrush, smoothBrush, pliers, washiStack, razorBlade, sprayBottle,
} from "./figures/kit-tools.ts";
import { SOCKET_R, SOCKET_H, BULB_FOOT, ledBulb, pendantSocket, lamps } from "./figures/kit-lamps.ts";
import { hangBend, hangPlaced, hangSet } from "./figures/hang.ts";

// One renderer for every figure, created on first use and kept; its canvas is sized per figure.
let R: THREE.WebGLRenderer | null = null;
function renderer(): THREE.WebGLRenderer {
  if (R) return R;
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1);        // the canvas is already drawn at 2x and shown at half (see figureImage)
  return R;
}

// ---- The parts, placed the way the step leaves them ----

/**
 * The rib as the reader's route makes it: cardboard cuts a SMOOTH outer edge (no 0.5mm V in board)
 * and no lightening windows. `smooth` carries the route in; the rest is `p`, via `paperP`.
 */
const ribGeo = (p: Design, k: number, smooth: boolean) => ribGeometry(smooth ? { ...p, lighten: false } : p, k, { smooth });

/**
 * The rubber bands holding the assembly while you work: one just outside each koma, the only thing
 * here that is not a part — a plain torus sized off `komaR`. Accent while the step is ABOUT them.
 */
const BAND_OFF = 0xe3b39d;
function bands(p: Design, hot: boolean): THREE.Group {
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
  const r = p.higoD / 2;
  const mat = () => new THREE.MeshBasicMaterial({ color: hot ? HI : HIGO_OFF });
  if (p.spiral) {
    const path = higoSpiralPath(p);
    if (path.length > 1) {
      const curve = new THREE.CatmullRomCurve3(path.map(([a, y, rad]) =>
        new THREE.Vector3(rad * Math.cos(a), y, rad * Math.sin(a))));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, path.length * 2, r, 8, false), mat()));
    }
  } else {
    for (const y of grooveList(p, grooveR(p))) {
      const geo = near
        ? new THREE.TorusGeometry(outerR(p, y / p.height), r, 8, 64, Math.PI)
        : new THREE.TorusGeometry(outerR(p, y / p.height), r, 8, 96);
      // Aim the half-arc by turning the GEOMETRY in its own plane: a `rotation.y` composes with the
      // flattening quarter turn and tilts the ring instead. A torus's arc starts at its own 0, so its
      // midpoint sits a quarter turn on; -45° lands it on the camera's bearing after rotateX.
      if (near) geo.rotateZ(-Math.PI / 4);
      geo.rotateX(Math.PI / 2);
      const ring = new THREE.Mesh(geo, mat());
      ring.position.y = y;
      g.add(ring);
    }
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
  const { lo, hi } = fukuroRange(p);
  const H = p.height, N = 60, dt = (hi - lo) / N / 2 || 1e-4;
  const out: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const t = lo + (hi - lo) * (i / N);
    // Offset along the surface NORMAL, not x: horizontally a face at angle θ keeps only
    // `higoD·cos θ` of clearance, so past θ ≈ 60° (dR/dy = 2) the rod comes out through the paper.
    const t0 = Math.max(lo, t - dt), t1 = Math.min(hi, t + dt);
    const s = (outerR(p, t1) - outerR(p, t0)) / ((t1 - t0) * H);      // dR/dy
    const n = Math.hypot(1, s);
    out.push(new THREE.Vector2(outerR(p, t) + p.higoD / n, t * H - (p.higoD * s) / n));
  }
  return out;
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
function washiYaw(p: Design, dir: THREE.Vector3): number {
  const d = (Math.PI * 2) / p.boards;
  // `dir` is the view direction in the GROUP'S frame: the mold is turned a quarter turn into the
  // stand, and its bays go with it.
  const camPhi = Math.PI / 2 - Math.atan2(dir.z, dir.x);
  return camPhi - ribPhi(0, d) - d / 2;
}
/**
 * Every bay pasted — the shade left to dry. Still one lathe per bay: a full lathe has no crease, so
 * `EdgesGeometry` finds only its rims and the body draws as an ivory blob. Nothing is highlighted.
 */
function washiWhole(p: Design, face: number, opacity = 1): THREE.Group {
  const bays: number[] = [];
  for (let k = 0; k < p.boards; k++) bays.push(k);
  return washiSkin(p, bays, null, face, opacity);
}
function washiPieces(p: Design): THREE.Group {
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

function moldPieces(p: Design, { ribs = true, komaBot = true, komaTop = true, hot = null, smooth = false, rings = false, band = false, higo = false, washi = null, washiOpacity = 1, pull = null }: MoldOpts = {}): THREE.Group {
  const g = new THREE.Group();
  if (band) g.add(bands(p, hot === "bands"));
  if (higo) g.add(higoWinding(p, hot === "higo", washiOpacity < 1));
  if (washi === "all" || washi === "lit") g.add(washiWhole(p, washi === "lit" ? LIT_FACE : WASHI_FACE, washiOpacity));
  else if (washi) g.add(washiPieces(p));
  if (rings) {
    const { lo: t0, hi: t1 } = fukuroRange(p);
    for (const top of [false, true]) {
      const r = part(ringGeometry(p, top), hot === "rings");
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
function standPieces(p: Design, hot: string | null): THREE.Group {
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
function moldOnStand(p: Design, hot: string | null, smooth: boolean, washi: WashiKind = null): THREE.Group {
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
function pullScene(p: Design, smooth: boolean): THREE.Group {
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
    komaBot: false, komaTop: false, smooth, rings: !smooth, higo: true, washi: "all",
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

/**
 * The finished lantern, lit — no mold in it, one figure per way of lighting it, the lamp being the
 * one part of this build the app does not make. Warm, not white; and no rays, which would decorate.
 */
const LIT_FACE = 0xf9d9a3;       // the lit view's warm emissive, as a flat fill
const LAMP_INK = 0x8f949c;       // the lamp's own body: a grey, light enough not to out-weigh the ink

/** The lantern itself, at its own coordinates: shade, the bamboo in it, and the rings in its mouths. */
function litShade(p: Design, smooth: boolean, opacity = 1): THREE.Group {
  return moldPieces(p, {
    ribs: false, komaBot: false, komaTop: false, smooth, rings: !smooth, higo: true, washi: "lit",
    washiOpacity: opacity,
  });
}

/**
 * (2) Hung from a pendant cord, on the AXIS and in by the TOP opening whichever mouth is wider — a
 * hanging shade has an up, and it is the design's own. It dips `CORD_DIP` below the rim to meet the
 * opening and runs `CORD_UP` of the body height above, cut off at the top: "this continues".
 */
const CORD_DIP = 6;              // mm below the opening rim, so the cord meets the ring
const CORD_UP = 0.42;            // x body height above the shade
function lightHang(p: Design, smooth: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(litShade(p, smooth));
  const yTop = fukuroRange(p).hi * p.height;       // the top opening = where the cord goes in
  const len = p.height * CORD_UP + CORD_DIP;
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(CORD_R, CORD_R, len, 12),
    new THREE.MeshBasicMaterial({ color: CORD_INK }),
  );
  cord.position.y = yTop - CORD_DIP + len / 2;
  g.add(cord);
  // The hanger. What carries the shade is not the lamp: the lamp hangs on the cord INSIDE, the shade
  // on one wire across the opening with the cord in the U in its middle (foot of this file).
  const hanger = hangPlaced(p, false);      // the ring is already in `litShade`, where the route decides it
  hanger.position.y = yTop;
  g.add(hanger);
  return g;
}

/**
 * (1) No legs: a lamp stood on the floor and the shade dropped over it, drawn EXPLODED — set down it
 * looks like the other two with their fittings cropped off. The floor disc says "on the floor". The
 * lamp is generic and sized off the BOTTOM opening (`LAMP_FIT`).
 */
const LAMP_FIT = 0.62;           // x the bottom opening radius: it has to pass through the mouth
const LAMP_MAX = 38;             // mm — beyond this it is a floor lamp, not something you cover
const LAMP_LIFT = 0.48;          // x body height: the exploded gap above the lamp
function lightSet(p: Design, smooth: boolean): THREE.Group {
  const g = new THREE.Group();
  const y0 = fukuroRange(p).lo * p.height;         // where the shade would come to rest = the floor
  const rL = Math.min(openingR(p, false) * LAMP_FIT, LAMP_MAX);
  const hL = rL * 0.7;
  const mat = new THREE.MeshBasicMaterial({ color: LAMP_INK });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(rL, rL, hL, 24), mat);
  base.position.y = y0 + hL / 2;
  g.add(base);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(rL * 0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: LIT_FACE }),
  );
  dome.position.y = y0 + hL;
  g.add(dome);
  const fR = maxRadius(p) * 1.05;
  const floor = part(new THREE.CylinderGeometry(fR, fR, 1, 64), false);   // outlined: an unlined
  floor.position.y = y0 - 0.5;                                            // white disc is invisible
  g.add(floor);
  const shade = litShade(p, smooth);
  shade.position.y = hL + p.height * LAMP_LIFT;    // exploded: lifted clear, straight up the axis
  g.add(shade);
  return g;
}
/**
 * (3) Stood on legs, the lamp fixed up into the bottom opening. The legs are the lit view's
 * (`scenes.ts` buildLit: 0.42·height drop, 0.35·drop splay), rooted in the bottom ring's SOCKETS:
 * `ringLegs` gives the pad centres and returns null with the sockets off or the opening too small,
 * and the guide then drops the option. Not route-dependent.
 */
const LEG_DROP = 0.42;           // x body height, and the splay is 0.35 of that: the lit view's own
const LIT_THRU = 0.45;           // how much of the shade you see through, in this one figure

/**
 * (3) Stood on legs: the socket fixed UP into the bottom mouth and the cord leaving DOWNWARDS between
 * them — what makes this (3) and not (2) inverted. Rods and socket are yours to supply.
 *
 * The shade is translucent here and nowhere else, this being the one figure explaining a fitting
 * entirely INSIDE the lantern (socket, legs, frame); opaque it showed a shade with legs under it, so
 * the skin drops to `LIT_THRU`. The parts inside are WHITE as in the close-ups, the legs
 * lantern-scale grey, and nothing is a new object — `lampHolder`, `ledBulb` and the same
 * `frameSide`, sized to this lantern.
 */
function lightLegs(p: Design, smooth: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(litShade(p, smooth, LIT_THRU));
  // Legs on BOTH routes: `ringLegs` asks about the opening, not about a printed part. Cardboard
  // prints no ring for the pads, and the step's own text says the hoop is yours to make.
  const legs = ringLegs(p);
  const y0 = fukuroRange(p).lo * p.height;         // the bottom opening = where the ring seats
  const yTop = fukuroRange(p).hi * p.height;       // and the top one, where the frame's peak shows
  // The lamp, on the axis with its shell in the bottom mouth: the stem (and its stack of eyes) hangs
  // below the opening, the bulb stands inside. The three panels beside this build that fitting.
  const holder = lampHolder(false);
  holder.position.y = y0;
  g.add(holder);
  const bulb = ledBulb();
  bulb.position.y = y0 + SOCKET_H + BULB_FOOT - 8;
  g.add(bulb);
  // The frame, sized to THIS lantern: eye on the stem with the legs', peak half out of the top
  // opening, wide enough to clear the bulb — a relation, not a number.
  const yEye = y0 + LOOP_Y - 3 * STACK_GAP;
  const frame = frameWire(Math.max(SOCKET_R + 18, maxRadius(p) * 0.55), yTop + 6 - yEye);
  frame.rotation.y = FRAME_YAW;
  frame.position.y = yEye;
  g.add(frame);
  // The cord leaves the socket, drops, and TURNS OUT of the frame: straight down between three legs
  // it reads as a fourth. Along screen-right (world +x−z), so the bend is square to the reader.
  const drop = p.height * LEG_DROP, splay = drop * 0.35;
  const cordMat = new THREE.MeshBasicMaterial({ color: CORD_INK });
  const yB = y0 - STEM_H, dropLen = drop * 0.62;
  const down = new THREE.Mesh(new THREE.CylinderGeometry(CORD_R, CORD_R, dropLen, 12), cordMat);
  down.position.y = yB - dropLen / 2;
  g.add(down);
  const runLen = maxRadius(p) * 1.3;
  const run = new THREE.Mesh(new THREE.CylinderGeometry(CORD_R, CORD_R, runLen, 12), cordMat);
  run.rotation.z = -Math.PI / 2;
  run.rotation.y = Math.PI / 4;                  // (1, 0, -1)/√2 = straight right on screen
  run.position.set((runLen / 2) * Math.SQRT1_2, yB - dropLen, -(runLen / 2) * Math.SQRT1_2);
  g.add(run);
  if (!legs) return g;
  // Each leg starts where it is fixed — the eye on the stem — not at the ring: with the shade
  // see-through, a leg beginning in mid-air at the rim contradicted the panels beside it.
  for (let i = 0; i < legs.n; i++) {
    const a = (i / legs.n) * Math.PI * 2;
    const pts = [
      new THREE.Vector3(LOOP_R * Math.cos(a), yEye, LOOP_R * Math.sin(a)),
      new THREE.Vector3(legs.Rc * 0.55 * Math.cos(a), yEye + (y0 - yEye) * 0.7, legs.Rc * 0.55 * Math.sin(a)),
      new THREE.Vector3(legs.Rc * Math.cos(a), y0, legs.Rc * Math.sin(a)),
      new THREE.Vector3((legs.Rc + splay * 0.45) * Math.cos(a), y0 - drop * 0.45, (legs.Rc + splay * 0.45) * Math.sin(a)),
      new THREE.Vector3((legs.Rc + splay) * Math.cos(a), y0 - drop, (legs.Rc + splay) * Math.sin(a)),
    ];
    // The same accent rod and outline as the close-ups beside this figure and as way (2)'s hanger:
    // the wire in here is the wire being explained.
    g.add(wireTube(pts, { rod: legs.bore }));
  }
  return g;
}

/**
 * ============================================================================
 * FIXING THE LAMP — the sub-figures under way (3), "legs, fixed from below"
 * ============================================================================
 * How the lamp is held on needs no part this app prints: a pendant holder's cord leaves through a
 * THREADED STEM with a fixing nut, so a loop bent in each wire's end stacks on that stem and one nut
 * clamps the lot. These ignore `p` as the kit's figures do.
 *
 * [Orientation] Mouth UP so the bulb points into the shade, cord and stem DOWN — the difference from
 *   (2), and why the nut is reachable.
 * [Colour] The wire is ACCENT here and grey in the option's own figure — `bands`' rule.
 *
 * No arrow on the nut: it is drawn OFF the thread in (2) and run up tight in (3), the
 * exploded-then-assembled pair `lightSet` uses.
 */
const STEM_R = 5.5, STEM_H = 28;      // the threaded stem the cord leaves by, and the nut runs on
const NUT_R = 9.5, NUT_H = 6;         // across the corners: a hex draws its own edges, unlike a tube
const LOOP_R = 8.6;                   // the loop bent in the leg wire end (WIRE_R: ink.ts)
// Where the stack of loops starts — far down the stem for the drawing's sake, not the fitting's: the
// shell is ⌀34 and the loops ⌀20, so higher up they hide under it (the view looks down) and the arms
// come out of thin air. A real one takes them anywhere.
const LOOP_Y = -14;
// One leg's shape — arm out, drop, and how far the foot lands outside the arm. The wire figure and
// the assembled one draw the same leg; only the close-up cuts it short.
const LEG = [50, 76, 26] as const;

/** The holder, mouth up, with its stem and thread. `crop` cuts the shell short for the close-up. */
function lampHolder(crop: boolean) {
  const g = new THREE.Group();
  const h = crop ? SOCKET_H * 0.55 : SOCKET_H;
  const shell = solid(new THREE.CylinderGeometry(SOCKET_R, SOCKET_R, h, 32));
  shell.position.y = h / 2;
  g.add(shell, silhouetteLines(SOCKET_R, SOCKET_R, h, 0));
  const stem = solid(new THREE.CylinderGeometry(STEM_R, STEM_R, STEM_H, 24));
  stem.position.y = -STEM_H / 2;
  g.add(stem, silhouetteLines(STEM_R, STEM_R, 0, -STEM_H));
  // The thread, as raised rings — `ledBulb`'s cap, for the same reason: a smooth white cylinder says
  // nothing, and this one has to read as something a nut runs on.
  for (let y = -STEM_H + 1.6; y < -2; y += 2.6) {
    const band = solid(new THREE.CylinderGeometry(STEM_R + 0.5, STEM_R + 0.5, 1.2, 24));
    band.position.y = y;
    g.add(band, silhouetteLines(STEM_R + 0.5, STEM_R + 0.5, y + 0.6, y - 0.6));
  }
  return g;
}

/** The fixing nut: a hex prism with the stem's bore through it — without the bore it is a plug. */
function hexNut() {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = NUT_R * Math.cos(a), y = NUT_R * Math.sin(a);
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  s.holes.push(new THREE.Path().absarc(0, 0, STEM_R + 0.6, 0, Math.PI * 2, true));
  const geo = new THREE.ExtrudeGeometry(s, { depth: NUT_H, bevelEnabled: false, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);            // extruded along +z; stand it on its axis
  geo.translate(0, -NUT_H / 2, 0);
  return solid(geo);
}

/**
 * One leg, bent to shape. Swept as ONE tube through a point list, so the corners are bends rather
 * than the notch two cylinders leave. The loop lies flat and centred on the origin, to be placed by
 * dropping it onto the stem's axis; it runs just under a full turn and leaves TANGENTIALLY (ending at
 * a = pi/2 sends the arm off along +x), which keeps it from closing on itself.
 */
function legWire(arm: number, drop: number, splay: number) {
  const pts = [];
  const TURN = Math.PI * 1.9, N = 44;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI / 2 + TURN * (1 - i / N);
    pts.push(new THREE.Vector3(LOOP_R * Math.cos(a), 0, LOOP_R * Math.sin(a)));
  }
  pts.push(
    new THREE.Vector3(arm * 0.5, 0, LOOP_R),
    new THREE.Vector3(arm * 0.92, 0, LOOP_R),                       // out over the opening; the two
    new THREE.Vector3(arm + splay * 0.1, -drop * 0.08, LOOP_R),     // points closing in on the
    new THREE.Vector3(arm + splay * 0.45, -drop * 0.45, LOOP_R),    // corner are what keep the bend
    new THREE.Vector3(arm + splay, -drop, LOOP_R),                  // a bend and not a long curve
  );
  const curve = new THREE.CatmullRomCurve3(pts);
  // 8 radial segments, so the wire is faceted enough to draw its own outline: smooth, three loops on
  // one stem merge into one orange blob. The 45° facets clear the 24° threshold, as `coil()` does.
  const geo = new THREE.TubeGeometry(curve, pts.length * 3, WIRE_R, 8, false);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: HI, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), new THREE.LineBasicMaterial({ color: INK })));
  return g;
}

// A third of a turn between legs, and NO phase on the triad. With three legs and one isometric camera
// one always points nearly along the view axis: AWAY it projects up the page and all three stay
// countable, AT the reader it collapses to a stub behind the socket — which turning the triad cost.
// So legs on 0/120/240, gaps on 60/180/300; see the cord for what uses them.
const LEG_PHASE = 0;

// FOUR eyes, not three: the frame's goes on with the legs', under the same nut. Placed last and
// lowest, its arms being the only ones that rise and would climb through the legs' loops.
const STACK_GAP = 3.4;                  // between eyes: a wire thickness and a little daylight
const stackEnd = (n: number) => LOOP_Y - (n - 1) * STACK_GAP - WIRE_R;   // where a tightened nut comes to

/** The three loops stacked on the stem, each turned a third of a turn on from the last. */
function legLoops(g: THREE.Group, arm: number, drop: number, splay: number) {
  for (let i = 0; i < 3; i++) {
    const w = legWire(arm, drop, splay);
    w.rotation.y = LEG_PHASE + (i / 3) * Math.PI * 2;
    w.position.y = LOOP_Y - i * STACK_GAP;
    g.add(w);
  }
  return stackEnd(3);
}

/** The frame's eye, added to the bottom of that stack, with its arms cropped at `top`. */
function frameOnStem(g: THREE.Group, top: number) {
  const f = frameFoot(top);
  f.position.y = LOOP_Y - 3 * STACK_GAP;
  g.add(f);
  return stackEnd(4);
}

/**
 * The cord: out of the stem, down, then TURNED out of frame, since straight down between three legs
 * it reads as a fourth. `az` must be one of the GAPS between the legs (60, 180 or 300 as `LEG_PHASE`
 * leaves them); 300 projects to the right, where the frame has the room.
 */
function lampCord(g: THREE.Group, y0: number, down: number, run: number, az = -Math.PI / 3) {
  const mat = new THREE.MeshBasicMaterial({ color: CORD_INK });
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(CORD_R, CORD_R, down, 12), mat);
  drop.position.y = y0 - down / 2;
  g.add(drop);
  if (!run) return;
  const out = new THREE.Mesh(new THREE.CylinderGeometry(CORD_R, CORD_R, run, 12), mat);
  out.rotation.z = -Math.PI / 2;                       // stand it along +x, then swing it round
  out.rotation.y = -az;
  out.position.set((run / 2) * Math.cos(az), y0 - down, (run / 2) * Math.sin(az));
  g.add(out);
}

/** (3a) The wire on its own, bent to shape. One of the three: they are all the same shape. */
function legBend() {
  const g = new THREE.Group();
  g.add(legWire(...LEG));
  return g;
}

/**
 * The FRAME (枠): the wire that holds the shade out to its full height — a tall closed hoop in a
 * vertical plane, with the SAME eye at its foot the legs have, so it stacks on the same stem under
 * the same nut. That nut is its ONLY fixing: holding the top out against a foot that cannot move puts
 * the shade in tension. The belly is the shape, not decoration — the foot sits under the socket and
 * the bulb, so the eye is left upward AND outward to clear the lamp.
 *
 * The eye lies FLAT (xz) while the hoop stands in xy, a quarter turn of twist between them. The curve
 * is CLOSED: butted end to end it kinked at the shoulder.
 */
const FRAME_W = 44, FRAME_H = 150;     // half-width at the belly, and overall height
// One side, foot to shoulder: up and OUT off the eye, clear of the lamp, then in again at the top.
const frameSide = (sx: number, y0: number, W: number, H: number) => [
    new THREE.Vector3(sx * LOOP_R * 1.5, y0 + 3, 0),
    new THREE.Vector3(sx * W * 0.55, H * 0.045, 0),
    // Out to full width LOW, standing up by a fifth of the height: the flare clears the socket and
    // the bulb, and a gentler one read as two more legs in the stem figures.
    new THREE.Vector3(sx * W * 0.92, H * 0.11, 0),
    new THREE.Vector3(sx * W, H * 0.20, 0),
    new THREE.Vector3(sx * W, H * 0.34, 0),
    new THREE.Vector3(sx * W, H * 0.48, 0),
    new THREE.Vector3(sx * W * 0.88, H * 0.64, 0),
    new THREE.Vector3(sx * W * 0.55, H * 0.83, 0),
    new THREE.Vector3(sx * W * 0.24, H * 0.94, 0),
];
// The eye at the foot: one flat turn about the stem's axis, entered from -x and left towards +x,
// stepping down through the turn so the wire does not lie on itself. `y0` is where it starts.
function frameEye(y0: number) {
  const pts = [];
  const N = 30;
  for (let i = 1; i < N; i++) {
    const a = Math.PI - (i / N) * Math.PI * 2;
    pts.push(new THREE.Vector3(LOOP_R * Math.cos(a), y0 - (i / N) * 2 * y0, LOOP_R * Math.sin(a)));
  }
  return pts;
}
function frameWire(W = FRAME_W, H = FRAME_H) {
  const side = (sx: number, y0: number) => frameSide(sx, y0, W, H);
  const pts = [...side(-1, 0.9).reverse()];
  pts.push(...frameEye(0.9));
  pts.push(...side(1, -0.9));
  // The peak: a small loop entered low on one side and left low on the other. It is what the top ring
  // bears on, and the only part of the frame visible once the shade is on — not decoration.
  const R = 7, C = H - R, M = 26;
  for (let i = 0; i <= M; i++) {
    const a = (-60 + (300 * i) / M) * (Math.PI / 180);
    pts.push(new THREE.Vector3(R * Math.cos(a), C + R * Math.sin(a), 0.9 - (1.8 * i) / M));
  }
  return wireTube(pts, { closed: true });
}

// A flat hoop is ALL outline, so it must face the camera: on the world axes the near side
// foreshortens into the far and reads as a bent hoop. A 45° yaw squares its plane to the view's
// bearing (`hangBend` turns the mirror-image way, to lay its arms ACROSS the view).
const FRAME_YAW = Math.PI / 4;

/** (3b') The frame on its own, bent to shape. */
function frameBend() {
  const g = new THREE.Group();
  const w = frameWire();
  w.rotation.y = FRAME_YAW;
  g.add(w);
  return g;
}

/**
 * The frame's FOOT: its eye and the first `top` mm of both arms, cut off, because a 150mm hoop
 * shrinks the socket to a detail in the two stem figures. SAME wire, same `frameSide`: crop the
 * drawing, never redraw the object.
 */
function frameFoot(top: number) {
  const side = (sx: number, y0: number) => frameSide(sx, y0, FRAME_W, FRAME_H).filter((v) => v.y <= top);
  const pts = [...side(-1, 0.9).reverse(), ...frameEye(0.9), ...side(1, -0.9)];
  const g = new THREE.Group();
  const w = wireTube(pts);
  w.rotation.y = FRAME_YAW;
  g.add(w);
  return g;
}

/** (3b) The loops on the stem, nut off — a close-up, so the shell is cropped and the legs are cut. */
function legStack() {
  const g = new THREE.Group();
  g.add(lampHolder(true));
  legLoops(g, 24, 15, 7);               // the legs cut short: this frame is about the stem
  frameOnStem(g, 26);                   // and the frame cut shorter still, for the same reason
  const nut = hexNut();
  nut.position.y = -STEM_H - 9;         // clear of the thread, waiting on the cord: the nut is OFF
  g.add(nut);
  lampCord(g, 0, STEM_H + 24, 0);       // straight down, and cut off: nothing else is in this frame
  return g;
}

/** (3c) Tightened, with a bulb in it: the lamp and its three legs, now one piece that stands up. */
function legStood() {
  const g = new THREE.Group();
  g.add(lampHolder(false));
  const bulb = ledBulb();
  bulb.position.y = SOCKET_H + BULB_FOOT - 8;          // 8mm of cap screwed into the mouth
  g.add(bulb);
  legLoops(g, ...LEG);
  const yEnd = frameOnStem(g, 64);                     // cropped: a 150mm hoop here shrinks the nut
  const nut = hexNut();                                // this step is about to a detail
  nut.position.y = yEnd - NUT_H / 2;                   // run up tight under the stack
  g.add(nut);
  lampCord(g, -STEM_H, 24, 28);
  return g;
}

/** One figure: every scene is drawn from the guide's fixed design, and `sm` carries the route
 *  (cardboard cuts a smooth edge and no windows — see `ribGeo`). */
type Scene = (p: Design, sm: boolean) => THREE.Group;

const SCENES: Record<string, Scene> = {
  // Parts, one at a time, for the parts list.
  rib: (p, sm) => part(ribGeo(p, 0, sm), false),
  koma: (p) => part(komaGeometry(p), false),
  column: (p) => part(standGeometry(p), false),
  base: (p) => part(boardGeometry(p), false),
  ringBottom: (p) => part(ringGeometry(p, false), false),
  ringTop: (p) => part(ringGeometry(p, true), false),
  // Steps.
  stand: (p) => standPieces(p, "column"),
  ribsIn: (p, sm) => moldPieces(p, { komaTop: false, hot: "oneRib", smooth: sm }),
  komaOn: (p, sm) => moldPieces(p, { hot: "komaTop", smooth: sm }),
  // Nothing is highlighted: the mold was assembled four steps ago and the stand one step ago, so
  // colouring either would say "this is new" about a part that is not.
  onStand: (p, sm) => moldOnStand(p, null, sm),
  // The rings go on the ASSEMBLED MOLD, right after the second koma: the washi's cover allowance is
  // folded over them, and they stay in the lantern when the mold comes out — hence the mold here, not
  // the finished shade. The bands ride along from here, muted.
  rings: (p, sm) => moldPieces(p, { smooth: sm, rings: true, hot: "rings", band: true }),
  // Winding: the mold as the last three steps left it, bamboo on, standing upright; the stand comes
  // out one step later, for the pasting. `smooth` is the cardboard route, whose guide has no ring
  // step and no band advice (its koma holds by friction), so the figure must show neither.
  higo: (p, sm) => moldPieces(p, { smooth: sm, rings: !sm, band: !sm, higo: true, hot: "higo" }),
  // Pasting: the mold where the reader left it — IN THE STAND, which is what the stand is for. The
  // cardboard route has no stand, so there it stands on its koma; that is also why the panels are
  // placed per orientation rather than once (see `washiPieces`).
  washi: (p, sm) => (sm
    ? moldPieces(p, { smooth: true, higo: true, washi: VIEW_DIR })
    : moldOnStand(p, null, false, DIR_ON_STAND)),
  // Drying: every bay pasted, and OFF the stand, nothing turning while it dries. What is left of the
  // mold to see is what sticks out past the paper (necks, tabs, both koma).
  dry: (p, sm) => moldPieces(p, { smooth: sm, rings: !sm, band: !sm, higo: true, washi: "all" }),
  // Pulling it out — see `pullScene`.
  pull: (p, sm) => pullScene(p, sm),
  // Lit — one per way of supplying the lamp; see `litShade` and the scenes under it.
  lightSet: (p, sm) => lightSet(p, sm),
  lightHang: (p, sm) => lightHang(p, sm),
  lightLegs: (p, sm) => lightLegs(p, sm),
  // What you supply yourself — see "THE KIT" above. These ignore `p` entirely.
  kitHigo: () => coil(2.5, 52, 8, 3.2, 16),
  kitPaste: () => pasteTub(),
  kitStick: () => tapeAndThread(),
  kitWire: () => coil(1.4, 34, 4, 4.5, 26),
  kitPasteBrush: () => pasteBrush(),
  kitBrush: () => smoothBrush(),
  kitPliers: () => pliers(),
  kitWashi: () => washiStack(),
  kitRazor: () => razorBlade(),
  kitLight: () => lamps(),
  kitSpray: () => sprayBottle(),
  // Fixing the lamp — the sub-steps under way (3). Like the kit's these ignore `p`, except `hangSet`,
  // sized from the top opening and drawing the ring.
  legBend: () => legBend(),
  frameBend: () => frameBend(),
  legStack: () => legStack(),
  legStood: () => legStood(),
  hangBend: () => hangBend(),
  hangSet: (p) => hangSet(p),
};

export const FIGURES = Object.keys(SCENES);

/**
 * Render one figure to a PNG data URL, or null if it cannot be drawn (no WebGL, unknown id). Drawn
 * at 2x and shown at 1x, so the thin edge lines survive a high-density screen and printing.
 */
export function figureImage(p: Design, id: string, { width = 620, height = 460, smooth = false } = {}): string | null {
  const make = SCENES[id];
  if (!make) return null;
  let group = null;
  try {
    const gl = renderer();
    gl.setSize(width * 2, height * 2, false);
    const scene = new THREE.Scene();
    group = make(p, smooth);
    scene.add(group);

    // Isometric: the standard 3/4 from above-right, which shows a flat part's face and its thickness
    // at once. The camera sits on that axis, far enough out that nothing clips.
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    const reach = box.getSize(new THREE.Vector3()).length();
    const aspect = width / height;
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, reach * 6);
    cam.position.copy(c).addScaledVector(VIEW_DIR, reach * 2);
    cam.lookAt(c);
    cam.updateMatrixWorld();
    // Fit the frustum to what is actually DRAWN, as projected: every vertex of every mesh and line in
    // the group, through the view matrix. Not the largest dimension (a rib is long and thin, and its
    // length leaves the drawing a fifth of the well), and not the bounding box's corners, which bound
    // the projection only for a solid that fills its box — open pliers came out at 44% of the frame
    // where a shoe brush filled 77%. Centred on the drawing.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const v = new THREE.Vector3(), mv = new THREE.Matrix4();
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      const pos = (o as THREE.Mesh).geometry?.attributes?.position as THREE.BufferAttribute | undefined;
      if (!pos) return;
      mv.multiplyMatrices(cam.matrixWorldInverse, o.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mv);
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
    });
    if (!(maxX > minX)) { minX = -1; maxX = 1; minY = -1; maxY = 1; }   // nothing drawn: don't divide by 0
    const half = Math.max((maxY - minY) / 2, (maxX - minX) / 2 / aspect, 1) * 1.06;  // 6%: the lines' own width
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    cam.top = midY + half; cam.bottom = midY - half;
    cam.right = midX + half * aspect; cam.left = midX - half * aspect;
    cam.updateProjectionMatrix();

    gl.setClearAlpha(0);
    gl.render(scene, cam);
    return gl.domElement.toDataURL("image/png");
  } catch {
    return null;        // a figure is an illustration: losing one must not take the page down
  } finally {
    // The geometries are built per call (they follow the design), so they have to go back per call.
    if (group) group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      // A LineSegments and a Mesh both land here, and neither is ever given an array of materials.
      (m.material as THREE.Material | undefined)?.dispose();
    });
  }
}

/** Free the renderer and its context — the guide page calls this when it unmounts. */
export function disposeFigures() {
  R?.dispose();
  R = null;
}
