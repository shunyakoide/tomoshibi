/**
 * Part of the finished LANTERN rather than of the mold, which is why it is not in 骨組み. The hoop
 * is sized from the opening and has nothing to set; the bottom one's leg sockets do.
 */
import { Checkbox, SectionLabel } from "../controls.tsx";
import { useT } from "../theme.ts";

export default function RingSection({ legSockets, onToggle, legsFit }: {
  legSockets: boolean; onToggle: () => void; legsFit: boolean;
}) {
  const t = useT();
  return (
    <div className="mb-20">
      <SectionLabel title="開口リング" hint="完成品に残る輪" />
      <Checkbox checked={legSockets} label="脚ソケット(下)" onToggle={onToggle} />
      {/* Said here, not on the part: a socket that silently is not there is one you find out about
          with the print in your hand. */}
      {legSockets && !legsFit && (
        <div className="text-sm leading-[1.5] text-faint pt-2 pb-4">
          {t("この開口には脚ソケットが入りません(下の輪のみになります)。開口を広げると入ります")}
        </div>
      )}
    </div>
  );
}
