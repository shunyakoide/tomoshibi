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
 */
import React, { useEffect, useMemo, useState } from "react";
import { ringLegs } from "./geometry.ts";
import { DEFAULTS } from "./config.ts";
import { paperP } from "./papercraft.ts";
import { figureImage, disposeFigures } from "./three/figures.ts";
import { useT } from "./ui/theme.ts";
import { Badge, Button } from "./ui/controls.tsx";
import type { T } from "./i18n.ts";
import type { Design, Route } from "./types.ts";

/**
 * The lantern every figure on this page is drawn from — the app's own starting design, not the one
 * being edited: the page explains a method, and a method does not change shape. The cardboard route
 * keeps its own copy, at a representative thickness rather than the `matT` the user measured, because
 * that route cuts a genuinely different mold (smooth outer edge, no lightening windows, no tab dent —
 * `paperP`).
 *
 * **The leg sockets are pinned ON here, whatever `DEFAULTS` says.** With them off, `needs()` quietly
 * dropped the whole third way of lighting it — figure and all — off a page whose only job is to show
 * the ways. Anything else this page must SHOW belongs in this override, and `needs()` stays as it is,
 * to catch the next one.
 */
const GUIDE_MAT_T = 3;                                    // mm, ordinary single-wall cardboard
const GUIDE_BASE = { ...DEFAULTS, legSockets: true };
const GUIDE_P = { stl: GUIDE_BASE, paper: paperP(GUIDE_BASE, GUIDE_MAT_T) };

/** One entry in the parts list. `n` is printed only where it is a CONSTANT (see the note below);
 *  `stl` marks a part the cardboard route never makes. */
type PartRow = { id: string; name: string; n?: number; note?: string; stl?: boolean };
/** One numbered sub-step inside a way of lighting it — sequential, unlike the ways around it. */
type SubStep = { id: string; fig: string; title: string; body: string };
/** One WAY of doing a step: alternatives, not sub-steps. `needs` drops a way this design cannot
 *  offer, `note` is the footnote at its foot. */
type Way = {
  id: string; fig: string; title: string; body: string; paperBody?: string;
  needs?: (p: Design) => boolean; note?: string; detail?: SubStep[];
};
/** One step of the build. `wip` is both the draft badge and the one line saying why. */
type Step = {
  id: string; title: string; body: string; paperBody?: string; fig?: string; stl?: boolean;
  wip?: string; options?: Way[];
};
type KitItem = { name: string; fig?: string; note?: string; opt?: boolean };
type KitGroup = { id: string; title: string; items: KitItem[] };

// The parts the mold is made of. `n` is either a CONSTANT or it is not printed at all: two koma, two
// posts, one base and one ring at each end are facts about the mold, while how many ribs it takes is
// the reader's own decision — so that one says so in words rather than naming a number this page
// cannot know. The cardboard route cuts only the mold itself (see paperParts): no stand, and no
// rings, which belong to the finished lantern rather than to the template.
const PARTS: PartRow[] = [
  { id: "rib", name: "羽根板", note: "設計した枚数" },
  { id: "koma", name: "コマ", n: 2 },
  { id: "column", name: "支柱", n: 2, stl: true },
  { id: "base", name: "土台", n: 1, stl: true },
  { id: "ringBottom", name: "口輪(下)", n: 1, stl: true },
  { id: "ringTop", name: "口輪(上)", n: 1, stl: true },
];

