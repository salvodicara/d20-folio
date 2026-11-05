/**
 * The campaign clock projected onto the sheets that read it (`lib/play/clock.ts`),
 * with this release's rules deployed. The open sheet gets the projection (its own,
 * or a teammate's read-only one, which the store reads at the clock: `docAtClock`);
 * the party's docs are read at the clock directly.
 */
import { useEffect } from "react";

import { combatEffectsV26On } from "@/lib/deployed-rules";
import { docAtClock, withCampaignClock } from "@/lib/play/campaign-clock";
import type { ProjectedCampaignClock } from "@/lib/play/clock";
import { useCharacterStore } from "@/stores/characterStore";
import type { CampaignDoc } from "@/types/campaign";
import type { CharacterDoc } from "@/types/character";

/** The campaign's clock as a sheet reads it, or null (no campaign, or the rules that
 *  hold it are not deployed). */
export function projectedClock(
  campaign: Pick<CampaignDoc, "id" | "gameClock"> | null | undefined
): ProjectedCampaignClock | null {
  if (!campaign || !combatEffectsV26On()) return null;
  return { campaignId: campaign.id, clock: campaign.gameClock ?? { minute: 0 } };
}

/** A member's character as it stands on its campaign's clock now. */
export function atCampaignClock(
  doc: CharacterDoc,
  campaign: Pick<CampaignDoc, "id" | "gameClock"> | null | undefined
): CharacterDoc {
  const clock = projectedClock(campaign);
  return clock ? docAtClock(withCampaignClock(doc, clock)) : doc;
}

/** Keep the open sheet projected on `campaign`'s clock; a reload that drops the
 *  projection gets it back. */
export function useCampaignClockProjection(
  characterId: string | undefined,
  campaign: Pick<CampaignDoc, "id" | "gameClock"> | null | undefined
): void {
  const setCampaignClock = useCharacterStore((s) => s.setCampaignClock);
  const projected = useCharacterStore(
    (s) => s.character?.session.campaignClock !== undefined
  );
  const id = campaign?.id;
  const clock = campaign?.gameClock;
  useEffect(() => {
    if (!characterId) return;
    setCampaignClock(
      characterId,
      projectedClock(id ? { id, ...(clock ? { gameClock: clock } : {}) } : null)
    );
  }, [characterId, id, clock, projected, setCampaignClock]);
}
