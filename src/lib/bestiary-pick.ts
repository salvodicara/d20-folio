/**
 * Which bestiary creatures a bestiary-pick summon allows (Planar Ally, Planar
 * Binding, Gate, Awaken). Pure and corpus-free: the caller hands in the monster,
 * so the eager side never imports the bestiary.
 */
import { CREATURE_SIZE_ORDER } from "@/data/types";
import type { BestiaryPickRule, MonsterStatBlock } from "@/data/types";

/** `true` when the spell's rule lets the caster pick `monster`. */
export function bestiaryPickAllows(
  rule: BestiaryPickRule,
  monster: Pick<MonsterStatBlock, "id" | "type" | "cr" | "sizes" | "abilityScores">
): boolean {
  if (rule.include?.includes(monster.id)) return true;
  if (rule.types && !rule.types.includes(monster.type)) return false;
  if (rule.crMax !== undefined && monster.cr > rule.crMax) return false;
  if (rule.intMax !== undefined && monster.abilityScores.INT > rule.intMax) return false;
  if (rule.sizeMax !== undefined) {
    const max = CREATURE_SIZE_ORDER.indexOf(rule.sizeMax);
    if (monster.sizes.some((s) => CREATURE_SIZE_ORDER.indexOf(s) > max)) return false;
  }
  return true;
}