// The build, in order. `fig` names a scene in three/figures.ts; `stl` marks a step the cardboard
// route does not have; an option's `detail` holds its numbered sub-steps. Bodies are i18n keys like
// every other string.
const STEPS: Step[] = [
  {
    id: "make", title: "部品をつくる",
    body: "「印刷」ビューから STL を書き出し、羽根板・コマ・支柱・土台・口輪を印刷します。コマと支柱は上下で同じ部品なので、スライサーで2つに複製してください。",
    paperBody: "「印刷」ビューから型紙 ZIP をダウンロードし、原寸(100%)で刷ります。段ボールに貼るか下敷きにして、線のとおりに切り出します。刃は新しいものを。",
  },
  {
    id: "ribsIn", title: "コマに羽根板を差す", fig: "ribsIn",
    body: "コマを平らに置き、まわりのノッチに羽根板の爪を差し込みます。爪の先の欠きがコマの内側に噛むので、奥まで入れば止まります。太い側の向きをすべて揃えてください。",
  },
  {
    id: "komaOn", title: "もう1枚のコマをかぶせる", fig: "komaOn",
    body: "反対側の爪をすべてノッチに合わせてから、コマを平行に押し下げます。1か所ずつ入れると割れやすいので、全体を少しずつ。上下のコマは同じ部品です。",
  },
  {
    id: "rings", title: "口輪をはめる", fig: "rings", stl: true,
    body: "上下の開口に口輪をはめます。内径が開口に合わせてあるので、羽根板の外側にすっと入ります。口輪も組んだ型も、まだ何にも留まっていません。輪ゴムやクリップで押さえてください(コマのすぐ外側に輪ゴムを1本ずつ巻くと羽根板の開きも揃います)。和紙は端の被せ代をこの口輪に折り返して貼るため、口輪は型を抜いたあとも提灯に残ります。脚ソケットが付いている方が下です。",
  },
  {
    id: "higo", title: "竹ひごを巻く", fig: "higo",
    body: "羽根板の外縁の溝に竹ひごを沿わせ、下から上へ巻いていきます。溝が受けるので滑り落ちません。「螺旋巻き」で設計した型なら、溝が段ごとにずれていて1本の連続した螺旋になります。",
  },
  {
    id: "stand", title: "土台を組む", fig: "stand", stl: true,
    body: "土台のスリットに支柱の爪をまっすぐ差し込みます。肩が襟の上面に当たるまで押し込めば正しい深さです。2本とも、くぼみを上に向けて同じ向きに。",
  },
  {
    id: "onStand", title: "土台に載せる", fig: "onStand", stl: true,
    body: "型を横向きにして、両端のコマを支柱のくぼみに載せます。こうすると型が回るので、1面貼っては回し、を繰り返せます。まず手で1回転させて、振れや引っかかりがないか確認してください。",
  },
  {
    id: "washi", title: "和紙を貼る", fig: "washi",
    body: "でんぷん糊を竹ひごに置き、和紙をのせて刷毛で撫でて密着させます。羽根板と羽根板の間を1面ずつ、1つ飛ばしに。一周したら戻って間を埋めます — 縁を重ねる相手が濡れていない面になります。和紙の型紙(ZIP に同梱)で先に切っておくと、濡れた紙を切らずに済みます。",
  },
  {
    id: "dry", title: "乾かす", fig: "dry",
    body: "糊と和紙が完全に乾くまで置きます。乾くと紙が張って形が決まります。急がないこと — 生乾きで型を抜くと歪みます。",
  },
  {
    id: "pull", title: "型を抜く", fig: "pull",
    body: "コマを爪先の側(外向き)へ抜き、羽根板を開口から1枚ずつ引き出します。羽根板の内側は中央がえぐってあるので、開口より小さくなって抜けます。口輪は提灯側に残ります。はみ出した和紙は開口の縁で切り揃えてください。",
  },
  {
    // Three ways, three SECTIONS — not three steps: they are alternatives, and numbering them
    // 11/12/13 would tell the reader to do all three. `options` is what renders a step as sections,
    // each with its own figure, because the difference between the three IS the picture.
    //
    // Nothing carries `wip` now, but **keep the mechanism for the next unsettled step** — it draws
    // the badge beside the title and prints the field's own one-line reason under the body — and
    // keep that wording clear of 「口輪」: the cardboard route prints no rings, and a step must not
    // name a part its own route never makes. A ⌀65 lamp-holder base to print was offered here and
    // taken back out with its STL: a printable file is a decision, and these fittings are bought.
    id: "light", title: "灯りをつける",
    body: "灯具の付け方は{n}通りあります。どれを選んでも電球は和紙のすぐ内側に来るので、熱を持ちにくい LED にしてください。",
    options: [
      {
        // No `detail`: there is no fitting to work through — you set the lamp down and drop the shade
        // over it, which is the whole method and is already the figure.
        id: "set", fig: "lightSet", title: "置いたライトに被せる",
        body: "LED ライトを床に置き、上からシェードを被せます。脚も金具も要りません。ライトは下の開口を通る大きさのものを。",
      },
      {
        id: "hang", fig: "lightHang", title: "上から吊るす",
        // What carries the shade is NOT the lamp — the lamp hangs on its own cord inside it. Two
        // slots, not the four the legs take, because there is less to it: bend one wire, lay it on.
        // Nothing is clamped and nothing is hooked onto the ring, so nothing here is route-specific
        // either — both routes have an opening with an edge to rest on, which is why this option
        // needs no `paperBody` where the legs do.
        body: "ソケットを大きいほうの開口から入れ、コードを上の開口から出します。吊り線1本のUにコードを入れてソケットを引っ掛け、両端を上の開口の縁の下に入れます。",
        // The one thing this fitting cannot promise: held by nothing but its own shape against the
        // rim, how well it sits depends on the size of an opening this page knows nothing about (see
        // the header). Said once, as a footnote at the foot of this way (see the JSX).
        note: "上の開口の大きさによっては安定しないことがあります。長さや曲げ方は現物に合わせて調整してください。",
        detail: [
          { id: "wire1", fig: "hangBend", title: "吊り線を曲げる",
            body: "ワイヤーの中央をUの字に曲げます。間はコードが通ってソケットが通らない幅に。中央が高くなるようゆるい弧に曲げ、両端は上の開口の縁の下を通って外まで出る長さに伸ばします。" },
          { id: "wire2", fig: "hangSet", title: "ソケットを引っ掛ける",
            body: "Uにコードを入れると、ソケットが引っ掛かります。両端は上の開口の縁の下に入れます。" },
        ],
      },
      {
        // Needs the leg sockets: without them the figure would draw a legless lantern under the words
        // "add legs", so the option is dropped instead. Not the 3D route, though — cardboard prints
        // no ring, but the finished lantern has one either way, the hoop just being the builder's.
        id: "legs", fig: "lightLegs", title: "脚を付けて下から留める", needs: (q) => !!ringLegs(q),
        // The lamp and the legs go in as ONE piece — what the sub-steps below build — and there is
        // one fixing, the nut. The cardboard line has to say where the leg ends go as well, since a
        // hoop cut from card has no bores in it.
        body: "脚と枠を付けたライトを下の開口から差し入れ、脚の先を下の口輪の脚ソケットに挿して立てます。枠は火袋の内側を通って上の開口から少し顔を出し、火袋を上下に張らせます。コードは脚のあいだから下へ逃がします。",
        paperBody: "段ボールの型では口輪を刷りません。下の開口に厚紙で輪をつくって貼り、脚の先を挿す穴を3ヶ所あけておきます。あとは同じで、脚と枠を付けたライトを下の開口から差し入れて立て、コードは脚のあいだから逃がします。",
        // The wire work: a pendant holder's cord leaves through a threaded stem with a nut on it, so
        // a loop bent in the wire's end stacks on that stem and one nut clamps the lot, which is how
        // the ready-made lantern kits do it. The slots read the same on BOTH routes on purpose: they
        // stop at the bench, and what the legs are then pushed into — a printed ring on one route,
        // card on the other — is what the option's own body/paperBody says. (A slot has no
        // `paperBody`, and should not need one.)
        detail: [
          { id: "wire1", fig: "legBend", title: "脚を曲げる",
            body: "ペンチで先端を輪に曲げます。輪はソケットのネジが通る大きさに。残りは外へ渡してから下へ折り、床に届く長さにします。3本とも同じ形に。" },
          // The frame keeps the shade at its full height — a paper bag with a ring at each end and
          // nothing between them sags shut. Bent from the same wire and fixed by the same nut as the
          // legs, which is why it is a step of this way rather than a way of its own, and why it sits
          // between bending the legs and going onto the stem. Its size is stated as a RELATION, never
          // a number: it follows a shade this page knows nothing about (see the header). Clearing the
          // LAMP is the one real constraint on the shape (the foot sits under the socket, which sits
          // under the bulb), and the nut is its only fixing — holding the top out against a foot that
          // cannot move is what puts the shade in tension.
          { id: "wire4", fig: "frameBend", title: "枠を曲げる",
            body: "もう1本を輪に曲げます。下は両端を合わせて脚と同じ大きさの輪にし、そこから電球とソケットに当たらないよう外へ開いて立ち上げます。上の端は小さな輪に。高さは、その輪が上の開口から少し出るくらいに。" },
          { id: "wire2", fig: "legStack", title: "ネジに通す",
            body: "ソケットの固定ナットを外し、3本の脚と枠の輪をネジに重ねて通します。脚が120°ずつ開くように向きを揃えてください。" },
          { id: "wire3", fig: "legStood", title: "ナットで締める",
            body: "ナットを戻して締めます。これでライトと脚と枠が1つになります。" },
        ],
      },
    ],
  },
];

