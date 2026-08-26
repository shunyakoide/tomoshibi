/**
 * ============================================================================
 * FIGURES — the assembly guide's line drawings, rendered from the real parts
 * ============================================================================
 * Every figure on the guide page is drawn from a real design `p`: 8 ribs are drawn as 8 ribs, and a
 * 400mm body is drawn tall. (The guide hands the same FIXED design to every call these days — see
 * GuidePage. Nothing in this file knows that, and nothing here should.) The shapes come from `geometry.js` like everything else here, so a
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
  standCollarTop, standSaddleH, standSlotSep, fukuroRange, komaR, maxRadius,
  grooveList, grooveR, higoSpiralPath, outerR, openingR, ringLegs,
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
 * The surface is the mold's own, offset `higoD` clear of it — outside the bamboo, which is centred
 * on `outerR` (see `washiProfile` for why that offset has to follow the normal). It runs
 * `fukuroRange` only: the neck
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
  const H = p.height, N = 60, dt = (hi - lo) / N / 2 || 1e-4;
  const out = [];
  for (let i = 0; i <= N; i++) {
    const t = lo + (hi - lo) * (i / N);
    // Offset along the surface NORMAL, not along x. Pushing the profile out horizontally leaves only
    // `higoD·cos θ` of clearance on a face at angle θ, and the bamboo is a round rod of higoD across
    // sitting ON that face: past θ ≈ 60° the rod comes out through the paper that is supposed to be
    // lying over it. A squat, steep-sided body reaches that easily (r=120 over h=90 is dR/dy = 2),
    // and it drew its bamboo as rings printed on the outside of the shade.
    const t0 = Math.max(lo, t - dt), t1 = Math.min(hi, t + dt);
    const s = (outerR(p, t1) - outerR(p, t0)) / ((t1 - t0) * H);      // dR/dy
    const n = Math.hypot(1, s);
    out.push(new THREE.Vector2(outerR(p, t) + p.higoD / n, t * H - (p.higoD * s) / n));
  }
  return out;
}
function washiSkin(p, bays, hotBay, face = WASHI_FACE) {
  const g = new THREE.Group();
  const prof = washiProfile(p);
  const d = (Math.PI * 2) / p.boards;
  for (const k of bays) {
    const hot = k === hotBay;
    const geo = new THREE.LatheGeometry(prof, 16, ribPhi(k, d), d);
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: hot ? HI_FACE : face, side: THREE.DoubleSide,
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
function washiWhole(p, face) {
  const bays = [];
  for (let k = 0; k < p.boards; k++) bays.push(k);
  return washiSkin(p, bays, null, face);
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

/**
 * Which rib is drawn FACE-ON from `dir`. A rib is a flat plate extruded along its own z, so rib k's
 * faces look out at azimuth π/2 − k·2π/N; the nearest one to the camera's azimuth is the rib whose
 * shape can actually be read — any other is seen edge-on and draws as a line.
 */
function faceOnRib(p, dir) {
  const d = (Math.PI * 2) / p.boards;
  const k = Math.round((Math.PI / 2 - Math.atan2(dir.z, dir.x)) / d);
  return ((k % p.boards) + p.boards) % p.boards;
}

