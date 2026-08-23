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
  standCollarTop, standSaddleH, standSlotSep, fukuroRange, komaR,
  grooveList, grooveR, higoSpiralPath, outerR,
} from "../geometry.js";

// The isometric direction every figure is drawn from. Shared rather than local to the camera,
// because the washi panels are PLACED against it: which bays are pasted, and the yaw that puts the
// skipped one in the middle of the frame, are both answers about where the reader is standing
// (see `washiYaw`).
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

/**
 * The rubber bands that hold the assembly together while you work: one just outside each koma, round
 * the bundle of tabs. **The only thing in this file that is not a part** — it is not printed, not
 * cut and not in geometry.js, so it is drawn as a plain torus sized off `komaR`, the radius the tabs
 * actually end at. Never drawn in ink, because it is not a part: full accent while the step is ABOUT
 * the bands, muted once it is not — otherwise the next step highlights its rings in the very orange
 * the bands are already wearing, and the figure stops saying which two things are new.
 */
const BAND_OFF = 0xe3b39d;
function bands(p, hot) {
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
 * The bamboo, wound into the grooves. Not a printed part either — but unlike the bands, not invented
 * either: the rings sit at `grooveList`'s heights on `outerR`'s radius, the same two functions that
 * cut the grooves, so a design with eleven grooves is drawn with eleven rings and a spiral one is
 * drawn as the single descending helix `higoSpiralPath` hands the lit view. **That is why this step
 * earns a figure rather than a photograph**: how many turns, and which way they run, is an answer
 * about this design.
 *
 * Centred ON the outer edge rather than sunk into it. The V is only 0.5mm wider at its mouth than
 * the rod (`grooveR` = higoD/2 + 0.25), so a round rib of that diameter wedges level with the
 * surface long before it reaches the tip — the lit preview centres it there for the same reason.
 * The cardboard route cuts no grooves at all and the bamboo simply lies on the smooth edge at the
 * template's ticks, which are these same heights: nothing here branches on the route.
 */
const HIGO_OFF = 0xbfa06a;      // bamboo tan, once the step has moved on (see `bands` for why muted)
function higoWinding(p, hot) {
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
      const ring = new THREE.Mesh(new THREE.TorusGeometry(outerR(p, y / p.height), r, 8, 96), mat());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      g.add(ring);
    }
  }
  return g;
}

/**
 * Rib k's meridian as a LatheGeometry angle. A lathe puts its point at (r·sin φ, y, r·cos φ) while
 * rib k is placed by `rotation.y = k·2π/N`, which lands it at azimuth −k·2π/N — so the two conventions
 * differ by a quarter turn and a sign, and a panel built at the naive angle straddles a rib instead
 * of sitting between two. Bay k is then [ribPhi(k), ribPhi(k+1)].
 */
const ribPhi = (k, d) => Math.PI / 2 + k * d;
/**
 * The washi, pasted. One `LatheGeometry` PER BAY rather than one skin with a slice missing, because
 * the seams are the instruction: real panels lap over each rib, and a single lathe would draw only
 * its two outer edges and read as one continuous wrapper. Each panel is its own surface, so every
 * seam draws.
 *
 * The radius is `outerR + higoD` — outside the bamboo, which is centred on `outerR` — the same
 * expression the lit preview skins the finished lantern with. It runs `fukuroRange` only: the neck
 * carries no paper, exactly as the washi template's own panel does (papercraft.js). The cover
 * allowance folded over the opening rings is not drawn; it is 3mm of paper, and drawing it would
 * only blunt the rim the figure is trying to show.
 *
 * Double-sided, unlike every part here: a panel turns its inside to the camera as it curves away,
 * and a culled one is a panel that is pasted and invisible.
 *
 * And **ivory rather than the white every part is drawn in** — the one place that rule is dropped.
 * The parts are white because they are the object; here the paper is a second surface laid OVER the
 * object, and white on white is a panel you cannot see against a white card: the first version drew
 * three pasted panels that read as bare air with a stray arc round them. A tint barely off the page
 * is enough to say "there is paper here" without competing with the panel going on now.
 */
