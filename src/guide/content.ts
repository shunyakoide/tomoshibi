/**
 * **This file may not learn a dimension.** The page is generic — one fixed design draws every figure
 * and no measurement is printed anywhere — and the guard that keeps it that way is right here in the
 * types: `body` and friends are plain strings, and `needs` is the ONLY function of `Design` allowed
 * in this file. `needs` returns a **boolean**, so it can drop a way the design cannot offer and can
 * never produce a number to print. Adding a `(p: Design) => string` here is how the page starts
 * making claims about a mold it has not seen. The one interpolation the page performs — 「{n}通り」 —
 * is counted at the render site from the ways actually offered, not stored here.
 */
import { ringLegs } from "../geometry.ts";
import type { Design } from "../types.ts";

/** One entry in the parts list. `n` is printed only where it is a CONSTANT (see the note below);
 *  `stl` marks a part the cardboard route never makes. */
export type PartRow = { id: string; name: string; n?: number; note?: string; stl?: boolean };
/** One numbered sub-step inside a way of lighting it — sequential, unlike the ways around it. */
export type SubStep = { id: string; fig: string; title: string; body: string };
/** One WAY of doing a step: alternatives, not sub-steps. `needs` drops a way this design cannot
 *  offer, `note` is the footnote at its foot. */
export type Way = {
  id: string; fig: string; title: string; body: string; paperBody?: string;
  needs?: (p: Design) => boolean; note?: string; detail?: SubStep[];
};
/** One step of the build. `wip` is both the draft badge and the one line saying why. */
export type Step = {
  id: string; title: string; body: string; paperBody?: string; fig?: string; stl?: boolean;
  wip?: string; options?: Way[];
};
/** One thing you supply yourself. `paper` overrides the fields the cardboard route reads
 *  differently — the wire is optional on the 3D route and not on the one that bends its own hoops. */
export type KitItem = { name: string; fig?: string; note?: string; opt?: boolean; paper?: { note?: string; opt?: boolean } };
export type KitGroup = { id: string; title: string; items: KitItem[] };

// The parts the mold is made of. `n` is either a CONSTANT or it is not printed at all: two koma, two
// posts, one base and one ring at each end are facts about the mold, while how many ribs it takes is
// the reader's own decision — so that one says so in words rather than naming a number this page
// cannot know. The cardboard route makes no stand; it DOES make both rings, bent from wire against
// the lines its template draws (`wirePart` in src/paper/mold.ts), which is why those two rows are
// not `stl` even though only one route prints them.
export const PARTS: PartRow[] = [
  { id: "rib", name: "羽根板", note: "設計した枚数" },
  { id: "koma", name: "コマ", n: 2 },
  { id: "column", name: "支柱", n: 2, stl: true },
  { id: "base", name: "土台", n: 1, stl: true },
  { id: "ringBottom", name: "口輪(下)", n: 1 },
  { id: "ringTop", name: "口輪(上)", n: 1 },
];

// The build, in order. `fig` names a scene in three/figures.ts; bodies are i18n keys like every
// other string.
export const STEPS: Step[] = [
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
    // Both routes, since both end up with a hoop at each opening — one printed, one bent from wire on
    // the line the template draws. The step is the same step; only where the hoop COMES FROM differs,
    // which is what `paperBody` is for.
    id: "rings", title: "口輪をはめる", fig: "rings",
    paperBody: "型紙の青い線の上で針金を曲げ、上下2つの口輪をつくります。線は開口に合わせてあるので、曲げた輪は羽根板の外側にすっと入ります。両端は少し重ねてねじってください。口輪も組んだ型も、まだ何にも留まっていません。輪ゴムやクリップで押さえてください(コマのすぐ外側に輪ゴムを1本ずつ巻くと羽根板の開きも揃います)。和紙は端の被せ代をこの口輪に折り返して貼るため、口輪は型を抜いたあとも提灯に残ります。上下は別々の線なので、曲げたらどちらか分かるようにしておいてください。",
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
    // Nothing carries `wip` now, but **keep the mechanism for the next unsettled step**, and keep
    // that wording clear of 「口輪」: the cardboard route prints no rings, and a step must not name a
    // part its own route never makes.
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
        paperBody: "段ボールの型では下の口輪の線に、脚を通す輪っかが3ヶ所入っています。針金で曲げてあれば、脚の先はそこへ通して折り返すだけです。あとは同じで、脚と枠を付けたライトを下の開口から差し入れて立て、コードは脚のあいだから逃がします。",
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
 * things the design decides, and a note says WHEN you need the thing, not what to ask for.
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
export const KIT: KitGroup[] = [
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
    // Optional on the 3D route, where the rings are printed and wire serves only two of the lighting
    // ways. On cardboard the hoops themselves are wire, so it is as unconditional as the bamboo.
    { name: "ワイヤー", fig: "kitWire", opt: true, note: "脚を付けるか吊るす場合",
      paper: { opt: false, note: "口輪に。脚や吊り線にも" } },
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
export const KIT_FIGS = KIT.flatMap((g) => g.items.map((i) => i.fig).filter((f): f is string => !!f));
