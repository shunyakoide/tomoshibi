/**
 * ============================================================================
 * GUIDE PAGE — how to build the lantern
 * ============================================================================
 * A document, not a view of the model: it takes the whole window (no inspector) and scrolls, the way
 * an assembly sheet reads. It overlays the idle WebGL canvas exactly as the section editor and the
 * cardboard route's print preview do.
 *
 * **The page is generic, and its figures are always the same drawing.** It used to be built from the
 * design on screen: every dimension measured off the geometry the STL is written from, every figure
 * rebuilt when a slider moved. That cost eleven WebGL scenes on every edit and bought numbers nobody
 * needs — winding bamboo onto a mold and pasting paper over it is the same job at ⌀140 as at ⌀400.
 * So the drawings come from ONE fixed design (`GUIDE_P`), are built at most once per session and
 * kept, and no measurement is printed anywhere on the page.
 *
 * What that gives up is the guarantee the old page had — that it could not describe a mold the
 * download does not contain — so nothing here may state a QUANTITY the design decides. The rib's
 * line reads "as many as your design has" rather than "×8" for exactly that reason: a fixed picture
 * of eight ribs is an illustration, but a printed 8 is a claim. What still follows the app is the
 * ROUTE, because that changes which parts exist at all, not how big they are.
 *
 * [Every step is drawn] Every step gets a figure, because every one of them is easier to see than to
 *   read: which way the bamboo runs, where the washi seams fall, which rib comes out of the opening
 *   and how far in it has to come to get there, what the thing looks like lit and on its legs. They
 *   draw one representative lantern, not the reader's.
 * [Detail] A drawing says where a thing goes. It cannot say how hard to pull, how wet the paste is,
 *   or what a seam looks like when it has gone right — and those are what the steps in the middle of
 *   this build are actually difficult for. So a step may carry a `more` block: the body says what to
 *   do, and this says how it goes, with a **photograph** from `public/photos/` beside it (and, over
 *   that still, an optional short clip). Until the file is there the well names what it is waiting
 *   for, which is the point of naming it here — the layout is finished before the photography is,
 *   and a picture lands by being dropped in under that name without this file being touched.
 *
 *   It is FOLDED (`<details>`), never a modal. A closed modal's content is not in the page at all,
 *   so it does not print — and the browser's own print is this page's paper version, with no PDF
 *   written anywhere to make up for it. The reader standing at a bench with paste on their hands is
 *   exactly the one who wants the detail and exactly the one who cannot click, so the detail must
 *   not be the one thing that exists only on screen. Folded is still there; hidden is not.
 * [Route] The cardboard route builds the same mold out of a different material and has no stand and
 *   no printed rings, so those steps are filtered rather than reworded.
 * [Print] The page carries print styles (index.css): the browser's own "Save as PDF" is the paper
 *   version, which is why the guide is not a PDF the app writes.
 * ============================================================================
 */
import React, { useEffect, useMemo, useState } from "react";
import { ringLegs } from "./geometry.js";
import { DEFAULTS } from "./config.js";
import { paperP } from "./papercraft.js";
import { figureImage, disposeFigures } from "./three/figures.js";
import { UI, accent, mono, useT } from "./ui/theme.js";

/**
 * The lantern every figure on this page is drawn from — the app's own starting design, not the one
 * being edited. See the header: the page explains a method, and a method does not change shape.
 *
 * The cardboard route keeps its own copy, because that route cuts a genuinely different mold: a
 * smooth outer edge, no lightening windows, no tab dent (`paperP`). That is a fact about the route,
 * not about anyone's measurements, so it is taken at a representative thickness rather than at the
 * `matT` the user measured — which is also why this page no longer asks for it.
 */
const GUIDE_MAT_T = 3;                                    // mm, ordinary single-wall cardboard
const GUIDE_P = { stl: DEFAULTS, paper: paperP(DEFAULTS, GUIDE_MAT_T) };

