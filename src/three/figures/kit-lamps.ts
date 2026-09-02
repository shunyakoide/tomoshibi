/**
 * ============================================================================
 * THE KIT — the lamp, which the app does not make either
 * ============================================================================
 * The other half of "THE KIT" (see kit-tools.ts for the rule these are all drawn by: proportions
 * from a real one, never measurements, and a white face with its own outline). These live apart from
 * the tools because they are the only kit figures anything else draws: `lit.ts` puts `ledBulb` and
 * the holder inside the lantern, `fitting.ts` builds the stem figures around the same shell, and
 * `hang.ts` hangs `pendantSocket` in the U of its wire. A tube of paste has no such second life.
 *
 * `SOCKET_R`/`SOCKET_H` are the shell's two numbers, and they are shared for that reason: the kit
 * card draws the holder cord-grip up and the fitting figures stand it the other way up, and it has
 * to be the same object both times.
 * ============================================================================
 */
import * as THREE from "three";
import {
  DIR_UPSIDE_DOWN, VIEW_DIR, cordTube, drum, silhouetteCircle, solid,
} from "./ink.ts";

// The holder's shell. Two figures draw it — the kit card's lamp hanging cord-grip up, and the fitting
// figures at the foot of this file standing the other way up. Same object, so the same two numbers.
export const SOCKET_R = 17, SOCKET_H = 34;

/**
 * The pendant lamp holder — what ways (2) and (3) hang the lamp from; NOT a card of its own, being
 * drawn with a bulb in it as one lamp (`pendantLamp`, on `lamps()`'s card). Cord up and CUT OFF at
 * the top, `lightHang`'s convention, and CORD_INK — a 3mm white tube draws nothing at all.
 */
export function pendantSocket({ crop = false } = {}) {
  const g = new THREE.Group();
  // Short, because the frame is fitted to what is in it: every millimetre of cord costs the socket.
  const cordLen = 26;
  const cord = cordTube(cordLen);
  cord.position.y = 34 + cordLen / 2;
  g.add(cord);
  g.add(drum(8, 13, 12, 22));                                        // the cord grip
  // `crop` cuts the shell short and leaves the skirt with it: where this shows the socket hanging in
  // the hanger's U by its cap, a whole ⌀34 socket in a ⌀38 opening hides the ring.
  const bodyH = crop ? 16 : SOCKET_H, bodyTop = 22;
  g.add(drum(SOCKET_R, SOCKET_R, bodyH, bodyTop - bodyH));           // the shell
  if (crop) return g;
  // The skirt around the mouth the bulb screws into, only just wider than the shell: the view looks
  // DOWN, so a ring drawn at the mouth is invisible (an annulus was tried). More overhang and the
  // socket reads as a pot on a saucer.
  g.add(drum(18.5, 18.5, 5, -17));
  return g;
}

/**
 * The bulb: a smooth sphere with a `silhouetteCircle` outline, plus a threaded cap so it does not
 * read as a doorknob. `view` is VIEW_DIR in whatever frame the bulb stands in — every line here is a
 * silhouette, so upside down without it the globe draws as an ellipse across the glass.
 */
export const BULB_FOOT = 25;            // mm below the origin: where the cap ends, so it can be stood up
export function ledBulb(view = VIEW_DIR) {
  const g = new THREE.Group();
  const globe = solid(new THREE.SphereGeometry(30, 32, 16));
  globe.position.y = 34;
  g.add(globe, silhouetteCircle(30, 0, 34, 0, view));
  g.add(drum(26, 14, 28, -1, { view }));                            // globe down to the cap
  g.add(drum(14, 12.5, 24, -25, { view }));
  for (const y of [-6, -12, -18]) g.add(drum(15, 15, 2.4, y - 1.2, { view }));   // the thread
  return g;
}

/**
 * The other kind of lamp: the flat USB puck. Two discs rather than one cylinder — the seam is what
 * makes it a fitting — and the lead ends in a PLUG, since a USB light comes with its cable. Its
 * aspect is real (KAPPLAKE is ⌀35x10, so 3.5:1); its SIZE is not — at true scale beside a bulb it
 * would be a dot in a 300px well.
 */
export const PUCK_R = 38, PUCK_FOOT_H = 7, PUCK_LENS_H = 15;    // 76 across, 22 high = the real 3.5:1
export function puckLight() {
  const g = new THREE.Group();
  g.add(drum(PUCK_R - 4, PUCK_R - 6, PUCK_FOOT_H, 0, { seg: 48 }));
  // Straight-sided, and wider than the foot, so the overhang is one clean step: tapering it as well
  // (the real lens is slightly domed) put a bulge at its foot and read as two stacked bowls.
  g.add(drum(PUCK_R, PUCK_R, PUCK_LENS_H, PUCK_FOOT_H, { seg: 48 }));
  const port = solid(new THREE.BoxGeometry(13, 7, 16));
  port.position.set(-PUCK_R + 4, 5.5, 0);
  g.add(port);
  const lead = 34;
  const cord = cordTube(lead);
  cord.rotation.z = Math.PI / 2;                         // out of the port, along -x
  cord.position.set(-PUCK_R - 3 - lead / 2, 5.5, 0);
  g.add(cord);
  const plug = solid(new THREE.BoxGeometry(15, 6, 11));  // USB-A
  plug.position.set(-PUCK_R - 3 - lead - 7, 5.5, 0);
  g.add(plug);
  return g;
}

/** The holder with a bulb screwed into it: one lamp, hanging, rather than two things to buy. */
export function pendantLamp() {
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
 * BOTH lamps on one card, as tape and thread share one: the three lighting ways want different
 * fittings, so the card says what the light has to BE. Laid out by `tapeAndThread`'s rule.
 */
export function lamps() {
  const g = new THREE.Group();
  const across = new THREE.Vector3(1, 0, -1).normalize();
  const back = new THREE.Vector3(1, 0, 1).normalize();
  const hang = pendantLamp();
  // Lifted so the glass ends just above the floor the puck stands on: they share no ground line, but
  // the eye still wants them to end level.
  hang.position.copy(across).multiplyScalar(-52).setY(62);
  g.add(hang);
  const puck = puckLight();
  // Turned so its lead runs AWAY from the lamp: built pointing -x, it projects straight at the glass
  // and the plug read as something stuck to it.
  puck.rotation.y = Math.PI;
  puck.position.copy(across).multiplyScalar(44).addScaledVector(back, 26);
  g.add(puck);
  return g;
}
