import * as THREE from "three";
import type { Design } from "../../types.ts";
import { fukuroRange, maxRadius, openingR, ringLegs } from "../../geometry.ts";
import { LIT_FACE, cordTube, part, wireTube } from "./ink.ts";
import { moldPieces } from "./mold.ts";
import { BULB_FOOT, SOCKET_H, SOCKET_R, ledBulb } from "./kit-lamps.ts";
import { FRAME_YAW, LOOP_R, LOOP_Y, STACK_GAP, STEM_H, frameWire, lampCord, lampHolder } from "./fitting.ts";
import { hangPlaced } from "./hang.ts";

export const LAMP_INK = 0x8f949c;       // the lamp's own body: a grey, light enough not to out-weigh the ink

/** The lantern itself, at its own coordinates: shade, the bamboo in it, and the rings in its mouths. */
export function litShade(p: Design, smooth: boolean, opacity = 1): THREE.Group {
  return moldPieces(p, {
    // Both routes: the finished lantern has a hoop at each mouth either way — printed on one,
    // bent from wire on the other, which `moldPieces` picks by the same `smooth`.
    ribs: false, komaBot: false, komaTop: false, smooth, rings: true, higo: true, washi: "lit",
    washiOpacity: opacity,
  });
}

/**
 * (2) Hung from a pendant cord, on the AXIS and in by the TOP opening whichever mouth is wider — a
 * hanging shade has an up, and it is the design's own. It dips `CORD_DIP` below the rim to meet the
 * opening and runs `CORD_UP` of the body height above, cut off at the top: "this continues".
 */
export const CORD_DIP = 6;              // mm below the opening rim, so the cord meets the ring
export const CORD_UP = 0.42;            // x body height above the shade
export function lightHang(p: Design, smooth: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(litShade(p, smooth));
  const yTop = fukuroRange(p).hi * p.height;       // the top opening = where the cord goes in
  const len = p.height * CORD_UP + CORD_DIP;
  const cord = cordTube(len);
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
export const LAMP_FIT = 0.62;           // x the bottom opening radius: it has to pass through the mouth
export const LAMP_MAX = 38;             // mm — beyond this it is a floor lamp, not something you cover
export const LAMP_LIFT = 0.48;          // x body height: the exploded gap above the lamp
export function lightSet(p: Design, smooth: boolean): THREE.Group {
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

export const LEG_DROP = 0.42;           // x body height, and the splay is 0.35 of that: the lit view's own
export const LIT_THRU = 0.45;           // how much of the shade you see through, in this one figure

/**
 * (3) Stood on legs: the socket fixed UP into the bottom mouth and the cord leaving DOWNWARDS
 * between them — what makes this (3) and not (2) inverted. The legs root in the bottom ring's
 * SOCKETS: `ringLegs` gives the pad centres and returns null with the sockets off or the opening too
 * small, and the guide then drops the option. Not route-dependent.
 *
 * The shade is translucent here and nowhere else, this being the one figure explaining a fitting
 * entirely INSIDE the lantern (socket, legs, frame): opaque, it shows a shade with legs under it.
 * Nothing here is a new object — `lampHolder`, `ledBulb` and the same `frameSide`, sized to this
 * lantern.
 */
export function lightLegs(p: Design, smooth: boolean): THREE.Group {
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
  const yB = y0 - STEM_H, dropLen = drop * 0.62;
  // -45° is (1, 0, -1)/√2 — straight right on screen, which is where this frame has the room.
  lampCord(g, yB, dropLen, maxRadius(p) * 1.3, -Math.PI / 4);
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
