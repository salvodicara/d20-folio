/**
 * The campaign's Scontro tab (approved prototype camp-fight / camp-fight-idle) on the
 * owner's combat lifecycle: the first roll starts a fight, anyone passes or steps back a
 * turn, ends it and reopens it, each with its undo. While a fight runs: the initiative
 * list with the round always in sight and whose turn it is (the engine's order, frozen
 * once turns begin), and what has happened so far. Otherwise: how a fight starts, the
 * last fight to reopen, and the past fights from the play logs.
 */
import { useEffectsOnParty } from "@/features/campaigns/effects-on-party";
import { Fragment, lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { PartyChip } from "@/domains/campaign/party-rows-view";
import { fightControls, type FightControls } from "@/domains/combat/fight-controls";
import { fightRows } from "@/domains/combat/fight-rows-view";
import { pastFights } from "@/domains/combat/past-fights-view";
import { ActionRepeatSaves } from "@/domains/combat/ui/ActionRepeatSaves";
import { monsterSpellDc } from "@/domains/combat/monster-zones-view";
import { MonsterZoneCast, MonsterZoneHits } from "@/domains/combat/ui/MonsterZones";
import { getMonster } from "@/data/monsters";
import { RepeatSavePrompts } from "@/domains/combat/ui/RepeatSavePrompt";
import { FightLine, type FightLineDm } from "@/domains/combat/ui/FightLine";
import { MonsterUses } from "@/domains/combat/ui/MonsterUses";
import { DmHitDialog } from "@/domains/combat/ui/DmHitDialog";
import { dmTargets, planDmHit } from "@/domains/combat/dm-hit-plan";
import type { FightRow } from "@/domains/combat/fight-rows-view";
import { RollDialog } from "@/domains/combat/ui/FightActions";
import {
  dmMoves,
  moves,
  useEndedCombat,
  useFightMove,
  type Toaster,
} from "@/domains/combat/ui/fight-moves";
import { sessionNumbers } from "@/domains/chronicle/diary-view";
import { useReportNames } from "@/domains/chronicle/ui/report-names";
import { usePartyNames } from "@/domains/campaign/ui/use-party";
import { missingRollers } from "@/features/campaigns/combat-lifecycle";
import { encounterRollFor } from "@/lib/play/encounter";
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
import { concentrationLabel } from "@/lib/views/concentration-label";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc, EncounterState } from "@/types/campaign";
import { Button, Panel } from "@/ui";

const FEED_LINES = 8;

// The add-monsters sheet carries the bestiary: it loads when the DM opens it.
const AddMonstersDialog = lazy(() =>
  Promise.all([
    import("@/domains/combat/ui/AddMonstersDialog"),
    import("@/i18n").then((i) => i.ensureSrdKind("monster")),
  ]).then(([m]) => ({ default: m.AddMonstersDialog }))
);