/**
 * What you supply yourself — the printed parts are the list above, and this is laid out like it,
 * wells and all, because it answers the same question: what do I need in front of me.
 *
 * **Plain strings, no numbers, nothing derived** — a wire gauge, a brush and a pot of paste are not
 * things the design decides (a bamboo length summed over the grooves was tried and taken straight
 * back out), and a note says WHEN you need the thing, not what to ask for.
 *
 * Order is by how much it matters, not by category: a bad paste ruins the lantern, so it comes before
 * the wire. `opt` marks what you may not need at all — the wire and pliers serve only the two
 * lighting ways that fix something to an opening, and the brushes and mister can be done without.
 * Everything else is unconditional (no bamboo, washi, paste, something to hold the bamboo while it
 * dries, blade or lamp, no lantern at the end).
 *
 * `fig` names a scene in figures.ts — the only scenes there not made of this design (see "THE KIT").
 * An item with no `fig` keeps an empty well rather than a ragged card.
 */
const KIT: KitGroup[] = [
  { id: "materials", title: "材料", items: [
    { name: "竹ひご", fig: "kitHigo" },
    { name: "和紙", fig: "kitWashi" },
    { name: "のり", fig: "kitPaste", note: "でんぷんのり、または木工用ボンド" },
    // One line, one drawing: anything that holds the bamboo while the paste dries will do, and a
    // card each for the two examples is the list saying the same thing twice.
    { name: "テープや糸など", fig: "kitStick", note: "竹ひごを留める" },
    // A blade sits among the materials rather than the tools because that is where it was asked
    // for; it is also the one tool on the page you use up.
    { name: "カミソリ", fig: "kitRazor", note: "はみ出した和紙を切る" },
    { name: "ライト", fig: "kitLight", note: "熱を持ちにくい LED のもの" },
    { name: "ワイヤー", fig: "kitWire", opt: true, note: "脚を付けるか吊るす場合" },
  ] },
  { id: "tools", title: "道具", items: [
    { name: "のりを塗るはけ", fig: "kitPasteBrush", opt: true, note: "障子貼り用の糊刷毛など" },
    { name: "紙を張るブラシ", fig: "kitBrush", opt: true, note: "靴磨き用など" },
    // Sits with the brushes rather than at the end: it belongs to the pasting, as they do, where the
    // pliers belong to two of the lighting ways. The note names TWO moments because the craft uses it
    // at two. A chochin maker damps the sheet as she lays it
    // (三国提灯いとや: 「和紙を貼る時に霧吹きで湿らせるのですが、力を入れすぎると薄く」), and the
    // standard shoji finish is to mist the whole thing once pasted and dry it out of the sun, where
    // the paper shrinks and pulls taut. "After" alone names only the second, and would send a reader
    // past the moment the paper is hardest to handle.
    { name: "霧吹き", fig: "kitSpray", opt: true, note: "貼るときと、貼ったあとに" },
    { name: "ペンチ", fig: "kitPliers", opt: true, note: "ワイヤーを曲げる" },
  ] },
];

