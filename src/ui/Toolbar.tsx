/**
 * ============================================================================
 * INSPECTOR TOOLBAR — undo / redo
 * ============================================================================
 * Undo and redo, and nothing else. Reset, export and import moved into the overflow menu in the
 * header (`ui/Menu.tsx`) — they are rare, one of them is destructive, and none of them is about the
 * design you are editing right now.
 *
 * These two stayed out of that menu on purpose. They are the recovery path for a direct-manipulation
 * editor that fills the screen, so they are the frequent case an overflow menu exists to make room
 * for, not an example of it.
 * ============================================================================
 */
import React from "react";
import { useT } from "./theme.ts";
import type { UndoRedo } from "../hooks.ts";

const UNDO: [string, string, string][] = [["↺", "元に戻す", "⌘Z"], ["↻", "やり直し", "⇧⌘Z"]];

export default function Toolbar({ undo, redo, canUndo, canRedo }: UndoRedo) {
  const t = useT();
  const act: [() => void, boolean][] = [[undo, canUndo], [redo, canRedo]];
  return (
    <div className="tool-group" style={{ marginBottom: 14 }}>
      <span>{t("編集")}</span>
      <div>
        {UNDO.map(([icon, label, keys], i) => (
          <button key={label} className="btn btn--accent" disabled={!act[i][1]} onClick={act[i][0]}
            title={`${t(label)} (${keys})`}>
            <span style={{ fontSize: 17, lineHeight: 1 }}>{icon}</span>{t(label)}
          </button>
        ))}
      </div>
    </div>
  );
}
