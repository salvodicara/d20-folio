/**
 * Skill catalog + name→id — pure, SRD-FREE.
 *
 * The 18 D&D 2024 skills and the Title-Case→kebab-id helper. Extracted from
 * `compute.ts` (which transitively imports the SRD) so eager utilities — the
 * persistence layer's character sanitizer, the background data — can use them
 * without dragging the SRD onto the initial bundle (#59/#78). `compute.ts`
 * re-exports both so every existing `from "@/lib/compute"` import keeps working.
 */
import type { AbilityCode } from "@/data/types";

/** All D&D 2024 skills with their associated abilities. */
export const ALL_SKILLS: ReadonlyArray<{
  id: string;
  name: string;
  ability: AbilityCode;
}> = [
  { id: "acrobatics", name: "Acrobatics", ability: "DEX" },
  { id: "animal-handling", name: "Animal Handling", ability: "WIS" },
  { id: "arcana", name: "Arcana", ability: "INT" },
  { id: "athletics", name: "Athletics", ability: "STR" },
  { id: "deception", name: "Deception", ability: "CHA" },
  { id: "history", name: "History", ability: "INT" },
  { id: "insight", name: "Insight", ability: "WIS" },
  { id: "intimidation", name: "Intimidation", ability: "CHA" },
  { id: "investigation", name: "Investigation", ability: "INT" },
  { id: "medicine", name: "Medicine", ability: "WIS" },
  { id: "nature", name: "Nature", ability: "INT" },
  { id: "perception", name: "Perception", ability: "WIS" },
  { id: "performance", name: "Performance", ability: "CHA" },
  { id: "persuasion", name: "Persuasion", ability: "CHA" },
  { id: "religion", name: "Religion", ability: "INT" },
  { id: "sleight-of-hand", name: "Sleight of Hand", ability: "DEX" },
  { id: "stealth", name: "Stealth", ability: "DEX" },
  { id: "survival", name: "Survival", ability: "WIS" },
];

/**
 * Convert a Title Case skill name (e.g. "Animal Handling") or a kebab-case ID
 * (e.g. "animal-handling") to the canonical kebab-case skill ID used in the app.
 * Returns null if the result does not match any of the 18 SRD skills (e.g. a tool).
 */
export function skillNameToId(name: string): string | null {
  const id = name.toLowerCase().replace(/'/g, "").replace(/\s+/g, "-");
  return ALL_SKILLS.some((s) => s.id === id) ? id : null;
}

/** The states a skill entry can hold on a character (`character.skills`). */
export type SkillProficiency = "proficient" | "expertise" | "halfProficiency";

/**
 * The skill ids the character is REALLY proficient in (`proficient` |
 * `expertise`). Jack of All Trades' `halfProficiency` is a check bonus, NOT a
 * proficiency — a rehydrated JoAT character carries an entry for ALL 18 skills,
 * so "owned" filters must read the proficiency STATE, never key presence
 * (the live Bard→Ladro empty-pool dead-end, owner 2026-06-11).
 */
export function proficientSkillIds(
  skills: Readonly<Record<string, SkillProficiency>>
): Set<string> {
  return new Set(
    Object.keys(skills).filter(
      (id) => skills[id] === "proficient" || skills[id] === "expertise"
    )
  );
}

/**
 * Grant FULL proficiency in `id`: fills an unset entry, upgrades Jack-of-All-
 * Trades `halfProficiency` (full strictly beats half), never downgrades an
 * existing `proficient`/`expertise`. Returns the SAME record when nothing
 * changes (identity check stays cheap for callers).
 */
export function grantSkillProficiency(
  skills: Readonly<Record<string, SkillProficiency>>,
  id: string
): Readonly<Record<string, SkillProficiency>> {
  if (skills[id] === undefined || skills[id] === "halfProficiency") {
    return { ...skills, [id]: "proficient" };
  }
  return skills;
}
