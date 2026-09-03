// One file because it is the same two choices twice: what you are looking at and how the mold gets
// made, as chips over the canvas on a wide screen and as a bar above it on a phone.
import { Badge } from "./controls.tsx";
import { chipStyle, useT } from "./theme.ts";
import type { Route } from "../types.ts";

/** Which viewport the middle of the screen is showing. Only `route` outlives the session. */
export type View = "2d" | "mold" | "print" | "lit";

// In build order, and every one is a RENDERING OF YOUR DESIGN — move a ◇ and all four redraw. The
// build guide is not among them: its figures come from one fixed example, so it is a page.
const VIEWS: [View, string][] = [["2d", "断面"], ["mold", "組立"], ["print", "印刷"], ["lit", "点灯"]];
// Cardboard is beta: the same geometry.ts functions as the printed parts, but far less built on it.
const ROUTES: [Route, string, string | null][] = [["stl", "3Dプリント", null], ["paper", "段ボール", "beta"]];

// PagePreview's `pt-124` clears the LOWER of these two rows (62 plus the row's own height), so a
// tab's padding or font size moves that number too.
const CHIP_BOX = "absolute left-16 flex gap-2 p-4 rounded-lg border backdrop-blur-[6px] "
  + "shadow-[0_2px_10px_rgba(59,52,43,0.07)]";
// No ink of its own: the unpressed colour is INHERITED from the chip box, which takes it from
// `chipStyle` along with the ground it sits on. Hardcoding it here meant the two moved apart — the
// box went dark in the lit view while the text stayed the light view's brown, at 3.3:1.
const TAB_SKIN = "px-14 py-7 border-0 rounded-sm cursor-pointer transition-all duration-150 "
  + "bg-transparent text-[color:inherit] font-sans text-base font-medium "
  + "aria-pressed:bg-accent aria-pressed:text-[#fff] aria-pressed:font-bold";

/** Wide: two rows of chips floating over the canvas. */
export function ViewChips({ view, setView, route, setRoute, isLit }: {
  view: View; setView: (v: View) => void;
  route: Route; setRoute: (r: Route) => void; isLit: boolean;
}) {
  const t = useT();
  const chip = chipStyle(isLit);
  const tone = { background: chip.bg, borderColor: chip.edge, color: chip.txt };
  return (
    <>
      <div className={`${CHIP_BOX} top-16`} style={tone}>
        {VIEWS.map(([k, l]) => (
          <button key={k} className={TAB_SKIN} aria-pressed={view === k} onClick={() => setView(k)}>{t(l)}</button>
        ))}
      </div>
      {/* Shown on every view but lit, because `bedRules` gates the bed-overflow warning, the height
          hint and the rib-length warning colour, all of which surface in the SECTION view. */}
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

// NATIVE `<select>`s: on a phone that opens the OS picker, a better touch target than anything
// hand-rolled, with the keyboard and the screen reader already correct. Only the closed state is styled.
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
 * Narrow: the chips move OUT of the viewport, so the same two choices cost ONE row in every
 * language. `menu` arrives as a node, so the ☰ is still built beside the handlers it closes over.
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
      {/* The view control stays even in lit: this bar is the only way back out of it. */}
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
