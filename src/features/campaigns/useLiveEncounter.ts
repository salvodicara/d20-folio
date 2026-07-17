/**
 * useLiveEncounter — subscribe LIVE to ONE campaign's encounter from a context that
 * has no campaign store loaded (the character cockpit's in-combat status region, P2).
 *
 * The campaign hub already holds the live campaign (via `useCampaignSubscription` →
 * `campaignStore`) and assembles the encounter view inline; the SHEET does not. So this
 * hook self-contains the SAME pipeline the hub uses — campaign doc + every PC member's
 * `combat/state` subdoc, merged through {@link derivePcLive} into
 * {@link buildEncounterView} — so the sheet and the hub agree EXACTLY on round, turn
 * order, and whose turn it is (single source of truth, golden rule 6; no second
 * assembly to drift). Reuses every existing primitive (no parallel view logic).
 *
 * Cost posture (free-tier): this is the explicit cost of mandate C+D — it runs ONLY on
 * a positive in-combat hit (the caller gates it behind the cheap one-shot
 * {@link pcEncounter} resolver), so a sheet NOT in combat pays zero reads/listeners. The
 * live campaign-membership READ grant already lets a co-member read peers' `combat/state` (the
 * same data the hub reads), so this adds no new privilege.
 *
 * Dev bypass: `subscribeToCampaign` would hit a real (absent) doc, so under bypass the
 * hook resolves the in-memory {@link makeDevCampaign} fixture once — keeping the e2e /
 * screenshot harness rendering the seeded encounter on the sheet with no Firestore.
 */

import { useEffect, useMemo, useState } from "react";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { subscribeToCampaign } from "@/features/campaigns/campaign-io";
import { resolveDevCampaign } from "@/features/campaigns/dev-fixture";
import {
  useMemberCharacterDocs,
  type MemberCharacterRef,
} from "@/features/campaigns/useMemberCharacterDocs";
import { usePartyCombatStates } from "@/features/campaigns/usePartyCombatStates";
import { derivePcLive } from "@/features/campaigns/party-stats";
import { encounterRollFor } from "@/features/campaigns/encounter";
import { buildEncounterView, type PcLive } from "@/features/campaigns/encounter-view";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

/** The live encounter for one campaign: its structure + the assembled, sorted view. */
export interface LiveEncounter {
  encounter: EncounterState;
  view: NonNullable<ReturnType<typeof buildEncounterView>>;
}

/**
 * Subscribe to `campaignId`'s live encounter (or `null` when `campaignId` is null, the
 * campaign has no running encounter, or it could not be read). Hooks are always called
 * (the refs collapse to empty when there is no encounter), so this is safe to mount
 * unconditionally; pass `null` to keep it inert.
 */
export function useLiveEncounter(
  uid: string | undefined,
  campaignId: string | null,
  /** When the viewer is the DM/admin of this campaign, hidden ambush combatants stay in
   *  the view (they own the table). Defaults to `false` (a player's own cockpit read). */
  viewerIsDm = false
): LiveEncounter | null {
  const [campaign, setCampaign] = useState<CampaignDoc | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Settle asynchronously (a microtask / the snapshot callback), never synchronously
    // in the effect body — the `react-hooks/set-state-in-effect` discipline.
    const settle = (doc: CampaignDoc | null): void => {
      if (!cancelled) setCampaign(doc);
    };
    if (!uid || !campaignId) {
      void Promise.resolve().then(() => settle(null));
      return () => {
        cancelled = true;
      };
    }
    if (DEV_BYPASS_AUTH) {
      // No real listener under bypass — resolve the seeded fixture once (the pip-scenario
      // campaign when one is seeded, so the roller's live payload matches the pip).
      const dev = resolveDevCampaign(campaignId);
      void Promise.resolve().then(() => settle(dev));
      return () => {
        cancelled = true;
      };
    }
    const unsub = subscribeToCampaign(uid, campaignId, settle, () => settle(null));
    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid, campaignId]);

  const encounter = campaign?.encounter ?? null;

  // Every PC combatant's (uid, characterId) — the live-read key set. Empty (so the
  // member hooks tear down) whenever there is no encounter.
  const refs = useMemo<MemberCharacterRef[]>(() => {
    if (!encounter) return [];
    const out: MemberCharacterRef[] = [];
    for (const c of encounter.combatants) {
      if (c.kind === "pc") out.push({ uid: c.memberUid, characterId: c.characterId });
    }
    return out;
  }, [encounter]);

  const docs = useMemberCharacterDocs(refs);
  const combatStates = usePartyCombatStates(refs);

  const encounterInit = campaign?.encounterInit;
  const pcLiveById = useMemo<Record<string, PcLive>>(() => {
    const out: Record<string, PcLive> = {};
    for (const ref of refs) {
      const st = docs[ref.uid];
      if (st?.status === "ready") {
        // The roll comes off the campaign's `encounterInit` table (the initiative
        // SSOT) — the SAME live campaign doc this hook already subscribes to.
        out[`pc-${ref.uid}`] = derivePcLive(
          st.doc,
          combatStates[ref.uid] ?? null,
          encounterRollFor(encounterInit, ref.uid)
        );
      }
    }
    return out;
  }, [refs, docs, combatStates, encounterInit]);

  // A player's cockpit read keeps hidden (ambush) monsters filtered; the topbar pip passes
  // `viewerIsDm` for a PC-less DM primary, so the DM's pip can name a hidden actor's turn.
  const view = useMemo(
    () => (encounter ? buildEncounterView(encounter, pcLiveById, viewerIsDm) : null),
    [encounter, pcLiveById, viewerIsDm]
  );

  return useMemo(
    () => (encounter && view ? { encounter, view } : null),
    [encounter, view]
  );
}
