/**
 * The Shapechange form pool (SRD 5.2.1): any creature whose Challenge Rating is no
 * higher than your level, that is not a Construct or an Undead ("you must have seen
 * the sort of creature before" is the table's call). Each creature is projected to
 * the one self-form shape (`BeastStatBlock`), so assuming and dropping it is the
 * Polymorph path.
 *
 * SEAM file: imports the bestiary corpus, so it is lazy-only (the eager-partition
 * sweep pins it); the Shapechange picker is its one consumer.
 */
import type { BeastStatBlock, CreatureType } from "@/data/types";
import { MONSTERS } from "@/data/monsters";
import { beastProjectionFromMonster } from "@/lib/beast-projection";

/** The creature types Shapechange can never take. */
const SHAPECHANGE_EXCLUDED: ReadonlySet<CreatureType> = new Set(["construct", "undead"]);

/** Every Shapechange form for a caster of `level`, in bestiary order (CR, then id). */
export function resolveShapechangeForms(level: number): ReadonlyArray<BeastStatBlock> {
  return MONSTERS.filter((m) => m.cr <= level && !SHAPECHANGE_EXCLUDED.has(m.type)).map(
    beastProjectionFromMonster
  );
}
