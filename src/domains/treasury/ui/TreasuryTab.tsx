/**
 * The campaign's Tesoro tab (approved prototype camp-treasure): the shared chest's coins
 * and «Chi ha preso cosa», every movement newest first. Read side: putting in, taking out
 * and the loot split arrive with their engine seams.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { treasuryHistory } from "@/domains/treasury/treasury-history-view";
import { Coins } from "@/domains/treasury/ui/Coins";
import { intlTag, type Locale } from "@/lib/locale";
import type { CampaignDoc } from "@/types/campaign";
import { Panel } from "@/ui";

export function TreasuryTab({
  campaign,
  locale,
}: {
  campaign: CampaignDoc;
  locale: Locale;
}) {
  const { t } = useTranslation();
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
      <Panel color="tes" title={t("campaignScreen.chest")}>
        <Coins treasury={campaign.treasury} />
      </Panel>
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
