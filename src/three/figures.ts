import type { Design } from "../types.ts";
import * as THREE from "three";
import { boardGeometry, komaGeometry, ringGeometry, standGeometry, wireRingGeometry } from "../geometry.ts";
import { DIR_ON_STAND, VIEW_DIR, coil, part } from "./figures/ink.ts";
import {
  pasteBrush, pasteTub, pliers, razorBlade, smoothBrush, sprayBottle, tapeAndThread, washiStack,
} from "./figures/kit-tools.ts";
import { lamps } from "./figures/kit-lamps.ts";
import { moldOnStand, moldPieces, pullScene, ribGeo, standPieces } from "./figures/mold.ts";
import { lightHang, lightLegs, lightSet } from "./figures/lit.ts";
import { frameBend, legBend, legStack, legStood } from "./figures/fitting.ts";
import { hangBend, hangSet } from "./figures/hang.ts";

let R: THREE.WebGLRenderer | null = null;
function renderer(): THREE.WebGLRenderer {
  if (R) return R;
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1);        // the canvas is already drawn at 2x and shown at half (see figureImage)
  return R;
}

/** One figure. `sm` is the route: cardboard cuts a smooth edge and no windows (see `ribGeo`). */
type Scene = (p: Design, sm: boolean) => THREE.Group;

const SCENES: Record<string, Scene> = {
  // Parts, one at a time, for the parts list.
  rib: (p, sm) => part(ribGeo(p, 0, sm), false),
  koma: (p) => part(komaGeometry(p), false),
  column: (p) => part(standGeometry(p), false),
  base: (p) => part(boardGeometry(p), false),
  // `sm` is the route, and here it decides what the part IS: cardboard bends its hoops from wire
  // against the template's line, so drawing the printed ring — leg-socket pads and all — would show
  // a part that route never makes.
  ringBottom: (p, sm) => part(sm ? wireRingGeometry(p, false) : ringGeometry(p, false), false),
  ringTop: (p, sm) => part(sm ? wireRingGeometry(p, true) : ringGeometry(p, true), false),
  // Steps.
  stand: (p) => standPieces(p, "column"),
  ribsIn: (p, sm) => moldPieces(p, { komaTop: false, hot: "oneRib", smooth: sm }),
  komaOn: (p, sm) => moldPieces(p, { hot: "komaTop", smooth: sm }),
  // Nothing is highlighted: the mold was assembled four steps ago and the stand one step ago, so
  // colouring either would say "this is new" about a part that is not.
  onStand: (p, sm) => moldOnStand(p, null, sm),
  // The rings go on the ASSEMBLED MOLD, right after the second koma: the washi's cover allowance is
  // folded over them, and they stay in the lantern when the mold comes out — hence the mold here, not
  // the finished shade. The bands ride along from here, muted.
  rings: (p, sm) => moldPieces(p, { smooth: sm, rings: true, hot: "rings", band: true }),
  // Winding: the mold as the last three steps left it, bamboo on, standing upright; the stand comes
  // out one step later, for the pasting. `smooth` is the cardboard route, which has no band advice
  // (its koma holds by friction) — but it DOES have a ring step now, so the rings ride along here on
  // both routes.
  higo: (p, sm) => moldPieces(p, { smooth: sm, rings: true, band: !sm, higo: true, hot: "higo" }),
  // Pasting: the mold where the reader left it — IN THE STAND, which is what the stand is for. The
  // cardboard route has no stand, so there it stands on its koma; that is also why the panels are
  // placed per orientation rather than once (see `washiPieces`).
  washi: (p, sm) => (sm
    ? moldPieces(p, { smooth: true, higo: true, washi: VIEW_DIR })
    : moldOnStand(p, null, false, DIR_ON_STAND)),
  // Drying: every bay pasted, and OFF the stand, nothing turning while it dries. What is left of the
  // mold to see is what sticks out past the paper (necks, tabs, both koma).
  dry: (p, sm) => moldPieces(p, { smooth: sm, rings: true, band: !sm, higo: true, washi: "all" }),
  pull: (p, sm) => pullScene(p, sm),
  lightSet: (p, sm) => lightSet(p, sm),
  lightHang: (p, sm) => lightHang(p, sm),
  lightLegs: (p, sm) => lightLegs(p, sm),
  // What you supply yourself.
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
  // Fixing the lamp — the sub-steps under way (3).
  legBend: () => legBend(),
  frameBend: () => frameBend(),
  legStack: () => legStack(),
  legStood: () => legStood(),
  hangBend: () => hangBend(),
  hangSet: (p, sm) => hangSet(p, sm),
};