// The parts the mold is made of. `n` is how many, and it is either a CONSTANT or it is not printed
// at all: two koma, two posts, one base and one ring at each end are facts about the mold, while how
// many ribs it takes is the reader's own decision — so that one says so in words rather than naming
// a number this page cannot know. The cardboard route cuts only the mold itself (see paperParts) —
// no stand, and no rings, which are printed parts of the finished lantern rather than of the
// template.
const PARTS = [
  { id: "rib", name: "羽根板", note: "設計した枚数" },
  { id: "koma", name: "コマ", n: 2 },
  { id: "column", name: "支柱", n: 2, stl: true },
  { id: "base", name: "土台", n: 1, stl: true },
  { id: "ringBottom", name: "口輪(下)", n: 1, stl: true },
  { id: "ringTop", name: "口輪(上)", n: 1, stl: true },
];

// The build, in order. `fig` names a scene in three/figures.js; `more` is the folded detail block
// (see the header); `stl` marks a step the cardboard route does not have. Bodies are i18n keys like
// every other string.
const STEPS = [
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
    // The only body written here so far, and everything in it is a fact this repo can vouch for:
    // the grooves are evenly spaced, the barb leans toward the equator, and a spiral mold's ribs
    // carry their own serial numbers. Craft that only a builder knows belongs in the empty ones.
    more: {
      photo: "higo-winding.jpg",
      body: "溝は等間隔に切ってあるので、巻きながら間隔を測る必要はありません。溝の返しは胴の中央を向いているので、竹ひごは中央へ寄せるように押しつけると座ります。螺旋巻きの型は羽根板ごとに溝がずれています。羽根板に刻まれた通し番号の順に組んであれば、そのまま1本の連続した螺旋になります。",
    },
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
    more: { photo: "washi-panel.jpg" },
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
    // Three ways, three SECTIONS — not three steps. They are alternatives: numbering them 11/12/13
    // would tell the reader to do all three. `options` is what makes a step render as sections, and
    // each option carries its own figure, because the difference between the three IS the picture.
    //
    // This step carried a `wip` draft badge until all three ways had a fixing. They do now — (1)
    // fixes nothing to anything, (3) clamps its legs under the socket's nut and (2) hangs the shade
    // from a cord stopper — so the badge is gone rather than left standing over eleven drawn
    // sub-figures. The mechanism is still there for the next unsettled step: `wip` on a step draws
    // the badge beside its title and prints the field's own one-line reason under the body. If one
    // comes back here, keep the wording clear of "口輪" — the cardboard route prints no rings, and
    // a step must not name a part its own route never makes. The step also used to offer a ⌀65
    // lamp-holder base to print (`tomoshibi_socket_base.stl`); a printable file is a decision, and
    // this one has been made the other way: the fittings here are all things you buy.
    id: "light", title: "灯りをつける",
    body: "灯具の付け方は{n}通りあります。どれを選んでも電球は和紙のすぐ内側に来るので、熱を持ちにくい LED にしてください。",
    options: [
      {
        // No `more`: there is no fitting to photograph. You set the lamp down and drop the shade
        // over it, which is the whole method and is already the figure. The other two ways bend
        // wire, and that is what a photograph is for here.
        id: "set", fig: "lightSet", title: "置いたライトに被せる",
        body: "LED ライトを床に置き、上からシェードを被せます。脚も金具も要りません。ライトは下の開口を通る大きさのものを。",
      },
      {
        id: "hang", fig: "lightHang", title: "上から吊るす",
        // What carries the shade is NOT the lamp — the lamp hangs on its own cord inside it. The
        // text used to say the socket is fixed to an opening "with wire or the like", which was the
        // sentence standing in for a method nobody had worked out.
        //
        // Two slots, not the three the legs take, because there is less to it: bend one wire, lay
        // it on. It went the other way first — a bought cord stopper, three wires clamped under its
        // nut, a hook on each for the opening's ring — and that was three joints too many for a
        // paper shade. Nothing here is clamped and nothing is hooked onto the ring, so nothing here
        // is route-specific either: both routes have an opening with an edge to rest on, which is
        // why this option needs no `paperBody` where the legs do.
        body: "ソケットを大きいほうの開口から入れ、コードを上の開口から出します。吊り線1本のUにコードを入れてソケットを引っ掛け、両端を上の開口の縁の下に入れます。",
        // The one thing this fitting cannot promise. It is held by nothing but its own shape against
        // the rim, so how well it sits depends on how big that opening is — and the opening is the
        // reader's own design, which this page no longer knows anything about (see the header). It
        // says so once, as a footnote at the foot of this way (see the JSX).
        note: "上の開口の大きさによっては安定しないことがあります。長さや曲げ方は現物に合わせて調整してください。",
        detail: [
          { id: "wire1", fig: "hangBend", title: "吊り線を曲げる",
            body: "ワイヤーの中央をUの字に曲げます。間はコードが通ってソケットが通らない幅に。中央が高くなるようゆるい弧に曲げ、両端は上の開口の縁の下を通って外まで出る長さに伸ばします。" },
          { id: "wire2", fig: "hangSet", title: "ソケットを引っ掛ける",
            body: "Uにコードを入れると、ソケットが引っ掛かります。両端は上の開口の縁の下に入れます。" },
        ],
        more: { photo: "light-hang.jpg" },
      },
      {
        // Needs the leg sockets: they are where the legs go. Without them the figure would draw a
        // legless lantern under the words "add legs", so the option is dropped instead. It does not
        // need the 3D route, though — the cardboard one prints no ring, but the finished lantern
        // has one either way, so that route gets the same option with the hoop left to the builder.
        id: "legs", fig: "lightLegs", title: "脚を付けて下から留める", needs: (q) => !!ringLegs(q),
        // The lamp and the legs go in as ONE piece — that is what the sub-steps below build, and the
        // text used to describe two fixings (legs into the sockets, and the socket "fixed into the
        // opening" by nothing named). There is one fixing: the nut. The cardboard line has to say
        // where the leg ends go too, since a hoop cut from card has no bores in it.
        body: "脚を付けたライトを下の開口から差し入れ、脚の先を下の口輪の脚ソケットに挿して立てます。コードは脚のあいだから下へ逃がします。",
        paperBody: "段ボールの型では口輪を刷りません。下の開口に厚紙で輪をつくって貼り、脚の先を挿す穴を3ヶ所あけておきます。あとは同じで、脚を付けたライトを下の開口から差し入れて立て、コードは脚のあいだから逃がします。",
        // The wire work, and it is the one fixing on this page that is actually settled: a pendant
        // holder's cord leaves through a threaded stem with a nut on it, so a loop bent in the
        // wire's end stacks on that stem and the nut clamps all three at once. Nothing is printed
        // for it and nothing is invented — it is how the ready-made lantern kits do it.
        //
        // The three read the same on BOTH routes on purpose. They stop at the bench: what the legs
        // are then pushed into is the opening's ring, which is a printed part on one route and cut
        // from card on the other, and the option's own body/paperBody above already says which.
        // (A slot has no `paperBody` of its own, and should not need one.)
        detail: [
          { id: "wire1", fig: "legBend", title: "脚を曲げる",
            body: "ペンチで先端を輪に曲げます。輪はソケットのネジが通る大きさに。残りは外へ渡してから下へ折り、床に届く長さにします。3本とも同じ形に。" },
          { id: "wire2", fig: "legStack", title: "ネジに通す",
            body: "ソケットの固定ナットを外し、3本の輪をネジに重ねて通します。脚が120°ずつ開くように向きを揃えてください。" },
          { id: "wire3", fig: "legStood", title: "ナットで締める",
            body: "ナットを戻して締めます。これでライトと3本の脚が1つになります。" },
        ],
        more: { photo: "light-legs.jpg" },
      },
    ],
  },
];

