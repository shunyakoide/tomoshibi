/**
 * A document, not a view of the model: it takes the whole window and scrolls, and it is the one PAGE
 * in this app — `/guide`, with an address of its own (src/studio/route.ts). **It was a fifth view tab and
 * must not go back**: the other four each render YOUR design and this one does not, so as a tab it
 * had to be excepted out of the dimension chip, the viewport alerts and the inspector, and it cost
 * the phone's tab strip its fifth slot.
 *
 * **The page is generic: every figure is drawn from ONE fixed design (`GUIDE_P`), at most once per
 * ROUTE per session, and no measurement is printed anywhere**, so **nothing here may state a
 * QUANTITY the design decides**. The ROUTE still follows the app, because it changes which parts
 * exist at all — cardboard has no stand and no printed rings, so those steps are filtered, not
 * reworded.
 *
 * Print styles live in index.css: the browser's own "Save as PDF" is the paper version, which is why
 * the guide is not a PDF the app writes.
 */
import { useEffect, useMemo, useState } from "react";
import { disposeFigures } from "../three/figures.ts";
import { KIT, KIT_FIGS, PARTS, STEPS } from "./content.ts";
import { Fig, GUIDE_P, drawn, figure } from "./figures.tsx";
import WayItem, { STEP_P } from "./WayItem.tsx";
import { useT } from "../ui/theme.ts";
import { Badge, Button } from "../ui/controls.tsx";
import type { Way } from "./content.ts";
import type { NoteSlug } from "../notes/content.ts";
import type { Route } from "../types.ts";

/* The kit and parts cards. A class rather than a style object, so the box that goes with the
   ground — radius, padding, the print rules — sits in the same string as the colours. */
const CARD = "bg-card border border-card-edge rounded-2xl pt-10 px-12 pb-12 "
  + "print:[break-inside:avoid] print:shadow-none";
const SHELL = "guide fixed inset-0 z-40 overflow-y-auto bg-panel "
  + "print:static print:overflow-visible print:bg-[#fff]";
const CLOSE = "fixed top-12 right-16 z-1 w-36 h-36 p-0 flex items-center justify-center "
  + "bg-panel border-none border-[currentColor] rounded-full cursor-pointer font-sans text-2xl leading-none text-faint "
  + "shadow-[0_0_0_1px_var(--color-edge)] hover:bg-card hover:text-text print:hidden";
const COLUMN = "max-w-860 mx-auto pt-30 px-24 pb-72 narrow:pt-26 narrow:px-14 narrow:pb-40 "
  + "print:max-w-none print:p-0";
const EYEBROW = "mt-0 mx-0 mb-6 font-mono text-sm font-semibold tracking-[0.14em] uppercase text-accent";
const TITLE = "mt-0 mx-0 mb-10 text-3xl font-bold text-head";
const LEDE = "m-0 text-lg leading-[1.75] text-fine max-w-[62ch]";
const H2 = "mt-40 mx-0 mb-14 text-md font-bold tracking-[0.08em] text-head border-b border-b-edge pb-8 "
  + "print:[break-after:avoid]";
const GRID = "list-none m-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-12";
const PART_WELL = "flex items-center justify-center overflow-hidden rounded-lg aspect-[3/2] mb-8 "
  + "border border-transparent bg-transparent";
const CARD_LINE = "flex items-baseline justify-between gap-8 text-md";
const CARD_COUNT = "font-mono text-base text-sub";
const CARD_NOTE = "mt-2 font-mono text-sm text-fine";
const PAPER_NOTE = "mt-12 mx-0 mb-0 text-base leading-[1.7] text-sub";
const KIT_GROUP = "mt-4 [&+&]:mt-16 [&_strong]:font-normal";
const KIT_H3 = "mt-0 mx-0 mb-8 text-base font-bold tracking-[0.06em] text-fine";
const STEP_OL = "list-none m-0 p-0 flex flex-col gap-14";
const STEP_LI = "bg-card border border-card-edge rounded-2xl grid items-start gap-20 p-16 "
  + "grid-cols-[minmax(0,300px)_minmax(0,1fr)] narrow:grid-cols-[minmax(0,1fr)] narrow:gap-12 "
  + "[&>:only-child]:col-span-full "
  + "print:shadow-none print:grid-cols-[minmax(0,38%)_minmax(0,1fr)] ";
