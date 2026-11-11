/**
 * The DM's party summary (headless): every attached hero on one row (AC, max HP,
 * initiative, the passives, speed, senses, saves), the best of each comparable column
 * marked, from the same live derivation the party cards use. Shared by the classic DM
 * tab and the new campaign screen; nothing is copied onto the campaign document.
 */
import { derivePartyMemberStats } from "@/features/campaigns/party-stats";
import {
  partySummary,
  type PartySummary,
  type PartySummaryMember,
} from "@/features/campaigns/party-summary";
import type {
  MemberCharacterRef,
  MemberDocState,
} from "@/features/campaigns/useMemberCharacterDocs";
import type { CampaignDoc } from "@/types/campaign";

/** The sheets to load: one per member with an attached character. */
export function partyMemberRefs(campaign: CampaignDoc | null): MemberCharacterRef[] {
  if (!campaign) return [];
  return Object.entries(campaign.memberDetails).flatMap(([uid, m]) =>
    m.characterId ? [{ uid, characterId: m.characterId }] : []
  );
}

export interface PartySummaryView extends PartySummary {
  /** Attached sheets not loaded yet. */
  loading: number;
}

export function partySummaryView(
  campaign: CampaignDoc | null,
  docs: Readonly<Record<string, MemberDocState>>
): PartySummaryView {
  const refs = partyMemberRefs(campaign);
  const members: PartySummaryMember[] = refs.flatMap(({ uid }) => {
    const state = docs[uid];
    if (state?.status !== "ready") return [];
    const snapshot = campaign?.memberDetails[uid]?.character?.name;
    return [
      {
        uid,
        name: snapshot?.trim() || state.doc.character.name,
        stats: derivePartyMemberStats(state.doc),
      },
    ];
  });
  return { ...partySummary(members), loading: refs.length - members.length };
}
