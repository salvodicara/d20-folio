/**
 * The effects others left on each PC of a campaign, for every view that reads a
 * teammate's sheet (the DM's fight rows, the party, the fight tab): the live fight's
 * effect log and the campaign's effects out of a fight at the clock's minute, through
 * the one projection (`effectsOnTarget`, `effectiveDoc`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { subscribeCampaignEffects } from "@/features/campaigns/campaign-effects-io";
import { combatEffectsV26On } from "@/lib/deployed-rules";
import { diagnosticsLog } from "@/lib/diagnostics";
import type { CampaignEffectDoc } from "@/lib/play/campaign-effects";
import { effectsOnTarget, type TargetEffectSources } from "@/lib/play/effective-doc";
import type { CampaignDoc } from "@/types/campaign";
import type { ActiveCombatEffect } from "@/types/combat-effect";

/** Where a campaign's effects come from, for `effectsOnTarget`. */
export function campaignEffectSources(
  campaign: Pick<CampaignDoc, "encounter" | "gameClock"> | null | undefined,
  storeDocs: ReadonlyArray<CampaignEffectDoc>
): TargetEffectSources {
  const encounter = campaign?.encounter;
  return {
    ...(encounter
      ? {
          encounter: {
            operations: encounter.effectOps,
            position: {
              round: encounter.round,
              currentCombatantId: encounter.currentCombatantId,
              phase: "turn-start" as const,
              order: encounter.order ?? encounter.combatants.map(({ id }) => id),
            },
          },
        }
      : {}),
    campaign: { docs: storeDocs, minute: campaign?.gameClock?.minute ?? 0 },
  };
}

/** The campaign's effects out of a fight, live (none without this release's rules). */
export function useCampaignEffectDocs(
  campaignId: string | null | undefined
): ReadonlyArray<CampaignEffectDoc> {
  const id = campaignId && combatEffectsV26On() ? campaignId : null;
  const [read, setRead] = useState<{ id: string; docs: CampaignEffectDoc[] } | null>(
    null
  );
  useEffect(() => {
    if (!id) return;
    return subscribeCampaignEffects(
      id,
      (docs) => setRead({ id, docs }),
      (error) =>
        diagnosticsLog("warn", "campaign.effects-read-failed", { message: String(error) })
    );
  }, [id]);
  return useMemo(() => (read && read.id === id ? read.docs : []), [read, id]);
}

/** The effects others left on member `uid`'s PC in `campaign`. */
export function useEffectsOnParty(
  campaign:
    | (Pick<CampaignDoc, "id" | "encounter" | "gameClock"> & object)
    | null
    | undefined
): (uid: string) => ActiveCombatEffect[] {
  const docs = useCampaignEffectDocs(campaign?.id);
  const sources = useMemo(() => campaignEffectSources(campaign, docs), [campaign, docs]);
  return useCallback((uid: string) => effectsOnTarget(`pc-${uid}`, sources), [sources]);
}
