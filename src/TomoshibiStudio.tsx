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
import { useAutosave, useLang, useNarrow, usePageRoute, useUndoRedo } from "./hooks.ts";
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
import { accent, vpBg, chipStyle, TContext } from "./ui/theme.ts";
import { ScrubRow, Stepper, NumInput, Checkbox, SectionLabel, CTA, Note, Badge, NOTE_SKIN } from "./ui/controls.tsx";
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
type View = "2d" | "mold" | "print" | "lit";
/** Which onboarding card is open: the first-visit one, the one reopened from the ☰ menu, or neither. */
type WelcomeCard = "first" | "help" | null;

// (The inspector's width is the aside's own `w-336 flex-[0_0_336px]`, written nowhere else.)
//
// The floating chip row's shell — the same box twice (mode tabs at `top-16`, route tabs at `top-62`),
// minus the two colours, which follow `isLit` and are handed in as a style. Wide only: on a phone the
// chips are not floating but a bar above the viewport (see `chipBar`).
// PagePreview's `pt-124` is the clearance the cardboard preview leaves under the LOWER of these two
// rows so its first sheet does not slide beneath it — 62 plus the row's own height. Anything that
// changes a tab's padding or font size moves that number too.
const CHIP_BOX = "absolute left-16 flex gap-2 p-4 rounded-lg border backdrop-blur-[6px] "
  + "shadow-[0_2px_10px_rgba(59,52,43,0.07)]";
// One skin for both floating tab rows. It was this string, written out twice, character for character.
const TAB_SKIN = "px-14 py-7 border-0 rounded-sm cursor-pointer transition-all duration-150 "
  + "bg-transparent text-[#6f6350] font-sans text-base font-medium "
  + "aria-pressed:bg-accent aria-pressed:text-[#fff] aria-pressed:font-bold";
// ---- The narrow layout's bottom sheet ----------------------------------------------------------
// On a phone the inspector is a sheet you pull up over the viewport, so the section editor gets the
// screen. Three stops: `peek` (the grabber bar alone), the one fraction below, and `full`, which is
// the shared budget minus `MIN_VIEW`. `full` stops short of
// covering everything, because the drawing you are editing should never leave the screen — the sheet
// is a set of controls FOR it.
//
// `half` is a fraction of the height the sheet SHARES WITH THE VIEWPORT, not of the window, and
// `full` is that budget minus a fixed sliver. Those look equivalent and are not: the chip bar above
// is one row in Japanese and two in English, so a window-relative `full` handed English a 37px
// section view where Japanese got 76. Budget-relative, both get exactly MIN_VIEW.
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
// In build order: shape it, see it assembled, print it, light it. Every one of them is a RENDERING
// OF YOUR DESIGN — move a ◇ and all four redraw. That is what this control selects, and it is why
// the build guide is not in it: its figures come from one fixed example (GUIDE_P), so it answered to
// nothing you did here. It is an overlay off the ☰ menu instead — see `guide` below.
const VIEWS: [View, string][] = [["2d", "断面"], ["mold", "組立"], ["print", "印刷"], ["lit", "点灯"]];
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
 * It used to be a paragraph pinned under the button — five lines on a phone, ~95px of a sheet whose
 * job is to leave room for the drawing — and it was the wrong shape for what it says: **none of it
 * helps you decide to press the button.** "Duplicate the koma", "print at 100%", "a config.json
 * rides along" all matter once you HAVE the file, in another application. So the block renders
 * NOTHING until the export has run, and appears — manifest open — as the download's own
 * confirmation, which hands the pinned footer back ~60px at every sheet stop. **Do not put it back
 * on screen "so people see it".**
 *
 * Within it the split is by CONSEQUENCE, not by length: loud for the one step that ruins the output
 * if missed, folded for the manifest, which is reference material.
 *
 * `state` is three-valued and not a boolean — `null` = no export yet (draw nothing), "open"/"shut" =
 * the manifest's fold. Two booleans would allow "folded but never downloaded", which has no drawing.
 */
