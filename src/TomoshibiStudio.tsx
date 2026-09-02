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
import { maxBoards, WASHI_SIDE, WASHI_END } from "./geometry.ts";
import * as kit from "./kit.ts";
import { useFigures, buildAlerts } from "./derived.ts";
import { AlertBar, AlertColumn } from "./ui/Alerts.tsx";
import SilhouetteSection from "./ui/panel/SilhouetteSection.tsx";
import FrameworkSection from "./ui/panel/FrameworkSection.tsx";
import HigoSection from "./ui/panel/HigoSection.tsx";
import WashiSection from "./ui/panel/WashiSection.tsx";
import RingSection from "./ui/panel/RingSection.tsx";
import ExportSection from "./ui/panel/ExportSection.tsx";
import PanelFooter from "./ui/panel/PanelFooter.tsx";
import type { KitNoteState } from "./ui/panel/KitNote.tsx";
import { clamp } from "./util.ts";
import { useViewport } from "./three/viewport.ts";
import { buildScene } from "./three/scenes.ts";
import { useAutosave, useLang, useNarrow, usePageRoute, useUndoRedo } from "./hooks.ts";
import { loadSaved, loadWelcomeSeen, saveWelcomeSeen } from "./persist.ts";
import SectionEditor from "./SectionEditor.tsx";
import PagePreview from "./PagePreview.tsx";
import GuidePage from "./GuidePage.tsx";
import Welcome from "./Welcome.tsx";
import { DEFAULTS } from "./config.ts";
import { accent, vpBg, chipStyle, TContext } from "./ui/theme.ts";
import { Badge } from "./ui/controls.tsx";
import PresetChips from "./ui/PresetChips.tsx";
import PointCard from "./ui/PointCard.tsx";
import PointBar from "./ui/PointBar.tsx";
import Toolbar from "./ui/Toolbar.tsx";
import OverflowMenu, { type MenuItem } from "./ui/Menu.tsx";
import Logo from "./ui/Logo.tsx";
import type { EditMode } from "./ui/pointEdit.ts";
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
// In build order: shape it, see it assembled, print it, light it. Every one is a RENDERING OF YOUR
// DESIGN — move a ◇ and all four redraw. Not the build guide, whose figures come from one fixed
// example (GUIDE_P): that is a page off the ☰ menu.
const VIEWS: [View, string][] = [["2d", "断面"], ["mold", "組立"], ["print", "印刷"], ["lit", "点灯"]];
// How the mold gets made. Cardboard is beta: same geometry.ts functions as the printed parts, covered
// by check:paper, but far less has been built on it.
const ROUTES: [Route, string, string | null][] = [["stl", "3Dプリント", null], ["paper", "段ボール", "beta"]];

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
  const [kitNote, setKitNote] = useState<KitNoteState>(null);
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
  // Thin call sites: the work is in kit.ts, the state stays here. Each is an arrow so `moldSrc` and
  // `washiOpts`, declared below, are read at click time rather than at definition time.
  const downloadKit = () => kit.downloadKit({ p, nRibs, bedW, bedD, washiSide, washiEnd, t });
  const downloadPaperKit = () => kit.downloadPaperKit({ p, matT, moldSrc, washiOpts, t });
  const exportDesign = () =>
    kit.exportDesign({ p, bedW, bedD, printRibs, matT, washiSide, washiEnd, route });
  const importDesign = (file: File | undefined) => kit.importDesign(file, t, (s) => {
    setP(s.p); setBedW(s.bedW); setBedD(s.bedD); setPrintRibs(s.printRibs); setMatT(s.matT);
    setWashiSide(s.washiSide); setWashiEnd(s.washiEnd); setRoute(s.route);
  });
  const resetAll = () => kit.resetAll(t, (s) => {
    setP(s.p); setBedW(s.bedW); setBedD(s.bedD); setPrintRibs(s.printRibs); setRoute(s.route);
  });

  // ---- Derived figures ----
  // Everything the design implies, in one memoized pass (src/derived.ts). Called HERE rather than in
  // the sections that read it: the inspector unmounts in lit view, and `heightLimit` alone would
  // then re-walk up to 1,941 heights on every round trip.
  const fig = useFigures(p, { bedW, bedD, matT, route, washiSide, washiEnd, t });
  const {
    maxDia, washiG, legsFit, topOpen, botOpen, overParts,
    ribFits, ribLen, heightLimit, fit, washiOpts, moldSrc, pull,
  } = fig;

  const isLit = view === "lit";   // lit = a viewing mode: panel hidden, dark background
  const bedRules = route === "stl";   // does a print bed constrain this design at all? (cardboard: never)
  // The cardboard print view is a document, not a scene: PagePreview draws the template's pages over
  // the (idle) canvas, as the section editor does.
  const paperPreview = view === "print" && route === "paper" && !isLit;

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
  // Built once and consumed twice — the floating column and, on a phone, the fold-out strip.
  const alerts = buildAlerts(fig, { isLit, bedRules, bedW, bedD, t });

  // ============ Narrow: the alert column is a strip you tap open ============
  // `alertsOpen` lives here, not in the strip: the strip unmounts when the last alert clears.
  const alertBar = narrow
    ? <AlertBar alerts={alerts} open={alertsOpen} onToggle={() => setAlertsOpen((v) => !v)} />
    : null;

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

      {/* On a phone it is a strip below the viewport instead — see `alertBar`. */}
      {!narrow && <AlertColumn alerts={alerts} />}

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

        <SilhouetteSection p={p} setP={setP} drag={drag} setDrag={setDrag} />
        <FrameworkSection p={p} setP={setP} boardsMax={boardsMax} drag={drag} setDrag={setDrag} />
        <HigoSection p={p} setP={setP} drag={drag} setDrag={setDrag} />
        <WashiSection boards={p.boards} side={washiSide} end={washiEnd}
          setSide={setWashiSide} setEnd={setWashiEnd} gore={washiG} />
        <RingSection legSockets={!!p.legSockets} legsFit={legsFit}
          onToggle={() => setP((o) => ({ ...o, legSockets: !o.legSockets }))} />
        {view === "print" && (
          <ExportSection route={route} p={p} nRibs={nRibs}
            bedW={bedW} bedD={bedD} setBedW={setBedW} setBedD={setBedD}
            setPrintRibs={setPrintRibs} matT={matT} setMatT={setMatT} />
        )}
        {/* The wordmark, phone only, at the END of the scroll: the panel header it sat in is gone
            here, and at the top it would spend the first 40px of every pull on identity. */}
        {narrow && (
          <div className="pt-22 pb-14 opacity-50">
            <Logo variant="full" height={26} className="text-head" />
          </div>
        )}
      </div>

      <PanelFooter narrow={narrow} isPrint={view === "print"} route={route}
        goPrint={() => setView("print")}
        maxDia={maxDia} ribLen={ribLen} topOpen={topOpen} botOpen={botOpen}
        ribFits={ribFits} bedRules={bedRules}
        kitNote={kitNote} setKitNote={setKitNote}
        onDownloadStl={downloadKit} onDownloadPaper={downloadPaperKit} />
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
