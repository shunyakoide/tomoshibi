/**
 * Way (3)'s fitting: the stem, the nut, the three leg wires and the frame — see the banner below,
 * which is this file's real header. Nothing here takes a `Design`: like the kit, it is drawn from
 * proportions, because none of it is a part the app makes.
 */
import * as THREE from "three";
import { WIRE_R, cordTube, drum, solid, wireTube } from "./ink.ts";
import { BULB_FOOT, SOCKET_H, SOCKET_R, ledBulb } from "./kit-lamps.ts";

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
export const STEM_R = 5.5, STEM_H = 28;      // the threaded stem the cord leaves by, and the nut runs on
export const NUT_R = 9.5, NUT_H = 6;         // across the corners: a hex draws its own edges, unlike a tube
export const LOOP_R = 8.6;                   // the loop bent in the leg wire end (WIRE_R: ink.ts)

// Where the stack of loops starts — far down the stem for the drawing's sake, not the fitting's: the
// shell is ⌀34 and the loops ⌀20, so higher up they hide under it (the view looks down) and the arms
// come out of thin air. A real one takes them anywhere.
export const LOOP_Y = -14;

// One leg's shape — arm out, drop, and how far the foot lands outside the arm. The wire figure and
// the assembled one draw the same leg; only the close-up cuts it short.
export const LEG = [50, 76, 26] as const;

/** The holder, mouth up, with its stem and thread. `crop` cuts the shell short for the close-up. */
export function lampHolder(crop: boolean) {
  const g = new THREE.Group();
  const h = crop ? SOCKET_H * 0.55 : SOCKET_H;
  g.add(drum(SOCKET_R, SOCKET_R, h, 0));
  g.add(drum(STEM_R, STEM_R, STEM_H, -STEM_H, { seg: 24 }));
  // The thread, as raised rings — `ledBulb`'s cap, for the same reason: a smooth white cylinder says
  // nothing, and this one has to read as something a nut runs on.
  for (let y = -STEM_H + 1.6; y < -2; y += 2.6) {
    g.add(drum(STEM_R + 0.5, STEM_R + 0.5, 1.2, y - 0.6, { seg: 24 }));
  }
  return g;
}

/** The fixing nut: a hex prism with the stem's bore through it — without the bore it is a plug. */
export function hexNut() {
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
export function legWire(arm: number, drop: number, splay: number) {
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
  // `wireTube`'s defaults ARE this wire: three curve segments per point, WIRE_R, and 8 radial
  // segments — faceted enough to draw its own outline, since smooth, three loops on one stem merge
  // into one orange blob. The 45° facets clear the 24° threshold, as `coil()` does.
  return wireTube(pts);
}

// A third of a turn between legs, and NO phase on the triad. With three legs and one isometric camera
// one always points nearly along the view axis: AWAY it projects up the page and all three stay
// countable, AT the reader it collapses to a stub behind the socket — which turning the triad cost.
// So legs on 0/120/240, gaps on 60/180/300; see the cord for what uses them.
export const LEG_PHASE = 0;

// FOUR eyes, not three: the frame's goes on with the legs', under the same nut. Placed last and
// lowest, its arms being the only ones that rise and would climb through the legs' loops.
export const STACK_GAP = 3.4;                  // between eyes: a wire thickness and a little daylight
export const stackEnd = (n: number) => LOOP_Y - (n - 1) * STACK_GAP - WIRE_R;   // where a tightened nut comes to

/** The three loops stacked on the stem, each turned a third of a turn on from the last. */
export function legLoops(g: THREE.Group, arm: number, drop: number, splay: number) {
  for (let i = 0; i < 3; i++) {
    const w = legWire(arm, drop, splay);
    w.rotation.y = LEG_PHASE + (i / 3) * Math.PI * 2;
    w.position.y = LOOP_Y - i * STACK_GAP;
    g.add(w);
  }
  return stackEnd(3);
}

/** The frame's eye, added to the bottom of that stack, with its arms cropped at `top`. */
export function frameOnStem(g: THREE.Group, top: number) {
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
export function lampCord(g: THREE.Group, y0: number, down: number, run: number, az = -Math.PI / 3) {
  const drop = cordTube(down);
  drop.position.y = y0 - down / 2;
  g.add(drop);
  if (!run) return;
  const out = cordTube(run);
  out.rotation.z = -Math.PI / 2;                       // stand it along +x, then swing it round
  out.rotation.y = -az;
  out.position.set((run / 2) * Math.cos(az), y0 - down, (run / 2) * Math.sin(az));
  g.add(out);
}

/** (3a) The wire on its own, bent to shape. One of the three: they are all the same shape. */
export function legBend() {
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
export const FRAME_W = 44, FRAME_H = 150;     // half-width at the belly, and overall height

// One side, foot to shoulder: up and OUT off the eye, clear of the lamp, then in again at the top.
export const frameSide = (sx: number, y0: number, W: number, H: number) => [
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
export function frameEye(y0: number) {
  const pts = [];
  const N = 30;
  for (let i = 1; i < N; i++) {
    const a = Math.PI - (i / N) * Math.PI * 2;
    pts.push(new THREE.Vector3(LOOP_R * Math.cos(a), y0 - (i / N) * 2 * y0, LOOP_R * Math.sin(a)));
  }
  return pts;
}

export function frameWire(W = FRAME_W, H = FRAME_H) {
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
export const FRAME_YAW = Math.PI / 4;

/** (3b') The frame on its own, bent to shape. */
export function frameBend() {
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
export function frameFoot(top: number) {
  const side = (sx: number, y0: number) => frameSide(sx, y0, FRAME_W, FRAME_H).filter((v) => v.y <= top);
  const pts = [...side(-1, 0.9).reverse(), ...frameEye(0.9), ...side(1, -0.9)];
  const g = new THREE.Group();
  const w = wireTube(pts);
  w.rotation.y = FRAME_YAW;
  g.add(w);
  return g;
}

/** (3b) The loops on the stem, nut off — a close-up, so the shell is cropped and the legs are cut. */
export function legStack() {
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
export function legStood() {
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
