/**
 * Casting in a form (edge-case family M2). A form whose rule blocks casting (Wild
 * Shape: "you can't cast spells") lets through only what a `form-casting` grant
 * for that form allows: every spell except one whose Material component has a cost
 * or is consumed (Beast Spells), or the source subclass's own spells (a Moon
 * Druid's Circle of the Moon Spells).
 */
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import type { CharacterAggregate } from "@/lib/aggregate-character";
import { getExpandedSpellsThroughLevel } from "@/lib/expanded-spells";
import { selfFormRule } from "@/lib/polymorph";

/** Whether the assumed form keeps the character from casting `spellId` (any spell,
 *  when no id is given and nothing lets one through). */
export function formBlocksSpell(
  aggregate: Pick<CharacterAggregate, "form" | "formCasting">,
  spellId?: string
): boolean {
  const { form } = aggregate;
  if (!form || !selfFormRule(form.sourceId).blocksCasting) return false;
  const allowances = aggregate.formCasting.filter((a) => a.form === form.sourceId);
  if (spellId === undefined) return allowances.length === 0;
  return !allowances.some((allowance) => {
    if (allowance.spells === "subclass") {
      const feature = classFeatureIndex.get(allowance.sourceId);
      if (!feature?.subclass) return false;
      return getExpandedSpellsThroughLevel(
        feature.class,
        feature.subclass,
        Infinity
      ).includes(spellId);
    }
    if (!allowance.exceptCostlyMaterial) return true;
    const components = getSpellById(spellId)?.components;
    return !(components?.costGp || components?.consumed);
  });
}