/* A step whose ways are sections is too tall to keep whole on one sheet; every other step is not,
   and Chrome drops a block it cannot split rather than splitting it. */
const STEP_LI_SPLIT = "print:[break-inside:auto]";
const STEP_LI_WHOLE = "print:[break-inside:avoid]";
const STEP_H3 = "flex items-center gap-10 mt-2 mx-0 mb-8 text-xl font-bold text-head";
const STEP_NUM = "flex-none w-24 h-24 rounded-full bg-accent text-[#fff] flex "
  + "items-center justify-center text-base font-bold";
const WAY_UL = "list-none mt-16 mx-0 mb-0 p-0 flex flex-col gap-20";
const NOTE_BOX = "mt-14 flex flex-wrap items-center gap-7 text-sm text-sub print:hidden";
const NOTE_LINK = "inline-flex items-center min-h-26 px-8 rounded-md bg-accent-06 text-accent "
  + "border border-accent-25 no-underline hover:bg-[#fffaf5] hover:border-accent-45";

export default function GuidePage({ route, onClose, onGoPrint, onGoNote }: {
  route: Route; onClose: () => void; onGoPrint: () => void; onGoNote: (slug: NoteSlug, hash?: string) => void;
}) {
  const t = useT();
  const stl = route !== "paper";
  const steps = STEPS.filter((s) => stl || !s.stl);
  const parts = PARTS.filter((s) => stl || !s.stl);
  const p = stl ? GUIDE_P.stl : GUIDE_P.paper;

  // The options a step actually offers HERE. `needs` gates on the DESIGN, not the route: sockets off
  // — or an opening too small for them — drops the legs way. Both routes offer all three when the
  // sockets are there, cardboard included.
  const options = useMemo(
    () => Object.fromEntries(STEPS.filter((s) => s.options)
      .map((s) => [s.id, s.options!.filter((o) => !o.needs || o.needs(p))])) as Record<string, Way[]>,
    [p],
  );

  // Figures are rendered ONE AT A TIME, into state, rather than in a memo: two dozen of them is a
  // second of geometry building, and doing that inside a render freezes the page before it has
  // painted the text someone could start reading. Cached, none of that applies, so a return visit
  // fills the page in one pass instead of yielding twenty-odd times for images it already has.
  const [figs, setFigs] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    const ids = [...parts.map((q) => q.id), ...KIT_FIGS,
      ...steps.flatMap((s) => (s.options
        ? options[s.id].flatMap((o) => [o.fig, ...(o.detail ?? []).map((d) => d.fig)])
        : s.fig ? [s.fig] : []))].filter((f): f is string => !!f);
    if (ids.every((id) => drawn(id, !stl))) {
      setFigs(Object.fromEntries(ids.map((id) => [id, figure(id, !stl)])));
      return undefined;
    }
    (async () => {
      const out: Record<string, string | null> = {};
      for (const id of ids) {
        if (cancelled) return;
        const fresh = !drawn(id, !stl);
        out[id] = figure(id, !stl);
        setFigs({ ...out });
        if (fresh) await new Promise((r) => setTimeout(r, 0));   // yield, so scrolling stays alive
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parts/steps are derived from route
  }, [route, stl, options]);
  // The renderer holds a WebGL context; the guide is the only thing that uses it.
  useEffect(() => disposeFigures, []);

  // Esc closes, as on the welcome card. No focus move on open: this is a document you read from the
  // top, and pulling focus to the × would scroll a long page to its corner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    /* `.guide` stays a class: the print rule that hides everything else keys off it from
       OUTSIDE the guide (`#root > div > *:not(.guide)`), which no utility can express. */
    <div role="dialog" aria-modal="true" aria-label={t("作り方")}
      className={SHELL}>
      {/* Fixed to the window rather than scrolled with the document: this is the way out, and a way
          out that leaves the screen after two paragraphs is not one. */}
      <button onClick={onClose}
        className={CLOSE} title={t("閉じる")} aria-label={t("閉じる")}>×</button>
      <div className={COLUMN}>
        <p className={EYEBROW}>{t("作り方")}</p>
        <h1 className={TITLE}>{t(stl ? "3Dプリントで型をつくる" : "段ボールで型をつくる")}</h1>
        <p className={LEDE}>
          {t("型を組み、竹ひごを巻き、和紙を貼って、乾いたら型を抜く。図は一例で、大きさや枚数は設計によって変わります。")}
        </p>
        <div className={NOTE_BOX}>
          <span>{t("補足")}</span>
          <a href="#" className={NOTE_LINK}
            onClick={(e) => { e.preventDefault(); onGoNote("note-motivation", "#starting-by-copying"); }}>
            {t("Tomoshibiを作った理由")}
          </a>
        </div>

        <h2 className={H2}>{t("部品")}</h2>
        <ul className={GRID}>
          {parts.map((q) => (
            <li key={q.id} className={CARD}>
              <div className={PART_WELL}>
                {figs[q.id] ? <img src={figs[q.id]!} alt="" className="w-full h-full object-contain" /> : <span />}
              </div>
              <div className={CARD_LINE}>
                {/* A count, or the reason there isn't one — never a number this page cannot know. */}
                <strong>{t(q.name)}</strong>
                <span className={CARD_COUNT}>{q.n ? `×${q.n}` : q.note && t(q.note)}</span>
              </div>
            </li>
          ))}
        </ul>
        {!stl && (
          <p className={PAPER_NOTE}>
            {t("段ボールの型には支柱・土台がありません(型紙が刷るのは、型そのものと口輪を曲げる線です)。回すときは手で持つか、箱などに載せてください。")}
          </p>
        )}

        <h2 className={H2}>{t("材料と道具")}</h2>
        {KIT.map((g) => (
          <div key={g.id} className={KIT_GROUP}>
            <h3 className={KIT_H3}>{t(g.title)}</h3>
            <ul className={GRID}>
              {/* The cardboard route reads a few of these differently — see `KitItem.paper`. Merged
                  here rather than in the list so the entry stays one thing with one name. */}
              {g.items.map((raw) => ({ ...raw, ...(!stl && raw.paper ? raw.paper : null) })).map((it) => (
                <li key={it.name} className={CARD}>
                  <Fig src={it.fig ? figs[it.fig] : undefined} t={t} part />
                  <div className={CARD_LINE}>
                    <strong>{t(it.name)}</strong>
                    {/* Right-aligned, where the parts list puts its ×N: the same line answering the
                        same question — how much of this do I need, and do I need it at all. */}
                    {it.opt && <Badge>{t("任意")}</Badge>}
                  </div>
                  {it.note && <div className={CARD_NOTE}>{t(it.note)}</div>}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <h2 className={H2}>{t("手順")}</h2>
        <ol className={STEP_OL}>
          {steps.map((s, i) => (
            <li key={s.id}
              className={`${STEP_LI}${s.options ? STEP_LI_SPLIT : STEP_LI_WHOLE}`}>
              {/* No well when the step has nothing to show: beside ten drawn figures an empty box
                  reads as one that failed. A step with `options` puts its figures in the sections
                  instead, one per way of doing it. */}
              {s.fig && <Fig src={figs[s.fig]} t={t} />}
              <div>
                <h3 className={STEP_H3}>
                  <span className={STEP_NUM}>{i + 1}</span>
                  <span>{t(s.title)}</span>
                </h3>
                {/* The count comes from the options actually offered here, not from the list: one
                    needs the leg sockets, and "three ways" over two sections is a visible lie. */}
                <p className={STEP_P}>{t(!stl && s.paperBody ? s.paperBody : s.body, s.options && { n: options[s.id].length })}</p>
                {s.notes && (
                  <div className={NOTE_BOX}>
                    <span>{t("関連ノート")}</span>
                    {s.notes.map((n) => (
                      <a key={`${n.slug}${n.hash ?? ""}`} href="#" className={NOTE_LINK}
                        onClick={(e) => { e.preventDefault(); onGoNote(n.slug, n.hash); }}>
                        {t(n.label)}
                      </a>
                    ))}
                  </div>
                )}
                {s.options && (
                  <ul className={WAY_UL}>
                    {options[s.id].map((o) => (
                      <WayItem key={o.id} o={o} stl={stl} figs={figs} t={t} />
                    ))}
                  </ul>
                )}
                {s.id === "make" && (
                  <Button className="mt-12" onClick={onGoPrint}>{t("「印刷」ビューへ →")}</Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