function moldPieces(p, { ribs = true, komaBot = true, komaTop = true, hot = null, smooth = false, rings = false, band = false, higo = false, washi = null, pull = null } = {}) {
  const g = new THREE.Group();
  if (band) g.add(bands(p, hot === "bands"));
  if (higo) g.add(higoWinding(p, hot === "higo"));
  if (washi === "all" || washi === "lit") g.add(washiWhole(p, washi === "lit" ? LIT_FACE : WASHI_FACE));
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
  // `pull` draws one rib on its way out (see `pullScene`); the rest stay where they are, hidden
  // inside the shade like they would be.
  const pulled = pull ? faceOnRib(p, pull.dir) : -1;
  if (ribs) for (let k = 0; k < p.boards; k++) {
    // In `pull` the others are already out: the step takes them one at a time, and the last one is
    // the only state in the whole sequence where the mouth is not packed with rib edges seen end-on.
    if (pull && k !== pulled) continue;
    // "oneRib" colours a single rib: the step plugs them in one at a time, and a figure with all
    // eight highlighted says "everything is new" — which is the one thing a highlight cannot mean.
    const geo = ribGeo(p, k, smooth);
    const m = part(geo, hot === "ribs" || (hot === "oneRib" && k === 0) || k === pulled);
    const a = (k / p.boards) * Math.PI * 2;
    m.rotation.y = a;
    if (k === pulled) {
      // Onto the axis before it slides: a rib is wider than the mouth it has to leave by, so it
      // comes out by being brought in to the middle first — which is what the hollowed inner edge
      // is for. Centred by the geometry's own bounding box rather than by `innerRi`/`maxRadius`, so
      // a lightening window or the cardboard route's smooth edge cannot leave it a millimetre out.
      geo.computeBoundingBox();
      const b = geo.boundingBox;
      const inward = (b.min.x + b.max.x) / 2;
      // `position` is in the parent's frame, so the radial move has to be turned with the rib.
      m.position.set(-inward * Math.cos(a), pull.slide, inward * Math.sin(a));
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
  // The yaw turns the mold, not the panels: they are placed on bays, and turning them alone would
  // simply slide them off their ribs. Wrapped rather than set on `g` itself, so a caller's own
  // rotation (the quarter turn into the stand) still composes the way it reads.
  if (washi && washi !== "all" && washi !== "lit") {
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
 * The mold coming out, near the end of it: the shade dry, both koma off, and the LAST rib half drawn
 * out of the opening. **Lying on its side** — a rib leaves along the axis, so upright the whole
 * action points at the camera and draws as a stub over the mouth. Sideways it reads left to right.
 *
 * One rib rather than all of them, and it is not just tidier: the ribs come out one at a time, and
 * the last one is the only moment in that sequence where the mouth is a mouth. With the other seven
 * still in, the opening fills with rib edges seen end-on and the reader is looking at a turbine.
 * What is left inside is the bamboo, seen from within through the far wall, which is what a real
 * shade shows once the mold is out of it.
 *
 * The koma are set down flat rather than exploded along the axis, which is the usual convention for
 * a part being taken off: the axis here is exactly where the rib is coming out, so a disc floating
 * on it reads as being in the way. A part lying flat on the table reads as off and overlaps nothing.
 * The rubber bands are simply gone — with the koma off there is nothing left for them to hold, and a
 * figure that keeps them is a figure of a step not finished.
 */
// How far the mold is turned away from square-on to the camera. At 0° the open mouth faces the
// reader and the frame fills with the inside of the lantern — every remaining rib edge-on, and the
// bamboo on the far wall showing through. At 45° the mouth is edge-on and the shade flattens into a
// leaf with a sliver at one end. 15° keeps the mouth an ellipse you can read as a hole.
const PULL_YAW = (15 * Math.PI) / 180;
function pullScene(p, smooth) {
  const root = new THREE.Group();
  const w = new THREE.Group();
  w.rotation.y = PULL_YAW;
  // Out of the WIDER opening. A rib is as wide as the body is deep, and a lantern's two mouths are
  // rarely the same size — the default is ⌀148 at the bottom and ⌀38 at the top, and the top will
  // never pass a rib. Drawn the other way up it does not read as the wrong choice, it reads as the
  // rib tearing its way out through the paper, which is what it was doing.
  const top = openingR(p, true) >= openingR(p, false);
  const dir = top ? -1 : 1;                // which way along the axis the rib leaves
  // The exit always points along world +x, so the rib comes out towards the right whichever end it
  // leaves by; turning the mold over is free, and the reader should not have to read it backwards.
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
  // Both koma, off: flat on the same table the shade is lying on, and IN FRONT of it — the isometric
  // puts +z at the near-left, which is where the frame is empty. Beside the ends is where they would
  // go by instinct and it does not work: the body bulges a full radius past its own opening, so a
  // koma clear of the silhouette there has to sit a long way out and takes the whole drawing down a
  // size with it.
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
 * The finished lantern, lit — the figures with no mold in them at all. There is one per way of
 * lighting it, because the lamp is the one part of this build the app does not make: you supply it,
 * and the three ways of doing that give three different objects.
 *
 * **Warm, not white.** The rest of the page is a white-parts drawing and the pasted washi is ivory;
 * a lit shade is the same paper with light behind it, so it is drawn the colour the lit view's own
 * emissive gives it. That is the whole of "the light is on" — no rays: this page is a set of
 * technical drawings, and a starburst is the one mark on it that would be decoration.
 */
const LIT_FACE = 0xf9d9a3;       // the lit view's warm emissive, as a flat fill
const CORD_INK = 0x5c574f;       // lamp flex: dark, but the ink family rather than black
const LAMP_INK = 0x8f949c;       // the lamp's own body: a grey, light enough not to out-weigh the ink

/** The lantern itself, at its own coordinates: shade, the bamboo in it, and the rings in its mouths. */
function litShade(p, smooth) {
  return moldPieces(p, {
    ribs: false, komaBot: false, komaTop: false, smooth, rings: !smooth, higo: true, washi: "lit",
  });
}

/**
 * (2) Hung from a pendant cord, fixed at the top.
 *
 * Two things about the cord are deliberate: it is on the AXIS, and it enters by the TOP opening
 * whichever of the two openings is the wider — a hanging shade has an up, and it is the design's own
 * up, not its bigger mouth. It dips `CORD_DIP` below the rim so it meets the opening instead of
 * floating over it, and runs `CORD_UP` of the body height above the shade: far enough to read as
 * hanging, short enough not to eat the frame (the view fits the bounding box, cord included). Its
 * top is simply cut off — the drawing convention for "this continues" — rather than ending in a
 * ceiling rose, which would claim the lamp is wired in when it plugs into a socket.
 */
const CORD_R = 1.6;              // mm — a lamp cord, thin enough to draw as a line, not a pipe
const CORD_DIP = 6;              // mm below the opening rim, so the cord meets the ring
const CORD_UP = 0.42;            // x body height above the shade
function lightHang(p, smooth) {
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
  // The hanger. What carries the shade is not the lamp: the lamp hangs on the cord INSIDE, and the
  // shade hangs on one wire laid across the opening with the cord through the loop in its middle —
  // see the foot of this file. A figure without it is a shade hanging on nothing.
  const hanger = hangPlaced(p, false);      // the ring is already in `litShade`, where the route decides it
  hanger.position.y = yTop;
  g.add(hanger);
  return g;
}

/**
 * (1) No legs: a lamp stood on the floor and the shade dropped over it.
 *
 * **Drawn EXPLODED — the shade lifted clear of the lamp — because the method is the whole point of
 * the figure and the shade is opaque.** Set down, this way of doing it looks exactly like the other
 * two with their fittings cropped off: a lit shade on a surface. Lifted, it says put the lamp there
 * and cover it, which is the entire instruction. The floor is a thin disc, and it is what makes
 * "stood on the floor" different from "floating": without it the lamp reads as hanging too.
 *
 * The lamp is generic on purpose — a base and a dome, no socket and no bulb thread — because this
 * route takes whatever you own that stands up and glows. It is sized off the BOTTOM opening it has
 * to pass through (`LAMP_FIT` of that radius), so a design whose mouth is too small to swallow a
 * lamp does not get drawn one that could never go in.
 */
const LAMP_FIT = 0.62;           // x the bottom opening radius: it has to pass through the mouth
const LAMP_MAX = 38;             // mm — beyond this it is a floor lamp, not something you cover
const LAMP_LIFT = 0.48;          // x body height: the exploded gap above the lamp
function lightSet(p, smooth) {
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
 * (3) Stood on legs, with the lamp fixed up into the bottom opening.
 *
 * The legs are the lit view's legs (`scenes.js` buildLit: 0.42·height drop, 0.35·drop splay) rooted
 * in the bottom ring's SOCKETS — `ringLegs` gives the pad centres — because that is the one place
 * this app actually makes for them. It returns null when the sockets are off and when the opening
 * is too small to hold them; the guide drops this option entirely in that case rather than drawing
 * a legless lantern under the words "add legs". It does NOT depend on the route: cardboard prints
 * no ring, but the finished lantern has one either way and the step says so in its own words.
 *
 * What makes it method (3) rather than (2) upside down: the socket is fixed UP INTO the bottom
 * mouth and the cord leaves DOWNWARDS, between the legs, which is the whole reason the lantern
 * needs the clearance the legs give it. The cord is cut off below the feet — it goes on to a plug.
 * Rods and socket rather than parts: you supply them, and an outlined cylinder is no help anyway
 * (12 facets draw as a hatched tube, 24 draw as nothing at all).
 */
const LEG_DROP = 0.42;           // x body height, and the splay is 0.35 of that: the lit view's own
function lightLegs(p, smooth) {
  const g = new THREE.Group();
  g.add(litShade(p, smooth));
  // Legs on BOTH routes. `ringLegs` is a question about the opening, not about a printed part, so
  // it answers on cardboard too — that route simply prints no ring for the pads to be in, and the
  // step's own cardboard text says the hoop is yours to make. Drawing the legs anyway is right: the
  // finished lantern has an opening ring either way; only who supplies it changes.
  const legs = ringLegs(p);
  const y0 = fukuroRange(p).lo * p.height;         // the bottom opening = where the ring seats
  const ink = new THREE.MeshBasicMaterial({ color: LAMP_INK });
  // No socket is drawn. The view looks DOWN on the lantern, so anything sitting in the bottom mouth
  // is behind the paper — a socket here draws nothing at all, and one dropped far enough to clear
  // the rim would be inventing a fitting this step has not designed. The cord coming out from under
  // the shade says the lamp is up there; the text says what holds it.
  const drop = p.height * LEG_DROP, splay = drop * 0.35;
  // The cord leaves the socket, drops, and TURNS OUT of the frame. The turn is the whole point: a
  // dark line straight down between three legs is read as a fourth leg, which is what it looked
  // like. It runs out along screen-right (world +x−z projects horizontally) so the bend is square
  // to the reader instead of foreshortened into a kink.
  const cordMat = new THREE.MeshBasicMaterial({ color: CORD_INK });
  const yB = y0, dropLen = drop * 0.62;
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
  for (let i = 0; i < legs.n; i++) {
    const a = (i / legs.n) * Math.PI * 2;
    const top = new THREE.Vector3(legs.Rc * Math.cos(a), y0, legs.Rc * Math.sin(a));
    const foot = new THREE.Vector3((legs.Rc + splay) * Math.cos(a), y0 - drop, (legs.Rc + splay) * Math.sin(a));
    const v = new THREE.Vector3().subVectors(foot, top);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(legs.bore, legs.bore, v.length(), 20), ink);
    rod.position.copy(top).addScaledVector(v, 0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    g.add(rod);
  }
  return g;
}

/**
 * ============================================================================
 * THE KIT — the figures that are not this design
 * ============================================================================
 * Everything above is `p` made visible. These are not. A pot of paste, a roll of tape and a brush
 * are things you buy, and nothing about them is decided by the lantern — the same reason `KIT` in
 * GuidePage is plain strings with no numbers in them. So they are constants, and their dimensions
 * are PROPORTIONS rather than measurements: the frame is fitted per figure, so only the ratios
 * survive. Where a real one has a standard size, that is where the ratio comes from — a 糊刷毛 is
 * about 130mm wide with 30mm of bristle, a shoe brush about 160x45 with 20mm.
 *
 * They are drawn exactly like a printed part — white face, `part()`'s own outline — rather than
 * given a colour of their own: a kit item and a mold part sit in the same card, in the same well,
 * and a kit rendered in fill colour would read as "this is a different kind of drawing" instead of
 * "this is a different kind of object", which is the wrong sentence for a page that is otherwise
 * all one visual language.
 *
 * A round PART in this app is always a flat plate — a koma, a rib, a ring — with its curve lying IN
 * the face the camera mostly looks at and a thickness of a few millimetres at most. `EdgesGeometry`
 * draws the whole curve there regardless of how finely it is sampled, because that edge sits between
 * a flat cap and a near-vertical wall (roughly a right angle) rather than between two neighbouring
 * points ON the curve (a shallow angle that only clears the 24deg threshold if the curve is coarse).
 * So the app's parts never needed a low-poly trick, and giving the kit's tall round volumes one —
 * a tub, a roll of tape, a spool — read as faceted where nothing in the mold ever is. Reverted: they
 * stay smooth (a plain cylinder radial count, no lower than a part ever uses), and where a shape is
 * tall enough that its own SIDE would otherwise vanish (see below), it gets two straight lines
 * instead of a polygon — the classic technical-drawing cylinder, two rims plus the pair of verticals
 * where the surface is tangent to the eye. `coil()` is the one exception: an open tube has no cap to
 * anchor a rim edge at all, so it still leans on facets — see its own comment.
 *
 * A BRUSH is the one shape white cannot carry on its own: its whole identity is the bristles, and a
 * block of bristles is just another flat-faced solid — indistinguishable from the handle above it
 * without a fill to separate them. So a brush also gets `bristleFringe()`: short lines hung off the
 * bristle block's front-bottom edge, the same INK as every other line here. Not a texture, not a
 * colour — one more small fact drawn the way this file draws every fact, with a line.
 * ============================================================================
 */

/** A kit object: `part()`'s own white face + outline, reused so a kit item looks like a part. */
const solid = (geo) => part(geo, false);

/** Loose ink strokes: a flat [x,y,z, x,y,z, …] of segment endpoints. Every drawn fact in this
 * section that is not a solid — a bristle, a silhouette, a knurl — is one of these. */
function inkLines(pts) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: INK }));
}

/**
 * A fringe of bristle strokes hanging off a block's front-bottom edge — the one thing a flat white
 * solid cannot say for itself. `xs` are strand positions along the edge; each hangs straight down
 * by `len` from (x, y, z). Real bristles fan out and blur together; four or five evenly spaced
 * strokes read as "there are bristles here" without pretending to count them.
 */
function bristleFringe(xMin, xMax, y, z, len, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const x = xMin + ((xMax - xMin) * i) / (n - 1);
    pts.push(x, y, z, x, y - len, z);
  }
  return inkLines(pts);
}

/**
 * The two straight lines that stand in for a tall round volume's side wall: at the pair of points
 * where the curve runs tangent to the eye, connecting the top rim to the bottom rim (they may be
 * different radii — a tapered tub). Every OTHER point on a smooth cylinder's wall is receding away
 * from the camera and is exactly the surface a real line drawing leaves bare; only the tangent pair
 * reads as an edge to begin with. `view` is `VIEW_DIR` expressed in whatever local frame the solid's
 * axis actually stands in — for a group rotated a quarter turn about Z, that is `(y,-x,z)`, the same
 * swap `DIR_ON_STAND` already does for the mold lying in its stand.
 */
function silhouetteLines(rTop, rBot, yTop, yBot, view = VIEW_DIR, cx = 0, cz = 0) {
  const az = Math.atan2(view.z, view.x);
  const pts = [];
  for (const a of [az + Math.PI / 2, az - Math.PI / 2]) {
    const ct = Math.cos(a), st = Math.sin(a);
    pts.push(cx + rTop * ct, yTop, cz + rTop * st, cx + rBot * ct, yBot, cz + rBot * st);
  }
  return inkLines(pts);
}

/**
 * The same job for a SPHERE: its outline is a circle of the same radius, lying in the plane the
 * camera looks straight down. Needed for the same reason `silhouetteLines` is — a smooth ball's
 * facets are far under the 24deg edge threshold, so white on white it draws nothing at all — and
 * the alternative, faceting it until the facets draw, is the one that was tried and reverted.
 */
function silhouetteCircle(r, cx, cy, cz, view = VIEW_DIR, n = 64) {
  const a = new THREE.Vector3().crossVectors(view, new THREE.Vector3(0, 1, 0)).normalize();
  const b = new THREE.Vector3().crossVectors(view, a).normalize();
  const pts = [];
  for (let i = 0; i < n; i++) {
    for (const k of [i, i + 1]) {
      const th = ((k % n) / n) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      pts.push(cx + r * (a.x * c + b.x * sn), cy + r * (a.y * c + b.y * sn), cz + r * (a.z * c + b.z * sn));
    }
  }
  return inkLines(pts);
}

/** A helix that opens out as it climbs — a coil of rod, which is how both bamboo and wire are sold. */
class CoilCurve extends THREE.Curve {
  constructor(r0, dr, turns, rise) { super(); Object.assign(this, { r0, dr, turns, rise }); }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    const r = this.r0 + this.dr * t;
    return target.set(r * Math.cos(a), this.rise * (t - 0.5), r * Math.sin(a));
  }
}
// 8 radial segments, not a round tube's usual 16+: unlike everything else in this section, an OPEN
// tube has no flat cap to anchor a rim edge at all (see "THE KIT" above) — white-on-white it would
// have nothing to draw but its two cut ends. At 45deg the facets clear the 24deg edge threshold, so
// the coil reads as a wound, faceted rod the same way a rib's curved edge reads as a curve: by
// enough short lines.
const coil = (rod, r0, dr, turns, rise) => solid(
  new THREE.TubeGeometry(new CoilCurve(r0, dr, turns, rise), Math.ceil(turns * 48), rod, 8, false));

