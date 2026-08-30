/**
 * ============================================================================
 * 灯 TOMOSHIBI — app shell
 * ============================================================================
 * A generator for 3D-printable forming molds (harigata = the mold you wind bamboo ribs onto and
 * paste washi over) for making your own paper lanterns. Edit the profile curve and out come the
 * STLs — ribs, koma, stand — or a full-scale paper template if you have no printer.
 *
 * This file is now only the app's state and composition. The parts it composes:
 *   geometry.ts        … cross-section / 3D geometry (rib / koma / stand). The single source of shape
 *   three/viewport.ts  … renderer, lights, materials, orbit input, render loop
 *   three/scenes.ts    … what each view draws (mold / print plates / lit)
 *   hooks.ts           … undo-redo, autosave, responsive flag, language
 *   ui/                … theme + the inspector's controls, chips, point card, toolbar
 *   SectionEditor.tsx  … the direct-manipulation section editor (SVG)
 *   stl.ts / papercraft.ts / pdf.ts … exports
 *
 * [Views] 2d (section, default) / mold (assembly) / print (plates) / lit
 * [Build flow] print → 8 ribs into 2 koma → wind bamboo → paste washi → dry → take the koma off and
 *   pull the ribs out through the openings → lamp body done → mount on three legs as a lamp.
 * ============================================================================
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import {
  maxRadius, outerR, standBoardLength, maxBoards,
  ribGeometry, komaGeometry, standGeometry, boardGeometry, ringGeometry, ringLegsFit, ribPullFit,
  washiGore, WASHI_SIDE, WASHI_END,
} from "./geometry.ts";
import { exportZip, zipBundle, downloadFile } from "./stl.ts";
import { paperPDF, washiPDF, paperFit, paperP } from "./papercraft.ts";
import { fitOnBed } from "./bed.ts";
import { clamp } from "./util.ts";
import { useViewport } from "./three/viewport.ts";
import { buildScene } from "./three/scenes.ts";
import { useAutosave, useLang, useNarrow, useUndoRedo } from "./hooks.ts";
import {
  loadSaved, serializeState, parseImport, STORAGE_KEY, SCHEMA_VERSION,
  loadWelcomeSeen, saveWelcomeSeen,
} from "./persist.ts";
import SectionEditor from "./SectionEditor.tsx";
import PagePreview from "./PagePreview.tsx";
import GuidePage from "./GuidePage.tsx";
import Welcome from "./Welcome.tsx";
import { DEFAULTS, LIMITS, SIL_ROWS } from "./config.ts";
import type { T } from "./i18n.ts";
import { UI, accent, accentA, mono, sans, vpBg, chipStyle, TContext } from "./ui/theme.ts";
import { ScrubRow, Stepper, NumInput, Checkbox, SectionLabel, CTA, Note } from "./ui/controls.tsx";
import PresetChips from "./ui/PresetChips.tsx";
import PointCard from "./ui/PointCard.tsx";
import PointBar from "./ui/PointBar.tsx";
import Toolbar from "./ui/Toolbar.tsx";
import OverflowMenu, { type MenuItem } from "./ui/Menu.tsx";
import Logo from "./ui/Logo.tsx";
import type { EditMode } from "./ui/pointEdit.ts";
import type { Part } from "./stl.ts";
import type { Design, Route } from "./types.ts";

/** Which viewport the middle of the screen is showing. Only `route` outlives the session. */
type View = "2d" | "mold" | "print" | "guide" | "lit";
/** Which onboarding card is open: the first-visit one, the one reopened from "?", or neither. */
type WelcomeCard = "first" | "help" | null;

const PANEL = 336;          // inspector width (px)
// Where the two floating chip rows sit on the viewport. One table because three things have to agree
// about it — the two rows themselves and `.pages`' top padding (index.css), which is the clearance
// the cardboard preview leaves so its first sheet does not slide underneath. Wide only: on a phone
// the chips are not floating at all but a bar above the viewport (see `chipBar`), so there is no
// position to share and nothing to leave clearance for.
const CHIP = { top: 16, left: 16, row2: 62 } as const;
// ---- The narrow layout's bottom sheet ----------------------------------------------------------
// On a phone the inspector is not a panel below the viewport any more but a sheet you pull up over
// it, so the section editor gets the screen. Three stops: `peek` (the sheet's own header — the live
// summary and the CTA — and nothing else), and these two fractions of the window. `full` stops at
// 85% rather than covering everything, because the drawing you are editing should never leave the
// screen entirely: the sheet is a set of controls FOR it, and losing sight of the thing you are
// changing is what makes a full-screen settings page feel like a different app.
// `half` is a fraction of the height the sheet SHARES WITH THE VIEWPORT, not of the window, and
// `full` is that budget minus a fixed sliver left for the drawing. Measuring from the window looks
// equivalent and is not: the chip bar above the two of them is one row in Japanese and two in
// English, so a window-relative `full` handed English a 37px section view where Japanese got 76.
// A budget-relative one gives both exactly MIN_VIEW.
const SHEET = { half: 0.45 } as const;
// The drawing never leaves the screen, at any stop. The sheet is a set of controls FOR it, and
// losing sight of the thing you are changing is what makes a settings page feel like another app.
const MIN_VIEW = 140;
type SheetStop = "peek" | "half" | "full";
const SHEET_ORDER: SheetStop[] = ["peek", "half", "full"];
// Under this much travel a drag is a tap, and a tap cycles to the next stop. 6px is about the slop
// a finger puts into a deliberate press; more than that and the sheet follows the finger instead.
const SHEET_TAP = 6;
// The washi template's filename, in one place because it is written into two ZIPs and printed in two
// notes. `_beta` is part of it on purpose: the file outlives the app screen it came from — it gets
// mailed, reprinted months later, handed to someone else — and the caveat has to travel with it.
const WASHI_PDF = "tomoshibi_washi_a4_beta.pdf";
const BED_PRESETS = [180, 220, 250, 256, 300, 350];
// In build order: shape it, see it assembled, print it, then make it. "作り方" comes after 印刷
// because that is when you have parts in your hands, and before 点灯, which is the finished thing.
const VIEWS: [View, string][] = [["2d", "断面"], ["mold", "組立"], ["print", "印刷"], ["guide", "作り方"], ["lit", "点灯"]];
// How the mold gets made. Cardboard is marked beta: its dimensions come from the same geometry.ts
// functions as the printed parts and are covered by check:paper, but the route has had far less
// real-world building behind it than the STL one.
const ROUTES: [Route, string, string | null][] = [["stl", "3Dプリント", null], ["paper", "段ボール", "beta"]];

