/**
 * State and composition only. It renders no control of its own and builds no 3D: the moment a scene
 * detail or a button's styling lands back here, the file starts growing towards the 1,400 lines it
 * used to be.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { maxBoards } from "../geometry.ts";
import * as kit from "./kit.ts";
import { useFigures, buildAlerts } from "./derived.ts";
import { AlertBar } from "../ui/Alerts.tsx";
import { ViewChips, ViewBar, type View } from "../ui/ViewTabs.tsx";
import Viewport from "../ui/Viewport.tsx";
import { useBottomSheet } from "../ui/sheet.ts";
import InspectorPanel from "../ui/panel/InspectorPanel.tsx";
import SheetBar from "../ui/panel/SheetBar.tsx";
import SilhouetteSection from "../ui/panel/SilhouetteSection.tsx";
import FrameworkSection from "../ui/panel/FrameworkSection.tsx";
import HigoSection from "../ui/panel/HigoSection.tsx";
import WashiSection from "../ui/panel/WashiSection.tsx";
import RingSection from "../ui/panel/RingSection.tsx";
import ExportSection from "../ui/panel/ExportSection.tsx";
import PanelFooter from "../ui/panel/PanelFooter.tsx";
import type { KitNoteState } from "../ui/panel/KitNote.tsx";
import { useViewport } from "../three/viewport.ts";
import { buildScene } from "../three/scenes.ts";
import { useAutosave, useLang, useNarrow, usePageRoute, useUndoRedo } from "./hooks.ts";
import { FRESH, loadSaved, loadWelcomeSeen, saveWelcomeSeen, type SavedState } from "./persist.ts";
import SectionEditor from "../ui/section/SectionEditor.tsx";
import PagePreview from "../ui/PagePreview.tsx";
import GuidePage from "../guide/GuidePage.tsx";
import { NotePage, NotesIndexPage } from "../notes/NotesPage.tsx";
import Welcome from "../ui/Welcome.tsx";
import { accent, chipStyle, TContext } from "../ui/theme.ts";
import PresetChips from "../ui/PresetChips.tsx";
import PointCard from "../ui/PointCard.tsx";
import PointBar from "../ui/PointBar.tsx";
import Toolbar from "../ui/Toolbar.tsx";
import OverflowMenu, { type MenuItem } from "../ui/Menu.tsx";
import Logo from "../ui/Logo.tsx";
import type { EditMode } from "../ui/pointEdit.ts";
import type { Design } from "../types.ts";
import { REPO_URL } from "../config.ts";
import { getNote } from "../notes/content.ts";

/** Which onboarding card is open: the first-visit one, the one reopened from the ☰ menu, or neither. */
type WelcomeCard = "first" | "help" | null;

// Restored once at startup (module top level, so a lazy initializer can't parse twice).
const SAVED = typeof window !== "undefined" ? loadSaved() : null;

