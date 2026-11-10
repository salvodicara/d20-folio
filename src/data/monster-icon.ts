/**
 * A monster's painted icon, as art keys (`<kind>/<id>`, the shape `artUrl` and the pack
 * icon map use) in the order to try them: the monster's own icon, then its creature
 * type's. The icons follow "the file is the truth" (src/ui/art-url.ts): the interface
 * tries the next key when a file is missing and ends on the glyph, so a type icon shows
 * only once the icon pipeline has painted it. Pure.
 */
import { ALL_CREATURE_TYPES, type CreatureType } from "@/data/types";

/** The art folder of the creature-type icons (one subject per 2024 type). */
export const CREATURE_TYPE_ART_KIND = "creature-type";

/** The 14 subjects the icon pipeline paints for the type fallback. */
export const CREATURE_TYPE_ART_SUBJECTS: readonly string[] = ALL_CREATURE_TYPES.map(
  (type) => `${CREATURE_TYPE_ART_KIND}/${type}`
);

/**
 * The art keys to try for a monster: a bestiary monster by its `srdId`, a DM's custom
 * one by its `creatureType` only; none for a stat-less improvised creature.
 */
export function artFor(monster: {
  srdId?: string | null;
  creatureType?: CreatureType | null;
}): string[] {
  return [
    ...(monster.srdId ? [`monster/${monster.srdId}`] : []),
    ...(monster.creatureType
      ? [`${CREATURE_TYPE_ART_KIND}/${monster.creatureType}`]
      : []),
  ];
}
