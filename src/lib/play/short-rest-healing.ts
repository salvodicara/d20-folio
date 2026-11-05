/**
 * The HP a Short Rest's spent Hit Point Dice restore, read from the whole character:
 * its Hit Dice pool, its effective Constitution (an Amulet of Health counts), and
 * the items that change Hit Dice healing (Periapt of Wound Closure doubles it, Potion
 * of Vitality maximizes it). One entry point for the rest screen over the rules'
 * `hitDiceHealing`, so the preview and the heal can never disagree.
 */
import { abilityModifier } from "@/lib/ability";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { aggregateAbilityScores } from "@/lib/compute";
import type { CharacterDoc } from "@/types/character";
import {
  hitDiceHealing,
  hitDicePool,
  hitDiceTotalRange,
  readHitDiceRoll,
} from "./hit-dice";

/** HP restored by `count` dice whose roll totals `rolled`; null while a needed roll
 *  is missing (a maximizing item needs none). */
export function shortRestHealing(
  doc: CharacterDoc,
  count: number,
  rolled: number | null
): number | null {
  const aggregate = aggregateCharacterGrants(doc.character, doc.session);
  const con = aggregateAbilityScores(
    doc.character.abilityScores,
    aggregate,
    doc.character.abilityScoreOverrides
  ).CON;
  return hitDiceHealing({
    pool: hitDicePool(doc.character),
    count,
    rolled,
    conMod: abilityModifier(con),
    aggregate,
  });
}

/** A Short Rest's heal for `count` dice and the roll the player typed, or null while
 *  the roll is not one those dice can make. No dice heal nothing and need no roll. A
 *  floor on the faces (Powerful Recovery: a 1 or 2 counts as a 3) takes the faces one
 *  per die ("1+5"), each low face counted as the floor, and returns them. */
export function shortRestHeal(
  doc: CharacterDoc,
  count: number,
  typed: string
): { heal: number | null; valid: boolean; faces?: number[] } {
  if (count <= 0) return { heal: 0, valid: true };
  const floor = aggregateCharacterGrants(doc.character, doc.session).hitDieFloor;
  const read = readHitDiceRoll(typed, count, floor);
  if (read === null) return { heal: null, valid: false };
  const range = hitDiceTotalRange(hitDicePool(doc.character), count);
  const valid =
    floor !== undefined || (read.total >= range.min && read.total <= range.max);
  return valid
    ? {
        heal: shortRestHealing(doc, count, read.total),
        valid,
        ...(read.faces ? { faces: read.faces } : {}),
      }
    : { heal: null, valid };
}
