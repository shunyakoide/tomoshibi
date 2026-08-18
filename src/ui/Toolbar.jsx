/**
 * ============================================================================
 * INSPECTOR TOOLBAR — edit / save
 * ============================================================================
 * Two groups, because the actions differ entirely in nature: "edit" (undo, redo, reset) operates on
 * the working state, "save" (export, import) is file I/O. Each carries its own subheading, and the
 * row wraps onto two lines in a narrow panel — per-button text never wraps (nowrap).
 *
 * Reset is destructive, so it keeps the warn-coloured border while staying in the edit group.
 * ============================================================================
 */
import React, { useRef } from "react";
import { UI, accent, sans, useT } from "./theme.js";

const group = { display: "flex", flexDirection: "column", gap: 7 };
const title = { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", color: UI.faint };
const btn = {
  display: "flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 8,
  fontFamily: sans, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
};

export default function Toolbar({ undo, redo, canUndo, canRedo, onReset, onExport, onImport }) {
  const t = useT();
  const fileRef = useRef(null);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 14 }}>
      <div style={group}>
        <span style={title}>{t("編集")}</span>
        <div style={{ display: "flex", gap: 6 }}>
          {[["↺", "元に戻す", undo, canUndo, "⌘Z"], ["↻", "やり直し", redo, canRedo, "⇧⌘Z"]].map(([icon, label, fn, on, keys]) => (
            <button key={label} onClick={on ? fn : undefined} disabled={!on} title={`${t(label)} (${keys})`} style={{
              ...btn, gap: 5,
              background: on ? UI.card : "transparent", color: on ? accent : UI.faintest,
              border: `1px solid ${on ? "rgba(217,91,24,0.4)" : UI.cardEdge}`,
              cursor: on ? "pointer" : "default", opacity: on ? 1 : 0.55,
            }}>
              <span style={{ fontSize: 17, lineHeight: 1 }}>{icon}</span>{t(label)}
            </button>
          ))}
          <button onClick={onReset} title={t("すべての設定を初期状態に戻す")}
            style={{ ...btn, background: "transparent", color: UI.warn, border: "1px solid rgba(194,60,18,0.35)", cursor: "pointer" }}>
            {t("初期化")}
          </button>
        </div>
      </div>

      <div style={group}>
        <span style={title}>{t("保存")}</span>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }}
          onChange={(e) => { onImport(e.target.files[0]); e.target.value = ""; }} />
        <div style={{ display: "flex", gap: 6 }}>
          {[["書き出す", onExport, "設計を JSON ファイルに保存"], ["読み込む", () => fileRef.current?.click(), "設計 JSON ファイルから復元"]].map(([label, fn, tip]) => (
            <button key={label} onClick={fn} title={t(tip)}
              style={{ ...btn, background: UI.card, color: UI.sub, border: `1px solid ${UI.cardEdge}`, cursor: "pointer" }}>
              {t(label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
