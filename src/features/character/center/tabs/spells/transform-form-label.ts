import type { TFunction } from "i18next";
import { POLYMORPH_SPELL_IDS } from "@/lib/polymorph";

/** "Polymorphed: Brown Bear", or "Shapechange: Adult Red Dragon" for the others. */
export function transformFormLabel(
  t: TFunction,
  spellId: string,
  formName: string,
  spellName: string
): string {
  return POLYMORPH_SPELL_IDS.includes(spellId)
    ? t("polymorph.activeForm", { name: formName })
    : t("polymorph.formOf", { spell: spellName, name: formName });
}
