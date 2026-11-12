/**
 * Aura of Protection for allies (SRD 5.2.1 Paladin, level 6), headless. A creature
 * in a paladin's aura adds the paladin's Charisma modifier (minimum +1) to its saving
 * throws, while the paladin isn't Incapacitated; the aura reaches 10 ft, 30 ft from
 * level 18 (Aura Expansion). In several auras the creature gets one bonus, its pick:
 * the best. Whether it stands in range is the table's, so the player says it (an
 * `in-aura:<characterId>` state on their sheet). The paladin's own half is the
 * class feature's `save-bonus`.
 */
import { abilityModifier } from "@/lib/ability";
import { aggregateCharacterGrants, effectiveConditions } from "@/lib/aggregate-character";
import { INCAPACITATING_CONDITIONS } from "@/lib/combat-test-context";
import { aggregateAbilityScores } from "@/lib/compute";
import type { GrantSource } from "@/lib/grants";
import type { CharacterDoc } from "@/types/character";
export { partyAuraSource } from "./aura-source";
import { OUT_OF_AURA_PREFIX } from "./aura-source";

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

// ── Published by the paladin's own sheet, read by the allies' sheets ───────────────

/** What the paladin's sheet publishes for its party: the bonus and the reach. */
export interface PublishedAura {
  bonus: number;
  reachFt: number;
}

/** A party member's published aura, with when it was last written (ms). */
export interface PartyAura {
  characterId: string;
  name: string;
  aura: PublishedAura & { at: number };
}

/** How long a published aura counts as in play: a paladin whose sheet has not
 *  written for longer is not at the table tonight. */
export const AURA_FRESH_MS = 6 * 60 * 60 * 1000;

/** How often an unchanged published aura is written again while the sheet is open,
 *  so it stays fresh for the allies through a long session. */
export const AURA_HEARTBEAT_MS = 2 * 60 * 60 * 1000;

/** What the paladin's sheet writes now: the aura set (new, changed or due for its
 *  heartbeat), cleared (it ended), or nothing. Unchanged and recent: nothing, so a
 *  re-render never writes. */
export function auraWrite(
  published: PublishedAura | null,
  stored: (PublishedAura & { at: number }) | undefined,
  nowMs: number
): { kind: "set"; aura: PublishedAura & { at: number } } | { kind: "clear" } | null {
  if (!published) return stored ? { kind: "clear" } : null;
  const same =
    stored !== undefined &&
    stored.bonus === published.bonus &&
    stored.reachFt === published.reachFt;
  if (same && nowMs - stored.at <= AURA_HEARTBEAT_MS) return null;
  return { kind: "set", aura: { ...published, at: nowMs } };
}

/** The ally says they stand outside this paladin's aura (until tapped again or a rest). */
export const outOfAuraKey = (characterId: string): string =>
  `${OUT_OF_AURA_PREFIX}${characterId}`;

/** The aura the paladin's sheet publishes, or null: below level 6, at 0 HP, or
 *  Incapacitated, there is none («while you aren't Incapacitated»). */
export function publishedAura(doc: CharacterDoc): PublishedAura | null {
  const level =
    doc.character.classes.find((entry) => entry.classId === "paladin")?.level ?? 0;
  if (level < 6 || doc.session.hp.current <= 0) return null;
  const conditions = new Set<string>(effectiveConditions(doc));
  if (INCAPACITATING_CONDITIONS.some((condition) => conditions.has(condition)))
    return null;
  const aggregate = aggregateCharacterGrants(doc.character, doc.session);
  const cha = aggregateAbilityScores(
    doc.character.abilityScores,
    aggregate,
    doc.character.abilityScoreOverrides
  ).CHA;
  return { bonus: Math.max(1, abilityModifier(cha)), reachFt: level >= 18 ? 30 : 10 };
}

/** Every fresh aura of another member, each marked on (the default) or off (the ally
 *  stands outside it): the chips the ally's sheet shows. */
export function allyAuraOffers(
  party: ReadonlyArray<PartyAura>,
  selfCharacterId: string,
  nowMs: number,
  activeFeatures: ReadonlyArray<string>
): Array<{ characterId: string; name: string; bonus: number; on: boolean }> {
  const out = new Set(activeFeatures);
  return party
    .filter(
      (member) =>
        member.characterId !== selfCharacterId && nowMs - member.aura.at <= AURA_FRESH_MS
    )
    .map((member) => ({
      characterId: member.characterId,
      name: member.name,
      bonus: member.aura.bonus,
      on: !out.has(outOfAuraKey(member.characterId)),
    }));
}

/** The one aura bonus an ally's saves take: the best fresh aura of another member the
 *  ally doesn't stand outside of. On by default; null when there is none. */
export function allyAura(
  party: ReadonlyArray<PartyAura>,
  selfCharacterId: string,
  nowMs: number,
  activeFeatures: ReadonlyArray<string>
): { from: string; name: string; bonus: number } | null {
  const out = new Set(activeFeatures);
  const best = party
    .filter(
      (member) =>
        member.characterId !== selfCharacterId &&
        nowMs - member.aura.at <= AURA_FRESH_MS &&
        !out.has(outOfAuraKey(member.characterId))
    )
    .sort((a, b) => b.aura.bonus - a.aura.bonus)[0];
  return best
    ? { from: best.characterId, name: best.name, bonus: best.aura.bonus }
    : null;
}