function KitNote({ warn, state, onToggle, t, children }: {
  warn: React.ReactNode; state: null | "open" | "shut"; onToggle: () => void; t: T; children: React.ReactNode;
}) {
  if (state === null) return null;
  const open = state === "open";
  return (
    <div className="mt-9">
      <div className={NOTE_SKIN}>{warn}</div>
      <button aria-expanded={open} onClick={onToggle}
        className="flex items-center gap-5 min-h-36 mt-2 p-0 bg-transparent border-0 cursor-pointer
          font-sans text-sm font-semibold text-sub hover:text-accent">
        {t("同梱物")}<span aria-hidden="true" className="text-2xs text-faint">{open ? "▾" : "▸"}</span>
      </button>
      {open && <ul className={`${NOTE_SKIN} mt-2 mb-0 mx-0 p-0 list-none [&>li]:py-[1.5px]`}>{children}</ul>}
    </div>
  );
}

// `head` is what is wrong, `hint` is what to do about it — two fields rather than free children so
// that the narrow strip can quote the first line of an alert without rendering the whole card.
function Alert({ head, hint }: { head: string; hint?: string }) {
  return (
    <div className="flex items-center gap-10 px-14 py-10 bg-card border border-accent-4
      rounded-lg shadow-[0_3px_12px_rgba(59,52,43,0.1)] font-sans text-base text-text text-left">
      <span className="flex-none text-lg">⚠️</span>
      <span>{head}{hint && <><br /><span className="text-sub">{hint}</span></>}</span>
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

  // First-run onboarding card, auto-opening until dismissed once. Keyed on the dismissal flag ALONE
  // and not on "is there a saved design": the autosave flushes on pagehide, so a first-time visitor
  // who merely reloads already has saved state and would never see the card, which is exactly the
  // person it is for.
  //
  // WHICH card it is, not just whether one is open: "first" = auto-opened, "help" = reopened from
  // the ☰ menu. They differ in one way — the first-run card marks NEITHER route, because "stl" there
  // is a default nobody chose and colouring it would answer the question the card is asking. No
  // second persisted flag: the mode carries it.
  const [welcome, setWelcome] = useState<WelcomeCard>(() => (loadWelcomeSeen() ? null : "first"));
  const closeWelcome = () => { saveWelcomeSeen(); setWelcome(null); };
  // The build guide. Not a view: it is a document about making a lantern, and its figures come
  // from one fixed example rather than from `p`, so it belongs to neither the view tabs (which
  // select a rendering of YOUR design) nor the inspector. It is the one thing in this app with a
  // URL of its own — `/guide`, so it can be linked to and left with the browser's back button —
  // and `page` is that URL, read and written through the history API. See src/route.ts.
  //
  // Renamed on the way in: `route` is already this file's word for how the mold gets MADE (3D
  // print / cardboard), which is a fact about the maker rather than a place.
  const { route: page, go: goPage } = usePageRoute();
  const guide = page === "guide";

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
  // "opening ≥ rib width" would not actually decide whether they clear; `ribPullFit` answers that,
  // and raises its own viewport alert. These two readouts are informational.
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
  // `peek` is the grabber bar and nothing else — MEASURED rather than assumed, because the summary
  // it carries wraps on a narrow enough screen. It used to include the CTA, which made it 128px: at
  // that size the sheet is 16% of the phone doing nothing but resting. Measured the same way and for
  // the same reason as the section editor's pane — a layout read to seed it (an observer stays
  // silent for an element the browser is not laying out) plus a ResizeObserver for language changes.
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
    // Let any real <button> inside the bar be pressed normally. Defensive: the bar holds none today
    // (the header controls moved to the chip bar), and this is what would keep one pressable.
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
  const chipTone = { background: chip.bg, borderColor: chip.edge };
  const modeTabs = VIEWS.map(([k, l]) => (
    <button key={k} className={TAB_SKIN} aria-pressed={view === k} onClick={() => setView(k)}>{t(l)}</button>
  ));
  const routeTabs = ROUTES.map(([k, l, badge]) => (
    <button key={k} className={TAB_SKIN} aria-pressed={route === k} onClick={() => setRoute(k)}>
      {t(l)}{badge && <Badge>{badge}</Badge>}
    </button>
  ));

  // Everything that acts on the APP or on the design AS A FILE, behind one "☰". On a wide screen it
  // sits beside the wordmark in the panel header; on a phone there is no panel header, so it sits at
  // the top RIGHT of the chip bar — the one strip that is on screen in every view and at every stop
  // of the sheet, including lit (where the whole inspector is hidden and the intro card used to be
  // unreachable altogether).
  //
  // It replaced a "?" and a language toggle standing in the row itself. Both are secondary by
  // nature, and in ENGLISH they were the difference between a chip bar that fits and one that has
  // nothing left: 99 + 144 + 88 + 24 of gaps + 20 of padding is 375 on the nose (Japanese, whose
  // labels are shorter, had 55px spare). See ui/Menu.tsx for
  // why the glyph is a "☰" now that 「作り方」 IS a destination in it, and for what stayed out.
  const menuItems: MenuItem[] = [
    { kind: "item", label: t("はじめかた"), onClick: () => setWelcome("help") },
    // A real page with an address of its own (`/guide`, see route.ts) — so this menu DOES hold a
    // destination, and that is what makes a ☰ the honest glyph for it. What still holds is that the
    // app's primary navigation stays visible: do not fold a VIEW in here. See ui/Menu.tsx.
    { kind: "item", label: t("作り方"), onClick: () => goPage("guide") },
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
  // Floating over the canvas the two rows were ~100px of a 357px pane, laid over exactly where the
  // top opening's ◇ is. In a bar above the pane they covered nothing, but six chips still wrapped
  // to two rows (85px) in English — and the labels are the app's top-level navigation, so shortening
  // them was never on. As dropdowns the same two choices cost ONE row in every language.
  //
  // NATIVE `<select>`s, deliberately: on a phone that opens the OS picker, a better touch target
  // than anything hand-rolled, with keyboard and screen-reader behaviour already correct and no
  // focus-trap code to own. The `beta` badge becomes text, an <option> not being able to carry markup.
  const modeSelect = (
    <span className="relative inline-flex">
      <select value={view} aria-label={t("表示")} onChange={(e) => setView(e.target.value as View)}
        className={"appearance-none [-webkit-appearance:none] min-h-38 pl-11 pr-26 py-0 rounded-md font-sans text-base font-bold leading-none border cursor-pointer " + "bg-accent text-[#fff] border-accent"}>
        {VIEWS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
      </select>
      {/* A sibling, not a background image: it has to take the fill colour of whichever state the
          select is in, and a background image cannot. */}
      <span aria-hidden="true" className={"absolute right-9 top-1/2 -translate-y-1/2 pointer-events-none text-2xs " + "text-[#fff]"}>▾</span>
    </span>
  );
  const routeSelect = (
    <span className="relative inline-flex">
      <select value={route} aria-label={t("つくりかた")} onChange={(e) => setRoute(e.target.value as Route)}
        className={"appearance-none [-webkit-appearance:none] min-h-38 pl-11 pr-26 py-0 rounded-md font-sans text-base font-bold leading-none border cursor-pointer " + "bg-card text-text border-card-edge"}>
        {ROUTES.map(([k, l, badge]) => (
          <option key={k} value={k}>{t(l)}{badge ? ` (${badge})` : ""}</option>
        ))}
      </select>
      <span aria-hidden="true" className={"absolute right-9 top-1/2 -translate-y-1/2 pointer-events-none text-2xs " + "text-sub"}>▾</span>
    </span>
  );
  const chipBar = narrow ? (
    <nav className="flex-none flex items-center gap-8 px-10 py-6 bg-panel border-b border-edge">
      {modeSelect}
      {/* Lit drops the route control for the same reason it drops the whole inspector — it is a
          viewing mode. The view control stays: in lit the panel is hidden, so this bar is the only
          way back out of it. */}
      {!isLit && routeSelect}
      <span className="flex-auto" />
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
  // One COLUMN, wherever it is placed: the first two are gated on opposite routes (bed = 3D print,
  // koma wall = cardboard) and could never collide, but the pull-out warning belongs to both, so
  // stacking is the only arrangement that does not overprint.
  //
  // Built as DATA rather than as markup, because the narrow layout has to count them and quote one
  // headline, and a fragment can answer neither. (That also retired a `hasAlert` predicate: a
  // fragment is truthy even when every card inside it is false, so it rendered an empty band.)
  //
  // WHERE the column goes is the responsive part. Wide, it floats in the canvas's bottom-right
  // (bottom-left is the lit hint's). On a phone it cannot: a three-line card is a quarter of a 357px
  // pane and lands squarely on the bottom opening's ◇ — an alert reading "widen the opening in the
  // section view" while sitting on the handle that widens it. So it goes in flow instead.
  const alerts: { key: string; head: string; hint?: string }[] = [];
  if (!isLit) {
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
  // In flow an expanded alert costs 115px and two cost ~200, out of the SAME budget as the inspector
  // — the scarce half. Measured on a 375×812 phone, one open alert cut the panel's scroll window
  // from 261px to 146, and in the print view (taller footer, and the koma-wall warning fires on the
  // default cardboard design) to 88px: 7% of the controls reachable at once, i.e. the exact failure
  // this layout was written to remove, arriving through the thing meant to help.
  //
  // Folded it costs ~36px and still SAYS it: the alert tint, the ⚠, the first headline (the "→ do
  // this" hint is what the tap is for) and a count. **Do not make it open by default to be safe.**
  const alertBar = narrow && alerts.length > 0 ? (
    <div className="flex-none bg-panel border-t border-edge">
      <button onClick={() => setAlertsOpen((v) => !v)} aria-expanded={alertsOpen}
        className="flex items-center gap-8 w-full min-h-36 px-12 py-6 bg-accent-07 border-0
          border-l-3 border-l-accent-5 border-solid cursor-pointer [font:inherit] text-base
          text-text text-left">
        <span className="flex-none text-lg">⚠️</span>
        {/* min-width 0 is what lets the ellipsis happen at all: a flex item's automatic minimum
            size is its own content, so without it the headline pushes the count and the caret off. */}
        <span className="flex-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {alerts[0].head}
        </span>
        {alerts.length > 1 && (
          <span className="flex-none font-mono text-sm text-sub">+{alerts.length - 1}</span>
        )}
        <span aria-hidden="true" className="flex-none text-faint">{alertsOpen ? "▾" : "▸"}</span>
      </button>
      {alertsOpen && (
        <div className="flex flex-col gap-6 px-10 pb-8">
          {alertCards}
        </div>
      )}
    </div>
  ) : null;

  // ============ Left: viewport ============
  const viewport = (
    // The pane has no share of the screen — it has everything the sheet is not using. On a phone the
    // inspector is a bottom sheet resting at `peek` (its bar alone), so the section editor gets
    // ~717px of an 812px screen instead of the 325px a fixed 40vh gave it, and pulling the sheet up
    // trades that back a stop at a time. Lit was already the exception and now needs no exception.
    <main ref={mainRef} className="relative min-w-0 min-h-0 flex-auto h-auto">
      {/* The gradient stays a style: it is a VALUE that follows `isLit`, and as an arbitrary class it
          would be ninety characters of punctuation saying the same thing. */}
      <div ref={mountRef} className="absolute inset-0"
        style={{ background: vpBg(isLit), transition: "background 0.3s" }} />
      {/* Section view: the direct-manipulation editor, overlaid on the WebGL canvas */}
      {view === "2d" && (
        <SectionEditor p={p} setP={setP} accent={accent} drag={drag} setDrag={setDrag}
          sel={sel} setSel={setSel} editMode={editMode} compact={narrow} t={t} />
      )}

      {/* Print view, cardboard route: the output is a document, so the preview is one — the
          template's own pages, over the same (empty) canvas the section editor uses. */}
      {paperPreview && <PagePreview p={p} matT={matT} lang={lang} />}

      {glError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 p-24
          text-center pointer-events-none">
          <div className="text-md font-semibold text-[#e0a060]">{t("⚠ 3Dプレビューを初期化できませんでした")}</div>
          <div className="text-sm font-mono text-[#8a8a96] break-words">{glError}</div>
          <div className="text-sm text-[#6f6f7a]">
            {t("お使いのブラウザで WebGL が無効の可能性があります。STLの生成・DLは引き続き利用できます。")}
          </div>
        </div>
      )}

      {/* Mode tabs. Floating over the canvas on a wide screen; in the bar above it on a phone —
          see `chipBar` below for why. */}
      {!narrow && <div className={`${CHIP_BOX} top-16`} style={chipTone}>{modeTabs}</div>}

      {/* The route switch lives on the viewport and not in the panel: it changes what this whole
          view IS (print plates vs template pages). Shown on every view except lit, not just the
          print view, because the route reaches further than its own view — `bedRules` gates the
          bed-overflow warning, the height hint and the rib-length warning colour, all of which
          surface in the SECTION view, so leaving the switch behind put the effect on one screen and
          its cause on another. Lit is excluded because it is a viewing mode. */}
      {!isLit && !narrow && (
        <div className={`${CHIP_BOX} top-62`} style={chipTone}>{routeTabs}</div>
      )}

      {/* Dimension chip (always live). On a phone it sits tighter to the corner: at 375px the tab
          strip reaches far enough right that the readout was printing through it. Right-aligned
          either way, so it reads as a status line rather than as another control. */}
      <div className="absolute top-24 right-24 text-base narrow:top-10 narrow:right-12 narrow:text-sm
        font-mono tracking-[0.05em] text-right pointer-events-none" style={{ color: chip.txt }}>
        ⌀{maxDia} × H{p.height} mm
      </div>

      {/* The alert column, floating in the canvas's bottom-right (declared above; on a phone it is
          a strip below the viewport instead — see `alertBar`). */}
      {!narrow && alerts.length > 0 && (
        <div className="absolute bottom-20 right-20 max-w-[60%] flex flex-col items-end gap-10">
          {alertCards}
        </div>
      )}

      {isLit && (
        <div className="absolute bottom-20 left-20 font-sans text-sm text-[#8a8a96] pointer-events-none">
          {t("鑑賞モード — 編集はタブで「断面」へ")}
        </div>
      )}
    </main>
  );

  // ============ Right: inspector (hidden in lit mode) ============
  const inspector = isLit ? null : (
    // As a sheet the panel is SIZED, not flexed: its height is the stop it is parked at and the
    // viewport takes whatever is left, so that pair alone stays a style — the height is a live px
    // number and the transition is off mid-drag so the sheet tracks the finger. Everything else is
    // the wide panel with `narrow:` overrides: `overflow-hidden` because at `peek` the sheet is only
    // as tall as its bar, which leaves the pinned CTA hanging past its own bottom edge.
    <aside ref={asideRef}
      className="flex flex-col min-h-0 w-336 flex-[0_0_336px] bg-panel text-text border-l border-edge
        narrow:w-auto narrow:flex-none narrow:border-l-0 narrow:border-t narrow:rounded-t-2xl
        narrow:overflow-hidden narrow:shadow-[0_-6px_22px_rgba(59,52,43,0.13)]"
      style={narrow ? {
        height: sheetHeight,
        transition: sheetH == null ? "height 0.22s cubic-bezier(0.32,0.72,0,1)" : undefined,
      } : undefined}>
      {/* ---- The sheet's header: the grabber and the live summary ----
          Everything above the fold at `peek`. It is the drag surface and, for a press that never
          travels, the button that cycles to the next stop. `touchAction: none` so the browser does
          not claim the vertical gesture before the pointer handlers see it. */}
      {narrow && (
        <div ref={barRef} onPointerDown={onSheetDown} onPointerMove={onSheetMove}
          onPointerUp={onSheetUp} onPointerCancel={onSheetUp}
          className="flex-none relative flex items-center px-14 pt-14 pb-9 border-b border-edge
            cursor-grab [touch-action:none]">
          {/* The grabber pill is positioned against the BAR, not laid out inside the row: centred in
              the row it would be centred on the summary alone rather than on the sheet. (It was 37%
              off centre while the bar still carried two buttons.) */}
          <span aria-hidden="true" className="absolute top-6 left-1/2 -translate-x-1/2 w-38 h-4
            rounded-xs bg-edge" />
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
            className="flex-auto flex items-center justify-center min-h-20 cursor-pointer">
            {/* The summary the pinned footer used to carry. It is the readout you watch while
                dragging a ◇, so it is the whole of what the sheet shows at rest. Centred now that
                the header controls have moved to the chip bar: with them in the row it
                would have been centred on everything except them, i.e. on nothing. */}
            <span className="flex flex-wrap justify-center gap-x-12 gap-y-0 font-mono text-sm text-faint">
              <span>⌀{maxDia}</span>
              <span className={!bedRules || ribFits ? "text-faint" : "text-warn"}>{t("羽根板")} {ribLen}</span>
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
      <div className="flex items-center justify-between px-20 pt-20 pb-14">
        <Logo variant="full" height={44} className="text-head" />
        {headerBtns}
      </div>
      )}

      {/* Scroll area — between the bar and the pinned CTA, on both layouts. That is what makes
          `peek` work without reordering anything: at rest the sheet is exactly bar-tall, so
          this collapses to zero, and every stop above it grows this and only this. */}
      {/* No VERTICAL padding on a phone: `min-height: 0` floors the border box at padding + border, so
          4+14 of it is 18px this element cannot shrink past — and `peek` is the bar's own height,
          which then overflowed the sheet by exactly that and cut the bottom off the CTA. The spacing
          it bought is given back by the wordmark block at the end of the list.
          `overscroll-behavior: contain` because iOS momentum scrolling stops dead at the last row
          without it, and this is the only scrollable thing on the page (body is touch-action: none). */}
      <div className="flex-auto min-h-0 overflow-y-auto [touch-action:pan-y] [overscroll-behavior:contain]
        px-20 pt-6 pb-16 narrow:px-14 narrow:py-0">
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
        <div className="mb-20">
          <SectionLabel title="シルエット" hint="ドラッグ / 値クリックで入力" />
          {SIL_ROWS.map((r) => (
            <ScrubRow key={r.key} drag={drag} setDrag={setDrag}
              cfg={{ ...r, value: p[r.key], onChange: (v) => setP((o) => ({ ...o, [r.key]: v })) }} />
          ))}
        </div>

        {/* Framework */}
        <div className="mb-20">
          <SectionLabel title="骨組み" />
          <Stepper label="羽根板の枚数" value={p.boards} min={4} max={Math.min(16, boardsMax)} step={1}
            onChange={(v) => setP((o) => ({ ...o, boards: v }))}>
            {p.boards}<span className="text-faintest font-normal">{t(" 枚")}</span>
          </Stepper>
          {boardsMax < 16 && p.boards >= boardsMax && (
            <div className="text-sm leading-[1.5] text-faint pt-2 pb-4">
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
          <div className="text-sm leading-[1.5] text-faint pt-2 pb-4">
            {t("首の高さ・張り出しは断面図の◇(最外の制御点)を上下/左右にドラッグ")}
          </div>
        </div>

        {/* Bamboo ribs */}
        <div className="mb-20">
          <SectionLabel title="竹ひご" />
          <ScrubRow drag={drag} setDrag={setDrag} cfg={{
            key: "higoD", label: "竹ひご径", value: p.higoD, display: p.higoD.toFixed(1),
            min: 1, max: 4, round: 0.5, unit: "mm", onChange: (v) => setP((o) => ({ ...o, higoD: v })),
          }} />
          <ScrubRow drag={drag} setDrag={setDrag} cfg={{
            key: "pitch", label: "ひごピッチ", value: p.pitch,
            min: 8, max: 30, round: 1, unit: "mm", onChange: (v) => setP((o) => ({ ...o, pitch: v })),
          }} />
          <div className="mt-4">
            <Checkbox checked={p.spiral ?? false} onToggle={() => setP((o) => ({ ...o, spiral: !(o.spiral ?? false) }))}
              label={<>{t("螺旋巻き")} <span className="text-faint">{t("(溝を下へ連続させる)")}</span></>} />
          </div>
        </div>

        {/* Washi: the paper skin's own allowances. Part of the design (the panel follows the
            silhouette and the rib count), not an output method — the template ships with whichever
            output you pick, so there is no separate download here.
            Marked beta like the cardboard route, and for the same kind of reason: flattening a
            doubly-curved surface is approximate by nature, and how much a damp sheet takes up is
            still being checked against actual builds. The dimensions are checked (check:paper), the
            fit on a real lantern is not. */}
        <div className="mb-20">
          <SectionLabel title="和紙" hint="羽根板の間 1面分 · beta" />
          <Stepper label="のりしろ(左右)" value={washiSide} min={0} max={15} step={1} onChange={setWashiSide}>
            {washiSide} mm
          </Stepper>
          <Stepper label="被せ代(上下)" value={washiEnd} min={0} max={15} step={1} onChange={setWashiEnd}>
            {washiEnd} mm
          </Stepper>
          <div className="flex items-center justify-between py-7">
            <span className="text-base text-text">{t("1面のサイズ")}</span>
            <span className="font-mono text-sm text-faint">
              {Math.round(2 * washiG.wMax)} × {Math.round(washiG.sTot + 2 * washiEnd)} mm × {p.boards}
            </span>
          </div>
          <Note className="mt-2">
            {t("貼る前に和紙を切るための原寸型紙です。どちらの出力にも別 PDF で同梱されます。")}
            <br />{t("この型紙は検証中です。全面を切る前に、まず 1 面だけ合わせてみてください。")}
          </Note>
        </div>

        {/* Opening ring: like the washi, a part of the finished LANTERN rather than of the mold, which
            is why it sits down here with the washi and not up in 骨組み. The hoop itself is sized from
            the opening and has nothing to set; the bottom one's leg sockets do. */}
        <div className="mb-20">
          <SectionLabel title="開口リング" hint="完成品に残る輪" />
          <Checkbox checked={!!p.legSockets} label="脚ソケット(下)"
            onToggle={() => setP((o) => ({ ...o, legSockets: !o.legSockets }))} />
          {/* Said here, not on the part: the way out of it is a control on this panel, and a socket
              that silently is not there is one you find out about with the print in your hand. It
              only appears when the design ASKED for sockets — otherwise it is not news. */}
          {p.legSockets && !legsFit && (
            <div className="text-sm leading-[1.5] text-faint pt-2 pb-4">
              {t("この開口には脚ソケットが入りません(下の輪のみになります)。開口を広げると入ります")}
            </div>
          )}
        </div>

        {/* Print view: the settings for whichever route is selected — the switch itself sits on the
            viewport, next to the mode tabs. The washi template is deliberately NOT a third route: it
            is not another way to make the mold, it is the paper skin you need on top of whichever
            mold you built, so it lives above with the design settings. */}
        {view === "print" && (
          <div className="border-t border-edge pt-16 mt-4">
            {/* Titled, because the panel is one long scroll: without it the first control reads as
                another shape setting rather than "this is the print/export section". The hint names
                the route, so the panel says which of the two these settings belong to. */}
            <SectionLabel title="印刷・書き出し" hint={route === "stl" ? "3Dプリント" : "段ボール"} />

            {route === "stl" ? (
              <>
                <SectionLabel title="プリントベッド" />
                {/* Common (square) bed presets as a dropdown rather than a wrapping chip row (saves a
                    row of height). It sets width = depth; 幅/奥行き below stay for rectangular beds. */}
                <div className="flex items-center justify-between mb-12">
                  <span className="text-base text-text">{t("定番サイズ")}</span>
                  <select value={bedW === bedD && BED_PRESETS.includes(bedW) ? String(bedW) : "custom"}
                    aria-label={t("定番サイズ")}
                    onChange={(e) => { const v = +e.target.value; if (v) { setBedW(v); setBedD(v); } }}
                    className="w-150 px-8 py-6 font-sans text-base text-text bg-card border
                      border-card-edge rounded-md cursor-pointer">
                    {!(bedW === bedD && BED_PRESETS.includes(bedW)) && <option value="custom">{t("カスタム")}</option>}
                    {BED_PRESETS.map((sz) => <option key={sz} value={sz}>{sz} × {sz} mm</option>)}
                  </select>
                </div>
                <NumInput label="幅" value={bedW} onChange={setBedW} min={100} max={420} />
                <NumInput label="奥行き" value={bedD} onChange={setBedD} min={100} max={420} />

                {/* Layout — how many rib copies go on the plate. A per-job output choice, not a bed
                    dimension, so it gets its own group. */}
                <div className="border-t border-edge pt-14 mt-14">
                  <SectionLabel title="配置" />
                  {p.spiral ? (
                    <div className="flex items-center justify-between py-7">
                      <span className="text-base text-text">{t("印刷する羽根板")}</span>
                      <span className="font-mono text-sm text-faint">{t("螺旋: 全")}{p.boards}{t("枚(各1枚)")}</span>
                    </div>
                  ) : (
                    <Stepper label="印刷する羽根板" value={nRibs} min={1} max={p.boards} step={1} onChange={setPrintRibs}>
                      {nRibs}<span className="text-faintest font-normal"> / {p.boards}</span>
                    </Stepper>
                  )}
                </div>
              </>
            ) : (
              /* Cardboard: the A4 full-scale template for building without a 3D printer. Only the
                 material thickness lives here; "download the template ZIP" is the footer CTA. */
              <>
                <SectionLabel title="型紙(段ボール)" hint="A4 原寸 · beta" />
                <Note className="mb-12">
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
          <div className="pt-22 pb-14 opacity-50">
            <Logo variant="full" height={26} className="text-head" />
          </div>
        )}
      </div>

      {/* Summary + the CTA for the current mode — the pinned footer, at the BOTTOM on both layouts.
          It was briefly moved above the scroll area on a phone, to be part of what `peek` shows; that
          put a full-width button between the drag handle and the first control, and left the list
          sliding under it with no boundary — a half-cut row reads as a rendering fault. Pinning it at
          the bottom keeps it where a next-step action belongs and where the thumb is, and gives the
          list
          the edge to disappear behind that it always had.
          The summary is dropped here on a phone because the sheet's bar carries it, and `peek` is
          measured from that bar ALONE (`barRef`) — this footer sits below it and is clipped. */}
      <div className="flex-none border-t border-edge px-20 pt-16 pb-18
        narrow:px-14 narrow:pt-10 narrow:pb-12">
        {!narrow && (
        <div className="grid grid-cols-[auto_1fr] gap-x-12 gap-y-5 text-base mb-14">
          <span className="text-faint">{t("最大径")}</span>
          <span className="font-mono font-semibold text-right">⌀{maxDia} mm</span>
          <span className="text-faint">{t("羽根板の全長")}</span>
          <span className={`font-mono font-semibold text-right${!bedRules || ribFits ? "" : " text-warn"}`}>
            {ribLen} mm
          </span>
          <span className="text-faint">{t("上下の開口(半径)")}</span>
          <span className="font-mono font-semibold text-right">{topOpen} / {botOpen} mm</span>
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
            <KitNote warn={<><strong>{t("原寸 100% で印刷")}</strong>{t("(「用紙に合わせる」は不可)")}</>}
              state={kitNote} onToggle={() => setKitNote((v) => (v === "open" ? "shut" : "open"))} t={t}>
              <li><span className="font-mono">tomoshibi_katagami_a4.pdf</span>{t(" — 型紙")}</li>
              <li><span className="font-mono">{WASHI_PDF}</span>{t(" — 和紙の型紙(原寸で印刷)")}</li>
            </KitNote>
          </>
        ) : (
          <>
            <CTA label="STL 書き出し" onClick={() => { downloadKit(); setKitNote("open"); }} />
            {/* Miss this one and you print half a mold: the koma and the posts are identical top and
                bottom, so the kit carries one of each. */}
            <KitNote warn={<>{t("コマ・柱は各1つ。スライサーで")}<strong>{t("2つに複製")}</strong></>}
              state={kitNote} onToggle={() => setKitNote((v) => (v === "open" ? "shut" : "open"))} t={t}>
              <li><span className="font-mono">tomoshibi_*.stl</span>{t(" — 羽根板・コマ・土台・口輪")}</li>
              <li><span className="font-mono">{WASHI_PDF}</span>{t(" — 和紙の型紙(原寸で印刷)")}</li>
              <li><span className="font-mono">tomoshibi_config.json</span>{t(" — 設計のバックアップ")}</li>
            </KitNote>
          </>
        )}
      </div>
    </aside>
  );

  return (
    <TContext.Provider value={t}>
      <div className="flex flex-row narrow:flex-col h-full overflow-hidden
        bg-[#f2ecdf] text-text font-sans">
        {chipBar}
        {viewport}
        {pointBar}
        {alertBar}
        {inspector}
        <input ref={designFile} type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => { importDesign(e.target.files?.[0]); e.target.value = ""; }} />
        {welcome && (
          <Welcome route={welcome === "help" ? route : null} onClose={closeWelcome}
            onPick={(r) => { setRoute(r); closeWelcome(); }} />
        )}
        {/* The guide's one outbound link closes it as well as switching the view: the print view is
            somewhere you go to DO something, and leaving the document open over it would hide the
            thing it just sent you to. */}
        {guide && (
          <GuidePage route={route} onClose={() => goPage(null)}
            onGoPrint={() => { goPage(null); setView("print"); }} />
        )}
      </div>
    </TContext.Provider>
  );
}
