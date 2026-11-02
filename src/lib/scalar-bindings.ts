/** The values a catalogue Scalar can read for one character (`@/lib/scalar`). */

import { classEntryLevel, getClasses, totalLevel, type ClassBearer } from "@/lib/classes";
import { effectiveProficiencyBonus } from "@/lib/compute";
import type { IntegerBindings } from "@/lib/integer-expression";
import { SCALAR_BINDINGS } from "@/lib/scalar";

export function characterScalarBindings(
  character: ClassBearer & { proficiencyBonusOverride?: number | null }
): IntegerBindings {
  const level = totalLevel(character);
  const bindings: Record<string, number> = {
    [SCALAR_BINDINGS.totalLevel]: level,
    [SCALAR_BINDINGS.proficiencyBonus]: effectiveProficiencyBonus(
      level,
      character.proficiencyBonusOverride
    ),
  };
  for (const { classId } of getClasses(character)) {
    bindings[SCALAR_BINDINGS.classLevel(classId)] = classEntryLevel(character, classId);
  }
  return bindings;
}