const WASHI_FACE = 0xf3ede2;
function washiProfile(p) {
  const { lo, hi } = fukuroRange(p);
  const out = [];
  for (let i = 0; i <= 60; i++) {
    const t = lo + (hi - lo) * (i / 60);
    out.push(new THREE.Vector2(outerR(p, t) + p.higoD, t * p.height));
  }
  return out;
}
function washiSkin(p, bays, hotBay) {
  const g = new THREE.Group();
  const prof = washiProfile(p);
  const d = (Math.PI * 2) / p.boards;
  for (const k of bays) {
    const hot = k === hotBay;
    const geo = new THREE.LatheGeometry(prof, 16, ribPhi(k, d), d);
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: hot ? HI_FACE : WASHI_FACE, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    })));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24),
      new THREE.LineBasicMaterial({ color: hot ? HI : INK })));
  }
  return g;
}
/**
 * Panels on every other bay, and the yaw that makes that legible.
 *
 * The mold is turned so that a bay CENTRE sits on the camera axis, and the panels go on the bays
 * either side of it: panel · gap · panel, the gap dead centre. A mold has no preferred rotation, so
 * this costs nothing — and it is the only way to get two alternating panels both fully front-facing.
 * A bay is 360/N wide, so leaving the phase to chance lands one of any such pair across the
 * silhouette, where the reader sees its INSIDE through the bare bay with the near side's bamboo
 * drawn over it: paper behind the bamboo, which is the one thing pasting is not. (Three placements
 * were tried by eye before this one — leading away from the camera hides the gap, and centring the
 * run on it puts ivory on both rims, which reads as one skin with a hole torn in it.)
 *
 * Alternating is what the step asks for — skip a bay, go round, then come back and fill the gaps, so
 * each overlap laps onto a panel that is no longer wet — and it is also the only pattern a still
 * figure can state: contiguous panels are just "a partly covered mold", while a gap between two
 * pasted bays is unmistakably deliberate.
 */
function washiYaw(p, dir) {
  const d = (Math.PI * 2) / p.boards;
  // `dir` is the view direction in the GROUP'S frame — the mold is turned a quarter turn to lie in
  // the stand, and its bays go with it.
  const camPhi = Math.PI / 2 - Math.atan2(dir.z, dir.x);
  return camPhi - ribPhi(0, d) - d / 2;
}
/**
 * Every bay pasted — the shade as it is left to dry. Still one lathe per bay, not a single surface
 * of revolution: a full lathe has no crease anywhere, so `EdgesGeometry` finds nothing but its two
 * rims and the body comes out an ivory blob with no outline at all. Per bay, the seams draw, and the
 * outermost ones sit within half a bay of the silhouette — where meridians are seen edge-on, so they
 * land on it. The seams are worth drawing for their own sake anyway: a dry shade shows them.
 *
 * Nothing is highlighted: the step adds no part, it waits.
 */
function washiWhole(p) {
  const bays = [];
  for (let k = 0; k < p.boards; k++) bays.push(k);
  return washiSkin(p, bays, null);
}
function washiPieces(p) {
  const d = (Math.PI * 2) / p.boards;
  const bays = [];
  // Out from the centre bay, every other one, for as long as the WHOLE bay stays within ~78° of the
  // axis. Scoring a bay by its centre is not enough: a bay centred at 67° still reaches past 90°.
  for (let i = 1; i * d + d / 2 <= 1.36; i += 2) bays.push(-i, i);
  if (!bays.length) bays.push(-1, 1);      // a very coarse mold (few, wide ribs): show the pair anyway
  return washiSkin(p, bays, 1);            // one of the pair is the one going on now
}

