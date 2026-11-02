/**
 * The campaign's Scontro tab (approved prototype camp-fight / camp-fight-idle): while a
 * fight runs, the initiative list with the round always in sight and whose turn it is,
 * and what has happened so far; otherwise how a fight starts and the past fights from
 * the play logs. The rows follow the engine's turn order (frozen once turns begin).
 * Read side only: the turn actions arrive with the combat lifecycle.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { PartyChip } from "@/domains/campaign/party-rows-view";
import { fightRows, type FightRow } from "@/domains/combat/fight-rows-view";
import { pastFights } from "@/domains/combat/past-fights-view";
import { sessionNumbers } from "@/domains/chronicle/diary-view";
import { useReportNames } from "@/domains/chronicle/ui/report-names";
import { encounterRollFor } from "@/features/campaigns/encounter";
import { buildEncounterView, type PcLive } from "@/features/campaigns/encounter-view";
import { derivePcLive, hydrateMemberDoc } from "@/features/campaigns/party-stats";
import { useMemberCharacterDocs } from "@/features/campaigns/useMemberCharacterDocs";
import { usePartyCombatStates } from "@/features/campaigns/usePartyCombatStates";
import { useSessionLog } from "@/features/campaigns/useSessionLog";
import { useSessionReports } from "@/features/campaigns/useSessionReports";
import type { Locale } from "@/lib/locale";
import {
  buildReport,
  encounterFeed,
  foldSession,
  hideCombatants,
} from "@/lib/session-log";
import { localizePlayEvent } from "@/lib/views/session-report-view";
import { concentrationLabel } from "@/lib/views/tracker-view";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc, EncounterState } from "@/types/campaign";
import { Chip, Panel } from "@/ui";

const FEED_LINES = 8;

export function FightTab({
  campaign,
  locale,
}: {
  campaign: CampaignDoc;
  locale: Locale;
}) {
  const encounter = campaign.encounter;
  return encounter ? (
    <LiveFight campaign={campaign} encounter={encounter} locale={locale} />
  ) : (
    <IdleFight campaign={campaign} />
  );
}

function LiveFight({
  campaign,
  encounter,
  locale,
}: {
  campaign: CampaignDoc;
  encounter: EncounterState;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const isDm = uid === campaign.dmUid;
  const { view, concentration } = useFightView(campaign, encounter, isDm, locale);
  const rows = fightRows(view.rows, view.currentId, concentration, locale);
  return (
    <div className="f-split">
      <Panel
        color="ini"
        title={t("fight.listTitle", { round: encounter.round })}
        aside={t("fight.fighters", { count: view.rows.length })}
      >
        {rows.map((row) => (
          <FightLine key={row.ids.join("+")} row={row} />
        ))}
      </Panel>
      <Feed
        campaign={campaign}
        encounter={encounter}
        isDm={isDm}
        uid={uid}
        locale={locale}
      />
    </div>
  );
}

/** The live fight assembled exactly as the old hub does it: the encounter plus each
 *  character's live sheet and combat state (`derivePcLive` → `buildEncounterView`). */
function useFightView(
  campaign: CampaignDoc,
  encounter: EncounterState,
  isDm: boolean,
  locale: Locale
) {
  const refs = useMemo(
    () =>
      encounter.combatants.flatMap((c) =>
        c.kind === "pc" ? [{ uid: c.memberUid, characterId: c.characterId }] : []
      ),
    [encounter.combatants]
  );
  const docs = useMemberCharacterDocs(refs);
  const states = usePartyCombatStates(refs);
  const encounterInit = campaign.encounterInit;
  const live = useMemo(() => {
    const pcs: Record<string, PcLive> = {};
    const concentration: Record<string, PartyChip[]> = {};
    for (const ref of refs) {
      const st = docs[ref.uid];
      if (st?.status !== "ready") continue;
      const pc = derivePcLive(
        st.doc,
        states[ref.uid],
        encounterRollFor(encounterInit, ref.uid)
      );
      if (pc) pcs[`pc-${ref.uid}`] = pc;
      // The same live doc the Gruppo panel reads (its combat state folded in).
      const spell = hydrateMemberDoc(st.doc, states[ref.uid])?.session.concentration;
      if (spell)
        concentration[`pc-${ref.uid}`] = [
          { kind: "conc", label: concentrationLabel(spell, locale) },
        ];
    }
    return { pcs, concentration };
  }, [refs, docs, states, encounterInit, locale]);
  const view = useMemo(
    () => buildEncounterView(encounter, live.pcs, isDm),
    [encounter, live.pcs, isDm]
  );
  return { view, concentration: live.concentration };
}