export function FightTab({
  campaign,
  locale,
  onToast,
}: {
  campaign: CampaignDoc;
  locale: Locale;
  onToast: Toaster;
}) {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const isDm = uid === campaign.dmUid;
  const encounter = campaign.encounter ?? null;
  const now = useMinute();
  const ended = useEndedCombat(campaign.id);
  const party = useParty(campaign, encounter, locale);
  const move = useFightMove(onToast);
  const [rolling, setRolling] = useState(false);
  if (!uid) return null;
  const myId = `pc-${uid}`;
  const controls = fightControls(
    encounter,
    ended,
    {
      uid,
      isDm,
      hasCharacter: Boolean(campaign.memberDetails[uid]?.characterId),
      rolled: campaign.encounterInit?.[uid] != null,
      missing: missingRollers({ ...campaign, encounter }).length,
    },
    now
  );
  const bonuses = Object.fromEntries(
    Object.entries(party.pcs).map(([id, pc]) => [id, pc.initiativeBonus])
  );
  const roll = rolling && (
    <RollDialog
      bonus={bonuses[myId] ?? 0}
      onClose={() => setRolling(false)}
      onRoll={(d20) =>
        move(
          moves.roll(campaign.id, uid, d20, bonuses),
          t("fight.rollDone", { total: d20 + (bonuses[myId] ?? 0) })
        )
      }
    />
  );
  const actions = {
    roll: () => setRolling(true),
    pass: () =>
      move(
        moves.pass(campaign.id, uid, isDm, encounter?.currentCombatantId ?? null),
        t("fight.passDone")
      ),
    back: () =>
      move(
        moves.back(campaign.id, uid, isDm, encounter?.currentCombatantId ?? null),
        t("fight.backDone")
      ),
    end: (reason?: FightControls["suggestEnd"]) =>
      move(moves.end(campaign.id, reason ?? undefined), t("fight.endDone")),
    reopen: () => move(moves.reopen(campaign.id), t("fight.reopenDone")),
    rollMissing: () =>
      move(moves.rollMissing(campaign.id, uid, bonuses), t("fight.rollMissingDone")),
  };
  return (
    <>
      {encounter ? (
        <LiveFight
          campaign={campaign}
          encounter={encounter}
          party={party}
          controls={controls}
          actions={actions}
          isDm={isDm}
          uid={uid}
          locale={locale}
          onToast={onToast}
        />
      ) : (
        <IdleFight campaign={campaign} controls={controls} actions={actions} />
      )}
      {roll}
    </>
  );
}

