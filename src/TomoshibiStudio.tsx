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
import React, { useEffect, useRef, useState } from "react";
import { maxBoards, WASHI_SIDE, WASHI_END } from "./geometry.ts";
import * as kit from "./kit.ts";
import { useFigures, buildAlerts } from "./derived.ts";
import { AlertBar } from "./ui/Alerts.tsx";
import { ViewChips, ViewBar, type View } from "./ui/ViewTabs.tsx";
import Viewport from "./Viewport.tsx";
import { useBottomSheet } from "./ui/sheet.ts";
import InspectorPanel from "./ui/panel/InspectorPanel.tsx";
import SheetBar from "./ui/panel/SheetBar.tsx";
import SilhouetteSection from "./ui/panel/SilhouetteSection.tsx";
import FrameworkSection from "./ui/panel/FrameworkSection.tsx";
import HigoSection from "./ui/panel/HigoSection.tsx";
import WashiSection from "./ui/panel/WashiSection.tsx";
import RingSection from "./ui/panel/RingSection.tsx";
import ExportSection from "./ui/panel/ExportSection.tsx";
import PanelFooter from "./ui/panel/PanelFooter.tsx";
import type { KitNoteState } from "./ui/panel/KitNote.tsx";
import { useViewport } from "./three/viewport.ts";
import { buildScene } from "./three/scenes.ts";
import { useAutosave, useLang, useNarrow, usePageRoute, useUndoRedo } from "./hooks.ts";
import { loadSaved, loadWelcomeSeen, saveWelcomeSeen } from "./persist.ts";
import SectionEditor from "./SectionEditor.tsx";
import PagePreview from "./PagePreview.tsx";
import GuidePage from "./GuidePage.tsx";
import Welcome from "./Welcome.tsx";
import { DEFAULTS } from "./config.ts";
import { accent, chipStyle, TContext } from "./ui/theme.ts";
import PresetChips from "./ui/PresetChips.tsx";
import PointCard from "./ui/PointCard.tsx";
import PointBar from "./ui/PointBar.tsx";
import Toolbar from "./ui/Toolbar.tsx";
import OverflowMenu, { type MenuItem } from "./ui/Menu.tsx";
import Logo from "./ui/Logo.tsx";
import type { EditMode } from "./ui/pointEdit.ts";
import type { Design, Route } from "./types.ts";

/** Which onboarding card is open: the first-visit one, the one reopened from the ☰ menu, or neither. */
type WelcomeCard = "first" | "help" | null;

// (The inspector's width is the aside's own `w-336 flex-[0_0_336px]`, written nowhere else.)

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
  // Here rather than in the menu: a menu row unmounts the moment it is clicked, and an <input> that
  // is gone cannot open its own dialog.
  const designFile = useRef<HTMLInputElement>(null);
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
  // Measurement and pointer state, all of it read by nothing outside itself (src/ui/sheet.ts).
  const sheetCtl = useBottomSheet({ narrow, isLit, lang });
  const { barRef, asideRef, mainRef } = sheetCtl;

  const chip = chipStyle(isLit);   // the dimension readout takes its ink from the same tone

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

  const chipBar = narrow
    ? <ViewBar view={view} setView={setView} route={route} setRoute={setRoute} isLit={isLit} menu={headerBtns} />
    : null;

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
  // The overlay and the tab row are built HERE, beside the state they close over, and handed to
  // Viewport as elements — see src/Viewport.tsx for why they are slots rather than props.
  const viewport = (
    <Viewport mainRef={mainRef} mountRef={mountRef} isLit={isLit} narrow={narrow}
      maxDia={maxDia} height={p.height} glError={glError} chipTxt={chip.txt} alerts={alerts}
      tabs={!narrow && <ViewChips view={view} setView={setView} route={route} setRoute={setRoute} isLit={isLit} />}
      overlay={
        <>
          {/* The section editor, overlaid on the WebGL canvas */}
          {view === "2d" && (
            <SectionEditor p={p} setP={setP} accent={accent} drag={drag} setDrag={setDrag}
              sel={sel} setSel={setSel} editMode={editMode} compact={narrow} t={t} />
          )}
          {/* Print view, cardboard: the output is a document, so the preview is one — the template's
              own pages, over the same (empty) canvas the section editor uses. */}
          {paperPreview && <PagePreview p={p} matT={matT} lang={lang} />}
        </>
      } />
  );

  // ============ Right: inspector (hidden in lit mode) ============
  const inspector = isLit ? null : (
    <InspectorPanel narrow={narrow} ctl={sheetCtl}
      bar={narrow && (
        <SheetBar ctl={sheetCtl} maxDia={maxDia} ribLen={ribLen} topOpen={topOpen} botOpen={botOpen}
          warnRib={bedRules && !ribFits} />
      )}
      header={!narrow && (
        /* alignItems is center, not baseline: an SVG's baseline is its bottom edge, which would hang
           the buttons off the tagline. Not rendered on a phone — the buttons moved to the sheet's bar
           and the wordmark into the scroll area. */
        <div className="flex items-center justify-between px-20 pt-20 pb-14">
          <Logo variant="full" height={44} className="text-head" />
          {headerBtns}
        </div>
      )}
      footer={
        <PanelFooter narrow={narrow} isPrint={view === "print"} route={route}
          goPrint={() => setView("print")}
          maxDia={maxDia} ribLen={ribLen} topOpen={topOpen} botOpen={botOpen}
          ribFits={ribFits} bedRules={bedRules}
          kitNote={kitNote} setKitNote={setKitNote}
          onDownloadStl={downloadKit} onDownloadPaper={downloadPaperKit} />
      }>
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
    </InspectorPanel>
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
