/**
 * ============================================================================
 * THE LEFT PANE — WHAT THE DESIGN LOOKS LIKE RIGHT NOW
 * ============================================================================
 * The WebGL canvas and everything painted over it: the tab rows, the live dimension readout, the
 * warnings, the lit-mode hint, and whichever overlay this view draws instead of a scene.
 *
 * `tabs` and `overlay` are SLOTS. The overlay is `SectionEditor` or `PagePreview`, which between
 * them read eight pieces of state this component has no use for; taking them as elements keeps that
 * state in the studio, where it lives, instead of drilling it through a shell.
 *
 * Rendered unconditionally, lit included. Gate it on anything and the WebGL context is destroyed and
 * recreated on every toggle, against a browser cap of about sixteen.
 * ============================================================================
 */
import { AlertColumn } from "./ui/Alerts.tsx";
import { vpBg, useT } from "./ui/theme.ts";
import type { AlertItem } from "./derived.ts";

export default function Viewport({
  mainRef, mountRef, isLit, narrow, maxDia, height, glError, chipTxt, tabs, overlay, alerts,
}: {
  mainRef: React.Ref<HTMLElement>; mountRef: React.Ref<HTMLDivElement>;
  isLit: boolean; narrow: boolean; maxDia: number; height: number;
  glError: string | null; chipTxt: string;
  tabs: React.ReactNode; overlay: React.ReactNode; alerts: AlertItem[];
}) {
  const t = useT();
  return (
    // The pane has no share of the screen — it has everything the sheet is not using. At `peek` the
    // section editor gets ~717px of an 812px phone against the 325px a fixed 40vh gave it. Lit needs
    // no exception.
    <main ref={mainRef} className="relative min-w-0 min-h-0 flex-auto h-auto">
      {/* The gradient stays a style: a VALUE that follows `isLit`, ninety characters of punctuation
          as an arbitrary class. */}
      <div ref={mountRef} className="absolute inset-0"
        style={{ background: vpBg(isLit), transition: "background 0.3s" }} />
      {overlay}

      {glError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 p-24
          text-center pointer-events-none">
          <div className="text-md font-semibold text-[#e0a060]">{t("⚠ 3Dプレビューを初期化できませんでした")}</div>
          <div className="text-sm font-mono text-[#8a8a96] break-words">{glError}</div>
          <div className="text-sm text-[#6f6f7a]">
            {t("お使いのブラウザで WebGL が無効の可能性があります。STLの生成・DLは引き続き利用できます。")}
          </div>
        </div>
      )}

      {tabs}

      {/* Dimension chip (always live). Tighter to the corner on a phone: at 375px the tab strip
          reaches far enough right that the readout printed through it. Right-aligned either way, so
          it reads as a status line rather than a control. */}
      <div className="absolute top-24 right-24 text-base narrow:top-10 narrow:right-12 narrow:text-sm
        font-mono tracking-[0.05em] text-right pointer-events-none" style={{ color: chipTxt }}>
        ⌀{maxDia} × H{height} mm
      </div>

      {/* On a phone it is a strip below the viewport instead — see `alertBar`. */}
      {!narrow && <AlertColumn alerts={alerts} />}

      {isLit && (
        <div className="absolute bottom-20 left-20 font-sans text-sm text-[#8a8a96] pointer-events-none">
          {t("鑑賞モード — 編集はタブで「断面」へ")}
        </div>
      )}
    </main>
  );
}
