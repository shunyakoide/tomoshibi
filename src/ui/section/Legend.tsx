/**
 * The ◇ handles are the least discoverable part of the app, so the marks are REDRAWN here in the
 * same shapes and colours as on the canvas rather than described in words, and the content follows
 * `editMode`: in curve-adjust mode the `+` ghosts are hidden and the point itself does not move,
 * which reads as a bug unless it is said out loud.
 */
import React, { useState } from "react";
import { FS, useT } from "../theme.ts";
import { C } from "./palette.ts";
import type { EditMode } from "../pointEdit.ts";

// One canvas mark at legend size (18×18 box, centred on 9,9).
function Glyph({ kind, accent }: { kind: GlyphKind; accent: string }) {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" style={{ display: "block", flex: "none" }}>
      {kind === "pt" && ( // control point ◇
        <rect x="4" y="4" width="10" height="10" rx="2" transform="rotate(45 9 9)"
          fill={accent} stroke={accent} strokeWidth="2" />
      )}
      {kind === "sel" && ( // control point ◇ with the selection ring
        <>
          <circle cx="9" cy="9" r="8" fill="none" stroke={C.bound} strokeWidth="1.3" strokeDasharray="3 3" />
          <rect x="5.5" y="5.5" width="7" height="7" rx="1.5" transform="rotate(45 9 9)"
            fill={accent} stroke={accent} strokeWidth="1.6" />
        </>
      )}
      {kind === "add" && ( // add-point ghost (+)
        <>
          <circle cx="9" cy="9" r="8" fill={C.handleFill} stroke={C.bound} strokeWidth="1.3" strokeDasharray="2.5 2.5" />
          <path d="M5.5 9H12.5M9 5.5V12.5" stroke={C.bound} strokeWidth="1.7" />
        </>
      )}
      {kind === "top" && ( // body-height handle (●)
        <circle cx="9" cy="9" r="5.5" fill={C.handleFill} stroke={accent} strokeWidth="2" />
      )}
      {kind === "tangent" && ( // tangent handle: direction line + grab circle
        <>
          <path d="M2 16L11 7" stroke={C.bound} strokeWidth="1.4" />
          <circle cx="13" cy="5" r="4" fill="#eef7f0" stroke={C.bound} strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

/** The marks the legend redraws at legend size — the same shapes the canvas uses. */
type GlyphKind = "pt" | "sel" | "add" | "top" | "tangent";

// The verb is its own column rather than folded into the sentence: it is the difference between the
// marks (drag vs click), so it is what you scan for.
const LEGEND: Record<EditMode, { title: string; rows: [GlyphKind, string, string][] }> = {
  move: {
    title: "点の操作",
    rows: [
      ["pt", "ドラッグ", "ふくらみを変える"],
      ["sel", "クリック", "選ぶ → 右パネルで編集"],
      ["add", "クリック", "点を増やす"],
      ["top", "ドラッグ", "火袋の高さ"],
    ],
  },
  curve: {
    title: "カーブ調整中",
    rows: [
      ["tangent", "ドラッグ", "カーブの向き・強さ"],
      ["pt", "—", "点は動きません(「点を動かす」へ)"],
    ],
  },
};

export default function Legend({ accent, editMode, compact }: {
  accent: string; editMode: EditMode; compact: boolean;
}) {
  const t = useT();
  const g = LEGEND[editMode] || LEGEND.move;
  // "→ 右パネルで編集" is a wide-layout fact: a legend that names a panel the layout does not have
  // is worse than no legend.
  const rows: [GlyphKind, string, string][] = compact
    ? g.rows.map(([k, v, d]) => [k, v, k === "sel" ? "選ぶ → 下のバーで編集" : d])
    : g.rows;
  // At 300px wide against a 375px screen the card IS the drawing, so on a phone it is a pill you tap
  // open, at the bottom-left, clear of the openings and the neck it explains.
  const [open, setOpen] = useState(false);
  const shown = !compact || open;
  const pos: React.CSSProperties = compact
    ? { bottom: 10, left: 10, maxWidth: "calc(100% - 20px)" }
    : { top: 62, right: 16, maxWidth: 300 };

  return (
    <div className="rounded-lg" style={{
      position: "absolute", pointerEvents: compact ? "auto" : "none", ...pos,
      fontFamily: "'IBM Plex Sans JP',sans-serif",
      background: "rgba(255,253,248,0.82)", border: `1px solid ${C.faint}`,
      padding: shown ? "9px 12px 10px" : 0, backdropFilter: "blur(2px)",
    }}>
      {compact ? (
        // The pill and the card's heading are one element, so the title does not move when it opens.
        // stopPropagation because the pane's own pointerdown clears the point selection.
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpen((v) => !v)}
          aria-expanded={open} style={{
            display: "flex", alignItems: "center", gap: 7, minHeight: 34, padding: shown ? "0 0 6px" : "0 12px",
            background: "transparent", border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: FS.xs, fontWeight: 700, letterSpacing: "0.06em", color: C.label,
          }}>
          <Glyph kind="pt" accent={accent} />
          {t(g.title)}
          <span aria-hidden="true" style={{ color: C.faint }}>{open ? "▾" : "▸"}</span>
        </button>
      ) : (
        <div style={{ fontSize: FS.xs, fontWeight: 700, letterSpacing: "0.06em", color: C.label, marginBottom: 6 }}>
          {t(g.title)}
        </div>
      )}
      {shown && (
      <div style={{ display: "grid", gridTemplateColumns: "18px auto 1fr", columnGap: 8, rowGap: 5, alignItems: "center" }}>
        {rows.map(([kind, verb, desc]) => (
          <React.Fragment key={kind + verb}>
            <Glyph kind={kind} accent={accent} />
            <span style={{ fontSize: FS.xs, fontWeight: 600, color: C.label, whiteSpace: "nowrap" }}>{t(verb)}</span>
            <span style={{ fontSize: FS.sm, color: C.value, lineHeight: 1.35 }}>{t(desc)}</span>
          </React.Fragment>
        ))}
      </div>
      )}
    </div>
  );
}
