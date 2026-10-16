/**
 * The bestiary form pool for a self-form spell whose forms are any creature
 * (Shapechange, True Polymorph): every creature whose Challenge Rating is no higher
 * than your level, minus the types the spell's rule excludes (Shapechange: no
 * Construct or Undead; "you must have seen it" is the table's call). Each creature
 * is projected to the one self-form shape (`BeastStatBlock`), so assuming and
 * dropping it is the Polymorph path.
 *
 * SEAM file: imports the bestiary corpus, so it is lazy-only (the eager-partition
 * sweep pins it); the bestiary form picker is its one consumer.
 */
import type { BeastStatBlock } from "@/data/types";
import { MONSTERS } from "@/data/monsters";
import { beastProjectionFromMonster } from "@/lib/beast-projection";
import { selfFormRule } from "@/lib/polymorph";

/** Every form `spellId` allows a caster of `level`, in bestiary order (CR, then id). */
export function resolveBestiaryForms(
  spellId: string,
  level: number
): ReadonlyArray<BeastStatBlock> {
  const excluded = selfFormRule(spellId).excludedTypes ?? [];
  return MONSTERS.filter((m) => m.cr <= level && !excluded.includes(m.type)).map(
    beastProjectionFromMonster
  );
}
