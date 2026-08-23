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
  ribGeometry, komaGeometry, standGeometry, boardGeometry, ringGeometry, maxRadius,
} from "./geometry.js";
import { paperP } from "./papercraft.js";
import { figureImage, disposeFigures } from "./three/figures.js";
import { UI, accent, accentA, mono, useT } from "./ui/theme.js";

const SOCKET_STL = "tomoshibi_socket_base.stl";   // the lamp-holder base, in public/ (see the step)

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
    id: "light", title: "灯りをつける", fig: "light", socket: true,
    body: "下の開口にレセップ(E17/E26)の台座を入れて電球を立てます。台座は下のリンクから。⌀65×5mm の固定寸法なので、設計を変えても形は変わりません。",
  },
];

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
    const ids = [...parts.map((q) => q.id), ...steps.filter((s) => s.fig).map((s) => s.fig)];
    (async () => {
      const out = {};
      for (const id of ids) {
        if (cancelled) return;
        const small = PARTS.some((q) => q.id === id);
        const size = small ? { width: 300, height: 220 } : { width: 620, height: 460 };
        out[id] = figureImage(p, id, { ...size, smooth: !stl });
        setFigs({ ...out });
        await new Promise((r) => setTimeout(r, 0));   // yield, so scrolling stays alive meanwhile
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parts/steps/stl are derived from route
  }, [p, route]);
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

        <h2 className="guide-h2">{t("手順")}</h2>
        <ol className="guide-steps">
          {steps.map((s, i) => (
            <li key={s.id} style={card}>
              {/* No well when the step has nothing to show — an empty box reads as a figure that
                  failed to load, which is exactly what it looks like next to ten that did. */}
              {s.fig && (
                <div className="guide-fig">
                  {figs[s.fig] && <img src={figs[s.fig]} alt="" />}
                  {/* null (not undefined) means the drawing FAILED rather than not having arrived.
                      Saying so beats an empty well: a figure that silently vanishes is a gap nobody
                      reads as a bug — it cost an hour here once. */}
                  {figs[s.fig] === null && <span className="guide-slot">{t("図を描けませんでした")}</span>}
                </div>
              )}
              <div>
                <h3><span className="guide-num" style={{ background: accent }}>{i + 1}</span>{t(s.title)}</h3>
                <p>{t(!stl && s.paperBody ? s.paperBody : s.body)}</p>
                {s.id === "make" && (
                  <button className="btn btn--ghost" onClick={onGoPrint}>{t("「印刷」ビューへ →")}</button>
                )}
                {s.socket && (
                  <p className="guide-dl">
                    <a href={import.meta.env.BASE_URL + SOCKET_STL} download style={{ color: accent, borderColor: accentA(0.4) }}>
                      {t("レセップ台座の STL をダウンロード")}
                    </a>
                    <span style={{ fontFamily: mono }}>{SOCKET_STL}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

