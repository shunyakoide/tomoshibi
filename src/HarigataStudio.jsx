/**
 * ============================================================================
 * 張型スタジオ (HARIGATA STUDIO) v5
 * ============================================================================
 * 【概要】
 * 岐阜提灯 / イサム・ノグチAKARI方式の「あかりランプ」を自作するための
 * 3Dプリント用張型(はりがた=竹ひご巻き・和紙張りの型)ジェネレーター。
 * プロファイル曲線をパラメトリックに調整し、以下3種のSTLを出力する:
 *   1. 羽根板 (rib)   … 型の縦骨。外周縁に竹ひご用の半円溝を持つ板×N枚
 *   2. コマ (koma)    … 上下端の丸板。縁から切り込む開放ノッチ(歯車状)で
 *                        羽根板の端タブを保持。和紙乾燥後に外して型を抜く
 *   3. 土台 (stand)   … 作業台。コマの縁を直接受けるU字サドル×左右2個。
 *                        型を横置きし回しながらひご巻き/和紙張りできる
 *                        (心棒は使わない — akari-ozeki.com/make/ の写真準拠)
 *
 * 【制作フロー(実物側)】
 * 印刷 → コマ2枚のノッチに羽根板8枚を番号順に差し込み(0番はキー=深い) →
 * 溝に竹ひごを螺旋or平行に巻く → 糊+和紙を張る → 乾燥 → コマを外し
 * 羽根板を上下開口から1枚ずつ抜く → 火袋完成 → 三本脚等の照明化
 *
 * 【座標系・単位】
 * - 全寸法mm。Three.jsのY-up。STL出力はZ-up変換なし
 *   (羽根板/コマ/土台はXY平面シェイプ+Z押し出し=そのまま平置き印刷向き)
 * - prof(p, t): 高さ正規化 t∈[0,1] → 半径mm。curve種別でシルエット決定
 *   egg/sphere/cocoon/gourd/barrel/bud (AKARI系プリセット対応)
 *
 * 【主要パラメータ (state p)】
 * height(火袋高), topR/bottomR(端半径), bulge(ふくらみ), curve(形状式),
 * boards(羽根板枚数6-12), boardWidth(板幅), boardT(板厚),
 * higoD(竹ひご径→溝半径=higoD/2+0.15クリアランス), pitch(溝間隔),
 * spiral(true=板kごとに溝をk*pitch/Nずらす巻掛け技法),
 * tabW(タブ掛かり深さ, 端半径40%で自動クランプ), fit(ノッチ幅公差),
 * tabLen(タブ突出10), komaT(コマ厚8)
 *
 * 【組立機構の設計意図】
 * - タブは板の「外縁側」。コマのノッチは縁まで開放(閉じた穴なし)
 * - ノッチ壁は平行、幅=boardT+fit → ガタつき防止。fitスライダーで調整
 * - 0番板のみタブ+3mm深い=キー → 組み間違い防止
 * - 番号穴: 板kにφ2穴が(k+1)個 → 順番識別
 * - タブ先端1.2mm面取り → 差し込み容易
 *
 * 【印刷ビュー】
 * Bambu Lab A1 (256×256mm)想定。種別ごと(羽根板/小物)に別セルで
 * グリッド整列し、プレートは田の字配置。羽根板長=height+2*tabLen が
 * 256超過時はUIに警告(高さ236mm以下推奨)
 *
 * 【既知の注意点・カメラ実装】
 * - frame()がfar平面をbaseDist*3へ自動拡張(遠距離クリップ対策済み)
 * - フォグは印刷ビューのみ無効(遠景黒沈み対策)
 * - 自動回転なし。ドラッグ=オービット、ピンチ/ホイール=ズーム
 * - lit(点灯)ビュー: LatheGeometryの和紙スキン+内部PointLight+
 *   AKARI 1AY風三本ワイヤー脚(legH=height*0.42)
 *
 * 【未実装/TODO候補】
 * - STLのZIP一括出力 / 3MF対応
 * - コマを外すための分割羽根(現状は上下開口から抜く前提)
 * - 溝ピッチの不等間隔(曲率対応) / ひご総長の自動計算
 * - E26/E17ソケットリング・シェード金具パーツ
 * ============================================================================
 */
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// ============ プロファイル ============
function prof(p, t) {
  const base = p.bottomR + (p.topR - p.bottomR) * t;
  let b = 0;
  const s = Math.sin(Math.PI * t);
  if (p.curve === "sphere") b = s;
  else if (p.curve === "egg") b = Math.sin(Math.PI * Math.pow(t, 0.72)); // たまご(重心低め)
  else if (p.curve === "cocoon") b = Math.sin(Math.PI * Math.pow(t, 1.25));
  else if (p.curve === "gourd") b = s - 0.55 * Math.exp(-Math.pow((t - 0.58) / 0.13, 2)) * s;
  else if (p.curve === "barrel") b = Math.pow(s, 0.4);
  else if (p.curve === "bud") b = Math.sin(Math.PI * Math.pow(t, 1.8));
  return Math.max(12, base + p.bulge * b);
}
function maxRadius(p) {
  let m = 0;
  for (let i = 0; i <= 120; i++) m = Math.max(m, prof(p, i / 120));
  return m + p.higoD;
}
// コマ外径(端の外周半径+縁マージン)
function komaR(p, top) {
  return prof(p, top ? 1 : 0) + 5;
}

