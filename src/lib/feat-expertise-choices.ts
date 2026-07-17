/**
 * Resolve `choice-expertise` grants — "gain Expertise in N skills you're
 * proficient in" (Skill Expert, Prodigy, …). The picker offers only the
 * character's currently-proficient (non-expertise) skills; resolution upgrades
 * the chosen skills to "expertise" via the shared `applyExpertisePicks`.
 *
 * Pure module — no React/store deps. Mirrors `feat-skill-choices.ts`.
 */
import type { Grant } from "@/lib/grants";
import type { CharacterData } from "@/types/character";
import { applyExpertisePicks } from "@/lib/expertise-pick";
import { arePicksComplete } from "@/lib/feat-choices-common";

export interface ExpertiseChoiceSlot {
  amount: number;
  slotId: string;
}

export type ExpertiseChoicePicks = Record<string, ReadonlyArray<string>>;

/** Walk a source's grants and emit one slot per `choice-expertise` grant. */
export function pendingExpertiseSlotsForFeat(feat: {
  grants?: ReadonlyArray<Grant>;
}): ExpertiseChoiceSlot[] {
  const slots: ExpertiseChoiceSlot[] = [];
  let idx = 0;
  for (const g of feat.grants ?? []) {
    if (g.type === "choice-expertise") {
      slots.push({ amount: g.amount, slotId: `slot-${idx++}` });
    }
  }
  return slots;
}

/** Each slot must be filled to its required amount. */
export function isExpertisePicksComplete(
  slots: ReadonlyArray<ExpertiseChoiceSlot>,
  picks: ExpertiseChoicePicks
): boolean {
  return arePicksComplete(slots, picks);
}

/**
 * Apply expertise picks: each chosen skill is upgraded from "proficient" to
 * "expertise" (skills not currently proficient are skipped by the shared
 * applier, defensively). Idempotent for skills already at expertise.
 */
export function applyExpertiseChoicePicks(
  character: CharacterData,
  picks: ExpertiseChoicePicks
): CharacterData {
  const allIds = Object.values(picks).flat();
  if (allIds.length === 0) return character;
  const nextSkills = applyExpertisePicks(character.skills, allIds);
  if (nextSkills === character.skills) return character;
  return { ...character, skills: nextSkills };
}
