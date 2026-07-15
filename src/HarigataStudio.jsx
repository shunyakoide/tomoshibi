/**
 * ============================================================================
 * 張型スタジオ (HARIGATA STUDIO) v5 — UI
 * ============================================================================
 * 岐阜提灯 / イサム・ノグチAKARI方式の「あかりランプ」を自作するための
 * 3Dプリント用張型(はりがた=竹ひご巻き・和紙張りの型)ジェネレーター。
 * プロファイル曲線をパラメトリックに調整し、3種のSTL(羽根板/コマ/土台)を出力する。
 *
 * このファイルは React コンポーネント(UI + 3Dビューポート)に専念する。
 * 実際の形状生成・出力・設定は分割済み:
 *   - geometry.js … 断面・3Dジオメトリ(羽根板/コマ/土台)
 *   - draw2d.js   … 2D断面ビューの Canvas 描画
 *   - stl.js      … STL / ZIP 書き出し
 *   - config.js   … プリセット・スライダー・初期値・セクション定義
 *
 * 【ビュー】2d(断面, 既定) / mold(組立) / print(印刷レイアウト) / lit(点灯)
 * 【制作フロー】印刷 → コマ2枚に羽根板8枚を差し込み → 竹ひご巻き → 和紙張り →
 *   乾燥 → コマを外し羽根板を上下開口から抜く → 火袋完成 → 三本脚等で照明化
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
  maxRadius, outerR, cutT, effBoardWidth, standBoardLength,
  ribGeometry, komaGeometry, standGeometry, boardGeometry, ribSplitParts,
  standCollarTop, standSaddleH, standSlotSep,
} from "./geometry.js";
import { exportZip } from "./stl.js";
import SectionEditor from "./SectionEditor.jsx";
import { PRESETS, DEFAULTS, SIL_ROWS } from "./config.js";

export default function HarigataStudio() {
  const [p, setP] = useState(DEFAULTS);
  const [view, setView] = useState("2d"); // 既定は2D断面ビュー(形が分かりやすい)
  const [drag, setDrag] = useState(null);  // ドラッグ中のキー(ハンドル/スクラブ行のハイライト用)
  const [higoOpen, setHigoOpen] = useState(false); // 竹ひごアコーディオンの開閉
  const [printRibs, setPrintRibs] = useState(1); // 印刷ビューで一度に並べる羽根板の枚数
  const [splitRibs, setSplitRibs] = useState(false); // 羽根板を上下2分割(大型ランプ用)
  const [bedW, setBedW] = useState(256); // プリントベッド幅(mm)。機種で異なるので可変
  const [bedD, setBedD] = useState(256); // プリントベッド奥行き(mm)
  const [glError, setGlError] = useState(null);
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 860 : false
  );
  const mountRef = useRef(null);
  const T = useRef({});
  const prevViewRef = useRef(null); // ビュー切替を検知して初期カメラ角を設定するため

  // 画面幅で左右レイアウト / 縦積みを切替
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 860);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    let cleanup;
    try {
      const scene = new THREE.Scene();
    // 背景は mount 側の CSS グラデーションで描く。canvas は透過にして
    // ビューごとに CAD調(明) / 点灯(暗) を切り替える。fog は再構築側で設定。
    const camera = new THREE.PerspectiveCamera(36, 1, 1, 4000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // ポストプロセス: 点灯ビューだけブルーム(発光の滲み)を効かせて「光っている感」を出す。
    // 明ビューでは bloomPass を無効化するので見た目は従来どおり。
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.7); // strength, radius, threshold
    bloomPass.enabled = false;
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    // スタジオ風の環境光(IBL)。Standard/Physical マテリアルに柔らかな映り込みを与え、
    // のっぺり感を解消する。組立/印刷ビューで使用(点灯ビューは暗室演出のため外す)。
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(amb);
    const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(240, 380, 280); scene.add(key);
    const rim = new THREE.DirectionalLight(0x8890a8, 0.35); rim.position.set(-260, 120, -260); scene.add(rim);
    const bulb = new THREE.PointLight(0xffc37a, 0, 900, 1.5); scene.add(bulb);

    // CAD調の地面グリッド(組立ビューのみ表示)。遠方はフォグでbgへ溶ける。
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

    // 点灯ビュー用テクスチャ: 床の暖かい光だまり(中央はやや暗く=真下の影、周りが明るい輪)
    const poolTex = (() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
      g.addColorStop(0.0, "rgba(255,190,120,0.10)"); // 真下: 本体が遮り薄暗い
      g.addColorStop(0.28, "rgba(255,178,105,0.85)"); // 明るい光の輪
      g.addColorStop(1.0, "rgba(255,150,80,0.0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    // 火袋の発光ムラ: 縦方向に中央が最も明るいグラデーション(のっぺり防止)
    const washiGrad = (() => {
      const cv = document.createElement("canvas");
      cv.width = 4; cv.height = 256;
      const ctx = cv.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      // 中央を広いプラトー(明)にして、細い明線が出ないようにする
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
      // 点灯: 床(暗い部屋)と光だまり
      litFloorMat: new THREE.MeshStandardMaterial({ color: 0x0a0d16, roughness: 1, metalness: 0 }),
      litPoolMat: new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      // 羽根板: コート系フィラメント風にごく薄いクリアコートを載せて上質な艶を出す
      ribMat: new THREE.MeshPhysicalMaterial({
        color: 0xc3b291, roughness: 0.5, metalness: 0.0,
        clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.9,
      }),
      // コマ: マットな樹脂。羽根板と仕上げ差をつけて部品の区別を明快に
      komaMat: new THREE.MeshStandardMaterial({ color: 0x94897c, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.85 }),
      // 土台: 焼き締めた陶のような暗いつや消し
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
    // ビューポートの実サイズ変化(左右レイアウト切替・パネル幅など)にも追従
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
      // WebGL 初期化失敗(古い端末 / コンテキスト取得不可 等)。
      // 画面全体を黒にせず UI は残し、原因メッセージだけ表示する。
      setGlError((e && e.message) || String(e));
    }
    return () => { if (cleanup) cleanup(); };
  }, []);

  // プレビュー再構築 + 自動フレーミング
  useEffect(() => {
    const s = T.current;
    if (!s.group) return;
    while (s.group.children.length) {
      const m = s.group.children[0];
      s.group.remove(m);
      m.traverse((o) => o.geometry && o.geometry.dispose());
    }
    const viewChanged = prevViewRef.current !== view; // 初回/ビュー切替時だけ初期カメラ角を設定
    prevViewRef.current = view;
    if (view === "2d") return; // 2D断面ビューは別キャンバスで描画(3D構築はスキップ)
    const R = maxRadius(p);
    const lightVP = view !== "lit"; // 組立/印刷は CAD調の明るい背景、点灯だけ暗い
    s.shadow.scale.set(R * 3.2, R * 3.2, 1);
    s.shadow.visible = view === "mold"; // 組立ビューだけコンタクトシャドウ(点灯は床+光だまりで接地)
    s.shadow.material.opacity = 0.3;
    s.groundGrid.visible = view === "mold";
    // 環境光は明ビューのみ。点灯は暗室に灯りだけ浮かせたいので外す。
    s.scene.environment = lightVP ? s.envMap : null;
    s.scene.fog = view === "print" ? null
      : new THREE.Fog(lightVP ? 0xbfb5a3 : 0x070a11, 1000, 2400);
    // IBL がフィルを担うぶんアンビエントは控えめに。キーを強めてフォルムの陰影を立て、
    // 背景から浮かせる(白飛び防止しつつ図と地のコントラストを確保)。
    s.amb.intensity = view === "print" ? 0.5 : lightVP ? 0.3 : 0.5;
    s.key.intensity = view === "print" ? 0.85 : lightVP ? 1.1 : 0.85;
    s.key.position.set(view === "print" ? 80 : 240, view === "print" ? 500 : 380, view === "print" ? 120 : 280);
    s.bulb.intensity = 0;
    s.washiMat.emissiveIntensity = 0;
    s.bloomPass.enabled = false; // 点灯ビューでのみ有効化(下の lit ブランチ)

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
      const legH = p.height * 0.42; // 三本脚(1AYスタイル)
      // 首(上下端の垂直部)には竹ひご・和紙が無い ＝ 何も張られないので描かない。
      // 火袋(和紙が張られる中央)だけを発光スキンとして表示し、首は開いたまま。
      const cB = cutT(p); // 首の割合(0..0.45)
      const t0 = cB, t1 = 1 - cB;
      const pts = [];
      const N = 160; // 縦方向を細かくサンプルして曲面(シルエット)を滑らかに
      for (let i = 0; i <= N; i++) {
        const t = t0 + (t1 - t0) * (i / N);
        pts.push(new THREE.Vector2(outerR(p, t) + p.higoD, legH + t * p.height));
      }
      s.group.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 128), s.washiMat));
      // 脚: 火袋の底縁から外に開いて床へ。暗背景に沈まないグラファイト(黒鉄の質感は保つ)
      const legMat = new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.4, metalness: 0.3 });
      const r0 = outerR(p, 0) * 0.75, r1 = maxRadius(p) * 0.62;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const topP = new THREE.Vector3(r0 * Math.cos(a), legH + p.height * 0.04, r0 * Math.sin(a));
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
      // 床(暗い部屋) + 暖かい光だまり(あかりが床を照らす)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), s.litFloorMat);
      floor.rotation.x = -Math.PI / 2;
      s.group.add(floor);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), s.litPoolMat);
      pool.rotation.x = -Math.PI / 2; pool.position.y = 0.4;
      const pr = maxRadius(p) * 7;
      pool.scale.set(pr, pr, 1);
      s.group.add(pool);
      // 自己発光として見せる: 外光は最小限にして火袋の emissive とブルームで光らせる。
      // 内部電球は使わない(赤道に明るい帯=線が出るため)。emissive の縦グラデで濃淡を付ける。
      s.amb.intensity = 0.12;
      s.key.intensity = 0.25; s.key.position.set(180, 320, 200);
      s.washiMat.roughness = 1.0;          // 完全つや消し(鏡面ハイライトを消す)
      s.washiMat.emissiveIntensity = 1.15; // 火袋の明るさ
      s.bulb.intensity = 0;                // 内部電球オフ(透けて出る明線を防ぐ)
      s.bloomPass.enabled = true;          // 発光の滲み → 光っている感
      s.bloomPass.strength = 0.6; s.bloomPass.radius = 0.7; s.bloomPass.threshold = 0.85; // 柔らかいハロー
      frame((legH + p.height) * 1.16, R * 1.1, (legH + p.height) * 0.5);
      return;
    }

    const mold = new THREE.Group();
    for (let k = 0; k < p.boards; k++) {
      const mesh = new THREE.Mesh(ribGeometry(p, k), s.ribMat);
      mesh.rotation.y = (k / p.boards) * Math.PI * 2;
      mold.add(mesh);
    }
    // コマは上下同一形状。組立ビューでは上下2箇所に同じジオメトリを配置する。
    const kb = new THREE.Mesh(komaGeometry(p), s.komaMat);
    kb.rotation.x = -Math.PI / 2; kb.position.y = -p.tabLen; // 下コマ
    mold.add(kb);
    const kt = new THREE.Mesh(komaGeometry(p), s.komaMat);
    kt.rotation.x = Math.PI / 2; kt.position.y = p.height + p.tabLen; // 上コマ(同一)
    mold.add(kt);

    if (view === "mold") {
      // 実際の作業姿勢: 型を横倒しにして土台の2つのサドルに載せた状態を見せる。
      const collarTop = standCollarTop();           // 柱脚が乗る高さ(襟の天面)
      const komaY = collarTop + standSaddleH(p);     // コマ中心 = サドル中心の高さ
      const sep = standSlotSep(p);                   // コマ中心間隔 = 柱間隔(コマ着座位置基準)
      // 型を横倒し(軸をX方向へ)。回転後コマ中心が X=±sep/2, Y=komaY に来るよう配置。
      mold.rotation.z = Math.PI / 2;
      mold.position.set(p.height / 2, komaY, 0);
      s.group.add(mold);
      // 土台: ベース板(床に平置き) + 柱×2(サドルでコマを受ける)
      const board = new THREE.Mesh(boardGeometry(p), s.standMat);
      board.rotation.x = -Math.PI / 2;              // 厚み(襟)を上向きにして床へ平置き
      s.group.add(board);
      for (const sgn of [-1, 1]) {
        const col = new THREE.Mesh(standGeometry(p), s.standMat);
        col.rotation.y = Math.PI / 2;               // 板厚方向を型軸(X)へ向ける
        col.position.set((sgn * sep) / 2, collarTop, 0);
        s.group.add(col);
      }
      s.shadow.scale.set(R * 3.2, R * 3.2, 1);
      if (viewChanged) { s.rot.x = -0.12; s.rot.y = 0.32; } // 横から(型軸に沿って)見た初期アングル
      const top = komaY + R;                         // 型の最上点
      frame(top * 1.2, Math.max(standBoardLength(p) / 2, R) * 1.25, top * 0.5);
    } else {
      // 印刷ビュー: Bambu Lab A1 (256×256mm)。種別ごとにセル計算しプレートを田の字配置
      const BEDW = bedW, BEDD = bedD, GAP = 8;
      const nRibs = Math.min(printRibs, p.boards); // 印刷する羽根板の枚数(1..boards)
      const ribs = [];
      for (let k = 0; k < nRibs; k++) {
        if (splitRibs) {
          const sp = ribSplitParts(p, k);
          ribs.push({ geo: sp.bottom, mat: s.ribMat }, { geo: sp.top, mat: s.ribMat }, { geo: sp.splice, mat: s.komaMat });
        } else {
          ribs.push({ geo: ribGeometry(p, k), mat: s.ribMat });
        }
      }
      // コマ・柱は上下同一なので各1つだけ出力(印刷時にユーザーが複製・配置)。
      // STL 出力が別々なので、プレビューでも別プレートに分ける。
      const komas = [{ geo: komaGeometry(p), mat: s.komaMat }];
      const stands = [{ geo: standGeometry(p), mat: s.standMat }];
      // ベース板は長さが火袋高さで変わるため別プレートに。柱の配置が動かないようにする
      const boards = [{ geo: boardGeometry(p), mat: s.standMat }];

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
          const onPlate = Math.min(per, items.length - Math.floor(i / per) * per); // このプレートの部品数
          const uc = Math.min(cols, onPlate), ur = Math.ceil(onPlate / cols);       // 実使用の列・行数
          const gridW = uc * cW - GAP, gridD = ur * cD - GAP;
          const ox0 = Math.max(2, (BEDW - gridW) / 2), oz0 = Math.max(2, (BEDD - gridD) / 2); // ベッド中央に配置
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

      const plates = plateIdx;
      const pCols = Math.ceil(Math.sqrt(plates));
      const pRows = Math.ceil(plates / pCols);
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x1e1e23, roughness: 0.9 });
      const platePos = (pl) => [(pl % pCols) * (BEDW + 40), Math.floor(pl / pCols) * (BEDD + 40)];
      const gridDivs = Math.max(2, Math.round(BEDW / 32)); // ≒32mm セル
      for (let pl = 0; pl < plates; pl++) {
        const [px, pz] = platePos(pl);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(BEDW, 2, BEDD), plateMat);
        plate.position.set(px + BEDW / 2, -1, pz + BEDD / 2);
        s.group.add(plate);
        const grid = new THREE.GridHelper(BEDW, gridDivs, 0x3f3f46, 0x2c2c31);
        grid.scale.z = BEDD / BEDW; // 長方形ベッドに合わせて奥行き方向を伸縮
        grid.position.set(px + BEDW / 2, 0.15, pz + BEDD / 2);
        s.group.add(grid);
      }
      placed.forEach((pt) => {
        const [px, pz] = platePos(pt.plate);
        const m = new THREE.Mesh(pt.geo, pt.mat);
        m.rotation.x = -Math.PI / 2;
        // rotation.x=-90° で local z → world y。部品の z 下端がプレートに乗るよう持ち上げる
        // (土台の柱は z 中央基準なので、固定 0.6 だと厚みの半分めり込む)
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

  // 印刷する羽根板の枚数(1..boards)。boards が減った場合に備えて clamp。
  const nRibs = Math.min(printRibs, p.boards);

  const dlAll = () => { // 全部品を別STLとして1つのZIPにまとめる
    const spread = (geos, gap) => { // X方向に並べて重なり回避
      let x = 0;
      for (const g of geos) {
        g.computeBoundingBox();
        const bb = g.boundingBox;
        g.translate(x - bb.min.x, 0, 0);
        x += (bb.max.x - bb.min.x) + gap;
      }
      return geos;
    };
    let ribs = [];
    if (splitRibs) {
      const parts = [];
      for (let k = 0; k < nRibs; k++) { const sp = ribSplitParts(p, k); parts.push(sp.bottom, sp.top, sp.splice); }
      ribs = spread(parts, 15);
    } else {
      const w = maxRadius(p) + 12;
      for (let k = 0; k < nRibs; k++) {
        const g = ribGeometry(p, k);
        g.translate(k * w, p.tabLen, p.boardT / 2);
        ribs.push(g);
      }
    }
    // コマ・柱は上下同一なので各1つだけ書き出す(印刷時に2つ複製して使う)。
    const board = boardGeometry(p);
    exportZip([
      { name: `harigata_ribs_x${nRibs}.stl`, geos: ribs },
      { name: "harigata_koma_print2.stl", geos: [komaGeometry(p)] },
      { name: "harigata_stand_column_print2.stl", geos: [standGeometry(p)] },
      { name: "harigata_stand_base.stl", geos: [board] },
    ], "harigata_kit.zip");
  };

  const maxDia = Math.round(maxRadius(p) * 2);
  const boardLen = Math.round(p.height + p.tabLen * 2); // 羽根板の全長
  const connLen = Math.round(standBoardLength(p));      // 連結板の全長(最も長い部品)
  const heightLimit = bedD - Math.round(standBoardLength(p) - p.height); // 収めるための高さ上限
  // 抜き取り判定: 乾燥後、コマを外して羽根を上下どちらかの開口から抜く。
  // 開口=上端/下端の円(半径)。羽根の幅より広い開口が片側にあれば取り出せる。
  const topOpen = Math.round(outerR(p, 1)); // 上の円 半径
  const botOpen = Math.round(outerR(p, 0)); // 下の円 半径
  const canExtract = Math.max(topOpen, botOpen) >= effBoardWidth(p);

  // ベッド超過の判定。羽根板は上下2分割で半分にできる(→アクションで解決)。連結板は
  // 高さを下げるしかない。どの部品が超過しているかを可視化し、可能ならその場で分割適用。
  const ribLen = splitRibs ? Math.round(boardLen / 2) + 12 : boardLen; // 分割時は継手ぶん+12
  const overParts = [];
  if (ribLen > bedD) overParts.push(`羽根板 ${ribLen}mm`);
  if (connLen > bedD) overParts.push(`連結板 ${connLen}mm`);
  const bedWarn = overParts.length > 0;
  const canSplitFix = boardLen > bedD && !splitRibs; // 羽根板の超過は分割で解決できる

  const PANEL = 336; // インスペクタ幅(px)
  const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
  const sans = "'IBM Plex Sans JP', 'Hiragino Sans', system-ui, sans-serif";
  const isLit = view === "lit";   // 点灯ビュー=鑑賞モード(パネル非表示・暗背景)
  const accent = "#D95B18";       // アクセント = 和紙の灯りのオレンジ

  // インスペクタ:和紙色の明るい暖色ニュートラル(README Design Tokens)
  const UI = {
    panel: "#fbf8f1", edge: "rgba(59,52,43,0.1)", head: "#3b342b",
    text: "#3b342b", sub: "#8a7c66", faint: "#a1937c", faintest: "#c0b298",
    card: "#fff", cardEdge: "rgba(59,52,43,0.09)", warn: "#c23c12",
  };
  // ビューポート背景(組立/印刷=寒色ニュートラルCAD調、点灯=暗)。断面は SectionEditor 側。
  const vpBg = isLit
    ? "radial-gradient(circle at 50% 40%, #1b2230 0%, #070a11 100%)"
    : "radial-gradient(circle at 50% 34%, #eef0f3 0%, #c3c8d0 52%, #939ba6 100%)";
  const chip = isLit
    ? { bg: "rgba(16,16,18,0.72)", edge: "rgba(255,255,255,0.08)", txt: "#8a8a96" }
    : { bg: "rgba(255,255,255,0.85)", edge: "rgba(59,52,43,0.08)", txt: "#8a7c66" };

  const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

  // 左右ドラッグで数値を微調整(スクラブ)。ドラッグ中は drag=key でハイライト。
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

  // スクラブ行(ラベル + 値)。card=白カード内の行(区切り線あり)。
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
        <span style={{ fontSize: 12.5, color: UI.text }}>{cfg.label}</span>
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
      <span style={{ fontSize: 12.5, color: UI.text }}>{label}</span>
    </div>
  );

  // プリセットアイコン:実プロファイル(スプライン)から生成した小さなシルエット
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

  // ±ボタンのステッパー(離散整数向け)
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
        <span style={{ fontSize: 12.5, color: UI.text }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {sq("−", () => onChange(clamp(min, max, +(value - step).toFixed(2))), value <= min)}
          <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: UI.text, minWidth: 44, textAlign: "center" }}>{valueText}</span>
          {sq("＋", () => onChange(clamp(min, max, +(value + step).toFixed(2))), value >= max)}
        </div>
      </div>
    );
  };

  // 数値入力(ベッド寸法向け。Enter/フォーカス外しで確定・クランプ)
  const numInput = (label, value, setValue, min, max) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
      <span style={{ fontSize: 12.5, color: UI.text }}>{label}</span>
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
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", color: UI.faint }}>{txt}</span>
      {extra && <span style={{ fontSize: 10, color: UI.faintest }}>{extra}</span>}
    </div>
  );

  // ============ 左:ビューポート ============
  const viewport = (
    <main style={{
      position: "relative", minWidth: 0, minHeight: 0,
      flex: narrow ? "0 0 auto" : "1 1 auto",
      height: narrow ? "44vh" : "auto",
    }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0, background: vpBg, transition: "background 0.3s" }} />
      {/* 断面ビュー:直接操作エディタ(WebGLキャンバスの上に重ねる) */}
      {view === "2d" && <SectionEditor p={p} setP={setP} accent={accent} drag={drag} setDrag={setDrag} />}

      {glError && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 10, padding: 24,
          textAlign: "center", pointerEvents: "none",
        }}>
          <div style={{ fontSize: 13, color: "#e0a060", fontWeight: 600 }}>⚠ 3Dプレビューを初期化できませんでした</div>
          <div style={{ fontSize: 11, color: "#8a8a96", fontFamily: mono, wordBreak: "break-word" }}>{glError}</div>
          <div style={{ fontSize: 11, color: "#6f6f7a" }}>
            お使いのブラウザで WebGL が無効の可能性があります。STLの生成・DLは引き続き利用できます。
          </div>
        </div>
      )}

      {/* モードタブ */}
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
          }}>{l}</button>
        ))}
      </div>

      {/* 寸法チップ(常時ライブ更新) */}
      <div style={{
        position: "absolute", top: 24, right: 24, fontSize: 12, color: chip.txt,
        fontFamily: mono, letterSpacing: "0.05em", textAlign: "right", pointerEvents: "none",
      }}>
        ⌀{maxDia} × H{p.height} mm
      </div>

      {/* ベッド超過警告(クリックで羽根板を上下2分割) */}
      {!isLit && bedWarn && (
        <button
          onClick={canSplitFix ? () => setSplitRibs(true) : undefined}
          style={{
            position: "absolute", bottom: 20, left: 20, display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", background: "#fff", border: "1px solid rgba(217,91,24,0.4)",
            borderRadius: 10, boxShadow: "0 3px 12px rgba(59,52,43,0.1)", fontFamily: sans,
            fontSize: 12.5, color: UI.text, textAlign: "left",
            cursor: canSplitFix ? "pointer" : "default", maxWidth: "60%",
          }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <span>
            {overParts.join(" · ")} がベッド {bedD}mm を超過<br />
            {canSplitFix
              ? <span style={{ color: accent, fontWeight: 700 }}>→ 羽根板を上下2分割にする</span>
              : <span style={{ color: UI.sub }}>→ 火袋の高さを {heightLimit}mm 以下に</span>}
          </span>
        </button>
      )}

      {/* 点灯モードの補足 */}
      {isLit && (
        <div style={{
          position: "absolute", bottom: 20, left: 20, fontSize: 11.5, color: "#8a8a96",
          fontFamily: sans, pointerEvents: "none",
        }}>
          鑑賞モード — 編集はタブで「断面」へ
        </div>
      )}
    </main>
  );

  // ============ 右:インスペクタ(点灯モードでは非表示) ============
  const inspector = isLit ? null : (
    <aside style={{
      display: "flex", flexDirection: "column",
      width: narrow ? "auto" : PANEL, flex: narrow ? "1 1 auto" : `0 0 ${PANEL}px`,
      minHeight: 0, background: UI.panel, color: UI.text,
      borderLeft: narrow ? "none" : `1px solid ${UI.edge}`,
      borderTop: narrow ? `1px solid ${UI.edge}` : "none",
    }}>
      {/* ヘッダー */}
      <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.04em", color: UI.head }}>
          張型 <span style={{ fontSize: 11.5, fontWeight: 400, color: UI.faint }}>スタジオ</span>
        </div>
        <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.12em", color: UI.faintest }}>LAMP KIT</div>
      </div>

      {/* スクロール領域 */}
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "6px 20px 16px" }}>
        {/* 形プリセット */}
        <div style={{ marginBottom: 20 }}>
          {sectionLabel("形")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
            {PRESETS.map((pr) => {
              const active = p.shape === pr.key;
              return (
                <button key={pr.key}
                  onClick={() => setP((o) => ({ ...o, shape: pr.key, rTop: pr.rTop, rBot: pr.rBot, pts: pr.pts.map((q) => ({ ...q })) }))}
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
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{pr.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* シルエット(スクラブ) */}
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

        {/* 骨組み */}
        <div style={{ marginBottom: 20 }}>
          {sectionLabel("骨組み")}
          {stepper("boards", "羽根板の枚数", p.boards, 4, 16, 1,
            (v) => setP((o) => ({ ...o, boards: v })),
            <>{p.boards}<span style={{ color: UI.faintest, fontWeight: 400 }}> 枚</span></>)}
          {scrubRow({ key: "boardT", label: "板厚", value: p.boardT, display: p.boardT.toFixed(1), min: 1, max: 4, sens: 0.02, round: 0.2, unit: "mm",
            onChange: (v) => setP((o) => ({ ...o, boardT: v })) })}
          {scrubRow({ key: "tabLen", label: "爪の長さ", value: p.tabLen, min: 5, max: 40, sens: 0.2, round: 1, unit: "mm",
            onChange: (v) => setP((o) => ({ ...o, tabLen: v })) })}
          <div style={{ display: "flex", gap: 16, padding: "7px 0" }}>
            {checkbox(p.neckBot ?? p.neckOn ?? true, () => setP((o) => ({ ...o, neckBot: !(o.neckBot ?? o.neckOn ?? true) })), "下の首")}
            {checkbox(p.neckTop ?? p.neckOn ?? true, () => setP((o) => ({ ...o, neckTop: !(o.neckTop ?? o.neckOn ?? true) })), "上の首")}
          </div>
          <div style={{ fontSize: 11, color: UI.faint, lineHeight: 1.5, padding: "2px 0 4px" }}>
            首の高さ・張り出しは断面図の◇(最外の制御点)を上下/左右にドラッグ
          </div>
          {checkbox(splitRibs, () => setSplitRibs(!splitRibs), <>羽根板を上下2分割 <span style={{ color: UI.faint }}>(大型用)</span></>)}
        </div>

        {/* 竹ひご(アコーディオン) */}
        <div style={{ borderTop: `1px solid ${UI.edge}`, marginBottom: 4 }}>
          <div onClick={() => setHigoOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em", color: UI.text }}>竹ひご</span>
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
              {checkbox(p.spiral, () => setP((o) => ({ ...o, spiral: !o.spiral })), "螺旋巻き用に溝をずらす")}
            </div>
          )}
        </div>

        {/* 印刷ビュー:プリントベッド設定 */}
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
              {stepper("printRibs", "印刷する羽根板", nRibs, 1, p.boards, 1,
                (v) => setPrintRibs(v),
                <>{nRibs}<span style={{ color: UI.faintest, fontWeight: 400 }}> / {p.boards}</span></>)}
            </div>
          </div>
        )}
      </div>

      {/* サマリー(下部固定)+ モード連動 CTA */}
      <div style={{ padding: "16px 20px 18px", borderTop: `1px solid ${UI.edge}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 5, columnGap: 12, fontSize: 12, marginBottom: 14 }}>
          <span style={{ color: UI.faint }}>最大径</span>
          <span style={{ fontFamily: mono, fontWeight: 600, textAlign: "right" }}>⌀{maxDia} mm</span>
          <span style={{ color: UI.faint }}>羽根板の全長</span>
          <span style={{ fontFamily: mono, fontWeight: 600, textAlign: "right", color: ribLen > bedD ? UI.warn : UI.text }}>
            {ribLen} mm{splitRibs ? " (2分割)" : ""}
          </span>
          <span style={{ color: UI.faint }}>上下の開口(半径)</span>
          <span style={{ fontFamily: mono, fontWeight: 600, textAlign: "right", color: canExtract ? UI.text : UI.warn }}>
            {topOpen} / {botOpen} mm{canExtract ? "" : " ⚠"}
          </span>
        </div>

        {view === "print" ? (
          <>
            <button onClick={dlAll} style={{
              width: "100%", padding: 12, border: "none", borderRadius: 10, background: accent, color: "#fff",
              fontFamily: sans, fontSize: 13.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
              boxShadow: "0 3px 10px rgba(217,91,24,0.3)",
            }}>STL 書き出し</button>
            <div style={{ fontSize: 10.5, color: UI.faint, lineHeight: 1.6, marginTop: 9 }}>
              コマ・柱は上下同一のため各1つ入っています。スライサーで<strong style={{ color: UI.text }}>2つに複製</strong>して印刷してください。
            </div>
          </>
        ) : (
          <button onClick={() => setView("print")} style={{
            width: "100%", padding: 12, borderRadius: 10, background: "#fff", color: accent,
            border: "1px solid rgba(217,91,24,0.5)", fontFamily: sans, fontSize: 13.5, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer",
          }}>印刷・書き出しへ進む →</button>
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
