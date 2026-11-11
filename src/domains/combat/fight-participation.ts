/**
 * Fight participation (headless): a member sits a fight out or comes back in; the turn
 * order leaves out who sat out (monsters always take their turns); beginning the turns
 * with some heroes unrolled sits them out (they stay targetable). And the DM's seat:
 * a DM with their own character (a DMPC) fights as a card on the party grid, a DM with
 * none is the banner above it. Shared by the classic party and the new fight screen.
 */
import type { TFunction } from "i18next";
import { setEncounterParticipation } from "@/features/campaigns/campaign-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

type Skipped = Readonly<Record<string, boolean>>;

/** The sat-out table after `uid` sits out (`participating` false) or comes back. */
export function skippedAfter(
  skipped: Skipped,
  uid: string,
  participating: boolean
): Record<string, boolean> {
  if (!participating) return { ...skipped, [uid]: true };
  return Object.fromEntries(Object.entries(skipped).filter(([key]) => key !== uid));
}

/** The turn order without the heroes who sat out. */
export function participatingIds(
  encounter: Pick<EncounterState, "combatants">,
  turnOrderIds: readonly string[],
  skipped: Skipped
): string[] {
  return turnOrderIds.filter((id) => {
    const combatant = encounter.combatants.find((candidate) => candidate.id === id);
    return combatant?.kind !== "pc" || !skipped[combatant.memberUid];
  });
}

/** Beginning with a partial table: each hero who has not rolled sits out. */
export function skippedAtBegin(
  encounter: Pick<EncounterState, "combatants">,
  skipped: Skipped,
  rolledIds: readonly string[]
): Record<string, boolean> {
  const next = { ...skipped };
  for (const combatant of encounter.combatants) {
    if (combatant.kind === "pc" && !rolledIds.includes(combatant.id)) {
      next[combatant.memberUid] = true;
    }
  }
  return next;
}

/**
 * Sit out of the fight or come back in: shown at once, then written (a per-member
 * field, so it queues offline); a refused write puts the campaign back.
 */
export function setFightParticipation(
  campaign: CampaignDoc,
  uid: string,
  participating: boolean
): void {
  const { setCampaign } = useCampaignStore.getState();
  setCampaign({
    ...campaign,
    encounterSkipped: skippedAfter(campaign.encounterSkipped ?? {}, uid, participating),
  });
  void setEncounterParticipation(campaign.id, uid, participating).catch(
    (error: unknown) => {
      console.error("Encounter participation write failed", error);
      setCampaign(campaign);
    }
  );
}

export interface DmSeat {
  dmUid: string;
  dmName: string;
  dmIsMe: boolean;
  /** The DM fights with their own character (a DMPC card on the grid). */
  dmPlays: boolean;
  /** The members shown as cards: everyone but a DM with no character. */
  gridUids: string[];
}

export function dmSeat(
  campaign: Pick<CampaignDoc, "dmUid" | "memberDetails">,
  currentUid: string | undefined,
  t: TFunction
): DmSeat {
  const { dmUid, memberDetails } = campaign;
  const dm = memberDetails[dmUid];
  return {
    dmUid,
    dmName: dm?.displayName || t("campaignHub.unnamedPlayer"),
    dmIsMe: dmUid === currentUid,
    dmPlays: !!dm?.character,
    gridUids: Object.entries(memberDetails)
      .filter(([, member]) => !(member.role === "dm" && !member.character))
      .map(([uid]) => uid),
  };
}
