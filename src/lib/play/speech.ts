/**
 * Who can't speak (edge-case M18): a creature with a `no-speech` grant lit (Silence's
 * occupants: "Casting a spell that includes a Verbal component is impossible there"),
 * or an Incapacitated one ("it can't speak"; Paralyzed, Stunned, Unconscious and
 * Petrified imply it). An item used with a command word is blocked the same way.
 * Readers only: the cast warning and the item activation consume them.
 */
import { getMagicItem } from "@/data/magic-items";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { ruleFlag } from "@/lib/rules";
import type { CharacterDoc } from "@/types/character";

/** Whether the character can't speak right now. */
export function cannotSpeak(doc: CharacterDoc): boolean {
  const aggregate = aggregateCharacterGrants(doc.character, doc.session);
  if (ruleFlag(aggregate.values, "speech:none")) return true;
  return aggregate.conditions.includes("incapacitated");
}

/** Whether the item's command word can't be spoken now (its use is blocked). */
export function commandWordBlocked(doc: CharacterDoc, itemId: string): boolean {
  return getMagicItem(itemId)?.commandWord === true && cannotSpeak(doc);
}
