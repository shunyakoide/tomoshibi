/**
 * ============================================================================
 * 灯 TOMOSHIBI — app shell
 * ============================================================================
 * A generator for 3D-printable forming molds (harigata = the mold you wind bamboo ribs onto and
 * paste washi over) for making your own paper lanterns. Edit the profile curve and out come the
 * STLs — ribs, koma, stand — or a full-scale paper template if you have no printer.
 *
 * This file is now only the app's state and composition. The parts it composes:
 *   geometry.js        … cross-section / 3D geometry (rib / koma / stand). The single source of shape
 *   three/viewport.js  … renderer, lights, materials, orbit input, render loop
 *   three/scenes.js    … what each view draws (mold / print plates / lit)
 *   hooks.js           … undo-redo, autosave, responsive flag, language
 *   ui/                … theme + the inspector's controls, chips, point card, toolbar
 *   SectionEditor.jsx  … the direct-manipulation section editor (SVG)
 *   stl.js / papercraft.js / pdf.js … exports
 *
 * [Views] 2d (section, default) / mold (assembly) / print (plates) / lit
 * [Build flow] print → 8 ribs into 2 koma → wind bamboo → paste washi → dry → take the koma off and
 *   pull the ribs out through the openings → lamp body done → mount on three legs as a lamp.
 * ============================================================================
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  maxRadius, outerR, standBoardLength, maxBoards,
  ribGeometry, komaGeometry, standGeometry, boardGeometry, ringGeometry, ringLegsFit,
  washiGore, WASHI_SIDE, WASHI_END,
} from "./geometry.js";
import { exportZip, zipBundle, downloadFile } from "./stl.js";
import { paperPDF, washiPDF, paperFit, paperP } from "./papercraft.js";
import { fitOnBed } from "./bed.js";
import { useViewport } from "./three/viewport.js";
import { buildScene } from "./three/scenes.js";
import { useAutosave, useLang, useNarrow, useUndoRedo } from "./hooks.js";
import {
  loadSaved, serializeState, parseImport, STORAGE_KEY, SCHEMA_VERSION,
  loadWelcomeSeen, saveWelcomeSeen,
} from "./persist.js";
import SectionEditor from "./SectionEditor.jsx";
import PagePreview from "./PagePreview.jsx";
import GuidePage from "./GuidePage.jsx";
import Welcome from "./Welcome.jsx";
import { DEFAULTS, LIMITS, SIL_ROWS } from "./config.js";
import { UI, accent, accentA, mono, sans, vpBg, chipStyle, TContext } from "./ui/theme.js";
import { ScrubRow, Stepper, NumInput, Checkbox, SectionLabel, CTA, Note } from "./ui/controls.jsx";
import PresetChips from "./ui/PresetChips.jsx";
import PointCard from "./ui/PointCard.jsx";
import Toolbar from "./ui/Toolbar.jsx";
import Logo from "./ui/Logo.jsx";

const PANEL = 336;          // inspector width (px)
// The washi template's filename, in one place because it is written into two ZIPs and printed in two
// notes. `_beta` is part of it on purpose: the file outlives the app screen it came from — it gets
// mailed, reprinted months later, handed to someone else — and the caveat has to travel with it.
const WASHI_PDF = "tomoshibi_washi_a4_beta.pdf";
const BED_PRESETS = [180, 220, 250, 256, 300, 350];
// In build order: shape it, see it assembled, print it, then make it. "作り方" comes after 印刷
// because that is when you have parts in your hands, and before 点灯, which is the finished thing.
const VIEWS = [["2d", "断面"], ["mold", "組立"], ["print", "印刷"], ["guide", "作り方"], ["lit", "点灯"]];
// How the mold gets made. Cardboard is marked beta: its dimensions come from the same geometry.js
// functions as the printed parts and are covered by check:paper, but the route has had far less
// real-world building behind it than the STL one.
const ROUTES = [["stl", "3Dプリント", null], ["paper", "段ボール", "beta"]];

// Restore from localStorage once at startup (module top level, so a lazy initializer can't parse twice).
const SAVED = typeof window !== "undefined" ? loadSaved() : null;

export default function TomoshibiStudio() {
  const [p, setP] = useState(SAVED?.p ?? DEFAULTS);
  const [view, setView] = useState("2d");           // section view first: easiest place to read the shape. Transient
  // How the mold gets made: "stl" (3D print) / "paper" (cardboard template). Chosen on the welcome
  // card and switchable from the viewport chip in any non-lit view, and NOT transient — it is a fact
  // about the maker, not the design, and it decides whether the print bed constrains anything at all
  // (on the cardboard route nothing is bed-limited: a part larger than A4 simply continues onto the
  // next page, butt-joined).
  const [route, setRoute] = useState(SAVED?.route ?? "stl");
  const [drag, setDrag] = useState(null);           // key being dragged (highlights handles / slider rows)
  const [printRibs, setPrintRibs] = useState(SAVED?.printRibs ?? 1);
  const [bedW, setBedW] = useState(SAVED?.bedW ?? 256);   // print bed (mm). Restored as a machine setting
  const [bedD, setBedD] = useState(SAVED?.bedD ?? 256);
  const [matT, setMatT] = useState(SAVED?.matT ?? 5);     // measured cardboard thickness (mm)
  // Washi allowances (mm): side = the overlap where neighbouring panels lap over a rib, end = how far
  // the sheet runs past the opening to fold over the ring. A craft preference, restored like matT.
  const [washiSide, setWashiSide] = useState(SAVED?.washiSide ?? WASHI_SIDE);
  const [washiEnd, setWashiEnd] = useState(SAVED?.washiEnd ?? WASHI_END);
  const [sel, setSel] = useState(null);             // selected control point in the section editor (transient)
  const [editMode, setEditMode] = useState("move"); // section editor: "move" points / "curve" tangent handles
  const [glError, setGlError] = useState(null);

  const narrow = useNarrow(860);
  const { lang, toggleLang, t } = useLang();
  const { undo, redo, canUndo, canRedo } = useUndoRedo(p, setP);
  const [mountRef, three] = useViewport(setGlError);
  const prevView = useRef(null);   // detects a view switch, to set that view's opening camera angle

  // First-run onboarding card: auto-opens until dismissed once. Deliberately keyed on the dismissal
  // flag ALONE and not on "is there a saved design" — the autosave flushes on pagehide, so a
  // first-time visitor who merely reloads already has saved state and would never see the card,
  // which is exactly the person it is for. The cost is that an existing user meets it once.
  // Which card it is, not just whether one is open: "first" = auto-opened on the first visit,
  // "help" = reopened from the "?" (null = closed). The two differ in one way — the first-run card
  // marks NEITHER route, because "stl" there is a default nobody chose and colouring it would answer
  // the question the card is asking ("どちらでつくりますか?"). Once past that, the card is a place to
  // switch, so the route in effect is marked. No second persisted flag: the mode carries it.
  const [welcome, setWelcome] = useState(() => (loadWelcomeSeen() ? null : "first"));
  const closeWelcome = () => { saveWelcomeSeen(); setWelcome(null); };

  // Clamp the rib count to what fits the koma. If board thickness, tolerance or the opening (◇)
  // changes make it too large — by any path — lower it here, so overlapping notches can never
  // produce a non-watertight koma.
  const boardsMax = maxBoards(p);
  useEffect(() => {
    if (p.boards > boardsMax) setP((o) => ({ ...o, boards: boardsMax }));
  }, [p.boards, boardsMax]);

  // Runs after the clamp above, so what lands in localStorage is always the clamped design.
  useAutosave({ p, bedW, bedD, printRibs, matT, washiSide, washiEnd, route });

  // Rebuild the 3D preview whenever the design or the view changes.
  useEffect(() => {
    const viewChanged = prevView.current !== view;
    prevView.current = view;
    buildScene(three.current, { p, view, viewChanged, printRibs, bedW, bedD, route });
  }, [p, view, printRibs, bedW, bedD, route, three]);

  // Ribs to print (1..boards). With spiral winding every rib is a different shape, so all of them
  // are exported — duplicating one would not make a spiral.
  const nRibs = p.spiral ? p.boards : Math.min(printRibs, p.boards);

  // ---- Exports ----
  const downloadKit = () => {
    // Rib file layout. Spiral winding makes every rib different, so it is one rib per file
    // (tomoshibi_rib_01.stl …) and they can be placed individually in the slicer. Otherwise the ribs
    // are identical and they go in one file (print one, duplicate it).
    let ribEntries;
    if (p.spiral) {
      ribEntries = [];
      for (let k = 0; k < nRibs; k++) {
        const g = ribGeometry(p, k);
        g.translate(0, p.tabLen, p.boardT / 2);
        ribEntries.push({ name: `tomoshibi_rib_${String(k + 1).padStart(2, "0")}.stl`, geos: [g] });
      }
    } else {
      const w = maxRadius(p) + 12, ribs = [];
      for (let k = 0; k < nRibs; k++) {
        const g = ribGeometry(p, k);
        g.translate(k * w, p.tabLen, p.boardT / 2);
        ribs.push(g);
      }
      ribEntries = [{ name: `tomoshibi_ribs_x${nRibs}.stl`, geos: ribs }];
    }
    // The config JSON rides along so the printed kit's ZIP is itself a design backup, restorable
    // even if localStorage is gone. Same schema as persist.js, so it loads back as-is.
    // The washi template comes too: it belongs to this design (its panel width follows the rib count
    // you are about to print) and, unlike the parts, cannot be re-derived from the STLs. A PDF rather
    // than the HTML page so it prints at 100% with no intermediate step, and labelled in the UI's
    // language — the templates used to be English whatever the app said, because the writer had no
    // Japanese glyphs to draw with (pdf.js carries its own now).
    const cfg = JSON.stringify({ schemaVersion: SCHEMA_VERSION, p, bedW, bedD }, null, 2);
    exportZip([
      ...ribEntries,
      // Koma and posts are identical top and bottom, so one of each (duplicated in the slicer).
      { name: "tomoshibi_koma_print2.stl", geos: [komaGeometry(p)] },
      { name: "tomoshibi_stand_column_print2.stl", geos: [standGeometry(p)] },
      { name: "tomoshibi_stand_base.stl", geos: [boardGeometry(p)] },
      // Opening rings: set into the finished lantern's openings to hold the bamboo and washi.
      { name: "tomoshibi_ring_bottom.stl", geos: [ringGeometry(p, false)] },
      { name: "tomoshibi_ring_top.stl", geos: [ringGeometry(p, true)] },
    ], "tomoshibi_kit.zip", [
      { name: "tomoshibi_config.json", bytes: new TextEncoder().encode(cfg) },
      { name: WASHI_PDF, bytes: washiPDF(p, { side: washiSide, end: washiEnd }, undefined, t) },
    ]);
  };

  // The cardboard route's bundle, shaped like the STL kit's: one download, and the washi template a
  // separate PDF inside it. Both follow the UI's language, so the sheet in your hands says what the
  // screen you cut it from said.
  const downloadPaperKit = () => zipBundle({
    "tomoshibi_katagami_a4.pdf": paperPDF(p, matT, undefined, t),
    // washiSrc, not p: on this route the panel follows the possibly-clamped rib count.
    [WASHI_PDF]: washiPDF(washiSrc, washiOpts, undefined, t),
  }, "tomoshibi_katagami.zip");

  // Export the design as JSON. localStorage is a volatile cache; this file is the backup you can
  // rely on. Same schema as the config.json inside the ZIP.
  const exportDesign = () => downloadFile(
    serializeState({ p, bedW, bedD, printRibs, matT, washiSide, washiEnd, route }),
    "tomoshibi_design.json", "application/json",
  );

  // Load a design JSON (the standalone export, or the config.json out of the ZIP). parseImport
  // sanitizes, so broken / old / hand-edited values fall back safely instead of breaking geometry.
  const importDesign = (file) => {
    if (!file) return;
    const reader = new FileReader();
    const fail = () => window.alert(t("設計ファイルを読み込めませんでした(JSON が壊れています)。"));
    reader.onload = () => {
      const s = parseImport(String(reader.result));
      if (!s) return fail();
      setP(s.p); setBedW(s.bedW); setBedD(s.bedD); setPrintRibs(s.printRibs); setMatT(s.matT);
      setWashiSide(s.washiSide); setWashiEnd(s.washiEnd); setRoute(s.route);
    };
    reader.onerror = fail;
    reader.readAsText(file);
  };

  const resetAll = () => {
    if (!window.confirm(t("すべての設定を初期状態に戻します。よろしいですか?"))) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* continue even if storage is disabled */ }
    setP(DEFAULTS); setBedW(256); setBedD(256); setPrintRibs(1); setRoute("stl");
  };

  // ---- Derived figures ----
  const maxDia = Math.round(maxRadius(p) * 2);
  // Washi panel figures for the panel readout. A 0.5mm meridian sweep, so memoize it rather than
  // recompute on every render (dragging re-renders constantly).
  const washiG = useMemo(() => washiGore(p, { side: washiSide, end: washiEnd }), [p, washiSide, washiEnd]);
  // Whether this opening has room for the leg sockets at all — asked apart from the checkbox, so the
  // panel can say "they will not fit here" without saying it to someone who simply turned them off.
  // Read from the same function the geometry does, so the two cannot disagree about the part.
  const legsFit = useMemo(() => ringLegsFit(p), [p]);
  // Opening radii, shown for reference only. Ribs come out by removing a koma and tilting them, so
  // "opening ≥ rib width" would not actually decide whether they clear — no check, no false warning.
  const topOpen = Math.round(outerR(p, 1));
  const botOpen = Math.round(outerR(p, 0));

  // Real footprint of every printed part (rebuilt only when the design changes). Measuring the
  // actual bounding boxes — rather than assuming "the rib runs along depth, the base along width" —
  // lets the fit test use a 90° turn or a diagonal tilt, and check each part on its own. The old
  // guess broke on non-square (custom W≠D) beds.
  const bedFit = useMemo(() => {
    const dim = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return [b.max.x - b.min.x, b.max.y - b.min.y]; };
    const rb = dim(ringGeometry(p, false)), rt = dim(ringGeometry(p, true));
    return {
      rib: dim(ribGeometry(p, 0)), koma: dim(komaGeometry(p)), col: dim(standGeometry(p)),
      base: dim(boardGeometry(p)), ring: Math.max(...rb) >= Math.max(...rt) ? rb : rt,
    };
  }, [p]);
  const overParts = [["羽根板", bedFit.rib], ["コマ", bedFit.koma], ["柱", bedFit.col], ["連結板", bedFit.base], ["開口リング", bedFit.ring]]
    .filter(([, d]) => !fitOnBed(d, bedW, bedD).fits)
    .map(([name, d]) => t("{name} {n}mm", { name: t(name), n: Math.round(Math.max(...d)) }));
  const ribFits = fitOnBed(bedFit.rib, bedW, bedD).fits;
  const ribLen = Math.round(Math.max(...bedFit.rib));   // rib overall length, for the summary
  const ribBaseOver = !ribFits || !fitOnBed(bedFit.base, bedW, bedD).fits;
  // Tallest body at which BOTH length-driven parts still fit. The rib is usually the tighter one
  // (wider than the base, so it hits the diagonal limit sooner). Their widths don't depend on height,
  // so heights can be tested analytically without rebuilding geometry; fit is monotonic in height, so
  // walk up from the minimum and stop at the first height that no longer fits.
  const heightLimit = useMemo(() => {
    const ribW = Math.min(...bedFit.rib), baseW = Math.min(...bedFit.base);
    const baseConst = Math.round(standBoardLength(p) - p.height);   // base length minus height
    // 0 means no height fits at all — the parts are too WIDE, and the hint below correctly stays
    // away rather than telling someone to shrink a body that was never the problem. (Seeding this
    // with the minimum instead made the hint read "→ reduce to 60mm" for a ⌀1.1m design, which no
    // height saves; the guard on the hint was already written for this case.)
    let limit = 0;
    for (let h = LIMITS.height[0]; h <= LIMITS.height[1]; h++) {
      if (!fitOnBed([ribW, h + 2 * p.tabLen], bedW, bedD).fits || !fitOnBed([baseW, h + baseConst], bedW, bedD).fits) break;
      limit = h;
    }
    return limit;
  }, [bedFit, p, bedW, bedD]);

  const isLit = view === "lit";   // lit = a viewing mode: panel hidden, dark background
  // Views that take the whole window. Lit is one because it is a viewing mode; the guide is one
  // because it is a document — a 400px inspector beside it would leave a column too narrow to read,
  // and there is nothing on that panel you reach for with glue on your hands.
  const solo = isLit || view === "guide";
  const bedRules = route === "stl";   // does a print bed constrain this design at all? (cardboard: never)
  // The cardboard route's print view is a document, not a scene: PagePreview draws the template's
  // pages over the (idle) canvas, exactly as the section editor does.
  const paperPreview = view === "print" && route === "paper" && !isLit;
  // The cardboard route's own "this design won't cut well" check, the counterpart to the bed overflow
  // above. Cheap enough to run every render (a couple of divisions — see paperFit), and deliberately
  // NOT limited to the print view: every way out of it (fewer ribs, thinner material, a wider opening)
  // is a control you reach for while designing, and it used to sit on the printed page, where reading
  // it means the sheet in your hand is already the wrong one.
  const fit = useMemo(() => (route === "paper" ? paperFit(p, matT) : null), [route, p, matT]);
  const thinWall = fit && fit.wall < fit.thin;
  // Stable identity, so the preview's memo isn't invalidated by every unrelated render.
  const washiOpts = useMemo(() => ({ side: washiSide, end: washiEnd }), [washiSide, washiEnd]);
  // The design the washi template is cut from. On cardboard that is `paperP`, not the design on
  // screen: thick material can clamp the rib count, and the panel is one rib-to-rib bay wide — so the
  // sheet has to describe the mold this route makes rather than the one being edited.
  const washiSrc = useMemo(() => (route === "paper" ? paperP(p, matT) : p), [route, p, matT]);
  const chip = chipStyle(isLit);

  // ============ Left: viewport ============
  const viewport = (
    <main style={{
      position: "relative", minWidth: 0, minHeight: 0,
      // With no inspector below it, the viewport is the page: it takes the height rather than
      // leaving the bottom half of a phone screen empty under a 44vh box.
      flex: narrow && !solo ? "0 0 auto" : "1 1 auto",
      height: narrow && !solo ? "44vh" : "auto",
    }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0, background: vpBg(isLit), transition: "background 0.3s" }} />
      {/* Section view: the direct-manipulation editor, overlaid on the WebGL canvas */}
      {view === "2d" && (
        <SectionEditor p={p} setP={setP} accent={accent} drag={drag} setDrag={setDrag}
          sel={sel} setSel={setSel} editMode={editMode} setEditMode={setEditMode} t={t} />
      )}

      {/* Print view, cardboard route: the output is a document, so the preview is one — the
          template's own pages, over the same (empty) canvas the section editor uses. */}
      {paperPreview && <PagePreview p={p} matT={matT} lang={lang} />}

      {/* The build guide: also a document over the idle canvas, and also drawn from this design. */}
      {view === "guide" && (
        <GuidePage p={p} route={route} matT={matT} onGoPrint={() => setView("print")} />
      )}

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
        {VIEWS.map(([k, l]) => (
          <button key={k} className="tab" aria-pressed={view === k} onClick={() => setView(k)}>{t(l)}</button>
        ))}
      </div>

      {/* The route switch lives here, on the viewport, and not in the panel: it changes what this
          whole view IS (print plates vs template pages), and buried at the bottom of the inspector's
          scroll it was several seconds of hunting for the one control most likely to be wrong.
          Shown on every view except lit, not just the print view, because the route reaches further
          than its own view: `bedRules` below gates the bed-overflow warning, the "keep the height
          under N mm" hint and the rib-length warning colour, all of which surface while you are in
          the SECTION view. Leaving the switch behind in the print view put the effect on one screen
          and its cause on another — someone shortening a body to fit a bed they don't own. Lit is
          excluded because it is a viewing mode (the whole inspector is hidden there too). */}
      {!isLit && (
        <div style={{
          position: "absolute", top: 62, left: 16, display: "flex", gap: 2, padding: 4,
          borderRadius: 10, background: chip.bg,
          backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
          border: `1px solid ${chip.edge}`, boxShadow: "0 2px 10px rgba(59,52,43,0.07)",
        }}>
          {ROUTES.map(([k, l, badge]) => (
            <button key={k} className="tab" aria-pressed={route === k} onClick={() => setRoute(k)}>
              {t(l)}{badge && <em className="badge">{badge}</em>}
            </button>
          ))}
        </div>
      )}

      {/* Dimension chip — live on every view that shows the model. Not on the guide: that page opens
          with the same two numbers in its own spec row, and on a phone the fifth tab grew the strip
          far enough right to run into this. */}
      {view !== "guide" && (
        <div style={{
          position: "absolute", top: 24, right: 24, fontSize: 12, color: chip.txt,
          fontFamily: mono, letterSpacing: "0.05em", textAlign: "right", pointerEvents: "none",
        }}>
          ⌀{maxDia} × H{p.height} mm
        </div>
      )}

      {/* The two viewport alerts below share the bottom-RIGHT corner. Bottom-left is the section
          editor's legend, which either of them used to cover; and they can never collide with each
          other, being gated on opposite routes (bed = 3D print, koma wall = cardboard).
          Bed-overflow warning. Each part lies along a different axis, so the bed is width×depth.
          Gated on the whole 3D-print ROUTE, not just the print view: on the cardboard route there is no
          machine to overflow — a part wider than A4 continues onto the next page, butt-joined — so
          telling that person to shorten the body would be shrinking a design for a limit they don't have. */}
      {!isLit && bedRules && overParts.length > 0 && (
        <div style={{
          position: "absolute", bottom: 20, right: 20, display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", background: "#fff", border: `1px solid ${accentA(0.4)}`,
          borderRadius: 10, boxShadow: "0 3px 12px rgba(59,52,43,0.1)", fontFamily: sans,
          fontSize: 12.5, color: UI.text, textAlign: "left", maxWidth: "60%",
        }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <span>
            {t("{parts} がベッド {w}×{d}mm を超過", { parts: overParts.join(" · "), w: bedW, d: bedD })}
            {/* The height hint only applies to the length-driven parts (rib / base); skip it when only
                a height-independent part (ring / koma / post) overflows, or when no height is small enough. */}
            {ribBaseOver && heightLimit >= LIMITS.height[0] && (
              <><br /><span style={{ color: UI.sub }}>{t("→ 火袋の高さを {h}mm 以下に", { h: heightLimit })}</span></>
            )}
          </span>
        </div>
      )}

      {/* Cardboard: the koma's notches are cut to the material thickness, so thick material eats the
          wall between them until it tears when cut by hand. Shares the bed warning's corner, which is
          safe because that one is gated on the 3D-print route and this one on cardboard. */}
      {!isLit && thinWall && (
        <div style={{
          position: "absolute", bottom: 20, right: 20, display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", background: "#fff", border: `1px solid ${accentA(0.4)}`,
          borderRadius: 10, boxShadow: "0 3px 12px rgba(59,52,43,0.1)", fontFamily: sans,
          fontSize: 12.5, color: UI.text, textAlign: "left", maxWidth: "60%",
        }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <span>
            {t("コマの溝と溝の壁が {wall}mm — 手で切ると裂けやすい細さです", { wall: fit.wall.toFixed(1) })}
            <br /><span style={{ color: UI.sub }}>{t("→ 羽根板を減らす / 薄い材料にする / 断面図で開口を広げる")}</span>
          </span>
        </div>
      )}

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
  const inspector = solo ? null : (
    <aside style={{
      display: "flex", flexDirection: "column",
      width: narrow ? "auto" : PANEL, flex: narrow ? "1 1 auto" : `0 0 ${PANEL}px`,
      minHeight: 0, background: UI.panel, color: UI.text,
      borderLeft: narrow ? "none" : `1px solid ${UI.edge}`,
      borderTop: narrow ? `1px solid ${UI.edge}` : "none",
    }}>
      {/* Header */}
      {/* alignItems is center, not baseline: the wordmark is an outline, and an SVG's baseline is
          its bottom edge, which would hang the buttons off the tagline instead of the letters. */}
      <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo variant="full" height={44} style={{ color: UI.head }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Reopens the onboarding card. Once dismissed it never auto-opens again, so this is the
              only way back to "what is this app" — keep it next to the language toggle. */}
          <button className="icon-btn" onClick={() => setWelcome("help")} title={t("はじめかた")} aria-label={t("はじめかた")}>?</button>
          <button className="lang-btn" onClick={toggleLang} title="Language / 言語">{lang === "ja" ? "EN" : "日本語"}</button>
        </div>
      </div>

      {/* Scroll area */}
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "6px 20px 16px", touchAction: "pan-y" }}>
        <Toolbar undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo}
          onReset={resetAll} onExport={exportDesign} onImport={importDesign} />

        {/* The lit chip is derived from p.pts inside PresetChips, so it goes dark as soon as the
            curve is edited — picking a preset stores no "which one was clicked" flag. rTop/rBot go
            along because geometry.js falls back to them when pts is empty. */}
        <PresetChips p={p} onPick={(pr) => {
          setSel(null);
          setP((o) => ({ ...o, rTop: pr.rTop, rBot: pr.rBot, pts: pr.pts.map((q) => ({ ...q })) }));
        }} />

        {view === "2d" && (
          <PointCard p={p} setP={setP} sel={sel} setSel={setSel} editMode={editMode} setEditMode={setEditMode} />
        )}

        {/* Silhouette */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel title="シルエット" hint="ドラッグ / 値クリックで入力" />
          {SIL_ROWS.map((r) => (
            <ScrubRow key={r.key} drag={drag} setDrag={setDrag}
              cfg={{ ...r, value: p[r.key], onChange: (v) => setP((o) => ({ ...o, [r.key]: v })) }} />
          ))}
        </div>

        {/* Framework */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel title="骨組み" />
          <Stepper label="羽根板の枚数" value={p.boards} min={4} max={Math.min(16, boardsMax)} step={1}
            onChange={(v) => setP((o) => ({ ...o, boards: v }))}>
            {p.boards}<span style={{ color: UI.faintest, fontWeight: 400 }}>{t(" 枚")}</span>
          </Stepper>
          {boardsMax < 16 && p.boards >= boardsMax && (
            <div className="hint">
              {t("この開口・板厚では最大 {n} 枚(コマのノッチが重なるため)。板を薄くすると増やせます", { n: Math.min(16, boardsMax) })}
            </div>
          )}
          <ScrubRow drag={drag} setDrag={setDrag} cfg={{
            key: "boardT", label: "板厚", value: p.boardT, display: p.boardT.toFixed(1),
            min: 1, max: 4, round: 0.2, unit: "mm", onChange: (v) => setP((o) => ({ ...o, boardT: v })),
          }} />
          <ScrubRow drag={drag} setDrag={setDrag} cfg={{
            key: "tabLen", label: "爪の長さ", value: p.tabLen,
            min: 5, max: 40, round: 1, unit: "mm", onChange: (v) => setP((o) => ({ ...o, tabLen: v })),
          }} />
          <div className="hint">
            {t("首の高さ・張り出しは断面図の◇(最外の制御点)を上下/左右にドラッグ")}
          </div>
        </div>

        {/* Bamboo ribs */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel title="竹ひご" />
          <ScrubRow drag={drag} setDrag={setDrag} cfg={{
            key: "higoD", label: "竹ひご径", value: p.higoD, display: p.higoD.toFixed(1),
            min: 1, max: 4, round: 0.5, unit: "mm", onChange: (v) => setP((o) => ({ ...o, higoD: v })),
          }} />
          <ScrubRow drag={drag} setDrag={setDrag} cfg={{
            key: "pitch", label: "ひごピッチ", value: p.pitch,
            min: 8, max: 30, round: 1, unit: "mm", onChange: (v) => setP((o) => ({ ...o, pitch: v })),
          }} />
          <div style={{ marginTop: 4 }}>
            <Checkbox checked={p.spiral ?? false} onToggle={() => setP((o) => ({ ...o, spiral: !(o.spiral ?? false) }))}
              label={<>{t("螺旋巻き")} <span style={{ color: UI.faint }}>{t("(溝を下へ連続させる)")}</span></>} />
          </div>
        </div>

        {/* Washi: the paper skin's own allowances. Part of the design (the panel follows the
            silhouette and the rib count), not an output method — the template ships with whichever
            output you pick, so there is no separate download here.
            Marked beta like the cardboard route, and for the same kind of reason: flattening a
            doubly-curved surface is approximate by nature, and how much a damp sheet takes up is
            still being checked against actual builds. The dimensions are checked (check:paper), the
            fit on a real lantern is not. */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel title="和紙" hint="羽根板の間 1面分 · beta" />
          <Stepper label="のりしろ(左右)" value={washiSide} min={0} max={15} step={1} onChange={setWashiSide}>
            {washiSide} mm
          </Stepper>
          <Stepper label="被せ代(上下)" value={washiEnd} min={0} max={15} step={1} onChange={setWashiEnd}>
            {washiEnd} mm
          </Stepper>
          <div className="row">
            <span className="row-label">{t("1面のサイズ")}</span>
            <span className="row-value">
              {Math.round(2 * washiG.wMax)} × {Math.round(washiG.sTot + 2 * washiEnd)} mm × {p.boards}
            </span>
          </div>
          <Note style={{ marginTop: 2 }}>
            {t("貼る前に和紙を切るための原寸型紙です。どちらの出力にも別 PDF で同梱されます。")}
            <br />{t("この型紙は検証中です。全面を切る前に、まず 1 面だけ合わせてみてください。")}
          </Note>
        </div>

        {/* Opening ring: like the washi, a part of the finished LANTERN rather than of the mold, which
            is why it sits down here with the washi and not up in 骨組み. The hoop itself is sized from
            the opening and has nothing to set; the bottom one's leg sockets do. */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel title="開口リング" hint="完成品に残る輪" />
          <Checkbox checked={p.legSockets ?? true} label="脚ソケット(下)"
            onToggle={() => setP((o) => ({ ...o, legSockets: !(o.legSockets ?? true) }))} />
          {/* Said here, not on the part: the way out of it is a control on this panel, and a socket
              that silently is not there is one you find out about with the print in your hand. It
              only appears when the design ASKED for sockets — otherwise it is not news. */}
          {(p.legSockets ?? true) && !legsFit && (
            <div className="hint">
              {t("この開口には脚ソケットが入りません(下の輪のみになります)。開口を広げると入ります")}
            </div>
          )}
        </div>

        {/* Print view: the settings for whichever route is selected — the switch itself sits on the
            viewport, next to the mode tabs. The washi template is deliberately NOT a third route: it
            is not another way to make the mold, it is the paper skin you need on top of whichever
            mold you built, so it lives above with the design settings. */}
        {view === "print" && (
          <div style={{ borderTop: `1px solid ${UI.edge}`, paddingTop: 16, marginTop: 4 }}>
            {/* Titled, because the panel is one long scroll: without it the first control reads as
                another shape setting rather than "this is the print/export section". The hint names
                the route, so the panel says which of the two these settings belong to. */}
            <SectionLabel title="印刷・書き出し" hint={route === "stl" ? "3Dプリント" : "段ボール"} />

            {route === "stl" ? (
              <>
                <SectionLabel title="プリントベッド" />
                {/* Common (square) bed presets as a dropdown rather than a wrapping chip row (saves a
                    row of height). It sets width = depth; 幅/奥行き below stay for rectangular beds. */}
                <div className="field-row" style={{ marginBottom: 12 }}>
                  <span className="row-label">{t("定番サイズ")}</span>
                  <select value={bedW === bedD && BED_PRESETS.includes(bedW) ? String(bedW) : "custom"}
                    aria-label={t("定番サイズ")}
                    onChange={(e) => { const v = +e.target.value; if (v) { setBedW(v); setBedD(v); } }}
                    style={{
                      width: 150, padding: "6px 8px", borderRadius: 8, fontFamily: sans, fontSize: 12.5,
                      color: UI.text, background: UI.card, border: `1px solid ${UI.cardEdge}`, cursor: "pointer",
                    }}>
                    {!(bedW === bedD && BED_PRESETS.includes(bedW)) && <option value="custom">{t("カスタム")}</option>}
                    {BED_PRESETS.map((sz) => <option key={sz} value={sz}>{sz} × {sz} mm</option>)}
                  </select>
                </div>
                <NumInput label="幅" value={bedW} onChange={setBedW} min={100} max={420} />
                <NumInput label="奥行き" value={bedD} onChange={setBedD} min={100} max={420} />

                {/* Layout — how many rib copies go on the plate. A per-job output choice, not a bed
                    dimension, so it gets its own group. */}
                <div style={{ borderTop: `1px solid ${UI.edge}`, paddingTop: 14, marginTop: 14 }}>
                  <SectionLabel title="配置" />
                  {p.spiral ? (
                    <div className="row">
                      <span className="row-label">{t("印刷する羽根板")}</span>
                      <span className="row-value">{t("螺旋: 全")}{p.boards}{t("枚(各1枚)")}</span>
                    </div>
                  ) : (
                    <Stepper label="印刷する羽根板" value={nRibs} min={1} max={p.boards} step={1} onChange={setPrintRibs}>
                      {nRibs}<span style={{ color: UI.faintest, fontWeight: 400 }}> / {p.boards}</span>
                    </Stepper>
                  )}
                </div>
              </>
            ) : (
              /* Cardboard: the A4 full-scale template for building without a 3D printer. Only the
                 material thickness lives here; "open the template" is the footer CTA. */
              <>
                <SectionLabel title="型紙(段ボール)" hint="A4 原寸 · beta" />
                <Note style={{ marginTop: 0, marginBottom: 12 }}>
                  {t("この出力は開発中です。寸法は3Dプリント版と同じ計算から出していますが、実際に組んだ報告がまだ少ないルートです。材料の厚みは必ず実測し、刷った紙の 50mm スケールを定規で確認してください。")}
                </Note>
                <Stepper label="材料の厚み" value={matT} min={1} max={10} step={0.5} onChange={setMatT}>
                  {matT} mm
                </Stepper>
                {/* The counterpart to the bed warning the 3D route shows here: on paper there is no
                    machine size to exceed, so the design is free — say so, or its absence just reads
                    as a missing check. */}
                <Note>{t("大きさの制限はありません。A4 に収まらない部品は次のページに続きます(両方を青い枠で切り、同じ番号の半ダイヤが◇になるよう突き合わせて裏からテープ)。")}</Note>
              </>
            )}
          </div>
        )}
      </div>

      {/* Summary (pinned to the bottom) + the CTA for the current mode */}
      <div style={{ padding: "16px 20px 18px", borderTop: `1px solid ${UI.edge}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 5, columnGap: 12, fontSize: 12, marginBottom: 14 }}>
          <span style={{ color: UI.faint }}>{t("最大径")}</span>
          <span style={{ fontFamily: mono, fontWeight: 600, textAlign: "right" }}>⌀{maxDia} mm</span>
          <span style={{ color: UI.faint }}>{t("羽根板の全長")}</span>
          <span style={{ fontFamily: mono, fontWeight: 600, textAlign: "right", color: !bedRules || ribFits ? UI.text : UI.warn }}>
            {ribLen} mm
          </span>
          <span style={{ color: UI.faint }}>{t("上下の開口(半径)")}</span>
          <span style={{ fontFamily: mono, fontWeight: 600, textAlign: "right" }}>{topOpen} / {botOpen} mm</span>
        </div>

        {view !== "print" ? (
          <CTA label="印刷・書き出しへ進む →" outline onClick={() => setView("print")} />
        ) : route === "paper" ? (
          <>
            <CTA label="型紙 ZIP をダウンロード (A4 原寸)" onClick={downloadPaperKit} />
            {/* The one thing left to say. A PDF is already A4 at exact size, so the only way to lose
                that is the printer's own scaling — everything else the old HTML page explained was
                about making an HTML print at 1:1 in the first place. */}
            <Note>
              {t("プリンタの設定は「実際のサイズ / 100%」にしてください(「用紙に合わせる」は不可)。")}
              <br />{t("和紙の型紙 ")}<span style={{ fontFamily: mono }}>{WASHI_PDF}</span>{t(" は別 PDF として同梱されます(そのまま原寸で印刷)。")}
            </Note>
          </>
        ) : (
          <>
            <CTA label="STL 書き出し" onClick={downloadKit} />
            <Note>
              {t("コマ・柱は上下同一のため各1つ入っています。スライサーで")}<strong style={{ color: UI.text }}>{t("2つに複製")}</strong>{t("して印刷してください。設定は ")}<span style={{ fontFamily: mono }}>tomoshibi_config.json</span>{t(" として同梱されます(バックアップ用)。")}
              <br />{t("和紙の型紙 ")}<span style={{ fontFamily: mono }}>{WASHI_PDF}</span>{t(" も同梱されます(そのまま原寸で印刷)。")}
            </Note>
          </>
        )}
      </div>
    </aside>
  );

  return (
    <TContext.Provider value={t}>
      <div style={{
        display: "flex", flexDirection: narrow ? "column" : "row",
        height: "100%", overflow: "hidden",
        background: "#f2ecdf", color: UI.text, fontFamily: sans,
      }}>
        {viewport}
        {inspector}
        {welcome && (
          <Welcome route={welcome === "help" ? route : null} onClose={closeWelcome}
            onPick={(r) => { setRoute(r); closeWelcome(); }} />
        )}
      </div>
    </TContext.Provider>
  );
}
