/**
 * global-combat — the ONE shell-level live read of "which running encounters is THIS USER
 * in, and what's the combat status?" (INIT-2/3 + the C4 pip).
 *
 * {@link GlobalCombatMount} is a RENDERLESS component mounted ONCE at
 * {@link "@/app/shell/AppShell"} (lazy-loaded, so this whole campaign+engine import graph
 * stays OUT of the always-eager entry bundle). It subscribes a SINGLE
 * {@link subscribeToSharedCampaigns} listener (the membership-scoped `array-contains`
 * query) and resolves EVERY active encounter the user takes part in
 * ({@link viewerActiveEncounters}) — as a PC combatant OR a PC-less DM/admin — keyed on the
 * AUTH UID, never the open character sheet (empty off the cockpit). It picks ONE to display
 * ({@link pickPrimaryCampaignId} — the local pin, else the most-recently-started),
 * upgrades THAT one to a live {@link useLiveEncounter} (the single live read — cost posture
 * preserved), and PUBLISHES two shapes into the light {@link useCombatStatusStore}:
 *
 *   • the {@link GlobalCombat} status of the viewer's OWN PC fight — read by the cockpit
 *     turn meter + in-combat chip, so the sheet and the pip can never disagree (golden
 *     rule 6);
 *   • the {@link PipModel} — every active encounter reduced to a {@link PipState} for the
 *     topbar pip's labelled switch + multi-encounter chooser (spec §5).
 *
 * It also fires the gentle "it's your turn" toast once per turn-entry
 * ({@link shouldToastTurnStart}). Cost posture
 * (free-tier): one query listener + — only on a positive in-combat hit — the single
 * primary live-encounter listeners; a user NOT in combat pays just the shared query.
 */

