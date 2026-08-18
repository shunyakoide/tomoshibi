/**
 * ============================================================================
 * INSPECTOR TOOLBAR — edit / save
 * ============================================================================
 * Two groups, because the actions differ entirely in nature: "edit" (undo, redo, reset) operates on
 * the working state, "save" (export, import) is file I/O. Each carries its own subheading, and the
 * row wraps onto two lines in a narrow panel — per-button text never wraps.
 *
 * Reset is destructive, so it keeps the warn-coloured border while staying in the edit group.
 * ============================================================================
 */
import React, { useRef } from "react";
import { useT } from "./theme.js";

const UNDO = [["↺", "元に戻す", "⌘Z"], ["↻", "やり直し", "⇧⌘Z"]];

export default function Toolbar({ undo, redo, canUndo, canRedo, onReset, onExport, onImport }) {
  const t = useT();
  const fileRef = useRef(null);
  const act = [[undo, canUndo], [redo, canRedo]];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 14 }}>
      <div className="tool-group">
        <span>{t("編集")}</span>
        <div>
          {UNDO.map(([icon, label, keys], i) => (
            <button key={label} className="btn btn--accent" disabled={!act[i][1]} onClick={act[i][0]}
              title={`${t(label)} (${keys})`}>
              <span style={{ fontSize: 17, lineHeight: 1 }}>{icon}</span>{t(label)}
            </button>
          ))}
          <button className="btn btn--warn" onClick={onReset} title={t("すべての設定を初期状態に戻す")}>
            {t("初期化")}
          </button>
        </div>
      </div>

      <div className="tool-group">
        <span>{t("保存")}</span>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }}
          onChange={(e) => { onImport(e.target.files[0]); e.target.value = ""; }} />
        <div>
          <button className="btn btn--ghost" onClick={onExport} title={t("設計を JSON ファイルに保存")}>
            {t("書き出す")}
          </button>
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()} title={t("設計 JSON ファイルから復元")}>
            {t("読み込む")}
          </button>
        </div>
      </div>
    </div>
  );
}
