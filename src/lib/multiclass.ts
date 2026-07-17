/**
 * 2024 MULTICLASSING (#36) — the prerequisite gate + the partial-proficiency
 * facts behind the level-up wizard's class fork.
 *
 * RAW (dnd2024.wikidot.com `multiclassing`): "To qualify for a new class, you
 * must have a score of at least 13 in the primary ability of the new class AND
 * your current classes." A class listing two primary abilities requires BOTH
 * (Monk/Paladin/Ranger "and") unless its table declares `primaryAbilityMode:
 * "any"` (Fighter "Strength or Dexterity").
 *
 * Gaining the first level in a non-initial class grants only SOME of its
 * starting proficiencies — the per-class `multiclass` facts on the class table
 * ("As a Multiclass Character"). The INITIAL class is `classes[0]` (creation
 * writes one entry; level-up appends).
 *
 * Pure + Firebase-free.
 */
import { classTables, getClassTable } from "@/data/classes";
import { getClasses } from "@/lib/classes";
import { ALL_SKILLS, skillNameToId } from "@/lib/skills";
import type { AbilityCode, SrdClassTable } from "@/data/types";
import type { CharacterData } from "@/types/character";
import type { ProficiencyToken } from "@/types/ids";

/** Whether `scores` meet a class's 13+ primary-ability prerequisite. */
export function meetsPrimaryAbility(
  table: Pick<SrdClassTable, "primaryAbility" | "primaryAbilityMode">,
  scores: Readonly<Record<AbilityCode, number>>
): boolean {
  const codes = table.primaryAbility;
  if (codes.length === 0) return true;
  const ok = (c: AbilityCode) => scores[c] >= 13;
  return table.primaryAbilityMode === "any" ? codes.some(ok) : codes.every(ok);
}

/**
 * Whether the character may take a FIRST level in `classId` — RAW both ways:
 * 13+ in the new class's primary ability AND in every current class's. A class
 * the character already has is not a "new" class (advance it instead).
 */
export function canMulticlassInto(character: CharacterData, classId: string): boolean {
  const target = getClassTable(classId);
  if (!target) return false;
  const owned = getClasses(character);
  if (owned.some((e) => e.classId === classId)) return false;
  if (!meetsPrimaryAbility(target, character.abilityScores)) return false;
  for (const entry of owned) {
    const table = getClassTable(entry.classId);
    if (table && !meetsPrimaryAbility(table, character.abilityScores)) return false;
  }
  return true;
}

/**
 * The class ids the character may START at this level-up (RAW-legal only —
 * illegal options are FILTERED, never greyed; picker principles). Empty when
 * multiclassing is closed to this character.
 */
export function eligibleNewClasses(character: CharacterData): string[] {
  return classTables.filter((t) => canMulticlassInto(character, t.id)).map((t) => t.id);
}

/** The 2024 multiclass prerequisite floor — 13+ in a class's primary ability. */
export const MULTICLASS_MIN_SCORE = 13;

/** One unmet prerequisite: the ability, the 13+ floor, the character's score. */
export interface UnmetAbilityRequirement {
  ability: AbilityCode;
  needed: number;
  has: number;
}

/**
 * A class CLOSED to the character WITH its cause — ids + numbers only (the
 * view localizes; Constitution §2.7.3: a filtered absence carries a cause).
 * `mode: "any"` means meeting ONE listed ability would have sufficed (Fighter
 * "Strength or Dexterity"); `"all"` means every one is required.
 */
export interface FilteredClassCause {
  classId: string;
  mode: "any" | "all";
  unmet: UnmetAbilityRequirement[];
}

/**
 * The unmet side of {@link meetsPrimaryAbility} — `[]` when the prerequisite
 * is met. For an "any"-mode class that fails, EVERY listed ability is unmet
 * (any one of them would have sufficed).
 */
export function unmetPrimaryAbility(
  table: Pick<SrdClassTable, "primaryAbility" | "primaryAbilityMode">,
  scores: Readonly<Record<AbilityCode, number>>
): UnmetAbilityRequirement[] {
  if (meetsPrimaryAbility(table, scores)) return [];
  const unmetOf = (c: AbilityCode): UnmetAbilityRequirement => ({
    ability: c,
    needed: MULTICLASS_MIN_SCORE,
    has: scores[c],
  });
  const codes =
    table.primaryAbilityMode === "any"
      ? table.primaryAbility
      : table.primaryAbility.filter((c) => scores[c] < MULTICLASS_MIN_SCORE);
  return codes.map(unmetOf);
}

