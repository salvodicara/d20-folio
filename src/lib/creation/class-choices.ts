/**
 * The choices a CLASS asks when a character is created: the features gained
 * through its starting level that open a pick, read the same way level-up reads
 * them (their grants and placeholder features), never a hand-kept list:
 *
 *   - a `choice-grant-bundle` (Cleric Divine Order, Druid Primal Order): decided
 *     in `session.grantBundleChoices`, like a species lineage;
 *   - a Fighting Style (Fighter): one style feat, added as a feature;
 *   - Weapon Mastery (Barbarian, Fighter, Paladin, Ranger, Rogue): the class
 *     table's count of masterable weapons, on the class entry;
 *   - Eldritch Invocations (Warlock): the known count, on the class entry;
 *   - Expertise (Rogue): two proficient skills promoted.
 *
 * Pure module — no React, no locale reads.
 */
import { getClassTable, getFeaturesAtLevel } from "@/data/classes";
import { isExpertisePlaceholder, EXPERTISE_PICKS_PER_GRANT } from "@/lib/expertise-pick";
import { isFightingStylePlaceholder, listFightingStyles } from "@/lib/fighting-style";
import {
  eligibleInvocations,
  invocationsKnownAt,
  isInvocationPlaceholder,
} from "@/lib/invocation-pick";
import {
  isWeaponMasteryPlaceholder,
  listMasterableWeapons,
  weaponMasteryCountForClass,
} from "@/lib/weapon-mastery-pick";

/** What the class asks at creation, with how many of each. */
export interface ClassChoiceNeeds {
  /** Bundle keys its features carry (Divine Order, Primal Order). */
  bundleKeys: string[];
  fightingStyles: number;
  weaponMasteries: number;
  invocations: number;
  expertise: number;
}

/** The class's own picks a draft holds (the bundles live with the species' ones). */
export interface ClassChoicePicks {
  fightingStyles: readonly string[];
  weaponMasteries: readonly string[];
  invocations: readonly string[];
  expertise: readonly string[];
}

export const NO_CLASS_PICKS: ClassChoicePicks = {
  fightingStyles: [],
  weaponMasteries: [],
  invocations: [],
  expertise: [],
};

/** Every feature the class (and its subclass, once chosen) grants through `level`. */
function featuresThrough(classId: string, level: number, subclassId: string) {
  const sub = subclassId.toLowerCase();
  const out = [];
  for (let lvl = 1; lvl <= level; lvl++) {
    for (const f of getFeaturesAtLevel(classId, lvl)) {
      if (f.subclass && f.subclass.toLowerCase() !== sub) continue;
      out.push(f);
    }
  }
  return out;
}

/** How many times the class table grants Expertise through `level`. */
export function expertiseGrantsThrough(classId: string, level: number): number {
  return (getClassTable(classId)?.levels ?? [])
    .filter((row) => row.level <= level)
    .reduce((n, row) => n + row.featureIds.filter(isExpertisePlaceholder).length, 0);
}

export function classChoiceNeeds(
  classId: string,
  level: number,
  subclassId: string
): ClassChoiceNeeds {
  const features = featuresThrough(classId, level, subclassId);
  const has = (test: (id: string) => boolean) => features.some((f) => test(f.id));
  const bundleKeys = [
    ...new Set(
      features.flatMap((f) =>
        (f.grants ?? []).flatMap((g) =>
          g.type === "choice-grant-bundle" ? [g.bundleKey] : []
        )
      )
    ),
  ];
  return {
    bundleKeys,
    fightingStyles: features.filter((f) => isFightingStylePlaceholder(f.id)).length,
    weaponMasteries: has(isWeaponMasteryPlaceholder)
      ? weaponMasteryCountForClass(classId, level)
      : 0,
    invocations: has(isInvocationPlaceholder) ? invocationsKnownAt(level) : 0,
    // The table lists Expertise at each level that grants it (Bard 2 and 9, Rogue 1
    // and 6); the feature itself is defined once, at its first level.
    expertise: expertiseGrantsThrough(classId, level) * EXPERTISE_PICKS_PER_GRANT,
  };
}

/** The legal options for each class pick (ids), given what the character is proficient in. */
export function classChoiceOptions(
  classId: string,
  level: number,
  proficientSkills: readonly string[]
): Record<keyof ClassChoicePicks, string[]> {
  return {
    fightingStyles: listFightingStyles(classId).map((f) => f.id),
    weaponMasteries: listMasterableWeapons().map((w) => w.id),
    invocations: eligibleInvocations(level, []).map((i) => i.id),
    expertise: [...proficientSkills],
  };
}

/** Every class pick and bundle is made, each to its count, from its legal options. */
export function classChoicesComplete(
  needs: ClassChoiceNeeds,
  picks: ClassChoicePicks,
  bundleChoices: Readonly<Record<string, string>>,
  options: Record<keyof ClassChoicePicks, string[]>
): boolean {
  const full = (kind: keyof ClassChoicePicks, count: number) =>
    picks[kind].length === count && picks[kind].every((id) => options[kind].includes(id));
  return (
    needs.bundleKeys.every((key) => bundleChoices[key] !== undefined) &&
    full("fightingStyles", needs.fightingStyles) &&
    full("weaponMasteries", needs.weaponMasteries) &&
    full("invocations", needs.invocations) &&
    full("expertise", needs.expertise)
  );
}