/** The isometric camera for `group`, framed to what it draws. Shared by the still and the motion, so a
 * figure that starts moving does not move its frame — which is also why a moving figure's still is
 * framed to hold the part where the motion starts, not only where it ends. */
function fit(group: THREE.Group, width: number, height: number, p: Design, id: string): THREE.OrthographicCamera {
  // Isometric: the standard 3/4 from above-right, which shows a flat part's face and its thickness
  // at once.
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3());
  const reach = box.getSize(new THREE.Vector3()).length();
  const aspect = width / height;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, reach * 6);
  cam.position.copy(c).addScaledVector(VIEW_DIR, reach * 2);
  cam.lookAt(c);
  cam.updateMatrixWorld();
  // Fit the frustum to what is actually DRAWN, as projected — not to the bounding box, whose
  // corners are all empty for a diagonal shape.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const v = new THREE.Vector3(), mv = new THREE.Matrix4();
  const measure = () => {
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      const pos = (o as THREE.Mesh).geometry?.attributes?.position as THREE.BufferAttribute | undefined;
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
  };
  measure();
  const moving = movingParts(group, p, id);
  if (moving.length) {
    pose(moving, 0);
    measure();
    pose(moving, 1);
    group.updateMatrixWorld(true);
  }
  if (!(maxX > minX)) { minX = -1; maxX = 1; minY = -1; maxY = 1; }   // nothing drawn: don't divide by 0
  const half = Math.max((maxY - minY) / 2, (maxX - minX) / 2 / aspect, 1) * 1.06;  // 6%: the lines' own width
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  cam.top = midY + half; cam.bottom = midY - half;
  cam.right = midX + half * aspect; cam.left = midX - half * aspect;
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * Render one figure to a PNG data URL, or null if it cannot be drawn (no WebGL, unknown id). Drawn
 * at 2x and shown at 1x, so the thin edge lines survive a high-density screen and printing.
 */
export function figureImage(p: Design, id: string, { width = 620, height = 460, smooth = false } = {}): string | null {
  const make = SCENES[id];
  if (!make) return null;
  let group = null, kept = false;
  try {
    const gl = renderer();
    gl.setSize(width * 2, height * 2, false);
    const scene = new THREE.Scene();
    group = make(p, smooth);
    scene.add(group);

    const cam = fit(group, width, height, p, id);

    gl.setClearAlpha(0);
    gl.render(scene, cam);
    const png = gl.domElement.toDataURL("image/png");
    // A moving figure keeps its scene for `playFigure`: building it again there cost a ~100ms stall
    // on every figure scrolled to.
    if (moves(id)) {
      LIVE.set(liveKey(id, smooth), { scene, cam, width, height, moving: movingParts(group, p, id),
        timing: MOTIONS[id] === "reveal" ? REVEAL : SLIDE });
      kept = true;
    }
    return png;
  } catch {
    return null;        // a figure is an illustration: losing one must not take the page down
  } finally {
    // The geometries are built per call (they follow the design), so they go back per call — unless
    // a moving figure kept them.
    if (group && !kept) dispose(group);
  }
}

function dispose(group: THREE.Object3D) {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    // A LineSegments and a Mesh both land here, and neither is ever given an array of materials.
    (m.material as THREE.Material | undefined)?.dispose();
  });
}

/**
 * Where each moving figure's moving part starts, as an offset from where the still draws it, in its
 * parent's frame. The still is the END of the move, so the motion begins on exactly the PNG. The
 * part is the one the still highlights (`part()`'s `userData.moves`), or one a scene marks itself.
 */
