/**
 * Who can't speak (edge-case M18): a creature with a `no-speech` grant lit (Silence's
 * occupants: "Casting a spell that includes a Verbal component is impossible there"),
 * or an Incapacitated one ("it can't speak"; Paralyzed, Stunned, Unconscious and
 * Petrified imply it). An item used with a command word is blocked the same way.
 * Readers only: the cast warning and the item activation consume them.
 */
import { getMagicItem } from "@/data/magic-items";
import { getSpellById } from "@/data/spells";
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

/**
 * Whether casting `action` needs the caster to speak: a spell with a Verbal
 * component that nothing removes (Subtle Spell, or a feature that waives it).
 */
export function castNeedsSpeech(
  action: {
    spellId?: string;
    homebrewSpell?: { components: { v: boolean } };
    summary: { componentsWaived?: ReadonlyArray<"v" | "s" | "m"> };
  },
  metamagicIds: ReadonlyArray<string> = []
): boolean {
  const spell =
    action.homebrewSpell ?? (action.spellId ? getSpellById(action.spellId) : undefined);
  if (!spell?.components.v) return false;
  if (action.summary.componentsWaived?.includes("v")) return false;
  return !metamagicIds.includes("subtle-spell");
}

/** Whether the character can't make this cast because it can't speak (Silence,
 *  Incapacitated): RAW, "casting a spell that includes a Verbal component is
 *  impossible there". */
export function speechBlocksCast(
  doc: CharacterDoc,
  action: Parameters<typeof castNeedsSpeech>[0],
  metamagicIds: ReadonlyArray<string> = []
): boolean {
  return castNeedsSpeech(action, metamagicIds) && cannotSpeak(doc);
}
