import * as THREE from "three";

// The isometric direction every figure is drawn from. Shared, not camera-local, because the washi
// panels are PLACED against it — which bays are pasted, and the yaw, depend on it (`washiYaw`).
export const VIEW_DIR = new THREE.Vector3(1, 0.85, 1).normalize();
// The view direction inside the mold's OWN frame once it is lying in the stand. The group is turned
// a quarter turn about Z there, so world (x,y,z) reads as local (y,-x,z).
export const DIR_ON_STAND = new THREE.Vector3(VIEW_DIR.y, -VIEW_DIR.x, VIEW_DIR.z);
// VIEW_DIR for a solid turned upside down (a half turn about x), needed by everything in such a
// solid that draws a silhouette.
export const DIR_UPSIDE_DOWN = new THREE.Vector3(VIEW_DIR.x, -VIEW_DIR.y, -VIEW_DIR.z);

export const INK = 0x33302b;        // edge lines: a shade off the UI's ink (#3b342b), and not pure black
export const PAPER = 0xffffff;      // faces: opaque white, so edges behind them are hidden
export const HI = 0xd4622a;         // the part this step adds (a shade off the app's accent, #D95B18)
export const HI_FACE = 0xfae3d6;
export const CORD_INK = 0x5c574f;   // lamp flex: dark, but the ink family rather than black
// The lit lantern's warm fill. Here rather than in lit.ts because the MOLD draws it too: the drying
// figure puts a lit shade on the mold, so leaving it in the lit section made the two import each other.
export const LIT_FACE = 0xf9d9a3;   // the lit view's warm emissive, as a flat fill

export const CORD_R = 1.6;          // mm — a lamp cord, thin enough to draw as a line, not a pipe
export const WIRE_R = 1.3;          // mm — the leg/hanger wire (`LOOP_R`, the loop bent in its end,
                                    // is the fitting's business and lives with it)

/** A part: white faces + its outline. `hot` draws it as the piece being added. */
export function part(geo: THREE.BufferGeometry, hot: boolean): THREE.Group {
  const g = new THREE.Group();
  // polygonOffset pushes the face back so its own outline, drawn on the same surface, does not
  // z-fight it. Every face material here carries it.
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: hot ? HI_FACE : PAPER, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  })));
  // 24° is load-bearing at BOTH ends: high enough that a curved edge's facets do not each draw a
  // line (lower turns the rib's outer edge into a hatched band), low enough to keep a groove's
  // flanks — and low enough that `coil`'s and `legWire`'s 45° facets DO draw. Here and `wireTube`
  // only; changing it re-draws every figure in the guide.
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), new THREE.LineBasicMaterial({ color: hot ? HI : INK })));
  return g;
}

/** A kit object: `part()`'s own white face + outline, reused so a kit item looks like a part. */
export const solid = (geo: THREE.BufferGeometry) => part(geo, false);

/** Loose ink strokes: a flat [x,y,z, x,y,z, …] of segment endpoints. Every drawn fact in this
 * section that is not a solid — bristle, silhouette, knurl — is one of these. */
export function inkLines(pts: number[]): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: INK }));
}

/**
 * A fringe of bristle strokes off a block's front-bottom edge — the one thing a flat white solid
 * cannot say for itself. `n` strands evenly from `xMin` to `xMax`, hanging `len` down at `y`/`z`.
 */
export function bristleFringe(xMin: number, xMax: number, y: number, z: number, len: number, n: number) {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = xMin + ((xMax - xMin) * i) / (n - 1);
    pts.push(x, y, z, x, y - len, z);
  }
  return inkLines(pts);
}

/**
 * The two straight lines standing in for a tall round volume's side wall: where the curve runs
 * tangent to the eye, top rim to bottom (radii may differ — a tapered tub). `view` is `VIEW_DIR` in
 * the solid's own frame — a group turned a quarter turn about Z reads `(y,-x,z)` = `DIR_ON_STAND`.
 */
