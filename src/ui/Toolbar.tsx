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
import { FS, useT } from "./theme.ts";
import { Button } from "./controls.tsx";
import type { UndoRedo } from "../hooks.ts";

const UNDO: [string, string, string][] = [["↺", "元に戻す", "⌘Z"], ["↻", "やり直し", "⇧⌘Z"]];

export default function Toolbar({ undo, redo, canUndo, canRedo }: UndoRedo) {
  const t = useT();
  const act: [() => void, boolean][] = [[undo, canUndo], [redo, canRedo]];
  return (
    <div className="flex flex-col gap-7" style={{ marginBottom: 14 }}>
      <span className="text-xs font-bold tracking-[0.14em] text-faint">{t("編集")}</span>
      <div className="flex gap-6">
        {UNDO.map(([icon, label, keys], i) => (
          <Button key={label} disabled={!act[i][1]} onClick={act[i][0]} title={`${t(label)} (${keys})`}>
            <span style={{ fontSize: FS.xl, lineHeight: 1 }}>{icon}</span>{t(label)}
          </Button>
        ))}
      </div>
    </div>
  );
}
