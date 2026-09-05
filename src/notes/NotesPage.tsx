import { useEffect } from "react";
import { routeHref } from "../studio/route.ts";
import { useT } from "../ui/theme.ts";
import Markdown from "./markdown.tsx";
import { getNote, listNotes } from "./content.ts";
import type { NoteSlug } from "./slugs.ts";
import type { Lang } from "../i18n.ts";

const SHELL = "guide fixed inset-0 z-40 overflow-y-auto bg-panel print:static print:overflow-visible print:bg-[#fff]";
const CLOSE = "fixed top-12 right-16 z-1 w-36 h-36 p-0 flex items-center justify-center "
  + "bg-panel border-none border-[currentColor] rounded-full cursor-pointer font-sans text-2xl leading-none text-faint "
  + "shadow-[0_0_0_1px_var(--color-edge)] hover:bg-card hover:text-text print:hidden";
const COLUMN = "max-w-860 mx-auto pt-30 px-24 pb-72 narrow:pt-26 narrow:px-14 narrow:pb-40 print:max-w-none print:p-0";
const EYEBROW = "mt-0 mx-0 mb-6 font-mono text-sm font-semibold tracking-[0.14em] uppercase text-accent";
const TITLE = "mt-0 mx-0 mb-10 text-3xl font-bold text-head";
const LEDE = "m-0 text-lg leading-[1.75] text-fine max-w-[62ch]";
const GALLERY = "list-none mt-24 mx-0 mb-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-12";
const CARD = "group block min-h-168 bg-card border border-card-edge rounded-2xl overflow-hidden text-text no-underline "
  + "hover:border-accent-45 hover:bg-[#fffaf5]";
const CARD_TOP = "h-72 border-b border-card-edge bg-[linear-gradient(135deg,#fffaf5_0%,#fff_52%,rgba(217,91,24,0.08)_100%)] "
  + "flex items-end px-14 py-10";

export function NotesIndexPage({ lang, onClose, onOpen }: {
  lang: Lang; onClose: () => void; onOpen: (slug: NoteSlug) => void;
}) {
  const t = useT();
  const notes = listNotes(lang);
  return (
    <div role="dialog" aria-modal="true" aria-label={t("Notes")} className={SHELL}>
      <button onClick={onClose} className={CLOSE} title={t("閉じる")} aria-label={t("閉じる")}>×</button>
      <div className={COLUMN}>
        <p className={EYEBROW}>{t("Notes")}</p>
        <h1 className={TITLE}>{t("制作ノート")}</h1>
        <p className={LEDE}>
          {t("作り方ページに入れると重くなる、材料選び・失敗例・考えたことの置き場所です。")}
        </p>
        <ul className={GALLERY}>
          {notes.map((n) => (
            <li key={n.slug}>
              <a href={routeHref(n.slug)} className={CARD}
                onClick={(e) => { e.preventDefault(); onOpen(n.slug); }}>
                <span className={CARD_TOP}>
                  <span className="font-mono text-xs font-semibold tracking-[0.12em] uppercase text-accent">{n.category}</span>
                </span>
                <span className="block pt-12 px-14 pb-14">
                  <strong className="block mb-6 text-lg font-bold text-head group-hover:text-accent">{n.title}</strong>
                  <span className="block text-md leading-[1.7] text-fine">{n.summary}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function NotePage({ slug, lang, onClose, onBackToNotes, onBackToGuide }: {
  slug: string; lang: Lang; onClose: () => void; onBackToNotes: () => void; onBackToGuide: () => void;
}) {
  const t = useT();
  const note = getNote(slug, lang);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, [slug, lang]);
  return (
    <div role="dialog" aria-modal="true" aria-label={note?.title ?? t("Notes")} className={SHELL}>
      <button onClick={onClose} className={CLOSE} title={t("閉じる")} aria-label={t("閉じる")}>×</button>
      <div className={COLUMN}>
        <div className="flex flex-wrap gap-8 mb-20 print:hidden">
          <a href={routeHref("notes")} className="text-sm text-accent no-underline hover:underline"
            onClick={(e) => { e.preventDefault(); onBackToNotes(); }}>{t("← Notes一覧")}</a>
          <button className="bg-transparent border-0 p-0 text-sm text-accent cursor-pointer hover:underline"
            onClick={onBackToGuide}>{t("作り方へ戻る")}</button>
        </div>
        {note ? (
          <>
            <p className={EYEBROW}>{note.category}</p>
            <Markdown source={note.body} />
          </>
        ) : (
          <>
            <p className={EYEBROW}>{t("Notes")}</p>
            <h1 className={TITLE}>{t("ノートが見つかりません")}</h1>
          </>
        )}
      </div>
    </div>
  );
}