/** The time, refreshed every minute: enough for "nobody has touched the fight for an hour". */
function useMinute(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

interface Actions {
  roll: () => void;
  rollMissing: () => void;
  pass: () => void;
  back: () => void;
  end: (reason?: FightControls["suggestEnd"]) => void;
  reopen: () => void;
}

function LiveFight({
  campaign,
  encounter,
  party,
  controls,
  actions,
  isDm,
  uid,
  locale,
  onToast,
}: {
  campaign: CampaignDoc;
  encounter: EncounterState;
  party: Party;
  controls: FightControls;
  actions: Actions;
  isDm: boolean;
  uid: string;
  locale: Locale;
  onToast: Toaster;
}) {
  const { t } = useTranslation();
  const view = useMemo(
    () => buildEncounterView(encounter, party.pcs, isDm),
    [encounter, party.pcs, isDm]
  );
  const rows = fightRows(view.rows, view.currentId, party.concentration, locale);
  const suggest = controls.suggestEnd;
  const dm = useDmTools(campaign, view.rows, uid, isDm, locale, onToast);
  // The monster whose turn it is: the DM may cast an area spell for it, from the head.
  const monsterTurn =
    isDm && encounter.currentCombatantId
      ? encounter.combatants.find(
          (c) => c.id === encounter.currentCombatantId && c.kind === "monster"
        )
      : undefined;
  return (
    <div className="f-split">
      <div className="f-stack">
        {suggest && (
          <div className="f-note f-suggest" role="status">
            <span>{t(`fight.suggest.${suggest}`)}</span>
            <Button onClick={() => actions.end(suggest)}>{t("fight.end")}</Button>
          </div>
        )}
        <Panel
          color="ini"
          title={t("fight.listTitle", { round: encounter.round })}
          aside={
            isDm ? (
              <Button kind="quiet" icon="u-add" onClick={dm.openAdd}>
                {t("fight.dm.addMonsters")}
              </Button>
            ) : (
              t("fight.fighters", { count: view.rows.length })
            )
          }
          foot={
            <>
              {controls.pass && (
                <Button kind="primary" wide icon="u-next" onClick={actions.pass}>
                  {t("campaignHub.encounterNextTurn")}
                </Button>
              )}
              {controls.back && (
                <Button icon="u-back" onClick={actions.back}>
                  {t("fight.back")}
                </Button>
              )}
              {controls.roll && (
                <Button onClick={actions.roll}>
                  {t("campaignHub.encounterRollInitiative")}
                </Button>
              )}
              {controls.rollMissing && (
                <Button onClick={actions.rollMissing}>{t("fight.rollMissing")}</Button>
              )}
              {controls.end && (
                <Button kind="quiet" onClick={() => actions.end()}>
                  {t("fight.end")}
                </Button>
              )}
            </>
          }
        >
          {rows.map((row) => (
            <Fragment key={row.ids.join("+")}>
              <FightLine
                row={row}
                dm={dm.line(row)}
                action={
                  monsterTurn &&
                  row.ids.includes(monsterTurn.id) && (
                    <MonsterZoneCast
                      campaignId={campaign.id}
                      monsterId={monsterTurn.id}
                      monsterName={
                        view.rows.find((r) => r.id === monsterTurn.id)?.name ?? ""
                      }
                      defaultDc={monsterSpellDc(
                        monsterStatBlockOf(encounter, monsterTurn.id)
                      )}
                      locale={locale}
                      onToast={onToast}
                    />
                  )
                }
              />
              <RepeatSavePrompts targetIds={row.ids} locale={locale} />
              {/* the DM's limited uses on the monster's line (Recharge, N/Day) */}
              {isDm && (
                <MonsterUses
                  campaignId={campaign.id}
                  encounter={encounter}
                  ids={row.ids}
                  locale={locale}
                  onToast={onToast}
                />
              )}
              {/* zones the DM's monsters cast: their turn questions, and casting one */}
              {isDm && (
                <MonsterZoneHits
                  campaignId={campaign.id}
                  casterIds={row.ids}
                  rows={view.rows}
                  locale={locale}
                  onToast={onToast}
                />
              )}
              {/* the monster whose turn it is may spend its action to repeat a save */}
              {isDm &&
                encounter.currentCombatantId &&
                row.ids.includes(encounter.currentCombatantId) &&
                encounter.combatants.some(
                  (c) => c.id === encounter.currentCombatantId && c.kind === "monster"
                ) && (
                  <ActionRepeatSaves
                    campaignId={campaign.id}
                    effectOps={encounter.effectOps}
                    targetId={encounter.currentCombatantId}
                    locale={locale}
                  />
                )}
            </Fragment>
          ))}
        </Panel>
        <p className="f-quiet">{t("fight.anyonePasses")}</p>
        {dm.dialogs}
      </div>
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

/**
 * The DM's tools on the live fight (owner's blocker, 2026-11-07): «Aggiungi mostri» in
 * the list's head, and «Danni e cure» from a tap on a line's HP (D&D Beyond's tracker;
 * the owner's pick, 2026-11-08). A group line brings all its creatures, each droppable.
 */
function useDmTools(
  campaign: CampaignDoc,
  fighters: ReturnType<typeof buildEncounterView>["rows"],
  uid: string,
  isDm: boolean,
  locale: Locale,
  onToast: Toaster
) {
  const { t } = useTranslation();
  const move = useFightMove(onToast);
  const [hitting, setHitting] = useState<readonly string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const targets = hitting ? dmTargets(fighters, hitting) : [];
  const line = (row: FightRow): FightLineDm | undefined => {
    if (!isDm) return undefined;
    const members = fighters.filter((f) => row.ids.includes(f.id));
    const hp = members.reduce(
      (sum, f) => ({ current: sum.current + f.currentHp, max: sum.max + f.maxHp }),
      { current: 0, max: 0 }
    );
    const label = t("fight.dm.hpFor", { name: row.name });
    return { hp, label, onHp: () => setHitting(row.ids) };
  };
  const dialogs = isDm && (
    <>
      {hitting && targets.length > 0 && (
        <DmHitDialog
          targets={targets}
          locale={locale}
          onClose={() => setHitting(null)}
          onHit={(chosenTargets, entry) => {
            move(
              dmMoves.hit(campaign.id, uid, planDmHit(chosenTargets, entry)),
              t(entry.kind === "heal" ? "fight.dm.healDone" : "fight.dm.hitDone", {
                amount: entry.amount,
                count: chosenTargets.length,
              })
            );
          }}
          onCondition={(target, conditionId, active) =>
            move(
              dmMoves.condition(
                campaign.id,
                uid,
                { ...target, maxHp: target.hp.max },
                conditionId,
                active
              ),
              t(active ? "fight.dm.conditionOn" : "fight.dm.conditionOff", {
                name: target.name,
              })
            )
          }
        />
      )}
      {adding && (
        <Suspense fallback={null}>
          <AddMonstersDialog
            campaign={campaign}
            locale={locale}
            onClose={() => setAdding(false)}
            onAdd={(inputs, label) =>
              move(
                dmMoves.add(campaign.id, uid, inputs),
                t("fight.dm.addDone", { label })
              )
            }
          />
        </Suspense>
      )}
    </>
  );
  return { line, dialogs, openAdd: () => setAdding(true) };
}

interface Party {
  pcs: Record<string, PcLive>;
  concentration: Record<string, PartyChip[]>;
}

/** Every character's live facts (the old hub's assembly: their sheet and combat state
 *  through `derivePcLive`): the fight's characters while one runs, else the party, whose
 *  initiative bonuses the first roll needs. */
function useParty(
  campaign: CampaignDoc,
  encounter: EncounterState | null,
  locale: Locale
): Party {
  const refs = useMemo(
    () =>
      encounter
        ? encounter.combatants.flatMap((c) =>
            c.kind === "pc" ? [{ uid: c.memberUid, characterId: c.characterId }] : []
          )
        : Object.entries(campaign.memberDetails).flatMap(([uid, m]) =>
            m.characterId ? [{ uid, characterId: m.characterId }] : []
          ),
    [encounter, campaign.memberDetails]
  );
  const docs = useMemberCharacterDocs(refs);
  const states = usePartyCombatStates(refs);
  const encounterInit = campaign.encounterInit;
  const effectsOn = useEffectsOnParty(campaign);
  return useMemo(() => {
    const pcs: Record<string, PcLive> = {};
    const concentration: Record<string, PartyChip[]> = {};
    for (const ref of refs) {
      const st = docs[ref.uid];
      if (st?.status !== "ready") continue;
      const pc = derivePcLive(
        st.doc,
        states[ref.uid],
        encounterRollFor(encounterInit, ref.uid),
        effectsOn(ref.uid)
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
  }, [refs, docs, states, encounterInit, locale, effectsOn]);
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
  const names = useReportNames(campaign, locale, usePartyNames(campaign));
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

function IdleFight({
  campaign,
  controls,
  actions,
}: {
  campaign: CampaignDoc;
  controls: FightControls;
  actions: Actions;
}) {
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
      <Panel
        color="ini"
        title={t("campaignScreen.tabFight")}
        foot={
          (controls.roll || controls.rollMissing || controls.reopen) && (
            <>
              {controls.roll && (
                <Button kind="primary" onClick={actions.roll}>
                  {t("campaignHub.encounterRollInitiative")}
                </Button>
              )}
              {controls.rollMissing && (
                <Button
                  kind={controls.roll ? "ghost" : "primary"}
                  onClick={actions.rollMissing}
                >
                  {t("fight.rollMissing")}
                </Button>
              )}
              {controls.reopen && (
                <Button icon="u-back" onClick={actions.reopen}>
                  {t("fight.reopen")}
                </Button>
              )}
            </>
          )
        }
      >
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

/** A catalogue monster's stat block in the fight (none for homebrew or not found). */
function monsterStatBlockOf(encounter: EncounterState, id: string) {
  const c = encounter.combatants.find((x) => x.id === id);
  return c?.kind === "monster" && c.srdId ? getMonster(c.srdId) : undefined;
}
