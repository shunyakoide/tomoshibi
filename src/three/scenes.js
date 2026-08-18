/**
 * ============================================================================
 * SCENE BUILDERS — what each view draws
 * ============================================================================
 * `buildScene(state, opts)` empties the viewport's group and refills it for the current view. One
 * builder per view:
 *   mold  … the assembled mold lying in its stand, CAD-style, on a ground grid
 *   print … the parts laid flat on print plates, arranged as the slicer would see them
 *   lit   … the finished lantern glowing in a dark room (no mold at all)
 * ("2d" draws no 3D: the section view is an SVG editor rendered over this canvas.)
 *
 * Every shape comes from geometry.js — nothing here computes a dimension of its own, or the preview
 * and the STL would drift apart. The print layout is the one thing that touches geometry: it
 * rotates each part in the bed plane for the preview only, which is why the export builds its own.
 * ============================================================================
 */
import * as THREE from "three";
import {
  maxRadius, outerR, cutT, standBoardLength, grooveR, grooveList, higoSpiralPath,
  ribGeometry, komaGeometry, standGeometry, boardGeometry,
  standCollarTop, standSaddleH, standSlotSep, ringGeometry,
} from "../geometry.js";
import { fitOnBed } from "../bed.js";

// Dark-room background for the lit view. Painted as a real scene background rather than left to the
// mount's CSS gradient: since three r170 the alpha channel survives UnrealBloomPass, and bloom runs
// in the lit view alone — so the canvas turned transparent there and the gradient showed through,
// meeting the fogged floor in a hard horizon seam. Same colour as the lit fog, so floor and sky meet
// invisibly.
const LIT_BG = new THREE.Color(0x070a11);

const GAP = 8;   // spacing between parts on a print plate (mm)

// Frame the camera so a cylinder of the given height/radius fills the view, and look at its centre.
function frame(s, contentH, contentR, centerY) {
  const cam = s.camera;
  const fovV = (cam.fov * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * cam.aspect);
  s.baseDist = Math.max((contentH / 2) / Math.tan(fovV / 2), contentR / Math.tan(fovH / 2)) * 1.45;
  cam.far = Math.max(4000, s.baseDist * 3);
  cam.updateProjectionMatrix();
  s.zoom = 1;
  s.lookY = centerY;
}

// The mold itself: N ribs radiating from the axis, plus the two identical koma at each end.
function moldGroup(p, s) {
  const mold = new THREE.Group();
  for (let k = 0; k < p.boards; k++) {
    const mesh = new THREE.Mesh(ribGeometry(p, k), s.ribMat);
    mesh.rotation.y = (k / p.boards) * Math.PI * 2;
    mold.add(mesh);
  }
  // The koma are identical top and bottom — same geometry, placed at the two ends.
  const kb = new THREE.Mesh(komaGeometry(p), s.komaMat);
  kb.rotation.x = -Math.PI / 2; kb.position.y = -p.tabLen;
  const kt = new THREE.Mesh(komaGeometry(p), s.komaMat);
  kt.rotation.x = Math.PI / 2; kt.position.y = p.height + p.tabLen;
  mold.add(kb, kt);
  return mold;
}

