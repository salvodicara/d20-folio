/**
 * SheetExtrasCoin — the ⋯ document-extras coin shared by the fob family
 * (BinderFob on desktop, MobileSignet on mobile): the labeled overflow
 * (History · Export JSON · Export PDF) + its `SnapshotsHistory` dialog host + the
 * export wiring, in ONE place so the two management homes can't drift (golden
 * rule 3 — a fix here flows to both).
 *
 * On fine pointers (the fob) it wears the branded quiet `HoverTip`; on coarse
 * pointers (the Signet) `tooltip` is omitted and the trigger renders bare.
 */

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { History, Download, FileDown, MoreHorizontal } from "lucide-react";
import { CardOverflowMenu } from "@/components/shared/CardOverflowMenu";
import { SnapshotsHistory } from "./SnapshotsHistory";
import { useSheetExport } from "./center/use-sheet-export";
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
