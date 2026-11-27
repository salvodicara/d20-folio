/**
 * «Il gruppo a colpo d'occhio» on the new Gruppo tab, for the DM (the classic DM tab's
 * party summary; Foundry's party sheet lists its members the same way): one row per
 * hero with AC, max HP, initiative, the three passives, speed, senses and the six saves.
 * The best of each comparable column is gold and says so in words; a proficient save
 * carries a dot and says so. On a phone the hero column stays and the numbers scroll
 * sideways. Numbers come from the shared live derivation (`partySummaryView`).
 */
import { useTranslation } from "react-i18next";

import type { PartySummaryView } from "@/domains/campaign/party-summary-view";
import type { SummaryColumn } from "@/features/campaigns/party-summary";
import type { Locale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";

const SAVES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
/** A number and its unit never part («18 m»). */
const nbsp = (text: string): string => text.replace(/ /g, "\u00a0");
const signed = (n: number): string => (n >= 0 ? `+${String(n)}` : String(n));

export function PartyTable({ view, locale }: { view: PartySummaryView; locale: Locale }) {
  const { t } = useTranslation();
  const { rows, best, loading } = view;
  const cell = (uid: string, column: SummaryColumn, value: string | number) =>
    best[column].has(uid) ? (
      <td data-best="">
        <b>{value}</b>
        <span className="f-sr">{t("campaignHub.partySummaryBest")}</span>
      </td>
    ) : (
      <td>{value}</td>
    );
  return (
    <div
      className="f-ptable-scroll"
      // a region that scrolls sideways must be reachable by keyboard
      tabIndex={0}
      role="region"
      aria-label={t("campaignHub.partySummary")}
    >
      <table className="f-ptable" aria-label={t("campaignHub.partySummary")}>
        <thead>
          <tr>
            <th rowSpan={2} scope="col" className="f-ptable-hero">
              {t("campaignHub.partySummaryHero")}
            </th>
            <th rowSpan={2} scope="col" title={t("character.vitals.acFull")}>
              {t("character.vitals.ac")}
            </th>
            <th rowSpan={2} scope="col" title={t("abilities.hpMaxLabel")}>
              {t("character.health.hpAbbr")}
            </th>
            <th rowSpan={2} scope="col" title={t("abilities.initBonusLabel")}>
              {t("character.vitals.init")}
            </th>
            <th colSpan={3} scope="colgroup">
              {t("character.hud.passives")}
            </th>
            <th rowSpan={2} scope="col" title={t("character.vitals.speed")}>
              {t("character.vitals.spd")}
            </th>
            <th rowSpan={2} scope="col">
              {t("character.hud.senses")}
            </th>
            <th colSpan={6} scope="colgroup">
              {t("character.savingThrows")}
            </th>
          </tr>
          <tr>
            <th scope="col">{t("skills.perception")}</th>
            <th scope="col">{t("skills.insight")}</th>
            <th scope="col">{t("skills.investigation")}</th>
            {SAVES.map((code) => (
              <th key={code} scope="col" title={t(`abilities.${code}`)}>
                {t(`abilities.${code}_short`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ uid, name, stats }) => (
            <tr key={uid}>
              <th scope="row" className="f-ptable-hero">
                <span className="f-ptable-name">{name}</span>
                <span className="f-ptable-lvl">
                  {t("spells.levelShort", { level: stats.level })}
                </span>
              </th>
              {cell(uid, "ac", stats.ac)}
              {cell(uid, "maxHp", stats.maxHp)}
              {cell(uid, "initiativeBonus", signed(stats.initiativeBonus))}
              {cell(uid, "passivePerception", stats.passivePerception)}
              {cell(uid, "passiveInsight", stats.passiveInsight)}
              {cell(uid, "passiveInvestigation", stats.passiveInvestigation)}
              {cell(
                uid,
                "walkingSpeedFt",
                nbsp(localeDistance(stats.walkingSpeedFt, locale))
              )}
              <td className="f-ptable-senses">
                {stats.senses.length === 0
                  ? "—"
                  : stats.senses
                      .map(
                        (s) =>
                          `${t(`character.sense_${s.kind}`)}\u00a0${nbsp(localeDistance(s.rangeFt, locale))}`
                      )
                      .join(", ")}
              </td>
              {stats.saves.map((s) => (
                <td key={s.code} data-prof={s.proficient || undefined}>
                  {signed(s.bonus)}
                  {s.proficient && (
                    <span className="f-sr">{t("abilities.saveProficiency")}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {loading > 0 && (
        <p className="f-quiet">
          {t("campaignHub.partySummaryLoading", { count: loading })}
        </p>
      )}
    </div>
  );
}
