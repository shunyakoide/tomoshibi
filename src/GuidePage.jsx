/**
 * ============================================================================
 * GUIDE PAGE — how to build the lantern, for the design on screen
 * ============================================================================
 * A document, not a view of the model: it takes the whole window (no inspector) and scrolls, the way
 * an assembly sheet reads. It overlays the idle WebGL canvas exactly as the section editor and the
 * cardboard route's print preview do.
 *
 * **Every number and every figure comes from the design.** The parts list counts the ribs this
 * design has and measures the parts this design makes (`three/figures.js` draws them from the same
 * geometry.js the STL is written from), so the page can never describe a different mold from the one
 * in the download. A guide with "rib ×8" printed on it is wrong for half its readers the moment the
 * app has a rib-count control at all.
 *
 * [Every step is drawn] A figure is drawn when the answer depends on the design — which parts, how
 *   many, what shape — and on this page every step turns out to be one: how many turns of bamboo and
 *   which way they run, how many washi panels and where their seams fall, which rib comes out of the
 *   opening and how far it has to come in to get there, what the thing looks like lit and on its
 *   legs. Steps that are pure technique used to take a **photograph** from `public/photos/`, with a
 *   slot naming the file it wanted; nothing is waiting on a photograph any more, so that mechanism
 *   is gone rather than left behind unused. Bring it back with the step that needs it.
 * [Route] The cardboard route builds the same mold out of a different material and has no stand and
 *   no printed rings, so those steps are filtered rather than reworded.
 * [Print] The page carries print styles (index.css): the browser's own "Save as PDF" is the paper
 *   version, which is why the guide is not a PDF the app writes.
 * ============================================================================
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ribGeometry, komaGeometry, standGeometry, boardGeometry, ringGeometry, maxRadius, ringLegs,
} from "./geometry.js";
import { paperP } from "./papercraft.js";
import { figureImage, disposeFigures } from "./three/figures.js";
import { UI, accent, useT } from "./ui/theme.js";

// The parts this design makes. `geo` is measured for the size line and drawn for the thumbnail;
// `n` counts them. The cardboard route cuts only the mold itself (see paperParts) — no stand, and no
// rings, which are printed parts of the finished lantern rather than of the template.
const PARTS = [
  { id: "rib", name: "羽根板", geo: (p) => ribGeometry(p, 0), n: (p) => p.boards },
  { id: "koma", name: "コマ", geo: komaGeometry, n: () => 2 },
  { id: "column", name: "支柱", geo: standGeometry, n: () => 2, stl: true },
  { id: "base", name: "土台", geo: boardGeometry, n: () => 1, stl: true },
  { id: "ringBottom", name: "口輪(下)", geo: (p) => ringGeometry(p, false), n: () => 1, stl: true },
  { id: "ringTop", name: "口輪(上)", geo: (p) => ringGeometry(p, true), n: () => 1, stl: true },
];

// The build, in order. `fig` is drawn from the design; `stl` marks a step the cardboard route does
// not have. Bodies are i18n keys like every other string.
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
    // Three ways, three SECTIONS — not three steps. They are alternatives: numbering them 11/12/13
    // would tell the reader to do all three. `options` is what makes a step render as sections, and
    // each option carries its own figure, because the difference between the three IS the picture.
    //
    // `wip`: the step is not settled, and the badge says so where someone reads it rather than in a
    // commit message. The three ways are settled; what holds the lamp to the paper in any of them
    // is not. It used to offer a ⌀65 lamp-holder base to print (`tomoshibi_socket_base.stl`); a
    // printable file is a decision and this step has not made it, so it says what the light has to
    // be and no more. Note the wording avoids "口輪": the cardboard route prints no rings, and a
    // step must not name a part its own route never makes.
    id: "light", title: "灯りをつける",
    wip: "灯具の固定方法はまだ検討中です。",
    body: "灯具の付け方は{n}通りあります。どれを選んでも電球は和紙のすぐ内側に来るので、熱を持ちにくい LED にしてください。",
    options: [
      {
        id: "set", fig: "lightSet", title: "置いたライトに被せる",
        body: "LED ライトを床に置き、上からシェードを被せます。脚も金具も要りません。ライトは下の開口を通る大きさのものを。",
      },
      {
        id: "hang", fig: "lightHang", title: "上から吊るす",
        body: "ペンダントライトのソケットを大きいほうの開口から入れ、コードを上の開口から出します。ソケットは針金などで開口に留めます。",
        // Empty slots, on purpose: the wire has to be bent to shape with pliers and that shape is
        // not designed yet. The slots hold the place — and the count — so the step reads as
        // unfinished rather than as finished and thin. Fill in `title`/`body`/`fig` as each is
        // settled; a slot with a `fig` draws it, one without keeps the empty well.
        detail: [{ id: "wire1" }, { id: "wire2" }],
      },
      {
        // Needs the leg sockets: they are where the legs go. Without them the figure would draw a
        // legless lantern under the words "add legs", so the option is dropped instead. It does not
        // need the 3D route, though — the cardboard one prints no ring, but the finished lantern
        // has one either way, so that route gets the same option with the hoop left to the builder.
        id: "legs", fig: "lightLegs", title: "脚を付けて下から留める", needs: (q) => !!ringLegs(q),
        body: "下の口輪の脚ソケットに脚を挿して立て、下の開口にペンダントライトのソケットを留めます。コードは脚のあいだから逃がします。",
        paperBody: "段ボールの型では口輪を刷りません。下の開口に厚紙で輪をつくって貼り、そこに脚を留めて立てます。あとは同じで、下の開口にペンダントライトのソケットを留め、コードは脚のあいだから逃がします。",
        detail: [{ id: "wire1" }, { id: "wire2" }, { id: "wire3" }],
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
 * is to be read in a shop.) The wire is just wire: steel is not required, so it is not specified.
 *
 * Order is by how much it matters, not by category: the paste is the one thing a bad choice of
 * which ruins the lantern, so it comes before the wire. `opt` marks what you may not need at all —
 * the wire and its pliers are only for the two lighting methods that fix something to an opening,
 * and the brushes are a preference. Only the bamboo and the paste are not optional.
 *
 * The drawings are the one thing here that is not a string: `fig` names a scene in figures.js, and
 * those scenes are the only ones in that file that are not made of this design (see "THE KIT"
 * there). An item with no `fig` keeps an empty well rather than a ragged card.
 */
