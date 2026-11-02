import { useTranslation } from "react-i18next";

import type { CampaignDoc } from "@/types/campaign";

/** The shared chest's coins: gold, silver and copper always, platinum and electrum when held. */
export function Coins({ treasury }: { treasury: CampaignDoc["treasury"] }) {
  const { t } = useTranslation();
  const coins = (["pp", "gp", "ep", "sp", "cp"] as const).filter(
    (c) => treasury[c] > 0 || c === "gp" || c === "sp" || c === "cp"
  );
  return (
    <div className="f-coins">
      {coins.map((c) => (
        <span key={c} className="f-coin" data-coin={c}>
          <b>{treasury[c]}</b>
          <span className="f-lbl">{t(`equipment.currencyAbbr.${c}`)}</span>
        </span>
      ))}
    </div>
  );
}