const MOTIONS: Record<string, ((o: THREE.Object3D, p: Design) => THREE.Vector3) | "reveal"> = {
  // Every travel below is drawn room in the still too (see `fit`), so each is as short as reads.
  ribsIn: (_, p) => new THREE.Vector3(0, p.height * 0.35, 0),       // down into the koma's slot
  komaOn: (_, p) => new THREE.Vector3(0, p.height * 0.25, 0),
  // Each hoop comes on over its own end of the mold.
  rings: (o, p) => new THREE.Vector3(0, Math.sign(o.position.y - p.height / 2) * p.height * 0.2, 0),
  stand: (o) => new THREE.Vector3(0, sizeOf(o).y * 0.5, 0),         // the posts down into their slots
  onStand: (o) => new THREE.Vector3(0, sizeOf(o).y * 0.4, 0),       // the mold down onto the saddles
  // Only the last stretch of the pull: from its seat, the rib's far end showed through the far
  // opening and the move crossed the whole frame.
  pull: (o) => new THREE.Vector3(0, -o.position.y * 0.55, 0),
  // Nothing travels: the rings appear one by one from the bottom (`reveal`).
  higo: "reveal",
};
export const moves = (id: string) => id in MOTIONS;
const sizeOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());

// Seconds: rest (the still), going away, held away, coming back. It starts at rest so the swap from
// the PNG is invisible, and comes back the way it went rather than jumping.
type Timing = { hold: number; out: number; away: number; in: number };
const SLIDE: Timing = { hold: 1.6, out: 0.9, away: 0.4, in: 1.2 };
// A ring at a time reads only slowly; going away is just a clear-out before it.
const REVEAL: Timing = { hold: 1.6, out: 0.6, away: 0.4, in: 3.2 };
// A figure scrolled away mid-move eases home at this time constant (s) instead of snapping there.
const SETTLE = 0.18;
const ease = (x: number) => x * x * (3 - 2 * x);
function restAt(s: number, t: Timing): number {        // 1 at rest, 0 fully away
  const u = s % (t.hold + t.out + t.away + t.in);
  if (u < t.hold) return 1;
  if (u < t.hold + t.out) return 1 - ease((u - t.hold) / t.out);
  if (u < t.hold + t.out + t.away) return 0;
  return ease((u - t.hold - t.out - t.away) / t.in);
}

/** Each entry poses one moving thing at `k` (1 = the still, 0 = where the motion starts). */
/** `back` is the move on its way back to the still; a slide does not care which way it goes. */
type Moving = ((k: number, back: boolean) => void)[];
// How much of the reveal one ring's fade takes; the rest is the stagger between rings.
const REVEAL_W = 0.35;
type Live = { scene: THREE.Scene; cam: THREE.OrthographicCamera; width: number; height: number; moving: Moving; timing: Timing };

/** The parts figure `id` moves; none for a figure without a motion. */
function movingParts(group: THREE.Group, p: Design, id: string): Moving {
  const m = MOTIONS[id], out: Moving = [];
  if (m === "reveal") group.traverse((o) => {
    if (!o.userData.reveal) return;
    // Top first: the reader's eye starts at the top of the figure.
    const kids = [...o.children].sort((a, b) => b.position.y - a.position.y);
    kids.forEach((c, i) => {
      const mat = (c as THREE.Mesh).material as THREE.Material;
      const from = kids.length > 1 ? (i / (kids.length - 1)) * (1 - REVEAL_W) : 0;
      // Gone all together, then back one ring at a time: staggering both ways read as a wipe.
      out.push((k, back) => {
        const a = back ? Math.min(1, Math.max(0, (k - from) / REVEAL_W)) : k;
        // Opaque again at rest, so the still and the last frame are the same picture.
        if (mat.transparent !== a < 1) { mat.transparent = a < 1; mat.needsUpdate = true; }
        mat.opacity = a;
        c.visible = a > 0;
      });
    });
  });
  else if (m) group.traverse((o) => {
    if (!o.userData.moves) return;
    const rest = o.position.clone(), away = m(o, p);
    out.push((k) => o.position.copy(rest).addScaledVector(away, 1 - k));
  });
  return out;
}
const pose = (moving: Moving, k: number, back = true) => { for (const set of moving) set(k, back); };
/** Whether a loop at `s` seconds is on its way back to the still. */
const comingBack = (s: number, t: Timing) => s % (t.hold + t.out + t.away + t.in) >= t.hold + t.out + t.away;
// The moving figures' scenes, kept by `figureImage` for the session, like the PNGs it returns.
const LIVE = new Map<string, Live>();
const liveKey = (id: string, smooth: boolean) => `${id}|${smooth}`;

