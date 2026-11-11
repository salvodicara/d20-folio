/**
 * Attaching a member's character to the campaign (headless), shared by the classic
 * party card and the new campaign screen.
 *
 * One campaign per character: a hero already attached elsewhere is refused and that
 * campaign is named (a nameless refusal read like corrupted data, 2026-07-02). The
 * claim is atomic (B07): a concurrent attach that wins the race reverts this one. The
 * party reads the snapshot written with the claim; detaching ("") is always allowed.
 * Mid-fight the encounter holds a (uid, characterId) reference, so the character
 * cannot change until the fight ends.
 */
import type { TFunction } from "i18next";
import {
  attachMemberCharacter,
  listSharedCampaigns,
} from "@/features/campaigns/campaign-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { buildMemberSnapshot } from "@/features/campaigns/member-snapshot";
import type { RosterCharacterDoc } from "@/lib/character-cache";
import { useToastStore } from "@/stores/toastStore";
import type { CampaignDoc, MemberCharacterSnapshot } from "@/types/campaign";

type Member = CampaignDoc["memberDetails"][string];

export interface AttachChoices {
  /** Only my own card, and not mid-fight. */
  canChange: boolean;
  /** The blank choice's label key: it detaches a hero, or attaches none. */
  blank: "campaignHub.detachCharacter" | "campaignHub.attachNone";
  options: Array<{ id: string; name: string }>;
}

export function attachChoices(
  member: Member,
  roster: readonly RosterCharacterDoc[],
  opts: { isMe: boolean; inCombat: boolean }
): AttachChoices {
  const attached = member.characterId;
  // An attached hero missing from the roster (since deleted, a stale doc) still shows
  // as itself, never as a lying "Detach character".
  const stale =
    attached && member.character && !roster.some((c) => c.id === attached)
      ? [{ id: attached, name: member.character.name }]
      : [];
  return {
    canChange: opts.isMe && !opts.inCombat,
    blank: attached ? "campaignHub.detachCharacter" : "campaignHub.attachNone",
    options: [...stale, ...roster.map((c) => ({ id: c.id, name: c.character.name }))],
  };
}

export type AttachResult = "attached" | "elsewhere" | "conflict" | "failed";

const toast = (message: string, duration: number): void => {
  useToastStore.getState().showToast({ message, duration });
};

/** Attach `characterId` ("" detaches) for `uid` on the open campaign. */
export async function attachCharacter(
  characterId: string,
  uid: string,
  roster: readonly RosterCharacterDoc[],
  t: TFunction
): Promise<AttachResult> {
  const campaign = useCampaignStore.getState().campaign;
  if (!campaign) return "failed";
  if (characterId) {
    let mine: Awaited<ReturnType<typeof listSharedCampaigns>>;
    try {
      mine = await listSharedCampaigns(uid);
    } catch {
      toast(t("campaignHub.attachFailed"), 5000);
      return "failed";
    }
    const elsewhere = mine.find(
      (c) => c.id !== campaign.id && c.memberDetails[uid]?.characterId === characterId
    );
    if (elsewhere) {
      toast(t("campaignHub.attachAlreadyElsewhere", { campaign: elsewhere.name }), 6000);
      return "elsewhere";
    }
  }
  // The snapshot through the one seam: AC derived as the sheet shows it, never the
  // stored value (a stale 0 for a hero never opened).
  const doc = roster.find((c) => c.id === characterId);
  const snapshot: MemberCharacterSnapshot | null = doc ? buildMemberSnapshot(doc) : null;
  const member = campaign.memberDetails[uid];
  const previous = member?.characterId ?? null;
  const { setCampaign } = useCampaignStore.getState();
  if (member) {
    setCampaign({
      ...campaign,
      memberDetails: {
        ...campaign.memberDetails,
        [uid]: { ...member, characterId: characterId || null, character: snapshot },
      },
    });
  }
  try {
    const outcome = await attachMemberCharacter(
      campaign.id,
      uid,
      previous,
      characterId || null,
      snapshot
    );
    if (outcome === "conflict") {
      setCampaign(campaign);
      toast(t("campaignHub.attachRaceLost"), 6000);
      return "conflict";
    }
    return "attached";
  } catch {
    setCampaign(campaign);
    toast(t("campaignHub.attachFailed"), 5000);
    return "failed";
  }
}
