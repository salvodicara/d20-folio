/**
 * The party as every campaign tab sees it: each member's character doc with its live
 * combat state folded in (missing while it loads, null when it can't be read), and each
 * character's name as the Gruppo panel shows it (`partyNames`).
 */
import { useMemo } from "react";

import { partyNames } from "@/domains/campaign/party-rows-view";
import { hydrateMemberDoc } from "@/features/campaigns/party-stats";
import {
  useMemberCharacterDocs,
  type MemberCharacterRef,
} from "@/features/campaigns/useMemberCharacterDocs";
import { usePartyCombatStates } from "@/features/campaigns/usePartyCombatStates";
import type { CampaignDoc } from "@/types/campaign";
import type { CharacterDoc } from "@/types/character";

export function useLiveDocs(campaign: CampaignDoc): Record<string, CharacterDoc | null> {
  const refs = useMemo<MemberCharacterRef[]>(
    () =>
      Object.entries(campaign.memberDetails).flatMap(([uid, m]) =>
        m.characterId ? [{ uid, characterId: m.characterId }] : []
      ),
    [campaign.memberDetails]
  );
  const docs = useMemberCharacterDocs(refs);
  const combat = usePartyCombatStates(refs);
  return useMemo(() => {
    const out: Record<string, CharacterDoc | null> = {};
    for (const { uid } of refs) {
      const st = docs[uid];
      if (st?.status === "ready") out[uid] = hydrateMemberDoc(st.doc, combat[uid]);
      else if (st?.status === "error") out[uid] = null;
    }
    return out;
  }, [refs, docs, combat]);
}

/** Each character's name by member, as the Gruppo panel shows it. */
export function usePartyNames(campaign: CampaignDoc): Record<string, string> {
  const live = useLiveDocs(campaign);
  return useMemo(() => partyNames(campaign, live), [campaign, live]);
}