const KIT = [
  { id: "materials", title: "材料", items: [
    { name: "竹ひご", fig: "kitHigo" },
    { name: "のり", fig: "kitPaste", note: "でんぷんのり、または木工用ボンド" },
    // One line, one drawing: anything that holds the bamboo while the paste dries will do, and a
    // card each for the two examples is the list saying the same thing twice.
    { name: "テープや糸など", fig: "kitStick", note: "竹ひごを留める" },
    { name: "ワイヤー", fig: "kitWire", opt: true, note: "⌀2mm · 脚を付けるか吊るす場合" },
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

/** W × H × T of a part in mm, measured from the geometry the STL is written from. */
function dims(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const v = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((n) => Math.round(n * 10) / 10);
  geo.dispose();
  return v;
}

export default function GuidePage({ p: design, route, matT, onGoPrint }) {
  const t = useT();
  const stl = route !== "paper";
  const steps = STEPS.filter((s) => stl || !s.stl);
  const parts = PARTS.filter((s) => stl || !s.stl);
  // On cardboard the guide describes the mold that route MAKES, not the one being edited: the
  // material thickness becomes the board thickness, and thick material clamps the rib count. A page
  // built from the design on screen would count ribs the template does not cut and print a 2mm
  // thickness on a part cut from 5mm board. Same reason washiPDF is handed paperP (papercraft.js).
  const p = useMemo(() => (stl ? design : paperP(design, matT)), [stl, design, matT]);

  // The options a step actually offers HERE. An option can need something this design or this route
  // does not have — the legs go in the bottom ring's sockets, and cardboard prints no rings — and
  // drawing it anyway would put a legless lantern under the words "add legs".
  const options = useMemo(
    () => Object.fromEntries(STEPS.filter((s) => s.options)
      .map((s) => [s.id, s.options.filter((o) => !o.needs || o.needs(p, stl))])),
    [p, stl],
  );

  // Sizes are cheap; figures are not. The list is measured up front, the drawings arrive after.
  const sizes = useMemo(
    () => Object.fromEntries(parts.map((q) => [q.id, dims(q.geo(p))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `parts` is derived from route
    [p, route],
  );

  // Figures are rendered ONE AT A TIME, into state, rather than in a memo: eleven of them is a
  // second of geometry building, and doing that inside a render freezes the page before it has
  // painted a word of the text — which is the part someone can start reading. `cancelled` matters
  // more than usual here: a slider drag re-enters this before the previous pass is done.
  const [figs, setFigs] = useState({});
  useEffect(() => {
    let cancelled = false;
    const ids = [...parts.map((q) => q.id), ...KIT_FIGS,
      ...steps.flatMap((s) => (s.options
        ? options[s.id].flatMap((o) => [o.fig, ...(o.detail ?? []).map((d) => d.fig)])
        : s.fig ? [s.fig] : []))].filter(Boolean);
    (async () => {
      const out = {};
      for (const id of ids) {
        if (cancelled) return;
        const small = PARTS.some((q) => q.id === id) || KIT_FIGS.includes(id);
        const size = small ? { width: 300, height: 220 } : { width: 620, height: 460 };
        out[id] = figureImage(p, id, { ...size, smooth: !stl });
        setFigs({ ...out });
        await new Promise((r) => setTimeout(r, 0));   // yield, so scrolling stays alive meanwhile
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parts/steps/stl are derived from route
  }, [p, route, options]);
  // The renderer holds a WebGL context; the guide is the only thing that uses it.
  useEffect(() => disposeFigures, []);

  const card = { background: UI.card, border: `1px solid ${UI.cardEdge}`, borderRadius: 14 };
  return (
    <div className="guide" style={{ position: "absolute", inset: 0, overflowY: "auto", background: UI.panel }}>
      <div className="guide-doc">
        <p className="guide-kicker">{t("組立説明書")}</p>
        <h1 className="guide-h1">{t(stl ? "3Dプリントで型をつくる" : "段ボールで型をつくる")}</h1>
        <p className="guide-lead">
          {t("型を組み、竹ひごを巻き、和紙を貼って、乾いたら型を抜く。図と数値はいま画面にある設計そのものです。")}
        </p>

        {/* The design's own numbers, so the page is about the mold you are actually holding. */}
        <dl className="guide-spec">
          {[["高さ", `${Math.round(p.height)} mm`], ["最大径", `⌀${Math.round(maxRadius(p) * 2)} mm`],
            // The rib's overall length is its own measurement, not a formula repeated here.
            ["羽根板", `${p.boards} ${t("枚")}`], ["羽根板の全長", `${sizes.rib ? Math.round(sizes.rib[1]) : "—"} mm`],
            [stl ? "板厚" : "段ボール厚", `${p.boardT} mm`]].map(([k, v]) => (
              <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>
            ))}
        </dl>

        <h2 className="guide-h2">{t("部品")}</h2>
        <ul className="guide-parts">
          {parts.map((q) => (
            <li key={q.id} style={card}>
              <div className="guide-fig guide-fig--part">
                {figs[q.id] ? <img src={figs[q.id]} alt="" /> : <span />}
              </div>
              <div className="guide-part-name">
                <strong>{t(q.name)}</strong><span>×{q.n(p)}</span>
              </div>
              <div className="guide-part-dim">{sizes[q.id]?.join(" × ")} mm</div>
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
                      </li>
                    ))}
                  </ul>
                )}
                {s.id === "make" && (
                  <button className="btn btn--ghost" onClick={onGoPrint}>{t("「印刷」ビューへ →")}</button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

