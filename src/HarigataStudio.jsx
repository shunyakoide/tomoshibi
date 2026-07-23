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
  maxRadius, outerR, cutT, standBoardLength, maxBoards, grooveR, grooveList,
  ribGeometry, komaGeometry, standGeometry, boardGeometry, ribSplitParts,
  standCollarTop, standSaddleH, standSlotSep, bakeBezierHandles,
} from "./geometry.js";
import { exportZip, openHTML } from "./stl.js";
import { paperHTML } from "./papercraft.js";
import { clamp } from "./util.js";
import { loadSaved, saveState, STORAGE_KEY, SCHEMA_VERSION } from "./persist.js";
import SectionEditor from "./SectionEditor.jsx";
import { PRESETS, DEFAULTS, SIL_ROWS } from "./config.js";
import { makeT, loadLang, saveLang } from "./i18n.js";

// 起動時に1回だけ localStorage から復元(遅延初期化の重複パースを避けるためモジュール直下)。
const SAVED = typeof window !== "undefined" ? loadSaved() : null;

export default function HarigataStudio() {
  const [p, setP] = useState(SAVED?.p ?? DEFAULTS); // 復元(無ければ既定)
  const [view, setView] = useState("2d"); // 既定は2D断面ビュー(形が分かりやすい)。一時状態なので復元しない
  const [drag, setDrag] = useState(null);  // ドラッグ中のキー(ハンドル/スクラブ行のハイライト用)
  const [higoOpen, setHigoOpen] = useState(false); // 竹ひごアコーディオンの開閉
  const [printRibs, setPrintRibs] = useState(SAVED?.printRibs ?? 1); // 印刷ビューで一度に並べる羽根板の枚数
  const [splitRibs, setSplitRibs] = useState(false); // 羽根板を上下2分割(試験機能なので復元しない=常に false 起動)
  const [bedW, setBedW] = useState(SAVED?.bedW ?? 256); // プリントベッド幅(mm)。機種設定として復元
  const [bedD, setBedD] = useState(SAVED?.bedD ?? 256); // プリントベッド奥行き(mm)
  const [matT, setMatT] = useState(SAVED?.matT ?? 5);   // 型紙の材料厚(mm)。段ボールの実測厚。機種設定として復元
  const [sel, setSel] = useState(null); // 断面エディタで選択中の制御点 index(一時状態=復元しない)
  const [editMode, setEditMode] = useState("move"); // 断面エディタ: "move"=点を動かす / "curve"=接線ハンドル
  const [glError, setGlError] = useState(null);
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 860 : false
  );
  const [lang, setLang] = useState(loadLang());   // UI 言語(ja/en)。localStorage に保存
  const t = makeT(lang);                          // 翻訳関数(未訳は日本語へフォールバック)
  const toggleLang = () => setLang((l) => { const nx = l === "ja" ? "en" : "ja"; saveLang(nx); return nx; });
  const mountRef = useRef(null);
  const T = useRef({});
  const prevViewRef = useRef(null); // ビュー切替を検知して初期カメラ角を設定するため

  // 画面幅で左右レイアウト / 縦積みを切替
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 860);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 羽根板の枚数をコマに挿さる上限へ自動で収める。板厚・公差・開口(◇)を変えて枚数が
  // 過大になった場合(どの操作経路でも)ここで下げる → ノッチが重なった非水密コマを作らせない。
  const boardsMax = maxBoards(p);
  useEffect(() => {
    if (p.boards > boardsMax) setP((o) => ({ ...o, boards: boardsMax }));
  }, [p.boards, boardsMax]);

  // 作業状態を localStorage へ自動保存。debounce 300ms でドラッグ中の連続更新の書き込み
  // 暴発を抑え、pagehide(タブクローズ/遷移)では即 flush して直近の1操作も取りこぼさない。
  // boards クランプ effect の後段なので、保存される値は常にクランプ後(非水密コマにならない)。
  useEffect(() => {
    const state = { p, bedW, bedD, printRibs, matT };
    const id = setTimeout(() => saveState(state), 300);
    const flush = () => { clearTimeout(id); saveState(state); };
    window.addEventListener("pagehide", flush);
    return () => { clearTimeout(id); window.removeEventListener("pagehide", flush); };
  }, [p, bedW, bedD, printRibs, matT]);

  // ---- Undo/Redo(形状 p の履歴)----
  // p の履歴スタック + 現在位置。ドラッグ/スクラブの連続変更は debounce で1エントリにまとめ、
  // プリセット切替・点の追加削除・角⇄なめらか等の離散操作も同じ経路でスナップされる。setP の
  // 全サイトは触らず「p を watch して落ち着いたら commit」する方式(単一チョークポイント不在の回避)。
  const hist = useRef([p]);        // スナップショット列(0 が最古)
  const hIdx = useRef(0);          // 現在位置
  const restoring = useRef(false); // undo/redo による setP は再 commit しない印
  const commitTimer = useRef(null);
  const [, bumpHist] = useState(0); // ボタンの活性/非活性を更新するための再描画トリガ
  const HIST_CAP = 60;
  const commitNow = (np) => {
    const h = hist.current;
    if (JSON.stringify(h[hIdx.current]) === JSON.stringify(np)) return; // 変化なしは積まない
    h.splice(hIdx.current + 1);     // redo 側(やり直し可能な先)を捨てる
    h.push(np);
    if (h.length > HIST_CAP) h.shift();
    hIdx.current = h.length - 1;
    bumpHist((n) => n + 1);
  };
  useEffect(() => {
    if (restoring.current) { restoring.current = false; return; } // 復元による変化は積まない
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => commitNow(p), 350); // 連続操作が落ち着いたら1エントリ
    return () => clearTimeout(commitTimer.current);
  }, [p]);
  const undo = () => {
    clearTimeout(commitTimer.current);
    commitNow(p);                  // 未確定の変更をまず確定(redo で戻れるように)
    if (hIdx.current <= 0) return;
    hIdx.current--;
    restoring.current = true;
    setP(hist.current[hIdx.current]);
    bumpHist((n) => n + 1);
  };
  const redo = () => {
    clearTimeout(commitTimer.current);
    commitNow(p);                  // 未確定の編集をまず確定(undo と対称)。新編集後は redo 先が
                                   // 破棄され no-op になる = 標準的な undo/redo 挙動。取りこぼさない。
    if (hIdx.current >= hist.current.length - 1) return;
    hIdx.current++;
    restoring.current = true;
    setP(hist.current[hIdx.current]);
    bumpHist((n) => n + 1);
  };
  const canUndo = hIdx.current > 0;
  const canRedo = hIdx.current < hist.current.length - 1;
  // キーボード: Cmd/Ctrl+Z = undo、Cmd/Ctrl+Shift+Z または Ctrl+Y = redo。入力中は無視。
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
      // 竹ひご: 火袋の水平リング。実物は和紙を竹ひごの上に貼るので、竹ひごは紙の内側にある。
      // リング中心を outerR に置く → 外面は outerR+higoD/2 = 和紙(outerR+higoD)の内側に収まり、
      // 面が一致して Z ファイティング(破線状のちらつき)になるのを防ぐ。色は竹本来のナチュラル色
      // (淡い黄褐色)。逆光で黒く潰れないよう暖色の自発光を強めに足し、透ける竹ひごとして見せる。
      const higoMat = new THREE.MeshStandardMaterial({
        color: 0xc2a266, roughness: 0.75, metalness: 0,
        emissive: 0x936026, emissiveIntensity: 0.7,
      });
      for (const gy of grooveList(p, grooveR(p))) {
        const t = gy / p.height;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(outerR(p, t), p.higoD / 2, 10, 96), higoMat);
        ring.rotation.x = Math.PI / 2; ring.position.y = legH + gy;
        s.group.add(ring);
      }
      // 脚: 火袋の底縁(=下の開口)から外に開いて床へ。暗背景に沈まないグラファイト(黒鉄の質感は保つ)
      const legMat = new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.4, metalness: 0.3 });
      // 付け根はスキンの底縁に一致させる: 半径・高さとも t0(=火袋の下端)の値を使う。
      const rimR = outerR(p, t0) + p.higoD, rimY = legH + t0 * p.height;
      // 開口の黒い縁(リング)。三脚がこの縁に接続する。脚と同じ太さ・素材で一体に見せる。
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 1.8, 14, 96), legMat);
      rim.rotation.x = Math.PI / 2; rim.position.y = rimY;
      s.group.add(rim);
      // 足先は付け根より外へ = 開口から床へまっすぐ広がる三脚(内へすぼませない)。
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
      // 切替時だけ初期アングルを「横から(ほぼ目線)」に。これが無いと直前ビュー(印刷=真上
      // 見下ろし rot.x=-1.35)の角度を引き継いで上から覗く絵になる。
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
    // 設定 JSON を同梱: 刷った kit の ZIP 自体が設計のバックアップになる(localStorage が
    // 消えても復元の元になる)。persist.js と同じスキーマなので将来の JSON 読込でそのまま使える。
    const cfg = JSON.stringify({ schemaVersion: SCHEMA_VERSION, p, bedW, bedD }, null, 2);
    exportZip([
      { name: `harigata_ribs_x${nRibs}.stl`, geos: ribs },
      { name: "harigata_koma_print2.stl", geos: [komaGeometry(p)] },
      { name: "harigata_stand_column_print2.stl", geos: [standGeometry(p)] },
      { name: "harigata_stand_base.stl", geos: [board] },
    ], "harigata_kit.zip", [{ name: "harigata_config.json", bytes: new TextEncoder().encode(cfg) }]);
  };

  const maxDia = Math.round(maxRadius(p) * 2);
  const boardLen = Math.round(p.height + p.tabLen * 2); // 羽根板の全長
  const connLen = Math.round(standBoardLength(p));      // 連結板の全長(最も長い部品)
  const heightLimit = bedW - Math.round(standBoardLength(p) - p.height); // 連結板を幅に収める高さ上限
  // 上下の開口(=上端/下端の円)の半径。参考表示(羽根はコマを外し傾けて抜くので、
  // 単純な「開口 ≧ 羽根幅」では抜けるかを判定できない → 誤警告になるため判定はしない)。
  const topOpen = Math.round(outerR(p, 1)); // 上の開口 半径
  const botOpen = Math.round(outerR(p, 0)); // 下の開口 半径

  // ベッド超過の判定。部品ごとに載る軸が違う: 羽根板は長軸=高さ方向 → 奥行き bedD、
  // 連結板は長軸=長さ方向 → 幅 bedW。羽根板は上下2分割で半分にできるが、連結板は
  // 分割できないので高さを下げるしかない。
  const ribLen = splitRibs ? Math.round(boardLen / 2) + 12 : boardLen; // 分割時は継手ぶん+12
  const overParts = [];
  if (ribLen > bedD) overParts.push(t("羽根板 {n}mm", { n: ribLen }));
  if (connLen > bedW) overParts.push(t("連結板 {n}mm", { n: connLen }));
  const bedWarn = overParts.length > 0;
  // 2分割モードは分割部品の爪が本体(コマ基準)と不一致で現行コマに嵌まらない(要修正)。
  // 直るまで自動適用は勧めず、高さを下げる案内に一本化する。
  const canSplitFix = false;

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
        <span style={{ fontSize: 12.5, color: UI.text }}>{t(label)}</span>
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

  // ============ 左:ビューポート ============
  const viewport = (
    <main style={{
      position: "relative", minWidth: 0, minHeight: 0,
      flex: narrow ? "0 0 auto" : "1 1 auto",
      height: narrow ? "44vh" : "auto",
    }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0, background: vpBg, transition: "background 0.3s" }} />
      {/* 断面ビュー:直接操作エディタ(WebGLキャンバスの上に重ねる) */}
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
          }}>{t(l)}</button>
        ))}
      </div>

      {/* 寸法チップ(常時ライブ更新) */}
      <div style={{
        position: "absolute", top: 24, right: 24, fontSize: 12, color: chip.txt,
        fontFamily: mono, letterSpacing: "0.05em", textAlign: "right", pointerEvents: "none",
      }}>
        ⌀{maxDia} × H{p.height} mm
      </div>

      {/* ベッド超過警告(部品ごとに載る軸が違うのでベッドは幅×奥行きで示す) */}
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

      {/* 点灯モードの補足 */}
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

      {/* スクロール領域 */}
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "6px 20px 16px" }}>
        {/* 上段ツールバー: 元に戻す/やり直し(形状の編集) と 初期化 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[["↺", "元に戻す", undo, canUndo], ["↻", "やり直し", redo, canRedo]].map(([icon, label, fn, on]) => (
              <button key={label} onClick={on ? fn : undefined} disabled={!on} title={`${t(label)} (${icon === "↺" ? "⌘Z" : "⇧⌘Z"})`}
                style={{
                  display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 12px",
                  borderRadius: 8, fontFamily: sans, fontSize: 12.5, fontWeight: 600,
                  background: on ? UI.card : "transparent", color: on ? accent : UI.faintest,
                  border: `1px solid ${on ? "rgba(217,91,24,0.4)" : UI.cardEdge}`,
                  cursor: on ? "pointer" : "default", opacity: on ? 1 : 0.55,
                }}>
                <span style={{ fontSize: 17, lineHeight: 1 }}>{icon}</span>{t(label)}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (!window.confirm(t("すべての設定を初期状態に戻します。よろしいですか?"))) return;
              try { localStorage.removeItem(STORAGE_KEY); } catch { /* 無効でも続行 */ }
              setP(DEFAULTS); setBedW(256); setBedD(256); setPrintRibs(1); setSplitRibs(false);
            }}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
              fontFamily: sans, fontSize: 11, color: UI.faint, textDecoration: "underline",
            }}>{t("初期化")}</button>
        </div>
        {/* 形プリセット */}
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

        {/* 選択中の点カード(断面ビューのみ)。SVG上の隠しジェスチャを明示UIに: 数値入力・
            なめらか/角トグル・削除。geometry には触れない(pts の r/t/sharp を編集するだけ)。 */}
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
          // カーブ調整モードへ入る時、まだハンドルが無ければ現在の Hermite 曲線から焼き込む
          // (形は変わらない)。以降 outerR はベジェ評価になり、ハンドルで角度を編集できる。
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
          <div style={{ display: "flex", gap: 16, padding: "7px 0" }}>
            {checkbox(p.neckBot ?? p.neckOn ?? true, () => setP((o) => ({ ...o, neckBot: !(o.neckBot ?? o.neckOn ?? true) })), "下の首")}
            {checkbox(p.neckTop ?? p.neckOn ?? true, () => setP((o) => ({ ...o, neckTop: !(o.neckTop ?? o.neckOn ?? true) })), "上の首")}
          </div>
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

        {/* 竹ひご(アコーディオン) */}
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

            {/* 型紙: 3Dプリンタが無くても段ボール・厚紙で作れるように原寸 A4 で刷る */}
            <div style={{ borderTop: `1px solid ${UI.edge}`, paddingTop: 14, marginTop: 14 }}>
              {sectionLabel("型紙(段ボール)", "A4 原寸")}
              {stepper("matT", "材料の厚み", matT, 1, 10, 0.5, (v) => setMatT(v), `${matT} mm`)}
              <button onClick={() => openHTML(paperHTML(p, matT), "harigata_katagami_a4.html")} style={{
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

      {/* サマリー(下部固定)+ モード連動 CTA */}
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
