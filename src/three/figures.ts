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
  VIEW_DIR, DIR_ON_STAND, DIR_UPSIDE_DOWN, INK, HI, HI_FACE, LIT_FACE, CORD_INK, CORD_R, WIRE_R,
  part, solid, inkLines, bristleFringe, silhouetteLines, silhouetteCircle, coil, wireTube,
} from "./figures/ink.ts";
import {
  pasteTub, tapeAndThread, pasteBrush, smoothBrush, pliers, washiStack, razorBlade, sprayBottle,
} from "./figures/kit-tools.ts";
import { SOCKET_R, SOCKET_H, BULB_FOOT, ledBulb, pendantSocket, lamps } from "./figures/kit-lamps.ts";
import {
  moldOnStand, moldPieces, pullScene, ribGeo, standPieces,
} from "./figures/mold.ts";
import { hangBend, hangPlaced, hangSet } from "./figures/hang.ts";
import {
  FRAME_YAW, LOOP_R, LOOP_Y, STACK_GAP, STEM_H, frameBend, frameWire, lampHolder, legBend,
  legStack, legStood,
} from "./figures/fitting.ts";

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
 * The finished lantern, lit — no mold in it, one figure per way of lighting it, the lamp being the
 * one part of this build the app does not make. Warm, not white; and no rays, which would decorate.
 */
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