// ============ 羽根板 ============
function ribShape(p, k) {
  const { height, boardWidth, higoD, pitch, spiral, boards, tabLen } = p;
  const oB = prof(p, 0), oT = prof(p, 1); // 端の外周半径
  const tw = (o) => Math.min(k === 0 ? p.tabW + 3 : p.tabW, Math.max(6, o * 0.4));
  const twB = tw(oB), twT = tw(oT);
  const gR = higoD / 2 + 0.15;
  const off = spiral ? (k * pitch) / boards : 0;
  const grooves = [];
  for (let y = pitch / 2 + off; y < height - gR; y += pitch) grooves.push(y);
  const outerX = (y) => {
    let x = prof(p, y / height);
    for (const g of grooves) {
      const dy = Math.abs(y - g);
      if (dy < gR) x = Math.min(x, prof(p, g / height) - Math.sqrt(gR * gR - dy * dy) - 0.01);
    }
    return x;
  };
  const innerX = (y) => Math.max(6, prof(p, y / height) - boardWidth);
  const s = new THREE.Shape();
  const STEP = 0.4, CH = 1.2;
  const ix0 = innerX(0), ixH = innerX(height);
  // 内縁下 → 下辺 → 下タブ(外縁側) → 外周 → 上タブ(外縁側) → 上辺 → 内縁
  s.moveTo(ix0, 0);
  s.lineTo(oB - twB, 0);
  s.lineTo(oB - twB + CH, -tabLen);
  s.lineTo(oB - CH, -tabLen);
  s.lineTo(oB, 0);
  for (let y = STEP; y <= height; y += STEP) s.lineTo(outerX(Math.min(y, height)), Math.min(y, height));
  s.lineTo(oT, height);
  s.lineTo(oT - CH, height + tabLen);
  s.lineTo(oT - twT + CH, height + tabLen);
  s.lineTo(oT - twT, height);
  s.lineTo(ixH, height);
  for (let y = height - STEP; y >= 0; y -= STEP) s.lineTo(innerX(Math.max(y, 0)), Math.max(y, 0));
  s.closePath();
  for (let i = 0; i <= k; i++) {
    const h = new THREE.Path();
    h.absarc(oB - 8, 14 + i * 5.5, 1.1, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  return s;
}
const ribGeometry = (p, k) => {
  const g = new THREE.ExtrudeGeometry(ribShape(p, k), { depth: p.boardT, bevelEnabled: false });
  g.translate(0, 0, -p.boardT / 2);
  return g;
};

// ============ コマ(端の丸板 = 回転の軸受も兼ねる) ============
function komaGeometry(p, top) {
  const { boards, boardT, fit } = p;
  const oEnd = prof(p, top ? 1 : 0);
  const R = komaR(p, top);
  const sw = boardT + fit; // ノッチ幅 = 板厚 + 公差(平行壁)
  const eps = Math.asin(Math.min(0.9, (sw / 2) / R));
  const rOut = Math.sqrt(Math.max(1, R * R - (sw / 2) * (sw / 2)));
  const depth = (idx) => {
    const tabW = Math.min(idx === 0 ? p.tabW + 3 : p.tabW, Math.max(6, oEnd * 0.4));
    return Math.max(oEnd * 0.55, oEnd - tabW - 0.6);
  };
  const shape = new THREE.Shape();
  shape.moveTo(R * Math.cos(eps), R * Math.sin(eps));
  for (let k = 0; k < boards; k++) {
    const a0 = (k / boards) * Math.PI * 2;
    const a1 = ((k + 1) / boards) * Math.PI * 2;
    // 歯の外周円弧(ノッチ縁からノッチ縁まで)
    for (let i = 1; i <= 12; i++) {
      const a = a0 + eps + (i / 12) * (a1 - a0 - 2 * eps);
      shape.lineTo(R * Math.cos(a), R * Math.sin(a));
    }
    // ノッチ: 平行壁で内側へ→底→外側へ(縁で開放)
    const r0 = depth((k + 1) % boards);
    const dx = Math.cos(a1), dy = Math.sin(a1), nx = -dy, ny = dx;
    shape.lineTo(r0 * dx - nx * sw / 2, r0 * dy - ny * sw / 2);
    shape.lineTo(r0 * dx + nx * sw / 2, r0 * dy + ny * sw / 2);
    shape.lineTo(rOut * dx + nx * sw / 2, rOut * dy + ny * sw / 2);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: p.komaT, bevelEnabled: false });
}

// ============ 土台(コマの縁を直接受けるサドル・左右で径が違う) ============
// Ozekiの作業台と同じく、端の丸板を受けて型ごと回せる
function standGeometry(p, top) {
  const R = maxRadius(p);
  const kR = komaR(p, top);
  const H = R + 15;                 // コマ中心高さ(最大径+床クリアランス15mm)
  const saddleR = kR + 0.8;         // コマ縁の受け半径
  const halfOpen = Math.PI * 0.38;  // サドルの開き(浅めのU)
  const baseW = Math.max(100, saddleR * 2.2), baseH = 12;
  const colW = saddleR * Math.sin(halfOpen) + 12;
  const s = new THREE.Shape();
  const lipY = H - saddleR * Math.cos(halfOpen); // サドル縁の高さ
  const lipX = saddleR * Math.sin(halfOpen);
  const topY = lipY + 10;
  s.moveTo(-baseW / 2, 0);
  s.lineTo(baseW / 2, 0);
  s.lineTo(baseW / 2, baseH);
  s.lineTo(colW, baseH);
  s.lineTo(colW, topY);
  s.lineTo(lipX, topY);
  s.lineTo(lipX, lipY);
  for (let i = 0; i <= 32; i++) {
    const a = halfOpen - (i / 32) * (2 * halfOpen); // 右縁→底→左縁
    s.lineTo(saddleR * Math.sin(a), H - saddleR * Math.cos(a));
  }
  s.lineTo(-lipX, topY);
  s.lineTo(-colW, topY);
  s.lineTo(-colW, baseH);
  s.lineTo(-baseW / 2, baseH);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: p.komaT + 6, bevelEnabled: false });
}