function moldPieces(p, { ribs = true, komaBot = true, komaTop = true, hot = null, smooth = false, rings = false, band = false, higo = false, washi = null } = {}) {
  const g = new THREE.Group();
  if (band) g.add(bands(p, hot === "bands"));
  if (higo) g.add(higoWinding(p, hot === "higo"));
  if (washi) g.add(washi === "all" ? washiWhole(p) : washiPieces(p));
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
  // The yaw turns the mold, not the panels: they are placed on bays, and turning them alone would
  // simply slide them off their ribs. Wrapped rather than set on `g` itself, so a caller's own
  // rotation (the quarter turn into the stand) still composes the way it reads.
  if (washi && washi !== "all") {
    const w = new THREE.Group();
    g.rotation.y = washiYaw(p, washi);
    w.add(g);
    return w;
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
function moldOnStand(p, hot, smooth, washi = null) {
  const g = new THREE.Group();
  g.add(standPieces(p, null));
  // Rings and bamboo included: by the time the mold goes in the stand the guide has fitted the one
  // and wound the other, and a figure that quietly drops what the reader just installed makes them
  // wonder what they did wrong.
  const mold = moldPieces(p, { hot: hot === "mold" ? "ribs" : null, smooth, rings: true, band: true, higo: true, washi });
  mold.rotation.z = Math.PI / 2;
  mold.position.set(p.height / 2, standCollarTop() + standSaddleH(p), 0);
  g.add(mold);
  return g;
}

/**
 * What each figure shows. Keys are the guide's step ids; the value builds the group. Anything the
 * guide cannot draw — waiting for it to dry, easing the mold back out — has no entry and gets a
 * photo instead.
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
  // Nothing is highlighted here: the mold was assembled four steps ago and the stand one step ago,
  // so colouring either says "this is new" about a part that is not. What the figure adds is the
  // relationship, and eight orange ribs in a stand read as a tangle rather than as an instruction.
  onStand: (p, sm) => moldOnStand(p, null, sm),
  // The rings go on the ASSEMBLED MOLD, right after the second koma: the washi's cover allowance is
  // folded over them, so they are in place long before anything is pasted, and they stay in the
  // lantern when the mold comes out. Hence the mold here rather than the finished shade.
  // The bands ride along from here on, muted: the text beside this step asks for them, and a
  // figure that leaves them out is a figure of a mold that has already sprung apart.
  rings: (p, sm) => moldPieces(p, { smooth: sm, rings: true, hot: "rings", band: true }),
  // Winding: the mold as the last three steps left it, with the bamboo on. Drawn standing upright,
  // which is where it is wound — the stand comes out one step later, for the pasting.
  // `smooth` is the cardboard route, and that route's guide has no ring step and no band advice (its
  // koma holds by friction, the fibres crushing to a snug fit), so the figure must not show either:
  // this is the only scene both routes draw, and a part the reader was never told to fit reads as a
  // step they missed.
  higo: (p, sm) => moldPieces(p, { smooth: sm, rings: !sm, band: !sm, higo: true, hot: "higo" }),
  // Pasting: the mold where the reader left it — IN THE STAND, which is what the stand is for (you
  // paste a panel, turn it, paste the next). The cardboard route has no stand, so there it is drawn
  // standing on its koma instead; that is also why the panels have to be placed per orientation
  // rather than once (see `washiPieces`).
  washi: (p, sm) => (sm
    ? moldPieces(p, { smooth: true, higo: true, washi: VIEW_DIR })
    : moldOnStand(p, null, false, DIR_ON_STAND)),
  // Drying: every bay pasted, and OFF the stand — nothing turns while it dries, and the stand in
  // the frame would say there is still something to do to it. What is left of the mold to see is
  // what sticks out past the paper: the necks, the tabs and the two koma, which is the reader's
  // reminder that it is all still in there until the shade is dry.
  dry: (p, sm) => moldPieces(p, { smooth: sm, rings: !sm, band: !sm, higo: true, washi: "all" }),
};
// The view direction inside the mold's OWN frame once it is lying in the stand. The group is turned
// a quarter turn about Z there, so world (x,y,z) reads as local (y,-x,z).
const DIR_ON_STAND = new THREE.Vector3(VIEW_DIR.y, -VIEW_DIR.x, VIEW_DIR.z);

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
