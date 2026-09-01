/**
 * ============================================================================
 * 灯 TOMOSHIBI — app shell
 * ============================================================================
 * A generator for 3D-printable forming molds (harigata = the mold you wind bamboo ribs onto and
 * paste washi over) for paper lanterns. Edit the profile curve and out come the STLs — ribs, koma,
 * stand — or a full-scale paper template if you have no printer.
 *
 * State and composition only. What it composes: geometry.ts (cross-section / 3D geometry — the
 * single source of shape) · three/viewport.ts (renderer, lights, materials, orbit, render loop) ·
 * three/scenes.ts (what each view draws) · hooks.ts (undo-redo, autosave, responsive flag, language) ·
 * ui/ (theme + the inspector's controls, chips, point card, toolbar) · SectionEditor.tsx (the
 * direct-manipulation section editor, SVG) · stl.ts / papercraft.ts / pdf.ts (exports)
 *
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
// The floating chip row's shell — one box for both rows (mode tabs `top-16`, route tabs `top-62`);
// the colours follow `isLit` and come in as a style. Wide only — on a phone they are `chipBar`, a bar
// above the viewport rather than a float. PagePreview's `pt-124` clears the
// LOWER row (62 plus the row's own height), so a tab's padding or font size moves that number too.
const CHIP_BOX = "absolute left-16 flex gap-2 p-4 rounded-lg border backdrop-blur-[6px] "
  + "shadow-[0_2px_10px_rgba(59,52,43,0.07)]";
// One skin for both floating tab rows.
const TAB_SKIN = "px-14 py-7 border-0 rounded-sm cursor-pointer transition-all duration-150 "
  + "bg-transparent text-[#6f6350] font-sans text-base font-medium "
  + "aria-pressed:bg-accent aria-pressed:text-[#fff] aria-pressed:font-bold";
// ---- The narrow layout's bottom sheet ----------------------------------------------------------
// Stops: `peek` (grabber bar alone), `half`, `full` = the shared budget minus `MIN_VIEW`. Fractions
// of the height the sheet SHARES WITH THE VIEWPORT, not of the window: the chip bar above is one row
// in Japanese and two in English, so window-relative `full` gave English a 37px section view where
// Japanese got 76.
const SHEET = { half: 0.45 } as const;
// The drawing never leaves the screen, at any stop — the sheet is a set of controls FOR it.
const MIN_VIEW = 140;
type SheetStop = "peek" | "half" | "full";
const SHEET_ORDER: SheetStop[] = ["peek", "half", "full"];
// Under this much travel a drag is a tap, which cycles to the next stop: 6px is the slop a finger
// puts into a deliberate press.
const SHEET_TAP = 6;
// One place: written into two ZIPs, printed in two notes. `_beta` is part of the name on purpose —
// the file outlives the screen it came from, so the caveat travels with it.
const WASHI_PDF = "tomoshibi_washi_a4_beta.pdf";
const BED_PRESETS = [180, 220, 250, 256, 300, 350];
// In build order: shape it, see it assembled, print it, light it. Every one is a RENDERING OF YOUR
// DESIGN — move a ◇ and all four redraw. Not the build guide, whose figures come from one fixed
// example (GUIDE_P): that is a page off the ☰ menu.
const VIEWS: [View, string][] = [["2d", "断面"], ["mold", "組立"], ["print", "印刷"], ["lit", "点灯"]];
// How the mold gets made. Cardboard is beta: same geometry.ts functions as the printed parts, covered
// by check:paper, but far less has been built on it.
const ROUTES: [Route, string, string | null][] = [["stl", "3Dプリント", null], ["paper", "段ボール", "beta"]];

// A warning line, usually with a "→ do this instead" under it. Position, stacking and gap belong to
// the column that holds them, not to the card.
/**
 * Under the export CTA: the one thing you must not get wrong, the ZIP's manifest folded behind it.
 * It renders NOTHING until the export has run, because none of it helps you DECIDE to press the
 * button — worth ~60px of pinned footer at every sheet stop against the five-line / ~95px paragraph
 * it was. **Do not put it back on screen "so people see it".**
 *
 * `state` is three-valued — `null` = no export yet (draw nothing), "open"/"shut" = the manifest's
 * fold. Two booleans would allow "folded but never downloaded", which has no drawing.
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

// Two fields rather than free children, so the narrow strip can quote `head` without rendering the
// whole card.
function Alert({ head, hint }: { head: string; hint?: string }) {
  return (
    <div className="flex items-center gap-10 px-14 py-10 bg-card border border-accent-4
      rounded-lg shadow-[0_3px_12px_rgba(59,52,43,0.1)] font-sans text-base text-text text-left">
      <span className="flex-none text-lg">⚠️</span>
      <span>{head}{hint && <><br /><span className="text-sub">{hint}</span></>}</span>
    </div>
  );
}

// Restored once at startup (module top level, so a lazy initializer can't parse twice).
const SAVED = typeof window !== "undefined" ? loadSaved() : null;

export default function TomoshibiStudio() {
  const [p, setP] = useState(SAVED?.p ?? DEFAULTS);
  const [view, setView] = useState<View>("2d");           // section view first: easiest place to read the shape
  // "stl" (3D print) / "paper" (cardboard). Chosen on the welcome card, switchable from the viewport
  // chip in any non-lit view, NOT transient — a fact about the maker, not the design. It decides
  // whether the print bed constrains anything: on cardboard nothing is, a part larger than A4 just
  // continues onto the next page, butt-joined.
  const [route, setRoute] = useState<Route>(SAVED?.route ?? "stl");
  const [drag, setDrag] = useState<string | null>(null);           // key being dragged (highlights handles / slider rows)
  const [printRibs, setPrintRibs] = useState(SAVED?.printRibs ?? 1);
  const [bedW, setBedW] = useState(SAVED?.bedW ?? 256);   // print bed (mm). Restored as a machine setting
  const [bedD, setBedD] = useState(SAVED?.bedD ?? 256);
  const [matT, setMatT] = useState(SAVED?.matT ?? 5);     // measured cardboard thickness (mm)
  // Washi allowances (mm): side = the overlap where panels lap over a rib, end = how far the sheet
  // runs past the opening to fold over the ring.
  const [washiSide, setWashiSide] = useState(SAVED?.washiSide ?? WASHI_SIDE);
  const [washiEnd, setWashiEnd] = useState(SAVED?.washiEnd ?? WASHI_END);
  const [sel, setSel] = useState<number | null>(null);             // selected control point in the section editor (transient)
  const [editMode, setEditMode] = useState<EditMode>("move"); // section editor: "move" points / "curve" tangent handles
  const [alertsOpen, setAlertsOpen] = useState(false);             // narrow only: the alert strip, folded (see alertBar)
  // null until an export has run (see KitNote).
  const [kitNote, setKitNote] = useState<null | "open" | "shut">(null);
  const [sheet, setSheet] = useState<SheetStop>("peek");           // narrow only: the inspector sheet's stop
  const [sheetH, setSheetH] = useState<number | null>(null);       // px while a drag is in progress, else null
  const barRef = useRef<HTMLDivElement>(null);                     // the sheet's grabber + summary bar
  const asideRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Here rather than in the menu: a menu row unmounts the moment it is clicked, and an <input> that
  // is gone cannot open its own dialog.
  const designFile = useRef<HTMLInputElement>(null);
  const [peekH, setPeekH] = useState(44);                          // measured: the bar = the `peek` height
  const [budgetH, setBudgetH] = useState(0);                       // measured: viewport + sheet, the height they share
  const [glError, setGlError] = useState<string | null>(null);

  const narrow = useNarrow(860);
  const { lang, toggleLang, t } = useLang();
  const { undo, redo, canUndo, canRedo } = useUndoRedo(p, setP);
  const [mountRef, three] = useViewport(setGlError);
  const prevView = useRef<View | null>(null);   // detects a view switch, to set that view's opening camera angle

  // First-run onboarding card, auto-opening until dismissed once. Keyed on the dismissal flag ALONE,
  // not on "is there a saved design": the autosave flushes on pagehide, so a first-time visitor who
  // merely reloads already has saved state and would never see the card. "first" = auto-opened,
  // "help" = reopened from the ☰ menu; the first-run one marks NEITHER route, "stl" being a default
  // nobody chose.
  const [welcome, setWelcome] = useState<WelcomeCard>(() => (loadWelcomeSeen() ? null : "first"));
  const closeWelcome = () => { saveWelcomeSeen(); setWelcome(null); };
  // The build guide. Not a view: its figures come from one fixed example rather than from `p`. The
  // one thing here with a URL — `/guide`, linkable and left with the back button — and `page` is that
  // URL, through the history API (src/route.ts). Renamed in: `route` is this file's word for how the
  // mold gets MADE.
  const { route: page, go: goPage } = usePageRoute();
  const guide = page === "guide";

  // Clamp the rib count to what fits the koma, whatever made it too large (board thickness,
  // tolerance, the opening ◇): overlapping notches produce a non-watertight koma.
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

  // Ribs to print (1..boards). With spiral winding every rib differs, so all are exported.
  const nRibs = p.spiral ? p.boards : Math.min(printRibs, p.boards);

  // ---- Exports ----
  const downloadKit = () => {
    // Rib file layout. Spiral: one rib per file (tomoshibi_rib_01.stl …), placeable individually in
    // the slicer. Otherwise the ribs are identical and go in one file (print one, duplicate it).
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
    // The config JSON rides along so the ZIP is itself a design backup (same schema as persist.ts).
    // The washi template too: its panel width follows the rib count you are about to print and,
    // unlike the parts, cannot be re-derived from the STLs. A PDF, so it prints at 100%, in the UI's
    // language.
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

  // The cardboard bundle, shaped like the STL kit's: one download, washi a separate PDF inside it.
  // Both follow the UI's language.
  const downloadPaperKit = () => zipBundle({
    "tomoshibi_katagami_a4.pdf": paperPDF(p, matT, undefined, t),
    // moldSrc, not p: on this route the panel follows the possibly-clamped rib count.
    [WASHI_PDF]: washiPDF(moldSrc, washiOpts, undefined, t),
  }, "tomoshibi_katagami.zip");

  // Export the design as JSON — localStorage is a volatile cache, this file is the backup. Same
  // schema as the config.json inside the ZIP.
  const exportDesign = () => downloadFile(
    serializeState({ p, bedW, bedD, printRibs, matT, washiSide, washiEnd, route }),
    "tomoshibi_design.json", "application/json",
  );

  // The standalone export, or the config.json out of the ZIP. parseImport sanitizes, so broken / old
  // / hand-edited values fall back safely rather than breaking geometry.
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
  // Washi panel figures for the readout. A 0.5mm meridian sweep, so memoized (dragging re-renders
  // constantly).
  const washiG = useMemo(() => washiGore(p, { side: washiSide, end: washiEnd }), [p, washiSide, washiEnd]);
  // Whether this opening has room for the sockets at all — asked apart from the checkbox, so the
  // panel can say "they will not fit here" without saying it to someone who turned them off. The
  // function the geometry reads, so the two cannot disagree.
  const legsFit = useMemo(() => ringLegsFit(p), [p]);
  // Opening radii, informational only: ribs come out by removing a koma and tilting them, so
  // "opening ≥ rib width" would not decide whether they clear. `ribPullFit` does, with its own alert.
  const topOpen = Math.round(outerR(p, 1));
  const botOpen = Math.round(outerR(p, 0));

  // Real footprint of every printed part (rebuilt only when the design changes). Actual bounding
  // boxes rather than "rib along depth, base along width", which broke on non-square (W≠D) beds: the
  // fit test can then use a 90° turn or a diagonal tilt, per part.
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
  // Tallest body at which BOTH length-driven parts still fit (usually the rib: wider than the base,
  // so it hits the diagonal limit sooner). Widths don't depend on height, so heights are tested
  // without rebuilding geometry, and fit is monotonic in height — walk up, stop at the first miss.
  const heightLimit = useMemo(() => {
    const ribW = Math.min(...bedFit.rib), baseW = Math.min(...bedFit.base);
    const baseConst = Math.round(standBoardLength(p) - p.height);   // base length minus height
    // 0 = no height fits at all: the parts are too WIDE, and the hint below then stays away rather
    // than telling someone to shrink a body that was never the problem. (Seeded with the minimum it
    // read "→ reduce to 60mm" for a ⌀1.1m design.)

    let limit = 0;
    for (let h = LIMITS.height[0]; h <= LIMITS.height[1]; h++) {
      if (!fitOnBed([ribW, h + 2 * p.tabLen], bedW, bedD).fits || !fitOnBed([baseW, h + baseConst], bedW, bedD).fits) break;
      limit = h;
    }
    return limit;
  }, [bedFit, p, bedW, bedD]);

  const isLit = view === "lit";   // lit = a viewing mode: panel hidden, dark background
  const bedRules = route === "stl";   // does a print bed constrain this design at all? (cardboard: never)
  // The cardboard print view is a document, not a scene: PagePreview draws the template's pages over
  // the (idle) canvas, as the section editor does.
  const paperPreview = view === "print" && route === "paper" && !isLit;
  // The cardboard counterpart to the bed-overflow check. Cheap enough to run every render, and
  // deliberately NOT limited to the print view: every way out of it (fewer ribs, thinner material, a
  // wider opening) is a control you reach for while designing.
  const fit = useMemo(() => (route === "paper" ? paperFit(p, matT) : null), [route, p, matT]);
  const thinWall = fit && fit.wall < fit.thin;
  // Stable identity, so the preview's memo isn't invalidated by every unrelated render.
  const washiOpts = useMemo(() => ({ side: washiSide, end: washiEnd }), [washiSide, washiEnd]);
  // The mold this route actually makes: on cardboard `paperP`, not the design on screen, since thick
  // material sets the board thickness and can clamp the rib count. The washi panel is one rib-to-rib
  // bay wide, so it must be cut for that mold — as must the pull-out check below.
  const moldSrc = useMemo(() => (route === "paper" ? paperP(p, matT) : p), [route, p, matT]);
  // Can the ribs still come out once the paste has dried? A deep body on a small mouth traps them in
  // the shade, and nothing else notices: every part prints, fits the bed and is watertight. Not a
  // route question — a cardboard mold leaves by the same hole.
  const pull = useMemo(() => ribPullFit(moldSrc), [moldSrc]);

  // ---- The sheet's geometry -----------------------------------------------------------------
  // `peek` is the grabber bar alone — MEASURED, because the summary it carries wraps on a narrow
  // enough screen. (With the CTA too it was 128px: 16% of the phone at rest.) Seeded by a layout read:
  // an observer stays silent for an element the browser is not laying out.
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

  // The budget the viewport and the sheet share. Their SUM is invariant — one grows exactly as the
  // other shrinks — so observing both and adding gives a number that does not move while the sheet
  // animates; the guard below keeps the transition from re-rendering every frame. Excludes the chip
  // bar and the alert strip.
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

  // The three stops, in px. `peek` can be the tallest on a very short screen, so every stop is
  // floored at it rather than assumed to be above it.
  const sheetStops = useMemo(() => ({
    peek: peekH,
    half: Math.max(peekH, Math.round(budgetH * SHEET.half)),
    full: Math.max(peekH, budgetH - MIN_VIEW),
  }), [peekH, budgetH]);
  const cycleSheet = useCallback(
    () => setSheet((st) => SHEET_ORDER[(SHEET_ORDER.indexOf(st) + 1) % SHEET_ORDER.length]),
    [],
  );

  // Header only — arbitrating "is this finger scrolling the list or pulling the sheet" is the one
  // genuinely hard part of a bottom sheet and is not worth writing until someone misses it. A drag
  // shorter than SHEET_TAP is a tap, so the header is also the button.
  const dragRef = useRef<{ y0: number; h0: number; moved: boolean } | null>(null);
  const onSheetDown = useCallback((e: React.PointerEvent) => {
    // Let any real <button> inside the bar be pressed normally. Defensive: it holds none today.
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

  // How tall the sheet is: mid-drag a px number with the transition off, so it tracks the finger;
  // otherwise the current stop, animated.
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

  // Everything that acts on the APP or on the design AS A FILE, behind one "☰": wide, beside the
  // wordmark in the panel header; on a phone, top RIGHT of the chip bar — the one strip on screen in
  // every view and at every sheet stop, including lit. Folded because in ENGLISH the "?" and language
  // toggle it replaced filled the chip bar exactly: 99 + 144 + 88 + 24 of gaps + 20 of padding = 375
  // on the nose (Japanese's shorter labels had 55px spare). See ui/Menu.tsx.
  const menuItems: MenuItem[] = [
    { kind: "item", label: t("はじめかた"), onClick: () => setWelcome("help") },
    // A real page with an address (`/guide`, route.ts) — a destination, which is what makes ☰ honest.
    // The app's primary navigation stays visible: do not fold a VIEW in here.
    { kind: "item", label: t("作り方"), onClick: () => goPage("guide") },
    // A setting, not a verb: the row names the thing, the right-hand side shows what it would become.
    { kind: "item", label: t("言語"), value: lang === "ja" ? "English" : "日本語", onClick: toggleLang },
    { kind: "sep" },
    { kind: "item", label: t("バックアップを保存"), onClick: exportDesign },
    { kind: "item", label: t("バックアップから復元"), onClick: () => designFile.current?.click() },
    { kind: "sep" },
    // Separated and captioned with its consequence — a `title=` tooltip gives a phone nothing.
    { kind: "item", label: t("初期化"), hint: t("すべての設定を初期状態に戻す"), danger: true, onClick: resetAll },
  ];
  const headerBtns = <OverflowMenu label={t("メニュー")} items={menuItems} />;

  // ============ Narrow: the chips move OUT of the viewport, and become dropdowns ============
  // Floating over the canvas the two rows were ~100px of a 357px pane, over exactly where the top
  // opening's ◇ is; in a bar they covered nothing but still wrapped to two rows (85px) in English,
  // and the labels are the app's top-level navigation, so shortening them was never on. As dropdowns
  // the same two choices cost ONE row in every language.
  //
  // NATIVE `<select>`s: on a phone that opens the OS picker — a better touch target than anything
  // hand-rolled, keyboard and screen-reader behaviour correct, no focus-trap code to own. The `beta`
  // badge becomes text; an <option> cannot carry markup.
  const modeSelect = (
    <span className="relative inline-flex">
      <select value={view} aria-label={t("表示")} onChange={(e) => setView(e.target.value as View)}
        className={"appearance-none [-webkit-appearance:none] min-h-38 pl-11 pr-26 py-0 rounded-md font-sans text-base font-bold leading-none border cursor-pointer " + "bg-accent text-[#fff] border-accent"}>
        {VIEWS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
      </select>
      {/* A sibling, not a background image: it takes the fill colour of the select's state, which a
          background image cannot. */}
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
      {/* Lit drops the route control for the same reason it drops the inspector — it is a viewing
          mode. The view control stays: this bar is the only way back out of lit. */}
      {!isLit && routeSelect}
      <span className="flex-auto" />
      {headerBtns}
    </nav>
  ) : null;

  // ---- Narrow: the selected ◇, in flow above the sheet -----------------------------------------
  // Section view only — the only place a ◇ exists to select, and `sel` outlives a view change. See
  // ui/PointBar.tsx for the measurements that put it here rather than in the sheet.
  const pointBar = narrow && view === "2d" && sel != null ? (
    <PointBar p={p} setP={setP} sel={sel} setSel={setSel}
      editMode={editMode} setEditMode={setEditMode} />
  ) : null;

  // ---- Viewport alerts ----------------------------------------------------------------------
  // One COLUMN: bed (3D print) and koma wall (cardboard) are gated on opposite routes, but the
  // pull-out warning belongs to both, so stacking is the only arrangement that cannot overprint.
  // DATA rather than markup, because the narrow strip has to count them and quote one headline, and
  // a fragment is truthy even with every card inside it false. Wide, the column floats bottom-right
  // (bottom-left is the lit hint's); on a phone a three-line card is a quarter of a 357px pane and
  // lands on the bottom opening's ◇ — "widen the opening" sitting on the handle that widens it — so
  // it goes in flow.
  const alerts: { key: string; head: string; hint?: string }[] = [];
  if (!isLit) {
    // Bed-overflow. Each part lies along a different axis, so the bed is width×depth. Gated on the
    // whole 3D-print ROUTE, not just the print view: cardboard has no machine to overflow, and
    // shortening the body would shrink a design for a limit that route does not have.
    if (bedRules && overParts.length > 0) alerts.push({
      key: "bed",
      head: t("{parts} がベッド {w}×{d}mm を超過", { parts: overParts.join(" · "), w: bedW, d: bedD }),
      // The height hint applies only to the length-driven parts (rib / base): skip it when only a
      // height-independent part (ring / koma / post) overflows, or when no height is small enough.
      hint: ribBaseOver && heightLimit >= LIMITS.height[0]
        ? t("→ 火袋の高さを {h}mm 以下に", { h: heightLimit }) : undefined,
    });
    // Cardboard: the koma's notches are cut to the material thickness, so thick material eats the wall
    // between them until it tears when cut by hand.
    if (thinWall) alerts.push({
      key: "wall",
      head: t("コマの溝と溝の壁が {wall}mm — 手で切ると裂けやすい細さです", { wall: fit.wall.toFixed(1) }),
      hint: t("→ 羽根板を減らす / 薄い材料にする / 断面図で開口を広げる"),
    });
    // The mold has to come back out of the shade it made. The one warning here about a design that
    // cannot be BUILT rather than printed or cut, so it is the last thing anyone finds out on their
    // own, with a dry lantern in their hands.
    if (!pull.ok) alerts.push({
      key: "pull",
      head: t("羽根板の幅 {w}mm — 開口 ⌀{d}mm から抜けません", { w: Math.round(pull.band), d: Math.round(2 * pull.openR) }),
      hint: t("→ 断面図で開口を広げる / ふくらみを抑える"),
    });
  }
  const alertCards = alerts.map((a) => <Alert key={a.key} head={a.head} hint={a.hint} />);

  // ============ Narrow: the alert column is a strip you tap open ============
  // In flow an expanded alert costs 115px and two ~200, out of the SAME budget as the inspector. On a
  // 375×812 phone one open alert cut the panel's scroll window from 261px to 146, and in the print
  // view to 88px — 7% of the controls reachable at once. Folded it costs ~36px and still SAYS it: the
  // tint, the ⚠, the first headline (the "→ do this" hint is what the tap is for) and a count.
  // **Never open by default to be safe.**
  const alertBar = narrow && alerts.length > 0 ? (
    <div className="flex-none bg-panel border-t border-edge">
      <button onClick={() => setAlertsOpen((v) => !v)} aria-expanded={alertsOpen}
        className="flex items-center gap-8 w-full min-h-36 px-12 py-6 bg-accent-07 border-0
          border-l-3 border-l-accent-5 border-solid cursor-pointer [font:inherit] text-base
          text-text text-left">
        <span className="flex-none text-lg">⚠️</span>
        {/* min-width 0 is what allows the ellipsis: a flex item's automatic minimum size is its own
            content, so without it the headline pushes the count and the caret off. */}
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
    // The pane has no share of the screen — it has everything the sheet is not using. At `peek` the
    // section editor gets ~717px of an 812px phone against the 325px a fixed 40vh gave it. Lit needs
    // no exception.
    <main ref={mainRef} className="relative min-w-0 min-h-0 flex-auto h-auto">
      {/* The gradient stays a style: a VALUE that follows `isLit`, ninety characters of punctuation
          as an arbitrary class. */}
      <div ref={mountRef} className="absolute inset-0"
        style={{ background: vpBg(isLit), transition: "background 0.3s" }} />
      {/* The section editor, overlaid on the WebGL canvas */}
      {view === "2d" && (
        <SectionEditor p={p} setP={setP} accent={accent} drag={drag} setDrag={setDrag}
          sel={sel} setSel={setSel} editMode={editMode} compact={narrow} t={t} />
      )}

      {/* Print view, cardboard: the output is a document, so the preview is one — the template's own
          pages, over the same (empty) canvas the section editor uses. */}
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

      {/* Mode tabs. Floating over the canvas on a wide screen; in the bar above it on a phone. */}
      {!narrow && <div className={`${CHIP_BOX} top-16`} style={chipTone}>{modeTabs}</div>}

      {/* On the viewport, not in the panel: it changes what this whole view IS. Shown on every view
          except lit, because `bedRules` gates the bed-overflow warning, the height hint and the
          rib-length warning colour, all of which surface in the SECTION view. */}
      {!isLit && !narrow && (
        <div className={`${CHIP_BOX} top-62`} style={chipTone}>{routeTabs}</div>
      )}

      {/* Dimension chip (always live). Tighter to the corner on a phone: at 375px the tab strip
          reaches far enough right that the readout printed through it. Right-aligned either way, so
          it reads as a status line rather than a control. */}
      <div className="absolute top-24 right-24 text-base narrow:top-10 narrow:right-12 narrow:text-sm
        font-mono tracking-[0.05em] text-right pointer-events-none" style={{ color: chip.txt }}>
        ⌀{maxDia} × H{p.height} mm
      </div>

      {/* The alert column, floating in the canvas's bottom-right (on a phone it is a strip below the
          viewport instead — see `alertBar`). */}
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
    // As a sheet the panel is SIZED, not flexed: its height is the stop it is parked at, so that pair
    // stays a style — a live px number, transition off mid-drag so the sheet tracks the finger.
    // `overflow-hidden` because at `peek` the sheet is only as tall as its bar, which leaves the
    // pinned CTA past its own bottom edge.
    <aside ref={asideRef}
      className="flex flex-col min-h-0 w-336 flex-[0_0_336px] bg-panel text-text border-l border-edge
        narrow:w-auto narrow:flex-none narrow:border-l-0 narrow:border-t narrow:rounded-t-2xl
        narrow:overflow-hidden narrow:shadow-[0_-6px_22px_rgba(59,52,43,0.13)]"
      style={narrow ? {
        height: sheetHeight,
        transition: sheetH == null ? "height 0.22s cubic-bezier(0.32,0.72,0,1)" : undefined,
      } : undefined}>
      {/* The grabber and the live summary: everything above the fold at `peek`. The drag surface
          and, for a press that never travels, the button that cycles to the next stop.
          `touchAction: none` so the browser does not claim the vertical gesture first. */}
      {narrow && (
        <div ref={barRef} onPointerDown={onSheetDown} onPointerMove={onSheetMove}
          onPointerUp={onSheetUp} onPointerCancel={onSheetUp}
          className="flex-none relative flex items-center px-14 pt-14 pb-9 border-b border-edge
            cursor-grab [touch-action:none]">
          {/* Positioned against the BAR, not laid out in the row, where it would be centred on the
              summary rather than on the sheet (37% off, when the bar still carried two buttons). */}
          <span aria-hidden="true" className="absolute top-6 left-1/2 -translate-x-1/2 w-38 h-4
            rounded-xs bg-edge" />
          {/* A div with role=button, not a <button>: `onSheetDown` bails out of anything inside a
              real <button> to keep the bar's buttons pressable, so a <button> grabber would be the
              one part of the bar you could not pull. It cannot contain a real button either, hence
              the left part of the bar rather than all of it. A press that never travels is already a
              tap (onSheetUp), so this only adds the keyboard. */}
          <div role="button" tabIndex={0} aria-label={t("設定パネル")} title={t("設定パネル")}
            aria-expanded={sheet !== "peek"}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleSheet(); } }}
            className="flex-auto flex items-center justify-center min-h-20 cursor-pointer">
            {/* The readout you watch while dragging a ◇, so it is all the sheet shows at rest.
                Centring only works now that the header controls have moved to the chip bar. */}
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
      {/* alignItems is center, not baseline: an SVG's baseline is its bottom edge, which would hang
          the buttons off the tagline. Not rendered on a phone — the buttons moved to the sheet's bar
          and the wordmark into the scroll area. */}
      {!narrow && (
      <div className="flex items-center justify-between px-20 pt-20 pb-14">
        <Logo variant="full" height={44} className="text-head" />
        {headerBtns}
      </div>
      )}

      {/* Between the bar and the pinned CTA on both layouts, which is what makes `peek` work without
          reordering: at rest the sheet is exactly bar-tall, so this collapses to zero and every stop
          above it grows this and only this. */}
      {/* No VERTICAL padding on a phone: `min-height: 0` floors the border box at padding + border, so
          4+14 of it is 18px this element cannot shrink past — which overflowed `peek` by exactly that
          and cut the bottom off the CTA. The wordmark block at the end gives that spacing back.
          `overscroll-behavior: contain` because iOS momentum scrolling stops dead at the last row
          without it, this being the only scrollable thing on the page (body is touch-action: none). */}
      <div className="flex-auto min-h-0 overflow-y-auto [touch-action:pan-y] [overscroll-behavior:contain]
        px-20 pt-6 pb-16 narrow:px-14 narrow:py-0">
        <Toolbar undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />

        {/* The lit chip is derived from p.pts inside PresetChips, so it goes dark as soon as the
            curve is edited — picking a preset stores no "which one was clicked" flag. rTop/rBot go
            along because geometry.ts falls back to them when pts is empty. A preset may also carry a
            `height`, and one does: a shape whose identity is a RATIO cannot be handed whatever height
            was on screen (config.ts). Everything else about the design is kept. */}
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

        {/* Washi allowances. Part of the design (the panel follows the silhouette and the rib count),
            not an output method — the template ships with whichever output you pick, so there is no
            separate download here. Marked beta: flattening a doubly-curved surface is approximate by
            nature, and how much a damp sheet takes up is unchecked against real builds. The
            dimensions are checked (check:paper); the fit is not. */}
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

        {/* Opening ring: like the washi, part of the finished LANTERN rather than of the mold, which
            is why it sits here and not in 骨組み. The hoop is sized from the opening and has nothing
            to set; the bottom one's leg sockets do. */}
        <div className="mb-20">
          <SectionLabel title="開口リング" hint="完成品に残る輪" />
          <Checkbox checked={!!p.legSockets} label="脚ソケット(下)"
            onToggle={() => setP((o) => ({ ...o, legSockets: !o.legSockets }))} />
          {/* Said here, not on the part: the way out is a control on this panel, and a socket that
              silently is not there is one you find out about with the print in your hand. Shown only
              when the design ASKED for sockets. */}
          {p.legSockets && !legsFit && (
            <div className="text-sm leading-[1.5] text-faint pt-2 pb-4">
              {t("この開口には脚ソケットが入りません(下の輪のみになります)。開口を広げると入ります")}
            </div>
          )}
        </div>

        {/* The settings for the selected route — the switch itself sits on the viewport, next to the
            mode tabs. The washi template is deliberately NOT a third route: it is the paper skin
            needed on top of whichever mold you built, so it lives with the design. */}
        {view === "print" && (
          <div className="border-t border-edge pt-16 mt-4">
            {/* Titled, because the panel is one long scroll: untitled, the first control reads as
                another shape setting. The hint names the route. */}
            <SectionLabel title="印刷・書き出し" hint={route === "stl" ? "3Dプリント" : "段ボール"} />

            {route === "stl" ? (
              <>
                <SectionLabel title="プリントベッド" />
                {/* Common (square) bed presets as a dropdown rather than a wrapping chip row (saves a
                    row of height). Sets width = depth; 幅/奥行き below stay for rectangular beds. */}
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
                    dimension, hence its own group. */}
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
              /* Cardboard: the A4 full-scale template. Only the material thickness lives here;
                 "download the template ZIP" is the footer CTA. */
              <>
                <SectionLabel title="型紙(段ボール)" hint="A4 原寸 · beta" />
                <Note className="mb-12">
                  {t("この出力は開発中です。寸法は3Dプリント版と同じ計算から出していますが、実際に組んだ報告がまだ少ないルートです。材料の厚みは必ず実測し、刷った紙の 50mm スケールを定規で確認してください。")}
                </Note>
                <Stepper label="材料の厚み" value={matT} min={1} max={10} step={0.5} onChange={setMatT}>
                  {matT} mm
                </Stepper>
                {/* Counterpart to the 3D route's bed warning: on paper there is no machine size to
                    exceed, and saying nothing would read as a missing check. */}
                <Note>{t("大きさの制限はありません。A4 に収まらない部品は次のページに続きます(両方を青い枠で切り、同じ番号の半ダイヤが◇になるよう突き合わせて裏からテープ)。")}</Note>
              </>
            )}
          </div>
        )}
        {/* The wordmark, phone only, at the END of the scroll: the panel header it sat in is gone
            here, and at the top it would spend the first 40px of every pull on identity. */}
        {narrow && (
          <div className="pt-22 pb-14 opacity-50">
            <Logo variant="full" height={26} className="text-head" />
          </div>
        )}
      </div>

      {/* Summary + the CTA for the current mode — pinned at the BOTTOM on both layouts. Moved above
          the scroll area (to be part of what `peek` shows) it put a full-width button between the
          drag handle and the first control and left the list sliding under it with no boundary.
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
            {/* A PDF is already A4 at exact size, so the printer's own scaling is the only way to
                lose it — which is why this line stays out in the open. */}
            <KitNote warn={<><strong>{t("原寸 100% で印刷")}</strong>{t("(「用紙に合わせる」は不可)")}</>}
              state={kitNote} onToggle={() => setKitNote((v) => (v === "open" ? "shut" : "open"))} t={t}>
              <li><span className="font-mono">tomoshibi_katagami_a4.pdf</span>{t(" — 型紙")}</li>
              <li><span className="font-mono">{WASHI_PDF}</span>{t(" — 和紙の型紙(原寸で印刷)")}</li>
            </KitNote>
          </>
        ) : (
          <>
            <CTA label="STL 書き出し" onClick={() => { downloadKit(); setKitNote("open"); }} />
            {/* Miss this and you print half a mold: koma and posts are identical top and bottom, so
                the kit carries one of each. */}
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
        {/* The guide's one outbound link closes it as well as switching the view: leaving the
            document open over the print view would hide the thing it just sent you to. */}
        {guide && (
          <GuidePage route={route} onClose={() => goPage(null)}
            onGoPrint={() => { goPage(null); setView("print"); }} />
        )}
      </div>
    </TContext.Provider>
  );
}
