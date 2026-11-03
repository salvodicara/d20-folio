/**
 * The forms a character may assume through a spell or a class feature (edge-case
 * family M2): the picker's list. A spell caps the Challenge Rating at the caster's
 * level or its own cap ({@link resolvePolymorphForms}); Wild Shape reads its cap from
 * the druid's table (a Moon Druid's included) and offers a Fly Speed only from its
 * `flyFromLevel`.
 */
import { classFeatureIndex } from "@/data/classes";
import { beastsByMaxCR } from "@/data/beasts";
import type { BeastStatBlock } from "@/data/types";
import { classEntryLevel } from "@/lib/classes";
import { resolvePolymorphForms, selfFormRule } from "@/lib/polymorph";
import { featureClassRow } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";

/** A Challenge Rating as the class tables write it ("1/4", "1") as a number. */
function challengeRating(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const [num = 0, den] = value.split("/").map(Number);
  return den ? num / den : num;
}

/** The forms the character may assume through `sourceId`, by CR then id. */
export function formPool(
  character: CharacterDoc,
  sourceId: string
): ReadonlyArray<BeastStatBlock> {
  const rule = selfFormRule(sourceId);
  const feature = classFeatureIndex.get(sourceId);
  if (!rule.crCapColumn || !feature) return resolvePolymorphForms(character, sourceId);
  const cap = challengeRating(featureClassRow(sourceId, character)?.[rule.crCapColumn]);
  const level = classEntryLevel(character.character, feature.class);
  const flies = rule.flyFromLevel === undefined || level >= rule.flyFromLevel;
  return beastsByMaxCR(cap).filter((b) => flies || !((b.speeds.fly ?? 0) > 0));
}
