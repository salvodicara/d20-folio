/**
 * Resolve `choice-skill-proficiency` grants on feats.
 *
 * Skill Expert (1 skill of choice), Purple Dragon Rook (Insight /
 * Performance / Persuasion), and any future feat granting a constrained
 * skill choice. Distinct from the Skilled-style unified picker
 * (`choice-skill-or-tool-proficiency`) so the player only sees skills.
 *
 * Pure module — no React/store deps. Picks land on `character.skills`
 * as `"proficient"`, preserving prior `"expertise"`.
 */
import type { Grant } from "@/lib/grants";
import { ALL_SKILLS } from "@/lib/compute";
import { grantSkillProficiency } from "@/lib/skills";
import { arePicksComplete } from "@/lib/feat-choices-common";
import type { CharacterData } from "@/types/character";

export interface SkillChoiceSlot {
  amount: number;
  slotId: string;
  /**
   * SRD skill ids the player may pick from. Empty array means "any skill
   * the character isn't already proficient/expert in" (Skill Expert pattern).
   */
  options: ReadonlyArray<string>;
}

export type SkillChoicePicks = Record<string, ReadonlyArray<string>>;

export function pendingSkillSlotsForFeat(feat: {
  grants?: ReadonlyArray<Grant>;
}): SkillChoiceSlot[] {
  const slots: SkillChoiceSlot[] = [];
  let idx = 0;
  for (const g of feat.grants ?? []) {
    if (g.type === "choice-skill-proficiency") {
      slots.push({ amount: g.amount, slotId: `slot-${idx++}`, options: g.options });
    }
  }
  return slots;
}

export function isSkillPicksComplete(
  slots: ReadonlyArray<SkillChoiceSlot>,
  picks: SkillChoicePicks
): boolean {
  return arePicksComplete(slots, picks);
}

/**
 * Apply skill picks: each pick lands as `"proficient"` in character.skills.
 * Does not downgrade `"expertise"` (preserves higher state).
 */
export function applySkillPicks(
  character: CharacterData,
  picks: SkillChoicePicks
): CharacterData {
  const allIds = Object.values(picks).flat();
  if (allIds.length === 0) return character;
  // The ONE grant rule (`grantSkillProficiency`): full proficiency fills an
  // unset entry or upgrades JoAT `halfProficiency`; never downgrades.
  let next = character.skills;
  for (const id of allIds) next = grantSkillProficiency(next, id);
  if (next === character.skills) return character;
  return { ...character, skills: next };
}

/**
 * Available skills for a slot. When `slot.options` is empty, all 18
 * standard skills are available; otherwise restricted to the listed set.
 * Skills the character already has are dimmed by the UI (passed via the
 * `existingSkillIds` prop on the picker component).
 */
export function listAvailableForSkillSlot(
  slot: SkillChoiceSlot
): ReadonlyArray<{ id: string; name: string }> {
  const allowed = slot.options.length > 0 ? new Set(slot.options) : null;
  return ALL_SKILLS.filter((s) => (allowed ? allowed.has(s.id) : true)).map((s) => ({
    id: s.id,
    name: s.name,
  }));
}
