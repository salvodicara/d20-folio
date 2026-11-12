/**
 * Aura of Protection across the party (A′, coordinator 2026-11-12). The open sheet's
 * own aura (a paladin of level 6+, able to act) is published on its member entry of
 * the campaign doc, on change plus a heartbeat (`auraWrite`), so a re-render never
 * writes. Every other member's fresh aura reaches this sheet's saves (`allyAura`) as a
 * runtime overlay, on by default; the player turns one off with its chip until they
 * tap it again or rest. Zero new listeners: the campaign doc is already live here.
 */
import { useEffect, useState } from "react";
import { create } from "zustand";

import { setMemberAura } from "@/features/campaigns/campaign-io";
import {
  allyAura,
  allyAuraOffers,
  auraWrite,
  publishedAura,
  type PartyAura,
} from "@/lib/play/aura-of-protection";
import { useCharacterStore } from "@/stores/characterStore";
import type { CampaignDoc } from "@/types/campaign";

/** The party's fresh auras for the open sheet's chips (on, or stepped out of). */
export const usePartyAuraOffers = create<{
  offers: ReturnType<typeof allyAuraOffers>;
  setOffers: (offers: ReturnType<typeof allyAuraOffers>) => void;
}>((set) => ({ offers: [], setOffers: (offers) => set({ offers }) }));

/** How often freshness and the heartbeat are looked at again while the sheet is open. */
const TICK_MS = 10 * 60 * 1000;

/** The other members' published auras, with the names their sheets show. */
export function partyAurasOf(campaign: CampaignDoc): PartyAura[] {
  return Object.values(campaign.memberDetails).flatMap((member) =>
    member.aura && member.characterId
      ? [
          {
            characterId: member.characterId,
            name: member.character?.name ?? member.displayName,
            aura: member.aura,
          },
        ]
      : []
  );
}

export function usePartyAura(
  campaign: CampaignDoc | undefined,
  uid: string | undefined,
  openCharacterId: string | null
): void {
  const character = useCharacterStore((s) => s.character);
  const readonly = useCharacterStore((s) => s.readonly);
  const setPartyAura = useCharacterStore((s) => s.setPartyAura);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // This sheet's own aura, published for the party.
  const published = character && !readonly ? publishedAura(character) : null;
  const stored = uid ? campaign?.memberDetails[uid]?.aura : undefined;
  const write =
    campaign && uid && character && !readonly && character.id === openCharacterId
      ? auraWrite(published, stored, now)
      : null;
  const writeKey = write
    ? JSON.stringify(write.kind === "set" ? { ...write.aura, at: 0 } : write)
    : "";
  useEffect(() => {
    if (!write || !campaign || !uid) return;
    void setMemberAura(campaign.id, uid, write.kind === "set" ? write.aura : null);
    // One write per change or heartbeat: `writeKey` ignores the time it carries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeKey, campaign?.id, uid, stored?.at]);

  // The best fresh aura of another member, on this sheet's saves.
  const received =
    campaign && openCharacterId && character
      ? allyAura(
          partyAurasOf(campaign),
          openCharacterId,
          now,
          character.session.activeFeatures ?? []
        )
      : null;
  const receivedKey = JSON.stringify(received);
  const offers =
    campaign && openCharacterId && character
      ? allyAuraOffers(
          partyAurasOf(campaign),
          openCharacterId,
          now,
          character.session.activeFeatures ?? []
        )
      : [];
  const offersKey = JSON.stringify(offers);
  const setOffers = usePartyAuraOffers((s) => s.setOffers);
  useEffect(() => {
    setOffers(offers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offersKey, setOffers]);
  useEffect(() => {
    if (openCharacterId) setPartyAura(openCharacterId, received);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivedKey, openCharacterId, setPartyAura]);
}
