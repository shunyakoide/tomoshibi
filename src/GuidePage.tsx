/**
 * ============================================================================
 * GUIDE PAGE — how to build the lantern
 * ============================================================================
 * A document, not a view of the model: it takes the whole window and scrolls, and it is the one PAGE
 * in this app — `/guide`, with an address of its own (src/route.ts) — opened from the ☰ menu and
 * closed with ×, Esc or the browser's back button, all three the same gesture. **It was a fifth view
 * tab and must not go back**: the other four each render YOUR design and this one does not, so as a
 * tab it had to be excepted out of the dimension chip, the viewport alerts and the inspector, and it
 * cost the phone's tab strip its fifth slot.
 *
 * **The page is generic: every figure is drawn from ONE fixed design (`GUIDE_P`), at most once per
 * ROUTE per session, and no measurement is printed anywhere.** Built from the design on screen it
 * cost two dozen WebGL scenes per edit for numbers nobody needs — but it also guaranteed the page
 * could not describe a mold the download does not contain, so **nothing here may state a QUANTITY
 * the design decides**: the rib's line reads "as many as your design has" rather than "×8". The
 * ROUTE still follows the app, because it changes which parts exist at all — cardboard has no stand
 * and no printed rings, so those steps are filtered, not reworded.
 *
 * Every step is drawn — where the bamboo runs, where the seams fall, which rib comes out and how far
 * are easier to see than to read. Print styles live in index.css: the browser's own "Save as PDF" is
 * the paper version, which is why the guide is not a PDF the app writes.
 * ============================================================================
 *
 * The page itself is below; what it renders lives beside it — `guide/content.ts` is every word and
 * every ordering decision, `guide/figures.tsx` is `GUIDE_P` and the drawings made from it.
 * ============================================================================
 */
import React, { useEffect, useMemo, useState } from "react";
import { disposeFigures } from "./three/figures.ts";
import { KIT, KIT_FIGS, PARTS, STEPS } from "./guide/content.ts";
import { Fig, GUIDE_P, drawn, figure } from "./guide/figures.tsx";
import { useT } from "./ui/theme.ts";
import { Badge, Button } from "./ui/controls.tsx";
import type { Way } from "./guide/content.ts";
import type { Route } from "./types.ts";