// ---- lit: the finished lantern, no mold ----
function buildLit(s, p, viewChanged) {
  const legH = p.height * 0.42;                 // three legs (1AY style)
  // The neck carries no bamboo and no washi, so it isn't part of the skin: draw the lamp body only
  // and leave the openings open.
  const cB = cutT(p), t0 = cB, t1 = 1 - cB;
  const pts = [];
  const N = 160;                                // fine vertical sampling keeps the silhouette smooth
  for (let i = 0; i <= N; i++) {
    const t = t0 + (t1 - t0) * (i / N);
    pts.push(new THREE.Vector2(outerR(p, t) + p.higoD, legH + t * p.height));
  }
  s.group.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 128), s.washiMat));

  // Bamboo ribs. In reality the washi goes over them, so they sit inside the paper: centring the
  // ring on outerR puts its outer surface at outerR + higoD/2, inside the skin at outerR + higoD,
  // which also stops the two surfaces from Z-fighting into a dashed flicker. A fairly strong warm
  // emissive keeps them from crushing to black in backlight, so they read as translucent bamboo.
  const higoMat = new THREE.MeshStandardMaterial({
    color: 0xc2a266, roughness: 0.75, metalness: 0, emissive: 0x936026, emissiveIntensity: 0.7,
  });
  if (p.spiral) {
    // Spiral winding: one continuous descending helix, from the same path the grooves use.
    const path = higoSpiralPath(p);
    if (path.length > 1) {
      const v = path.map(([a, y, r]) => new THREE.Vector3(r * Math.cos(a), legH + y, r * Math.sin(a)));
      const curve = new THREE.CatmullRomCurve3(v);
      s.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, v.length * 2, p.higoD / 2, 8, false), higoMat));
    }
  } else {
    for (const gy of grooveList(p, grooveR(p))) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(outerR(p, gy / p.height), p.higoD / 2, 10, 96), higoMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = legH + gy;
      s.group.add(ring);
    }
  }

  // Legs: splayed from the bottom rim (= the lower opening) to the floor. Graphite, so they keep
  // their black-iron look instead of sinking into the dark background.
  const legMat = new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.4, metalness: 0.3 });
  const rimR = outerR(p, t0) + p.higoD, rimY = legH + t0 * p.height;   // matches the skin's bottom rim exactly
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 1.8, 14, 96), legMat);
  rim.rotation.x = Math.PI / 2; rim.position.y = rimY;
  s.group.add(rim);
  // The feet land further out than the root: a tripod spreading from the opening, not tapering in.
  const r0 = rimR, r1 = rimR + legH * 0.35;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const topP = new THREE.Vector3(r0 * Math.cos(a), rimY, r0 * Math.sin(a));
    const botP = new THREE.Vector3(r1 * Math.cos(a), 2, r1 * Math.sin(a));
    const dir = new THREE.Vector3().subVectors(botP, topP);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, dir.length(), 12), legMat);
    leg.position.copy(topP).addScaledVector(dir, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const foot = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), legMat);
    foot.position.copy(botP);
    s.group.add(leg, foot);
  }

  // Floor (dark room) + the warm pool the lamp casts on it.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), s.litFloorMat);
  floor.rotation.x = -Math.PI / 2;
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), s.litPoolMat);
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.4;
  const pr = maxRadius(p) * 7;
  pool.scale.set(pr, pr, 1);
  s.group.add(floor, pool);

  // Present it as self-emitting: minimal external light, and let emissive + bloom do the glowing.
  // No internal bulb — it produces a bright band at the equator; the emissive ramp does the shading.
  s.amb.intensity = 0.12;
  s.key.intensity = 0.25; s.key.position.set(180, 320, 200);
  s.washiMat.roughness = 1.0;          // fully matte (no specular highlights)
  s.washiMat.emissiveIntensity = 1.15;
  s.bloomPass.enabled = true;
  s.bloomPass.strength = 0.6; s.bloomPass.radius = 0.7; s.bloomPass.threshold = 0.85;  // soft halo
  // Only on a view switch: start from the side, near eye level. Otherwise it inherits the previous
  // view's angle (print looks straight down) and opens looking at the lamp from above.
  if (viewChanged) { s.rot.x = -0.08; s.rot.y = 0.5; }
  frame(s, (legH + p.height) * 1.16, maxRadius(p) * 1.1, (legH + p.height) * 0.5);
}

// ---- mold: the working pose, lying in the stand ----
function buildMold(s, p, viewChanged) {
  const R = maxRadius(p);
  const collarTop = standCollarTop();          // top face of the collar = where the posts start
  const komaY = collarTop + standSaddleH(p);   // koma centre = saddle centre height
  const sep = standSlotSep(p);                 // koma centre spacing = post spacing
  // Lay the mold on its side (axis along X) so the koma centres land at X=±sep/2, Y=komaY.
  const mold = moldGroup(p, s);
  mold.rotation.z = Math.PI / 2;
  mold.position.set(p.height / 2, komaY, 0);
  s.group.add(mold);

  const board = new THREE.Mesh(boardGeometry(p), s.standMat);
  board.rotation.x = -Math.PI / 2;             // flat on the floor, collar facing up
  s.group.add(board);
  for (const sgn of [-1, 1]) {
    const col = new THREE.Mesh(standGeometry(p), s.standMat);
    col.rotation.y = Math.PI / 2;              // board-thickness direction along the mold axis (X)
    col.position.set((sgn * sep) / 2, collarTop, 0);
    s.group.add(col);
  }
  s.shadow.scale.set(R * 3.2, R * 3.2, 1);
  if (viewChanged) { s.rot.x = -0.12; s.rot.y = 0.32; }   // from the side, along the mold axis
  const top = komaY + R;
  frame(s, top * 1.2, Math.max(standBoardLength(p) / 2, R) * 1.25, top * 0.5);
}

