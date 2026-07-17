/**
 * Resolve Skilled-style "pick N skills or tools" feat choices.
 *
 * Skilled (2024 RAW): "You gain proficiency in any combination of three
 * skills or tools of your choice." The grants pipeline declares this as
 * `{ type: "choice-skill-or-tool-proficiency", amount: 3 }`. The picker
 * surfaces a unified pool (skills + 2024 SRD tools) and the player picks
 * `amount` items. Resolution (id-based, single-source):
 *   - Skill picks → `character.skills[id] = "proficient"`
 *   - Tool picks  → STABLE IDS in `character.toolChoices[slotId]` (the SAME
 *     id-based home as a pure `choice-tool-proficiency` pick), from which the
 *     proficiency is DERIVED (the synthetic tool-choice grant source) — never a
 *     baked free-text string (golden rules 6 + 7).
 *
 * Pure module — no React/store deps.
 */
import { ALL_SKILLS } from "@/lib/compute";
import { grantSkillProficiency } from "@/lib/skills";
import type { Grant } from "@/lib/grants";
import { arePicksComplete } from "@/lib/feat-choices-common";
import type { CharacterData } from "@/types/character";
import { SRD_TOOLS_2024 } from "@/lib/tools";

// The tool catalogue + its derived id lists live in the dependency-light
// `@/lib/tools` module (so class data can import the id lists without an import
// cycle). Re-exported here so this module's existing consumers stay unchanged;
// the resolver below uses the locally-imported `SRD_TOOLS_2024`.
export {
  SRD_TOOLS_2024,
  ARTISAN_TOOL_IDS,
  MUSICAL_INSTRUMENT_IDS,
  type ToolCategory,
} from "@/lib/tools";

/** One pending skill-or-tool slot derived from a feat's grants. */
export interface SkillOrToolSlot {
  amount: number;
  slotId: string;
}

/**
 * Walk a feat's grants and return one slot per
 * `choice-skill-or-tool-proficiency` entry. Most feats have at most one
 * (Skilled: 3 picks), but the structure supports future content with
 * multiple separate pools.
 */
export function pendingSkillOrToolSlotsForFeat(feat: {
  grants?: ReadonlyArray<Grant>;
}): SkillOrToolSlot[] {
  const slots: SkillOrToolSlot[] = [];
  let idx = 0;
  for (const g of feat.grants ?? []) {
    if (g.type === "choice-skill-or-tool-proficiency") {
      slots.push({ amount: g.amount, slotId: `slot-${idx++}` });
    }
  }
  return slots;
}

/** Picks keyed by slot id, value is the list of chosen ids (skill OR tool). */
export type SkillOrToolPicks = Record<string, ReadonlyArray<string>>;

/** Slot-completeness gate for the wizard. */
export function isSkillOrToolPicksComplete(
  slots: ReadonlyArray<SkillOrToolSlot>,
  picks: SkillOrToolPicks
): boolean {
  return arePicksComplete(slots, picks);
}

/** Distinguish a pick id as a skill (matches an ALL_SKILLS entry) or a tool. */
export function isSkillId(id: string): boolean {
  return ALL_SKILLS.some((s) => s.id === id);
}

/**
 * Apply Skilled-style picks to a character. Skills land in `character.skills` as
 * `"proficient"`; a chosen TOOL lands as a STABLE ID in `character.toolChoices`,
 * keyed by the pick's SLOT id (the SAME id-based home as a pure
 * `choice-tool-proficiency` pick — the proficiency is then DERIVED, never baked as
 * a free-text string). Idempotent + non-destructive for already-known items. The
 * tool catalogue id is stored AS-IS (no name lookup) — display localizes by id.
 */
export function applySkillOrToolPicks(
  character: CharacterData,
  picks: SkillOrToolPicks
): CharacterData {
  if (Object.values(picks).flat().length === 0) return character;
  let nextSkills = character.skills;
  // Clone the existing tool-choice map so we append per slot without mutation.
  const nextToolChoices: Record<string, string[]> = {};
  for (const [slotId, ids] of Object.entries(character.toolChoices ?? {})) {
    nextToolChoices[slotId] = [...ids];
  }
  let toolsChanged = false;
  for (const [slotId, ids] of Object.entries(picks)) {
    for (const id of ids) {
      if (isSkillId(id)) {
        // The ONE grant rule (`grantSkillProficiency`): fills unset, upgrades
        // JoAT `halfProficiency`, never downgrades `proficient`/`expertise`.
        nextSkills = grantSkillProficiency(nextSkills, id);
      } else {
        // A TOOL pick — record its id under this slot (deduped). Unknown ids are
        // skipped (only catalogue tools are real picks); `toolChoices` holds ids,
        // and the proficiency derives from them (single source, rules 6 + 7).
        if (!SRD_TOOLS_2024.some((t) => t.id === id)) continue;
        const existing = nextToolChoices[slotId] ?? [];
        if (!existing.includes(id)) {
          nextToolChoices[slotId] = [...existing, id];
          toolsChanged = true;
        }
      }
    }
  }
  if (nextSkills === character.skills && !toolsChanged) return character;
  return {
    ...character,
    skills: nextSkills,
    ...(toolsChanged ? { toolChoices: nextToolChoices } : {}),
  };
}
