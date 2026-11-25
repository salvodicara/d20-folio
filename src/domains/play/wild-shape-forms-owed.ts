/**
 * The Wild Shape known forms a Druid still owes, for «Scelte da completare» on the new
 * Play screen (SRD 5.2.1 Beast Shapes «Known Forms»: 4 at Druid 2, 6 at 4, 8 at 8):
 * named like the other class picks («4 forme per Forma Selvatica (Druido)»), with the
 * level-up's rubric and the eligible beasts the Druid doesn't know. Null when nothing
 * is owed. Pure.
 */
import i18n from "@/i18n";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { className } from "@/lib/views/level-up-view";
import { formSwapOptions, wildShapeFormsOwed } from "@/lib/wild-shape-forms";
import type { CharacterDoc } from "@/types/character";

export interface OwedWildShapeForms {
  owed: number;
  /** The callout's item: «4 Wild Shape forms (Druid)». */
  label: string;
  /** The class that asks («Druid»). */
  source: string;
  /** The level-up's rubric: «Choose 4 known forms for Wild Shape». */
  title: string;
  options: { id: string; label: string }[];
}

export function owedWildShapeForms(
  doc: CharacterDoc,
  locale: Locale
): OwedWildShapeForms | null {
  const owed = wildShapeFormsOwed(doc);
  if (owed === 0) return null;
  const t = i18n.getFixedT(locale);
  const source = className("druid", locale);
  return {
    owed,
    label: t("play.speciesChoices.classItem", {
      what: t("play.speciesChoices.owed.wildShapeForms", { count: owed }),
      className: source,
    }),
    source,
    title: t("levelUp.screen.chooseWildShapeForms", { count: owed }),
    options: formSwapOptions(doc).map((b) => ({
      id: b.id,
      label: localizeSrd("beasts", b.id, "name", locale),
    })),
  };
}