// ============ STL ============
function exportSTL(geometries, filename) {
  const geos = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  let tri = 0;
  for (const g of geos) tri += g.attributes.position.count / 3;
  const buf = new ArrayBuffer(84 + tri * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tri, true);
  let off = 84;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const cb = new THREE.Vector3(), ab = new THREE.Vector3();
  for (const g of geos) {
    const pos = g.attributes.position;
    for (let f = 0; f < pos.count; f += 3) {
      for (let i = 0; i < 3; i++) v[i].fromBufferAttribute(pos, f + i);
      cb.subVectors(v[2], v[1]); ab.subVectors(v[0], v[1]); cb.cross(ab).normalize();
      dv.setFloat32(off, cb.x, true); dv.setFloat32(off + 4, cb.y, true); dv.setFloat32(off + 8, cb.z, true);
      off += 12;
      for (const q of v) {
        dv.setFloat32(off, q.x, true); dv.setFloat32(off + 4, q.y, true); dv.setFloat32(off + 8, q.z, true);
        off += 12;
      }
      dv.setUint16(off, 0, true); off += 2;
    }
  }
  const url = URL.createObjectURL(new Blob([buf], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ============ プリセット / スライダー ============
const PRESETS = [
  { name: "たまご", curve: "egg", bulge: 62, topR: 22, bottomR: 34, height: 260 },
  { name: "球", curve: "sphere", bulge: 75, topR: 25, bottomR: 25, height: 210 },
  { name: "まゆ", curve: "cocoon", bulge: 45, topR: 38, bottomR: 42, height: 250 },
  { name: "ひょうたん", curve: "gourd", bulge: 65, topR: 28, bottomR: 30, height: 280 },
  { name: "俵", curve: "barrel", bulge: 40, topR: 45, bottomR: 45, height: 240 },
  { name: "つぼみ", curve: "bud", bulge: 55, topR: 26, bottomR: 44, height: 230 },
];
const SLIDERS = [
  { key: "height", label: "火袋の高さ", min: 100, max: 320, step: 5, unit: "mm" },
  { key: "topR", label: "上部半径", min: 20, max: 90, step: 1, unit: "mm" },
  { key: "bottomR", label: "下部半径", min: 20, max: 90, step: 1, unit: "mm" },
  { key: "bulge", label: "ふくらみ量", min: 0, max: 90, step: 1, unit: "mm" },
  { key: "boards", label: "羽根板の枚数", min: 6, max: 12, step: 2, unit: "枚" },
  { key: "boardWidth", label: "板の幅", min: 20, max: 60, step: 1, unit: "mm" },
  { key: "boardT", label: "板厚", min: 4, max: 10, step: 0.5, unit: "mm" },
  { key: "higoD", label: "竹ひご径", min: 1, max: 4, step: 0.1, unit: "mm" },
  { key: "pitch", label: "ひごピッチ", min: 8, max: 40, step: 1, unit: "mm" },
  { key: "tabW", label: "タブ掛かり", min: 6, max: 20, step: 1, unit: "mm" },
  { key: "fit", label: "はめあい公差", min: 0.1, max: 0.6, step: 0.05, unit: "mm" },
];
const DEFAULTS = {
  ...PRESETS[0], boards: 8, boardWidth: 35, boardT: 6, higoD: 2,
  pitch: 15, fit: 0.3, spiral: true, tabLen: 10, tabW: 10, komaT: 8,
};
// インスペクタのセクション分け(キーは SLIDERS の key を参照)
const GROUPS = [
  { title: "シルエット", keys: ["height", "topR", "bottomR", "bulge"] },
  { title: "骨組み", keys: ["boards", "boardWidth", "boardT"] },
  { title: "竹ひご", keys: ["higoD", "pitch"] },
  { title: "組立公差", keys: ["tabW", "fit"] },
];
const SLIDER_BY_KEY = Object.fromEntries(SLIDERS.map((s) => [s.key, s]));

export default function HarigataStudio() {
  const [p, setP] = useState(DEFAULTS);
  const [view, setView] = useState("mold");
  const [glError, setGlError] = useState(null);
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 860 : false
  );
  const mountRef = useRef(null);
  const T = useRef({});

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
    const groundGrid = new THREE.GridHelper(2400, 48, 0xc0b8a8, 0xd6cfc6);
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

    const group = new THREE.Group();
    scene.add(group);
    T.current = {
      scene, camera, renderer, group, bulb, shadow, amb, key, groundGrid, envMap,
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
        emissive: 0xffb96a, emissiveIntensity: 0, side: THREE.DoubleSide,
      }),
      rot: { x: -0.15, y: 0.5 }, baseDist: 700, zoom: 1, idle: 0,
    };

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
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
      s.renderer.render(s.scene, s.camera);
    };
    animate();
      cleanup = () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); if (ro) ro.disconnect(); if (el.parentNode === mount) mount.removeChild(el); renderer.dispose(); };
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
    const R = maxRadius(p);
    const lightVP = view !== "lit"; // 組立/印刷は CAD調の明るい背景、点灯だけ暗い
    s.shadow.scale.set(R * 3.2, R * 3.2, 1);
    s.shadow.visible = view !== "print";
    s.shadow.material.opacity = lightVP ? 0.3 : 1; // 明背景ではコンタクトシャドウを淡く
    s.groundGrid.visible = view === "mold";
    // 環境光は明ビューのみ。点灯は暗室に灯りだけ浮かせたいので外す。
    s.scene.environment = lightVP ? s.envMap : null;
    s.scene.fog = view === "print" ? null
      : new THREE.Fog(lightVP ? 0xbfb5a3 : 0x050506, 1000, 2400);
    // IBL がフィルを担うぶんアンビエントは控えめに。キーを強めてフォルムの陰影を立て、
    // 背景から浮かせる(白飛び防止しつつ図と地のコントラストを確保)。
    s.amb.intensity = view === "print" ? 0.5 : lightVP ? 0.3 : 0.5;
    s.key.intensity = view === "print" ? 0.85 : lightVP ? 1.1 : 0.85;
    s.key.position.set(view === "print" ? 80 : 240, view === "print" ? 500 : 380, view === "print" ? 120 : 280);
    s.bulb.intensity = 0;
    s.washiMat.emissiveIntensity = 0;

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
      const pts = [];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        pts.push(new THREE.Vector2(prof(p, t) + p.higoD, legH + t * p.height));
      }
      const skin = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), s.washiMat);
      s.group.add(skin);
      // 脚: 火袋の底縁から外に開いて床へ
      const legMat = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.5 });
      const r0 = prof(p, 0.06) * 0.75, r1 = maxRadius(p) * 0.62;
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
      s.washiMat.emissiveIntensity = 0.5;
      s.bulb.intensity = 1.6;
      s.bulb.position.set(0, legH + p.height * 0.55, 0);
      frame((legH + p.height) * 1.12, R, (legH + p.height) * 0.55);
      return;
    }

    const mold = new THREE.Group();
    for (let k = 0; k < p.boards; k++) {
      const mesh = new THREE.Mesh(ribGeometry(p, k), s.ribMat);
      mesh.rotation.y = (k / p.boards) * Math.PI * 2;
      mold.add(mesh);
    }
    const kb = new THREE.Mesh(komaGeometry(p, false), s.komaMat);
    kb.rotation.x = -Math.PI / 2; kb.position.y = -p.tabLen;
    mold.add(kb);
    const kt = new THREE.Mesh(komaGeometry(p, true), s.komaMat);
    kt.rotation.x = Math.PI / 2; kt.position.y = p.height + p.tabLen;
    mold.add(kt);

    if (view === "mold") {
      mold.position.y = p.tabLen; // 下コマぶん持ち上げ(床埋まり防止)
      s.group.add(mold);
      frame((p.height + p.tabLen * 2 + p.komaT * 2) * 1.1, R, p.height * 0.5 + p.tabLen);
    } else {
      // 印刷ビュー: Bambu Lab A1 (256×256mm)。種別ごとにセル計算しプレートを田の字配置
      const BED = 256, GAP = 8;
      const ribs = [], smalls = [];
      for (let k = 0; k < p.boards; k++) ribs.push({ geo: ribGeometry(p, k), mat: s.ribMat });
      smalls.push({ geo: komaGeometry(p, false), mat: s.komaMat });
      smalls.push({ geo: komaGeometry(p, true), mat: s.komaMat });
      smalls.push({ geo: standGeometry(p, false), mat: s.standMat });
      smalls.push({ geo: standGeometry(p, true), mat: s.standMat });

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
        const cols = Math.max(1, Math.floor((BED - GAP) / cW));
        const rows = Math.max(1, Math.floor((BED - GAP) / cD));
        const per = cols * rows;
        items.forEach((pt, i) => {
          const w = pt.bb.max.x - pt.bb.min.x, d = pt.bb.max.y - pt.bb.min.y;
          placed.push({
            ...pt,
            plate: plateIdx + Math.floor(i / per),
            ox: GAP + (i % per % cols) * cW + (mW - w) / 2,
            oz: GAP + Math.floor((i % per) / cols) * cD + (mD - d) / 2,
          });
        });
        plateIdx += Math.ceil(items.length / per);
      };
      layout(ribs);
      layout(smalls);

      const plates = plateIdx;
      const pCols = Math.ceil(Math.sqrt(plates));
      const pRows = Math.ceil(plates / pCols);
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x1e1e23, roughness: 0.9 });
      const platePos = (pl) => [(pl % pCols) * (BED + 40), Math.floor(pl / pCols) * (BED + 40)];
      for (let pl = 0; pl < plates; pl++) {
        const [px, pz] = platePos(pl);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(BED, 2, BED), plateMat);
        plate.position.set(px + BED / 2, -1, pz + BED / 2);
        s.group.add(plate);
        const grid = new THREE.GridHelper(BED, 8, 0x3f3f46, 0x2c2c31);
        grid.position.set(px + BED / 2, 0.15, pz + BED / 2);
        s.group.add(grid);
      }
      placed.forEach((pt) => {
        const [px, pz] = platePos(pt.plate);
        const m = new THREE.Mesh(pt.geo, pt.mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(px + pt.ox - pt.bb.min.x, 0.6, pz + pt.oz + pt.bb.max.y);
        s.group.add(m);
      });

      const totalW = pCols * (BED + 40) - 40;
      const totalD = pRows * (BED + 40) - 40;
      s.group.children.forEach((m) => { m.position.x -= totalW / 2; m.position.z -= totalD / 2; });
      const span = Math.max(totalW, totalD) + 50;
      s.rot.x = -1.35;
      s.rot.y = 0;
      frame(span * 0.95, span / 2, 0);
    }
  }, [p, view]);

  const set = (key) => (e) => setP((o) => ({ ...o, [key]: parseFloat(e.target.value) }));

  const dlRibs = () => {
    const geos = [];
    const w = maxRadius(p) + 12;
    for (let k = 0; k < p.boards; k++) {
      const g = ribGeometry(p, k);
      g.translate(k * w, p.tabLen, p.boardT / 2);
      geos.push(g);
    }
    exportSTL(geos, `harigata_ribs_x${p.boards}.stl`);
  };
  const dlKoma = () => {
    const gb = komaGeometry(p, false), gt = komaGeometry(p, true);
    gt.translate(komaR(p, false) + komaR(p, true) + 30, 0, 0);
    exportSTL([gb, gt], "harigata_koma.stl");
  };
  const dlStands = () => {
    const g1 = standGeometry(p, false), g2 = standGeometry(p, true);
    g2.translate(Math.max(100, komaR(p, false) * 2.2) + 40, 0, 0);
    exportSTL([g1, g2], "harigata_stands_LR.stl");
  };

  const maxDia = Math.round(maxRadius(p) * 2);
  const boardLen = Math.round(p.height + p.tabLen * 2); // 羽根板の全長(印刷サイズ)
  const bedOver = boardLen > 256;

  const PANEL = 340; // インスペクタ幅(px)
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const isLit = view === "lit";   // 点灯ビューだけ暗背景(グローを映えさせる)
  const accent = "#e8590c";       // アクセント = あかりの灯りのオレンジ

  // インスペクタは常に明るい暖色ニュートラルのパネル(和紙・竹の世界に寄せる)
  const UI = {
    panel: "#f6f4f0", edge: "#e5e1d9", head: "#1d1a16",
    muted: "#8e867a", label: "#5e574c", value: "#242019",
    ctrlBg: "#ffffff", ctrlEdge: "#dbd5cb", warn: "#c6392b",
  };
  // ビューポート背景(組立/印刷=明るい暖色CAD調、点灯=暗)
  const vpBg = isLit
    ? "radial-gradient(circle at 50% 38%, #17171c 0%, #050506 100%)"
    : "radial-gradient(circle at 50% 34%, #f4efe7 0%, #cec6b6 52%, #a89e8c 100%)";
  // ビューポート上のオーバーレイ・チップ(背景の明暗に追従)
  const chip = isLit
    ? { bg: "rgba(16,16,18,0.72)", edge: "rgba(255,255,255,0.08)", txt: "#8a8a96", val: "#c8c8d0" }
    : { bg: "rgba(255,255,255,0.82)", edge: "#d6dae0", txt: "#5a626c", val: "#1b1c20" };

  const sliderRow = (key) => {
    const s = SLIDER_BY_KEY[key];
    if (!s) return null;
    return (
      <label key={key} style={{ display: "block", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
          <span style={{ color: UI.label }}>{s.label}</span>
          <span style={{ fontFamily: mono, color: UI.value }}>{p[key]}<span style={{ color: UI.muted }}>{s.unit}</span></span>
        </div>
        <input type="range" min={s.min} max={s.max} step={s.step} value={p[key]}
          onChange={set(key)} style={{ width: "100%", accentColor: accent, display: "block" }} />
      </label>
    );
  };

  const dlBtn = (label, onClick, primary) => (
    <button onClick={onClick} style={{
      flex: 1, padding: "11px 0", borderRadius: 10, fontSize: 12.5, fontWeight: 600,
      cursor: "pointer", whiteSpace: "nowrap",
      background: primary ? accent : UI.ctrlBg,
      color: primary ? "#fff" : UI.label,
      border: primary ? "none" : `1px solid ${UI.ctrlEdge}`,
      transition: "all 0.15s",
    }}>{label}</button>
  );

  // ============ 左:3Dビューポート ============
  const viewport = (
    <main style={{
      position: "relative", minWidth: 0, minHeight: 0,
      flex: narrow ? "0 0 auto" : "1 1 auto",
      height: narrow ? "44vh" : "auto",
    }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0, background: vpBg, transition: "background 0.3s" }} />

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

      {/* ビュー切替(セグメンテッド) */}
      <div style={{
        position: "absolute", top: 14, left: 14, display: "flex", gap: 3, padding: 3,
        borderRadius: 11, background: chip.bg,
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${chip.edge}`,
      }}>
        {[["mold", "組立"], ["print", "印刷"], ["lit", "点灯"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            borderRadius: 8, border: "none",
            background: view === k ? accent : "transparent",
            color: view === k ? "#fff" : chip.txt, transition: "all 0.15s",
          }}>{l}</button>
        ))}
      </div>

      {/* 寸法リードアウト */}
      <div style={{
        position: "absolute", top: 16, right: 16, fontSize: 11, color: chip.txt,
        fontFamily: mono, textAlign: "right", pointerEvents: "none",
      }}>
        ⌀{maxDia} × H{p.height} mm
      </div>

      {/* 印刷ビューの補足 */}
      {view === "print" && (
        <div style={{
          position: "absolute", bottom: 16, left: 16, padding: "7px 12px",
          borderRadius: 9, fontSize: 10.5, color: chip.txt, fontFamily: mono,
          background: chip.bg, backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)", border: `1px solid ${chip.edge}`,
        }}>
          Bambu Lab A1 ／ 256×256mm ／ グリッド32mm
          {bedOver && (
            <span style={{ color: UI.warn }}> ⚠ 羽根板がベッド超過 — 高さを{256 - p.tabLen * 2}mm以下に</span>
          )}
        </div>
      )}
    </main>
  );

  // ============ 右:インスペクタ ============
  const inspector = (
    <aside style={{
      display: "flex", flexDirection: "column",
      width: narrow ? "auto" : PANEL, flex: narrow ? "1 1 auto" : `0 0 ${PANEL}px`,
      minHeight: 0,
      background: UI.panel, color: UI.value,
      borderLeft: narrow ? "none" : `1px solid ${UI.edge}`,
      borderTop: narrow ? `1px solid ${UI.edge}` : "none",
    }}>
      {/* ヘッダー */}
      <div style={{
        padding: "16px 18px 14px", borderBottom: `1px solid ${UI.edge}`,
        display: "flex", alignItems: "baseline", gap: 10,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.14em", color: UI.head }}>張型</span>
        <span style={{ fontSize: 11, color: UI.muted }}>スタジオ</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, color: UI.muted, fontFamily: mono }}>Lamp Kit</span>
      </div>

      {/* スクロール領域 */}
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "16px 18px 18px" }}>
        {/* プリセット */}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: UI.muted, marginBottom: 10, textTransform: "uppercase" }}>形</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 22 }}>
          {PRESETS.map((pr) => {
            const active = p.curve === pr.curve;
            return (
              <button key={pr.name} onClick={() => setP((o) => ({ ...o, ...pr }))} style={{
                padding: "9px 4px", fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 9,
                background: active ? accent : UI.ctrlBg,
                color: active ? "#fff" : UI.label,
                border: "1px solid " + (active ? accent : UI.ctrlEdge),
                transition: "all 0.15s",
              }}>{pr.name}</button>
            );
          })}
        </div>

        {/* パラメータ(セクション別) */}
        {GROUPS.map((g) => (
          <div key={g.title} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: UI.muted, marginBottom: 12, textTransform: "uppercase" }}>{g.title}</div>
            {g.keys.map((k) => sliderRow(k))}
            {g.title === "竹ひご" && (
              <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: UI.label, cursor: "pointer", marginTop: 2 }}>
                <input type="checkbox" checked={p.spiral}
                  onChange={(e) => setP((o) => ({ ...o, spiral: e.target.checked }))}
                  style={{ accentColor: accent, width: 15, height: 15 }} />
                螺旋巻き用に溝をずらす
              </label>
            )}
          </div>
        ))}

        {/* 情報 */}
        <div style={{
          borderTop: `1px solid ${UI.edge}`, paddingTop: 14, marginTop: 4,
          fontSize: 11, color: UI.label, fontFamily: mono, lineHeight: 1.9,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>最大径</span><span style={{ color: UI.value }}>⌀{maxDia} mm</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>羽根板の全長</span>
            <span style={{ color: bedOver ? UI.warn : UI.value }}>{boardLen} mm{bedOver ? " ⚠" : ""}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>羽根板の枚数</span><span style={{ color: UI.value }}>{p.boards} 枚</span></div>
          <div style={{ color: UI.muted, marginTop: 6, fontFamily: "'Hiragino Sans', system-ui, sans-serif", lineHeight: 1.6 }}>
            土台はコマの縁を直接受けて回転(心棒不要)
          </div>
        </div>
      </div>

      {/* ダウンロード(スティッキー) */}
      <div style={{
        padding: "12px 18px 16px", borderTop: `1px solid ${UI.edge}`,
        background: "#eeeae3",
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: UI.muted, marginBottom: 9, textTransform: "uppercase" }}>STL 書き出し</div>
        <div style={{ display: "flex", gap: 8 }}>
          {dlBtn(`羽根板 ×${p.boards}`, dlRibs, true)}
          {dlBtn("コマ", dlKoma, false)}
          {dlBtn("土台", dlStands, false)}
        </div>
      </div>
    </aside>
  );

  return (
    <div style={{
      display: "flex", flexDirection: narrow ? "column" : "row",
      height: "100%", overflow: "hidden",
      background: "#ece8e2", color: UI.value,
      fontFamily: "'Hiragino Sans', system-ui, sans-serif",
    }}>
      {viewport}
      {inspector}
    </div>
  );
}