import { usePartyAura } from "@/features/campaigns/use-party-aura";
import { useFightMarkers } from "./use-fight-markers";
import { effectsOnTarget } from "@/lib/play/effective-doc";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import { useLocale } from "@/hooks/useLocale";
import { localizeSrd } from "@/i18n/resolver";
import { spellEndEffects } from "@/lib/activities/read";
import { proneInFlight } from "@/lib/play/flight";
import { markDropOffers } from "@/lib/play/mark-offers";
import { effectiveTableRules } from "@/lib/table-rules";
import { fightConditionEnds, type FightLook } from "@/lib/play/fight-condition-ends";
import { activeZones, zoneTurnHits, type ZoneLedger } from "@/lib/zones";
import { useRepeatSaveStore } from "@/features/campaigns/repeat-save-store";
import { tallyOf } from "@/features/campaigns/save-tally-store";
import { trackSettled } from "@/lib/condition-ends";
import { fightSideOf } from "@/features/character/center/outcome-offer";
import { useZoneHitStore } from "@/features/campaigns/zone-hit-store";
import { offerAmmunitionRecovery } from "@/features/character/ammo-recovery-offer";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import {
  deliverQueuedMemberEffects,
  revokePersistentCombatEffect,
  revokePersistentCombatEffectsBySource,
  subscribeToSharedCampaigns,
} from "@/features/campaigns/campaign-io";
import {
  effectIdsEndingOnAct,
  foldCombatEffectOps,
  incapacitationSweep,
  type IncapacitationRow,
} from "@/lib/combat-effects";
import { combatEffectEndsEarlyOn } from "@/lib/resolve-grant-sources";
import { encounterRollFor, viewerActiveEncounters } from "@/lib/play/encounter";
import {
  observePartyWorldFights,
  type PartyFightSnapshot,
} from "@/features/campaigns/party-world-lease";
import { useLiveEncounter } from "@/features/campaigns/useLiveEncounter";
import {
  makeDevPip,
  makeDevGlobalCombat,
  makeDevChronicleCombat,
  makeDevParty,
  makeDevAllyEffects,
  devPipMode,
  turnFlickerReplayMode,
  makeTurnFlickerSteps,
} from "@/features/campaigns/dev-fixture";
import {
  useCombatStatusStore,
  usePinStore,
  overlayOpenCampaign,
  pickPrimaryCampaignId,
  buildPipModel,
  turnStartKey,
  shouldToastTurnStart,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import {
  reconcileCombatPublish,
  pendingApplies,
} from "@/features/campaigns/combat-reconcile";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { CampaignDoc, EncounterPc } from "@/types/campaign";
import { useCharacterStore } from "@/stores/characterStore";
import { useCampaignClockProjection } from "@/features/campaigns/campaign-clock-projection";
import { partyRosterOf, usePartyRosterStore } from "@/features/campaigns/party-roster";
import {
  subscribeCampaignEffects,
  setCampaignEffectsEnded,
  writeCampaignEffects,
} from "@/features/campaigns/campaign-effects-io";
import {
  concentrationChange,
  outlastingFightEffects,
  type CampaignEffectDoc,
  type ConcentrationMemo,
} from "@/lib/play/campaign-effects";
import { combatEffectsV26On } from "@/lib/deployed-rules";
import { concentrationTimerKey } from "@/lib/spell-duration";
import type { CombatEffectOp, EncounterPosition } from "@/types/combat-effect";
import { diagnosticsLog } from "@/lib/diagnostics";
import { catchUpCampaignClock, clockCatchUpTarget } from "@/features/character/pass-time";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { conditionBreaksConcentration } from "@/lib/condition-effects";

/** Renderless: subscribes the shell-level combat status + pip model and publishes them. */
export function GlobalCombatMount(): null {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  const pin = usePinStore((s) => s.pin);
  const showToast = useToastStore((s) => s.showToast);
  const set = useCombatStatusStore((s) => s.set);
  // The player's own End-Turn hand-off in flight (set by the sheet) — the reconcile guard
  // that stops a lagging listener regressing the optimistic advance to "your turn".
  const pendingTurn = useCombatStatusStore((s) => s.pendingTurn);
  const clearPendingTurn = useCombatStatusStore((s) => s.clearPendingTurn);
  const setEncounterEffects = useCharacterStore((s) => s.setEncounterEffects);
  const openCharacterId = useCharacterStore((s) => s.character?.id ?? null);
  const concentration = useCharacterStore(
    (s) => s.character?.session.concentration ?? ""
  );
  // A narrow value, never the whole character: this component's effects write the
  // character (the encounter effects it projects), and a whole-doc subscription would
  // re-render it on each of its own writes, forever (P0, 2026-11-04).
  const proneAloft = useCharacterStore((s) =>
    s.character ? proneInFlight(s.character) : false
  );
  const [campaigns, setCampaigns] = useState<CampaignDoc[]>([]);
  // The membership listener has delivered at least one snapshot (possibly empty).
  // The party-world lease reconcile waits for it: an unsettled empty list must
  // never read as "every fight ended" and release a live lease.
  const [campaignsSettled, setCampaignsSettled] = useState(false);
  // This player's fight markers in the session log, with the DM's page closed too.
  useFightMarkers(campaigns, uid);
  const deliveringEffects = useRef<string | null>(null);
  const observedConcentration = useRef<{
    scope: string;
    sourceId: string;
  } | null>(null);
  const observedTurn = useRef<string | null>(null);
  const observedFightOf = useRef<string | null>(null);
  const observedProne = useRef<{ characterId: string; prone: boolean } | null>(null);
  const observedRows = useRef<{ scope: string; rows: IncapacitationRow[] } | null>(null);
  const observedFight = useRef<{ scope: string; look: FightLook } | null>(null);
  const observedZoneTurn = useRef<{
    scope: string;
    current: string | null;
    ledger: ZoneLedger;
  } | null>(null);
  // The OPTIMISTIC open campaign (the hub the viewer is on, if any) — `null` off the hub.
  // Overlaid below so the pip reflects the viewer's OWN start/end/begin-turns in the same
  // tick, not ~2 s later when the autosave-debounced write echoes (the pip's "no echo lag").
  const openCampaign = useCampaignStore((s) => s.campaign);

  // DEV ONLY (tree-shaken from prod — `DEV_BYPASS_AUTH` is statically false): the
  // screenshot / a11y harness seeds a deterministic pip via the `d20-dev-pip` flag, so
  // every pip STATE is shootable without the live combat-state plumbing. When set we skip
  // the real resolution entirely (one writer, no race).
  const devPip = useMemo(
    () => (import.meta.env.DEV && DEV_BYPASS_AUTH ? makeDevPip(devPipMode()) : null),
    []
  );
  // The needs-roll pip's inline roller reads the live status; the dev seed publishes a
  // matching one (non-null only for needsroll) so the C4b shot/a11y harness can open it.
  // DEV ONLY — the turn-flicker regression harness. When set, the producer REPLAYS the
  // End-Turn reconcile sequence (see `makeTurnFlickerSteps`) instead of the live resolution,
  // so `turn-indicator-flicker.spec.ts` can prove the flash in REAL Chromium (jsdom can't).
  const replayMode = useMemo(
    () => (import.meta.env.DEV && DEV_BYPASS_AUTH ? turnFlickerReplayMode() : null),
    []
  );
  const devStatus = useMemo(
    () =>
      import.meta.env.DEV && DEV_BYPASS_AUTH ? makeDevGlobalCombat(devPipMode()) : null,
    []
  );
  // DEV ONLY — the combat-chronicle e2e/dev seam. When `d20-dev-combat-chronicle=1` is
  // set before boot, publish a ready-made own-PC encounter status (the evoker + three
  // monsters) so the OPEN `scn-evoker-wizard` sheet commits its actions as in a real
  // encounter (`useSheetCombat` scopes on `characterId`). Takes precedence over the live
  // resolution + the pip seed below.
  const devCombat = useMemo(
    () => (import.meta.env.DEV && DEV_BYPASS_AUTH ? makeDevChronicleCombat() : null),
    []
  );

  // ONE live listener over the user's shared campaigns — re-fires the moment an encounter
  // starts/ends, so the pip lights/clears with no reload.
  useEffect(() => {
    let cancelled = false;
    const settle = (next: CampaignDoc[]): void => {
      if (cancelled) return;
      setCampaigns(next);
      setCampaignsSettled(true);
    };
    if (!uid) {
      void Promise.resolve().then(() => settle([]));
      return () => {
        cancelled = true;
      };
    }
    const unsub = subscribeToSharedCampaigns(
      uid,
      settle,
      () => settle([]) // offline / denied — quietly empty, a later snapshot recovers
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  // Overlay the optimistic open campaign over the Firestore-synced list, so the viewer's
  // own un-echoed encounter edits drive the pip immediately (see `overlayOpenCampaign`).
  const mergedCampaigns = useMemo(
    () => overlayOpenCampaign(campaigns, openCampaign),
    [campaigns, openCampaign]
  );

  // EVERY active encounter the viewer is in, keyed on the UID (never the open sheet) — so
  // the pip resolves wherever the user is. Out of combat this is empty → zero live
  // listeners (cost posture). Suppressed entirely under a dev-pip seed.
  const encounters = useMemo(
    () => (uid && !devPip ? viewerActiveEncounters(mergedCampaigns, uid, isAdmin) : []),
    [uid, mergedCampaigns, isAdmin, devPip]
  );

  // The displayed (primary) encounter: the local pin if still active, else the
  // most-recently-started. ONLY this one gets a live read (the sheet view + roll payload).
  const primaryId = useMemo(
    () => pickPrimaryCampaignId(encounters, pin),
    [encounters, pin]
  );
  const primaryIsDm = encounters.find((e) => e.campaignId === primaryId)?.role === "dm";

  const live = useLiveEncounter(uid, primaryId, primaryIsDm);

  // THE PARTY-WORLD LEASE (member flow) - every active own-PC fight reduced to
  // the snapshot `observePartyWorldFights` reconciles the OPEN character's
  // local engine encounter against: join on the surfaced rolled fight (ending
  // a lingering solo encounter first), fire the character-side complete-turn
  // when the pointer passes off the viewer's PC, release the lease when its
  // fight ends. Derived from the SAME membership listener as the pip (no new
  // reads); suppressed under the dev seeds, which are shot fixtures, not
  // plumbing. `openCharacterId` re-runs the reconcile when the player opens
  // their sheet mid-fight (the idempotent late join).
  const partyFights = useMemo<PartyFightSnapshot[]>(() => {
    if (!uid || devPip || devCombat || replayMode) return [];
    return encounters.flatMap((entry) => {
      if (entry.role !== "pc" || entry.characterId === null) return [];
      const campaign = mergedCampaigns.find((c) => c.id === entry.campaignId);
      return [
        {
          campaignId: entry.campaignId,
          characterId: entry.characterId,
          encounterEpoch: entry.epoch,
          initiativeRoll: campaign ? encounterRollFor(campaign.encounterInit, uid) : null,
          isMyTurn: entry.isMyTurn,
          round: entry.round,
          turnsBegun: !entry.gathering,
        },
      ];
    });
  }, [uid, devPip, devCombat, replayMode, encounters, mergedCampaigns]);
  const observedFights = useRef<readonly PartyFightSnapshot[] | null>(null);
  useEffect(() => {
    if (!uid || !campaignsSettled || devPip || devCombat || replayMode) return;
    observePartyWorldFights(observedFights.current, partyFights, primaryId);
    observedFights.current = partyFights;
  }, [
    uid,
    campaignsSettled,
    devPip,
    devCombat,
    replayMode,
    partyFights,
    primaryId,
    openCharacterId,
  ]);

  // The viewer's OWN PC status (the sheet shape) — built only when the primary is the
  // viewer's PC fight (a PC-less DM primary publishes no sheet status; their cockpit isn't
  // in this fight). The merged live row carries the override-first init bonus / raw roll /
  // max HP, the SAME values the party card derives (golden rule 6).
  const status = useMemo<GlobalCombat | null>(() => {
    if (devCombat) return devCombat; // dev seed: the combat-chronicle sheet-banner fight
    if (devPip) return devStatus; // dev seed: needs-roll publishes a status, others null
    if (!uid || !primaryId || !live) return null;
    const myId = `pc-${uid}`;
    const myCombatant = live.encounter.combatants.find(
      (c): c is EncounterPc => c.kind === "pc" && c.memberUid === uid
    );
    if (!myCombatant) return null;
    // The row's roll/bonus already derive from the campaign's `encounterInit` table +
    // the engine (via `derivePcLive`) — the initiative SSOT, same values the card shows.
    const myRow = live.view.rows.find((r) => r.id === myId);
    return {
      campaignId: primaryId,
      encounter: live.encounter,
      view: live.view,
      myId,
      characterId: myCombatant.characterId,
      gathering: live.encounter.currentCombatantId === null,
      isMyTurn: live.view.currentId === myId,
      initiativeBonus: myRow?.initiativeBonus ?? 0,
      initiativeRoll: myRow?.initiativeRoll ?? null,
      round: live.encounter.round,
    };
  }, [devCombat, devPip, devStatus, uid, primaryId, live]);

  // The table's rules (M16): the open character plays by its campaign's variants
  // (a solo sheet, or a RAW table, by RAW). The setter is idempotent.
  const setTableRules = useCharacterStore((s) => s.setTableRules);
  useEffect(() => {
    if (!openCharacterId || !uid) return;
    const campaign = campaigns.find(
      (c) => c.memberDetails[uid]?.characterId === openCharacterId
    );
    const varies = campaign?.tableRules && Object.keys(campaign.tableRules).length > 0;
    setTableRules(openCharacterId, varies ? effectiveTableRules(campaign) : null);
  }, [campaigns, openCharacterId, uid, setTableRules]);

  // The campaign clock (`lib/play/clock.ts`): the open character reads its time of
  // day and countdowns from its campaign's clock, with this release's rules deployed.
  // Re-projected when a reload drops it; the owner's sheet then catches up to it.
  const clockCampaign =
    openCharacterId && uid
      ? campaigns.find((c) => c.memberDetails[uid]?.characterId === openCharacterId)
      : undefined;
  useCampaignClockProjection(openCharacterId ?? undefined, clockCampaign);
  // Aura of Protection across the party: published from a paladin's own sheet, read
  // onto every ally's saves, both through the campaign doc this sheet already reads.
  usePartyAura(clockCampaign, uid, openCharacterId);
  const catchUpTo = useCharacterStore(clockCatchUpTarget);
  useEffect(() => {
    if (catchUpTo !== null) catchUpCampaignClock();
  }, [catchUpTo]);

  // The campaign's effects out of a fight (lib/play/campaign-effects.ts): what others
  // left on my character that lasts on the game clock, read at the campaign minute.
  // One identity with the fight: the fight's effects are joined, never copied.
  const effectsCampaignId =
    clockCampaign && combatEffectsV26On() ? clockCampaign.id : null;
  const clockMinute = clockCampaign?.gameClock?.minute ?? 0;
  const [storeRead, setStoreRead] = useState<{
    campaignId: string;
    docs: CampaignEffectDoc[];
  } | null>(null);
  useEffect(() => {
    if (!effectsCampaignId) return;
    return subscribeCampaignEffects(
      effectsCampaignId,
      (docs) => setStoreRead({ campaignId: effectsCampaignId, docs }),
      (error) =>
        diagnosticsLog("warn", "campaign.effects-read-failed", { message: String(error) })
    );
  }, [effectsCampaignId]);
  const storeEffects = useMemo(
    () => (storeRead && storeRead.campaignId === effectsCampaignId ? storeRead.docs : []),
    [storeRead, effectsCampaignId]
  );
  const myStoreEffects = useMemo(
    () =>
      uid
        ? effectsOnTarget(`pc-${uid}`, {
            campaign: { docs: storeEffects, minute: clockMinute },
          })
        : [],
    [storeEffects, uid, clockMinute]
  );

  // The party out of a fight, for the «Su chi?» step's «Il gruppo» group: a cast that
  // leaves a state on one of them writes it on the campaign clock.
  const setParty = usePartyRosterStore((s) => s.setParty);
  const devParty = useMemo(
    () => (import.meta.env.DEV && DEV_BYPASS_AUTH ? makeDevParty() : null),
    []
  );
  useEffect(() => {
    if (devParty) {
      setParty(devParty, devParty.characterId);
      return;
    }
    // Until the campaigns are read, the party is unknown (a cast waits for it), not none.
    setParty(
      effectsCampaignId && clockCampaign && uid && openCharacterId
        ? partyRosterOf(clockCampaign, uid, openCharacterId)
        : null,
      campaignsSettled ? openCharacterId : null
    );
  }, [
    devParty,
    effectsCampaignId,
    clockCampaign,
    uid,
    openCharacterId,
    campaignsSettled,
    setParty,
  ]);

  // Concentration out of a fight: what my Concentration held on the campaign ends with
  // it, and the undo of that end brings the same effects back. The first look only
  // records it (a reload is not a drop).
  const effectsConcentration = useRef<{ scope: string; memo: ConcentrationMemo } | null>(
    null
  );
  useEffect(() => {
    if (!effectsCampaignId || !uid || !openCharacterId) {
      effectsConcentration.current = null;
      return;
    }
    const scope = `${effectsCampaignId}:${openCharacterId}`;
    const prior =
      effectsConcentration.current?.scope === scope
        ? effectsConcentration.current.memo
        : null;
    const change = concentrationChange(prior, concentration, storeEffects, `pc-${uid}`);
    effectsConcentration.current = { scope, memo: change.memo };
    const failed = () =>
      showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
    void setCampaignEffectsEnded(effectsCampaignId, change.end, "concentration").catch(
      failed
    );
    void setCampaignEffectsEnded(effectsCampaignId, change.reinstate, null).catch(failed);
  }, [
    effectsCampaignId,
    uid,
    openCharacterId,
    concentration,
    storeEffects,
    showToast,
    t,
  ]);

  // The last look at my fight, so its end can move what outlasts it to the campaign.
  const lastFight = useRef<{
    campaignId: string;
    characterId: string;
    myId: string;
    operations: ReadonlyArray<CombatEffectOp> | undefined;
    position: EncounterPosition;
  } | null>(null);

  // A fight of mine just ended: half the ammunition it spent can be recovered (SRD,
  // a minute searching the battlefield). Offered once, with its undo.
  useEffect(() => {
    const inFight =
      status && status.characterId === openCharacterId ? status.characterId : null;
    const was = observedFightOf.current;
    observedFightOf.current = inFight;
    if (!was || inFight === was) return;
    const doc = useCharacterStore.getState().character;
    if (!doc || doc.id !== was) return;
    offerAmmunitionRecovery(t);
    // What I left that outlasts the fight moves to the campaign, same identity (Mage
    // Armor on an ally keeps its hours); what ends with the fight stays behind.
    const fight = lastFight.current;
    if (!fight || fight.characterId !== was || fight.campaignId !== effectsCampaignId)
      return;
    const moving = outlastingFightEffects(fight.operations, fight.position, {
      actorId: fight.myId,
      minute: clockMinute,
      concentrationRoundsLeft: (sourceId) =>
        doc.session.effectTimers?.[concentrationTimerKey(sourceId)]?.roundsLeft,
    });
    void writeCampaignEffects(fight.campaignId, moving).catch(() =>
      showToast({ message: t("combat.declareApplyFailed"), duration: 6000 })
    );
  }, [status, openCharacterId, t, effectsCampaignId, clockMinute, showToast]);

  // An act the viewer performs (an attack, a spell, damage dealt) ends the effects others
  // left on them that end on it: an ally's Invisibility, Sanctuary. In the fight they
  // are revoked from its log; out of it, the campaign's are marked ended.
  useEffect(() => {
    const failed = () =>
      showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
    useCharacterStore.getState().setStateEndingActSink((act) => {
      if (status && live) {
        for (const id of effectIdsEndingOnAct(live.encounter.effectOps, status.myId, act))
          void revokePersistentCombatEffect(status.campaignId, id).catch(failed);
      }
      if (!effectsCampaignId) return;
      const ending = myStoreEffects
        .filter((effect) => combatEffectEndsEarlyOn(effect).includes(act))
        .map((effect) => effect.id);
      void setCampaignEffectsEnded(effectsCampaignId, ending, "revoked").catch(failed);
    });
    return () => useCharacterStore.getState().setStateEndingActSink(null);
  }, [status, live, effectsCampaignId, myStoreEffects, showToast, t]);

  // Project campaign-owned standing effects onto the viewer's own open character.
  // This reuses the primary encounter listener above; the character store scopes the
  // projection by character id and the character codec never persists it. A teammate's
  // sheet open read-only carries its own projection (MemberSheetView).
  useEffect(() => {
    if (useCharacterStore.getState().readonly) return;
    if (!status || !live) {
      const devAlly =
        import.meta.env.DEV && DEV_BYPASS_AUTH && openCharacterId
          ? makeDevAllyEffects(openCharacterId)
          : [];
      if (openCharacterId && myStoreEffects.length + devAlly.length > 0) {
        setEncounterEffects(openCharacterId, [...myStoreEffects, ...devAlly]);
      } else {
        setEncounterEffects(null);
      }
      return;
    }
    const position: EncounterPosition = {
      round: live.encounter.round,
      currentCombatantId: live.encounter.currentCombatantId,
      phase: "turn-start",
      order: live.encounter.order ?? live.view.turnOrderIds,
    };
    lastFight.current = {
      campaignId: status.campaignId,
      characterId: status.characterId,
      myId: status.myId,
      operations: live.encounter.effectOps,
      position,
    };
    // The same projection every reader of another's sheet uses (`effectsOnTarget`).
    const effects = effectsOnTarget(status.myId, {
      encounter: { operations: live.encounter.effectOps, position },
      ...(status.characterId === openCharacterId
        ? { campaign: { docs: storeEffects, minute: clockMinute } }
        : {}),
    });
    setEncounterEffects(status.characterId, effects);
    const current = useCharacterStore.getState().character;
    const ownRow = live.view.rows.find((row) => row.id === status.myId);
    if (
      current?.id === status.characterId &&
      current.session.concentration &&
      (ownRow?.currentHp === 0 ||
        effectiveSessionConditions({
          ...current.session,
          encounterEffects: effects,
        }).some(conditionBreaksConcentration))
    ) {
      useCharacterStore.getState().setConcentration("", { undoable: false });
    }
  }, [
    status,
    live,
    setEncounterEffects,
    openCharacterId,
    myStoreEffects,
    storeEffects,
    clockMinute,
  ]);

  // The incapacitation sweep: a creature that can no longer act (0 HP, Unconscious,
  // Stunned…) loses its Concentration effects and the grapples it holds. Each device
  // answers for its own combatants (the DM's for the monsters, a player's for their
  // PC), so each revocation is written once; a revocation is idempotent anyway. The
  // first look at a fight only primes (a reload is not a fall).
  useEffect(() => {
    if (!live || !primaryId || !uid) {
      observedRows.current = null;
      return;
    }
    const scope = `${primaryId}:${live.encounter.epoch}`;
    const rows: IncapacitationRow[] = live.view.rows.map((row) => ({
      id: row.id,
      currentHp: row.currentHp,
      conditions: row.conditions,
    }));
    const before =
      observedRows.current?.scope === scope ? observedRows.current.rows : null;
    observedRows.current = { scope, rows };
    const myId = `pc-${uid}`;
    const kinds = new Map(live.view.rows.map((row) => [row.id, row.kind]));
    const ended = incapacitationSweep(before, rows, live.encounter.effectOps, (id) =>
      primaryIsDm ? kinds.get(id) === "monster" : id === myId
    );
    for (const effectId of ended) {
      void revokePersistentCombatEffect(primaryId, effectId).catch(() => {
        showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
      });
    }
    // Conditions given in this fight end early (Abjure Foes on damage) or ask their
    // target for a repeat save at its turn's end. Each device answers for its own
    // combatants' conditions, as the sweep does.
    const look: FightLook = {
      rows: live.view.rows.map((row) => ({
        id: row.id,
        currentHp: row.currentHp,
        tempHp: row.tempHp,
        conditions: row.conditions,
      })),
      currentCombatantId: live.encounter.currentCombatantId,
      // Who dealt each hit, so "only damage from you or your allies" can tell.
      hits: (live.encounter.events ?? []).flatMap((event) =>
        event.kind === "hp-damage"
          ? [
              {
                targetId: event.targetId,
                ...(event.attackerId ? { attackerId: event.attackerId } : {}),
              },
            ]
          : []
      ),
    };
    const priorLook =
      observedFight.current?.scope === scope ? observedFight.current.look : null;
    observedFight.current = { scope, look };
    const owns = (id: string) =>
      primaryIsDm ? kinds.get(id) === "monster" : id === myId;
    const condition = fightConditionEnds(
      live.encounter.effectOps,
      priorLook,
      look,
      fightSideOf(live.view.rows)
    );
    const active = foldCombatEffectOps(live.encounter.effectOps);
    const targetOf = new Map(active.map((e) => [e.id, e.target.combatantId]));
    for (const effectId of condition.ended) {
      const target = targetOf.get(effectId);
      if (!target || !owns(target)) continue;
      void revokePersistentCombatEffect(primaryId, effectId).catch(() => {
        showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
      });
    }
    // A due repeat save waits on its target's card (RepeatSavePrompt) until answered,
    // its effect ends, or the target's next turn starts.
    const saves = useRepeatSaveStore.getState();
    saves.prune({
      currentCombatantId: live.encounter.currentCombatantId,
      active: new Set(active.map((e) => e.id)),
    });
    for (const save of condition.saves) {
      if (!owns(save.targetId)) continue;
      // A track settled by its failures asks no more (Contagion lasts its duration).
      if (save.track && trackSettled(tallyOf(primaryId, save.id), save.track)) {
        continue;
      }
      const effect = active.find((e) => e.id === save.id);
      if (!effect) continue;
      saves.add({
        ...save,
        campaignId: primaryId,
        targetName: live.view.rows.find((row) => row.id === save.targetId)?.name ?? "",
        effect,
        turnSeen: live.encounter.currentCombatantId,
        ...(!primaryIsDm && save.targetId === myId && status?.characterId
          ? { characterId: status.characterId }
          : {}),
        ...(save.actorId !== undefined
          ? {
              actorName:
                live.view.rows.find((row) => row.id === save.actorId)?.name ?? "",
            }
          : {}),
      });
    }
    // A creature your Hex or Hunter's Mark is on just dropped to 0: on a later turn,
    // a Bonus Action moves the mark (the spell's trigger rule); a Vow of Enmity moves
    // with no action. A notice, not a prompt: the move row is already on the sheet
    // while the mark lasts.
    const doc = useCharacterStore.getState().character;
    if (primaryIsDm || !doc || doc.id !== status?.characterId) return;
    for (const offer of markDropOffers(
      doc,
      before,
      rows,
      live.encounter.effectOps,
      myId
    )) {
      showToast({
        message: t(
          offer.slot === "free" ? "combat.markCanMoveFree" : "combat.markCanMove",
          {
            source: localizeSrd(
              offer.sourceKind === "spell" ? "spell" : "class-feature",
              offer.sourceId,
              "name",
              locale
            ),
          }
        ),
        duration: 8000,
      });
    }
  }, [live, primaryId, primaryIsDm, uid, showToast, t, status, locale]);

  // My zones at a turn change (M9): the creature whose turn ended or starts may be
  // inside one that triggers then. The table says whether it is inside; a tap plays
  // the zone's damage on it through the tray. The first look at a fight primes. The
  // device that owns the caster asks: a player for their PC's zones, the DM for the
  // monsters' (the prompt waits under the monster's Scontro row).
  useEffect(() => {
    if (!live || !primaryId || !uid || (!status && !primaryIsDm)) {
      observedZoneTurn.current = null;
      return;
    }
    const scope = `${primaryId}:${live.encounter.epoch}`;
    const current = live.encounter.currentCombatantId;
    const prior =
      observedZoneTurn.current?.scope === scope ? observedZoneTurn.current : null;
    observedZoneTurn.current = { scope, current, ledger: prior?.ledger ?? {} };
    const myId = `pc-${uid}`;
    const monsters = new Set(
      live.view.rows.filter((row) => row.kind === "monster").map((row) => row.id)
    );
    const zones = activeZones(foldCombatEffectOps(live.encounter.effectOps)).filter(
      (zone) => (primaryIsDm ? monsters.has(zone.casterId) : zone.casterId === myId)
    );
    const pending = useZoneHitStore.getState();
    pending.keepZones(new Set(zones.map((z) => z.id)));
    if (!prior || prior.current === current) return;
    if (zones.length === 0) {
      pending.turnChanged([]);
      return;
    }
    const { hits, ledger } = zoneTurnHits(
      zones,
      { round: live.encounter.round, ended: prior.current, started: current },
      prior.ledger
    );
    observedZoneTurn.current = { scope, current, ledger };
    // Each question waits under its zone on Play (PlayZoneHits) until answered or
    // until the next turn change brings its own.
    pending.turnChanged(
      hits.map((hit) => ({
        ...hit,
        key: `${hit.zone.id}:${hit.creatureId}:${hit.kind}`,
        creatureName: live.view.rows.find((row) => row.id === hit.creatureId)?.name ?? "",
      }))
    );
  }, [live, primaryId, uid, status, primaryIsDm]);

  // Once-per-turn uses (Sneak Attack) come back on every turn, anyone's: an opportunity
  // attack on the enemy's turn can use it again. When the fight moves to a new turn,
  // the open PC's sheet recovers the uses spent in another turn. The first observation
  // of a fight is a silent prime (a reload is not a new turn).
  const currentTurn =
    live && live.encounter.currentCombatantId
      ? `${live.encounter.epoch}:${live.encounter.round}:${live.encounter.currentCombatantId}`
      : null;
  useEffect(() => {
    if (!status || !currentTurn || openCharacterId !== status.characterId) {
      observedTurn.current = null;
      return;
    }
    const previous = observedTurn.current;
    observedTurn.current = currentTurn;
    if (previous === null || previous === currentTurn) return;
    // The turn key without the epoch: "5:monster-1" (round:combatant).
    const turnKey = currentTurn.slice(currentTurn.indexOf(":") + 1);
    useCharacterStore.getState().dispatch({ kind: "recover-per-turn-trackers", turnKey });
  }, [status, currentTurn, openCharacterId]);

  // A flyer that can't hover falls when knocked Prone while aloft. The sheet has no
  // altitude, so the table plays the fall: a notice when Prone lands, never on load.
  useEffect(() => {
    if (!openCharacterId) {
      observedProne.current = null;
      return;
    }
    const previous = observedProne.current;
    observedProne.current = { characterId: openCharacterId, prone: proneAloft };
    if (previous?.characterId !== openCharacterId || previous.prone || !proneAloft)
      return;
    showToast({ message: t("combat.proneInFlight"), duration: 8000 });
  }, [openCharacterId, proneAloft, showToast, t]);

  // Concentration is character-owned state; standing target effects are campaign-owned.
  // Bridge the two at this existing shell listener only when the OPEN character is the
  // viewer's PC in the primary encounter. The first observation of each
  // campaign/epoch/actor scope is a silent prime (reload/hydration is not a drop). A
  // subsequent clear or swap appends exact inverse operations for the previous source.
  useEffect(() => {
    if (!status || !live || openCharacterId !== status.characterId) {
      observedConcentration.current = null;
      return;
    }
    const activeScope = `${status.campaignId}:${live.encounter.epoch}:${status.myId}`;

    const current = concentration as string;
    const previous = observedConcentration.current;
    observedConcentration.current = { scope: activeScope, sourceId: current };
    if (
      !previous ||
      previous.scope !== activeScope ||
      !previous.sourceId ||
      previous.sourceId === current
    ) {
      return;
    }

    const { campaignId, myId } = status;
    // The spell's end can carry a consequence the table plays (Fly: a target still
    // aloft falls).
    if (spellEndEffects(previous.sourceId).some((e) => e.kind === "fall-if-aloft")) {
      showToast({
        message: t("combat.spellEndFalls", {
          spell: localizeSrd("spell", previous.sourceId, "name", locale),
        }),
        duration: 8000,
      });
    }
    void revokePersistentCombatEffectsBySource(campaignId, {
      actorId: myId,
      sourceId: previous.sourceId,
    }).catch(() => {
      if (
        observedConcentration.current?.scope === activeScope &&
        observedConcentration.current.sourceId === current
      ) {
        observedConcentration.current = previous;
      }
      showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
    });
  }, [status, live, openCharacterId, concentration, showToast, t, locale]);

  // Transitional drain for effects queued by the previous deployed owner-client model.
  // New actions write the target's narrow combat subdoc directly and never depend on
  // this client being online; this only preserves already-running encounter data.
  useEffect(() => {
    if (!uid || !status || !live || live.myMaxHp <= 0) return;
    const pending = (live.encounter.memberEffects ?? []).filter(
      (effect) => effect.targetId === status.myId
    );
    if (pending.length === 0) return;
    const key = `${live.encounter.epoch}:${pending.map((effect) => effect.id).join(",")}`;
    if (deliveringEffects.current === key) return;
    deliveringEffects.current = key;
    void deliverQueuedMemberEffects({
      campaignId: status.campaignId,
      uid,
      characterId: status.characterId,
      targetId: status.myId,
      maxHp: live.myMaxHp,
    }).catch(() => {
      deliveringEffects.current = null;
      showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
    });
  }, [uid, status, live, showToast, t]);

  // The pip model — the dev seed wins; otherwise every active encounter reduced to a
  // PipState, each row carrying ITS OWN doc-derived roll-state.
  const pip = useMemo(() => {
    if (devPip) return devPip;
    if (!primaryId) return null;
    return buildPipModel(encounters, primaryId);
  }, [devPip, encounters, primaryId]);

  // FLICKER FIX — reconcile the two independently-timed sources into ONE consistent,
  // non-regressing publish (`combat-reconcile.ts`): the primary pip entry's turn-phase is
  // derived FROM `status` (the pip and the sheet band become a single derivation — no
  // stale-half publish), and while the player's own End-Turn write is still in flight
  // (`pendingTurn`) the turn stays optimistically advanced, so a lagging listener can never
  // republish the pre-advance "your turn" frame. Once the real read reflects the advance the
  // guard is inert; the marker is cleared below.
  const { status: pubStatus, pip: pubPip } = useMemo(
    () => reconcileCombatPublish(status, pip, pendingTurn),
    [status, pip, pendingTurn]
  );

  // Publish both shapes. The status + pip stay UNSCOPED (the pip is the user-wide
  // signal); the sheet scopes the status to the OPEN hero itself (`useSheetCombat`).
  // Clears on teardown so a leftover status never lingers after the mount unmounts.
  useEffect(() => {
    if (replayMode) return; // the flicker harness is the sole writer while it runs
    set(pubStatus, pubPip);
  }, [replayMode, pubStatus, pubPip, set]);

  // DEV ONLY — drive the turn-flicker replay: publish each scripted step ~120 ms apart, so a
  // real Chromium paint lands between them and the e2e's per-frame `.cp-state` poll can see (or
  // prove absent) the "your turn" flash. `raw` publishes the OLD direct set; `fixed` goes
  // through the same `reconcileCombatPublish` the producer uses. Tree-shaken from production.
  useEffect(() => {
    if (!import.meta.env.DEV || !replayMode) return;
    const steps = makeTurnFlickerSteps();
    const timers = steps.map((step, i) =>
      window.setTimeout(() => {
        if (replayMode === "raw") set(step.rawStatus, step.rawPip);
        else {
          const { status: s, pip: p } = reconcileCombatPublish(
            step.rawStatus,
            step.rawPip,
            step.pending
          );
          set(s, p);
        }
      }, i * 120)
    );
    return () => timers.forEach((tid) => window.clearTimeout(tid));
  }, [replayMode, set]);
  useEffect(() => () => set(null, null), [set]);

  // Retire the optimistic hand-off marker the instant the REAL (un-guarded) read reflects the
  // advance — the pointer moved off where the player pressed End Turn (or the fight ended). A
  // write FAILURE is handled at the source (`advanceSharedTurn` clears it), so it can't stick.
  useEffect(() => {
    if (pendingTurn && !pendingApplies(status, pendingTurn)) clearPendingTurn();
  }, [status, pendingTurn, clearPendingTurn]);

  // Turn-start cue (spec §5): when the shared pointer LANDS on the viewer's PC, fire a
  // gentle toast ONCE per turn-entry. Primed silently on first observe (never on mount /
  // reload while already your turn); re-fires only when the `campaignId:round` key advances.
  // Reads the RECONCILED status so the cue tracks the surfaced turn (never a stale frame).
  const seenTurnKey = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const key = turnStartKey(pubStatus);
    if (shouldToastTurnStart(seenTurnKey.current, key)) {
      showToast({ message: t("combatPip.yourTurnToast"), duration: 4000 });
    }
    seenTurnKey.current = key;
  }, [pubStatus, showToast, t]);

  return null;
}