// Pack parts of one kind onto plates: a grid of equal cells sized by the largest part, centred on
// the bed, spilling onto further plates once a plate is full. Returns the next free plate index.
function packPlates(items, plateIdx, placed, bedW, bedD) {
  if (!items.length) return plateIdx;
  // Orient each part in the bed plane first, at the same best-fit angle the overflow warning uses —
  // axis-aligned when that fits, otherwise tilted (≈45° on a square bed). rotateZ turns the part
  // within its own XY = the bed plane; the extruded Z thickness is untouched.
  let mW = 0, mD = 0;
  for (const pt of items) {
    pt.geo.computeBoundingBox();
    const b = pt.geo.boundingBox;
    const { angle } = fitOnBed([b.max.x - b.min.x, b.max.y - b.min.y], bedW, bedD);
    if (angle) { pt.geo.rotateZ((angle * Math.PI) / 180); pt.geo.computeBoundingBox(); }
    pt.bb = pt.geo.boundingBox;
    mW = Math.max(mW, pt.bb.max.x - pt.bb.min.x);
    mD = Math.max(mD, pt.bb.max.y - pt.bb.min.y);
  }
  const cW = mW + GAP, cD = mD + GAP;
  const cols = Math.max(1, Math.floor((bedW - GAP) / cW));
  const rows = Math.max(1, Math.floor((bedD - GAP) / cD));
  const per = cols * rows;
  items.forEach((pt, i) => {
    const w = pt.bb.max.x - pt.bb.min.x, d = pt.bb.max.y - pt.bb.min.y;
    const onPlate = Math.min(per, items.length - Math.floor(i / per) * per);   // parts on this plate
    const uc = Math.min(cols, onPlate), ur = Math.ceil(onPlate / cols);        // columns/rows actually used
    const gridW = uc * cW - GAP, gridD = ur * cD - GAP;
    const ox0 = Math.max(2, (bedW - gridW) / 2), oz0 = Math.max(2, (bedD - gridD) / 2);   // centre on the bed
    placed.push({
      ...pt,
      plate: plateIdx + Math.floor(i / per),
      ox: ox0 + ((i % per) % cols) * cW + (mW - w) / 2,
      oz: oz0 + Math.floor((i % per) / cols) * cD + (mD - d) / 2,
    });
  });
  return plateIdx + Math.ceil(items.length / per);
}