function FightLine({ row }: { row: FightRow }) {
  const { t } = useTranslation();
  const hp = row.hp;
  const share = hp && hp.max > 0 ? hp.current / hp.max : 1;
  const band = row.band;
  return (
    <div className="f-row f-fight" data-current={row.current || undefined}>
      <span className="f-init">{row.initiative ?? ""}</span>
      <div className="f-row-main">
        <div className="f-row-t">
          {row.name}
          {row.count > 1 && (
            <span className="f-count">{`\u00a0×\u2060${row.count}`}</span>
          )}
        </div>
        {band && (
          <div className="f-row-s" data-band={band}>
            {band === "down"
              ? t("fight.down")
              : band === "bloodied"
                ? t("character.health.bloodied")
                : t(`campaignHub.hpBand.${band}`)}
          </div>
        )}
      </div>
      {row.current && <span className="f-now">{t("fight.now")}</span>}
      {row.chips.length > 0 && (
        <div className="f-chips">
          {row.chips.map((c) => (
            <Chip key={c.kind + c.label} kind={c.kind}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}
      {hp && (
        <div className="f-row-end">
          <div className="f-stat">
            <div
              className="f-stat-v"
              data-hp={share > 0.5 ? "ok" : share > 0.25 ? "low" : "bad"}
            >{`${hp.current}/${hp.max}`}</div>
            <div className="f-lbl">{t("units.hp")}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** What has happened in this fight, newest first: the same feed every member reads. */
function Feed({
  campaign,
  encounter,
  isDm,
  uid,
  locale,
}: {
  campaign: CampaignDoc;
  encounter: EncounterState;
  isDm: boolean;
  uid: string | undefined;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const names = useReportNames(campaign, locale);
  const log = useSessionLog(campaign.id, uid, campaign.dmUid, encounter.epoch);
  const encounterId = String(encounter.epoch);
  const lines = useMemo(() => {
    const all = encounterFeed(log.entries, encounterId);
    if (isDm) return all;
    return hideCombatants(
      all,
      new Set(encounter.combatants.filter((c) => c.hidden).map((c) => c.id))
    );
  }, [log.entries, encounterId, isDm, encounter.combatants]);
  const foes = useMemo(() => {
    const start = log.entries.find(
      (e) => e.event.kind === "encounter-start" && e.event.encounterId === encounterId
    );
    return start?.event.kind === "encounter-start" ? (start.event.names ?? {}) : {};
  }, [log.entries, encounterId]);
  const who = (id: string | undefined): string =>
    (id && (foes[id] ?? names.pc(id))) || t("combatChronicle.someone");
  const shown = lines.slice(-FEED_LINES).reverse();
  return (
    <Panel color="log" title={t("fight.feedTitle")}>
      {shown.length === 0 && <p className="f-quiet">{t("fight.feedEmpty")}</p>}
      {shown.map((line) => {
        const text = localizePlayEvent(line.event, t, who, names);
        if (!text) return null;
        return (
          <p key={line.id} className="f-tl">
            <span>
              {line.round ? t("fight.roundLine", { n: line.round, line: text }) : text}
            </span>
          </p>
        );
      })}
    </Panel>
  );
}

function IdleFight({ campaign }: { campaign: CampaignDoc }) {
  const { t } = useTranslation();
  const reports = useSessionReports(campaign.id);
  const fights = useMemo(() => {
    const evenings = reports.logs.map((log) => ({
      id: log.id,
      sections: buildReport(foldSession(log.items, { dmUid: campaign.dmUid })),
    }));
    return pastFights(evenings, sessionNumbers(reports.logs.map((l) => l.id)));
  }, [reports.logs, campaign.dmUid]);
  return (
    <div className="f-split">
      <Panel color="ini" title={t("campaignScreen.tabFight")}>
        <div className="f-empty">
          <b>{t("fight.idleTitle")}</b>
          <p>{t("fight.idleHelp")}</p>
        </div>
      </Panel>
      <Panel color="log" title={t("fight.pastTitle")}>
        {fights.length === 0 && <p className="f-quiet">{t("fight.pastEmpty")}</p>}
        {fights.map((f) => (
          <div key={f.encounterId} className="f-row">
            <div className="f-row-main">
              <div className="f-row-t">
                {f.foes.length
                  ? t("diary.fightWith", { foes: f.foes.join(", ") })
                  : t("campaignScreen.tabFight")}
              </div>
              <div className="f-row-s">
                {[
                  f.session && t("campaignHub.sessionN", { n: f.session }),
                  f.rounds > 0 && t("diary.rounds", { count: f.rounds }),
                  f.outcome && t(`fight.${f.outcome}`),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}
