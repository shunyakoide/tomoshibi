/**
 * ============================================================================
 * FIGURES — the assembly guide's line drawings, rendered from the real parts
 * ============================================================================
 * Every figure on the guide page is a picture of **this** design: 8 ribs are drawn as 8 ribs, and a
 * 400mm body is drawn tall. The shapes come from `geometry.js` like everything else here, so a
 * figure cannot show a mold the STL does not make — the failure a hand-drawn illustration guarantees
 * the day someone changes a part.
 *
 * [Look] White faces plus their own outlines: `EdgesGeometry` over an opaque `MeshBasicMaterial`,
 *   which is a hidden-line drawing for free — the depth buffer hides the lines the faces cover. The
 *   part a step adds is drawn in the accent colour so the eye lands on it, the convention every
 *   assembly sheet uses.
 * [Camera] Orthographic and isometric. A perspective figure of a flat part reads as a wrong shape,
 *   and orthographic keeps the same part the same size wherever it sits in the frame.
 * [Output] A PNG data URL, not a live canvas. A page of eight figures would be eight WebGL contexts
 *   (browsers cap them at ~16 and drop the oldest), and an <img> costs nothing to scroll, survives a
 *   re-render, and is what the browser's own "Save as PDF" prints. One renderer draws them all in
 *   turn and hands back the pixels.
 * ============================================================================
 */
import * as THREE from "three";
import {
  ribGeometry, komaGeometry, standGeometry, boardGeometry, ringGeometry,
  standCollarTop, standSaddleH, standSlotSep, fukuroRange,
} from "../geometry.js";

// The isometric direction every figure is drawn from. Shared, because the shade's silhouette has to
// be computed against the same axis the camera looks down (see `rings`).
const VIEW_DIR = new THREE.Vector3(1, 0.85, 1).normalize();

const INK = 0x33302b;        // edge lines: the UI's ink, not pure black
const PAPER = 0xffffff;      // faces: opaque white, so edges behind them are hidden
const HI = 0xd4622a;         // the part this step adds (the app's accent)
const HI_FACE = 0xfae3d6;

// One renderer for every figure on the page, created on first use and kept. Its canvas is sized per
// figure; nothing else in the app draws through it.
let R = null;
function renderer() {
  if (R) return R;
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1);        // the canvas is already drawn at 2x and shown at half (see figureImage)
  return R;
}

/** A part: white faces + its outline. `hot` draws it as the piece being added. */
function part(geo, hot) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: hot ? HI_FACE : PAPER, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  })));
  // 24°: enough to keep the facets of a curved edge from each drawing a line, low enough to keep a
  // groove's flanks. A lower threshold turns the rib's outer edge into a hatched band.
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), new THREE.LineBasicMaterial({ color: hot ? HI : INK })));
  return g;
}

// ---- The parts, placed the way the step leaves them ----

/**
 * The rib as the reader's route actually makes it. Cardboard cuts a SMOOTH outer edge (you cannot
 * carve a 0.5mm V-notch into board, so the template marks the bamboo positions with ticks instead)
 * and no lightening windows, so drawing the printed rib on that route would show grooves and holes
 * nobody has cut. `smooth` carries the route in; everything else follows from `p`, which the guide
 * has already put through paperP.
 */
const ribGeo = (p, k, smooth) => ribGeometry(smooth ? { ...p, lighten: false } : p, k, { smooth });

/** Ribs radiating from the axis, koma at whichever ends the step has reached (and, once the guide
 *  has fitted them, the two opening rings — the mold carries those for the rest of the build). */
