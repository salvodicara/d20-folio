/**
 * The campaign's Tesoro tab (approved prototype camp-treasure): the shared chest's coins
 * (any member puts coins in or takes them out, with an undo) and «Chi ha preso cosa»,
 * every movement newest first. The loot split and chest items arrive with their engine
 * seams.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { treasuryHistory } from "@/domains/treasury/treasury-history-view";
import { CoinDialog } from "@/domains/treasury/ui/CoinDialog";
import { Coins } from "@/domains/treasury/ui/Coins";
import { useAuthStore } from "@/stores/authStore";
import { intlTag, type Locale } from "@/lib/locale";
import type { CampaignDoc } from "@/types/campaign";
import { Button, Panel } from "@/ui";

export function TreasuryTab({
  campaign,
  locale,
  onToast,
}: {
  campaign: CampaignDoc;
  locale: Locale;
  onToast: (message: string, undo?: () => void) => void;
}) {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const [moving, setMoving] = useState<"in" | "out" | null>(null);
  const players = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(campaign.memberDetails).map(([uid, m]) => [uid, m.displayName])
      ),
    [campaign.memberDetails]
  );
  const lines = treasuryHistory(campaign.treasuryLog, players);
  const day = (d: Date) =>
    d.toLocaleDateString(intlTag(locale), { day: "numeric", month: "long" });
  return (
    <div className="f-split">
      <Panel
        color="tes"
        title={t("campaignScreen.chest")}
        foot={
          uid && (
            <>
              <Button icon="u-add" onClick={() => setMoving("in")}>
                {t("treasury.put")}
              </Button>
              <Button icon="u-download" onClick={() => setMoving("out")}>
                {t("treasury.take")}
              </Button>
            </>
          )
        }
      >
        <Coins treasury={campaign.treasury} />
      </Panel>
      {moving && uid && (
        <CoinDialog
          campaign={campaign}
          uid={uid}
          mode={moving}
          onClose={() => setMoving(null)}
          onDone={onToast}
        />
      )}
      <Panel color="log" title={t("treasury.historyTitle")}>
        {lines.length === 0 && <p className="f-quiet">{t("treasury.historyEmpty")}</p>}
        {lines.map((line, i) => {
          const amount =
            String(line.amount) + "\u00a0" + t(`equipment.currencyAbbr.${line.currency}`);
          const what = line.who
            ? t(line.direction === "in" ? "treasury.putIn" : "treasury.tookOut", {
                who: line.who,
                amount,
              })
            : t(line.direction === "in" ? "treasury.cameIn" : "treasury.wentOut", {
                amount,
              });
          return (
            <p key={`${line.at.getTime()}-${i}`} className="f-tl">
              <span>
                {[day(line.at), what].join(" · ")}
                {line.note && <span className="f-tl-by">{`: ${line.note}`}</span>}
              </span>
            </p>
          );
        })}
      </Panel>
    </div>
  );
}
