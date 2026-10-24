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
import { hitDiceHealing, hitDicePool } from "./hit-dice";

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