// One viewport alert: a warning line, and usually a "→ do this instead" line under it. Three of
// them now share the bottom-right corner, and they were three copies of one style attribute before
// the third arrived. The corner itself — position, stacking, gap — belongs to the column that holds
// them, not to the card, so an alert cannot decide to sit somewhere else.
/**
 * What comes out of the export, under its CTA: one line of what you must not get wrong, and the
 * contents of the ZIP folded behind it.
 *
 * All of this used to be a paragraph pinned under the button — five lines on a phone, about 95px of
 * a sheet whose whole job is to leave room for the drawing. It was also the wrong shape for what it
 * says: **none of it helps you decide to press the button**. "Duplicate the koma in your slicer",
 * "set the printer to 100%", "a config.json rides along" are things that matter once you HAVE the
 * file, in another application. Pinning them above the button is Apple HIG's overwhelm-upfront in
 * miniature (`progressive-disclosure`).
 *
 * So the split is by consequence, not by length. Louder: the one step that ruins the output if it
 * is missed — printing at anything but 100%, or printing one koma where two are needed. Quieter:
 * the manifest, which is reference material and folds behind a disclosure.
 *
 * But the same argument goes one step further than that, and this is the whole shape of it now:
 * **every word here is about the file you already have**, in your slicer or at your printer. None
 * of it is a reason to press the button, and until you press it there is nothing to say. So the
 * block renders NOTHING until the export has actually run, and appears — manifest open — as the
 * download's own confirmation (`success-feedback`). That is worth more than a paragraph nobody
 * reads on the way past, and it hands the pinned footer back ~60px at every sheet stop.
 *
 * `state` is therefore three-valued and not a boolean: `null` = no export yet (draw nothing),
 * "open" / "shut" = the manifest's fold. Two booleans would allow "folded but never downloaded",
 * which is a state this has no drawing for.
 */
function KitNote({ warn, state, onToggle, t, children }: {
  warn: React.ReactNode; state: null | "open" | "shut"; onToggle: () => void; t: T; children: React.ReactNode;
}) {
  if (state === null) return null;
  const open = state === "open";
  return (
    <div style={{ marginTop: 9 }}>
      <div className="note">{warn}</div>
      <button className="note-toggle" aria-expanded={open} onClick={onToggle}>
        {t("同梱物")}<span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && <ul className="note note-list">{children}</ul>}
    </div>
  );
}

// `head` is what is wrong, `hint` is what to do about it — two fields rather than free children so
// that the narrow strip can quote the first line of an alert without rendering the whole card.
function Alert({ head, hint }: { head: string; hint?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", background: "#fff", border: `1px solid ${accentA(0.4)}`,
      borderRadius: 10, boxShadow: "0 3px 12px rgba(59,52,43,0.1)", fontFamily: sans,
      fontSize: 12.5, color: UI.text, textAlign: "left",
    }}>
      <span style={{ fontSize: 15 }}>⚠️</span>
      <span>{head}{hint && <><br /><span style={{ color: UI.sub }}>{hint}</span></>}</span>
    </div>
  );
}

// Restore from localStorage once at startup (module top level, so a lazy initializer can't parse twice).
const SAVED = typeof window !== "undefined" ? loadSaved() : null;