export function silhouetteLines(rTop: number, rBot: number, yTop: number, yBot: number, view = VIEW_DIR, cx = 0, cz = 0) {
  const az = Math.atan2(view.z, view.x);
  const pts: number[] = [];
  for (const a of [az + Math.PI / 2, az - Math.PI / 2]) {
    const ct = Math.cos(a), st = Math.sin(a);
    pts.push(cx + rTop * ct, yTop, cz + rTop * st, cx + rBot * ct, yBot, cz + rBot * st);
  }
  return inkLines(pts);
}

/**
 * The same for a SPHERE: its outline is a circle of the same radius in the plane the camera looks
 * straight down. A ball's facets are far under the 24° threshold, so it draws nothing white on
 * white — hence an explicit outline, and not more facets.
 */
export function silhouetteCircle(r: number, cx: number, cy: number, cz: number, view = VIEW_DIR, n = 64) {
  const a = new THREE.Vector3().crossVectors(view, new THREE.Vector3(0, 1, 0)).normalize();
  const b = new THREE.Vector3().crossVectors(view, a).normalize();
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    for (const k of [i, i + 1]) {
      const th = ((k % n) / n) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      pts.push(cx + r * (a.x * c + b.x * sn), cy + r * (a.y * c + b.y * sn), cz + r * (a.z * c + b.z * sn));
    }
  }
  return inkLines(pts);
}

/**
 * A round segment standing on `yBot`: the white solid AND the two wall lines that make it read, from
 * one height. Every tall round volume in the kit and the fitting is a stack of these.
 *
 * It takes the BOTTOM rather than the centre because that is the bug it exists to stop: written out,
 * a cylinder is positioned by its centre and its silhouette given its top and bottom — the same
 * height twice, in two forms, with nothing to catch a pair that drift apart.
 */
export function drum(
  rTop: number, rBot: number, h: number, yBot: number,
  { seg = 32, view = VIEW_DIR }: { seg?: number; view?: THREE.Vector3 } = {},
): THREE.Group {
  const g = new THREE.Group();
  const m = solid(new THREE.CylinderGeometry(rTop, rBot, h, seg));
  m.position.y = yBot + h / 2;
  g.add(m, silhouetteLines(rTop, rBot, yBot + h, yBot, view));
  return g;
}

/**
 * A length of lamp flex, lying along +y for the caller to place. Dark rather than white: a 3mm white
 * tube draws nothing at all, which is why the cord is `CORD_INK` and not a `part()`.
 */
export const cordTube = (len: number) => new THREE.Mesh(
  new THREE.CylinderGeometry(CORD_R, CORD_R, len, 12),
  new THREE.MeshBasicMaterial({ color: CORD_INK }),
);

/** A helix that opens out as it climbs — a coil of rod, which is how both bamboo and wire are sold. */
class CoilCurve extends THREE.Curve<THREE.Vector3> {
  constructor(readonly r0: number, readonly dr: number, readonly turns: number, readonly rise: number) { super(); }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * this.turns * Math.PI * 2;
    const r = this.r0 + this.dr * t;
    return target.set(r * Math.cos(a), this.rise * (t - 0.5), r * Math.sin(a));
  }
}
// 8 radial segments, not a round tube's usual 16+: an OPEN tube has no flat cap to anchor a rim
// edge, so white-on-white it would draw only its two cut ends. At 45° the facets clear the 24°
// edge threshold and the coil reads as a wound, faceted rod.
export const coil = (rod: number, r0: number, dr: number, turns: number, rise: number) => solid(
  new THREE.TubeGeometry(new CoilCurve(r0, dr, turns, rise), Math.ceil(turns * 48), rod, 8, false));

/** The wire's own material, shared by every bend in this group: a filled accent rod with its own
 * outline over 8 facets (see `legWire` for why the facet count matters where turns overlap). */
export function wireTube(pts: THREE.Vector3[], { seg = 3, closed = false, rod = WIRE_R }: { seg?: number; closed?: boolean; rod?: number } = {}) {
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), pts.length * seg, rod, 8, closed);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: HI, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), new THREE.LineBasicMaterial({ color: INK })));
  return g;
}
