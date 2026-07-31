/**
 * SheetExtrasCoin — the ⋯ document-extras coin shared by the fob family
 * (BinderFob on desktop, MobileSignet on mobile): the labeled overflow
 * (History · Export JSON · Export PDF · Share) + its `SnapshotsHistory`
 * dialog host + the export/share wiring, in ONE place so the two management homes
 * can't drift (golden rule 3 — a fix here flows to both).
 *
 * SHARING is ONE menu entry — "Share" — which opens the shared {@link SharePopover}
 * hung off this very coin: a visibility switch ("Anyone with the link can view") that
 * IS share-and-revoke, and, while it is on, the link with Copy and the native share
 * sheet. No confirm and no second menu item: the switch shows the state, flipping it
 * changes the state, and the same gesture undoes it (the Docs / Notion shape).
 *
 * On fine pointers (the fob) it wears the branded quiet `HoverTip`; on coarse
 * pointers (the Signet) `tooltip` is omitted and the trigger renders bare.
 */

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { History, Download, FileDown, MoreHorizontal, Share2 } from "lucide-react";
import { CardOverflowMenu } from "@/components/shared/CardOverflowMenu";
import { SharePopover } from "@/components/shared/SharePopover";
import { SnapshotsHistory } from "./SnapshotsHistory";
import { useCharacterStore } from "@/stores/characterStore";
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
  const [shareOpen, setShareOpen] = useState(false);
  const { exportPdf, exportJson } = useSheetExport();
  const { shared, link, setShared } = useShareCharacter();
  const name = useCharacterStore((s) => s.character?.character.name) ?? "";
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
          label: t("common.share"),
          icon: Share2,
          dividerBefore: true,
          // The menu closes and the popover opens off the same coin, so the share
          // decision lands where the tap did.
          onSelect: () => setShareOpen(true),
        },
      ]}
    />
  );
  const anchored = (
    <SharePopover
      open={shareOpen}
      onOpenChange={setShareOpen}
      link={link}
      rubric={t("common.share")}
      copyLabel={t("share.copyLink")}
      copiedToast={t("share.linkCopied")}
      shareLabel={t("common.share")}
      shareTitle={t("share.shareTitle", { name })}
      shareText={t("share.shareText", { name })}
      visibility={{
        label: t("share.visibility"),
        hint: t("share.visibilityHint"),
        on: shared,
        onChange: setShared,
      }}
    >
      {menu}
    </SharePopover>
  );
  return (
    <>
      {tooltip != null ? (
        <HoverTip side="left" show={!overflowOpen && !shareOpen} content={tooltip}>
          <span className="inline-flex">{anchored}</span>
        </HoverTip>
      ) : (
        anchored
      )}
      <SnapshotsHistory open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );
}
