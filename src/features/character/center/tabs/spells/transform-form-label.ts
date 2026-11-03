import type { TFunction } from "i18next";
import { selfFormRule } from "@/lib/polymorph";

/** "Polymorphed: Brown Bear", or "Shapechange: Adult Red Dragon" for the others. */
export function transformFormLabel(
  t: TFunction,
  spellId: string,
  formName: string,
  spellName: string
): string {
  // A form that takes the mind too (Polymorph, True Polymorph) reads "Polymorphed".
  return !selfFormRule(spellId).keepsMind
    ? t("polymorph.activeForm", { name: formName })
    : t("polymorph.formOf", { spell: spellName, name: formName });
}
