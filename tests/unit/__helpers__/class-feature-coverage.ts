/**
 * The rule that counts a class feature for the "Class features" row of
 * docs/RULES_COVERAGE.md (and its pack-side twin):
 *
 *  - auto: the builder applies it from the class table or a level-up pick
 *    (spellcasting, Pact Magic, ASI, Epic Boon, Weapon Mastery, Fighting Style,
 *    Expertise, Metamagic, Invocations, the subclass pick, subclass spells); or a
 *    sibling feature carries it (`carried`, each with its reason); or it declares
 *    a standing grant the engine applies (a rider, a resistance, a rule fact), or a
 *    scaling rider chip, an on-cast trigger, a companion;
 *  - 1-tap: it has a counter or an action row, or its only grants are casts,
 *    picks, toggled states and granted actions;
 *  - reference: it declares nothing.
 * Impossible is 0: every feature can be noted by hand.
 */
import { getClassTable } from "@/data/classes";
import type { SrdClassFeatureData } from "@/data/types";
import type { Grant } from "@/lib/grant-schema";

export type CoverageClass = "auto" | "tap" | "reference";

const TAP_ONLY = new Set([
  "while-active",
  "always-prepared-spell",
  "free-cast-spell",
  "free-cast-from-list",
  "at-will-cast-spell",
  "choice-cantrip",
  "choice-spell",
  "granted-action",
]);

/** Applied by the builder from the class table or a level-up pick. */
const BUILDER_SUFFIX =
  /-(spellcasting|pact-magic|asi|epic-boon|weapon-mastery|fighting-style|expertise|metamagic|eldritch-invocations)$/;

/**
 * Public features a sibling carries (feature id → where). The pack passes its own.
 */
export const SRD_CARRIED: Readonly<Record<string, string>> = {
  "barbarian-greater-brutal-strike": "Brutal Strike's diceByLevel step at 17 (2d10)",
  "cleric-improved-divine-intervention": "Divine Intervention's pool adds Wish",
  "druid-improved-elemental-fury": "Elemental Fury's diceByLevel step at 15",
  "monk-deflect-energy": "Deflect Attacks' damageTypesByLevel at 13 (every type)",
  "monk-heightened-focus": "Flurry instancesByLevel, Patient Defense tempHpRoll at 10",
  "paladin-restoring-touch": "Lay on Hands' cureConditions fromLevel 14",
  "rogue-improved-cunning-strike": "two simultaneous Cunning Strike options",
  "rogue-thief-reflexes": "the second first-round turn (extra-turns)",
  "warlock-eldritch-master": "the once-per-Long-Rest full Pact Magic restore",
};

function leafKinds(grants: ReadonlyArray<Grant>): string[] {
  return grants.flatMap((grant) =>
    grant.type === "choice-grant-bundle"
      ? grant.options.flatMap((option) => leafKinds(option.grants))
      : [grant.type]
  );
}

/** A "<subclass> Spells" feature whose list the subclass table declares. */
function subclassHasSpells(feature: SrdClassFeatureData): boolean {
  const subclass = getClassTable(feature.class)?.subclasses.find(
    (s) => s.id === feature.subclass
  );
  return subclass?.expandedSpells !== undefined;
}

export function classFeatureCoverage(
  feature: SrdClassFeatureData,
  carried: Readonly<Record<string, string>>
): CoverageClass {
  if (BUILDER_SUFFIX.test(feature.id) || feature.id.endsWith("-subclass")) return "auto";
  if (feature.id.endsWith("-spells") && subclassHasSpells(feature)) return "auto";
  if (feature.id in carried) return "auto";
  const mechanics = feature.mechanics;
  if (
    mechanics?.tracker ||
    mechanics?.extraTrackers?.length ||
    mechanics?.actions?.length
  )
    return "tap";
  const kinds = leafKinds(feature.grants ?? []);
  if (kinds.some((kind) => !TAP_ONLY.has(kind))) return "auto";
  if (mechanics?.rider || mechanics?.onCast || feature.companion) return "auto";
  return kinds.length > 0 ? "tap" : "reference";
}

/** The `auto / 1-tap / reference / 0` cell for a set of features. */
export function coverageCell(
  features: ReadonlyArray<SrdClassFeatureData>,
  carried: Readonly<Record<string, string>>
): { cell: string; reference: string[] } {
  const classes = features.map((f) => classFeatureCoverage(f, carried));
  const count = (c: CoverageClass) => classes.filter((x) => x === c).length;
  return {
    cell: `${count("auto")} / ${count("tap")} / ${count("reference")} / 0`,
    reference: features.filter((_, i) => classes[i] === "reference").map((f) => f.id),
  };
}