/** Every kit drawing, in page order. They are small figures, like the parts they sit under. */
const KIT_FIGS = KIT.flatMap((g) => g.items.map((i) => i.fig).filter((f): f is string => !!f));

/**
 * The figure well. It keeps its box whether the drawing has arrived, has failed, or neither exists:
 * a step that reflows when its image loads is a step you lose your place in. `null` (not undefined)
 * means the drawing FAILED rather than not having arrived, and saying so beats an empty well, which
 * nobody reads as a bug.
 */
function Fig({ src, t, part = false }: { src?: string | null; t: T; part?: boolean }) {
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-lg ${part
      ? "aspect-[3/2] mb-8 border border-transparent bg-transparent"
      : "aspect-[4/3] border border-edge bg-[#fff]"}`}>
      {src && <img src={src} alt="" className="w-full h-full object-contain" />}
      {src === null && <span className="text-sm text-fine text-center p-8">{t("図を描けませんでした")}</span>}
    </div>
  );
}

/**
 * Small wells for the two grids of thumbnails and for the sub-steps inside an option — those sit in
 * a 150px column, where a step's own 620px figure is four times the pixels the page will ever show.
 * A big one for a step.
 */
const SMALL_FIGS = new Set([
  ...PARTS.map((q: PartRow) => q.id),
  ...KIT_FIGS,
  ...STEPS.flatMap((s) => (s.options ?? []).flatMap((o) => (o.detail ?? []).map((d) => d.fig))),
].filter((f): f is string => !!f));
const sizeOf = (id: string) => (SMALL_FIGS.has(id) ? { width: 300, height: 220 } : { width: 620, height: 460 });

/**
 * Every figure ever rendered, for the life of the tab. Nothing they are drawn from can change any
 * more (see the header), so a figure is built at most once per route per session and coming back to
 * the guide costs no WebGL. `null` — the drawing failed — is cached too; a retry would fail alike.
 */
const CACHE = new Map<string, string | null>();
const cacheKey = (id: string, smooth: boolean) => `${id}|${smooth ? "paper" : "stl"}`;
const drawn = (id: string, smooth: boolean) => CACHE.has(cacheKey(id, smooth));
function figure(id: string, smooth: boolean): string | null {
  const key = cacheKey(id, smooth);
  if (!CACHE.has(key)) {
    CACHE.set(key, figureImage(smooth ? GUIDE_P.paper : GUIDE_P.stl, id, { ...sizeOf(id), smooth }));
  }
  return CACHE.get(key) ?? null;
}

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

