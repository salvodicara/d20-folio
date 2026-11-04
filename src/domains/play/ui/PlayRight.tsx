/**
 * The Play screen's right column (approved prototype x-play): «Iniziativa» while the
 * character's campaign fights (the same list as the campaign's Scontro), and «Resoconto»,
 * the campaign's latest evening as the Diario tells it (blocks, times, signed notes),
 * with «Copia il resoconto». A character attached to no campaign shows neither.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { usePartyNames } from "@/domains/campaign/ui/use-party";
import { diaryBlocks } from "@/domains/chronicle/diary-view";
import { ReportBlocks } from "@/domains/chronicle/ui/ReportBlocks";
import { useReportNames } from "@/domains/chronicle/ui/report-names";
import { fightRows } from "@/domains/combat/fight-rows-view";
import { fightControls } from "@/domains/combat/fight-controls";
import { moves, useFightMove } from "@/domains/combat/ui/fight-moves";
import { playInitiativeRows } from "@/domains/play/play-initiative-view";
import { playZonesView } from "@/domains/play/play-zones-view";
import { useSessionReports } from "@/features/campaigns/useSessionReports";
import { useSheetCombat } from "@/features/character/center/turn-state";
import { foldCombatEffectOps } from "@/lib/combat-effects";
import type { Locale } from "@/lib/locale";
import { buildReport, foldSession } from "@/lib/session-log";
import { renderSessionReport } from "@/lib/views/session-report-view";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import type { CampaignDoc } from "@/types/campaign";
import { Button, Icon, initialOf, Panel } from "@/ui";
import type { HpBandValue } from "@/lib/hp-band";

export function PlayRight({
  campaign,
  locale,
  onToast,
}: {
  campaign: CampaignDoc | null;
  locale: Locale;
  onToast: (message: string) => void;
}) {
  return (
    <div className="f-stack f-right">
      <Initiative campaign={campaign} locale={locale} />
      {campaign && <Report campaign={campaign} locale={locale} onToast={onToast} />}
    </div>
  );
}

function Initiative({
  campaign,
  locale,
}: {
  campaign: CampaignDoc | null;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const fight = useSheetCombat();
  const uid = useAuthStore((st) => st.user?.uid) ?? "";
  // The time only feeds the "end the fight?" suggestion, which Play doesn't show.
  const [now] = useState(Date.now);
  const move = useFightMove((message, undo) =>
    useToastStore
      .getState()
      .showToast({ message, duration: 5000, ...(undo ? { onUndo: undo } : {}) })
  );
  if (!fight) return null;
  const isDm = campaign?.dmUid === uid;
  // The combat lifecycle (owner, #505): anyone at the table steps a turn back and
  // ends the fight, each with its undo; the same rule as the campaign's Scontro.
  const controls = fightControls(
    fight.encounter,
    null,
    {
      uid,
      isDm,
      hasCharacter: true,
      rolled: fight.initiativeRoll !== null,
      missing: 0,
    },
    now
  );
  const current = fight.encounter.currentCombatantId;
  const rows = playInitiativeRows(
    fightRows(fight.view.rows, fight.view.currentId, {}, locale),
    fight.myId
  );
  const portraitOf = (id: string) => {
    const uid = fight.view.rows.find((r) => r.id === id)?.memberUid;
    return uid ? campaign?.memberDetails[uid]?.character?.portraitUrl : undefined;
  };
  // Every area on the field, whoever cast it (not only those on this character).
  const zones = playZonesView(
    foldCombatEffectOps(fight.encounter.effectOps, {
      round: fight.encounter.round,
      currentCombatantId: fight.encounter.currentCombatantId,
      phase: "turn-start",
      order: fight.encounter.order ?? fight.view.turnOrderIds,
    }),
    fight.view.rows,
    locale
  );
  const bandLabel = (band: HpBandValue) =>
    band === "down"
      ? t("fight.down")
      : band === "bloodied"
        ? t("character.health.bloodied")
        : t(`campaignHub.hpBand.${band}`);
  return (
    <Panel color="ini" title={t("fight.listTitle", { round: fight.round })}>
      {rows.map((row) => {
        const portrait = row.kind === "pc" ? portraitOf(row.ids[0] ?? "") : undefined;
        return (
          <div
            key={row.key}
            className="f-ir"
            data-current={row.current || undefined}
            data-next={row.next || undefined}
          >
            <span className="f-ir-i">{row.initiative ?? ""}</span>
            <span className="f-ir-tok" aria-hidden="true">
              {portrait ? (
                <img src={portrait} alt="" />
              ) : row.kind === "monster" ? (
                <Icon name="g-combat" />
              ) : (
                initialOf(row.name)
              )}
            </span>
            <span className="f-ir-n">
              <span className="f-ir-name">
                {row.name}
                {row.mine && `\u00a0${t("play.initiativeYou")}`}
              </span>
              {row.count > 1 && <span className="f-ir-x">{`×${String(row.count)}`}</span>}
              {row.current && <span className="f-ir-now">{t("fight.now")}</span>}
              {/* inside the name's flow: a crowded row wraps «ORA» and this, never the name */}
              <span className="f-ir-s">
                {row.mustRoll
                  ? t("fight.mustRoll")
                  : row.state.kind === "hp"
                    ? `${String(row.state.current)}/${String(row.state.max)}`
                    : bandLabel(row.state.band)}
              </span>
            </span>
          </div>
        );
      })}
      {zones.zones.length > 0 && (
        <section className="f-zones" aria-label={t("play.zones.title")}>
          <h3 className="f-lbl">{t("play.zones.title")}</h3>
          {zones.light && (
            <p className="f-help">
              {t("play.zones.lightIs", { light: t(`play.zones.light.${zones.light}`) })}
            </p>
          )}
          {zones.zones.map((zone) => (
            <div key={zone.id} className="f-zone">
              <span className="f-row-t">{zone.name}</span>
              <span className="f-row-s">
                {[
                  zone.caster ? t("play.zones.by", { name: zone.caster }) : null,
                  zone.triggers.length > 0
                    ? t("play.zones.bites", {
                        when: zone.triggers
                          .map((when) => t(`play.zones.when.${when}`))
                          .join(t("play.zones.or")),
                      })
                    : null,
                  zone.spared.length > 0
                    ? t("play.zones.spares", { names: zone.spared.join(", ") })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          ))}
        </section>
      )}
      {(controls.back || controls.end) && (
        <div className="f-ir-acts">
          {controls.back && (
            <Button
              kind="quiet"
              icon="u-back"
              onClick={() =>
                move(
                  moves.back(fight.campaignId, uid, isDm, current),
                  t("fight.backDone")
                )
              }
            >
              {t("fight.back")}
            </Button>
          )}
          {controls.end && (
            <Button
              wide
              onClick={() => move(moves.end(fight.campaignId), t("fight.endDone"))}
            >
              {t("fight.end")}
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}

function Report({
  campaign,
  locale,
  onToast,
}: {
  campaign: CampaignDoc;
  locale: Locale;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const reports = useSessionReports(campaign.id);
  const names = useReportNames(campaign, locale, usePartyNames(campaign));
  const latest = reports.logs[0];
  const sections = useMemo(
    () =>
      latest ? buildReport(foldSession(latest.items, { dmUid: campaign.dmUid })) : [],
    [latest, campaign.dmUid]
  );
  const blocks = useMemo(() => diaryBlocks(sections), [sections]);
  const players = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(campaign.memberDetails).map(([uid, m]) => [uid, m.displayName])
      ),
    [campaign.memberDetails]
  );
  if (blocks.length === 0) return null;
  const copy = () => {
    const text = renderSessionReport(sections, campaign.name, t, names, {
      notes: latest?.notes,
    });
    void navigator.clipboard
      .writeText(text)
      .then(() => onToast(t("sessionReport.copied")));
  };
  return (
    <Panel
      color="log"
      title={t("play.report")}
      foot={
        <Button kind="quiet" icon="u-copy" onClick={copy}>
          {t("diary.copyReport")}
        </Button>
      }
    >
      <ReportBlocks blocks={blocks} names={names} players={players} locale={locale} />
    </Panel>
  );
}