/**
 * What you supply yourself. The printed (or cut) parts are the list above this one; everything here
 * you buy, and the page is no use standing at a shop counter unless it says so. It is laid out like
 * that parts list, wells and all, because it answers the same question — what do I need in front of
 * me — and two different shapes for one question is two things to learn.
 *
 * **Plain strings, no numbers.** Nothing here is derived and nothing should be: a wire gauge, a
 * brush and a pot of paste are not things the design decides. (A bamboo length summed over the
 * grooves was tried and taken straight back out — arithmetic nobody asked for, on a list whose job
 * is to be read in a shop.) The wire is just wire — not a gauge, not a material: it has to bend by
 * hand and hold a socket, and every note here that tried to be more specific than that came back
 * out. A note says WHEN you need the thing, not what to ask for at the counter.
 *
 * Order is by how much it matters, not by category: the paste is the one thing a bad choice of
 * which ruins the lantern, so it comes before the wire. `opt` marks what you may not need at all —
 * the wire and its pliers are only for the two lighting methods that fix something to an opening,
 * and the brushes are a preference. Everything else is unconditional: without bamboo, washi, paste,
 * something to hold the bamboo while it dries, a blade to trim the paper and a lamp to put inside
 * it, there is no lantern at the end.
 *
 * The drawings are the one thing here that is not a string: `fig` names a scene in figures.js, and
 * those scenes are the only ones in that file that are not made of this design (see "THE KIT"
 * there). An item with no `fig` keeps an empty well rather than a ragged card.
 */
