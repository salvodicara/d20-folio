/**
 * «Scelte da completare» asking an owed subclass (#1393): once one is picked, what
 * it brings up to the class's level (the level-up's reveal), the option bundles its
 * features ask (a land, a damage type) and their choice slots (skills, spells) as
 * the creation and level-up chips, each named by the feature that asks. The pick can
 * be saved only when every one is answered: the same check `resolveOwedSubclass`
 * makes before it writes. Pure: doc and answers in, view model out.
 */
import { choiceSlotRows, type ChoiceSlotRow } from "@/domains/creation/creation-view";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import {
  resolveOwedSubclass,
  subclassPickChoices,
  type SubclassAnswers,
} from "@/lib/subclass-pick";
import { EMPTY_CHOICE_PICKS, pruneChoicePicks } from "@/lib/feature-choices";
import { subclassReveal } from "@/lib/views/level-up-view";
import { localizeText } from "@/lib/views/srd-i18n";
import type { CharacterDoc } from "@/types/character";

export interface OwedSubclassBundleVM {
  bundleKey: string;
  label: string;
  options: { id: string; label: string }[];
}

export interface OwedSubclassAsks {
  /** What the picked subclass brings; null before a pick. */
  reveal: ReturnType<typeof subclassReveal> | null;
  bundles: OwedSubclassBundleVM[];
  rows: ChoiceSlotRow[];
  /** The pick and every choice it asks are answered: «Salva» writes it. */
  complete: boolean;
}

/** The class feature a slot id belongs to (`<featureId>::<kind>-slot-<n>`), named. */
function featureOf(slotId: string, locale: Locale): string {
  const featureId = slotId.split("::")[0]?.split(":")[0] ?? "";
  return featureId ? localizeSrd("class-feature", featureId, "name", locale) : "";
}

export function owedSubclassAsks(
  doc: CharacterDoc,
  classId: string,
  subclassId: string | null,
  answers: SubclassAnswers,
  locale: Locale
): OwedSubclassAsks {
  if (!subclassId) return { reveal: null, bundles: [], rows: [], complete: false };
  const c = doc.character;
  const level = c.classes.find((e) => e.classId === classId)?.level ?? 1;
  const bundlePicks = answers.bundlePicks ?? {};
  const { slots, bundles } = subclassPickChoices(doc, classId, subclassId, bundlePicks);
  const picks = pruneChoicePicks(slots, answers.choicePicks ?? EMPTY_CHOICE_PICKS);
  const tier = (want: readonly string[]) =>
    new Set(
      Object.entries(c.skills)
        .filter(([, v]) => want.includes(v))
        .map(([id]) => id)
    );
  const rows = choiceSlotRows(
    slots,
    picks,
    {
      skills: tier(["proficient", "expertise"]),
      spells: new Set(c.spells.flatMap((s) => ("custom" in s ? [] : [s.srdId]))),
      expert: tier(["expertise"]),
      languages: new Set(c.languageIds),
    },
    locale
  ).map((row) => ({ ...row, source: row.source || featureOf(row.slotId, locale) }));
  return {
    reveal: subclassReveal(classId, subclassId, level, locale),
    bundles: bundles.map((b) => ({
      bundleKey: b.bundleKey,
      label: localizeText(b.label, locale),
      options: b.options.map((o) => ({ id: o.id, label: localizeText(o.label, locale) })),
    })),
    rows,
    complete:
      resolveOwedSubclass(doc, classId, subclassId, {
        choicePicks: picks,
        bundlePicks,
      }) !== doc,
  };
}
