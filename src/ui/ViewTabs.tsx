/**
 * ============================================================================
 * THE TWO CHOICES, IN THEIR TWO FORMS
 * ============================================================================
 * What you are looking at (`view`) and how the mold gets made (`route`) — floating over the canvas
 * on a wide screen, a bar above it on a phone. One file because it is the same two choices twice:
 * six chips wrapped to 85px of height in English, which is what turned them into native `<select>`s
 * at narrow widths, and that argument reads as one argument.
 *
 * `chipStyle` is called in each consumer rather than drilled: it is a pure function of one boolean,
 * so recomputing is free, and a `chipTone` prop would have to reach the dimension readout too.
 * ============================================================================
 */
import { Badge } from "./controls.tsx";
import { chipStyle, useT } from "./theme.ts";
import type { Route } from "../types.ts";

/** Which viewport the middle of the screen is showing. Only `route` outlives the session. */
export type View = "2d" | "mold" | "print" | "lit";

// In build order: shape it, see it assembled, print it, light it. Every one is a RENDERING OF YOUR
// DESIGN — move a ◇ and all four redraw. Not the build guide, whose figures come from one fixed
// example (GUIDE_P): that is a page off the ☰ menu.
const VIEWS: [View, string][] = [["2d", "断面"], ["mold", "組立"], ["print", "印刷"], ["lit", "点灯"]];
// How the mold gets made. Cardboard is beta: same geometry.ts functions as the printed parts, covered
// by check:paper, but far less has been built on it.
const ROUTES: [Route, string, string | null][] = [["stl", "3Dプリント", null], ["paper", "段ボール", "beta"]];

// The floating chip row's shell — one box for both rows (mode tabs `top-16`, route tabs `top-62`);
// the colours follow `isLit` and come in as a style. Wide only. PagePreview's `pt-124` clears the
// LOWER row (62 plus the row's own height), so a tab's padding or font size moves that number too.
const CHIP_BOX = "absolute left-16 flex gap-2 p-4 rounded-lg border backdrop-blur-[6px] "
  + "shadow-[0_2px_10px_rgba(59,52,43,0.07)]";
// One skin for both floating tab rows.
const TAB_SKIN = "px-14 py-7 border-0 rounded-sm cursor-pointer transition-all duration-150 "
  + "bg-transparent text-[#6f6350] font-sans text-base font-medium "
  + "aria-pressed:bg-accent aria-pressed:text-[#fff] aria-pressed:font-bold";

/** Wide: two rows of chips floating over the canvas. */
export function ViewChips({ view, setView, route, setRoute, isLit }: {
  view: View; setView: (v: View) => void;
  route: Route; setRoute: (r: Route) => void; isLit: boolean;
}) {
  const t = useT();
  const chip = chipStyle(isLit);
  const tone = { background: chip.bg, borderColor: chip.edge };
  return (
    <>
      <div className={`${CHIP_BOX} top-16`} style={tone}>
        {VIEWS.map(([k, l]) => (
          <button key={k} className={TAB_SKIN} aria-pressed={view === k} onClick={() => setView(k)}>{t(l)}</button>
        ))}
      </div>
      {/* On the viewport, not in the panel: it changes what this whole view IS. Shown on every view
          except lit, because `bedRules` gates the bed-overflow warning, the height hint and the
          rib-length warning colour, all of which surface in the SECTION view. */}
      {!isLit && (
        <div className={`${CHIP_BOX} top-62`} style={tone}>
          {ROUTES.map(([k, l, badge]) => (
            <button key={k} className={TAB_SKIN} aria-pressed={route === k} onClick={() => setRoute(k)}>
              {t(l)}{badge && <Badge>{badge}</Badge>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// NATIVE `<select>`s: on a phone that opens the OS picker — a better touch target than anything
// hand-rolled, keyboard and screen-reader behaviour correct, no focus-trap code to own. The `beta`
// badge becomes text; an <option> cannot carry markup.
const SELECT = "appearance-none [-webkit-appearance:none] min-h-38 pl-11 pr-26 py-0 rounded-md "
  + "font-sans text-base font-bold leading-none border cursor-pointer";
const SELECT_ON = "bg-accent text-[#fff] border-accent";
const SELECT_OFF = "bg-card text-text border-card-edge";
// A sibling, not a background image: it takes the fill colour of the select's state, which a
// background image cannot.
const CARET = "absolute right-9 top-1/2 -translate-y-1/2 pointer-events-none text-2xs";
const CARET_ON = "text-[#fff]";
const CARET_OFF = "text-sub";

/**
 * Narrow: the chips move OUT of the viewport and become dropdowns, so the same two choices cost ONE
 * row in every language. `menu` arrives as a node, so the ☰ is still built beside the handlers it
 * closes over.
 */
export function ViewBar({ view, setView, route, setRoute, isLit, menu }: {
  view: View; setView: (v: View) => void;
  route: Route; setRoute: (r: Route) => void; isLit: boolean; menu: React.ReactNode;
}) {
  const t = useT();
  return (
    <nav className="flex-none flex items-center gap-8 px-10 py-6 bg-panel border-b border-edge">
      <span className="relative inline-flex">
        <select value={view} aria-label={t("表示")} onChange={(e) => setView(e.target.value as View)}
          className={`${SELECT} ${SELECT_ON}`}>
          {VIEWS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
        </select>
        <span aria-hidden="true" className={`${CARET} ${CARET_ON}`}>▾</span>
      </span>
      {/* Lit drops the route control for the same reason it drops the inspector — it is a viewing
          mode. The view control stays: this bar is the only way back out of lit. */}
      {!isLit && (
        <span className="relative inline-flex">
          <select value={route} aria-label={t("つくりかた")} onChange={(e) => setRoute(e.target.value as Route)}
            className={`${SELECT} ${SELECT_OFF}`}>
            {ROUTES.map(([k, l, badge]) => (
              <option key={k} value={k}>{t(l)}{badge ? ` (${badge})` : ""}</option>
            ))}
          </select>
          <span aria-hidden="true" className={`${CARET} ${CARET_OFF}`}>▾</span>
        </span>
      )}
      <span className="flex-auto" />
      {menu}
    </nav>
  );
}
