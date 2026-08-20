/** Detect feat spell choices whose free-cast provenance never reached the sheet.
 * This is the read-boundary repair signal for grandfathered/imported characters:
 * it never guesses the player's spell, only asks them to resolve the original
 * declarative choice through the normal picker. */
import { FEATS_BY_ID } from "@/data/feats";
import { deriveOriginFeats } from "@/lib/character-build";
import { pendingSpellChoicesForFeat } from "@/lib/feat-spell-choices";
import type { CharacterData } from "@/types/character";

export function incompleteFreeCastChoiceFeatIds(character: CharacterData): string[] {
  const featIds = new Set(
    character.features.flatMap((feature) => ("custom" in feature ? [] : [feature.srdId]))
  );
  for (const feat of deriveOriginFeats({
    background: character.background,
    bgFeat: character.bgFeat,
    humanOriginFeat: character.humanOriginFeat,
  })) {
    featIds.add(feat.srdId);
  }

  const sourceCounts = new Map<string, number>();
  for (const spell of character.spells) {
    if ("custom" in spell || !spell.freeCastSource) continue;
    const sourceId = spell.freeCastSource.sourceId;
    sourceCounts.set(sourceId, (sourceCounts.get(sourceId) ?? 0) + 1);
  }

  return [...featIds].filter((featId) => {
    const feat = FEATS_BY_ID.get(featId);
    if (!feat) return false;
    const requiredBySource = new Map<string, number>();
    for (const slot of pendingSpellChoicesForFeat(feat)) {
      const sourceId = slot.freeCastSource?.sourceId;
      if (!sourceId) continue;
      requiredBySource.set(sourceId, (requiredBySource.get(sourceId) ?? 0) + slot.count);
    }
    return [...requiredBySource].some(([sourceId, required]) => {
      const present = [...sourceCounts].reduce(
        (count, [storedId, amount]) =>
          storedId === sourceId || storedId.startsWith(`${sourceId}:`)
            ? count + amount
            : count,
        0
      );
      return present < required;
    });
  });
}