/**
 * A figure on screen. `t0` clocks its loop; `leaving` means it was scrolled away and is easing home,
 * after which its canvas goes and the still (the same picture) is what shows. `again` is a figure
 * scrolled back to while still leaving: it loops from rest once home rather than jumping.
 */
// The first rest is cut short: a figure scrolled to should move almost at once. The full hold is
// between loops, where it lets the still be read.
const FIRST_HOLD = 0.25;
const startClock = (now: number, t: Timing) => now - (t.hold - FIRST_HOLD) * 1000;
type Player = { l: Live; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; t0: number; k: number; back: boolean; leaving: boolean; again: boolean };
const PLAYING = new Map<HTMLElement, Player>();
// ONE renderer, off the page, draws every playing figure and each copies it onto its own 2D canvas:
// a figure easing home and the next one starting can be on screen together, on a single context.
let LR: THREE.WebGLRenderer | null = null;
let raf = 0, lastNow = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  for (const [host, pl] of PLAYING) {
    const k = pl.leaving
      ? (1 - pl.k < 0.002 ? 1 : 1 - (1 - pl.k) * Math.exp(-dt / SETTLE))
      : restAt((now - pl.t0) / 1000, pl.l.timing);
    // Leaving keeps the way it was going, so a half-cleared figure fades home as it was.
    if (!pl.leaving) pl.back = comingBack((now - pl.t0) / 1000, pl.l.timing);
    if (k !== pl.k) { pl.k = k; draw(pl); }
    if (pl.leaving && k === 1) {
      if (pl.again) { pl.leaving = pl.again = false; pl.t0 = startClock(now, pl.l.timing); }
      else { pl.canvas.remove(); PLAYING.delete(host); }
    }
  }
  raf = PLAYING.size ? requestAnimationFrame(frame) : 0;
}

function draw(pl: Player) {
  const gl = LR!, { l } = pl;
  if (gl.domElement.width !== l.width * 2 || gl.domElement.height !== l.height * 2) gl.setSize(l.width * 2, l.height * 2, false);
  pose(l.moving, pl.k, pl.back);
  gl.render(l.scene, l.cam);
  pl.ctx.drawImage(gl.domElement, 0, 0);    // same task as the render, so the buffer is still there
  pose(l.moving, 1);
}

/**
 * Play figure `id` over its still, inside `host`, until the returned stop is called; then it eases
 * back to the still and goes. A frame is drawn only while the pose changes. No-op where motion is
 * unwanted, or the figure has none or has no still yet.
 */
export function playFigure(id: string, smooth: boolean, host: HTMLElement): () => void {
  const l = LIVE.get(liveKey(id, smooth));
  if (!l || matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  let pl = PLAYING.get(host);
  if (pl) pl.again = true;
  else {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    try {
      LR ??= new THREE.WebGLRenderer({ antialias: true });
      LR.setPixelRatio(1);
      // Opaque white, the step well's own ground, so the still under it never shows through.
      LR.setClearColor(0xffffff, 1);
    } catch {
      return () => {};      // the still stays; motion is a nicety
    }
    if (!ctx) return () => {};
    canvas.width = l.width * 2;
    canvas.height = l.height * 2;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain";
    pl = { l, canvas, ctx, t0: startClock(performance.now(), l.timing), k: 1, back: false, leaving: false, again: false };
    draw(pl);
    host.appendChild(canvas);
    PLAYING.set(host, pl);
  }
  if (!raf) { lastNow = performance.now(); raf = requestAnimationFrame(frame); }
  const mine = pl;
  return () => { mine.leaving = true; mine.again = false; };
}

/** Free the renderers and their contexts — the guide page calls this when it unmounts. */
export function disposeFigures() {
  cancelAnimationFrame(raf);
  raf = 0;
  for (const pl of PLAYING.values()) pl.canvas.remove();
  PLAYING.clear();
  // LIVE stays: the guide's PNG cache outlives the page, so a return visit never re-runs
  // `figureImage` to refill it. Its GPU buffers went with the renderer and re-upload on the next one.
  R?.dispose();
  R = null;
  LR?.dispose();
  LR = null;
}
