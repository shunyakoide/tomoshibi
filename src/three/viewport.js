/**
 * ============================================================================
 * THREE.JS VIEWPORT — renderer, lights, materials, orbit input, render loop
 * ============================================================================
 * Everything that is created ONCE per mount and then only mutated: the renderer and its
 * post-processing chain, the studio lighting, the shared materials, the camera-orbit input, and
 * the requestAnimationFrame loop. What gets *drawn* is not here — scenes.js rebuilds the contents
 * of `state.group` whenever the design or the view changes.
 *
 * Split out of HarigataStudio so the React component holds state and composition only. There is no
 * React in this file apart from the thin `useViewport` hook at the bottom, and no geometry: the
 * mold's shape comes from geometry.js by way of scenes.js.
 *
 * The mutable handle (`state`) is deliberately a plain object shared by reference — the render loop
 * reads it every frame and the scene builder writes it, so neither has to re-subscribe to anything.
 * ============================================================================
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { clamp } from "../util.js";

// Camera-orbit limits. Pitch stops short of straight down/up so the model never flips.
// The low end is -1.35 because that is the print view's top-down pose (scenes.js). It used to be
// -1.3, which the print view then overshot by writing rot.x directly: the first drag re-clamped it
// and the plates visibly jumped 2.9 degrees before they moved. One limit, no overshoot.
const PITCH = [-1.35, 0.4], ZOOM = [0.45, 3];

// The scene builders think in `pitch`: 0 = level with the target, negative = looking down at it.
// OrbitControls thinks in a polar angle measured from +Y. The old render loop placed the camera at
// y = target.y - dist*sin(pitch), so cos(phi) = -sin(pitch) — this is that same relation, and it is
// what keeps every stored pose meaning exactly what it did before.
const polarOf = (pitch) => Math.acos(clamp(-1, 1, -Math.sin(pitch)));

// A CanvasTexture painted with a single gradient. Three of the viewport's textures are exactly
// that — the contact shadow, the floor pool of light, and the lamp body's emission ramp.
function gradientTexture([w, h], makeGradient, stops, srgb) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  const g = makeGradient(ctx);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Build the renderer and everything that lives for the lifetime of the mount.
// Returns { state, dispose }; throws if WebGL is unavailable (the caller shows the reason).
export function createViewport(mount) {
  const scene = new THREE.Scene();
  // Light views leave the canvas transparent and let the mount's CSS gradient be the background;
  // the lit view paints its own dark scene.background (see LIT_BG in scenes.js).
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 4000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  mount.appendChild(renderer.domElement);

  // Post-processing: bloom (glow bleed) for the lit view only. Disabled elsewhere, so the
  // CAD-style views look exactly as they would without a composer.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.7); // strength, radius, threshold
  bloomPass.enabled = false;
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // Studio-style ambient lighting (IBL): soft reflections on the Standard/Physical materials so the
  // parts don't read as flat. Removed in the lit view for a dark-room effect.
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

  // Lit view: a warm pool of light on the floor. Slightly dark at the very centre (the body blocks
  // the light directly below it), bright in a ring around that.
  const poolTex = gradientTexture([256, 256], (c) => c.createRadialGradient(128, 128, 6, 128, 128, 128),
    [[0.0, "rgba(255,190,120,0.10)"], [0.28, "rgba(255,178,105,0.85)"], [1.0, "rgba(255,150,80,0.0)"]], true);
  // Emission ramp for the lamp body: brightest across a wide plateau at mid-height, so no thin
  // bright line appears at the equator.
  const washiGrad = gradientTexture([4, 256], (c) => c.createLinearGradient(0, 0, 0, 256),
    [[0.0, "#9a6a38"], [0.32, "#ffe4bc"], [0.68, "#ffe4bc"], [1.0, "#9a6a38"]], true);

  const group = new THREE.Group();
  scene.add(group);

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
  };

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
  // three's OrbitControls rather than a hand-rolled pointer path: it already covers mouse, touch and
  // pen through pointer events, derives pinch from the live pointers, and cleans up after itself.
  // `touch-action: none` on <body> (index.css) is still what lets a touch drag reach it instead of
  // scrolling the page.
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

  // Place the camera in the builders' terms. Every field is optional and anything left out keeps its
  // current value, so a view can set its pose and let frame() set the distance and target after.
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
  let raf;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    controls.update();   // required every frame while damping is on
    composer.render();
  };
  animate();

  // Everything added above is removed here. The window-level listeners used to be left behind, so a
  // remount (React StrictMode does one on every dev load) left a second set of handlers rotating
  // the same camera — a drag moved it twice as far. controls.dispose() is the same contract for the
  // orbit input, which is why it has to be called and not just dropped.
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
 * `stateRef.current` stays `{}` when WebGL is unavailable — scenes.js checks for `.group` — and the
 * reason is reported through onError so the UI can keep working (STL export needs no WebGL).
 */
export function useViewport(onError) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  useEffect(() => {
    let dispose;
    try {
      const vp = createViewport(mountRef.current);
      stateRef.current = vp.state;
      dispose = vp.dispose;
    } catch (e) {
      // WebGL initialization failed (old device / no context). Keep the UI rather than blacking
      // out the screen, and just report the cause.
      onError((e && e.message) || String(e));
    }
    return () => dispose?.();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- mount once; onError is a stable setState
  return [mountRef, stateRef];
}