export default function GuidePage({ route, onClose, onGoPrint }: {
  route: Route; onClose: () => void; onGoPrint: () => void;
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

  /* The kit and parts cards. A class rather than a style object, so the box that goes with the
     ground — radius, padding, the print rules — sits in the same string as the colours. */
  const card = "bg-card border border-card-edge rounded-2xl pt-10 px-12 pb-12 "
    + "print:[break-inside:avoid] print:shadow-none";
  /* Prose inside a step. As `.guide-steps p` it beat the note style on specificity for every
     property it set, so a note inside a step never looked like a note. Utilities have no such
     accidents, which also means the accident has to be written out on purpose. */
  const stepP = "m-0 text-md leading-[1.8] text-text";
  const optP = `${stepP} col-span-full max-w-[60ch] mb-2`;
  return (
    /* `.guide` stays a class: the print rule that hides everything else keys off it from
       OUTSIDE the guide (`#root > div > *:not(.guide)`), which no utility can express. */
    <div role="dialog" aria-modal="true" aria-label={t("作り方")}
      className="guide fixed inset-0 z-40 overflow-y-auto bg-panel
        print:static print:overflow-visible print:bg-[#fff]">
      {/* Fixed to the window rather than scrolled with the document: this is the way out, and a way
          out that leaves the screen after two paragraphs is not one. */}
      <button onClick={onClose}
        className="fixed top-12 right-16 z-1 w-36 h-36 p-0 flex items-center justify-center
          bg-panel border-none border-[currentColor] rounded-full cursor-pointer font-sans text-2xl leading-none text-faint
          shadow-[0_0_0_1px_var(--color-edge)] hover:bg-card hover:text-text print:hidden" title={t("閉じる")} aria-label={t("閉じる")}>×</button>
      <div className="max-w-860 mx-auto pt-30 px-24 pb-72 narrow:pt-26 narrow:px-14 narrow:pb-40
        print:max-w-none print:p-0">
        <p className="mt-0 mx-0 mb-6 font-mono text-sm font-semibold tracking-[0.14em] uppercase text-accent">{t("作り方")}</p>
        <h1 className="mt-0 mx-0 mb-10 text-3xl font-bold text-head">{t(stl ? "3Dプリントで型をつくる" : "段ボールで型をつくる")}</h1>
        <p className="m-0 text-lg leading-[1.75] text-fine max-w-[62ch]">
          {t("型を組み、竹ひごを巻き、和紙を貼って、乾いたら型を抜く。図は一例で、大きさや枚数は設計によって変わります。")}
        </p>

        <h2 className="mt-40 mx-0 mb-14 text-md font-bold tracking-[0.08em] text-head border-b border-b-edge pb-8 print:[break-after:avoid]">{t("部品")}</h2>
        <ul className="list-none m-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-12">
          {parts.map((q) => (
            <li key={q.id} className={card}>
              <div className="flex items-center justify-center overflow-hidden rounded-lg aspect-[3/2] mb-8 border border-transparent bg-transparent">
                {figs[q.id] ? <img src={figs[q.id]!} alt="" className="w-full h-full object-contain" /> : <span />}
              </div>
              <div className="flex items-baseline justify-between gap-8 text-md">
                {/* A count, or the reason there isn't one — never a number this page cannot know. */}
                <strong>{t(q.name)}</strong>
                <span className="font-mono text-base text-sub">{q.n ? `×${q.n}` : q.note && t(q.note)}</span>
              </div>
            </li>
          ))}
        </ul>
        {!stl && (
          <p className="mt-12 mx-0 mb-0 text-base leading-[1.7] text-sub">
            {t("段ボールの型には支柱・土台・口輪はありません(型紙は型そのものだけです)。回すときは手で持つか、箱などに載せてください。")}
          </p>
        )}

        <h2 className="mt-40 mx-0 mb-14 text-md font-bold tracking-[0.08em] text-head border-b border-b-edge pb-8 print:[break-after:avoid]">{t("材料と道具")}</h2>
        {KIT.map((g) => (
          <div key={g.id} className="mt-4 [&+&]:mt-16 [&_strong]:font-normal">
            <h3 className="mt-0 mx-0 mb-8 text-base font-bold tracking-[0.06em] text-fine">{t(g.title)}</h3>
            <ul className="list-none m-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-12">
              {g.items.map((it) => (
                <li key={it.name} className={card}>
                  <Fig src={it.fig ? figs[it.fig] : undefined} t={t} part />
                  <div className="flex items-baseline justify-between gap-8 text-md">
                    <strong>{t(it.name)}</strong>
                    {/* Right-aligned, where the parts list puts its ×N: the same line answering the
                        same question — how much of this do I need, and do I need it at all. */}
                    {it.opt && <Badge>{t("任意")}</Badge>}
                  </div>
                  {it.note && <div className="mt-2 font-mono text-sm text-fine">{t(it.note)}</div>}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <h2 className="mt-40 mx-0 mb-14 text-md font-bold tracking-[0.08em] text-head border-b border-b-edge pb-8 print:[break-after:avoid]">{t("手順")}</h2>
        <ol className="list-none m-0 p-0 flex flex-col gap-14">
          {steps.map((s, i) => (
            <li key={s.id}
              className={`bg-card border border-card-edge rounded-2xl grid items-start gap-20 p-16
                grid-cols-[minmax(0,300px)_minmax(0,1fr)] narrow:grid-cols-[minmax(0,1fr)] narrow:gap-12
                [&>:only-child]:col-span-full
                print:shadow-none print:grid-cols-[minmax(0,38%)_minmax(0,1fr)]
                ${s.options ? "print:[break-inside:auto]" : "print:[break-inside:avoid]"}`}>
              {/* No well when the step has nothing to show: beside ten drawn figures an empty box
                  reads as one that failed. A step with `options` puts its figures in the sections
                  instead, one per way of doing it. */}
              {s.fig && <Fig src={figs[s.fig]} t={t} />}
              <div>
                <h3 className="flex items-center gap-10 mt-2 mx-0 mb-8 text-xl font-bold text-head">
                  <span className="flex-none w-24 h-24 rounded-full bg-accent text-[#fff] flex
                    items-center justify-center text-base font-bold">{i + 1}</span>
                  {/* Title and badge in one flex item, so the badge keeps its own 5px against the
                      words instead of taking the h3's 10px gap as well. */}
                  <span>{t(s.title)}{s.wip && <Badge>{t("編集中")}</Badge>}</span>
                </h3>
                {/* The count comes from the options actually offered here, not from the list: one
                    needs the leg sockets, and "three ways" over two sections is a visible lie. */}
                <p className={stepP}>{t(!stl && s.paperBody ? s.paperBody : s.body, s.options && { n: options[s.id].length })}</p>
                {s.wip && <p className={stepP}>{t(s.wip)}</p>}
                {s.options && (
                  <ul className="list-none mt-16 mx-0 mb-0 p-0 flex flex-col gap-20">
                    {options[s.id].map((o) => (
                      // The title sits ABOVE the figure, spanning both columns: that is what
                      // separates one way from the next. Beside it, the title is only the first line
                      // of a paragraph in a column of paragraphs.
                      <li key={o.id}
                        className="grid grid-cols-[minmax(0,300px)_minmax(0,1fr)] gap-x-20 gap-y-6
                          items-start narrow:grid-cols-[minmax(0,1fr)] narrow:gap-12
                          print:[break-inside:avoid] print:shadow-none
                          print:grid-cols-[minmax(0,38%)_minmax(0,1fr)]">
                        <h4 className="col-span-full m-0 text-md font-bold text-head">{t(o.title)}</h4>
                        <p className={optP}>{t(!stl && o.paperBody ? o.paperBody : o.body)}</p>
                        <Fig src={figs[o.fig]} t={t} />
                        {o.detail && (
                          <div>
                            <ol className="m-0 p-0 list-none [counter-reset:gd] flex flex-col gap-10">
                              {o.detail.map((d) => (
                                <li key={d.id}
                                  className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-12
                                    items-start [counter-increment:gd] narrow:grid-cols-[minmax(0,1fr)]
                                    print:[break-inside:avoid] print:shadow-none
                                    print:grid-cols-[minmax(0,24%)_minmax(0,1fr)]">
                                  <Fig src={d.fig ? figs[d.fig] : undefined} t={t} />
                                  {/* The step number. A CSS counter rather than an index, so a
                                      slot that is filled in later renumbers by itself. */}
                                  <div className="before:content-[counter(gd)] before:inline-block
                                    before:mr-6 before:font-mono before:text-sm before:font-bold
                                    before:text-fine">
                                    {d.title && <h5 className="inline m-0 text-base font-bold text-head">{t(d.title)}</h5>}
                                    <p className="m-0 text-base leading-[1.8] text-text">
                                      {d.body ? t(d.body) : t("未記入")}
                                    </p>
                                  </div>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {/* A caveat about the way itself rather than a step in it, so it is a
                            FOOTNOTE: last in the block, asterisked, in the step-level `wip` note's
                            voice. Above the figure it read as another sentence of the body, i.e. a
                            condition on doing this at all — which it is not. */}
                        {o.note && <p className={`${optP} mt-10`}>*{t(o.note)}</p>}
                      </li>
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

