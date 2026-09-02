// Undo and redo stay in the open, not in the ☰: they are the recovery path for a direct-manipulation
// editor, which is the frequent case an overflow menu exists to make room for.
import React from "react";
import { useT } from "./theme.ts";
import { Button } from "./controls.tsx";
import type { UndoRedo } from "../studio/hooks.ts";

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
