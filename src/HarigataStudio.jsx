/**
 * ============================================================================
 * HARIGATA STUDIO (FORMING MOLD STUDIO) v5 — UI
 * ============================================================================
 * A generator for 3D-print forming molds (harigata = molds for bamboo-rib winding
 * and washi application) to make your own washi paper lamps.
 * Adjust the profile curve parametrically and output three kinds of STL (rib / koma / stand).
 *
 * This file focuses on the React component (UI + 3D viewport).
 * The actual shape generation, export, and config are split out:
 *   - geometry.js … cross-section / 3D geometry (rib / koma / stand)
 *   - draw2d.js   … Canvas rendering of the 2D cross-section view
 *   - stl.js      … STL / ZIP export
 *   - config.js   … presets, sliders, defaults, section definitions
 *
 * [Views] 2d (cross-section, default) / mold (assembly) / print (print layout) / lit
 * [Build flow] print → insert 8 ribs into 2 koma → wind bamboo ribs → apply washi →
 *   dry → remove koma and pull ribs out through the top/bottom openings → lamp body complete → mount as lighting on three legs, etc.
 * ============================================================================
 */
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  maxRadius, outerR, cutT, standBoardLength, maxBoards, grooveR, grooveList, higoSpiralPath,
  ribGeometry, komaGeometry, standGeometry, boardGeometry, ribSplitParts,
  standCollarTop, standSaddleH, standSlotSep, bakeBezierHandles, ringGeometry,
} from "./geometry.js";
import { exportZip, openHTML } from "./stl.js";
import { paperHTML } from "./papercraft.js";
import { clamp } from "./util.js";
import { loadSaved, saveState, serializeState, parseImport, STORAGE_KEY, SCHEMA_VERSION } from "./persist.js";
import SectionEditor from "./SectionEditor.jsx";
import { PRESETS, DEFAULTS, SIL_ROWS } from "./config.js";
import { makeT, loadLang, saveLang } from "./i18n.js";

// Restore from localStorage once at startup (at module top level to avoid duplicate parses from lazy init).
const SAVED = typeof window !== "undefined" ? loadSaved() : null;