const KIT = [
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
    { name: "ペンチ", fig: "kitPliers", opt: true, note: "ワイヤーを曲げる" },
  ] },
];

/** Every kit drawing, in page order. They are small figures, like the parts they sit under. */
const KIT_FIGS = KIT.flatMap((g) => g.items.map((i) => i.fig).filter(Boolean));

/**
 * The figure well. It keeps its box whether the drawing has arrived, has failed, or neither exists:
 * a step that reflows when its image loads is a step you lose your place in. `null` (not undefined)
 * means the drawing FAILED rather than not having arrived, and saying so beats an empty well — a
 * figure that silently vanishes is a gap nobody reads as a bug. It cost an hour here once.
 */
function Fig({ src, t, part }) {
  return (
    <div className={part ? "guide-fig guide-fig--part" : "guide-fig"}>
      {src && <img src={src} alt="" />}
      {src === null && <span className="guide-slot">{t("図を描けませんでした")}</span>}
    </div>
  );
}

/**
 * A step's technique, folded under its body: what to do is above, how it goes is in here. See the
 * header for why this is a `<details>` and not a modal — folded content still prints, and printing
 * is the only paper version this page has. Print styles open every one of them and drop the summary,
 * so what someone carries to the bench reads as one continuous document.
 *
 * An empty one is not a mistake. The well and the 未記入 line say the block is waiting for a
 * photograph and a paragraph, where three tidy sentences would say it was finished and thin.
 */
function More({ more, t }) {
  return (
    <details className="guide-more">
      <summary>{t("詳しく")}</summary>
      <div className="guide-more-body">
        <Shot photo={more.photo} video={more.video} t={t} />
        <p className={more.body ? undefined : "guide-note"}>{more.body ? t(more.body) : t("未記入")}</p>
      </div>
    </details>
  );
}

/**
 * A photograph of the technique, or — until the file is in `public/photos/` — a slot naming the file
 * it is waiting for. A missing image must not print a broken icon on a page someone is building
 * from, which is why the error is caught rather than left to the browser's own placeholder.
 *
 * A clip plays over its own still, and the still is REQUIRED: `video` without `photo` shows the slot
 * and no clip at all. The still is what prints, what is on screen before the video has loaded, and
 * what is left if the clip never gets shot — so nothing about the method may live only in the video.
 * Muted, looping and short, with no controls: it is a figure that moves, not something to operate.
 */
function Shot({ photo, video, t }) {
  const [ok, setOk] = useState(true);
  const url = (f) => `${import.meta.env.BASE_URL}photos/${f}`;
  if (!photo || !ok) {
    return (
      <div className="guide-fig">
        <span className="guide-slot">
          {t("写真")}{photo && <> · <span style={{ fontFamily: mono }}>{photo}</span></>}
        </span>
      </div>
    );
  }
  return (
    <div className="guide-fig">
      {video
        ? <video src={url(video)} poster={url(photo)} muted loop playsInline autoPlay />
        : <img src={url(photo)} alt="" onError={() => setOk(false)} />}
    </div>
  );
}

/**
 * Small wells for the two grids of thumbnails and for the sub-steps inside an option — those sit in
 * a 150px column (`.guide-detail` in index.css), where a step's own 620px figure is four times the
 * pixels the page will ever show. A big one for a step.
 */