/** A tub with its lid on: starch paste. (Wood glue comes in a bottle; the tub is the first-named.) */
function pasteTub() {
  const g = new THREE.Group();
  g.add(solid(new THREE.CylinderGeometry(32, 30, 44, 32)));
  g.add(silhouetteLines(32, 30, 22, -22));
  const lid = solid(new THREE.CylinderGeometry(34, 34, 13, 32));
  lid.position.y = 26.5;                  // over the rim, not level with it
  g.add(lid);
  g.add(silhouetteLines(34, 34, 33, 20));
  return g;
}

/** A roll: a prism with a bore, stood on its axis so the bore is what you see. */
function rollGeo(rOut, rIn, h) {
  const s = new THREE.Shape().absarc(0, 0, rOut, 0, Math.PI * 2, false);
  s.holes.push(new THREE.Path().absarc(0, 0, rIn, 0, Math.PI * 2, true));
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);              // extruded along +z; stand it up
  geo.translate(0, -h / 2, 0);
  return geo;
}

/**
 * Tape and thread, in one figure. They are one line on the list — either will hold the bamboo while
 * the paste dries — so they are one drawing; two cards saying the same thing is the list padding
 * itself. Set side by side ACROSS the view (`(1,0,-1)` projects horizontally), which is the only
 * offset that does not stack one behind the other, and set close enough to OVERLAP: the frame is
 * fitted to what is in it, so every millimetre of gap between them is drawn at the cost of both.
 * The reel is TIPPED OVER and set in front, its axis running diagonally. Two upright cylinders side
 * by side is one silhouette read twice, and the near one drawn upright ran into the roll rather
 * than in front of it — overlapping on the page is the point, intersecting in space is not, so the
 * two stay clear of each other in plan and let the projection do the overlapping.
 */