export default function HarigataStudio() {
  const [p, setP] = useState(SAVED?.p ?? DEFAULTS); // Restore (fall back to defaults if none)
  const [view, setView] = useState("2d"); // Default is the 2D cross-section view (easiest to read the shape). Transient state, so not restored
  const [drag, setDrag] = useState(null);  // Key currently being dragged (for highlighting handles / scrub rows)
  const [higoOpen, setHigoOpen] = useState(false); // Open/closed state of the bamboo-rib accordion
  const [printRibs, setPrintRibs] = useState(SAVED?.printRibs ?? 1); // Number of ribs laid out at once in the print view
  const [splitRibs, setSplitRibs] = useState(false); // Split ribs into top/bottom halves (experimental, so not restored = always starts false)
  const [bedW, setBedW] = useState(SAVED?.bedW ?? 256); // Print bed width (mm). Restored as a machine setting
  const [bedD, setBedD] = useState(SAVED?.bedD ?? 256); // Print bed depth (mm)
  const [matT, setMatT] = useState(SAVED?.matT ?? 5);   // Papercraft material thickness (mm). Measured cardboard thickness. Restored as a machine setting
  const [sel, setSel] = useState(null); // Index of the control point selected in the cross-section editor (transient = not restored)
  const [editMode, setEditMode] = useState("move"); // Cross-section editor: "move" = move points / "curve" = tangent handles
  const [glError, setGlError] = useState(null);
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 860 : false
  );
  const [lang, setLang] = useState(loadLang());   // UI language (ja/en). Saved in localStorage
  const t = makeT(lang);                          // Translation function (falls back to Japanese for untranslated keys)
  const toggleLang = () => setLang((l) => { const nx = l === "ja" ? "en" : "ja"; saveLang(nx); return nx; });
  const mountRef = useRef(null);
  const T = useRef({});
  const prevViewRef = useRef(null); // To detect view switches and set the initial camera angle
  const importRef = useRef(null);   // Hidden <input type=file> for loading designs

  // Switch between side-by-side and stacked layout based on screen width
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 860);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Automatically clamp the rib count to the maximum that fits into the koma. If board thickness,
  // tolerance, or opening (◇) changes make the count too large (via any path), lower it here → prevents creating a non-watertight koma with overlapping notches.
  const boardsMax = maxBoards(p);
  useEffect(() => {
    if (p.boards > boardsMax) setP((o) => ({ ...o, boards: boardsMax }));
  }, [p.boards, boardsMax]);

  // Auto-save the working state to localStorage. A 300ms debounce prevents a flood of writes from
  // continuous updates during dragging, while pagehide (tab close/navigation) flushes immediately so the last action is never lost.
  // This runs after the boards-clamp effect, so the saved value is always post-clamp (never a non-watertight koma).
  useEffect(() => {
    const state = { p, bedW, bedD, printRibs, matT };
    const id = setTimeout(() => saveState(state), 300);
    const flush = () => { clearTimeout(id); saveState(state); };
    window.addEventListener("pagehide", flush);
    return () => { clearTimeout(id); window.removeEventListener("pagehide", flush); };
  }, [p, bedW, bedD, printRibs, matT]);

  // ---- Undo/Redo (history of shape p) ----
  // History stack of p + current index. Continuous drag/scrub changes are coalesced into one entry via debounce,
  // and discrete operations (preset switch, add/delete point, sharp⇄smooth, etc.) are snapshotted through the same path. Instead of
  // touching every setP call site, we "watch p and commit once it settles" (works around the lack of a single choke point).
  const hist = useRef([p]);        // Snapshot list (0 is oldest)
  const hIdx = useRef(0);          // Current index
  const restoring = useRef(false); // Flag: setP triggered by undo/redo should not be re-committed
  const commitTimer = useRef(null);
  const [, bumpHist] = useState(0); // Re-render trigger to update button enabled/disabled state
  const HIST_CAP = 60;
  const commitNow = (np) => {
    const h = hist.current;
    if (JSON.stringify(h[hIdx.current]) === JSON.stringify(np)) return; // Don't push if unchanged
    h.splice(hIdx.current + 1);     // Discard the redo side (the future that could be redone)
    h.push(np);
    if (h.length > HIST_CAP) h.shift();
    hIdx.current = h.length - 1;
    bumpHist((n) => n + 1);
  };
  useEffect(() => {
    if (restoring.current) { restoring.current = false; return; } // Don't push changes caused by restoring
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => commitNow(p), 350); // One entry once continuous operations settle
    return () => clearTimeout(commitTimer.current);
  }, [p]);
  const undo = () => {
    clearTimeout(commitTimer.current);
    commitNow(p);                  // Commit the pending change first (so it can be reached by redo)
    if (hIdx.current <= 0) return;
    hIdx.current--;
    restoring.current = true;
    setP(hist.current[hIdx.current]);
    bumpHist((n) => n + 1);
  };
  const redo = () => {
    clearTimeout(commitTimer.current);
    commitNow(p);                  // Commit the pending edit first (symmetric with undo). After a new edit the redo target
                                   // is discarded and this becomes a no-op = standard undo/redo behavior. Nothing is lost.
    if (hIdx.current >= hist.current.length - 1) return;
    hIdx.current++;
    restoring.current = true;
    setP(hist.current[hIdx.current]);
    bumpHist((n) => n + 1);
  };
  const canUndo = hIdx.current > 0;
  const canRedo = hIdx.current < hist.current.length - 1;
  // Keyboard: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z or Ctrl+Y = redo. Ignored while typing in an input.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const mount = mountRef.current;
    let cleanup;
    try {
      const scene = new THREE.Scene();
    // The background is drawn by the CSS gradient on the mount. The canvas is transparent so
    // each view can switch between CAD-style (light) and lit (dark). Fog is set on the rebuild side.
    const camera = new THREE.PerspectiveCamera(36, 1, 1, 4000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // Post-processing: apply bloom (glow bleed) only in the lit view to give a "glowing" feel.
    // In light views bloomPass is disabled, so the look is unchanged.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.7); // strength, radius, threshold
    bloomPass.enabled = false;
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    // Studio-style ambient lighting (IBL). Gives Standard/Physical materials soft reflections
    // to remove flatness. Used in the assembly/print views (removed in the lit view for a dark-room effect).
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(amb);
    const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(240, 380, 280); scene.add(key);
    const rim = new THREE.DirectionalLight(0x8890a8, 0.35); rim.position.set(-260, 120, -260); scene.add(rim);
    const bulb = new THREE.PointLight(0xffc37a, 0, 900, 1.5); scene.add(bulb);

    // CAD-style ground grid (shown only in the assembly view). The distance fades into the bg with fog.
    const groundGrid = new THREE.GridHelper(2400, 48, 0xaab0ba, 0xc7ccd4);
    groundGrid.position.y = 0;
    groundGrid.visible = false;
    scene.add(groundGrid);
    const shadowTex = (() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
      g.addColorStop(0, "rgba(0,0,0,0.5)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(cv);
    })();
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.5;
    scene.add(shadow);

    // Texture for the lit view: a warm pool of light on the floor (slightly dark center = shadow directly below, bright ring around)
    const poolTex = (() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
      g.addColorStop(0.0, "rgba(255,190,120,0.10)"); // Directly below: dimmed because the body blocks it
      g.addColorStop(0.28, "rgba(255,178,105,0.85)"); // Bright ring of light
      g.addColorStop(1.0, "rgba(255,150,80,0.0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    // Emission variation of the lamp body: a gradient brightest at the vertical center (prevents flatness)
    const washiGrad = (() => {
      const cv = document.createElement("canvas");
      cv.width = 4; cv.height = 256;
      const ctx = cv.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      // Make the center a wide plateau (bright) so no thin bright line appears
      g.addColorStop(0.0, "#9a6a38"); g.addColorStop(0.32, "#ffe4bc");
      g.addColorStop(0.68, "#ffe4bc"); g.addColorStop(1.0, "#9a6a38");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();

    const group = new THREE.Group();
    scene.add(group);
    T.current = {
      scene, camera, renderer, composer, bloomPass, poolTex, group, bulb, shadow, amb, key, groundGrid, envMap,
      // Lit: floor (dark room) and pool of light
      litFloorMat: new THREE.MeshStandardMaterial({ color: 0x0a0d16, roughness: 1, metalness: 0 }),
      litPoolMat: new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      // Rib: apply a very thin clearcoat, like a coated filament, for a refined sheen
      ribMat: new THREE.MeshPhysicalMaterial({
        color: 0xc3b291, roughness: 0.5, metalness: 0.0,
        clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.9,
      }),
      // Koma: matte resin. A finish contrast with the ribs makes the parts easy to tell apart
      komaMat: new THREE.MeshStandardMaterial({ color: 0x94897c, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.85 }),
      // Stand: a dark matte finish like fired stoneware
      standMat: new THREE.MeshStandardMaterial({ color: 0x6b6156, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.75 }),
      washiMat: new THREE.MeshStandardMaterial({
        color: 0xf7f3ea, roughness: 0.9, transparent: true, opacity: 0.94,
        emissive: 0xffd0a0, emissiveIntensity: 0, emissiveMap: washiGrad, side: THREE.DoubleSide,
      }),
      rot: { x: -0.15, y: 0.5 }, baseDist: 700, zoom: 1, idle: 0,
    };

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
    if (ro) ro.observe(mount);

    let drag = false, px = 0, py = 0, pinch = 0;
    const el = renderer.domElement;
    const down = (x, y) => { drag = true; T.current.idle = 0; px = x; py = y; };
    const move = (x, y) => {
      if (!drag) return;
      const s = T.current;
      s.idle = 0;
      s.rot.y += (x - px) * 0.008;
      s.rot.x = Math.min(0.4, Math.max(-1.3, s.rot.x + (y - py) * 0.006));
      px = x; py = y;
    };
    el.addEventListener("mousedown", (e) => down(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => move(e.clientX, e.clientY));
    window.addEventListener("mouseup", () => (drag = false));
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      T.current.idle = 0;
      T.current.zoom = Math.min(3, Math.max(0.45, T.current.zoom + e.deltaY * 0.0012));
    }, { passive: false });
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY);
      if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY);
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        T.current.idle = 0;
        T.current.zoom = Math.min(3, Math.max(0.45, T.current.zoom - (d - pinch) * 0.004));
        pinch = d;
      }
    }, { passive: true });
    el.addEventListener("touchend", () => (drag = false));

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const s = T.current;
      const dist = s.baseDist * s.zoom;
      s.camera.position.set(
        dist * Math.sin(s.rot.y) * Math.cos(s.rot.x),
        (s.lookY ?? 120) - dist * Math.sin(s.rot.x),
        dist * Math.cos(s.rot.y) * Math.cos(s.rot.x)
      );
      s.camera.lookAt(0, s.lookY ?? 120, 0);
      s.composer.render();
    };
    animate();
      cleanup = () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); if (ro) ro.disconnect(); if (el.parentNode === mount) mount.removeChild(el); composer.dispose(); renderer.dispose(); };
    } catch (e) {
      // WebGL initialization failed (old device / cannot get context, etc.).
      // Keep the UI instead of blacking out the whole screen, and just show the cause message.
      setGlError((e && e.message) || String(e));
    }
    return () => { if (cleanup) cleanup(); };
  }, []);

  // Rebuild preview + auto-framing
  useEffect(() => {
    const s = T.current;
    if (!s.group) return;
    while (s.group.children.length) {
      const m = s.group.children[0];
      s.group.remove(m);
      m.traverse((o) => o.geometry && o.geometry.dispose());
    }
    const viewChanged = prevViewRef.current !== view; // Set the initial camera angle only on first render / view switch
    prevViewRef.current = view;
    if (view === "2d") return; // The 2D cross-section view is drawn on a separate canvas (skip 3D building)
    const R = maxRadius(p);
    const lightVP = view !== "lit"; // Assembly/print use a CAD-style bright background; only lit is dark
    s.shadow.scale.set(R * 3.2, R * 3.2, 1);
    s.shadow.visible = view === "mold"; // Contact shadow only in the assembly view (lit grounds via floor + pool of light)
    s.shadow.material.opacity = 0.3;
    s.groundGrid.visible = view === "mold";
    // Ambient light only in light views. For lit we want just the lamp glowing in a dark room, so remove it.
    s.scene.environment = lightVP ? s.envMap : null;
    s.scene.fog = view === "print" ? null
      : new THREE.Fog(lightVP ? 0xbfb5a3 : 0x070a11, 1000, 2400);
    // Since IBL provides the fill, keep ambient modest. Strengthen the key to bring out the form's shading
    // and lift it off the background (avoids blowout while ensuring figure-ground contrast).
    s.amb.intensity = view === "print" ? 0.5 : lightVP ? 0.3 : 0.5;
    s.key.intensity = view === "print" ? 0.85 : lightVP ? 1.1 : 0.85;
    s.key.position.set(view === "print" ? 80 : 240, view === "print" ? 500 : 380, view === "print" ? 120 : 280);
    s.bulb.intensity = 0;
    s.washiMat.emissiveIntensity = 0;
    s.bloomPass.enabled = false; // Enabled only in the lit view (the lit branch below)

    const frame = (contentH, contentR, centerY) => {
      const cam = s.camera;
      const fovV = (cam.fov * Math.PI) / 180;
      const fovH = 2 * Math.atan(Math.tan(fovV / 2) * cam.aspect);
      const dV = (contentH / 2) / Math.tan(fovV / 2);
      const dH = contentR / Math.tan(fovH / 2);
      s.baseDist = Math.max(dV, dH) * 1.45;
      cam.far = Math.max(4000, s.baseDist * 3);
      cam.updateProjectionMatrix();
      s.zoom = 1;
      s.lookY = centerY;
    };

    if (view === "lit") {
      const legH = p.height * 0.42; // Three legs (1AY style)
      // The neck (vertical part at the top/bottom ends) has no bamboo ribs or washi = nothing is applied, so don't draw it.
      // Show only the lamp body (the center where washi is applied) as the glowing skin, leaving the neck open.
      const cB = cutT(p); // Neck fraction (0..0.45)
      const t0 = cB, t1 = 1 - cB;
      const pts = [];
      const N = 160; // Sample finely along the vertical to smooth the surface (silhouette)
      for (let i = 0; i <= N; i++) {
        const t = t0 + (t1 - t0) * (i / N);
        pts.push(new THREE.Vector2(outerR(p, t) + p.higoD, legH + t * p.height));
      }
      s.group.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 128), s.washiMat));
      // Bamboo ribs: horizontal rings of the lamp body. In reality washi is applied over the bamboo ribs, so the ribs sit inside the paper.
      // Place the ring center at outerR → the outer surface at outerR+higoD/2 sits inside the washi (outerR+higoD),
      // preventing the surfaces from coinciding and Z-fighting (a dashed flicker). Color is the natural bamboo tone
      // (pale yellow-brown). Add a fairly strong warm self-emission so it isn't crushed to black in backlight, showing translucent bamboo ribs.
      const higoMat = new THREE.MeshStandardMaterial({
        color: 0xc2a266, roughness: 0.75, metalness: 0,
        emissive: 0x936026, emissiveIntensity: 0.7,
      });
      if (p.spiral) {
        // Spiral winding: draw the bamboo rib as "a single spiral continuing downward" (same higoSpiralPath as the mold's grooves).
        const path = higoSpiralPath(p);
        if (path.length > 1) {
          const v = path.map(([a, y, r]) => new THREE.Vector3(r * Math.cos(a), legH + y, r * Math.sin(a)));
          const curve = new THREE.CatmullRomCurve3(v);
          const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, v.length * 2, p.higoD / 2, 8, false), higoMat);
          s.group.add(tube);
        }
      } else {
        for (const gy of grooveList(p, grooveR(p))) {
          const t = gy / p.height;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(outerR(p, t), p.higoD / 2, 10, 96), higoMat);
          ring.rotation.x = Math.PI / 2; ring.position.y = legH + gy;
          s.group.add(ring);
        }
      }
      // Legs: splay outward from the lamp body's bottom rim (= the lower opening) down to the floor. Graphite that doesn't sink into the dark background (keeps the black-iron texture)
      const legMat = new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.4, metalness: 0.3 });
      // Match the root to the skin's bottom rim: use the t0 (= lamp body's bottom end) value for both radius and height.
      const rimR = outerR(p, t0) + p.higoD, rimY = legH + t0 * p.height;
      // Black rim of the opening (a ring). The three legs connect to this rim. Same thickness/material as the legs so it looks unified.
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 1.8, 14, 96), legMat);
      rim.rotation.x = Math.PI / 2; rim.position.y = rimY;
      s.group.add(rim);
      // The feet go further out than the root = a tripod spreading straight from the opening to the floor (not tapering inward).
      const r0 = rimR, r1 = rimR + legH * 0.35;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const topP = new THREE.Vector3(r0 * Math.cos(a), rimY, r0 * Math.sin(a));
        const botP = new THREE.Vector3(r1 * Math.cos(a), 2, r1 * Math.sin(a));
        const dir = new THREE.Vector3().subVectors(botP, topP);
        const len = dir.length();
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, len, 12), legMat);
        leg.position.copy(topP).addScaledVector(dir, 0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        s.group.add(leg);
        const foot = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), legMat);
        foot.position.copy(botP);
        s.group.add(foot);
      }
      // Floor (dark room) + warm pool of light (the lamp illuminates the floor)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), s.litFloorMat);
      floor.rotation.x = -Math.PI / 2;
      s.group.add(floor);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), s.litPoolMat);
      pool.rotation.x = -Math.PI / 2; pool.position.y = 0.4;
      const pr = maxRadius(p) * 7;
      pool.scale.set(pr, pr, 1);
      s.group.add(pool);
      // Present it as self-emitting: keep external light minimal and let the lamp body's emissive and bloom do the glowing.
      // Don't use an internal bulb (it produces a bright band = line at the equator). Use the emissive vertical gradient for shading.
      s.amb.intensity = 0.12;
      s.key.intensity = 0.25; s.key.position.set(180, 320, 200);
      s.washiMat.roughness = 1.0;          // Fully matte (removes specular highlights)
      s.washiMat.emissiveIntensity = 1.15; // Brightness of the lamp body
      s.bulb.intensity = 0;                // Internal bulb off (prevents a bright line showing through)
      s.bloomPass.enabled = true;          // Glow bleed → glowing feel
      s.bloomPass.strength = 0.6; s.bloomPass.radius = 0.7; s.bloomPass.threshold = 0.85; // Soft halo
      // Only on switch, set the initial angle to "from the side (near eye level)". Without this it inherits the previous view's
      // angle (print = top-down rot.x=-1.35) and ends up looking down from above.
      if (viewChanged) { s.rot.x = -0.08; s.rot.y = 0.5; }
      frame((legH + p.height) * 1.16, R * 1.1, (legH + p.height) * 0.5);
      return;
    }

    const mold = new THREE.Group();
    for (let k = 0; k < p.boards; k++) {
      const mesh = new THREE.Mesh(ribGeometry(p, k), s.ribMat);
      mesh.rotation.y = (k / p.boards) * Math.PI * 2;
      mold.add(mesh);
    }
    // The koma are identical top and bottom. In the assembly view, place the same geometry at the two (top/bottom) positions.
    const kb = new THREE.Mesh(komaGeometry(p), s.komaMat);
    kb.rotation.x = -Math.PI / 2; kb.position.y = -p.tabLen; // Lower koma
    mold.add(kb);
    const kt = new THREE.Mesh(komaGeometry(p), s.komaMat);
    kt.rotation.x = Math.PI / 2; kt.position.y = p.height + p.tabLen; // Upper koma (identical)
    mold.add(kt);

    if (view === "mold") {
      // Actual working pose: show the mold laid on its side, resting in the two saddles of the stand.
      const collarTop = standCollarTop();           // Height where the column feet sit (top face of the collar)
      const komaY = collarTop + standSaddleH(p);     // Koma center = saddle center height
      const sep = standSlotSep(p);                   // Koma center spacing = column spacing (based on the koma seating position)
      // Lay the mold on its side (axis along X). Position it so the koma centers land at X=±sep/2, Y=komaY after rotation.
      mold.rotation.z = Math.PI / 2;
      mold.position.set(p.height / 2, komaY, 0);
      s.group.add(mold);
      // Stand: base board (laid flat on the floor) + 2 columns (saddles receive the koma)
      const board = new THREE.Mesh(boardGeometry(p), s.standMat);
      board.rotation.x = -Math.PI / 2;              // Lay flat on the floor with the thickness (collar) facing up
      s.group.add(board);
      for (const sgn of [-1, 1]) {
        const col = new THREE.Mesh(standGeometry(p), s.standMat);
        col.rotation.y = Math.PI / 2;               // Orient the board-thickness direction along the mold axis (X)
        col.position.set((sgn * sep) / 2, collarTop, 0);
        s.group.add(col);
      }
      s.shadow.scale.set(R * 3.2, R * 3.2, 1);
      if (viewChanged) { s.rot.x = -0.12; s.rot.y = 0.32; } // Initial angle viewed from the side (along the mold axis)
      const top = komaY + R;                         // Topmost point of the mold
      frame(top * 1.2, Math.max(standBoardLength(p) / 2, R) * 1.25, top * 0.5);
    } else {
      // Print view: Bambu Lab A1 (256×256mm). Compute cells per part type and arrange plates in a grid
      const BEDW = bedW, BEDD = bedD, GAP = 8;
      // With spiral winding each rib has different groove positions (every rib is a different shape), so always lay out all boards ribs.
      // Normally all ribs are identical, so only printRibs of them (print one and duplicate).
      const nRibs = p.spiral ? p.boards : Math.min(printRibs, p.boards);
      const ribs = [];
      for (let k = 0; k < nRibs; k++) {
        if (splitRibs) {
          const sp = ribSplitParts(p, k);
          ribs.push({ geo: sp.bottom, mat: s.ribMat }, { geo: sp.top, mat: s.ribMat }, { geo: sp.splice, mat: s.komaMat });
        } else {
          ribs.push({ geo: ribGeometry(p, k), mat: s.ribMat });
        }
      }
      // The koma and columns are identical top and bottom, so output only one of each (the user duplicates and places them when printing).
      // Since the STL output is separate, split them onto separate plates in the preview too.
      const komas = [{ geo: komaGeometry(p), mat: s.komaMat }];
      const stands = [{ geo: standGeometry(p), mat: s.standMat }];
      // The base board's length varies with the lamp body height, so put it on its own plate. This keeps the column placement fixed
      const boards = [{ geo: boardGeometry(p), mat: s.standMat }];
      // Opening rings (top/bottom opening rings). Rigid rings inserted into the finished lamp's openings. One each.
      const rings = [
        { geo: ringGeometry(p, false), mat: s.komaMat },
        { geo: ringGeometry(p, true), mat: s.komaMat },
      ];

      let plateIdx = 0;
      const placed = [];
      const layout = (items) => {
        if (!items.length) return;
        let mW = 0, mD = 0;
        items.forEach((pt) => {
          pt.geo.computeBoundingBox();
          pt.bb = pt.geo.boundingBox;
          mW = Math.max(mW, pt.bb.max.x - pt.bb.min.x);
          mD = Math.max(mD, pt.bb.max.y - pt.bb.min.y);
        });
        const cW = mW + GAP, cD = mD + GAP;
        const cols = Math.max(1, Math.floor((BEDW - GAP) / cW));
        const rows = Math.max(1, Math.floor((BEDD - GAP) / cD));
        const per = cols * rows;
        items.forEach((pt, i) => {
          const w = pt.bb.max.x - pt.bb.min.x, d = pt.bb.max.y - pt.bb.min.y;
          const onPlate = Math.min(per, items.length - Math.floor(i / per) * per); // Number of parts on this plate
          const uc = Math.min(cols, onPlate), ur = Math.ceil(onPlate / cols);       // Actually used column/row counts
          const gridW = uc * cW - GAP, gridD = ur * cD - GAP;
          const ox0 = Math.max(2, (BEDW - gridW) / 2), oz0 = Math.max(2, (BEDD - gridD) / 2); // Center on the bed
          placed.push({
            ...pt,
            plate: plateIdx + Math.floor(i / per),
            ox: ox0 + (i % per % cols) * cW + (mW - w) / 2,
            oz: oz0 + Math.floor((i % per) / cols) * cD + (mD - d) / 2,
          });
        });
        plateIdx += Math.ceil(items.length / per);
      };
      layout(ribs);
      layout(komas);
      layout(stands);
      layout(boards);
      layout(rings);

      const plates = plateIdx;
      const pCols = Math.ceil(Math.sqrt(plates));
      const pRows = Math.ceil(plates / pCols);
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x1e1e23, roughness: 0.9 });
      const platePos = (pl) => [(pl % pCols) * (BEDW + 40), Math.floor(pl / pCols) * (BEDD + 40)];
      const gridDivs = Math.max(2, Math.round(BEDW / 32)); // ≈32mm cells
      for (let pl = 0; pl < plates; pl++) {
        const [px, pz] = platePos(pl);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(BEDW, 2, BEDD), plateMat);
        plate.position.set(px + BEDW / 2, -1, pz + BEDD / 2);
        s.group.add(plate);
        const grid = new THREE.GridHelper(BEDW, gridDivs, 0x3f3f46, 0x2c2c31);
        grid.scale.z = BEDD / BEDW; // Stretch the depth direction to match a rectangular bed
        grid.position.set(px + BEDW / 2, 0.15, pz + BEDD / 2);
        s.group.add(grid);
      }
      placed.forEach((pt) => {
        const [px, pz] = platePos(pt.plate);
        const m = new THREE.Mesh(pt.geo, pt.mat);
        m.rotation.x = -Math.PI / 2;
        // With rotation.x=-90°, local z → world y. Lift so the part's bottom z edge sits on the plate
        // (the stand columns are centered on z, so a fixed 0.6 would sink half the thickness in)
        m.position.set(px + pt.ox - pt.bb.min.x, 0.6 - pt.bb.min.z, pz + pt.oz + pt.bb.max.y);
        s.group.add(m);
      });

      const totalW = pCols * (BEDW + 40) - 40;
      const totalD = pRows * (BEDD + 40) - 40;
      s.group.children.forEach((m) => { m.position.x -= totalW / 2; m.position.z -= totalD / 2; });
      const span = Math.max(totalW, totalD) + 50;
      s.rot.x = -1.35;
      s.rot.y = 0;
      frame(span * 0.95, span / 2, 0);
    }
  }, [p, view, printRibs, bedW, bedD, splitRibs]);

  // Number of ribs to print (1..boards). Clamped in case boards was reduced.
  // With spiral winding every rib is a different shape, so always export all boards ribs (duplicating one won't make a spiral).
  const nRibs = p.spiral ? p.boards : Math.min(printRibs, p.boards);

  const dlAll = () => { // Bundle all parts as separate STLs into a single ZIP
    const spread = (geos, gap) => { // Lay out along X to avoid overlap
      let x = 0;
      for (const g of geos) {
        g.computeBoundingBox();
        const bb = g.boundingBox;
        g.translate(x - bb.min.x, 0, 0);
        x += (bb.max.x - bb.min.x) + gap;
      }
      return geos;
    };
    // Export unit for ribs. With spiral winding each rib differs in shape, so make it **one rib = one file**
    // (harigata_rib_01.stl …) so they can be placed/duplicated individually in the slicer. Normally all ribs are identical, so
    // bundle into one file as before (print one and duplicate).
    let ribEntries;
    if (splitRibs) {
      const parts = [];
      for (let k = 0; k < nRibs; k++) { const sp = ribSplitParts(p, k); parts.push(sp.bottom, sp.top, sp.splice); }
      ribEntries = [{ name: `harigata_ribs_x${nRibs}.stl`, geos: spread(parts, 15) }];
    } else if (p.spiral) {
      ribEntries = [];
      for (let k = 0; k < nRibs; k++) {
        const g = ribGeometry(p, k);
        g.translate(0, p.tabLen, p.boardT / 2);
        ribEntries.push({ name: `harigata_rib_${String(k + 1).padStart(2, "0")}.stl`, geos: [g] });
      }
    } else {
      const w = maxRadius(p) + 12, ribs = [];
      for (let k = 0; k < nRibs; k++) {
        const g = ribGeometry(p, k);
        g.translate(k * w, p.tabLen, p.boardT / 2);
        ribs.push(g);
      }
      ribEntries = [{ name: `harigata_ribs_x${nRibs}.stl`, geos: ribs }];
    }
    // The koma and columns are identical top and bottom, so export only one of each (duplicate to two when printing).
    const board = boardGeometry(p);
    // Bundle the config JSON: the printed kit's ZIP itself becomes a design backup (a source for restoring
    // even if localStorage is lost). Same schema as persist.js, so it works as-is for future JSON loading.
    const cfg = JSON.stringify({ schemaVersion: SCHEMA_VERSION, p, bedW, bedD }, null, 2);
    exportZip([
      ...ribEntries,
      { name: "harigata_koma_print2.stl", geos: [komaGeometry(p)] },
      { name: "harigata_stand_column_print2.stl", geos: [standGeometry(p)] },
      { name: "harigata_stand_base.stl", geos: [board] },
      // Opening rings (top/bottom opening rings). Inserted into the finished lamp's openings; the frame that holds the bamboo ribs/washi. Generated to match the opening diameter.
      { name: "harigata_ring_bottom.stl", geos: [ringGeometry(p, false)] },
      { name: "harigata_ring_top.stl", geos: [ringGeometry(p, true)] },
    ], "harigata_kit.zip", [{ name: "harigata_config.json", bytes: new TextEncoder().encode(cfg) }]);
  };

  // Export the design as a JSON file. Even if localStorage (a volatile cache layer) is lost,
  // it can be restored from this file = a backup you can rely on. Same schema as the config.json inside the ZIP.
  const exportDesign = () => {
    const json = serializeState({ p, bedW, bedD, printRibs, matT });
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "harigata_design.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load and restore a design JSON (either the standalone export or the config.json inside the ZIP).
  // parseImport runs a sanitize pass, so broken/old/hand-edited values fall back safely.
  const importDesign = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const s = parseImport(String(reader.result));
      if (!s) { window.alert(t("設計ファイルを読み込めませんでした(JSON が壊れています)。")); return; }
      setP(s.p); setBedW(s.bedW); setBedD(s.bedD); setPrintRibs(s.printRibs); setMatT(s.matT);
    };
    reader.onerror = () => window.alert(t("設計ファイルを読み込めませんでした(JSON が壊れています)。"));
    reader.readAsText(file);
  };

  const maxDia = Math.round(maxRadius(p) * 2);
  const boardLen = Math.round(p.height + p.tabLen * 2); // Total rib length
  const connLen = Math.round(standBoardLength(p));      // Total length of the connecting board (the longest part)
  const heightLimit = bedW - Math.round(standBoardLength(p) - p.height); // Height upper limit to fit the connecting board within the width
  // Radii of the top/bottom openings (= the top-end/bottom-end circles). Shown for reference (ribs are removed by taking off the koma and tilting,
  // so a simple "opening ≥ rib width" can't determine whether they come out → it would cause false warnings, so no check is done).
  const topOpen = Math.round(outerR(p, 1)); // Upper opening radius
  const botOpen = Math.round(outerR(p, 0)); // Lower opening radius

  // Bed-overflow check. Each part lies along a different axis: ribs have their long axis = height direction → depth bedD,
  // the connecting board has its long axis = length direction → width bedW. Ribs can be halved by splitting top/bottom, but the connecting board
  // can't be split, so the only option is to lower the height.
  const ribLen = splitRibs ? Math.round(boardLen / 2) + 12 : boardLen; // When split, +12 for the joint
  const overParts = [];
  if (ribLen > bedD) overParts.push(t("羽根板 {n}mm", { n: ribLen }));
  if (connLen > bedW) overParts.push(t("連結板 {n}mm", { n: connLen }));
  const bedWarn = overParts.length > 0;
  // In split mode the split parts' tabs don't match the body (koma-based) and won't fit the current koma (needs fixing).
  // Until fixed, don't recommend auto-applying it; funnel to the "lower the height" guidance only.
  const canSplitFix = false;

  const PANEL = 336; // Inspector width (px)
  const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
  const sans = "'IBM Plex Sans JP', 'Hiragino Sans', system-ui, sans-serif";
  const isLit = view === "lit";   // Lit view = viewing mode (panel hidden, dark background)
  const accent = "#D95B18";       // Accent = the orange of washi lamplight

  // Inspector: bright warm neutral in washi color
  const UI = {
    panel: "#fbf8f1", edge: "rgba(59,52,43,0.1)", head: "#3b342b",
    text: "#3b342b", sub: "#8a7c66", faint: "#a1937c", faintest: "#c0b298",
    card: "#fff", cardEdge: "rgba(59,52,43,0.09)", warn: "#c23c12",
  };
  // Viewport background (assembly/print = cool-neutral CAD-style, lit = dark). Cross-section is handled by SectionEditor.
  const vpBg = isLit
    ? "radial-gradient(circle at 50% 40%, #1b2230 0%, #070a11 100%)"
    : "radial-gradient(circle at 50% 34%, #eef0f3 0%, #c3c8d0 52%, #939ba6 100%)";
  const chip = isLit
    ? { bg: "rgba(16,16,18,0.72)", edge: "rgba(255,255,255,0.08)", txt: "#8a8a96" }
    : { bg: "rgba(255,255,255,0.85)", edge: "rgba(59,52,43,0.08)", txt: "#8a7c66" };

  // Fine-tune a value by dragging left/right (scrub). During the drag, drag=key highlights it.
  const startScrub = (e, cfg) => {
    e.preventDefault();
    const start = cfg.value, sx = e.clientX;
    const move = (ev) => {
      let v = start + (ev.clientX - sx) * cfg.sens;
      v = Math.round(v / cfg.round) * cfg.round;
      cfg.onChange(clamp(cfg.min, cfg.max, +v.toFixed(2)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    setDrag(cfg.key);
  };

  // Scrub row (label + value). card = a row inside a white card (with a divider).
  const scrubRow = (cfg, opts = {}) => {
    const on = drag === cfg.key;
    return (
      <div key={cfg.key} onPointerDown={(e) => startScrub(e, cfg)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: opts.card ? "9px 13px" : "7px 0", cursor: "ew-resize",
          borderBottom: opts.card && !opts.last ? `1px solid ${UI.cardEdge}` : "none",
          background: on ? "rgba(217,91,24,0.06)" : "transparent",
        }}>
        <span style={{ fontSize: 12.5, color: UI.text }}>{t(cfg.label)}</span>
        <span style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 600, color: on ? accent : UI.text }}>
          {cfg.display ?? cfg.value}
          <span style={{ color: UI.faintest, fontWeight: 400 }}> {cfg.unit}</span>
        </span>
      </div>
    );
  };

  const checkbox = (checked, onToggle, label) => (
    <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", cursor: "pointer" }}>
      <span style={{
        width: 16, height: 16, borderRadius: 5, flex: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, color: "#fff",
        background: checked ? accent : UI.card,
        border: checked ? "none" : "1px solid rgba(59,52,43,0.3)",
      }}>{checked ? "✓" : ""}</span>
      <span style={{ fontSize: 12.5, color: UI.text }}>{typeof label === "string" ? t(label) : label}</span>
    </div>
  );

  // Preset icon: a small silhouette generated from the actual profile (spline)
  const miniPath = (pr) => {
    const q = { height: 280, rTop: pr.rTop, rBot: pr.rBot, pts: pr.pts };
    const N = 40, rr = []; let mx = 0;
    for (let i = 0; i <= N; i++) { const r = outerR(q, i / N); rr.push(r); if (r > mx) mx = r; }
    const kx = 16 / mx;
    const Xc = (r) => 30 + r * kx, Xm = (r) => 30 - r * kx, Yc = (t) => 42 - t * 36;
    let dd = `M ${Xc(rr[0]).toFixed(1)} ${Yc(0).toFixed(1)}`;
    for (let i = 1; i <= N; i++) dd += ` L ${Xc(rr[i]).toFixed(1)} ${Yc(i / N).toFixed(1)}`;
    for (let i = N; i >= 0; i--) dd += ` L ${Xm(rr[i]).toFixed(1)} ${Yc(i / N).toFixed(1)}`;
    return dd + " Z";
  };

  // ± button stepper (for discrete integers)
  const stepper = (key, label, value, min, max, step, onChange, valueText) => {
    const sq = (txt, fn, off) => (
      <button onClick={off ? undefined : fn} disabled={off} style={{
        width: 26, height: 26, borderRadius: 7, cursor: off ? "default" : "pointer",
        background: UI.card, color: off ? UI.faintest : accent,
        border: `1px solid ${off ? UI.cardEdge : "rgba(217,91,24,0.45)"}`, fontSize: 15, fontWeight: 600, lineHeight: 1,
        opacity: off ? 0.5 : 1, padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
      }}>{txt}</button>
    );
    return (
      <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0" }}>
        <span style={{ fontSize: 12.5, color: UI.text }}>{t(label)}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {sq("−", () => onChange(clamp(min, max, +(value - step).toFixed(2))), value <= min)}
          <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: UI.text, minWidth: 44, textAlign: "center" }}>{valueText}</span>
          {sq("＋", () => onChange(clamp(min, max, +(value + step).toFixed(2))), value >= max)}
        </div>
      </div>
    );
  };

  // Numeric input (for bed dimensions. Commits and clamps on Enter / blur)
  const numInput = (label, value, setValue, min, max) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
      <span style={{ fontSize: 12.5, color: UI.text }}>{t(label)}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input key={value} type="number" defaultValue={value} min={min} max={max} step={1}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onBlur={(e) => {
            const v = Math.round(Number(e.target.value));
            setValue(Number.isFinite(v) && v > 0 ? clamp(min, max, v) : value);
          }}
          style={{
            width: 66, padding: "6px 8px", borderRadius: 8, textAlign: "right",
            fontFamily: mono, fontSize: 13, color: UI.text,
            background: UI.card, border: `1px solid ${UI.cardEdge}`,
          }} />
        <span style={{ fontSize: 11, color: UI.sub }}>mm</span>
      </div>
    </div>
  );

  const sectionLabel = (txt, extra) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", color: UI.faint }}>{t(txt)}</span>
      {extra && <span style={{ fontSize: 10, color: UI.faintest }}>{t(extra)}</span>}
    </div>
  );

  // ============ Left: viewport ============
  const viewport = (
    <main style={{
      position: "relative", minWidth: 0, minHeight: 0,
      flex: narrow ? "0 0 auto" : "1 1 auto",
      height: narrow ? "44vh" : "auto",
    }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0, background: vpBg, transition: "background 0.3s" }} />
      {/* Cross-section view: direct-manipulation editor (overlaid on the WebGL canvas) */}
      {view === "2d" && <SectionEditor p={p} setP={setP} accent={accent} drag={drag} setDrag={setDrag} sel={sel} setSel={setSel} editMode={editMode} setEditMode={setEditMode} t={t} />}

      {glError && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 10, padding: 24,
          textAlign: "center", pointerEvents: "none",
        }}>
          <div style={{ fontSize: 13, color: "#e0a060", fontWeight: 600 }}>{t("⚠ 3Dプレビューを初期化できませんでした")}</div>
          <div style={{ fontSize: 11, color: "#8a8a96", fontFamily: mono, wordBreak: "break-word" }}>{glError}</div>
          <div style={{ fontSize: 11, color: "#6f6f7a" }}>
            {t("お使いのブラウザで WebGL が無効の可能性があります。STLの生成・DLは引き続き利用できます。")}
          </div>
        </div>
      )}

      {/* Mode tabs */}
      <div style={{
        position: "absolute", top: 16, left: 16, display: "flex", gap: 2, padding: 4,
        borderRadius: 10, background: chip.bg,
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        border: `1px solid ${chip.edge}`, boxShadow: "0 2px 10px rgba(59,52,43,0.07)",
      }}>
        {[["2d", "断面"], ["mold", "組立"], ["print", "印刷"], ["lit", "点灯"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: "7px 14px", fontSize: 12.5, cursor: "pointer",
            borderRadius: 7, border: "none", fontFamily: sans,
            fontWeight: view === k ? 700 : 500,
            background: view === k ? accent : "transparent",
            color: view === k ? "#fff" : "#6f6350", transition: "all 0.15s",
          }}>{t(l)}</button>
        ))}
      </div>

      {/* Dimension chip (always live-updating) */}
      <div style={{
        position: "absolute", top: 24, right: 24, fontSize: 12, color: chip.txt,
        fontFamily: mono, letterSpacing: "0.05em", textAlign: "right", pointerEvents: "none",
      }}>
        ⌀{maxDia} × H{p.height} mm
      </div>

      {/* Bed-overflow warning (each part lies along a different axis, so the bed is shown as width×depth) */}
      {!isLit && bedWarn && (
        <div
          style={{
            position: "absolute", bottom: 20, left: 20, display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", background: "#fff", border: "1px solid rgba(217,91,24,0.4)",
            borderRadius: 10, boxShadow: "0 3px 12px rgba(59,52,43,0.1)", fontFamily: sans,
            fontSize: 12.5, color: UI.text, textAlign: "left", maxWidth: "60%",
          }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <span>
            {t("{parts} がベッド {w}×{d}mm を超過", { parts: overParts.join(" · "), w: bedW, d: bedD })}<br />
            <span style={{ color: UI.sub }}>{t("→ 火袋の高さを {h}mm 以下に", { h: heightLimit })}</span>
          </span>
        </div>
      )}

      {/* Lit-mode note */}
      {isLit && (
        <div style={{
          position: "absolute", bottom: 20, left: 20, fontSize: 11.5, color: "#8a8a96",
          fontFamily: sans, pointerEvents: "none",
        }}>
          {t("鑑賞モード — 編集はタブで「断面」へ")}
        </div>
      )}
    </main>
  );

  // ============ Right: inspector (hidden in lit mode) ============
  const inspector = isLit ? null : (
    <aside style={{
      display: "flex", flexDirection: "column",
      width: narrow ? "auto" : PANEL, flex: narrow ? "1 1 auto" : `0 0 ${PANEL}px`,
      minHeight: 0, background: UI.panel, color: UI.text,
      borderLeft: narrow ? "none" : `1px solid ${UI.edge}`,
      borderTop: narrow ? `1px solid ${UI.edge}` : "none",
    }}>
      {/* Header */}
      <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.04em", color: UI.head }}>
          {t("張型")} <span style={{ fontSize: 11.5, fontWeight: 400, color: UI.faint }}>{t("スタジオ")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={toggleLang} title="Language / 言語" style={{
            fontFamily: mono, fontSize: 10.5, letterSpacing: "0.08em", cursor: "pointer",
            padding: "3px 8px", borderRadius: 6, border: `1px solid ${UI.cardEdge}`,
            background: UI.card, color: UI.sub, fontWeight: 700,
          }}>{lang === "ja" ? "EN" : "日本語"}</button>
          <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.12em", color: UI.faintest }}>LAMP KIT</div>
        </div>
      </div>

      {/* Scroll area */}
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "6px 20px 16px" }}>
        {/* Top toolbar: split into two groups because the actions differ entirely in nature.
            "Edit" = undo/redo/reset (operate on the current working state) and "Save" = export/import (file I/O).
            Wrap each group with a border + subheading. When the panel is narrow, flexWrap drops the groups onto two rows (per-character wrapping is forbidden via nowrap). */}
        {(() => {
          // To match the other sections (shape, silhouette, etc.), use no border — just a subheading + button row.
          const groupBox = { display: "flex", flexDirection: "column", gap: 7 };
          const groupTitle = { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", color: UI.faint };
          const btnBase = { display: "flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 8, fontFamily: sans, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" };
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 14 }}>
              {/* Edit group: undo / redo / reset */}
              <div style={groupBox}>
                <span style={groupTitle}>{t("編集")}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["↺", "元に戻す", undo, canUndo], ["↻", "やり直し", redo, canRedo]].map(([icon, label, fn, on]) => (
                    <button key={label} onClick={on ? fn : undefined} disabled={!on} title={`${t(label)} (${icon === "↺" ? "⌘Z" : "⇧⌘Z"})`}
                      style={{
                        ...btnBase, gap: 5,
                        background: on ? UI.card : "transparent", color: on ? accent : UI.faintest,
                        border: `1px solid ${on ? "rgba(217,91,24,0.4)" : UI.cardEdge}`,
                        cursor: on ? "pointer" : "default", opacity: on ? 1 : 0.55,
                      }}>
                      <span style={{ fontSize: 17, lineHeight: 1 }}>{icon}</span>{t(label)}
                    </button>
                  ))}
                  {/* Reset is destructive, so distinguish it with a warn-colored border, while keeping it in the same group as an operation on the edit state. */}
                  <button
                    onClick={() => {
                      if (!window.confirm(t("すべての設定を初期状態に戻します。よろしいですか?"))) return;
                      try { localStorage.removeItem(STORAGE_KEY); } catch { /* continue even if disabled */ }
                      setP(DEFAULTS); setBedW(256); setBedD(256); setPrintRibs(1); setSplitRibs(false);
                    }}
                    title={t("すべての設定を初期状態に戻す")}
                    style={{ ...btnBase, background: "transparent", color: UI.warn, border: `1px solid rgba(194,60,18,0.35)`, cursor: "pointer" }}>
                    {t("初期化")}
                  </button>
                </div>
              </div>
              {/* Save group: export / import (save/restore the design to a JSON file. Restorable even if localStorage is lost) */}
              <div style={groupBox}>
                <span style={groupTitle}>{t("保存")}</span>
                <input ref={importRef} type="file" accept=".json,application/json" style={{ display: "none" }}
                  onChange={(e) => { importDesign(e.target.files[0]); e.target.value = ""; }} />
                <div style={{ display: "flex", gap: 6 }}>
                  {[["書き出す", exportDesign, "設計を JSON ファイルに保存"], ["読み込む", () => importRef.current?.click(), "設計 JSON ファイルから復元"]].map(([label, fn, tip]) => (
                    <button key={label} onClick={fn} title={t(tip)}
                      style={{ ...btnBase, background: UI.card, color: UI.sub, border: `1px solid ${UI.cardEdge}`, cursor: "pointer" }}>
                      {t(label)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
        {/* Shape presets */}
        <div style={{ marginBottom: 20 }}>
          {sectionLabel("形")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
            {PRESETS.map((pr) => {
              const active = p.shape === pr.key;
              return (
                <button key={pr.key}
                  onClick={() => { setSel(null); setP((o) => ({ ...o, shape: pr.key, rTop: pr.rTop, rBot: pr.rBot, pts: pr.pts.map((q) => ({ ...q })) })); }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    padding: "8px 4px 7px", borderRadius: 10, cursor: "pointer", fontFamily: sans,
                    background: active ? accent : UI.card, color: active ? "#fff" : UI.text,
                    border: "1px solid " + (active ? accent : UI.cardEdge),
                    boxShadow: active ? "0 3px 8px rgba(217,91,24,0.25)" : "none",
                  }}>
                  <svg viewBox="0 0 60 46" style={{ width: 40, height: 32, display: "block" }}>
                    <path d={miniPath(pr)} fill={active ? "rgba(255,255,255,0.25)" : "rgba(59,52,43,0.05)"}
                      stroke={active ? "#fff" : "#8a7c66"} strokeWidth="2" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{t(pr.name)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected-point card (cross-section view only). Turns hidden gestures on the SVG into explicit UI: numeric input,
            smooth/sharp toggle, delete. Doesn't touch geometry (just edits pts' r/t/sharp). */}
        {view === "2d" && (() => {
          const selPt = sel != null && p.pts && p.pts[sel] ? p.pts[sel] : null;
          const isEnd = selPt && (sel === 0 || sel === p.pts.length - 1);
          const setPt = (patch) => setP((o) => {
            const pts = o.pts.map((q) => ({ ...q }));
            pts[sel] = { ...pts[sel], ...patch };
            return { ...o, pts };
          });
          const setHmm = (mm) => setP((o) => {
            const pts = o.pts.map((q) => ({ ...q }));
            const lo = sel > 0 ? pts[sel - 1].t + 0.04 : 0.01;
            const hi = sel < pts.length - 1 ? pts[sel + 1].t - 0.04 : 0.99;
            pts[sel] = { ...pts[sel], t: clamp(lo, hi, mm / p.height) };
            return { ...o, pts };
          });
          const del = () => { if (p.pts.length <= 2) return; setP((o) => ({ ...o, pts: o.pts.filter((_, j) => j !== sel) })); setSel(null); };
          const segBtn = (label, active, onClick) => (
            <button onClick={onClick} style={{
              flex: 1, padding: "7px 4px", fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderRadius: 8, background: active ? accent : UI.card, color: active ? "#fff" : UI.text,
              border: "1px solid " + (active ? accent : UI.cardEdge),
            }}>{t(label)}</button>
          );
          // When entering curve-adjust mode, if there are no handles yet, bake them from the current Hermite curve
          // (the shape doesn't change). From then on outerR is evaluated as Bézier, and angles can be edited with the handles.
          const enterCurve = () => {
            setEditMode("curve");
            setP((o) => (o.pts.some((q) => q.ho || q.hi) ? o : { ...o, pts: bakeBezierHandles(o.pts) }));
          };
          return (
            <div style={{ marginBottom: 20 }}>
              {sectionLabel("選択中の点", selPt ? (isEnd ? "開口/首" : `#${sel + 1}`) : undefined)}
              {selPt ? (
                <div style={{ border: `1px solid ${UI.cardEdge}`, borderRadius: 10, background: UI.card, padding: "12px 12px 10px" }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {segBtn("✥ 点を動かす", editMode === "move", () => setEditMode("move"))}
                    {segBtn("◠ カーブ調整", editMode === "curve", enterCurve)}
                  </div>
                  {numInput("張り出し(半径)", Math.round(selPt.r), (v) => setPt({ r: clamp(10, 130, v) }), 10, 130)}
                  {numInput("高さ位置", Math.round(selPt.t * p.height), (v) => setHmm(v), 1, p.height)}
                  <div style={{ display: "flex", gap: 6, margin: "4px 0 10px" }}>
                    {segBtn("◇ なめらか", !selPt.sharp, () => setPt({ sharp: false }))}
                    {segBtn("■ 角", !!selPt.sharp, () => setPt({ sharp: true }))}
                  </div>
                  <button onClick={del} disabled={p.pts.length <= 2} style={{
                    width: "100%", padding: 9, fontFamily: sans, fontSize: 12, fontWeight: 600,
                    borderRadius: 8, cursor: p.pts.length <= 2 ? "not-allowed" : "pointer",
                    background: "transparent", color: p.pts.length <= 2 ? UI.faintest : UI.warn,
                    border: `1px solid ${p.pts.length <= 2 ? UI.cardEdge : "rgba(194,60,18,0.4)"}`,
                    opacity: p.pts.length <= 2 ? 0.6 : 1,
                  }}>{t("この点を削除")}</button>
                </div>
              ) : (
                <div style={{
                  border: `1px dashed ${UI.cardEdge}`, borderRadius: 10, padding: "14px 14px",
                  fontSize: 11.5, color: UI.faint, lineHeight: 1.6,
                }}>{t("断面図の点をクリックすると、数値・なめらか/角・削除がここに出ます。曲線上の緑の＋で点を追加できます。")}</div>
              )}
            </div>
          );
        })()}

        {/* Silhouette (scrub) */}
        <div style={{ marginBottom: 20 }}>
          {sectionLabel("シルエット", "左右にドラッグで調整")}
          <div style={{ border: `1px solid ${UI.cardEdge}`, borderRadius: 10, background: UI.card, overflow: "hidden" }}>
            {SIL_ROWS.map((r, i) => scrubRow(
              { key: r.key, label: r.label, value: p[r.key], min: r.min, max: r.max, sens: r.sens, round: r.round, unit: r.unit,
                onChange: (v) => setP((o) => ({ ...o, [r.key]: v })) },
              { card: true, last: i === SIL_ROWS.length - 1 }
            ))}
          </div>
        </div>

        {/* Framework */}
        <div style={{ marginBottom: 20 }}>
          {sectionLabel("骨組み")}
          {stepper("boards", "羽根板の枚数", p.boards, 4, Math.min(16, boardsMax), 1,
            (v) => setP((o) => ({ ...o, boards: v })),
            <>{p.boards}<span style={{ color: UI.faintest, fontWeight: 400 }}>{t(" 枚")}</span></>)}
          {boardsMax < 16 && p.boards >= boardsMax && (
            <div style={{ fontSize: 11, color: UI.faint, lineHeight: 1.5, padding: "2px 0 4px" }}>
              {t("この開口・板厚では最大 {n} 枚(コマのノッチが重なるため)。板を薄くすると増やせます", { n: Math.min(16, boardsMax) })}
            </div>
          )}
          {scrubRow({ key: "boardT", label: "板厚", value: p.boardT, display: p.boardT.toFixed(1), min: 1, max: 4, sens: 0.02, round: 0.2, unit: "mm",
            onChange: (v) => setP((o) => ({ ...o, boardT: v })) })}
          {scrubRow({ key: "tabLen", label: "爪の長さ", value: p.tabLen, min: 5, max: 40, sens: 0.2, round: 1, unit: "mm",
            onChange: (v) => setP((o) => ({ ...o, tabLen: v })) })}
          <div style={{ fontSize: 11, color: UI.faint, lineHeight: 1.5, padding: "2px 0 4px" }}>
            {t("首の高さ・張り出しは断面図の◇(最外の制御点)を上下/左右にドラッグ")}
          </div>
          {checkbox(splitRibs, () => setSplitRibs(!splitRibs), <>{t("羽根板を上下2分割")} <span style={{ color: UI.faint }}>{t("(大型用)")}</span></>)}
          {splitRibs && (
            <div style={{ fontSize: 11, color: UI.warn, lineHeight: 1.5, padding: "2px 0 4px" }}>
              {t("⚠ 試験中: 分割部品の爪が現行のコマに嵌まりません(要修正)")}
            </div>
          )}
        </div>

        {/* Bamboo ribs (accordion) */}
        <div style={{ borderTop: `1px solid ${UI.edge}`, marginBottom: 4 }}>
          <div onClick={() => setHigoOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em", color: UI.text }}>{t("竹ひご")}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: mono, fontSize: 11, color: UI.faint }}>⌀{p.higoD} / {p.pitch}mm</span>
              <span style={{ color: UI.faint, fontSize: 11, transform: higoOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
            </span>
          </div>
          {higoOpen && (
            <div style={{ padding: "0 0 10px" }}>
              {scrubRow({ key: "higoD", label: "竹ひご径", value: p.higoD, display: p.higoD.toFixed(1), min: 1, max: 4, sens: 0.02, round: 0.5, unit: "mm",
                onChange: (v) => setP((o) => ({ ...o, higoD: v })) })}
              {scrubRow({ key: "pitch", label: "ひごピッチ", value: p.pitch, min: 8, max: 30, sens: 0.3, round: 1, unit: "mm",
                onChange: (v) => setP((o) => ({ ...o, pitch: v })) })}
              <div style={{ marginTop: 8 }}>
                {checkbox(p.spiral ?? false, () => setP((o) => ({ ...o, spiral: !(o.spiral ?? false) })),
                  <>{t("螺旋巻き")} <span style={{ color: UI.faint }}>{t("(溝を下へ連続させる)")}</span></>)}
              </div>
            </div>
          )}
        </div>

        {/* Print view: print bed settings */}
        {view === "print" && (
          <div style={{ borderTop: `1px solid ${UI.edge}`, paddingTop: 16, marginTop: 4 }}>
            {sectionLabel("プリントベッド")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {[180, 220, 250, 256, 300, 350].map((sz) => {
                const active = bedW === sz && bedD === sz;
                return (
                  <button key={sz} onClick={() => { setBedW(sz); setBedD(sz); }} style={{
                    padding: "6px 11px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", borderRadius: 8, fontFamily: sans,
                    background: active ? accent : UI.card, color: active ? "#fff" : UI.text,
                    border: "1px solid " + (active ? accent : UI.cardEdge),
                  }}>{sz}</button>
                );
              })}
            </div>
            {numInput("幅", bedW, setBedW, 100, 420)}
            {numInput("奥行き", bedD, setBedD, 100, 420)}
            <div style={{ marginTop: 6 }}>
              {p.spiral ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0" }}>
                  <span style={{ fontSize: 12.5, color: UI.text }}>{t("印刷する羽根板")}</span>
                  <span style={{ fontFamily: mono, fontSize: 11, color: UI.faint }}>
                    {t("螺旋: 全")}{p.boards}{t("枚(各1枚)")}
                  </span>
                </div>
              ) : (
                stepper("printRibs", "印刷する羽根板", nRibs, 1, p.boards, 1,
                  (v) => setPrintRibs(v),
                  <>{nRibs}<span style={{ color: UI.faintest, fontWeight: 400 }}> / {p.boards}</span></>)
              )}
            </div>

            {/* Papercraft: print at A4 actual size so it can be made from cardboard/cardstock even without a 3D printer */}
            <div style={{ borderTop: `1px solid ${UI.edge}`, paddingTop: 14, marginTop: 14 }}>
              {sectionLabel("型紙(段ボール)", "A4 原寸")}
              {stepper("matT", "材料の厚み", matT, 1, 10, 0.5, (v) => setMatT(v), `${matT} mm`)}
              <button onClick={() => openHTML(paperHTML(p, matT, undefined, t), "harigata_katagami_a4.html")} style={{
                width: "100%", marginTop: 8, padding: 10, borderRadius: 10, background: UI.card, color: accent,
                border: `1px solid rgba(217,91,24,0.45)`, fontFamily: sans, fontSize: 12.5, fontWeight: 700,
                letterSpacing: "0.04em", cursor: "pointer",
              }}>{t("型紙を開く (A4 原寸)")}</button>
              <div style={{ fontSize: 10.5, color: UI.faint, lineHeight: 1.6, marginTop: 8 }}>
                {t("新しいタブで開きます。「実際のサイズ(100%)」で印刷し、50mm スケールを定規で確認してください。竹ひご溝は切らず目盛線で示します。")}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary (fixed at the bottom) + mode-linked CTA */}
      <div style={{ padding: "16px 20px 18px", borderTop: `1px solid ${UI.edge}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 5, columnGap: 12, fontSize: 12, marginBottom: 14 }}>
          <span style={{ color: UI.faint }}>{t("最大径")}</span>
          <span style={{ fontFamily: mono, fontWeight: 600, textAlign: "right" }}>⌀{maxDia} mm</span>
          <span style={{ color: UI.faint }}>{t("羽根板の全長")}</span>
          <span style={{ fontFamily: mono, fontWeight: 600, textAlign: "right", color: ribLen > bedD ? UI.warn : UI.text }}>
            {ribLen} mm{splitRibs ? t(" (2分割)") : ""}
          </span>
          <span style={{ color: UI.faint }}>{t("上下の開口(半径)")}</span>
          <span style={{ fontFamily: mono, fontWeight: 600, textAlign: "right" }}>
            {topOpen} / {botOpen} mm
          </span>
        </div>

        {view === "print" ? (
          <>
            <button onClick={dlAll} style={{
              width: "100%", padding: 12, border: "none", borderRadius: 10, background: accent, color: "#fff",
              fontFamily: sans, fontSize: 13.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
              boxShadow: "0 3px 10px rgba(217,91,24,0.3)",
            }}>{t("STL 書き出し")}</button>
            <div style={{ fontSize: 10.5, color: UI.faint, lineHeight: 1.6, marginTop: 9 }}>
              {t("コマ・柱は上下同一のため各1つ入っています。スライサーで")}<strong style={{ color: UI.text }}>{t("2つに複製")}</strong>{t("して印刷してください。設定は ")}<span style={{ fontFamily: mono }}>harigata_config.json</span>{t(" として同梱されます(バックアップ用)。")}
            </div>
          </>
        ) : (
          <button onClick={() => setView("print")} style={{
            width: "100%", padding: 12, borderRadius: 10, background: "#fff", color: accent,
            border: "1px solid rgba(217,91,24,0.5)", fontFamily: sans, fontSize: 13.5, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer",
          }}>{t("印刷・書き出しへ進む →")}</button>
        )}
      </div>
    </aside>
  );

  return (
    <div style={{
      display: "flex", flexDirection: narrow ? "column" : "row",
      height: "100%", overflow: "hidden",
      background: "#f2ecdf", color: UI.text, fontFamily: sans,
    }}>
      {viewport}
      {inspector}
    </div>
  );
}
