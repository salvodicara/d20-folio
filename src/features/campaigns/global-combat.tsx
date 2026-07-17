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

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { subscribeToSharedCampaigns } from "@/features/campaigns/campaign-io";
import { viewerActiveEncounters } from "@/features/campaigns/encounter";
import { useLiveEncounter } from "@/features/campaigns/useLiveEncounter";
import {
  makeDevPip,
  makeDevGlobalCombat,
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

/** Renderless: subscribes the shell-level combat status + pip model and publishes them. */
export function GlobalCombatMount(): null {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  const pin = usePinStore((s) => s.pin);
  const showToast = useToastStore((s) => s.showToast);
  const set = useCombatStatusStore((s) => s.set);
  // The player's own End-Turn hand-off in flight (set by the sheet) — the reconcile guard
  // that stops a lagging listener regressing the optimistic advance to "your turn".
  const pendingTurn = useCombatStatusStore((s) => s.pendingTurn);
  const clearPendingTurn = useCombatStatusStore((s) => s.clearPendingTurn);
  const [campaigns, setCampaigns] = useState<CampaignDoc[]>([]);
  // The OPTIMISTIC open campaign (the hub the viewer is on, if any) — `null` off the hub.
  // Overlaid below so the pip reflects the viewer's OWN start/end/begin-turns in the same
  // tick, not ~2 s later when the autosave-debounced write echoes (the pip's "no echo lag").
  const openCampaign = useCampaignStore((s) => s.campaign);

  // DEV ONLY (tree-shaken from prod — `DEV_BYPASS_AUTH` is statically false): the
  // screenshot / a11y harness seeds a deterministic pip via the `d20-dev-pip` flag, so
  // every pip STATE is shootable without the live combat-state plumbing. When set we skip
  // the real resolution entirely (one writer, no race).
  const devPip = useMemo(() => (DEV_BYPASS_AUTH ? makeDevPip(devPipMode()) : null), []);
  // The needs-roll pip's inline roller reads the live status; the dev seed publishes a
  // matching one (non-null only for needsroll) so the C4b shot/a11y harness can open it.
  // DEV ONLY — the turn-flicker regression harness. When set, the producer REPLAYS the
  // End-Turn reconcile sequence (see `makeTurnFlickerSteps`) instead of the live resolution,
  // so `turn-indicator-flicker.spec.ts` can prove the flash in REAL Chromium (jsdom can't).
  const replayMode = useMemo(
    () => (DEV_BYPASS_AUTH ? turnFlickerReplayMode() : null),
    []
  );
  const devStatus = useMemo(
    () => (DEV_BYPASS_AUTH ? makeDevGlobalCombat(devPipMode()) : null),
    []
  );

  // ONE live listener over the user's shared campaigns — re-fires the moment an encounter
  // starts/ends, so the pip lights/clears with no reload.
  useEffect(() => {
    let cancelled = false;
    const settle = (next: CampaignDoc[]): void => {
      if (cancelled) return;
      setCampaigns(next);
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

  // The viewer's OWN PC status (the sheet shape) — built only when the primary is the
  // viewer's PC fight (a PC-less DM primary publishes no sheet status; their cockpit isn't
  // in this fight). The merged live row carries the override-first init bonus / raw roll /
  // max HP, the SAME values the party card derives (golden rule 6).
  const status = useMemo<GlobalCombat | null>(() => {
    if (devPip) return devStatus; // dev seed: needs-roll publishes a status, others null
    if (!uid || !primaryId || primaryIsDm || !live) return null;
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
  }, [devPip, devStatus, uid, primaryId, primaryIsDm, live]);

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
    if (!replayMode) return;
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