const SMALL_FIGS = new Set([
  ...PARTS.map((q) => q.id),
  ...KIT_FIGS,
  ...STEPS.flatMap((s) => (s.options ?? []).flatMap((o) => (o.detail ?? []).map((d) => d.fig))),
].filter(Boolean));
const sizeOf = (id) => (SMALL_FIGS.has(id) ? { width: 300, height: 220 } : { width: 620, height: 460 });

/**
 * Every figure ever rendered, for the life of the tab. Nothing they are drawn from can change any
 * more (see the header), so a figure is built at most once per route per session: leaving the guide
 * and coming back is free, where it used to be another second of WebGL and a rebuilt geometry for
 * each of two dozen scenes. `null` — the drawing failed — is cached too; retrying it would fail the
 * same way, and the well says so either way.
 */
const CACHE = new Map();
const cacheKey = (id, smooth) => `${id}|${smooth ? "paper" : "stl"}`;
const drawn = (id, smooth) => CACHE.has(cacheKey(id, smooth));
function figure(id, smooth) {
  const key = cacheKey(id, smooth);
  if (!CACHE.has(key)) {
    CACHE.set(key, figureImage(smooth ? GUIDE_P.paper : GUIDE_P.stl, id, { ...sizeOf(id), smooth }));
  }
  return CACHE.get(key);
}