// ---- print: every part laid flat on plates ----
function buildPrint(s, p, { printRibs, bedW, bedD }) {
  // With spiral winding every rib has different groove positions, so all of them must be printed.
  // Otherwise the ribs are identical and the user prints one and duplicates it.
  const nRibs = p.spiral ? p.boards : Math.min(printRibs, p.boards);
  const ribs = [];
  for (let k = 0; k < nRibs; k++) ribs.push({ geo: ribGeometry(p, k), mat: s.ribMat });
  // Koma and posts are identical top/bottom, so one of each is enough (duplicated in the slicer).
  // The base plate's length follows the body height, so it gets its own plate — that keeps the post
  // placement fixed. Each group is packed separately, matching how the STLs are exported.
  const groups = [
    ribs,
    [{ geo: komaGeometry(p), mat: s.komaMat }],
    [{ geo: standGeometry(p), mat: s.standMat }],
    [{ geo: boardGeometry(p), mat: s.standMat }],
    // Opening rings: rigid rings set into the finished lantern's openings. One each.
    [{ geo: ringGeometry(p, false), mat: s.komaMat }, { geo: ringGeometry(p, true), mat: s.komaMat }],
  ];
  const placed = [];
  let plates = 0;
  for (const g of groups) plates = packPlates(g, plates, placed, bedW, bedD);

  const pCols = Math.ceil(Math.sqrt(plates));
  const pRows = Math.ceil(plates / pCols);
  const platePos = (pl) => [(pl % pCols) * (bedW + 40), Math.floor(pl / pCols) * (bedD + 40)];
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x1e1e23, roughness: 0.9 });
  const gridDivs = Math.max(2, Math.round(bedW / 32));   // ≈32mm cells
  for (let pl = 0; pl < plates; pl++) {
    const [px, pz] = platePos(pl);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(bedW, 2, bedD), plateMat);
    plate.position.set(px + bedW / 2, -1, pz + bedD / 2);
    const grid = new THREE.GridHelper(bedW, gridDivs, 0x3f3f46, 0x2c2c31);
    grid.scale.z = bedD / bedW;                          // stretch the depth to match a rectangular bed
    grid.position.set(px + bedW / 2, 0.15, pz + bedD / 2);
    s.group.add(plate, grid);
  }
  for (const pt of placed) {
    const [px, pz] = platePos(pt.plate);
    const m = new THREE.Mesh(pt.geo, pt.mat);
    m.rotation.x = -Math.PI / 2;
    // With rotation.x = -90°, local z → world y. Lift so the part's bottom z edge rests on the plate
    // (the posts are centred on z, so a fixed 0.6 would sink half the thickness in).
    m.position.set(px + pt.ox - pt.bb.min.x, 0.6 - pt.bb.min.z, pz + pt.oz + pt.bb.max.y);
    s.group.add(m);
  }

  const totalW = pCols * (bedW + 40) - 40, totalD = pRows * (bedD + 40) - 40;
  for (const m of s.group.children) { m.position.x -= totalW / 2; m.position.z -= totalD / 2; }
  const span = Math.max(totalW, totalD) + 50;
  s.rot.x = -1.35;                                       // straight down at the plates
  s.rot.y = 0;
  frame(s, span * 0.95, span / 2, 0);
}

/**
 * Rebuild the viewport contents for the current design and view.
 * `s` is the handle from createViewport(); a no-op if WebGL failed to initialize.
 */
export function buildScene(s, { p, view, viewChanged, printRibs, bedW, bedD }) {
  if (!s.group) return;
  while (s.group.children.length) {
    const m = s.group.children[0];
    s.group.remove(m);
    m.traverse((o) => o.geometry && o.geometry.dispose());
  }
  if (view === "2d") return;   // the section view is an SVG editor drawn over this canvas

  const R = maxRadius(p);
  const lightVP = view !== "lit";   // assembly/print are CAD-style bright; only lit is dark
  s.shadow.scale.set(R * 3.2, R * 3.2, 1);
  s.shadow.visible = view === "mold";   // contact shadow in the assembly view only (lit grounds via floor + pool)
  s.shadow.material.opacity = 0.3;
  s.groundGrid.visible = view === "mold";
  // Ambient light only in the light views; the lit view wants just the lamp glowing in a dark room.
  s.scene.environment = lightVP ? s.envMap : null;
  s.scene.background = lightVP ? null : LIT_BG;   // light views stay transparent over the CSS gradient
  s.scene.fog = view === "print" ? null : new THREE.Fog(lightVP ? 0xbfb5a3 : 0x070a11, 1000, 2400);
  // IBL provides the fill, so ambient stays modest; the key brings out the form's shading and lifts
  // it off the background (contrast without blowing out).
  s.amb.intensity = view === "print" ? 0.5 : lightVP ? 0.3 : 0.5;
  s.key.intensity = view === "print" ? 0.85 : lightVP ? 1.1 : 0.85;
  s.key.position.set(view === "print" ? 80 : 240, view === "print" ? 500 : 380, view === "print" ? 120 : 280);
  s.bulb.intensity = 0;
  s.washiMat.emissiveIntensity = 0;
  s.bloomPass.enabled = false;   // the lit builder turns it back on

  if (view === "lit") buildLit(s, p, viewChanged);
  else if (view === "mold") buildMold(s, p, viewChanged);
  else buildPrint(s, p, { printRibs, bedW, bedD });
}
