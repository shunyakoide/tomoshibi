/**
 * ============================================================================
 * INSPECTOR TOOLBAR — undo / redo
 * ============================================================================
 * Undo and redo, and nothing else. Reset, export and import moved into the header's overflow menu
 * (`ui/Menu.tsx`): they are rare, one is destructive, and none is about the design being edited now.
 *
 * These two stayed out of that menu on purpose — the recovery path for a direct-manipulation editor
 * that fills the screen is the frequent case an overflow menu exists to make room FOR.
 * ============================================================================
 */
import React from "react";
import { useT } from "./theme.ts";
import { Button } from "./controls.tsx";
import type { UndoRedo } from "../hooks.ts";

const UNDO: [string, string, string][] = [["↺", "元に戻す", "⌘Z"], ["↻", "やり直し", "⇧⌘Z"]];

export default function Toolbar({ undo, redo, canUndo, canRedo }: UndoRedo) {
  const t = useT();
  const act: [() => void, boolean][] = [[undo, canUndo], [redo, canRedo]];
  return (
    <div className="flex flex-col gap-7 mb-14">
      <span className="text-xs font-bold tracking-[0.14em] text-faint">{t("編集")}</span>
      <div className="flex gap-6">
        {UNDO.map(([icon, label, keys], i) => (
          <Button key={label} disabled={!act[i][1]} onClick={act[i][0]} title={`${t(label)} (${keys})`}>
            <span className="text-xl leading-none">{icon}</span>{t(label)}
          </Button>
        ))}
      </div>
    </div>
  );
}