function moldPieces(p, { ribs = true, komaBot = true, komaTop = true, hot = null, smooth = false, rings = false } = {}) {
  const g = new THREE.Group();
  if (rings) {
    const { lo: t0, hi: t1 } = fukuroRange(p);
    for (const top of [false, true]) {
      const r = part(ringGeometry(p, top), hot === "rings");
      r.rotation.x = -Math.PI / 2;
      r.position.y = (top ? t1 : t0) * p.height;    // the openings, which is where they seat
      g.add(r);
    }
  }
  if (ribs) for (let k = 0; k < p.boards; k++) {
    // "oneRib" colours a single rib: the step plugs them in one at a time, and a figure with all
    // eight highlighted says "everything is new" — which is the one thing a highlight cannot mean.
    const m = part(ribGeo(p, k, smooth), hot === "ribs" || (hot === "oneRib" && k === 0));
    m.rotation.y = (k / p.boards) * Math.PI * 2;
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
  return g;
}

/** The stand: base plate flat on the floor, two posts in its slots. */
function standPieces(p, hot) {
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
function moldOnStand(p, hot, smooth) {
  const g = new THREE.Group();
  g.add(standPieces(p, null));
  // Rings included: by the time the mold goes in the stand the guide has fitted them, and a figure
  // that quietly drops a part the reader just installed makes them wonder what they did wrong.
  const mold = moldPieces(p, { hot: hot === "mold" ? "ribs" : null, smooth, rings: true });
  mold.rotation.z = Math.PI / 2;
  mold.position.set(p.height / 2, standCollarTop() + standSaddleH(p), 0);
  g.add(mold);
  return g;
}

/**
 * What each figure shows. Keys are the guide's step ids; the value builds the group. Anything the
 * guide cannot draw — winding bamboo, pasting washi — has no entry and gets a photo instead.
 */
const SCENES = {
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
  // Nothing is highlighted here: the mold was assembled three steps ago and the stand one step ago,
  // so colouring either says "this is new" about a part that is not. What the figure adds is the
  // relationship, and eight orange ribs in a stand read as a tangle rather than as an instruction.
  onStand: (p, sm) => moldOnStand(p, null, sm),
  // The rings go on the ASSEMBLED MOLD, right after the second koma: the washi's cover allowance is
  // folded over them, so they are in place long before anything is pasted, and they stay in the
  // lantern when the mold comes out. Hence the mold here rather than the finished shade.
  rings: (p, sm) => moldPieces(p, { smooth: sm, rings: true, hot: "rings" }),
};

export const FIGURES = Object.keys(SCENES);

/**
 * Render one figure to a PNG data URL, or null if it cannot be drawn (no WebGL, unknown id). Drawn
 * at 2x and shown at 1x, so the thin edge lines survive a high-density screen and printing.
 */
export function figureImage(p, id, { width = 620, height = 460, smooth = false } = {}) {
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
    // at once. The camera goes on that axis, far enough out that nothing clips.
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    const reach = box.getSize(new THREE.Vector3()).length();
    const aspect = width / height;
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, reach * 6);
    cam.position.copy(c).addScaledVector(VIEW_DIR, reach * 2);
    cam.lookAt(c);
    cam.updateMatrixWorld();
    // Fit the frustum to the box AS PROJECTED, not to its largest side: a rib is long and thin, and
    // sizing the view by its length leaves the drawing a fifth of the well with white all round it.
    // The eight corners bound the projection exactly, so this fills the frame whatever the part is.
    let ex = 0, ey = 0;
    const v = new THREE.Vector3();
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
      ex = Math.max(ex, Math.abs(v.x)); ey = Math.max(ey, Math.abs(v.y));
    }
    const half = Math.max(ey, ex / aspect, 1) * 1.06;      // 6%: room for the edge lines themselves
    cam.top = half; cam.bottom = -half; cam.right = half * aspect; cam.left = -half * aspect;
    cam.updateProjectionMatrix();

    gl.setClearAlpha(0);
    gl.render(scene, cam);
    return gl.domElement.toDataURL("image/png");
  } catch {
    return null;        // a figure is an illustration: losing one must not take the page down
  } finally {
    // The geometries are built per call (they follow the design), so they have to go back per call.
    if (group) group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}

/** Free the renderer and its context — the guide page calls this when it unmounts. */
export function disposeFigures() {
  R?.dispose();
  R = null;
}
