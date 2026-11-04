/**
 * A penalty on your damage rolls (Grave Ground: "subtracts 1d6 from its damage
 * rolls until the end of its next turn"): a `roll-die-adjustment` on `damage` that
 * a fight effect put on you. The table rolls the die and takes it off the total.
 */
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import type { AggregatedGrants } from "@/lib/grants";
import type { CharacterDoc } from "@/types/character";

/** The dice to subtract from your damage rolls, with where each comes from. */
export function damageRollPenalty(
  aggregate: Pick<AggregatedGrants, "rollDieAdjustments">
): Array<{ dice: string; sourceId: string }> {
  return aggregate.rollDieAdjustments.flatMap((adjustment) =>
    adjustment.rollType === "damage" && adjustment.operation === "subtract"
      ? [{ dice: adjustment.dice, sourceId: adjustment.sourceId }]
      : []
  );
}

/** The same, read off a character's sheet (its fight effects included). */
export function sheetDamageRollPenalty(
  doc: Pick<CharacterDoc, "character" | "session">
): Array<{ dice: string; sourceId: string }> {
  return damageRollPenalty(aggregateCharacterGrants(doc.character, doc.session));
}
