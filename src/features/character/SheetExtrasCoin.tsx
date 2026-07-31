/**
 * SheetExtrasCoin — the ⋯ document-extras coin shared by the fob family
 * (BinderFob on desktop, MobileSignet on mobile): the labeled overflow
 * (History · Share link · Export JSON · Export PDF) + its `SnapshotsHistory`
 * dialog host + the export/share wiring, in ONE place so the two management homes
 * can't drift (golden rule 3 — a fix here flows to both).
 *
 * SHARING is deliberately menu-only, with no dialog to walk through: "Share link"
 * turns sharing on if it is off and goes straight to the native share sheet (or the
 * clipboard), so handing a friend the sheet is ONE tap (golden rule 20). The
 * sharing STATE is the menu itself — "Stop sharing" appears only while the link is
 * live, and it is the item that carries the confirm explaining who can see what.
 *
 * On fine pointers (the fob) it wears the branded quiet `HoverTip`; on coarse
 * pointers (the Signet) `tooltip` is omitted and the trigger renders bare.
 */

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  History,
  Download,
  FileDown,
  MoreHorizontal,
  Share2,
  Link2Off,
} from "lucide-react";
import { CardOverflowMenu } from "@/components/shared/CardOverflowMenu";
import { SnapshotsHistory } from "./SnapshotsHistory";
import { useSheetExport } from "./center/use-sheet-export";
import { useShareCharacter } from "./use-share-character";
import { HoverTip } from "./center/HoverTip";

export function SheetExtrasCoin({
  triggerClassName,
  tooltip,
}: {
  /** The coin material class (the fob family passes `fob-coin`). */
  triggerClassName: string;
  /** Fine-pointer branded tooltip content; omit on coarse pointers. */
  tooltip?: ReactNode;
}) {
  const { t } = useTranslation();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { exportPdf, exportJson } = useSheetExport();
  const { shared, share, revoke } = useShareCharacter();
  const menu = (
    <CardOverflowMenu
      open={overflowOpen}
      onOpenChange={setOverflowOpen}
      triggerClassName={triggerClassName}
      triggerIcon={MoreHorizontal}
      triggerLabel={t("roster.moreActions")}
      menuLabel={t("roster.moreActions")}
      items={[
        {
          key: "history",
          label: t("snapshots.button"),
          icon: History,
          onSelect: () => setHistoryOpen(true),
        },
        {
          key: "export-json",
          label: t("roster.exportJson"),
          icon: Download,
          onSelect: () => void exportJson(),
        },
        {
          key: "export-pdf",
          label: t("roster.exportPdf"),
          icon: FileDown,
          onSelect: () => void exportPdf(),
        },
        {
          key: "share",
          label: t("share.action"),
          icon: Share2,
          dividerBefore: true,
          onSelect: () => void share(),
        },
        {
          // Present ONLY while the link is live — its presence IS the "this
          // character is public right now" signal.
          key: "stop-sharing",
          label: t("share.stopSharing"),
          icon: Link2Off,
          hidden: !shared,
          onSelect: () => void revoke(),
        },
      ]}
    />
  );
  return (
    <>
      {tooltip != null ? (
        <HoverTip side="left" show={!overflowOpen} content={tooltip}>
          <span className="inline-flex">{menu}</span>
        </HoverTip>
      ) : (
        menu
      )}
      <SnapshotsHistory open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );
}
