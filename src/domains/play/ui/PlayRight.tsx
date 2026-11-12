/**
 * The Play screen's right column (approved prototype x-play): «Iniziativa» while the
 * character fights (the campaign's list, as the campaign's Scontro shows it; or, in a
 * fight of its own, the round and its turn), and «Resoconto»: the campaign's latest
 * evening as the Diario tells it, or, for a character in no campaign, its own sheet log,
 * through the same report builder, with «Copia il resoconto». The column is always
 * there, as D&D Beyond's sheet and BG3's HUD never drop a column by state (coordinator,
 * 2026-11-12); with no fight and nothing logged yet it stays empty, as in a campaign.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { usePartyNames } from "@/domains/campaign/ui/use-party";
import { diaryBlocks } from "@/domains/chronicle/diary-view";
import { ReportBlocks } from "@/domains/chronicle/ui/ReportBlocks";
import { useOwnReportNames, useReportNames } from "@/domains/chronicle/ui/report-names";
import { fightRows } from "@/domains/combat/fight-rows-view";
import { fightControls } from "@/domains/combat/fight-controls";
import { moves, useFightMove } from "@/domains/combat/ui/fight-moves";
import { ownSessionEntries } from "@/domains/play/own-session-log";
import { playInitiativeRows } from "@/domains/play/play-initiative-view";
import { playZonesView } from "@/domains/play/play-zones-view";
import { PlayZoneHits } from "@/domains/play/ui/PlayZoneHits";
import { useSessionReports } from "@/features/campaigns/useSessionReports";
import { useSheetCombat } from "@/features/character/center/turn-state";
import { openZoneTray } from "@/features/character/center/zone-tray";
import { foldCombatEffectOps } from "@/lib/combat-effects";
import { activeZones } from "@/lib/zones";
import type { Locale } from "@/lib/locale";
import { foldSession } from "@/lib/session-log";
import { sessionReportSections } from "@/lib/session-log/session-report-sections";
import { renderSessionReport } from "@/lib/views/session-report-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import type { CampaignDoc } from "@/types/campaign";
import { Button, Chip, Icon, initialOf, Panel } from "@/ui";
import type { HpBandValue } from "@/lib/hp-band";

/** The character itself, in its own report (no campaign, no party). */
const ME = "pc-me";

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
      {campaign ? (
        <Report campaign={campaign} locale={locale} onToast={onToast} />
      ) : (
        <OwnReport locale={locale} onToast={onToast} />
      )}
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
  if (!fight) return <SoloInitiative />;
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
  const liveEffects = foldCombatEffectOps(fight.encounter.effectOps, {
    round: fight.encounter.round,
    currentCombatantId: fight.encounter.currentCombatantId,
    phase: "turn-start",
    order: fight.encounter.order ?? fight.view.turnOrderIds,
  });
  const zones = playZonesView(liveEffects, fight.view.rows, locale, fight.myId);
  // «Entra nella zona»: the creature that walked in, then the tray on it.
  const enterZone = (zoneId: string, targetId: string) => {
    const zone = activeZones(liveEffects).find((z) => z.id === zoneId);
    if (zone) openZoneTray(zone, targetId, locale);
  };
  const bandLabel = (band: HpBandValue) =>
    band === "down"
      ? t("fight.down")
      : band === "bloodied"
        ? t("character.health.bloodied")
        : t(`campaignHub.hpBand.${band}`);
  return (
    <Panel color="ini" title={t("fight.listTitle", { round: fight.round })}>
      {rows.map((row) => {
        const portrait =
          row.kind === "pc" ? (portraitOf(row.ids[0] ?? "") ?? row.portrait) : undefined;
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
                  .join("\u00a0· ")}
              </span>
              <PlayZoneHits zoneId={zone.id} locale={locale} />
              {zone.enter && zone.enter.length > 0 && (
                <ZoneEntry
                  creatures={zone.enter}
                  onEnter={(targetId) => enterZone(zone.id, targetId)}
                />
              )}
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
      latest
        ? sessionReportSections(foldSession(latest.items, { dmUid: campaign.dmUid }))
        : [],
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

/** A fight of the character's own (no campaign): the round, and its turn. */
function SoloInitiative() {
  const { t } = useTranslation();
  const started = useCharacterStore((s) => s.combatSoloFightStarted);
  const round = useCharacterStore((s) => s.combatRound);
  const name = useCharacterStore((s) => s.character?.character.name ?? "");
  if (!started) return null;
  return (
    <Panel color="ini" title={t("fight.listTitle", { round })}>
      <div className="f-ir" data-current="">
        <span className="f-ir-i" />
        <span className="f-ir-tok" aria-hidden="true">
          {initialOf(name)}
        </span>
        <span className="f-ir-n">
          <span className="f-ir-name">
            {name}
            {`\u00a0${t("play.initiativeYou")}`}
          </span>
          <span className="f-ir-now">{t("fight.now")}</span>
        </span>
      </div>
    </Panel>
  );
}

/** A character in no campaign: «Resoconto» from its own sheet log. */
function OwnReport({
  locale,
  onToast,
}: {
  locale: Locale;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const log = useCharacterStore((s) => s.character?.session.logEntries);
  const name = useCharacterStore((s) => s.character?.character.name ?? "");
  const names = useOwnReportNames(name, locale);
  const sections = useMemo(
    () => sessionReportSections(ownSessionEntries(log ?? [], ME)),
    [log]
  );
  const blocks = useMemo(() => diaryBlocks(sections), [sections]);
  if (blocks.length === 0) return null;
  const copy = () => {
    const text = renderSessionReport(sections, name, t, names, {});
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
      <ReportBlocks blocks={blocks} names={names} players={{}} locale={locale} />
    </Panel>
  );
}

/** «Entra nella zona» on my own zone: who walked in, then the tray on them. */
function ZoneEntry({
  creatures,
  onEnter,
}: {
  creatures: ReadonlyArray<{ id: string; name: string }>;
  onEnter: (targetId: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="f-chips">
        <Chip onClick={() => setOpen(true)}>{t("play.zones.enter")}</Chip>
      </div>
    );
  }
  return (
    <div className="f-zone-enter" role="group" aria-label={t("play.zones.enterWho")}>
      <span className="f-lbl">{t("play.zones.enterWho")}</span>
      <div className="f-chips">
        {creatures.map((c) => (
          <Chip
            key={c.id}
            onClick={() => {
              setOpen(false);
              onEnter(c.id);
            }}
          >
            {c.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}
