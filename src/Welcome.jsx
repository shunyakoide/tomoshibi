/**
 * ============================================================================
 * WELCOME — first-run onboarding (one card, not a tour)
 * ============================================================================
 * The app opens on a finished mold, so nothing on screen is empty or broken; what a first-time
 * visitor is missing is not "where do I click" (the section view's legend covers that) but **what
 * this thing is**: the object on screen is not the lantern, it is the *mold* the lantern is built
 * on, and what comes out is an STL or a full-scale paper template.
 *
 * That is a single explanation, so it is a single card — deliberately NOT a step-through tour with
 * spotlights: the app is one screen, and a spotlight would have to track a viewport that stretches
 * (the section view is a preserveAspectRatio SVG). Shown once (`harigata.welcome`), reopenable from
 * the "?" in the inspector header, and never blocking: Esc / backdrop / button all close it.
 *
 * Presentational only — it owns no app state and imports no geometry.
 * ============================================================================
 */
import React, { useEffect, useRef } from "react";
import { UI as ui, accent, accentA, useT } from "./ui/theme.js";

// The three steps, drawn rather than described: a section with a ◇ handle, the output sheet/part,
// and the finished lantern. Same accent as the app so the icons read as "this app's" marks.
function StepIcon({ kind }) {
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

const STEPS = [
  ["section", "断面を決める", "◇ドラッグで形をつくる"],
  ["export", "出力する", "STL か 原寸の型紙"],
  ["build", "貼る", "竹ひごを巻いて和紙を貼る"],
];

const POINTS = [
  "画面に映っているのは提灯そのものではなく、その上で組み立てる「型」です",
  // The cardboard route is marked beta wherever it is offered, and this card is where someone
  // decides to take it — leaving it out here would sell the route without the caveat.
  "3Dプリンタが無くても、段ボール用の原寸型紙を出せます(beta)",
  "和紙の型紙(先に切っておく用)は、どちらの出力にも付いてきます",
];

export default function Welcome({ onClose }) {
  const t = useT();
  const btnRef = useRef(null);

  // Esc closes, and focus starts on the (only) button so the keyboard isn't stranded behind the scrim.
  useEffect(() => {
    btnRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, background: "rgba(43,36,26,0.42)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
      overflowY: "auto",
    }}>
      <div role="dialog" aria-modal="true" aria-label={t("はじめかた")} onClick={(e) => e.stopPropagation()}
        style={{
          // 560 rather than 520: below that the three step captions wrap onto a second line with a
          // single character stranded on it in Japanese.
          width: "min(560px, 100%)", background: ui.panel, color: ui.text, fontFamily: "var(--sans)",
          borderRadius: 16, padding: "26px 26px 22px", boxShadow: "0 18px 50px rgba(43,36,26,0.3)",
          border: `1px solid ${ui.edge}`,
        }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "0.04em", color: ui.head }}>
          {t("張型")} <span style={{ fontSize: 12, fontWeight: 400, color: ui.faint }}>{t("スタジオ")}</span>
        </div>
        <div style={{ fontSize: 13, color: ui.sub, marginTop: 5 }}>{t("和紙提灯の「張型」をつくる")}</div>

        {/* The three steps, with arrows between them: design → output → build by hand */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 4, margin: "20px 0 18px" }}>
          {STEPS.map(([kind, title, caption], i) => (
            <React.Fragment key={kind}>
              {i > 0 && <div aria-hidden="true" style={{ alignSelf: "center", color: ui.faintest, fontSize: 17, padding: "0 2px" }}>→</div>}
              <div style={{
                flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                textAlign: "center", background: ui.card, border: `1px solid ${ui.cardEdge}`,
                borderRadius: 12, padding: "13px 8px 12px",
              }}>
                <StepIcon kind={kind} />
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t(title)}</div>
                <div style={{ fontSize: 10.5, color: ui.sub, lineHeight: 1.45 }}>{t(caption)}</div>
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

        <div style={{ fontSize: 11, color: ui.faint, marginTop: 14 }}>
          {t("上のタブで「組立」「点灯」の見え方も確認できます。この案内は右上の「?」でいつでも開けます。")}
        </div>

        <button ref={btnRef} className="cta" onClick={onClose} style={{ marginTop: 18 }}>{t("さわってみる")}</button>
      </div>
    </div>
  );
}
