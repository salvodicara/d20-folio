/**
 * Basic Poison (SRD 5.2.1 Adventuring Gear), headless: as a Bonus Action, a vial
 * coats one weapon or up to three pieces of ammunition. A creature that takes
 * Piercing or Slashing damage from the poisoned weapon or ammunition takes an extra
 * 1d4 Poison damage. The poison lasts 1 minute (10 rounds) or until its damage is
 * dealt: a weapon's first such hit, one hit per piece of ammunition.
 */
import type { DamageType } from "@/types/damage";

export const BASIC_POISON = {
  itemId: "poison-basic",
  economy: "bonus",
  dice: "1d4",
  damageType: "poison",
  rounds: 10,
  maxAmmunition: 3,
} as const;

export type PoisonCoatTarget =
  | { kind: "weapon"; weaponKey: string }
  | { kind: "ammunition"; itemKey: string; pieces: number };

export interface PoisonCoat {
  target: PoisonCoatTarget;
  /** The round the vial was used; the poison holds for the next 10 rounds. */
  appliedRound: number;
}

export interface PoisonExtra {
  dice: typeof BASIC_POISON.dice;
  damageType: typeof BASIC_POISON.damageType;
}

const CARRIES_POISON: ReadonlyArray<DamageType> = ["piercing", "slashing"];

/** Coat a weapon, or up to three pieces of ammunition. */
export function coatWithBasicPoison(target: PoisonCoatTarget, round: number): PoisonCoat {
  return {
    target:
      target.kind === "ammunition"
        ? {
            ...target,
            pieces: Math.max(1, Math.min(BASIC_POISON.maxAmmunition, target.pieces)),
          }
        : target,
    appliedRound: round,
  };
}

/** What one hit does with the coat: the extra Poison damage it adds, and the coat
 *  left afterwards (null once spent or expired). */
export function basicPoisonOnHit(
  coat: PoisonCoat | null,
  hit: {
    weaponKey?: string;
    ammunitionKey?: string;
    damageTypes: ReadonlyArray<DamageType>;
    round: number;
  }
): { extra: PoisonExtra | null; coat: PoisonCoat | null } {
  if (!coat || hit.round >= coat.appliedRound + BASIC_POISON.rounds) {
    return { extra: null, coat: null };
  }
  const { target } = coat;
  const coated =
    target.kind === "weapon"
      ? hit.weaponKey === target.weaponKey
      : hit.ammunitionKey === target.itemKey;
  if (!coated || !hit.damageTypes.some((type) => CARRIES_POISON.includes(type))) {
    return { extra: null, coat };
  }
  const extra = { dice: BASIC_POISON.dice, damageType: BASIC_POISON.damageType };
  const left =
    target.kind === "ammunition" && target.pieces > 1
      ? { ...coat, target: { ...target, pieces: target.pieces - 1 } }
      : null;
  return { extra, coat: left };
}