export default function GuidePage({ route, onGoPrint }) {
  const t = useT();
  const stl = route !== "paper";
  const steps = STEPS.filter((s) => stl || !s.stl);
  const parts = PARTS.filter((s) => stl || !s.stl);
  const p = stl ? GUIDE_P.stl : GUIDE_P.paper;

  // The options a step actually offers HERE. An option can need something the route does not have —
  // the legs go in the bottom ring's sockets, and cardboard prints no rings — and drawing it anyway
  // would put a legless lantern under the words "add legs".
  const options = useMemo(
    () => Object.fromEntries(STEPS.filter((s) => s.options)
      .map((s) => [s.id, s.options.filter((o) => !o.needs || o.needs(p, stl))])),
    [p, stl],
  );

  // Figures are rendered ONE AT A TIME, into state, rather than in a memo: two dozen of them is a
  // second of geometry building, and doing that inside a render freezes the page before it has
  // painted a word of the text — which is the part someone can start reading. Once they are in the
  // cache none of that applies, so a return visit fills the whole page in one pass instead of
  // yielding twenty-odd times to hand back images it already has.
  const [figs, setFigs] = useState({});
  useEffect(() => {
    let cancelled = false;
    const ids = [...parts.map((q) => q.id), ...KIT_FIGS,
      ...steps.flatMap((s) => (s.options
        ? options[s.id].flatMap((o) => [o.fig, ...(o.detail ?? []).map((d) => d.fig)])
        : s.fig ? [s.fig] : []))].filter(Boolean);
    if (ids.every((id) => drawn(id, !stl))) {
      setFigs(Object.fromEntries(ids.map((id) => [id, figure(id, !stl)])));
      return undefined;
    }
    (async () => {
      const out = {};
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

  const card = { background: UI.card, border: `1px solid ${UI.cardEdge}`, borderRadius: 14 };
  return (
    <div className="guide" style={{ position: "absolute", inset: 0, overflowY: "auto", background: UI.panel }}>
      <div className="guide-doc">
        <p className="guide-kicker">{t("組立説明書")}</p>
        <h1 className="guide-h1">{t(stl ? "3Dプリントで型をつくる" : "段ボールで型をつくる")}</h1>
        <p className="guide-lead">
          {t("型を組み、竹ひごを巻き、和紙を貼って、乾いたら型を抜く。図は一例で、大きさや枚数は設計によって変わります。")}
        </p>

        <h2 className="guide-h2">{t("部品")}</h2>
        <ul className="guide-parts">
          {parts.map((q) => (
            <li key={q.id} style={card}>
              <div className="guide-fig guide-fig--part">
                {figs[q.id] ? <img src={figs[q.id]} alt="" /> : <span />}
              </div>
              <div className="guide-part-name">
                {/* A count, or the reason there isn't one — never a number this page cannot know. */}
                <strong>{t(q.name)}</strong><span>{q.n ? `×${q.n}` : t(q.note)}</span>
              </div>
            </li>
          ))}
        </ul>
        {!stl && (
          <p className="guide-note">
            {t("段ボールの型には支柱・土台・口輪はありません(型紙は型そのものだけです)。回すときは手で持つか、箱などに載せてください。")}
          </p>
        )}

        <h2 className="guide-h2">{t("材料と道具")}</h2>
        {KIT.map((g) => (
          <div key={g.id} className="guide-kit">
            <h3>{t(g.title)}</h3>
            <ul className="guide-parts">
              {g.items.map((it) => (
                <li key={it.name} style={card}>
                  <Fig src={it.fig ? figs[it.fig] : undefined} t={t} part />
                  <div className="guide-part-name">
                    <strong>{t(it.name)}</strong>
                    {/* Right-aligned, where the parts list puts its ×N: the same line answering the
                        same question — how much of this do I need, and do I need it at all. */}
                    {it.opt && <em className="badge">{t("任意")}</em>}
                  </div>
                  {it.note && <div className="guide-part-dim">{t(it.note)}</div>}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <h2 className="guide-h2">{t("手順")}</h2>
        <ol className="guide-steps">
          {steps.map((s, i) => (
            <li key={s.id} style={card}>
              {/* No well when the step has nothing to show — an empty box reads as a figure that
                  failed to load, which is exactly what it looks like next to ten that did. A step
                  with `options` puts its figures in the sections instead, one per way of doing it. */}
              {s.fig && <Fig src={figs[s.fig]} t={t} />}
              <div>
                <h3>
                  <span className="guide-num" style={{ background: accent }}>{i + 1}</span>
                  {/* Title and badge in one flex item, so the badge keeps its own 5px against the
                      words instead of taking the h3's 10px gap as well. */}
                  <span>{t(s.title)}{s.wip && <em className="badge">{t("編集中")}</em>}</span>
                </h3>
                {/* The count comes from the options actually offered here, not from the list: one
                    of them needs the leg sockets, and "three ways" over two sections is a lie the
                    reader can see. */}
                <p>{t(!stl && s.paperBody ? s.paperBody : s.body, s.options && { n: options[s.id].length })}</p>
                {s.wip && <p className="guide-note">{t(s.wip)}</p>}
                {s.options && (
                  <ul className="guide-opts">
                    {options[s.id].map((o) => (
                      // The title sits ABOVE the figure, spanning both columns: that is what
                      // separates one way from the next. Beside the figure it is just the first
                      // line of a paragraph in a column of paragraphs.
                      <li key={o.id}>
                        <h4>{t(o.title)}</h4>
                        <p>{t(!stl && o.paperBody ? o.paperBody : o.body)}</p>
                        <Fig src={figs[o.fig]} t={t} />
                        {o.detail && (
                          <div>
                            <ol className="guide-detail">
                              {o.detail.map((d) => (
                                <li key={d.id}>
                                  <Fig src={d.fig ? figs[d.fig] : undefined} t={t} />
                                  <div>
                                    {d.title && <h5>{t(d.title)}</h5>}
                                    <p className={d.body ? undefined : "guide-note"}>
                                      {d.body ? t(d.body) : t("未記入")}
                                    </p>
                                  </div>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {/* Above the footnote, below the numbered work: it belongs to the way, and
                            the asterisked caveat stays last in the block whatever comes before it. */}
                        {o.more && <More more={o.more} t={t} />}
                        {/* A caveat about the way itself rather than a step in it, so it is a
                            FOOTNOTE: last in the block, marked with an asterisk, in the same voice
                            the step-level `wip` note uses. Above the figure it read as another
                            sentence of the body — as a condition on doing this at all, which it is
                            not: you do it, and then you may have to adjust it. */}
                        {o.note && <p className="guide-note">*{t(o.note)}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {s.id === "make" && (
                  <button className="btn btn--ghost" onClick={onGoPrint}>{t("「印刷」ビューへ →")}</button>
                )}
              </div>
              {/* Outside the text column, spanning the whole card. Nested inside it the block gets
                  what is left of a 300px-figure row — a photograph too small to read a technique off
                  and a measure of about twenty characters, where every other body on the page runs
                  to sixty. It also belongs to the step rather than to its text. */}
              {s.more && <More more={s.more} t={t} />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

