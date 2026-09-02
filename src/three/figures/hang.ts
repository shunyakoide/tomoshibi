import * as THREE from "three";
import type { Design } from "../../types.ts";
import { openingR, ringGeometry } from "../../geometry.ts";
import { CORD_R, WIRE_R, part, wireTube } from "./ink.ts";
import { pendantSocket } from "./kit-lamps.ts";

/**
 * Hanging a finished lantern is ONE wire with three bends, and nothing else.
 *
 * [The U] The middle is a U, NOT a closed loop: its gap passes the CORD and stops the SOCKET, so the
 *   holder hangs in the U by its own cap. Open rather than an eye, because the cord drops in sideways
 *   with the lamp already wired.
 * [The arc] HIGHEST in the middle, falling to the rim; the other way up is a hammock, not an arch.
 * [The ends] Not shaped: the arch crosses the rim and carries on past the ring, UNDER it, which is
 *   what holds the shade up. Long enough to come out the far side, an end stopping beneath the hoop
 *   being hidden by it. Not route-specific — either route has a rim to catch.
 *
 * The U sits off the wire's own line, so the whole wire is shifted by `HANG_OFF` to bring its bottom
 * onto the cord's axis. The arms are then a CHORD, and `armAt` is a chord half-length, not a radius.
 */
const BOWL_W = 4.5, BOWL_Z = 8;      // the U: half its mouth, and how far it reaches from the line
const HANG_OFF = BOWL_Z - CORD_R - WIRE_R;      // ...so the cord rests in the bottom of the U
const ARC_HIGH = 0.42;               // x the opening radius: how far the middle stands above the rim
                                     // (more than this and the arch reads as a peak, not an arc)
const UNDER_RIM = 5;                 // how far past the opening the ends carry on, under the ring
                                     // (the hoop's wall is 2mm, so this clears it and shows)

/** Half-chord: how far along the wire's own line a point at `radius` from the axis sits. */
const armAt = (radius: number) => Math.sqrt(Math.max(radius * radius - HANG_OFF * HANG_OFF, 1));

/**
 * Where the U ends up, in the ring's frame — the apex of the arch, which is what `hangSet` hangs the
 * socket from. The arch is a parabola through the rim, so the apex follows from the radius alone and
 * nothing has to be BUILT to ask where it is.
 */
export const arcApexY = (radius: number) => radius * ARC_HIGH * (1 - (BOWL_W / armAt(radius)) ** 2);

/** The hanger: one wire, arcing down from the rim to the U in its middle and back up again. */
export function hangWire(radius: number) {
  const rimX = armAt(radius), endX = armAt(radius + UNDER_RIM);
  const high = radius * ARC_HIGH;
  // The arch, as a parabola: `high` above the rim in the middle, back through the rim's own level
  // exactly at the opening, and on below and beyond it — the part running under the ring and out the
  // far side. It steepens roughly at the shade's shoulder angle; level at the apex, so the U lies flat.
  const arc = (x: number) => high * (1 - (x / rimX) ** 2);
  // z is NEGATED, so the U detours TOWARDS the camera: a horizontal bend away from an isometric
  // camera projects UP the page, and drawn that way the wire read as an M.
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, -(z + HANG_OFF));
  const bowlY = arc(BOWL_W);           // = arcApexY(radius), by construction
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
  // Six segments per station rather than `wireTube`'s three: this wire's bends are tighter than a
  // leg's, and the U is the whole point of the drawing.
  const g = wireTube(pts, { seg: 6 });
  // A quarter turn off the camera's bearing, which lays the arms across the view: on the world axes
  // they run diagonally and the U — the point of both figures — is read end-on.
  g.rotation.y = Math.PI / 4;
  return g;
}

/** The hanger where it goes: the arch over the opening, its ends past the rim. */
export function hangPlaced(p: Design, rings = true): THREE.Group {
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
export function hangBend() {
  const g = new THREE.Group();
  g.add(hangWire(19));                           // a middling opening: this figure is the shape
  return g;
}

/**
 * (2b) In place: the ring, the arch over it, and the SOCKET hanging in the U by its cap — the whole
 * mechanism, so it is drawn rather than described. A bare cord through the U holds nothing up.
 */
export function hangSet(p: Design): THREE.Group {
  const g = hangPlaced(p);
  const socket = pendantSocket({ crop: true });   // the kit card's holder, cut off below its cap
  socket.position.y = arcApexY(openingR(p, true)) - 34;   // its cap top (local y = 34) up against the U
  g.add(socket);
  return g;
}