function tapeAndThread() {
  const g = new THREE.Group();
  const across = new THREE.Vector3(1, 0, -1).normalize();
  const back = new THREE.Vector3(1, 0, 1).normalize();
  const roll = solid(rollGeo(30, 15, 16));
  roll.add(silhouetteLines(30, 30, 8, -8));       // the outer wall
  roll.add(silhouetteLines(15, 15, 8, -8));       // and the bore, the same height
  roll.position.copy(across).multiplyScalar(-18).setY(-8);      // both standing on the same ground
  g.add(roll);
  const spool = new THREE.Group();
  spool.add(solid(new THREE.CylinderGeometry(11, 11, 26, 32)));
  // The spool is laid on its side below (rotation.z), so its own axis reads VIEW_DIR the same
  // quarter turn away DIR_ON_STAND does for the mold lying in its stand — the local view is
  // (y,-x,z), not VIEW_DIR itself.
  spool.add(silhouetteLines(11, 11, 13, -13, DIR_ON_STAND));
  for (const y of [-14.5, 14.5]) {
    const f = solid(new THREE.CylinderGeometry(16, 16, 3, 32));
    f.position.y = y;
    spool.add(f);
  }
  spool.rotation.z = Math.PI / 2;                               // laid on its side, axis along x —
  spool.position.copy(across).multiplyScalar(20)                // which is 45 degrees on screen
    .addScaledVector(back, 56).setY(0);                         // resting on the same ground
  g.add(spool);
  return g;
}

/** N points evenly around a circle — the same construction ring.js's own `circlePts` uses for a
 * hole in a Shape (a cap-plane curve, smooth at any resolution — see "THE KIT" above). */
function circlePts(r, n, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
}

/**
 * The paste brush: not a plain trapezoid, but the shape a real 糊刷毛 actually is — a narrow grip
 * with a hanging hole, flaring into a wide wood paddle, a metal ferrule clamped around its base
 * (a separate solid, so it keeps its own outline the way a real seam would), and the bristles
 * fanning out below it as wide as the ferrule.
 */
function pasteBrush() {
  const g = new THREE.Group();

  const s = new THREE.Shape();
  s.moveTo(-13, 100); s.lineTo(-13, 60);    // the grip, straight-sided
  s.lineTo(-65, 6); s.lineTo(-65, 0);       // flaring into the paddle
  s.lineTo(65, 0); s.lineTo(65, 6);
  s.lineTo(13, 60); s.lineTo(13, 100);
  s.absarc(0, 100, 13, 0, Math.PI, false);  // the grip's rounded top
  s.closePath();
  s.holes.push(new THREE.Path(circlePts(5, 16, 0, 88)));   // the hanging hole
  const geo = new THREE.ExtrudeGeometry(s, { depth: 12, bevelEnabled: false, curveSegments: 12 });
  geo.translate(0, 0, -6);
  g.add(solid(geo));

  const band = solid(new THREE.BoxGeometry(130, 7, 14));
  band.position.y = -3.5;
  g.add(band);
  g.add(bristleFringe(-58, 58, -1.5, 7.1, 2, 9));           // the ferrule's row of rivets
  // The ferrule's own bottom-front edge, exactly (depth 14, so half = 7) — see the note this
  // replaced, on lining a fringe up with the solid it hangs from.
  g.add(bristleFringe(-62, 62, -7, 7, 28, 13));
  return g;
}

/** A rectangle with round ends — the plan of a shoe brush. */
function stadium(len, wid) {
  const r = wid / 2, x = len / 2 - r;
  const s = new THREE.Shape();
  s.absarc(x, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.absarc(-x, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  s.closePath();
  return s;
}

/** The brush for laying the paper down: a shoe brush, bristles over its whole underside. */
function smoothBrush() {
  const g = new THREE.Group();
  const body = new THREE.ExtrudeGeometry(stadium(160, 46), { depth: 20, bevelEnabled: false, curveSegments: 16 });
  body.rotateX(-Math.PI / 2);             // spans y 0..20
  g.add(solid(body));
  const br = new THREE.ExtrudeGeometry(stadium(150, 38), { depth: 18, bevelEnabled: false, curveSegments: 16 });
  br.rotateX(-Math.PI / 2);
  br.translate(0, -18, 0);                // spans y -18..0
  g.add(solid(br));
  // The pad's bottom-front edge, exactly. `x = -56..56` is the STRAIGHT run between the two rounded
  // ends (stadium(150, 38): half-width 19, so the arcs centre at x = ±(150/2 - 19) = ±56) — inside
  // that span the front face sits at a constant z = 19 (the half-width), which is what makes a flat
  // xMin..xMax fringe line up with it at all. Past x = ±56 the front face curves inward with the
  // rounded end, and a straight fringe drawn there would run ahead of the block instead of along it.
  g.add(bristleFringe(-56, 56, -18, 19, 8, 11));
  return g;
}

/**
 * One arm, in the PIVOT's own frame: the pivot at the origin, the jaw running out to x = -95 and
 * the handle away to x = +115. Pivot-relative rather than tip-relative because the arms are then
 * opened by simply rotating each about z — which is what a pair of pliers physically does, and it
 * gets the whole linkage right for free: one arm's jaw rises exactly as its own handle drops, and
 * the two handles splay by the same angle the jaws do.
 *
 * The shape is one lever, drawn for the arm whose jaw sits ABOVE the axis; the other is this
 * mirrored in y. The gripping face is the near-flat run along y ~ 0.3, so at zero rotation the two
 * faces meet and the jaws are shut.
 */
const PLIER_ARM = [
  [-95, 2.4], [-77, 3.8], [-55, 5.8], [-33, 8.4], [-15, 11.2], [-3, 14.5],  // jaw, back edge
  [9, 13], [19, 6], [25, -2],                                               // the neck, past the head
  [45, -14], [70, -27], [95, -40], [112, -49],                              // handle, outer edge
  [122, -55], [123, -64], [113, -69], [102, -65],                           // the handle's rounded end
  [88, -57], [68, -45], [46, -32], [30, -21], [20, -12],                    // handle, inner edge
  [13, -6], [5, -4],                                                        // back under the head
  [-3, 0.4], [-25, 0.35], [-50, 0.3], [-75, 0.3], [-95, 0.3],               // the gripping face
];
// Half the jaw opening. Pliers are drawn OPEN: shut, the two arms' gripping faces coincide and the
// pair reads as one flat tapered blade — a pair of tweezers, or a knife. The gap is the tool.
const PLIER_OPEN = (10 * Math.PI) / 180;
/**
 * Marks, drawn the same way `bristleFringe` draws bristles: not modeled, just short lines on the
 * face a line-art solid otherwise has nothing to show there. Ticks serrate the jaw's gripping edge
 * partway along (a real long-nose's teeth sit back from the point, which stays smooth), and one
 * line across the handle marks where its rubber grip starts. `z` is the arm's own front face.
 */
function plierMarks(sign, z) {
  const pts = [];
  for (const x of [-72, -60, -48, -36]) pts.push(x, sign * 0.6, z, x, sign * 3.6, z);
  pts.push(45, sign * -14, z, 45, sign * -32, z);
  return inkLines(pts);
}
function pliers() {
  const g = new THREE.Group();
  const arm = (sign, z) => {
    const a = new THREE.Group();
    const s = new THREE.Shape(PLIER_ARM.map(([x, y]) => new THREE.Vector2(x, sign * y)));
    const geo = new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: false });
    geo.translate(0, 0, z);
    a.add(solid(geo), plierMarks(sign, z + 5));
    a.rotation.z = -sign * PLIER_OPEN;      // jaw up, handle down — and mirrored for the other arm
    return a;
  };
  g.add(arm(1, -5.2), arm(-1, 0.2));
  // The head. Both arms are lapped to half thickness through the joint on a real plier, and what
  // you see of it is one lens — so it is drawn as one disc spanning the full thickness, covering
  // the crossing rather than showing it. Its two rim circles are cap-plane curves and draw at any
  // resolution (see "THE KIT"), so it needs no silhouette lines of its own.
  const head = new THREE.CylinderGeometry(14, 14, 10.4, 32);
  head.rotateX(Math.PI / 2);
  g.add(solid(head));
  const pin = new THREE.CylinderGeometry(3.5, 3.5, 11.6, 16);
  pin.rotateX(Math.PI / 2);
  g.add(solid(pin));
  return g;
}
/**
 * What each figure shows. Keys are the guide's step ids; the value builds the group — every step on
 * the page has one, from the first koma to the lantern lit on its cord.
 */