export default function TomoshibiStudio() {
  /**
   * Everything that SURVIVES a reload, in one record whose shape IS `SavedState` — the design plus
   * the machine settings, which are facts about the maker rather than the lantern (the build route
   * among them: it decides whether a print bed constrains this design at all).
   *
   * **One record, because the eight fields were previously eight `useState`s and that made the same
   * list five more times** — the initializers' own defaults, `useAutosave`, `exportDesign`,
   * `importDesign` and `resetAll` — and a field reaching some of them and not the rest has already
   * shipped twice: 「初期化」 left the washi allowances standing, and the ZIP's config went out as a
   * `Pick` of five. Now the list exists only in the type, and adding a field to `SavedState` is the
   * whole change. Transient view state (`view`, `sel`, `drag`, …) deliberately stays out: it is not
   * saved, and folding it in here would put a camera angle in the backup file.
   */
  const [s, setS] = useState<SavedState>(SAVED ?? FRESH);
  const { p, route, printRibs, bedW, bedD, matT, washiSide, washiEnd } = s;
  /** Write one field of it. The controls take a plain `(v) => void`, so they never see the record. */
  const set = useCallback(<K extends keyof SavedState>(k: K, v: SavedState[K]) =>
    setS((o) => ({ ...o, [k]: v })), []);
  /**
   * The design's own setter, keeping the `Dispatch<SetStateAction<Design>>` shape its callers pass
   * around: the section editor updates FROM the previous design on every pointer move, and a
   * plain-value setter would make each of those read a `p` captured one render ago.
   */
  const setP = useCallback<React.Dispatch<React.SetStateAction<Design>>>(
    (v) => setS((o) => ({ ...o, p: typeof v === "function" ? v(o.p) : v })), []);

  const [view, setView] = useState<View>("2d");           // section view first: easiest place to read the shape
  const [drag, setDrag] = useState<string | null>(null);           // key being dragged (highlights handles / slider rows)
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

  // Keyed on the dismissal flag ALONE, not on "is there a saved design": the autosave flushes on
  // pagehide, so a first-time visitor who merely reloads already has saved state and would never see
  // the card. The first-run card marks NEITHER route, "stl" being a default nobody chose.
  const [welcome, setWelcome] = useState<WelcomeCard>(() => (loadWelcomeSeen() ? null : "first"));
  const closeWelcome = () => { saveWelcomeSeen(); setWelcome(null); };
  // The build guide. Not a view: its figures come from one fixed example rather than from `p`.
  // Renamed on the way in: `route` is this file's word for how the mold gets MADE.
  const { route: page, go: goPage } = usePageRoute();
  const guide = page === "guide";
  const notes = page === "notes";
  const note = page ? getNote(page, lang) : null;
  const noteSlug = note ? page : null;

  // Clamp the rib count to what fits the koma, whatever made it too large (board thickness,
  // tolerance, the opening ◇): overlapping notches produce a non-watertight koma.
  const boardsMax = maxBoards(p);
  // `setP` is listed because it is no longer a `useState` setter the lint rule knows is stable. It
  // is stable — `useCallback([])` — so the effect still runs only when the count or the ceiling moves.
  useEffect(() => {
    if (p.boards > boardsMax) setP((o) => ({ ...o, boards: boardsMax }));
  }, [p.boards, boardsMax, setP]);

  // Runs after the clamp above, so what lands in localStorage is always the clamped design.
  useAutosave(s);

  // The note is a DOWNLOAD's own confirmation, and `PanelFooter` picks which manifest to show from
  // `route` — so a note left standing across a route switch describes a ZIP that was never made.
  // Switching to 段ボール after an STL export used to show 「原寸 100% で印刷」 and list the
  // cardboard PDF. Clearing on the route, not on the export, because ☰ →はじめかた can switch it too.
  useEffect(() => { setKitNote(null); }, [route]);

  useEffect(() => {
    const viewChanged = prevView.current !== view;
    prevView.current = view;
    buildScene(three.current, { p, view, viewChanged, printRibs, bedW, bedD, route });
  }, [p, view, printRibs, bedW, bedD, route, three]);

  // Ribs to print (1..boards). With spiral winding every rib differs, so all are exported.
  const nRibs = p.spiral ? p.boards : Math.min(printRibs, p.boards);

  // ---- Exports ----
  // Each is an arrow so `moldSrc` and `washiOpts`, declared below, are read at click time rather
  // than at definition time.
  const downloadKit = () => kit.downloadKit({ p, nRibs, bedW, bedD, washiSide, washiEnd, t });
  const downloadPaperKit = () => kit.downloadPaperKit({ p, matT, moldSrc, washiOpts, t });
  // Both hand the WHOLE record over, so `setS` IS the apply callback: a restore or a reset that
  // reinstates only the fields someone remembered to list is the bug this collapse exists for.
  const exportDesign = () => kit.exportDesign(s);
  const importDesign = (file: File | undefined) => kit.importDesign(file, t, setS);
  const resetAll = () => kit.resetAll(t, setS);

  // ---- Derived figures ----
  // Everything the design implies, in one memoized pass (src/studio/derived.ts). Called HERE rather than in
  // the sections that read it: the inspector unmounts in lit view, and `heightLimit` alone would
  // then re-walk up to 1,941 heights on every round trip.
  const fig = useFigures(p, { bedW, bedD, matT, route, washiSide, washiEnd, t });
  // Only what this file itself renders. The rest of `fig` reaches `buildAlerts` as `fig`, so
  // destructuring it here just made a second, silently drifting list of the same fields.
  const {
    maxDia, washiG, legsFit, topOpen, botOpen,
    ribFits, ribLen, washiOpts, moldSrc,
  } = fig;

  const isLit = view === "lit";   // lit = a viewing mode: panel hidden, dark background
  const bedRules = route === "stl";   // does a print bed constrain this design at all? (cardboard: never)
  // The cardboard print view is a document, not a scene: PagePreview draws the template's pages over
  // the (idle) canvas, as the section editor does.
  const paperPreview = view === "print" && route === "paper" && !isLit;

  // ---- The sheet's geometry ----
  const sheetCtl = useBottomSheet({ narrow, isLit, lang });
  const { mainRef } = sheetCtl;

  const chip = chipStyle(isLit);   // the dimension readout takes its ink from the same tone

  // Everything that acts on the APP or on the design AS A FILE, behind one "☰" (ui/Menu.tsx).
  const menuItems: MenuItem[] = [
    { kind: "item", label: t("はじめかた"), onClick: () => setWelcome("help") },
    // The app's primary navigation stays visible: do not fold a VIEW in here.
    { kind: "item", label: t("作り方"), onClick: () => goPage("guide") },
    { kind: "item", label: t("Notes"), onClick: () => goPage("notes") },
    // The app is served from a static host with no install step, so the ☰ is the only place it can
    // say where it came from. Named for what is there, not just for the host it is on.
    { kind: "item", label: t("ソースコード (GitHub)"), href: REPO_URL },
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
    ? <ViewBar view={view} setView={setView} route={route} setRoute={(r) => set("route", r)} isLit={isLit} menu={headerBtns} />
    : null;

  // ---- Narrow: the selected ◇, in flow above the sheet -----------------------------------------
  // Section view only — the only place a ◇ exists to select, and `sel` outlives a view change.
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
  // Viewport as elements — see src/ui/Viewport.tsx for why they are slots rather than props.
  const viewport = (
    <Viewport mainRef={mainRef} mountRef={mountRef} isLit={isLit} narrow={narrow}
      maxDia={maxDia} height={p.height} glError={glError} chipTxt={chip.txt} alerts={alerts}
      tabs={!narrow && <ViewChips view={view} setView={setView} route={route} setRoute={(r) => set("route", r)} isLit={isLit} />}
      overlay={
        <>
          {/* The section editor, overlaid on the WebGL canvas */}
          {view === "2d" && (
            <SectionEditor p={p} setP={setP} accent={accent} drag={drag} setDrag={setDrag}
              sel={sel} setSel={setSel} editMode={editMode} compact={narrow} t={t} />
          )}
          {/* The output is a document, so the preview is one — the template's own pages, over the
              same (empty) canvas the section editor uses. */}
          {paperPreview && <PagePreview p={p} matT={matT} />}
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
           the buttons off the tagline. */
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
            along because geometry.ts falls back to them when pts is empty. */}
        <PresetChips p={p} onPick={(pr) => {
          setSel(null);
          setP((o) => ({ ...o, rTop: pr.rTop, rBot: pr.rBot, pts: pr.pts.map((q) => ({ ...q })), ...(pr.height ? { height: pr.height } : {}) }));
        }} />

        {/* Narrow: `ui/PointBar.tsx` carries this instead. Gated HERE rather than by a `compact`
            prop the card early-returned on, which ran its hooks' worth of work before dropping it. */}
        {view === "2d" && !narrow && (
          <PointCard p={p} setP={setP} sel={sel} setSel={setSel} editMode={editMode} setEditMode={setEditMode} />
        )}

        <SilhouetteSection p={p} setP={setP} drag={drag} setDrag={setDrag} />
        <FrameworkSection p={p} setP={setP} boardsMax={boardsMax} drag={drag} setDrag={setDrag} />
        <HigoSection p={p} setP={setP} drag={drag} setDrag={setDrag} />
        <WashiSection boards={moldSrc.boards} side={washiSide} end={washiEnd}
          setSide={(v) => set("washiSide", v)} setEnd={(v) => set("washiEnd", v)} gore={washiG} />
        <RingSection legSockets={!!p.legSockets} legsFit={legsFit}
          onToggle={() => setP((o) => ({ ...o, legSockets: !o.legSockets }))} />
        {view === "print" && (
          <ExportSection route={route} p={p} nRibs={nRibs}
            bedW={bedW} bedD={bedD} setBedW={(v) => set("bedW", v)} setBedD={(v) => set("bedD", v)}
            setPrintRibs={(v) => set("printRibs", v)} matT={matT} setMatT={(v) => set("matT", v)} />
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
            onPick={(r) => { set("route", r); closeWelcome(); }} />
        )}
        {/* The guide's one outbound link closes it as well as switching the view: leaving the
            document open over the print view would hide the thing it just sent you to. */}
        {guide && (
          <GuidePage route={route} onClose={() => goPage(null)}
            onGoPrint={() => { goPage(null); setView("print"); }}
            onGoNote={(slug, hash) => goPage(slug, hash)} />
        )}
        {notes && (
          <NotesIndexPage lang={lang} onClose={() => goPage(null)}
            onOpen={(slug) => goPage(slug)} />
        )}
        {noteSlug && (
          <NotePage slug={noteSlug} lang={lang} onClose={() => goPage(null, "", true)}
            onBackToNotes={() => goPage("notes")} onBackToGuide={() => goPage("guide")} />
        )}
      </div>
    </TContext.Provider>
  );
}
