/**
 * «Il gruppo a colpo d'occhio» on the new Gruppo tab, for the DM (the classic DM tab's
 * party summary; Foundry's party sheet lists its members the same way): AC, max HP,
 * initiative, the three passives, speed, senses and the six saves for every hero.
 * A wide screen shows one table that fills the panel; a phone shows one card per hero
 * with every number labelled (D&D Beyond's campaign page on mobile), never a table cut
 * at the edge. The best of each comparable column is gold, said in words, and a plain
 * legend says what gold means; a proficient save carries a dot and says so. Numbers
 * come from the shared live derivation (`partySummaryView`).
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { PartySummaryView } from "@/domains/campaign/party-summary-view";
import type { PartyMemberStats } from "@/features/campaigns/party-stats";
import type { SummaryColumn } from "@/features/campaigns/party-summary";
import type { Locale } from "@/lib/locale";
import { formatModifier, localeDistance } from "@/lib/utils";

const SAVES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
/** A number and its unit never part («18 m»). */
const NBSP = "\u00a0";
const nbsp = (text: string): string => text.replace(/ /g, NBSP);

export function PartyTable({ view, locale }: { view: PartySummaryView; locale: Locale }) {
  const { t } = useTranslation();
  const { rows, best, loading } = view;
  const isBest = (uid: string, column: SummaryColumn) => best[column].has(uid);
  const anyBest = rows.some(({ uid }) =>
    (Object.keys(best) as SummaryColumn[]).some((c) => isBest(uid, c))
  );
  // The value as shown: gold and said in words when it is the party's best.
  const value = (uid: string, column: SummaryColumn, text: ReactNode) =>
    isBest(uid, column) ? (
      <>
        <b>{text}</b>
        <span className="f-sr">{t("campaignHub.partySummaryBest")}</span>
      </>
    ) : (
      text
    );
  const cell = (uid: string, column: SummaryColumn, text: ReactNode) => (
    <td data-best={isBest(uid, column) || undefined}>{value(uid, column, text)}</td>
  );
  const senses = (stats: PartyMemberStats) =>
    stats.senses.length === 0
      ? "—"
      : stats.senses
          .map(
            (s) =>
              `${t(`character.sense_${s.kind}`)}${NBSP}${nbsp(localeDistance(s.rangeFt, locale))}`
          )
          .join(", ");
  const speed = (stats: PartyMemberStats) =>
    nbsp(localeDistance(stats.walkingSpeedFt, locale));
  const saves = (stats: PartyMemberStats, Tag: "td" | "span") =>
    stats.saves.map((s) => (
      <Tag key={s.code} data-prof={s.proficient || undefined}>
        {Tag === "span" && <i>{t(`abilities.${s.code}_short`)}</i>}
        {formatModifier(s.bonus)}
        {s.proficient && <span className="f-sr">{t("abilities.saveProficiency")}</span>}
      </Tag>
    ));
  // The labelled numbers of a phone card, in the table's order.
  const facts = (stats: PartyMemberStats) =>
    [
      ["ac", t("character.vitals.ac"), stats.ac],
      ["maxHp", t("character.health.hpAbbr"), stats.maxHp],
      [
        "initiativeBonus",
        t("character.vitals.init"),
        formatModifier(stats.initiativeBonus),
      ],
      ["passivePerception", t("skills.perception"), stats.passivePerception],
      ["passiveInsight", t("skills.insight"), stats.passiveInsight],
      ["passiveInvestigation", t("skills.investigation"), stats.passiveInvestigation],
      ["walkingSpeedFt", t("character.vitals.spd"), speed(stats)],
    ] as const satisfies ReadonlyArray<readonly [SummaryColumn, string, ReactNode]>;

  return (
    <div className="f-ptable-wrap">
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
              {cell(uid, "initiativeBonus", formatModifier(stats.initiativeBonus))}
              {cell(uid, "passivePerception", stats.passivePerception)}
              {cell(uid, "passiveInsight", stats.passiveInsight)}
              {cell(uid, "passiveInvestigation", stats.passiveInvestigation)}
              {cell(uid, "walkingSpeedFt", speed(stats))}
              <td className="f-ptable-senses">{senses(stats)}</td>
              {saves(stats, "td")}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="f-pcards" aria-label={t("campaignHub.partySummary")}>
        {rows.map(({ uid, name, stats }) => (
          <li key={uid} className="f-pcard" aria-label={name}>
            <div className="f-pcard-head">
              <span className="f-ptable-name">{name}</span>
              <span className="f-ptable-lvl">
                {t("spells.levelShort", { level: stats.level })}
              </span>
            </div>
            <dl className="f-pcard-grid">
              {facts(stats).map(([column, label, text]) => (
                <div key={column} data-best={isBest(uid, column) || undefined}>
                  <dt>{label}</dt>
                  <dd>{value(uid, column, text)}</dd>
                </div>
              ))}
            </dl>
            <div className="f-pcard-line">
              <span className="f-lbl">{t("character.hud.senses")}</span>
              <span>{senses(stats)}</span>
            </div>
            <div className="f-pcard-line">
              <span className="f-lbl">{t("character.savingThrows")}</span>
              <span className="f-pcard-saves">{saves(stats, "span")}</span>
            </div>
          </li>
        ))}
      </ul>
      {anyBest && (
        <p className="f-quiet f-ptable-legend">{t("campaignHub.partySummaryLegend")}</p>
      )}
      {loading > 0 && (
        <p className="f-quiet">
          {t("campaignHub.partySummaryLoading", { count: loading })}
        </p>
      )}
    </div>
  );
}
