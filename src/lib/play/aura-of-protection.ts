/**
 * Aura of Protection for allies (SRD 5.2.1 Paladin, level 6), headless. A creature
 * in a paladin's aura adds the paladin's Charisma modifier (minimum +1) to its saving
 * throws, while the paladin isn't Incapacitated; the aura reaches 10 ft, 30 ft from
 * level 18 (Aura Expansion). In several auras the creature gets one bonus, its pick:
 * the best. Whether it stands in range is the table's, so the player says it (an
 * `in-aura:<characterId>` state on their sheet). The paladin's own half is the
 * class feature's `save-bonus`.
 */
import type { GrantSource } from "@/lib/grants";

/** A party member who may hold the aura, as the ally's sheet sees them. */
export interface AuraSource {
  characterId: string;
  name: string;
  chaMod: number;
  paladinLevel: number;
  incapacitated: boolean;
}

export interface AuraOffer extends AuraSource {
  rangeFt: number;
  bonus: number;
}

export const inAuraKey = (characterId: string): string => `in-aura:${characterId}`;

/** The auras the ally can say they stand in: another paladin's, level 6+, acting. */
export function auraOffers(
  party: ReadonlyArray<AuraSource>,
  selfId: string
): AuraOffer[] {
  return party
    .filter((p) => p.characterId !== selfId && p.paladinLevel >= 6 && !p.incapacitated)
    .map((p) => ({
      ...p,
      rangeFt: p.paladinLevel >= 18 ? 30 : 10,
      bonus: Math.max(1, p.chaMod),
    }));
}

/** The one aura bonus the ally's saves get now, or null. */
export function auraSaveBonus(
  activeFeatures: ReadonlyArray<string>,
  party: ReadonlyArray<AuraSource>,
  selfId: string
): { from: string; bonus: number } | null {
  const lit = new Set(activeFeatures);
  const best = auraOffers(party, selfId)
    .filter((offer) => lit.has(inAuraKey(offer.characterId)))
    .sort((a, b) => b.bonus - a.bonus)[0];
  return best ? { from: best.characterId, bonus: best.bonus } : null;
}

/** The bonus as a grant source the sheet's saves read. */
export function auraSaveSource(aura: { from: string; bonus: number }): GrantSource {
  return {
    id: `aura-of-protection:${aura.from}`,
    ref: { kind: "class-feature", key: "paladin-aura-of-protection" },
    grants: [{ type: "save-bonus", amount: aura.bonus }],
  };
}
