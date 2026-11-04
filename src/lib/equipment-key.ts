/**
 * Which equipment row a consumable cost names (one rule for spending it and for
 * checking it can be paid): a custom item by `custom-<instanceId>`, one physical copy
 * by its `instanceId`, a Spell Scroll by `spell-scroll#<spell>`, any other item by its
 * SRD id.
 */
import type { CharacterDoc } from "@/types/character";

export function equipmentKeyMatches(
  ref: CharacterDoc["character"]["equipment"][number],
  key: string
): boolean {
  if ("custom" in ref) return `custom-${ref.instanceId}` === key;
  if (ref.instanceId !== undefined && ref.instanceId === key) return true;
  if (ref.scrollSpell) return `${ref.srdId}#${ref.scrollSpell}` === key;
  return ref.srdId === key;
}
