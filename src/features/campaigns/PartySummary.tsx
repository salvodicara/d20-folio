/**
 * PartySummary — the DM tab's whole-party table (owner I-152): every attached hero on
 * one row — AC, max HP, initiative, the three passives, speed, senses and the six
 * saves — with the best value of each comparable column gilded, so "who notices the
 * ambush?" or "who's hardest to hit?" is one glance. The individual sheets stay one
 * tap away on the party cards. Numbers come from the SAME live derivation the party
 * cards use ({@link derivePartyMemberStats}); nothing is copied onto the campaign doc.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/hooks/useLocale";
import { cn, localeDistance } from "@/lib/utils";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import {
  useMemberCharacterDocs,
  type MemberCharacterRef,
} from "@/features/campaigns/useMemberCharacterDocs";
import { derivePartyMemberStats } from "@/features/campaigns/party-stats";
import {
  partySummary,
  type PartySummaryMember,
  type SummaryColumn,
} from "@/features/campaigns/party-summary";

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

export function PartySummary() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const campaign = useCampaignStore((s) => s.campaign);

  const refs = useMemo<MemberCharacterRef[]>(() => {
    if (!campaign) return [];
    return Object.entries(campaign.memberDetails).flatMap(([uid, m]) =>
      m.characterId ? [{ uid, characterId: m.characterId }] : []
    );
  }, [campaign]);
  const docs = useMemberCharacterDocs(refs);

  const members = useMemo<PartySummaryMember[]>(
    () =>
      refs.flatMap(({ uid }) => {
        const state = docs[uid];
        if (state?.status !== "ready") return [];
        const snapshot = campaign?.memberDetails[uid]?.character?.name;
        return [
          {
            uid,
            name: snapshot?.trim() || state.doc.character.name,
            stats: derivePartyMemberStats(state.doc),
          },
        ];
      }),
    [refs, docs, campaign]
  );
  const { rows, best } = useMemo(() => partySummary(members), [members]);
  const loading = refs.length - members.length;

  const cell = (uid: string, column: SummaryColumn, value: string | number) => (
    <td
      className="party-summary-num"
      data-best={best[column].has(uid) || undefined}
      title={best[column].has(uid) ? t("campaignHub.partySummaryBest") : undefined}
    >
      {value}
    </td>
  );

  return (
    <SectionPanel
      sectionId="party-summary"
      title={t("campaignHub.partySummary")}
      count={rows.length || undefined}
      framed
    >
      {refs.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {t("campaignHub.partySummaryEmpty")}
        </p>
      ) : (
        <div className="party-summary-scroll">
          <table className="party-summary">
            <thead>
              <tr>
                <th rowSpan={2} className="party-summary-hero" scope="col">
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
                {(["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map((code) => (
                  <th key={code} scope="col" title={t(`abilities.${code}`)}>
                    {t(`abilities.${code}_short`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ uid, name, stats }) => (
                <tr key={uid}>
                  <th scope="row" className="party-summary-hero">
                    <span className="party-summary-name">{name}</span>
                    <span className="party-summary-level">
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
                    localeDistance(stats.walkingSpeedFt, locale)
                  )}
                  <td className="party-summary-senses">
                    {stats.senses.length === 0
                      ? "—"
                      : stats.senses
                          .map(
                            (s) =>
                              `${t(`character.sense_${s.kind}`)} ${localeDistance(s.rangeFt, locale)}`
                          )
                          .join(", ")}
                  </td>
                  {stats.saves.map((s) => (
                    <td
                      key={s.code}
                      className={cn("party-summary-num", s.proficient && "is-proficient")}
                      title={
                        s.proficient
                          ? t("abilities.saveProficiency")
                          : t(`abilities.${s.code}`)
                      }
                    >
                      {signed(s.bonus)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {loading > 0 && (
            <p className="party-summary-loading">
              {t("campaignHub.partySummaryLoading", { count: loading })}
            </p>
          )}
        </div>
      )}
    </SectionPanel>
  );
}
