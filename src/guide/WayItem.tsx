/**
 * The ways of lighting the lantern are alternatives, so they render as SECTIONS: the title and the
 * body span both columns ABOVE the figure, which is what separates one way from the next. Beside it,
 * a title is only the first line of a paragraph in a column of paragraphs — and numbering them would
 * tell the reader to do all of them.
 */
import { Fig } from "./figures.tsx";
import type { Way } from "./content.ts";
import type { T } from "../i18n.ts";

/* Prose inside a step. As `.guide-steps p` it beat the note style on specificity for every
   property it set, so a note inside a step never looked like a note. Utilities have no such
   accidents, which also means the accident has to be written out on purpose. It lives HERE, with
   the option body derived from it, so the step's paragraphs and the way's cannot drift apart. */
export const STEP_P = "m-0 text-md leading-[1.8] text-text";
const OPT_P = `${STEP_P} col-span-full max-w-[60ch] mb-2`;
const OPT_NOTE = `${OPT_P} mt-10`;
const WAY_LI = "grid grid-cols-[minmax(0,300px)_minmax(0,1fr)] gap-x-20 gap-y-6 "
  + "items-start narrow:grid-cols-[minmax(0,1fr)] narrow:gap-12 "
  + "print:[break-inside:avoid] print:shadow-none "
  + "print:grid-cols-[minmax(0,38%)_minmax(0,1fr)]";
const WAY_TITLE = "col-span-full m-0 text-md font-bold text-head";
const DETAIL_OL = "m-0 p-0 list-none [counter-reset:gd] flex flex-col gap-10";
const DETAIL_LI = "grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-12 "
  + "items-start [counter-increment:gd] narrow:grid-cols-[minmax(0,1fr)] "
  + "print:[break-inside:avoid] print:shadow-none "
  + "print:grid-cols-[minmax(0,24%)_minmax(0,1fr)]";
/* The sub-step number. A CSS counter rather than an index, so a slot that is filled in later
   renumbers by itself. */
const DETAIL_NUM = "before:content-[counter(gd)] before:inline-block "
  + "before:mr-6 before:font-mono before:text-sm before:font-bold "
  + "before:text-fine";
const DETAIL_TITLE = "inline m-0 text-base font-bold text-head";
const DETAIL_BODY = "m-0 text-base leading-[1.8] text-text";

export default function WayItem({ o, stl, figs, t }: {
  o: Way; stl: boolean; figs: Record<string, string | null>; t: T;
}) {
  return (
    <li className={WAY_LI}>
      <h4 className={WAY_TITLE}>{t(o.title)}</h4>
      <p className={OPT_P}>{t(!stl && o.paperBody ? o.paperBody : o.body)}</p>
      <Fig src={figs[o.fig]} t={t} />
      {o.detail && (
        <div>
          <ol className={DETAIL_OL}>
            {o.detail.map((d) => (
              <li key={d.id} className={DETAIL_LI}>
                <Fig src={d.fig ? figs[d.fig] : undefined} t={t} />
                <div className={DETAIL_NUM}>
                  {d.title && <h5 className={DETAIL_TITLE}>{t(d.title)}</h5>}
                  <p className={DETAIL_BODY}>
                    {t(d.body)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {/* A caveat about the way itself rather than a step in it, so it is a FOOTNOTE: last in the
          block, asterisked, in the step-level `wip` note's voice. Above the figure it read as
          another sentence of the body, i.e. a condition on doing this at all — which it is not. */}
      {o.note && <p className={OPT_NOTE}>*{t(o.note)}</p>}
    </li>
  );
}
