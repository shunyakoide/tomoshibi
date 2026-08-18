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
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { clamp } from "../util.js";

// Camera-orbit limits. Pitch stops short of straight down/up so the model never flips.
const PITCH = [-1.3, 0.4], ZOOM = [0.45, 3];

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
    rot: { x: -0.15, y: 0.5 }, baseDist: 700, zoom: 1,
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
  // Pointer events rather than a mouse* + touch* pair: one code path covers mouse, touch and pen,
  // and pinch falls out of tracking the live pointers. `touch-action: none` on <body> (index.css)
  // is what lets a touch drag reach us instead of scrolling the page.
  const el = renderer.domElement;
  const active = new Map();       // pointerId → last client position
  let pinch = 0;                  // distance between two pointers at the previous move
  const two = () => [...active.values()];

  const onDown = (e) => {
    el.setPointerCapture?.(e.pointerId);
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size === 2) { const [a, b] = two(); pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const onMove = (e) => {
    const prev = active.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size >= 2) {
      const [a, b] = two();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      state.zoom = clamp(ZOOM[0], ZOOM[1], state.zoom - (d - pinch) * 0.004);
      pinch = d;
      return;                     // two fingers = zoom only, no rotation
    }
    state.rot.y += dx * 0.008;
    state.rot.x = clamp(PITCH[0], PITCH[1], state.rot.x + dy * 0.006);
  };
  const onUp = (e) => {
    active.delete(e.pointerId);
    el.releasePointerCapture?.(e.pointerId);
  };
  const onWheel = (e) => {
    e.preventDefault();
    state.zoom = clamp(ZOOM[0], ZOOM[1], state.zoom + e.deltaY * 0.0012);
  };
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("wheel", onWheel, { passive: false });

  // ---- Render loop ----
  let raf;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const dist = state.baseDist * state.zoom;
    const { x, y } = state.rot;
    const lookY = state.lookY ?? 120;
    camera.position.set(
      dist * Math.sin(y) * Math.cos(x),
      lookY - dist * Math.sin(x),
      dist * Math.cos(y) * Math.cos(x)
    );
    camera.lookAt(0, lookY, 0);
    composer.render();
  };
  animate();

  // Every listener added above is removed here. The window-level ones used to be left behind, so a
  // remount (React StrictMode does one on every dev load) left a second set of handlers rotating
  // the same camera — a drag moved it twice as far.
  const dispose = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    ro?.disconnect();
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("wheel", onWheel);
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
