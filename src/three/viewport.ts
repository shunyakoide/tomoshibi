/**
 * ============================================================================
 * THREE.JS VIEWPORT — renderer, lights, materials, orbit input, render loop
 * ============================================================================
 * Everything created ONCE per mount and then only mutated: renderer, post-processing chain, studio
 * lighting, shared materials, camera-orbit input, rAF loop. What gets *drawn* is not here —
 * scenes.ts rebuilds `state.group` when the design or view changes. No React apart from the thin
 * `useViewport` hook at the bottom, and no geometry. The mutable handle (`state`) is deliberately
 * shared by reference: the render loop reads it every frame and the scene builder writes it, so
 * neither has to re-subscribe.
 * ============================================================================
 */
import type React from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { clamp } from "../util.ts";

/**
 * The mutable handle every scene builder writes through. A plain object, so this type is what says
 * which fields exist. `setOrbit`/`setZoomRange` are attached below, once their controls exist.
 */
export type ViewportState = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  poolTex: THREE.CanvasTexture;
  group: THREE.Group;
  bulb: THREE.PointLight;
  /** The contact shadow: a plane with a radial-gradient map, whose opacity the views set. */
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  amb: THREE.AmbientLight;
  key: THREE.DirectionalLight;
  groundGrid: THREE.GridHelper;
  envMap: THREE.Texture;
  litFloorMat: THREE.MeshStandardMaterial;
  litPoolMat: THREE.MeshBasicMaterial;
  ribMat: THREE.MeshPhysicalMaterial;
  komaMat: THREE.MeshStandardMaterial;
  standMat: THREE.MeshStandardMaterial;
  washiMat: THREE.MeshStandardMaterial;
  /** The framing distance the current view chose; the zoom range is a multiple of it. */
  baseDist: number;
  /** Place the camera in the builders' terms. Every field is optional; omitted ones keep their value. */
  setOrbit: (pose: { pitch?: number; yaw?: number; dist?: number; lookY?: number }) => void;
  setZoomRange: (baseDist: number) => void;
};

/**
 * What `useViewport` hands out: a live viewport, or the empty object held when WebGL failed to
 * initialize. The empty case is "every field, absent" rather than `{}` so that `buildScene`'s
 * existing `if (!s.group) return` is what tells the two apart.
 */
type NoViewport = { [K in keyof ViewportState]?: undefined };
export type ViewportHandle = ViewportState | NoViewport;

// Camera-orbit limits; pitch stops short of straight down/up so the model never flips. The low end
// is -1.35 because that is the print view's top-down pose (scenes.ts) — at -1.3 the first drag
// re-clamped it and the plates jumped 2.9°.
const PITCH: [number, number] = [-1.35, 0.4], ZOOM: [number, number] = [0.45, 3];

// The scene builders think in `pitch`: 0 = level with the target, negative = looking down at it;
// OrbitControls thinks in a polar angle from +Y. cos(phi) = -sin(pitch) is that conversion.
const polarOf = (pitch: number) => Math.acos(clamp(-1, 1, -Math.sin(pitch)));