export default function TomoshibiStudio() {
  const [p, setP] = useState(SAVED?.p ?? DEFAULTS);
  const [view, setView] = useState<View>("2d");           // section view first: easiest place to read the shape. Transient
  // How the mold gets made: "stl" (3D print) / "paper" (cardboard template). Chosen on the welcome
  // card and switchable from the viewport chip in any non-lit view, and NOT transient — it is a fact
  // about the maker, not the design, and it decides whether the print bed constrains anything at all
  // (on the cardboard route nothing is bed-limited: a part larger than A4 simply continues onto the
  // next page, butt-joined).
  const [route, setRoute] = useState<Route>(SAVED?.route ?? "stl");
  const [drag, setDrag] = useState<string | null>(null);           // key being dragged (highlights handles / slider rows)
  const [printRibs, setPrintRibs] = useState(SAVED?.printRibs ?? 1);
  const [bedW, setBedW] = useState(SAVED?.bedW ?? 256);   // print bed (mm). Restored as a machine setting
  const [bedD, setBedD] = useState(SAVED?.bedD ?? 256);
  const [matT, setMatT] = useState(SAVED?.matT ?? 5);     // measured cardboard thickness (mm)
  // Washi allowances (mm): side = the overlap where neighbouring panels lap over a rib, end = how far
  // the sheet runs past the opening to fold over the ring. A craft preference, restored like matT.
  const [washiSide, setWashiSide] = useState(SAVED?.washiSide ?? WASHI_SIDE);
  const [washiEnd, setWashiEnd] = useState(SAVED?.washiEnd ?? WASHI_END);
  const [sel, setSel] = useState<number | null>(null);             // selected control point in the section editor (transient)
  const [editMode, setEditMode] = useState<EditMode>("move"); // section editor: "move" points / "curve" tangent handles
  const [alertsOpen, setAlertsOpen] = useState(false);             // narrow only: the alert strip, folded (see alertBar)
  // null until an export has actually run: the notes are all about the file you already have,
  // so before the download there is nothing to say (see KitNote).
  const [kitNote, setKitNote] = useState<null | "open" | "shut">(null);
  const [sheet, setSheet] = useState<SheetStop>("peek");           // narrow only: the inspector sheet's stop
  const [sheetH, setSheetH] = useState<number | null>(null);       // px while a drag is in progress, else null
  const barRef = useRef<HTMLDivElement>(null);                     // the sheet's grabber + summary bar
  const asideRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // The design-JSON picker. It lives here rather than in the menu because a menu row unmounts the
  // moment it is clicked, and an <input> that is gone cannot open its own dialog.
  const designFile = useRef<HTMLInputElement>(null);
  const [peekH, setPeekH] = useState(44);                          // measured: the bar = the `peek` height
  const [budgetH, setBudgetH] = useState(0);                       // measured: viewport + sheet, the height they share
  const [glError, setGlError] = useState<string | null>(null);

  const narrow = useNarrow(860);
  const { lang, toggleLang, t } = useLang();
  const { undo, redo, canUndo, canRedo } = useUndoRedo(p, setP);
  const [mountRef, three] = useViewport(setGlError);
  const prevView = useRef<View | null>(null);   // detects a view switch, to set that view's opening camera angle

  // First-run onboarding card: auto-opens until dismissed once. Deliberately keyed on the dismissal
  // flag ALONE and not on "is there a saved design" — the autosave flushes on pagehide, so a
  // first-time visitor who merely reloads already has saved state and would never see the card,
  // which is exactly the person it is for. The cost is that an existing user meets it once.
  // Which card it is, not just whether one is open: "first" = auto-opened on the first visit,
  // "help" = reopened from the ☰ menu (null = closed). The two differ in one way — the first-run card
  // marks NEITHER route, because "stl" there is a default nobody chose and colouring it would answer
  // the question the card is asking ("どちらでつくりますか?"). Once past that, the card is a place to
  // switch, so the route in effect is marked. No second persisted flag: the mode carries it.
  const [welcome, setWelcome] = useState<WelcomeCard>(() => (loadWelcomeSeen() ? null : "first"));
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
    let ribEntries: Part[];
    if (p.spiral) {
      ribEntries = [];
      for (let k = 0; k < nRibs; k++) {
        const g = ribGeometry(p, k);
        g.translate(0, p.tabLen, p.boardT / 2);
        ribEntries.push({ name: `tomoshibi_rib_${String(k + 1).padStart(2, "0")}.stl`, geos: [g] });
      }
    } else {
      const w = maxRadius(p) + 12, ribs: THREE.BufferGeometry[] = [];
      for (let k = 0; k < nRibs; k++) {
        const g = ribGeometry(p, k);
        g.translate(k * w, p.tabLen, p.boardT / 2);
        ribs.push(g);
      }
      ribEntries = [{ name: `tomoshibi_ribs_x${nRibs}.stl`, geos: ribs }];
    }
    // The config JSON rides along so the printed kit's ZIP is itself a design backup, restorable
    // even if localStorage is gone. Same schema as persist.ts, so it loads back as-is.
    // The washi template comes too: it belongs to this design (its panel width follows the rib count
    // you are about to print) and, unlike the parts, cannot be re-derived from the STLs. A PDF rather
    // than the HTML page so it prints at 100% with no intermediate step, and labelled in the UI's
    // language — the templates used to be English whatever the app said, because the writer had no
    // Japanese glyphs to draw with (pdf.ts carries its own now).
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
    // moldSrc, not p: on this route the panel follows the possibly-clamped rib count.
    [WASHI_PDF]: washiPDF(moldSrc, washiOpts, undefined, t),
  }, "tomoshibi_katagami.zip");

  // Export the design as JSON. localStorage is a volatile cache; this file is the backup you can
  // rely on. Same schema as the config.json inside the ZIP.
  const exportDesign = () => downloadFile(
    serializeState({ p, bedW, bedD, printRibs, matT, washiSide, washiEnd, route }),
    "tomoshibi_design.json", "application/json",
  );

  // Load a design JSON (the standalone export, or the config.json out of the ZIP). parseImport
  // sanitizes, so broken / old / hand-edited values fall back safely instead of breaking geometry.
  const importDesign = (file: File | undefined) => {
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
    const dim = (g: THREE.BufferGeometry): [number, number] => { g.computeBoundingBox(); const b = g.boundingBox!; return [b.max.x - b.min.x, b.max.y - b.min.y]; };
    const rb = dim(ringGeometry(p, false)), rt = dim(ringGeometry(p, true));
    return {
      rib: dim(ribGeometry(p, 0)), koma: dim(komaGeometry(p)), col: dim(standGeometry(p)),
      base: dim(boardGeometry(p)), ring: Math.max(...rb) >= Math.max(...rt) ? rb : rt,
    };
  }, [p]);
  const overParts = ([["羽根板", bedFit.rib], ["コマ", bedFit.koma], ["柱", bedFit.col], ["連結板", bedFit.base], ["開口リング", bedFit.ring]] as [string, [number, number]][])
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
  // The mold this route actually makes. On cardboard that is `paperP`, not the design on screen:
  // thick material can clamp the rib count and sets the board thickness. The washi panel is one
  // rib-to-rib bay wide, so its sheet has to be cut for the mold the route makes rather than for the
  // one being edited — and the pull-out check below has to ask about that same mold.
  const moldSrc = useMemo(() => (route === "paper" ? paperP(p, matT) : p), [route, p, matT]);
  // Can the ribs still come out once the paste has dried? A deep body on a small mouth traps them
  // inside the shade, and nothing else in the app notices: every part prints, fits the bed and is
  // watertight. It is not a route question — a cardboard mold has to come out of the same hole.
  const pull = useMemo(() => ribPullFit(moldSrc), [moldSrc]);

  // ---- The sheet's geometry -----------------------------------------------------------------
  // `peek` is the grabber bar and nothing else — measured rather than assumed, because the summary
  // it carries wraps to two lines on a narrow enough screen. It used to include the CTA as well,
  // which made it 128px; at that size the sheet is 16% of the phone doing nothing but resting, and
  // the section editor is what that space is for. The CTA is one tap away and, now that the view is
  // a dropdown in the bar above, the one it shows outside the print view was navigation the bar
  // already offers. Measured the same way and for the same reason as the section editor's pane: a
  // layout read to seed it (an observer stays silent for an element the browser is not laying out)
  // and a ResizeObserver to keep it in step as the language changes the text inside it.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const read = () => setPeekH((h) => {
      const next = Math.round(bar.getBoundingClientRect().height);
      return next > 0 && next !== h ? next : h;
    });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [narrow, lang]);

  // The budget the viewport and the sheet share. Their SUM is what is invariant here — one grows
  // exactly as the other shrinks — so observing both and adding them gives a number that does not
  // move while the sheet animates, and the guard below keeps the transition from re-rendering on
  // every frame. What it excludes is what neither of them controls: the chip bar and the alert strip.
  useEffect(() => {
    const a = asideRef.current, m = mainRef.current;
    if (!a || !m) return;
    const read = () => setBudgetH((b) => {
      const next = Math.round(a.getBoundingClientRect().height + m.getBoundingClientRect().height);
      return next > 0 && Math.abs(next - b) >= 1 ? next : b;
    });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(a); ro.observe(m);
    return () => ro.disconnect();
  }, [narrow, isLit]);

  // The three stops, in px. `peek` can be the tallest of them on a very short screen, so every stop
  // is floored at it rather than assumed to be above it.
  const sheetStops = useMemo(() => ({
    peek: peekH,
    half: Math.max(peekH, Math.round(budgetH * SHEET.half)),
    full: Math.max(peekH, budgetH - MIN_VIEW),
  }), [peekH, budgetH]);
  const cycleSheet = useCallback(
    () => setSheet((st) => SHEET_ORDER[(SHEET_ORDER.indexOf(st) + 1) % SHEET_ORDER.length]),
    [],
  );

  // Drag on the sheet's header. Only the header — the scroll area below it keeps its own gesture,
  // because arbitrating "is this finger scrolling the list or pulling the sheet" is the one genuinely
  // hard part of a bottom sheet and it is not worth writing until someone misses it. A drag shorter
  // than SHEET_TAP is a tap, so the whole header is also the button.
  const dragRef = useRef<{ y0: number; h0: number; moved: boolean } | null>(null);
  const onSheetDown = useCallback((e: React.PointerEvent) => {
    // Let the two real buttons in the header (? and the language toggle) be pressed normally.
    if ((e.target as HTMLElement).closest("button")) return;
    const el = e.currentTarget.parentElement as HTMLElement | null;
    if (!el) return;
    dragRef.current = { y0: e.clientY, h0: el.getBoundingClientRect().height, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const onSheetMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = d.y0 - e.clientY;                       // up is bigger
    if (!d.moved && Math.abs(dy) < SHEET_TAP) return;  // still inside the tap slop
    d.moved = true;
    setSheetH(clamp(sheetStops.peek, sheetStops.full, d.h0 + dy));
  }, [sheetStops]);
  const onSheetUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (!d.moved) { cycleSheet(); return; }            // never travelled: it was a press
    const at = sheetH ?? d.h0;
    // Snap to whichever stop the sheet was left nearest to.
    const best = SHEET_ORDER.reduce((x, y) =>
      (Math.abs(sheetStops[y] - at) < Math.abs(sheetStops[x] - at) ? y : x));
    setSheet(best);
    setSheetH(null);
  }, [cycleSheet, sheetStops, sheetH]);

  // What the sheet is actually as tall as. During a drag that is a px number and the transition is
  // off, so it tracks the finger; otherwise it is the current stop and the transition animates.
  const sheetHeight = `${Math.round(sheetH ?? sheetStops[sheet])}px`;
  const chip = chipStyle(isLit);
  // The floating chip's shell, minus where it sits — the same box twice, and it used to be the same
  // eight declarations twice.
  const chipBox: React.CSSProperties = {
    position: "absolute", display: "flex", gap: 2, padding: 4, borderRadius: 10, background: chip.bg,
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
    border: `1px solid ${chip.edge}`, boxShadow: "0 2px 10px rgba(59,52,43,0.07)",
  };
  const modeTabs = VIEWS.map(([k, l]) => (
    <button key={k} className="tab" aria-pressed={view === k} onClick={() => setView(k)}>{t(l)}</button>
  ));
  const routeTabs = ROUTES.map(([k, l, badge]) => (
    <button key={k} className="tab" aria-pressed={route === k} onClick={() => setRoute(k)}>
      {t(l)}{badge && <em className="badge">{badge}</em>}
    </button>
  ));

  // Everything that acts on the APP or on the design AS A FILE, behind one "☰". On a wide screen it
  // sits beside the wordmark in the panel header; on a phone there is no panel header, so it sits at
  // the top RIGHT of the chip bar — the one strip that is on screen in every view and at every stop
  // of the sheet, including lit (where the whole inspector is hidden and the intro card used to be
  // unreachable altogether).
  //
  // It replaced a "?" and a language toggle standing in the row itself. Both are secondary by
  // nature, and in Japanese they were the difference between a chip bar that fits and one that has
  // nothing left: 99 + 144 + 88 + 24 of gaps + 20 of padding is 375 on the nose. See ui/Menu.tsx for
  // why the glyph is a "☰" when none of the contents is navigation, and for what stayed out of it.
  const menuItems: MenuItem[] = [
    { kind: "item", label: t("はじめかた"), onClick: () => setWelcome("help") },
    // A setting, not a verb, so it reads as one: the row names the thing and the right-hand side
    // shows what it would become. (The old control was a button captioned with its own opposite.)
    { kind: "item", label: t("言語"), value: lang === "ja" ? "English" : "日本語", onClick: toggleLang },
    { kind: "sep" },
    { kind: "item", label: t("バックアップを保存"), onClick: exportDesign },
    { kind: "item", label: t("バックアップから復元"), onClick: () => designFile.current?.click() },
    { kind: "sep" },
    // Separated and captioned with its consequence, which is what a destructive action in a menu
    // needs and what a `title=` tooltip could never give a phone.
    { kind: "item", label: t("初期化"), hint: t("すべての設定を初期状態に戻す"), danger: true, onClick: resetAll },
  ];
  const headerBtns = <OverflowMenu label={t("メニュー")} items={menuItems} />;

  // ============ Narrow: the chips move OUT of the viewport, and become dropdowns ============
  // Floating over the canvas, the two rows were ~100px of a 357px pane — 28% of it, laid straight
  // over the top of the silhouette, which is exactly where the top opening's ◇ is. In a bar above
  // the pane they stopped covering anything, but eight chips still wrapped to two rows (85px) in
  // English, and the labels are the app's top-level navigation so shortening them was never on.
  //
  // As dropdowns the same two choices cost ONE row in every language, and the row has space left
  // over for the header menu — which is where it now lives, out of the sheet's bar.
  // They are NATIVE `<select>`s, deliberately: on a phone that opens the OS picker, which is a
  // better touch target than anything hand-rolled here, arrives with keyboard and screen-reader
  // behaviour already correct, and costs no focus-trap or outside-click machinery. The `beta` badge
  // becomes text in the option, because an <option> cannot carry markup.
  const modeSelect = (
    <span className="tab-sel tab-sel--on">
      <select value={view} aria-label={t("表示")} onChange={(e) => setView(e.target.value as View)}>
        {VIEWS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
      </select>
      <span aria-hidden="true">▾</span>
    </span>
  );
  const routeSelect = (
    <span className="tab-sel">
      <select value={route} aria-label={t("つくりかた")} onChange={(e) => setRoute(e.target.value as Route)}>
        {ROUTES.map(([k, l, badge]) => (
          <option key={k} value={k}>{t(l)}{badge ? ` (${badge})` : ""}</option>
        ))}
      </select>
      <span aria-hidden="true">▾</span>
    </span>
  );
  const chipBar = narrow ? (
    <nav style={{
      flex: "none", display: "flex", alignItems: "center", gap: 8,
      padding: "6px 10px", background: UI.panel, borderBottom: `1px solid ${UI.edge}`,
    }}>
      {modeSelect}
      {/* Lit drops the route control for the same reason it drops the whole inspector — it is a
          viewing mode. The view control stays: in lit the panel is hidden, so this bar is the only
          way back out of it. */}
      {!isLit && routeSelect}
      <span style={{ flex: "1 1 auto" }} />
      {headerBtns}
    </nav>
  ) : null;

  // ---- Narrow: the selected ◇, in flow above the sheet -----------------------------------------
  // Only in the section view — it is the only place a ◇ exists to select, and `sel` outlives a view
  // change. See ui/PointBar.tsx for the measurements that put it here rather than in the sheet.
  const pointBar = narrow && view === "2d" && sel != null ? (
    <PointBar p={p} setP={setP} sel={sel} setSel={setSel}
      editMode={editMode} setEditMode={setEditMode} />
  ) : null;

  // ---- Viewport alerts ----------------------------------------------------------------------
  // The three of them are one COLUMN, wherever it is placed. The first two are gated on opposite
  // routes (bed = 3D print, koma wall = cardboard) and could never have collided, but the pull-out
  // warning belongs to both routes, so stacking them is the only arrangement that does not overprint.
  //
  // They are built as DATA rather than as markup, because the narrow layout has to count them and
  // quote one headline, and a fragment cannot be asked either question. (It also retires the
  // separate `hasAlert` predicate that a fragment needed — a fragment is truthy even when every
  // card inside it is false, so gating on it rendered an empty bordered band.)
  //
  // WHERE the column goes is the responsive part. On a wide screen it floats in the canvas's
  // bottom-right, as it always has (bottom-left is the lit-mode hint's). On a phone it cannot: a
  // three-line card is a quarter of a 357px-tall pane, and it lands squarely on the bottom opening's
  // ◇ — an alert reading "widen the opening in the section view" while sitting on top of the handle
  // that widens it. There it goes in flow between the viewport and the panel instead: never over a
  // handle, always on screen, and adjacent both to the drawing it is about and to the controls that
  // answer it.
  //
  // The gate is `solo`, not `isLit`: all three are about the design you are EDITING, and the guide
  // is neither a place you can act on one — every way out of any of them is a control in the
  // inspector, which that page does not have — nor a page about your design at all, since its
  // figures are drawn from one fixed example. Gate the LIST, never the cards or the strip: a fourth
  // alert must not have to remember, and neither placement should have to ask the question twice.
  const alerts: { key: string; head: string; hint?: string }[] = [];
  if (!solo) {
    // Bed-overflow. Each part lies along a different axis, so the bed is width×depth. Gated on the
    // whole 3D-print ROUTE, not just the print view: on the cardboard route there is no machine to
    // overflow — a part wider than A4 continues onto the next page, butt-joined — so telling that
    // person to shorten the body would be shrinking a design for a limit they don't have.
    if (bedRules && overParts.length > 0) alerts.push({
      key: "bed",
      head: t("{parts} がベッド {w}×{d}mm を超過", { parts: overParts.join(" · "), w: bedW, d: bedD }),
      // The height hint only applies to the length-driven parts (rib / base); skip it when only a
      // height-independent part (ring / koma / post) overflows, or when no height is small enough.
      hint: ribBaseOver && heightLimit >= LIMITS.height[0]
        ? t("→ 火袋の高さを {h}mm 以下に", { h: heightLimit }) : undefined,
    });
    // Cardboard: the koma's notches are cut to the material thickness, so thick material eats the
    // wall between them until it tears when cut by hand.
    if (thinWall) alerts.push({
      key: "wall",
      head: t("コマの溝と溝の壁が {wall}mm — 手で切ると裂けやすい細さです", { wall: fit.wall.toFixed(1) }),
      hint: t("→ 羽根板を減らす / 薄い材料にする / 断面図で開口を広げる"),
    });
    // The mold has to come back out of the shade it made. This is the one warning here about a
    // design that cannot be BUILT rather than one that cannot be printed or cut, so it is the last
    // thing anyone would find out on their own — with a dry lantern in their hands.
    if (!pull.ok) alerts.push({
      key: "pull",
      head: t("羽根板の幅 {w}mm — 開口 ⌀{d}mm から抜けません", { w: Math.round(pull.band), d: Math.round(2 * pull.openR) }),
      hint: t("→ 断面図で開口を広げる / ふくらみを抑える"),
    });
  }
  const alertCards = alerts.map((a) => <Alert key={a.key} head={a.head} hint={a.hint} />);

  // ============ Narrow: the alert column is a strip you tap open ============
  // In flow, an expanded alert costs 115px and two cost ~200 — out of the SAME budget as the
  // inspector, which is the scarce half (1216px of controls). Measured on a 375×812 phone, one
  // open alert cut the panel's scroll window from 261px to 146, and in the print view — where the
  // footer is taller and the koma-wall warning fires on the default cardboard design — to 88px.
  // That is 7% of the controls visible at once: the exact "every control exists and there is no
  // room to reach one" failure this whole layout was written to remove, reappearing through the
  // thing meant to help.
  //
  // So on a phone the column folds to one line — the same tap-open shape as the section editor's
  // legend — and costs ~36px instead. Collapsed still SAYS it: the strip keeps the alert tint,
  // the ⚠, and the first alert's headline (the sentence that names what is wrong; the "→ do this"
  // hint is what the tap is for), plus a count when more than one is waiting. Do not make it open
  // by default to be safe — that is just the 115px band again, and it takes the panel with it.
  const alertBar = narrow && alerts.length > 0 ? (
    <div style={{ flex: "none", background: UI.panel, borderTop: `1px solid ${UI.edge}` }}>
      <button onClick={() => setAlertsOpen((v) => !v)} aria-expanded={alertsOpen} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 36,
        padding: "6px 12px", background: accentA(0.07), border: "none", borderLeft: `3px solid ${accentA(0.5)}`,
        cursor: "pointer", font: "inherit", fontSize: 12, color: UI.text, textAlign: "left",
      }}>
        <span style={{ fontSize: 14, flex: "none" }}>⚠️</span>
        {/* minWidth 0 is what lets the ellipsis happen at all: a flex item's automatic minimum size
            is its content, so without it the headline pushes the count and caret off the strip. */}
        <span style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {alerts[0].head}
        </span>
        {alerts.length > 1 && (
          <span style={{ flex: "none", fontFamily: mono, fontSize: 11, color: UI.sub }}>+{alerts.length - 1}</span>
        )}
        <span aria-hidden="true" style={{ flex: "none", color: UI.faint }}>{alertsOpen ? "▾" : "▸"}</span>
      </button>
      {alertsOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 10px 8px" }}>
          {alertCards}
        </div>
      )}
    </div>
  ) : null;

  // ============ Left: viewport ============
  const viewport = (
    <main ref={mainRef} style={{
      position: "relative", minWidth: 0, minHeight: 0,
      // The pane no longer has a share of the screen — it has everything the sheet is not using. On
      // a phone the inspector is a bottom sheet resting at `peek` (its bar and the CTA, ~110px), so
      // the section editor gets roughly 600px of a 812px screen instead of the 325px a fixed 40vh
      // gave it, and pulling the sheet up trades that back a stop at a time. Lit was already the
      // exception for the same reason and now needs no exception at all.
      flex: "1 1 auto", height: "auto",
    }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0, background: vpBg(isLit), transition: "background 0.3s" }} />
      {/* Section view: the direct-manipulation editor, overlaid on the WebGL canvas */}
      {view === "2d" && (
        <SectionEditor p={p} setP={setP} accent={accent} drag={drag} setDrag={setDrag}
          sel={sel} setSel={setSel} editMode={editMode} compact={narrow} t={t} />
      )}

      {/* Print view, cardboard route: the output is a document, so the preview is one — the
          template's own pages, over the same (empty) canvas the section editor uses. */}
      {paperPreview && <PagePreview p={p} matT={matT} lang={lang} />}

      {/* The build guide: also a document over the idle canvas, and also drawn from this design. */}
      {view === "guide" && (
        <GuidePage route={route} onGoPrint={() => setView("print")} />
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

      {/* Mode tabs. Floating over the canvas on a wide screen; in the bar above it on a phone —
          see `chipBar` below for why. */}
      {!narrow && <div style={{ ...chipBox, top: CHIP.top, left: CHIP.left }}>{modeTabs}</div>}

      {/* The route switch lives here, on the viewport, and not in the panel: it changes what this
          whole view IS (print plates vs template pages), and buried at the bottom of the inspector's
          scroll it was several seconds of hunting for the one control most likely to be wrong.
          Shown on every view except lit, not just the print view, because the route reaches further
          than its own view: `bedRules` below gates the bed-overflow warning, the "keep the height
          under N mm" hint and the rib-length warning colour, all of which surface while you are in
          the SECTION view. Leaving the switch behind in the print view put the effect on one screen
          and its cause on another — someone shortening a body to fit a bed they don't own. Lit is
          excluded because it is a viewing mode (the whole inspector is hidden there too). */}
      {!isLit && !narrow && (
        <div style={{ ...chipBox, top: CHIP.row2, left: CHIP.left }}>{routeTabs}</div>
      )}

      {/* Dimension chip — live on every view that shows the model. On a phone it sits tighter to
          the corner: at 375px the readout was printing straight through the tab strip. Not on the
          guide: that page opens with the same two numbers in its own spec row, and on a phone the
          fifth tab grew the strip far enough right to run into this. */}
      {view !== "guide" && (
        <div style={{
          position: "absolute", top: narrow ? 10 : 24, right: narrow ? 12 : 24,
          fontSize: narrow ? 11 : 12, color: chip.txt,
          fontFamily: mono, letterSpacing: "0.05em", textAlign: "right", pointerEvents: "none",
        }}>
          ⌀{maxDia} × H{p.height} mm
        </div>
      )}

      {/* The alert column, floating in the canvas's bottom-right (declared above; on a phone it is
          a strip below the viewport instead — see `alertBar`). */}
      {!narrow && alerts.length > 0 && (
        <div style={{
          position: "absolute", bottom: 20, right: 20, maxWidth: "60%",
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10,
        }}>
          {alertCards}
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
    <aside ref={asideRef} style={{
      display: "flex", flexDirection: "column",
      width: narrow ? "auto" : PANEL,
      // As a sheet the panel is sized, not flexed: its height IS the stop it is parked at, and the
      // viewport takes whatever is left. The transition is off mid-drag so it tracks the finger.
      flex: narrow ? "none" : `0 0 ${PANEL}px`,
      height: narrow ? sheetHeight : undefined,
      transition: narrow && sheetH == null ? "height 0.22s cubic-bezier(0.32,0.72,0,1)" : undefined,
      minHeight: 0, background: UI.panel, color: UI.text,
      borderLeft: narrow ? "none" : `1px solid ${UI.edge}`,
      borderTop: narrow ? `1px solid ${UI.edge}` : "none",
      borderRadius: narrow ? "14px 14px 0 0" : undefined,
      boxShadow: narrow ? "0 -6px 22px rgba(59,52,43,0.13)" : undefined,
      // At `peek` the sheet is only as tall as its bar, so the pinned CTA below the (zero-height)
      // scroll area sits past the sheet's own bottom edge. Clip it rather than let it hang there.
      overflow: narrow ? "hidden" : undefined,
    }}>
      {/* ---- The sheet's header: the grabber, the live summary, and the two icon buttons ----
          Everything above the fold at `peek`. It is the drag surface and, for a press that never
          travels, the button that cycles to the next stop. `touchAction: none` so the browser does
          not claim the vertical gesture before the pointer handlers see it. */}
      {narrow && (
        <div ref={barRef} onPointerDown={onSheetDown} onPointerMove={onSheetMove}
          onPointerUp={onSheetUp} onPointerCancel={onSheetUp}
          style={{
            flex: "none", position: "relative", padding: "14px 14px 9px", touchAction: "none",
            cursor: "grab", display: "flex", alignItems: "center",
            borderBottom: `1px solid ${UI.edge}`,
          }}>
          {/* The grabber pill is positioned against the BAR, not laid out inside the row: centred in
              the row it would be centred on everything except the two buttons, landing at 37% of the
              sheet and reading as a mistake rather than as a handle. */}
          <span aria-hidden="true" style={{
            position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
            width: 38, height: 4, borderRadius: 2, background: UI.edge,
          }} />
          {/* The grabber is a div with role=button, not a <button>, and that is not a shortcut: the
              drag has to be able to start ON it, and `onSheetDown` bails out of anything inside a
              real <button> so that any button in the bar stays pressable. A <button> here
              would therefore be the one part of the bar you could not pull — which is exactly what
              it was, since the summary text sits inside it. It also cannot contain those two real
              buttons, so it is the left part of the bar rather than the whole of it.
              The pointer path already treats a press that never travels as a tap (see onSheetUp),
              so this only has to add the keyboard. */}
          <div role="button" tabIndex={0} aria-label={t("設定パネル")} title={t("設定パネル")}
            aria-expanded={sheet !== "peek"}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleSheet(); } }}
            style={{
              flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 20, cursor: "pointer",
            }}>
            {/* The summary the pinned footer used to carry. It is the readout you watch while
                dragging a ◇, so it is the whole of what the sheet shows at rest. Centred now that
                the header controls have moved to the chip bar: with them in the row it
                would have been centred on everything except them, i.e. on nothing. */}
            <span style={{
              display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 12px",
              fontFamily: mono, fontSize: 11, color: UI.faint,
            }}>
              <span>⌀{maxDia}</span>
              <span style={{ color: !bedRules || ribFits ? UI.faint : UI.warn }}>{t("羽根板")} {ribLen}</span>
              <span>{t("開口")} {topOpen}/{botOpen}</span>
              <span>mm</span>
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      {/* alignItems is center, not baseline: the wordmark is an outline, and an SVG's baseline is
          its bottom edge, which would hang the buttons off the tagline instead of the letters.
          Not rendered on a phone: the two buttons moved to the sheet's bar above, and the wordmark
          moved into the scroll area — pure identity is the one thing that can wait for a pull. */}
      {!narrow && (
      <div style={{
        padding: "20px 20px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Logo variant="full" height={44} style={{ color: UI.head }} />
        {headerBtns}
      </div>
      )}

      {/* Scroll area — between the bar and the pinned CTA, on both layouts. That is what makes
          `peek` work without reordering anything: at rest the sheet is exactly bar + CTA tall, so
          this collapses to zero, and every stop above it grows this and only this. */}
      <div style={{
        flex: "1 1 auto", minHeight: 0, overflowY: "auto", touchAction: "pan-y",
        // No VERTICAL padding on a phone: `min-height: 0` floors the border box at padding + border,
        // so 4+14 of it is 18px this element cannot shrink past — and `peek` is measured as bar + CTA,
        // which then overflowed the sheet by exactly that and cut the bottom off the CTA. The spacing
        // it was buying is given back by the wordmark block at the end of the list.
        padding: narrow ? "0 14px" : "6px 20px 16px",
        // iOS momentum scrolling stops dead at the last row without this; the panel is the only
        // scrollable thing on the page (body is touch-action: none).
        overscrollBehavior: "contain",
      }}>
        <Toolbar undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />

        {/* The lit chip is derived from p.pts inside PresetChips, so it goes dark as soon as the
            curve is edited — picking a preset stores no "which one was clicked" flag. rTop/rBot go
            along because geometry.ts falls back to them when pts is empty. A preset may also carry a
            `height`, and only one does: a shape whose identity is a RATIO cannot be handed the height
            that happened to be on screen (see config.ts). Everything else about the design is kept. */}
        <PresetChips p={p} onPick={(pr) => {
          setSel(null);
          setP((o) => ({ ...o, rTop: pr.rTop, rBot: pr.rBot, pts: pr.pts.map((q) => ({ ...q })), ...(pr.height ? { height: pr.height } : {}) }));
        }} />

        {view === "2d" && (
          <PointCard p={p} setP={setP} sel={sel} setSel={setSel} editMode={editMode} setEditMode={setEditMode}
            compact={narrow} />
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
          <Checkbox checked={!!p.legSockets} label="脚ソケット(下)"
            onToggle={() => setP((o) => ({ ...o, legSockets: !o.legSockets }))} />
          {/* Said here, not on the part: the way out of it is a control on this panel, and a socket
              that silently is not there is one you find out about with the print in your hand. It
              only appears when the design ASKED for sockets — otherwise it is not news. */}
          {p.legSockets && !legsFit && (
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
        {/* The wordmark, on a phone only, and at the END of the scroll rather than the top of it.
            The panel header it used to sit in is gone here (its two buttons moved to the sheet's
            bar), and putting it back at the top would spend the first 40px of every pull — the most
            expensive space in the app — on identity, for someone who pulled the sheet up to reach a
            control. At the bottom it is a signature: still there, costs nothing at any stop. */}
        {narrow && (
          <div style={{ padding: "22px 0 14px", opacity: 0.5 }}>
            <Logo variant="full" height={26} style={{ color: UI.head }} />
          </div>
        )}
      </div>

      {/* Summary + the CTA for the current mode — the pinned footer, at the BOTTOM on both layouts.
          It was briefly moved above the scroll area on a phone, to be part of what `peek` shows; that
          put a full-width button between the drag handle and the first control, and left the list
          sliding under it with no boundary — a half-cut row reads as a rendering fault. Pinning it at
          the bottom shows it at `peek` just the same (the scroll area between them is zero tall
          there), keeps it where a next-step action belongs and where the thumb is, and gives the list
          the edge to disappear behind that it always had.
          The summary is dropped here on a phone because the sheet's bar carries it. `ctaRef` is half
          of the `peek` measurement (the bar is the other half), so the resting height follows the
          note the print view adds rather than clipping it. */}
      <div style={{
        flex: "none",
        padding: narrow ? "10px 14px 12px" : "16px 20px 18px",
        borderTop: `1px solid ${UI.edge}`,
      }}>
        {!narrow && (
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
        )}

        {view !== "print" ? (
          <CTA label="印刷・書き出しへ進む →" outline onClick={() => setView("print")} />
        ) : route === "paper" ? (
          <>
            <CTA label="型紙 ZIP をダウンロード (A4 原寸)" onClick={() => { downloadPaperKit(); setKitNote("open"); }} />
            {/* A PDF is already A4 at exact size, so the only way to lose that is the printer's own
                scaling — which is why this one line stays out in the open. Everything else the old
                HTML page explained was about making an HTML print at 1:1 in the first place. */}
            <KitNote warn={<><strong style={{ color: UI.text }}>{t("原寸 100% で印刷")}</strong>{t("(「用紙に合わせる」は不可)")}</>}
              state={kitNote} onToggle={() => setKitNote((v) => (v === "open" ? "shut" : "open"))} t={t}>
              <li><span style={{ fontFamily: mono }}>tomoshibi_katagami_a4.pdf</span>{t(" — 型紙")}</li>
              <li><span style={{ fontFamily: mono }}>{WASHI_PDF}</span>{t(" — 和紙の型紙(原寸で印刷)")}</li>
            </KitNote>
          </>
        ) : (
          <>
            <CTA label="STL 書き出し" onClick={() => { downloadKit(); setKitNote("open"); }} />
            {/* Miss this one and you print half a mold: the koma and the posts are identical top and
                bottom, so the kit carries one of each. */}
            <KitNote warn={<>{t("コマ・柱は各1つ。スライサーで")}<strong style={{ color: UI.text }}>{t("2つに複製")}</strong></>}
              state={kitNote} onToggle={() => setKitNote((v) => (v === "open" ? "shut" : "open"))} t={t}>
              <li><span style={{ fontFamily: mono }}>tomoshibi_*.stl</span>{t(" — 羽根板・コマ・土台・口輪")}</li>
              <li><span style={{ fontFamily: mono }}>{WASHI_PDF}</span>{t(" — 和紙の型紙(原寸で印刷)")}</li>
              <li><span style={{ fontFamily: mono }}>tomoshibi_config.json</span>{t(" — 設計のバックアップ")}</li>
            </KitNote>
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
        {chipBar}
        {viewport}
        {pointBar}
        {alertBar}
        {inspector}
        <input ref={designFile} type="file" accept=".json,application/json" style={{ display: "none" }}
          onChange={(e) => { importDesign(e.target.files?.[0]); e.target.value = ""; }} />
        {welcome && (
          <Welcome route={welcome === "help" ? route : null} onClose={closeWelcome}
            onPick={(r) => { setRoute(r); closeWelcome(); }} />
        )}
      </div>
    </TContext.Provider>
  );
}