/**
 * The razor: a 長柄カミソリ — the flat plastic handle with a guarded blade in its head, which is
 * what a lantern actually gets trimmed with. (A loose double-edge blade was drawn here first. It
 * is the more iconic object, but nobody trims a wet edge holding a bare blade in their fingers.)
 *
 * The shape is all in the outline: a slim stick, a SHOULDER a third of the way down where the head
 * widens out of the grip, and a slanted cut at the tail. On top of the head sits the guard rail,
 * and across it the comb teeth — the same kind of short INK stroke `bristleFringe` uses, and here
 * for the same reason: white on white, the rail alone is one more rectangle, and the teeth are
 * what say which end cuts.
 */
const RAZOR_L = 180, RAZOR_HW = 11, RAZOR_GW = 8.5, RAZOR_T = 5;
function razorBlade() {
  const g = new THREE.Group();
  const hw = RAZOR_HW, gw = RAZOR_GW, x1 = RAZOR_L / 2;
  const s = new THREE.Shape([
    [-x1 + 6, -gw], [28, -gw], [36, -hw], [x1 - 4, -hw],   // grip, shoulder, head
    [x1, -hw + 8], [x1, hw - 2], [x1 - 4, hw],             // the head's cut-off top corner
    [36, hw], [28, gw], [-x1, gw],                         // back down the blade side; the last
  ].map(([x, y]) => new THREE.Vector2(x, y)));             // edge closes as the slanted tail
  const geo = new THREE.ExtrudeGeometry(s, { depth: RAZOR_T, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);              // extruded along +z; lay it down (spans y 0..T, z = -sy)
  g.add(solid(geo));

  const rail = solid(new THREE.BoxGeometry(46, 1.6, 3.6));   // the guard, along the head's edge
  rail.position.set(61, RAZOR_T + 0.8, -(hw - 1.8));
  g.add(rail);
  const teeth = [];
  for (let x = 41; x <= 81; x += 5) teeth.push(x, RAZOR_T + 1.62, -hw, x, RAZOR_T + 1.62, -hw + 3.6);
  g.add(inkLines(teeth));
  // The seam where the two halves of the handle meet — one line, and the only mark on the grip.
  g.add(inkLines([-6, RAZOR_T + 0.02, -gw, -6, RAZOR_T + 0.02, gw]));
  return g;
}

// The holder's shell. Two figures draw it: the kit card's lamp, hanging with its cord grip up, and
// the fitting figures at the foot of this file, standing the other way up with its threaded stem
// and nut on show. Same object, so the same two numbers.
const SOCKET_R = 17, SOCKET_H = 34;
/**
 * The pendant lamp holder — the cord-and-socket that ways (2) and (3) hang the lamp from. It is
 * NOT a card of its own: on its own it is a fitting, and the list is a list of things you need in
 * front of you, so it is drawn with a bulb screwed into it and both are "a lamp" (see `lamps()`).
 *
 * Hanging, cord up, and the cord is simply CUT OFF at the top: the same convention the `lightHang`
 * figure uses for "this continues", and for the same reason — a plug or a ceiling rose would be
 * claiming something about the reader's wiring. The cord is CORD_INK rather than white, also
 * matching that figure: a 3mm white tube draws nothing at all, and this is the same cord.
 */
function pendantSocket({ crop = false } = {}) {
  const g = new THREE.Group();
  // Short, because the frame is fitted to what is in it: every millimetre of cord is drawn at the
  // cost of the socket, and this figure sits in a small landscape well. Enough to read as hanging.
  const cordLen = 26;
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(CORD_R, CORD_R, cordLen, 12),
    new THREE.MeshBasicMaterial({ color: CORD_INK }),
  );
  cord.position.y = 34 + cordLen / 2;
  g.add(cord);
  const cap = solid(new THREE.CylinderGeometry(8, 13, 12, 32));      // the cord grip
  cap.position.y = 28;
  g.add(cap, silhouetteLines(8, 13, 34, 22));
  // `crop` cuts the shell off short and leaves the skirt behind with it: where this is drawn to
  // show what holds it — hanging in the hanger's U by its cap — a whole socket ⌀34 across in a
  // ⌀38 opening is a figure of a socket with a ring somewhere behind it.
  const bodyH = crop ? 16 : SOCKET_H, bodyTop = 22;
  const body = solid(new THREE.CylinderGeometry(SOCKET_R, SOCKET_R, bodyH, 32));      // the shell
  body.position.y = bodyTop - bodyH / 2;
  g.add(body, silhouetteLines(SOCKET_R, SOCKET_R, bodyTop, bodyTop - bodyH));
  if (crop) return g;
  // The skirt around the mouth the bulb screws into. Only just wider than the shell: the view
  // looks DOWN on this, so the mouth itself is on the far side and no amount of ring drawn there
  // is visible (it was drawn as an annulus first — the shell sits over the bore and hides it).
  // Any more overhang than this and the socket reads as a pot standing on a saucer.
  const lip = solid(new THREE.CylinderGeometry(18.5, 18.5, 5, 32));
  lip.position.y = -14.5;
  g.add(lip, silhouetteLines(18.5, 18.5, -12, -17));
  return g;
}

/**
 * The washi itself: four sheets, each turned a little off the one under it. Squared up they are one
 * white block with a box's outline; fanned, the corners cross and it reads as loose paper. The
 * sheets are 1.4mm thick, which no washi is — but a sheet drawn at its real thickness has no side
 * to draw, and a stack of nothing is nothing.
 */
function washiStack() {
  const g = new THREE.Group();
  // yaw, dx, dz, bottom sheet first — irregular, because even spacing reads as a fan someone laid
  // out on purpose. The TOP sheet is the square one and the ones under it are the turned ones: the
  // top sheet is the only one drawn whole, so anything it does not cover has to be a corner.
  const SHEETS = [[0.22, -7, 6], [-0.15, 5, -4], [0.09, -3, 5], [0.00, 0, 0]];
  SHEETS.forEach(([a, dx, dz], i) => {
    const sheet = solid(new THREE.BoxGeometry(150, 1.4, 106));
    sheet.rotation.y = a;
    sheet.position.set(dx, i * 1.5, dz);
    g.add(sheet);
  });
  return g;
}

/**
 * A trigger sprayer — the plant-mister kind, the one thing on this list that holds water.
 *
 * Three facts have to survive white-on-white: it is a bottle, it has a head you screw on, and you
 * work it with a trigger. So the bottle is three stacked round volumes with `silhouetteLines` on
 * each (a straight base, the shoulder that narrows, the neck), the collar is one short cylinder
 * WIDER than the neck it sits on — the only mark that says the head comes off — and the head is a
 * single extruded profile, a wedge tall at the back and dropping to the nozzle. The trigger is a
 * second extrusion hanging under it, tapered and reaching PAST the nozzle, which is where a real
 * one reaches: drawn short it reads as a spout, and the object stops being a sprayer.
 *
 * Proportions are a 500ml sprayer's (⌀70 bottle, about 175 tall over all), not measurements — see
 * "THE KIT" above. Nothing about it is decided by the lantern.
 */
