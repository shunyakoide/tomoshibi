/**
 * ============================================================================
 * WELCOME — first-run onboarding (one card, not a tour)
 * ============================================================================
 * The app opens on a finished mold, so nothing on screen is empty or broken; what a first-time
 * visitor is missing is not "where do I click" (the section view's legend covers that) but **what
 * this thing is**: the object on screen is not the lantern, it is the *mold* the lantern is built
 * on, and what comes out is an STL or a full-scale paper template.
 *
 * It also carries the one setup question the rest of the app branches on: **3D printer or cardboard**.
 * That belongs here rather than buried in the print view, because it is not a per-export toggle — it
 * decides whether a print bed constrains the design at all, and the bed's overflow warning starts
 * nagging long before anyone opens the print view. Picking either one closes the card; skipping keeps
 * whatever was saved (3D print by default), and the viewport's toggle still switches it any time.
 *
 * `route` is the route to MARK as current, or **null to mark neither** — which is what the first-run
 * card passes. On a first visit "stl" is a default nobody picked, and colouring it would have the
 * card answer its own question; reopened from the ☰ menu the buttons are a switch instead, so the route
 * in effect is marked. That distinction lives in the caller (which card is this?), not here.
 *
 * The explanation itself is a single card — deliberately NOT a step-through tour with
 * spotlights: the app is one screen, and a spotlight would have to track a viewport that stretches
 * (the section view is a preserveAspectRatio SVG). Shown once (`tomoshibi.welcome`), reopenable from
 * the ☰ menu in the header, and never blocking: Esc / backdrop / button all close it.
 *
 * Presentational only — it owns no app state and imports no geometry.
 * ============================================================================
 */
import React, { useEffect, useRef } from "react";
import { UI as ui, accent, accentA, useT } from "./ui/theme.ts";
import Logo from "./ui/Logo.tsx";
import type { Route } from "./types.ts";

/** Which of the three drawn step marks to render. */
type StepKind = "section" | "export" | "build";

// The three steps, drawn rather than described: a section with a ◇ handle, the output sheet/part,
// and the finished lantern. Same accent as the app so the icons read as "this app's" marks.
function StepIcon({ kind }: { kind: StepKind }) {
  const faint = ui.faint;
  return (
    <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true" style={{ display: "block" }}>
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

const POINTS = [
  "画面に映っているのは提灯そのものではなく、その上で組み立てる「型」です",
  // beta in the string rather than as a badge: this is a sentence in a bullet list, and the badge
  // element belongs on the things you press (the route buttons below).
  "和紙の型紙(先に切っておく用・beta)は、どちらの出力にも付いてきます",
];

// The two ways to make the mold. Sub-line = what you actually receive, because "3D print / cardboard"
// names the equipment and not the output. The cardboard route keeps its beta badge here: this card is
// where someone chooses it, and offering it without the caveat would sell a route it hasn't earned yet.
const ROUTES: [Route, string, string, string | null][] = [
  ["stl", "3Dプリンタ", "STL 一式をダウンロード", null],
  ["paper", "段ボール", "A4 原寸の型紙を印刷 · 大きさの制限なし", "beta"],
];

export default function Welcome({ route = null, onPick, onClose }: {
  route?: Route | null; onPick: (r: Route) => void; onClose: () => void;
}) {
  const t = useT();
  const btnRef = useRef<HTMLButtonElement>(null);

  // Esc closes, and focus starts on the (only) button so the keyboard isn't stranded behind the scrim.
  useEffect(() => {
    btnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "center",
      padding: 20, background: "rgba(43,36,26,0.42)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
      overflowY: "auto",
    }}>
      <div role="dialog" aria-modal="true" aria-label={t("はじめかた")} onClick={(e) => e.stopPropagation()}
        className="welcome"
        style={{
          // 560 rather than 520: below that the three step captions wrap onto a second line with a
          // single character stranded on it in Japanese.
          // `margin: auto` centres this, NOT the overlay's align-items — and that is the whole
          // point. Centred by align-items, a card taller than the window overflows in BOTH
          // directions, and a scroll container cannot reach what is above its start edge: at
          // 375x667 the card is 720px and the logo was cut off with no way to scroll up to it.
          // An auto margin resolves to 0 once the free space goes negative, so the card starts at
          // the padding edge and the whole of it scrolls into reach.
          margin: "auto",
          width: "min(560px, 100%)", background: ui.panel, color: ui.text, fontFamily: "var(--sans)",
          borderRadius: 16, boxShadow: "0 18px 50px rgba(43,36,26,0.3)",
          border: `1px solid ${ui.edge}`, position: "relative",
        }}>
        {/* The only way out that is not also a choice. It replaced a 「とりあえず見る」 button on the
            footer row, which cost a full row and read like a third option beside the two routes —
            the escape from a modal is chrome, not an alternative to the thing it is asking. */}
        <button className="welcome-x" onClick={onClose} title={t("閉じる")} aria-label={t("閉じる")}>×</button>
        <Logo variant="full" className="welcome-logo" style={{ color: ui.head }} />
        <div style={{ fontSize: 13, color: ui.sub, marginTop: 8 }}>{t("和紙提灯の「張型」をつくる")}</div>

        {/* The three steps, with arrows between them: design → output → build by hand */}
        <div className="welcome-steps">
          {STEPS.map(([kind, title, caption], i) => (
            <React.Fragment key={kind}>
              {i > 0 && <div aria-hidden="true" className="welcome-arrow">→</div>}
              <div className="welcome-step">
                <StepIcon kind={kind} />
                <div className="welcome-step-t">{t(title)}</div>
                <div className="welcome-step-c">{t(caption)}</div>
              </div>
            </React.Fragment>
          ))}
        </div>

        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {POINTS.map((s) => (
            <li key={s} style={{ display: "flex", gap: 9, fontSize: 12.5, lineHeight: 1.6, color: ui.text }}>
              <span aria-hidden="true" style={{
                width: 5, height: 5, borderRadius: "50%", background: accent, flex: "none", marginTop: 7,
              }} />
              <span>{t(s)}</span>
            </li>
          ))}
        </ul>

        {/* The setup question. Two buttons rather than a segmented toggle: each one is also the
            "start" action, so nobody has to choose and then confirm. */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, color: ui.sub }}>{t("どちらでつくりますか?")}</span>
            <span style={{ fontSize: 10.5, color: ui.faintest }}>{t("後からいつでも変更できます")}</span>
          </div>
          {/* Stacked, not side by side: full width, each one is unmistakably a button rather than a
              tile, and the two captions stop wrapping to different heights for no reason. */}
          <div className="route-btns">
            {ROUTES.map(([key, title, caption, badge], i) => (
              <button key={key} ref={i === 0 ? btnRef : null} className="route-btn"
                aria-current={route === key ? "true" : undefined} onClick={() => onPick(key)}>
                <b>
                  {t(title)}
                  {badge && <em className="badge">{badge}</em>}
                  <span aria-hidden="true" className="route-go">→</span>
                </b>
                <i>{t(caption)}</i>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
