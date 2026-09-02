/**
 * ============================================================================
 * THE KIT — the figures that are not this design
 * ============================================================================
 * Everything in mold.ts and lit.ts is `p` made visible; these are not. Paste, tape and a brush are
 * things you buy, so they are constants and their dimensions are PROPORTIONS, not measurements —
 * from a real one's standard size where there is one: a 糊刷毛 is ~130mm wide with 30mm of bristle,
 * a shoe brush ~160x45 with 20mm. They are drawn exactly like a printed part (white face, `part()`'s
 * outline).
 *
 * They stay SMOOTH (low-poly faceting was tried and reverted): unlike the mold's parts, whose curves
 * lie IN the camera-facing face, a tall round volume's side wall draws nothing — so it gets
 * `silhouetteLines`, a brush gets `bristleFringe()`, and only `coil()` still leans on facets.
 *
 * The tools are here; the lamps a reader has to supply are in kit-lamps.ts, which is split out only
 * because lit.ts, fitting.ts and hang.ts all draw the socket and the bulb and none of them wants a
 * spray bottle. Nothing in either file takes a `Design`.
 * ============================================================================
 */
import * as THREE from "three";
import { DIR_ON_STAND, bristleFringe, inkLines, silhouetteLines, solid } from "./ink.ts";

/** A tub with its lid on: starch paste. (Wood glue comes in a bottle; the tub is the first-named.) */
export function pasteTub() {
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
export function rollGeo(rOut: number, rIn: number, h: number) {
  const s = new THREE.Shape().absarc(0, 0, rOut, 0, Math.PI * 2, false);
  s.holes.push(new THREE.Path().absarc(0, 0, rIn, 0, Math.PI * 2, true));
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);              // extruded along +z; stand it up
  geo.translate(0, -h / 2, 0);
  return geo;
}

/**
 * Tape and thread in one figure: they are one line on the list, so they are one drawing. Side by side
 * ACROSS the view (`(1,0,-1)` projects horizontally) and overlapping — the frame is fitted to its
 * contents, so any gap is drawn at the cost of both. The reel is TIPPED OVER and set in front, clear
 * of the roll in plan; only the projection overlaps.
 */