const SPRAY_R = 35;              // bottle radius: ⌀70, a 500ml sprayer
function sprayBottle() {
  const g = new THREE.Group();
  // The bottle, bottom up. Each segment gets its own pair of tangent lines, because a smooth wall
  // draws nothing by itself and three rim circles floating in a column is not a bottle.
  const base = solid(new THREE.CylinderGeometry(SPRAY_R, SPRAY_R, 66, 32));
  base.position.y = 33;
  g.add(base, silhouetteLines(SPRAY_R, SPRAY_R, 66, 0));
  const shoulder = solid(new THREE.CylinderGeometry(23, SPRAY_R, 56, 32));
  shoulder.position.y = 94;
  g.add(shoulder, silhouetteLines(23, SPRAY_R, 122, 66));
  const neck = solid(new THREE.CylinderGeometry(18, 18, 14, 24));
  neck.position.y = 129;
  g.add(neck, silhouetteLines(18, 18, 136, 122));
  const collar = solid(new THREE.CylinderGeometry(22, 22, 13, 24));   // wider than the neck: it screws off
  collar.position.y = 132;
  g.add(collar, silhouetteLines(22, 22, 138.5, 125.5));

  // The head, as one profile in x (forward) and y (up), extruded across z. Origin at the collar's
  // top, so the whole assembly moves with one position below.
  const head = new THREE.Group();
  const prof = [
    [-24, 0], [34, 0], [45, 7],        // underside, then up the nozzle end
    [45, 20], [30, 28],                // the nozzle boss and the top's forward slope
    [-6, 30], [-24, 18],               // over the top and down the back
  ];
  const hs = new THREE.Shape(prof.map(([x, y]) => new THREE.Vector2(x, y)));
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 34, bevelEnabled: false });
  hg.translate(0, 0, -17);             // extruded along +z from the profile plane; centre it
  head.add(solid(hg));
  const nozzle = solid(new THREE.CylinderGeometry(8, 8, 15, 24));
  nozzle.rotation.z = -Math.PI / 2;    // lay it along +x
  nozzle.position.set(51, 14, 0);
  head.add(nozzle);
  const cap = solid(new THREE.CylinderGeometry(10, 10, 7, 24));
  cap.rotation.z = -Math.PI / 2;
  cap.position.set(61, 14, 0);
  head.add(cap);
  // The trigger: pivoted under the head, HANGING rather than reaching — the first version ran out
  // at the nozzle's own angle and the sprayer read as having two spouts. It has to leave the head
  // steeply enough that no projection of the two can line them up, and only then swing forward.
  const ts = new THREE.Shape([[15, 1], [29, 1], [56, -50], [46, -56]]
    .map(([x, y]) => new THREE.Vector2(x, y)));
  const tg = new THREE.ExtrudeGeometry(ts, { depth: 12, bevelEnabled: false });
  tg.translate(0, 0, -6);
  head.add(solid(tg));
  head.position.y = 142;                 // clear of the collar, so a sliver of it still shows
  g.add(head);
  return g;
}

/**
 * The bulb. Its globe is a smooth sphere with a `silhouetteCircle` for its outline, and the cap's
 * three raised bands are the screw thread — which is what stops the whole thing reading as a
 * doorknob. See `lamps()` below for why it is not the only thing on that card.
 *
 * `view` is VIEW_DIR expressed in whatever frame the bulb ends up standing in, exactly as
 * `silhouetteLines` documents: EVERY line here is a silhouette, and a silhouette is a fact about
 * where the camera is, not about the solid. Hang the bulb upside down without it and the globe's
 * outline circle comes out tilted — drawn as an ellipse across the glass.
 */
const BULB_FOOT = 25;            // mm below the origin: where the cap ends, so it can be stood up
function ledBulb(view = VIEW_DIR) {
  const g = new THREE.Group();
  const globe = solid(new THREE.SphereGeometry(30, 32, 16));
  globe.position.y = 34;
  g.add(globe, silhouetteCircle(30, 0, 34, 0, view));
  const neck = solid(new THREE.CylinderGeometry(26, 14, 28, 32));   // globe down to the cap
  neck.position.y = 13;
  g.add(neck, silhouetteLines(26, 14, 27, -1, view));
  const cap = solid(new THREE.CylinderGeometry(14, 12.5, 24, 32));
  cap.position.y = -13;
  g.add(cap, silhouetteLines(14, 12.5, -1, -25, view));
  for (const y of [-6, -12, -18]) {                                 // the thread
    const band = solid(new THREE.CylinderGeometry(15, 15, 2.4, 32));
    band.position.y = y;
    g.add(band, silhouetteLines(15, 15, y + 1.2, y - 1.2, view));
  }
  return g;
}

/**
 * The other kind of lamp: the flat USB puck you set on the floor and drop the shade over.
 *
 * Two shallow discs — the foot it stands on and the lens over it — because one cylinder is a hockey
 * puck, and the seam between them is what makes it a fitting. The lens is widest at its FOOT and
 * narrows going up, which is the whole read: it is the light that overhangs, not the base. The port
 * housing sticks out of the rim, and the lead ends in a PLUG rather than being cut off — a USB
 * light comes with its cable, where the pendant's cord runs to a ceiling and never ends in frame.
 *
 * Its own proportion is a real one (IKEA's KAPPLAKE is 35mm across and 10mm high, so 3.5:1), but
 * it is drawn LARGER than true scale beside the bulb: at ⌀35 against a 110mm bulb it is a dot in a
 * 300px well, and the card's job is to show two shapes, not to compare their sizes.
 */
const PUCK_R = 38, PUCK_FOOT_H = 7, PUCK_LENS_H = 15;    // 76 across, 22 high = the real 3.5:1
function puckLight() {
  const g = new THREE.Group();
  const foot = solid(new THREE.CylinderGeometry(PUCK_R - 4, PUCK_R - 6, PUCK_FOOT_H, 48));
  foot.position.y = PUCK_FOOT_H / 2;
  g.add(foot, silhouetteLines(PUCK_R - 4, PUCK_R - 6, PUCK_FOOT_H, 0));
  // Straight-sided, and wider than the foot: the overhang is then one clean step. Tapering it as
  // well (the real lens is slightly domed) put a bulge at its foot and the two discs read as a
  // pair of stacked bowls.
  const lens = solid(new THREE.CylinderGeometry(PUCK_R, PUCK_R, PUCK_LENS_H, 48));
  lens.position.y = PUCK_FOOT_H + PUCK_LENS_H / 2;
  g.add(lens, silhouetteLines(PUCK_R, PUCK_R, PUCK_FOOT_H + PUCK_LENS_H, PUCK_FOOT_H));
  const port = solid(new THREE.BoxGeometry(13, 7, 16));
  port.position.set(-PUCK_R + 4, 5.5, 0);
  g.add(port);
  const lead = 34;
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, lead, 12),
    new THREE.MeshBasicMaterial({ color: CORD_INK }),
  );
  cord.rotation.z = Math.PI / 2;                         // out of the port, along -x
  cord.position.set(-PUCK_R - 3 - lead / 2, 5.5, 0);
  g.add(cord);
  const plug = solid(new THREE.BoxGeometry(15, 6, 11));  // USB-A
  plug.position.set(-PUCK_R - 3 - lead - 7, 5.5, 0);
  g.add(plug);
  return g;
}

// VIEW_DIR for a solid that has been turned upside down (a half turn about x) — the flipped-over
// cousin of DIR_ON_STAND, and needed by everything in that solid that draws a silhouette.
const DIR_UPSIDE_DOWN = new THREE.Vector3(VIEW_DIR.x, -VIEW_DIR.y, -VIEW_DIR.z);

/** The holder with a bulb screwed into it: one lamp, hanging, rather than two things to buy. */
function pendantLamp() {
  const g = new THREE.Group();
  const socket = pendantSocket();
  socket.position.y = 17;                      // its mouth down on y = 0
  g.add(socket);
  const bulb = ledBulb(DIR_UPSIDE_DOWN);
  bulb.rotation.x = Math.PI;                   // screwed in: cap up, INTO the mouth
  bulb.position.y = 5;                         // 6mm of cap inside it, hidden by the shell
  g.add(bulb);
  return g;
}

/**
 * BOTH lamps on one card, the way the tape and the thread share one. The three lighting ways want
 * different fittings — one stands a lamp on the floor, two hang a bulb in a socket — so rather
 * than picking one, the card says what the light has to BE: a bulb on a cord, or a flat USB one.
 *
 * Set side by side ACROSS the view, which is the one offset that does not stack them, and kept
 * clear of each other in plan so that only the drawing overlaps. That is `tapeAndThread`'s rule,
 * for its reason: overlapping on the page is what makes both of them big.
 */
