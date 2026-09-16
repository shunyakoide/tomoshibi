/**
 * The boxed notes every sheet of every template carries — 「注意」 in the document's own corner,
 * under the full-scale check square.
 *
 * **They belong to the KIT, not to a part, which is why they live here and not on a `RawPart`.** They
 * started as one line inside the part each was about, and two things pushed them out. Inside the part
 * there was no room: on the design the app opens with, the koma's line hung 1.3mm past its own cut
 * line in Japanese and 15.4mm past it in English, because the room a line has inside a disc is the
 * chord at its height, not the box the packer used. And then they stopped being about one part —
 * 「両方のシートに全部載せる」 — since the person cutting the mold is the person who will cut the
 * washi, and the sheet in their hand should not decide which cautions they get to read.
 *
 * So both documents print all of them, in the order the parts are cut in, with the part's name in
 * front of each line. `render.ts` is the one place that hands them to `layout`, so neither template
 * can grow a set of its own.
 *
 * **Every line is short because the box is 86mm wide** — the check square's own width, which is what
 * keeps the corner from needing a gap so wide it stops fitting in one (`corner`, layout.ts). The
 * longest here is 69mm. `check:paper` holds the box to the column and each line to the box.
 */
import type { T } from "../i18n.ts";

/**
 * In the order the parts are cut in (koma, hoops, washi), which is the order the sheets lay them out.
 * The first three are the cardboard mold's, the last the paper skin's, and both templates carry all
 * four: the washi one is printed on the mold's sheet because the maker reads it before they cut
 * anything, and the koma's on the washi sheet because that is the sheet still on the table.
 */
export function adviceLines(t: T): string[] {
  return [
    // **The width drawn is not the width to cut.** `paperP` draws the notch at 2/3 of the measured
    // thickness because board crushes and a knife widens what it cuts (see `JOINT_NOTCH`), and that
    // fraction came from ONE build on 3mm board. So the sheet says what the line is worth rather than
    // asking for it to be followed: 「段ボールの厚さに合わせて切って。あくまでも参考にしてって」.
    // Saying "cut on the line" instead would be the app claiming to know the maker's board and blade.
    `${t("コマ")}: ${t("切り込みの幅は目安。段ボールの厚さに合わせて切る")}`,
    // The koma is the one part of a cardboard mold that can simply be doubled: a rib glued to a rib
    // no longer fits a notch whose width IS the material thickness.
    `${t("コマ")}: ${t("強度が要るなら2枚以上重ねる")}`,
    // Not because a bent hoop came out wrong — on the first build it did not — but because the mold's
    // size is the maker's cutting: 「ダンボールをどれだけ上手く切れるかによる」. Wire is the one part
    // here that answers to that by hand. One line for both mouths, labelled with the bare 「口輪」.
    `${t("口輪")}: ${t("組んだ型に当てて調整")}`,
    // The panel is computed from the DESIGN and the mold in the maker's hands is a hand-cut board, so
    // the two can differ. Offered up first, that difference is a pencil line; found after the washi is
    // cut, it is a sheet of washi. It names BOTH objects — the template and the assembled mold —
    // because this line is read on the sheet that is neither.
    `${t("和紙")}: ${t("切る前に型紙を組んだ型に当てて寸法を確認")}`,
  ];
}