export function tapeAndThread() {
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
  // The spool is laid on its side below (rotation.z), so its own local view is (y,-x,z) — the same
  // quarter turn away DIR_ON_STAND is for the mold in its stand.
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

/** N points evenly around a circle — the same construction ring.ts's own `circlePts` uses for a
 * hole in a Shape (a cap-plane curve, smooth at any resolution — see "THE KIT" above). */
export function circlePts(r: number, n: number, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
}

/**
 * The paste brush, shaped like a real 糊刷毛 rather than a trapezoid. The ferrule is a separate solid,
 * so it keeps its own outline the way a real seam would.
 */
export function pasteBrush() {
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
  // The ferrule's own bottom-front edge, exactly (depth 14, so half = 7).
  g.add(bristleFringe(-62, 62, -7, 7, 28, 13));
  return g;
}

/** A rectangle with round ends — the plan of a shoe brush. */
export function stadium(len: number, wid: number) {
  const r = wid / 2, x = len / 2 - r;
  const s = new THREE.Shape();
  s.absarc(x, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.absarc(-x, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  s.closePath();
  return s;
}

/** The brush for laying the paper down: a shoe brush, bristles over its whole underside. */
export function smoothBrush() {
  const g = new THREE.Group();
  const body = new THREE.ExtrudeGeometry(stadium(160, 46), { depth: 20, bevelEnabled: false, curveSegments: 16 });
  body.rotateX(-Math.PI / 2);             // spans y 0..20
  g.add(solid(body));
  const br = new THREE.ExtrudeGeometry(stadium(150, 38), { depth: 18, bevelEnabled: false, curveSegments: 16 });
  br.rotateX(-Math.PI / 2);
  br.translate(0, -18, 0);                // spans y -18..0
  g.add(solid(br));
  // The pad's bottom-front edge, exactly. `x = -56..56` is the STRAIGHT run between the rounded ends
  // (stadium(150, 38): half-width 19, arcs at ±(150/2 - 19) = ±56), where the front face is at a
  // constant z = 19; past ±56 it curves in and a straight fringe would run ahead of the block.
  g.add(bristleFringe(-56, 56, -18, 19, 8, 11));
  return g;
}

/**
 * One arm, in the PIVOT's own frame: pivot at the origin, jaw out to x = -95, handle to x ≈ +123 —
 * pivot-relative, so the arms open by rotating each about z and the linkage comes out right. This is
 * the jaw-above-axis arm; the other is it mirrored in y. The gripping face is the near-flat run along
 * y ~ 0.3, so at zero rotation the jaws are shut.
 */
export const PLIER_ARM = [
  [-95, 2.4], [-77, 3.8], [-55, 5.8], [-33, 8.4], [-15, 11.2], [-3, 14.5],  // jaw, back edge
  [9, 13], [19, 6], [25, -2],                                               // the neck, past the head
  [45, -14], [70, -27], [95, -40], [112, -49],                              // handle, outer edge
  [122, -55], [123, -64], [113, -69], [102, -65],                           // the handle's rounded end
  [88, -57], [68, -45], [46, -32], [30, -21], [20, -12],                    // handle, inner edge
  [13, -6], [5, -4],                                                        // back under the head
  [-3, 0.4], [-25, 0.35], [-50, 0.3], [-75, 0.3], [-95, 0.3],               // the gripping face
];
// Half the jaw opening. Pliers are drawn OPEN: shut, the two gripping faces coincide and the pair
// reads as one flat tapered blade. The gap is the tool.
export const PLIER_OPEN = (10 * Math.PI) / 180;
/**
 * Marks, drawn the way `bristleFringe` draws bristles: short lines on a face a line-art solid has
 * nothing else to show on. Ticks serrate the jaw partway along (a real long-nose's teeth sit back
 * from the point); one line marks the rubber grip's start. `z` is the front face.
 */
export function plierMarks(sign: number, z: number) {
  const pts = [];
  for (const x of [-72, -60, -48, -36]) pts.push(x, sign * 0.6, z, x, sign * 3.6, z);
  pts.push(45, sign * -14, z, 45, sign * -32, z);
  return inkLines(pts);
}

export function pliers() {
  const g = new THREE.Group();
  const arm = (sign: number, z: number) => {
    const a = new THREE.Group();
    const s = new THREE.Shape(PLIER_ARM.map(([x, y]) => new THREE.Vector2(x, sign * y)));
    const geo = new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: false });
    geo.translate(0, 0, z);
    a.add(solid(geo), plierMarks(sign, z + 5));
    a.rotation.z = -sign * PLIER_OPEN;      // jaw up, handle down — and mirrored for the other arm
    return a;
  };
  g.add(arm(1, -5.2), arm(-1, 0.2));
  // The head. A real plier laps both arms to half thickness through the joint and what shows is one
  // lens, so it is one disc spanning the full thickness. Its rim circles are cap-plane curves and
  // draw at any resolution, so it needs no silhouette lines.
  const head = new THREE.CylinderGeometry(14, 14, 10.4, 32);
  head.rotateX(Math.PI / 2);
  g.add(solid(head));
  const pin = new THREE.CylinderGeometry(3.5, 3.5, 11.6, 16);
  pin.rotateX(Math.PI / 2);
  g.add(solid(pin));
  return g;
}

/**
 * The razor: a 長柄カミソリ — a flat handle with a guarded blade in its head, which is what a lantern
 * gets trimmed with (not a bare double-edge blade). The shape is all outline; the comb teeth across
 * the guard rail are `bristleFringe`'s kind of INK stroke, and they say which end cuts.
 */
export const RAZOR_L = 180, RAZOR_HW = 11, RAZOR_GW = 8.5, RAZOR_T = 5;
export function razorBlade() {
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

/**
 * The washi: four sheets fanned a few degrees off each other — squared up they are one white block.
 * The sheets are 1.4mm thick, which no washi is, because a real thickness has no side to draw.
 */
export function washiStack() {
  const g = new THREE.Group();
  // yaw, dx, dz, bottom sheet first — irregular, since even spacing reads as a fan laid out on
  // purpose. The TOP sheet is the square one: it is the only one drawn whole, so anything it does
  // not cover has to read as a corner.
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
 * A trigger sprayer — the plant-mister kind. Three facts must survive white-on-white: it is a bottle,
 * its head screws on, and you work it with a trigger, which reaches PAST the nozzle as a real one
 * does. Proportions are a 500ml sprayer's (⌀70, ~175 tall), not measurements — see "THE KIT" above.
 */
export const SPRAY_R = 35;              // bottle radius: ⌀70, a 500ml sprayer
export function sprayBottle() {
  const g = new THREE.Group();
  // The bottle, bottom up. Each segment gets its own pair of tangent lines: a smooth wall draws
  // nothing by itself, and three rim circles in a column is not a bottle.
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
  // The trigger: pivoted under the head and HANGING, since at the nozzle's own angle the sprayer read
  // as having two spouts. It leaves the head steeply, then swings forward.
  const ts = new THREE.Shape([[15, 1], [29, 1], [56, -50], [46, -56]]
    .map(([x, y]) => new THREE.Vector2(x, y)));
  const tg = new THREE.ExtrudeGeometry(ts, { depth: 12, bevelEnabled: false });
  tg.translate(0, 0, -6);
  head.add(solid(tg));
  head.position.y = 142;                 // clear of the collar, so a sliver of it still shows
  g.add(head);
  return g;
}