function lamps() {
  const g = new THREE.Group();
  const across = new THREE.Vector3(1, 0, -1).normalize();
  const back = new THREE.Vector3(1, 0, 1).normalize();
  const hang = pendantLamp();
  // Lifted so the glass ends just above the floor the puck stands on. It hangs and the puck sits,
  // so they share no ground line — but the eye still wants them to end at the same height.
  hang.position.copy(across).multiplyScalar(-52).setY(62);
  g.add(hang);
  const puck = puckLight();
  // Turned so its lead runs AWAY from the lamp. Built pointing -x, which projects left — straight
  // at the glass, where the plug read as something stuck to it.
  puck.rotation.y = Math.PI;
  puck.position.copy(across).multiplyScalar(44).addScaledVector(back, 26);
  g.add(puck);
  return g;
}

/**
 * ============================================================================
 * FIXING THE LAMP — the sub-figures under way (3), "legs, fixed from below"
 * ============================================================================
 * How the lamp is held to the lantern is the one thing the light step could not say. For the legs
 * the answer is the one the ready-made lantern kits use, and it needs no part this app prints: a
 * pendant holder's cord leaves through a THREADED STEM with a fixing nut on it, so a wire with a
 * loop bent in its end can be stacked on that stem and clamped under the nut. Three wires, three
 * loops, one nut — the lamp and its legs come off the bench as one piece.
 *
 * These ignore `p` exactly as the kit's figures do, and for the same reason: a socket, a nut and a
 * metre of wire are things you buy, and nothing about them is decided by the lantern. Two things
 * they DO share with the drawings around them:
 *
 * [Orientation] The holder is drawn the way this way of doing it leaves it — mouth UP, so the bulb
 *   points into the shade, cord and stem DOWN. That is the whole difference between way (3) and
 *   way (2) hung upside down, and it is why the nut is reachable at all.
 * [Colour] The wire is ACCENT here and grey in the option's own figure — `bands`' rule, that a
 *   thing is drawn hot while the step is ABOUT it and muted once it is not. These three figures are
 *   about the wire; the figure above them is about the lantern.
 *
 * There is no arrow on the nut (the reference drawing for this has a red one). Nothing else on the
 * page has an arrow, and it does not need one: the nut is drawn OFF the thread in (2) and run up
 * tight in (3), which is the exploded-then-assembled pair the guide already uses for `lightSet`.
 */
const STEM_R = 5.5, STEM_H = 28;      // the threaded stem the cord leaves by, and the nut runs on
const NUT_R = 9.5, NUT_H = 6;         // across the corners: a hex draws its own edges, unlike a tube
const WIRE_R = 1.3, LOOP_R = 8.6;     // the leg wire, and the loop bent in its end (it has to pass
                                      // over the stem's thread: LOOP_R - WIRE_R > STEM_R + 0.5)
// Where the stack of loops starts, and it is a long way down the stem for a reason that is about
// the drawing rather than about the fitting: the shell is ⌀34 and the loops are ⌀20, so a loop up
// against the shell's underside is UNDER it — the view looks down, and all three vanished, leaving
// three arms coming out of thin air. This far down, all three clear the shell's edge. A real one
// takes them anywhere along the thread.
const LOOP_Y = -14;
// One leg's shape — arm out, drop, and how far the foot lands outside the arm. The wire figure and
// the assembled one draw the same leg; only the close-up cuts it short.
const LEG = [50, 76, 26];

/** The holder, mouth up, with its stem and thread. `crop` cuts the shell short for the close-up. */
function lampHolder(crop) {
  const g = new THREE.Group();
  const h = crop ? SOCKET_H * 0.55 : SOCKET_H;
  const shell = solid(new THREE.CylinderGeometry(SOCKET_R, SOCKET_R, h, 32));
  shell.position.y = h / 2;
  g.add(shell, silhouetteLines(SOCKET_R, SOCKET_R, h, 0));
  const stem = solid(new THREE.CylinderGeometry(STEM_R, STEM_R, STEM_H, 24));
  stem.position.y = -STEM_H / 2;
  g.add(stem, silhouetteLines(STEM_R, STEM_R, 0, -STEM_H));
  // The thread, as raised rings. `ledBulb`'s cap says "screw" the same way and for the same reason:
  // a smooth white cylinder says nothing at all, and this one has to read as something a nut runs on.
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
 * One leg, bent to shape: the loop, the arm out to the opening, and the drop to the floor. Swept as
 * ONE tube through a point list rather than assembled from cylinders — the corners then come out as
 * bends, which is what a wire has, instead of as the notch two cylinders meeting leave.
 *
 * The loop lies flat, centred on the origin, so the wire is placed by simply dropping it onto the
 * stem's axis. It runs just under a full turn and leaves TANGENTIALLY: the tangent for a decreasing
 * angle is (sin a, -cos a), so ending at a = pi/2 is what sends the arm off along +x. That last
 * eighth of a turn is also what keeps the loop from closing on itself, which at wire thickness
 * would be two rods in the same place.
 */
function legWire(arm, drop, splay) {
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
  // 8 radial segments and drawn as a `part`, not as the plain filled tube the option's own figure
  // uses for its legs. Filled, three loops stacked on one stem merge into a single orange blob —
  // they are the same colour, they overlap in projection, and nothing separates them. As a part
  // each gets its outline, and the 45deg facets clear the 24deg edge threshold the same way
  // `coil()` leans on, so the wire reads as a rod with three turns rather than as a lump.
  const geo = new THREE.TubeGeometry(curve, pts.length * 3, WIRE_R, 8, false);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: HI, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), new THREE.LineBasicMaterial({ color: INK })));
  return g;
}

// A third of a turn between legs, and NO phase on the triad — which is a decision, because the
// obvious tidy-up is to turn it. With three legs and one isometric camera, one of them always
// points nearly along the view axis, and the two ways it can go are not equal: a leg pointing AWAY
// has an arm that projects up the page (odd-looking, but three legs are still visible and countable)
// while a leg pointing AT the reader collapses to a stub behind the socket and the figure is left
// showing two. Turning the triad a quarter turn to balance the back pair was tried, and that is
// exactly what it cost. So: legs on 0/120/240, gaps on 60/180/300 — see the cord for what uses them.
const LEG_PHASE = 0;

/** The three loops stacked on the stem, each turned a third of a turn on from the last. */
function legLoops(g, arm, drop, splay) {
  for (let i = 0; i < 3; i++) {
    const w = legWire(arm, drop, splay);
    w.rotation.y = LEG_PHASE + (i / 3) * Math.PI * 2;
    w.position.y = LOOP_Y - i * 3.4;    // stacked, a wire thickness apart and a little daylight
    g.add(w);
  }
  return LOOP_Y - 2 * 3.4 - WIRE_R;     // where the stack ends = where a tightened nut comes to
}

/**
 * The cord: out of the stem, down, then TURNED out of frame — `lightLegs` turns it for the reason
 * this one does too, that a dark line straight down between three legs is read as a fourth. `az` is
 * the compass bearing it leaves on, and it has to be one of the GAPS between the legs (60, 180 or
 * 300 as `LEG_PHASE` leaves them): out through a leg, the two lines cross and the cord is read as
 * part of the frame. 300 is the gap that projects to the right, where the frame has the room.
 */