// A CanvasTexture painted with one gradient: the contact shadow, the floor pool of light and the
// lamp body's emission ramp are all exactly that.
function gradientTexture(
  [w, h]: [number, number],
  makeGradient: (ctx: CanvasRenderingContext2D) => CanvasGradient,
  stops: [number, string][],
  srgb?: boolean,
): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  const g = makeGradient(ctx);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Everything that lives for the lifetime of the mount. Throws if WebGL is unavailable (the caller
// shows the reason).
export function createViewport(mount: HTMLElement): { state: ViewportState; dispose: () => void } {
  const scene = new THREE.Scene();
  // Light views leave the canvas transparent so the mount's CSS gradient is the background; the lit
  // view paints its own dark scene.background (LIT_BG in scenes.ts).
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 4000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  mount.appendChild(renderer.domElement);

  // Post-processing: bloom for the lit view only, disabled elsewhere so the CAD-style views look
  // exactly as they would without a composer.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.7); // strength, radius, threshold
  bloomPass.enabled = false;
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // Studio IBL: soft reflections so the parts don't read as flat. Removed in the lit view.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const amb = new THREE.AmbientLight(0xffffff, 0.55);
  const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(240, 380, 280);
  const rim = new THREE.DirectionalLight(0x8890a8, 0.35); rim.position.set(-260, 120, -260);
  const bulb = new THREE.PointLight(0xffc37a, 0, 900, 1.5);
  scene.add(amb, key, rim, bulb);

  // CAD-style ground grid (assembly view only). The distance fades into the bg with fog.
  const groundGrid = new THREE.GridHelper(2400, 48, 0xaab0ba, 0xc7ccd4);
  groundGrid.position.y = 0;
  groundGrid.visible = false;
  scene.add(groundGrid);

  const shadowTex = gradientTexture([128, 128], (c) => c.createRadialGradient(64, 64, 8, 64, 64, 64),
    [[0, "rgba(0,0,0,0.5)"], [1, "rgba(0,0,0,0)"]]);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.5;
  scene.add(shadow);

  // Lit view: a warm pool of light on the floor, dark at the very centre (the body blocks the light
  // directly below it) and bright in a ring around that.
  const poolTex = gradientTexture([256, 256], (c) => c.createRadialGradient(128, 128, 6, 128, 128, 128),
    [[0.0, "rgba(255,190,120,0.10)"], [0.28, "rgba(255,178,105,0.85)"], [1.0, "rgba(255,150,80,0.0)"]], true);
  // Emission ramp for the lamp body: a wide bright plateau at mid-height, so no thin bright line
  // appears at the equator.
  const washiGrad = gradientTexture([4, 256], (c) => c.createLinearGradient(0, 0, 0, 256),
    [[0.0, "#9a6a38"], [0.32, "#ffe4bc"], [0.68, "#ffe4bc"], [1.0, "#9a6a38"]], true);

  const group = new THREE.Group();
  scene.add(group);

  // Complete once the two methods below are attached; their controls do not exist yet.
  const state = {
    scene, camera, renderer, composer, bloomPass, poolTex, group, bulb, shadow, amb, key, groundGrid, envMap,
    // Lit: floor (dark room) and the pool of light
    litFloorMat: new THREE.MeshStandardMaterial({ color: 0x0a0d16, roughness: 1, metalness: 0 }),
    litPoolMat: new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    // Rib: a very thin clearcoat, like a coated filament, for a refined sheen
    ribMat: new THREE.MeshPhysicalMaterial({
      color: 0xc3b291, roughness: 0.5, metalness: 0.0,
      clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.9,
    }),
    // Koma: matte resin. The finish contrast with the ribs makes the parts easy to tell apart
    komaMat: new THREE.MeshStandardMaterial({ color: 0x94897c, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.85 }),
    // Stand: a dark matte finish like fired stoneware
    standMat: new THREE.MeshStandardMaterial({ color: 0x6b6156, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.75 }),
    washiMat: new THREE.MeshStandardMaterial({
      color: 0xf7f3ea, roughness: 0.9, transparent: true, opacity: 0.94,
      emissive: 0xffd0a0, emissiveIntensity: 0, emissiveMap: washiGrad, side: THREE.DoubleSide,
    }),
    baseDist: 700,
  } as ViewportState;

  // ---- Resize ----
  const resize = () => {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);
  // Also follow actual viewport size changes (side-by-side layout switch, panel width, etc.)
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(mount);

  // ---- Orbit / zoom input ----
  // three's OrbitControls rather than a hand-rolled pointer path: mouse, touch and pen through
  // pointer events, pinch from the live pointers, and it cleans up after itself. `touch-action:
  // none` on <body> (index.css) is what lets a touch drag reach it at all.
  const el = renderer.domElement;
  const controls = new OrbitControls(camera, el);
  controls.enablePan = false;              // the model is always centred; panning only loses it
  controls.enableDamping = true;           // the one behavioural gain over the old direct mapping
  controls.dampingFactor = 0.09;
  // polarOf is increasing in pitch, so the limits map across in order.
  controls.minPolarAngle = polarOf(PITCH[0]);   // looking down at the model
  controls.maxPolarAngle = polarOf(PITCH[1]);   // looking slightly up at it
  // Two fingers dolly only, as before: TOUCH.DOLLY_PAN with panning off leaves just the dolly.
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

  // Anything left out keeps its current value, so a view can set its pose and let frame() set the
  // distance and target after.
  state.setOrbit = ({ pitch, yaw, dist, lookY }) => {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (dist != null) sph.radius = dist;
    if (pitch != null) sph.phi = polarOf(pitch);
    if (yaw != null) sph.theta = yaw;
    if (lookY != null) controls.target.set(0, lookY, 0);
    sph.makeSafe();
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
    controls.update();
  };
  // How far the wheel/pinch may travel, as a multiple of the framing distance the view chose.
  state.setZoomRange = (baseDist) => {
    controls.minDistance = baseDist * ZOOM[0];
    controls.maxDistance = baseDist * ZOOM[1];
  };
  state.setOrbit({ pitch: -0.15, yaw: 0.5, dist: state.baseDist, lookY: 120 });
  state.setZoomRange(state.baseDist);

  // ---- Render loop ----
  let raf: number;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    controls.update();   // required every frame while damping is on
    composer.render();
  };
  animate();

  // Everything added above is removed here, controls.dispose() included: a leaked window listener
  // survives a remount (StrictMode does one every dev load) and a drag then rotates twice as far.
  const dispose = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    ro?.disconnect();
    controls.dispose();
    if (el.parentNode === mount) mount.removeChild(el);
    composer.dispose();
    renderer.dispose();
  };

  return { state, dispose };
}

/**
 * Mount the viewport into a <div> and hand back [mountRef, stateRef].
 * `stateRef.current` stays `{}` when WebGL is unavailable — scenes.ts checks for `.group` — and the
 * reason is reported through onError so the UI can keep working (STL export needs no WebGL).
 */
export function useViewport(
  onError: (message: string) => void,
): [React.RefObject<HTMLDivElement | null>, React.RefObject<ViewportHandle>] {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ViewportHandle>({});
  useEffect(() => {
    let dispose: (() => void) | undefined;
    try {
      const vp = createViewport(mountRef.current!);
      stateRef.current = vp.state;
      dispose = vp.dispose;
    } catch (e) {
      // WebGL init failed (old device / no context): keep the UI rather than blacking out the
      // screen, and report the cause.
      onError((e as Error)?.message || String(e));
    }
    return () => dispose?.();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- mount once; onError is a stable setState
  return [mountRef, stateRef];
}
