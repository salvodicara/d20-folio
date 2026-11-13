/**
 * The open character's party out of a fight: the campaign's other characters, named
 * as the party panel names them, for the «Su chi?» step's «Il gruppo» group. Published
 * by the shell (`global-combat`) with this release's rules deployed; a cast out of a
 * fight that leaves a state on one of them writes it on the campaign clock.
 */
import { create } from "zustand";

import type { CampaignDoc } from "@/types/campaign";
import type { PortraitCrop } from "@/types/character";
import type { CombatantRef } from "@/types/combat-effect";

export interface PartyRoster {
  campaignId: string;
  /** The open character this party is for. */
  characterId: string;
  /** This player's combatant id (`pc-<uid>`). */
  selfId: string;
  /** The campaign clock's minute now. */
  minute: number;
  /** The other members' characters. */
  members: Array<{
    ref: Extract<CombatantRef, { kind: "pc" }>;
    name: string;
    portraitUrl?: string | null;
    portraitCrop?: PortraitCrop | null;
  }>;
}

export const usePartyRosterStore = create<{
  party: PartyRoster | null;
  /** The open character whose party the shell has read (a party, or none). */
  resolvedFor: string | null;
  setParty: (party: PartyRoster | null, resolvedFor: string | null) => void;
}>((set) => ({
  party: null,
  resolvedFor: null,
  setParty: (party, resolvedFor) => set({ party, resolvedFor }),
}));

/** How long a cast waits for the shell to read the party before it goes on without. */
export const PARTY_WAIT_MS = 4000;

/** The party of `characterId` is known: read by the shell, a party or none. */
export function partyKnown(characterId: string): boolean {
  const { party, resolvedFor } = usePartyRosterStore.getState();
  return resolvedFor === characterId || party?.characterId === characterId;
}

/**
 * Resolves once the party of `characterId` is known, or after `ms`. The shell reads
 * the campaign after the sheet can already be clicked (rehearsal, 2026-11-13).
 */
export function partyKnownSoon(characterId: string, ms = PARTY_WAIT_MS): Promise<void> {
  if (partyKnown(characterId)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(done, ms);
    const unsubscribe = usePartyRosterStore.subscribe(() => {
      if (partyKnown(characterId)) done();
    });
  });
}

/** The party of `uid`'s character `characterId` in `campaign`. */
export function partyRosterOf(
  campaign: Pick<CampaignDoc, "id" | "memberDetails" | "gameClock">,
  uid: string,
  characterId: string
): PartyRoster {
  return {
    campaignId: campaign.id,
    characterId,
    selfId: `pc-${uid}`,
    minute: campaign.gameClock?.minute ?? 0,
    members: Object.entries(campaign.memberDetails).flatMap(([memberUid, member]) =>
      memberUid !== uid && member.characterId
        ? [
            {
              ref: {
                kind: "pc" as const,
                combatantId: `pc-${memberUid}`,
                memberUid,
                characterId: member.characterId,
              },
              name: member.character?.name ?? member.displayName,
              portraitUrl: member.character?.portraitUrl ?? null,
              portraitCrop: member.character?.portraitCrop ?? null,
            },
          ]
        : []
    ),
  };
}
