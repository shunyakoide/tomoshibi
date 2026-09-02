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
import { lightHang, lightLegs, lightSet } from "./figures/lit.ts";
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
