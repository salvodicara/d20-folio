/**
 * M1 — Expertise choice modelling.
 *
 * Rogue L1 and Bard L2 / L9 each grant the player two Expertise picks
 * (per 2024 RAW: "Choose two skills from your proficiencies. You gain
 * Expertise in those skills"). Until now the wizard added the placeholder
 * `<class>-expertise` feature but never prompted the player to pick;
 * skills stayed at "proficient" and the +PB doubling never applied.
 *
 * This helper is pure: callers (LevelUpModal) use it to (a) detect when
 * a level grants Expertise, (b) enumerate skills currently eligible for
 * promotion, and (c) apply the picks to the character's skills map.
 */

import type { CharacterData } from "@/types/character";

/** Placeholder feature ids that signal "two Expertise picks unlocked". */
const EXPERTISE_FEATURE_IDS: ReadonlySet<string> = new Set([
  "rogue-expertise",
  "bard-expertise",
]);

/** Returns true when the supplied feature id grants Expertise picks. */
export function isExpertisePlaceholder(featureId: string): boolean {
  return EXPERTISE_FEATURE_IDS.has(featureId);
}

/** Number of expertise picks granted per occurrence (always 2 in 2024 RAW). */
export const EXPERTISE_PICKS_PER_GRANT = 2;

/**
 * Returns the list of skill ids currently eligible to be promoted to
 * Expertise: the character must already be Proficient in the skill, and
 * the skill must not already be at Expertise.
 */
export function listExpertiseEligibleSkills(skills: CharacterData["skills"]): string[] {
  const out: string[] = [];
  for (const [skillId, level] of Object.entries(skills)) {
    if (level === "proficient") out.push(skillId);
  }
  return out.sort();
}

/**
 * Apply a list of expertise picks to the character's skills map. Skills
 * that aren't currently "proficient" are skipped silently (the picker
 * UI is expected to filter, but the helper is defensive).
 */
export function applyExpertisePicks(
  skills: CharacterData["skills"],
  picks: ReadonlyArray<string>
): CharacterData["skills"] {
  if (picks.length === 0) return skills;
  const next: CharacterData["skills"] = { ...skills };
  for (const skillId of picks) {
    if (next[skillId] === "proficient") next[skillId] = "expertise";
  }
  return next;
}