/**
 * WHY {@link eligibleNewClasses} filtered what it filtered — the cause behind
 * the absence (Constitution §2.7.3). `ownUnmet` lists the character's OWN
 * classes whose prerequisite fails (RAW "both ways": when non-empty, EVERY new
 * class is closed); `filtered` lists every non-owned class the character may
 * NOT start, each with its target-side unmet floors (empty `unmet` ⇔ closed
 * only by an own-class blocker). Invariant: `filtered` ∪ eligible = all
 * non-owned classes.
 */
export interface MulticlassFilterReport {
  ownUnmet: FilteredClassCause[];
  filtered: FilteredClassCause[];
}

export function multiclassFilterReport(character: CharacterData): MulticlassFilterReport {
  const scores = character.abilityScores;
  const causeOf = (t: SrdClassTable): FilteredClassCause => ({
    classId: t.id,
    mode: t.primaryAbilityMode === "any" ? "any" : "all",
    unmet: unmetPrimaryAbility(t, scores),
  });
  const owned = getClasses(character);
  const ownUnmet = owned
    .map((e) => getClassTable(e.classId))
    .filter((t): t is SrdClassTable => t != null)
    .map(causeOf)
    .filter((c) => c.unmet.length > 0);
  const ownedIds = new Set(owned.map((e) => e.classId));
  const filtered = classTables
    .filter((t) => !ownedIds.has(t.id))
    .map(causeOf)
    .filter((c) => c.unmet.length > 0 || ownUnmet.length > 0);
  return { ownUnmet, filtered };
}

/** The localizable multiclass entry-grant facts for taking a first level in a
 *  non-initial class (ids/stable strings; the view localizes). */
export interface MulticlassEntryGrants {
  /** Class-table weapon-proficiency {@link ProficiencyToken} ids (`martial-weapons`). */
  weaponProficiencies: ReadonlyArray<ProficiencyToken>;
  /** Class-table armor-training {@link ProficiencyToken} ids (`light-armor`, `shields`). */
  armorTraining: ReadonlyArray<ProficiencyToken>;
  /** Tool-proficiency catalogue IDS (`thieves-tools`, `tinkers-tools`, or the
   *  `musical-instrument` umbrella); the level-up wizard appends each CONCRETE id
   *  to `character.toolProficiencyIds` and localizes its display from the id
   *  (golden rule 7). An umbrella id is a CHOICE, never stored. */
  toolProficiencies: ReadonlyArray<string>;
  /**
   * A skill pick: `options` are SKILL IDS — ALWAYS the concrete pool (the
   * class's list, or all 18 for an "any skill" class like the Bard). Never
   * empty by construction: consumers render it as-is, no widening fallback.
   */
  skillChoice: { count: number; options: ReadonlyArray<string> } | null;
}

/**
 * The partial proficiencies gained when `classId` is taken as a NON-initial
 * class ("As a Multiclass Character"). Null when the class grants only its Hit
 * Point Die (Monk/Sorcerer/Wizard) or the id is unknown.
 */
export function multiclassEntryGrants(classId: string): MulticlassEntryGrants | null {
  const table = getClassTable(classId);
  const mc = table?.multiclass;
  if (!table || !mc) return null;
  return {
    weaponProficiencies: mc.weaponProficiencies ?? [],
    armorTraining: mc.armorTraining ?? [],
    toolProficiencies: mc.toolProficiencies ?? [],
    skillChoice: mc.skillChoice
      ? {
          count: mc.skillChoice.count,
          options: mc.skillChoice.fromClassList
            ? table.skillChoices.from
                .map(skillNameToId)
                .filter((id): id is string => id !== null)
            : ALL_SKILLS.map((s) => s.id),
        }
      : null,
  };
}

/**
 * The armor-training strings a class contributes to the character's derived
 * training set: the FULL table set for the INITIAL class, the partial
 * multiclass set for any other ("you gain only some of the new class's
 * starting proficiencies"). The engine seam `featGateCtx` reads this so a
 * Wizard who multiclasses into Fighter is NOT treated as heavy-armor trained.
 */
export function classArmorTraining(
  classId: string,
  isInitial: boolean
): ProficiencyToken[] {
  const table = getClassTable(classId);
  if (!table) return [];
  if (isInitial) return table.armorProficiencies;
  return table.multiclass?.armorTraining ?? [];
}