function lampCord(g, y0, down, run, az = -Math.PI / 3) {
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

/** (3b) The loops on the stem, nut off — a close-up, so the shell is cropped and the legs are cut. */
function legStack() {
  const g = new THREE.Group();
  g.add(lampHolder(true));
  legLoops(g, 24, 15, 7);               // the legs cut short: this frame is about the stem
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
  const yEnd = legLoops(g, ...LEG);
  const nut = hexNut();
  nut.position.y = yEnd - NUT_H / 2;                   // run up tight under the stack
  g.add(nut);
  lampCord(g, -STEM_H, 24, 28);
  return g;
}

/**
 * ---- Hanging it: one wire, and nothing else ----
 *
 * This started as the ready-made kits' own fitting, and it was too much: a bought cord stopper
 * above the shade, three wires clamped under its nut between two packings, and a hook on each to
 * catch the ring at the opening — a designed joint, three times over, to hold up a paper shade that
 * weighs nothing. What replaced it is ONE wire, flat, with three bends in it:
 *
 * [The U] The middle is bent into a U — NOT a closed loop. Its gap passes the CORD and stops the
 *   SOCKET: the holder hangs in the U by its own cap, and the shade hangs on the wire. That is what
 *   the whole fitting is, and it is why the gap has a size worth stating (a few millimetres wider
 *   than the cord, far narrower than the socket). Open rather than a closed eye, because the cord
 *   is dropped in sideways with the lamp already wired; an eye has to be threaded from the free end
 *   of the cord, and it was drawn that way first.
 * [The arc] The wire is not a flat bar. It ARCS, and it arcs the way the shade's own shoulder does
 *   — HIGHEST in the middle, falling away to the rim at both ends. It was drawn the other way up
 *   first (a hammock, dipping in the middle) and that is a bowl sitting in the opening, not a
 *   hanger spanning it. Before that it was flat, with two posts standing up out of it, which drew
 *   a wire lying ON the ring.
 * [The ends] They are not shaped at all — no hook, no turn: the arch simply keeps going, crossing
 *   the rim at the opening and carrying on out past the ring, UNDER it. That is what holds the
 *   shade up: the ends bear on the underside of the rim and the whole lantern hangs off them. They
 *   are drawn long enough to come out the far side of the hoop, because an end that stops beneath
 *   it is an end the ring hides, and then the figure cannot say where the wire goes. A terminal hook bent to fit the hoop was drawn twice and taken out twice, and so was
 *   an end carried over the TOP of the ring. It is also why nothing here is route-specific: a rim
 *   to catch from underneath is a rim either route has.
 *
 * The U sits off the wire's own line, so the whole wire is shifted by `HANG_OFF` to bring the
 * bottom of that U onto the axis, where the cord is. The arms are then a CHORD rather than a
 * diameter, and how far they reach is `armAt` — a chord half-length, not a
 * radius. Get that wrong and the tips land inside the opening at one design and outside the paper
 * at the next.
 */
const BOWL_W = 4.5, BOWL_Z = 8;      // the U: half its mouth, and how far it reaches from the line
const HANG_OFF = BOWL_Z - CORD_R - WIRE_R;      // ...so the cord rests in the bottom of the U
const ARC_HIGH = 0.42;               // x the opening radius: how far the middle stands above the rim
                                     // (more than this and the arch reads as a peak, not an arc)
const UNDER_RIM = 5;                 // how far past the opening the ends carry on, under the ring
                                     // (the hoop's wall is 2mm, so this clears it and shows)

/** Half-chord: how far along the wire's own line a point at `radius` from the axis sits. */
const armAt = (radius) => Math.sqrt(Math.max(radius * radius - HANG_OFF * HANG_OFF, 1));


/** The hanger: one wire, arcing down from the rim to the U in its middle and back up again. */
function hangWire(radius) {
  const rimX = armAt(radius), endX = armAt(radius + UNDER_RIM);
  const high = radius * ARC_HIGH;
  // The arch, as a parabola: `high` above the rim in the middle, back down through the rim's own
  // level exactly at the opening, and on below and beyond it — the part that runs under the ring
  // and out the other side. The curve steepens as it goes, which is roughly the angle the shade's
  // own shoulder falls away at, so the ends lie along the paper rather than across it. Level at
  // the apex, which is what lets the U lie flat in one plane the way a hand actually bends it.
  const arc = (x) => high * (1 - (x / rimX) ** 2);
  // z is NEGATED, so the U detours TOWARDS the camera. It is a horizontal bend, and a horizontal
  // bend away from an isometric camera projects UP the page: drawn the other way round the U came
  // out as a hump and the wire read as an M. Towards the reader it projects down, and a U is what
  // it looks like. (The cord then passes a couple of millimetres behind the bend, which is the
  // right way round as well — you can see it sitting in there.)
  const v = (x, y, z) => new THREE.Vector3(x, y, -(z + HANG_OFF));
  const bowlY = arc(BOWL_W);
  ARC_APEX_Y = bowlY;
  const pts = [];
  for (const sgn of [1, -1]) {
    const STATIONS = [endX, rimX, rimX * 0.78, rimX * 0.52, rimX * 0.28];
    if (sgn > 0) {                               // up one arm, from the end to the U
      for (const u of STATIONS) pts.push(v(u, arc(u), 0));
      pts.push(v(BOWL_W, bowlY, 0), v(BOWL_W, bowlY, -BOWL_Z * 0.7), v(0, bowlY, -BOWL_Z));
    } else {                                     // out of the U and down the other arm
      pts.push(v(-BOWL_W, bowlY, -BOWL_Z * 0.7), v(-BOWL_W, bowlY, 0));
      for (const u of [...STATIONS].reverse()) pts.push(v(-u, arc(u), 0));
    }
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 6, WIRE_R, 8, false);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: HI, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), new THREE.LineBasicMaterial({ color: INK })));
  // A quarter turn off the camera's own bearing, which lays the arms across the view: along the
  // world axes they run diagonally, and the U — the only thing either figure is about — is then
  // read end-on between two receding arms.
  g.rotation.y = Math.PI / 4;
  return g;
}

// Where the U ends up, in the ring's frame — `hangSet` hangs the socket from it. Set by `hangWire`
// on every call, which is fine because one figure builds one wire and reads it back at once.
let ARC_APEX_Y = 0;

/** The hanger where it goes: the arch over the opening, its ends past the rim. */
function hangPlaced(p, rings = true) {
  const g = new THREE.Group();
  if (rings) {
    const ring = part(ringGeometry(p, true), false);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);                                 // at y = 0, the hoop standing above it
  }
  g.add(hangWire(openingR(p, true)));           // drawn in the ring's own frame: no offset needed
  return g;
}

/** (2a) The wire on its own, bent to shape. */
function hangBend() {
  const g = new THREE.Group();
  g.add(hangWire(19));                           // a middling opening: this figure is the shape
  return g;
}

/**
 * (2b) In place: the ring, the arch over it, and the SOCKET hanging in the U by its cap. That last
 * part is the whole mechanism, so it is drawn rather than described — a bare cord passing through
 * says the wire holds the cord, which is not what holds anything up.
 */
function hangSet(p) {
  const g = hangPlaced(p);
  const socket = pendantSocket({ crop: true });   // the kit card's holder, cut off below its cap
  socket.position.y = ARC_APEX_Y - 34;           // its cap's top (local y = 34) up against the U
  g.add(socket);
  return g;
}

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
  // Pulling it out — see `pullScene`.
  pull: (p, sm) => pullScene(p, sm),
  // Lit — one per way of supplying the lamp; see `litShade` and the scenes under it.
  lightSet: (p, sm) => lightSet(p, sm),
  lightHang: (p, sm) => lightHang(p, sm),
  lightLegs: (p, sm) => lightLegs(p, sm),
  // What you supply yourself — see "THE KIT" above. These are the only scenes that ignore `p`.
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
  // Fixing the lamp — the sub-steps under way (3). Like the kit's, these ignore `p`: what holds a
  // lamp to the paper is hardware you buy, not something the mold decides.
  legBend: () => legBend(),
  legStack: () => legStack(),
  legStood: () => legStood(),
  hangBend: () => hangBend(),
  hangSet: (p) => hangSet(p),
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
    // Fit the frustum to what is actually DRAWN, as projected: every vertex of every mesh and line
    // in the group, through the view matrix. Not to the largest dimension — a rib is long and thin,
    // and sizing by its length leaves the drawing a fifth of the well — and not to the eight corners
    // of the bounding box either, which is what this did first: those bound the projection, but only
    // tightly for a solid that fills its box. An open pair of pliers is a diagonal Y whose box
    // corners are all empty, and it came out at 44% of the frame's width where a shoe brush filled
    // 77%. The frustum is then centred on the drawing rather than on the box, since those two
    // coincide about as often.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const v = new THREE.Vector3(), mv = new THREE.Matrix4();
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      const pos = o.geometry?.attributes?.position;
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
    if (group) group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}

/** Free the renderer and its context — the guide page calls this when it unmounts. */
export function disposeFigures() {
  R?.dispose();
  R = null;
}
