/**
 * `route` is the route to MARK as current, or **null to mark neither**, which the first-run card
 * passes so that a default nobody picked is not coloured in; reopened from ☰ the buttons are a
 * switch, so the live route is marked. That distinction lives in the caller.
 *
 * Presentational only — no app state, no geometry.
 */
import React, { useEffect, useRef } from "react";
import { UI as ui, accent, accentA, useT } from "./theme.ts";
import { Badge } from "./controls.tsx";
import Logo from "./Logo.tsx";
import type { Route } from "../types.ts";

// Everything a keyboard can land on inside the card. `[tabindex="-1"]` is deliberately excluded:
// programmatically focusable is not the same as tabbable, and including it would put stops in the
// cycle that Tab cannot otherwise reach.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),'
  + ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Which of the three drawn step marks to render. */
type StepKind = "section" | "export" | "build";

// The three steps drawn rather than described. The app's own accent, so they read as this app's
// marks.
function StepIcon({ kind }: { kind: StepKind }) {
  const faint = ui.faint;
  return (
    <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true" className="block">
      {kind === "section" && (
        <>
          <path d="M22 5c-9 6-13 13-13 21 0 7 5 12 13 12s13-5 13-12c0-8-4-15-13-21z"
            fill={accentA(0.08)} stroke={faint} strokeWidth="1.6" />
          <line x1="22" y1="5" x2="22" y2="38" stroke={faint} strokeWidth="1" strokeDasharray="2 3" />
          <rect x="31" y="19" width="8" height="8" rx="1.8" transform="rotate(45 35 23)"
            fill={accent} stroke={accent} strokeWidth="2" />
        </>
      )}
      {kind === "export" && (
        <>
          <rect x="7" y="6" width="21" height="27" rx="2" fill="#fff" stroke={faint} strokeWidth="1.6" />
          <path d="M12 13h11M12 18h11M12 23h7" stroke={faint} strokeWidth="1.4" strokeLinecap="round" />
          {/* a rib lying flat = the printed part */}
          <path d="M20 38c6-1 11-4 15-9l3 3c-4 6-10 9-17 10z" fill={accentA(0.15)}
            stroke={accent} strokeWidth="1.8" strokeLinejoin="round" />
        </>
      )}
      {kind === "build" && (
        <>
          <path d="M22 6c-8 5-12 12-12 19s5 12 12 12 12-5 12-12-4-14-12-19z"
            fill={accentA(0.14)} stroke={accent} strokeWidth="1.8" />
          <path d="M11.5 20h21M10.2 26h23.6M11.5 32h21" stroke={accent} strokeWidth="1.1" opacity="0.55" />
          <rect x="17" y="3" width="10" height="4" rx="1.5" fill={accent} />
        </>
      )}
    </svg>
  );
}

const STEPS: [StepKind, string, string][] = [
  ["section", "断面を決める", "◇ドラッグで形をつくる"],
  ["export", "出力する", "STL か 原寸の型紙"],
  ["build", "貼る", "竹ひごを巻いて和紙を貼る"],
];

// The two ways to make the mold. Sub-line = what you receive, since "3D print / cardboard" names
// the equipment, not the output. Cardboard keeps its beta badge: this card is where it is chosen,
// and offering it without the caveat oversells it.
//
// Cardboard's sub-line said "no size limit", which was written when the print bed stopped applying
// to this route and overshot: pages split DOWNWARD only, so a part WIDER than A4's content column
// is clipped, and `derived.ts` raises an alert saying exactly that. What is actually unbounded is
// the other axis — sheets butt vertically — so that is what it now claims.
const ROUTES: [Route, string, string, string | null][] = [
  ["stl", "3Dプリンタ", "STL 一式をダウンロード", null],
  ["paper", "段ボール", "A4 原寸の型紙を印刷 · 縦につないで大きく", "beta"],
];

export default function Welcome({ route = null, onPick, onClose }: {
  route?: Route | null; onPick: (r: Route) => void; onClose: () => void;
}) {
  const t = useT();
  const btnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Esc closes, and focus starts on the (only) button so the keyboard isn't stranded behind the scrim.
  //
  // Tab is trapped, because `aria-modal` is a PROMISE that the rest of the page is inert and nothing
  // here makes it so: Tab used to walk out of the card into the view chips behind the scrim and on
  // through the whole app, never coming back, while a screen reader was told the background did not
  // exist. The trap is what makes the attribute true.
  useEffect(() => {
    btnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      // `offsetParent` drops anything display:none — a step's button in a collapsed block would
      // otherwise become a stop you can tab to but cannot see.
      const stops = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!stops.length) return;
      const first = stops[0], last = stops[stops.length - 1], here = document.activeElement;
      if (!card.contains(here)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (!e.shiftKey && here === last) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && here === first) { e.preventDefault(); last.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // Closed on a press that BEGINS on the backdrop, not on any click whose target is the overlay:
    // `click` fires on the common ancestor, so pressing inside the card and releasing outside it —
    // a text selection, a mis-aimed drag — counted as dismissing, and `closeWelcome` had already
    // written the seen flag, so the card never came back on its own.
    <div onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-20
        bg-[rgba(43,36,26,0.42)] backdrop-blur-[3px]">
      <div ref={cardRef} role="dialog" aria-modal="true" aria-label={t("はじめかた")}
        /* `m-auto` centres this, NOT the overlay's align-items: centred by align-items a card
           taller than the window overflows in BOTH directions, and a scroll container cannot reach
           what is above its start edge. An auto margin resolves to 0 once the free space goes
           negative. Width 560 rather than 520, below which a step caption strands a character in
           Japanese. */
        className="relative m-auto w-[min(560px,100%)] rounded-2xl border border-edge bg-panel
          text-text font-sans shadow-[0_18px_50px_rgba(43,36,26,0.3)]
          pt-26 px-26 pb-22 max-[480px]:pt-18 max-[480px]:px-16 max-[480px]:pb-16">
        {/* The only way out that is not also a choice. It is chrome, not a third option beside the
            two routes, which is what it read as while it was a button on a footer row. */}
        <button onClick={onClose}
          className="absolute top-10 right-10 w-36 h-36 p-0 flex items-center justify-center
            bg-transparent border-0 rounded-full cursor-pointer font-sans text-2xl leading-none
            text-faint hover:bg-card hover:text-text" title={t("閉じる")} aria-label={t("閉じる")}>×</button>
        <Logo variant="full" className="h-62 w-auto text-head max-[480px]:h-44" />
        {/* The card's one job: say what you can DO here, in words someone who has never made a
            lantern already knows. It used to say 「張型」— the correct trade word, and the reason a
            bullet had to follow it explaining that the shape on screen was not a lantern. Leading
            with the outcome (a lantern, yours, any shape) makes that bullet unnecessary: the three
            steps below then SHOW that what this site hands you is the mold, which is what 「型から」
            says without stopping to define itself. */}
        <div className="mt-8 text-md text-sub">{t("好きな形の和紙提灯を、型からつくれます")}</div>

        {/* The three steps, with arrows between them */}
        <div className="flex items-stretch gap-4 my-18 mb-16 bg-card border border-card-edge
          rounded-2xl pt-14 px-10 pb-13
          max-[480px]:flex-col max-[480px]:gap-2 max-[480px]:mt-14 max-[480px]:mb-13
          max-[480px]:pt-11 max-[480px]:px-12 max-[480px]:pb-10">
          {STEPS.map(([kind, title, caption], i) => (
            <React.Fragment key={kind}>
              {i > 0 && <div aria-hidden="true"
                className="self-center text-faintest text-xl px-2
                  max-[480px]:rotate-90 max-[480px]:origin-center max-[480px]:p-0
                  max-[480px]:-my-1 max-[480px]:text-md max-[480px]:leading-none">→</div>}
              <div className="flex-1 min-w-0 flex flex-col items-center gap-6 text-center py-4 px-6
                max-[480px]:flex-row max-[480px]:items-center max-[480px]:gap-12
                max-[480px]:text-left max-[480px]:p-2">
                <StepIcon kind={kind} />
                <div className="text-base font-bold max-[480px]:flex-none">{t(title)}</div>
                <div className="text-xs text-sub leading-[1.45] max-[480px]:flex-auto">{t(caption)}</div>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Two buttons rather than a segmented toggle: each is also the "start" action, so nobody
            chooses and then confirms. */}
        <div className="mt-18">
          <div className="flex items-baseline justify-between mb-8">
            <span className="text-sm text-sub">{t("どちらでつくりますか?")}</span>
            <span className="text-xs text-faintest">{t("後からいつでも変更できます")}</span>
          </div>
          {/* Stacked, not side by side: full width reads as a button rather than a tile, and the two
              captions stop wrapping to different heights. */}
          <div className="flex flex-col gap-8">
            {ROUTES.map(([key, title, caption, badge], i) => (
              <button key={key} ref={i === 0 ? btnRef : null}
                aria-current={route === key ? "true" : undefined} onClick={() => onPick(key)}
                className="group min-w-0 flex flex-col gap-3 text-left pt-12 px-13 pb-12
                  rounded-lg cursor-pointer bg-card text-text border border-accent-45
                  shadow-[0_2px_8px_var(--color-accent-08)] font-sans
                  transition-[background-color,border-color,box-shadow] duration-[130ms]
                  hover:bg-[#fffaf5] hover:border-accent hover:shadow-[0_4px_14px_var(--color-accent-25)]
                  active:shadow-[0_1px_4px_var(--color-accent-25)] active:translate-y-[1px]
                  aria-[current=true]:bg-accent-06 aria-[current=true]:border-accent">
                <b className="flex items-center gap-5 text-md font-bold
                  group-aria-[current=true]:text-accent">
                  {t(title)}
                  {badge && <Badge>{badge}</Badge>}
                  <span aria-hidden="true" className="ml-auto text-accent text-lg leading-none">→</span>
                </b>
                <i className="text-xs not-italic leading-[1.45] text-sub">{t(caption)}</i>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
