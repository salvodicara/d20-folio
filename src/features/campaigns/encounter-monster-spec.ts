/**
 * encounter-monster-spec — the DERIVED add-mode monster spec factory. Split out of
 * `encounter-bestiary.tsx` (which stays component-only) because it statically imports
 * the bestiary corpus via `monsterSpec`; it is imported ONLY by `encounter-bestiary.tsx`,
 * so it rides the SAME single lazy seam (the eager-partition tripwire pins both files as
 * the only campaigns modules allowed to reach `picker/specs/monster`).
 */

import { monsterSpec } from "@/features/compendium/picker/specs/monster";
import type { CompendiumPickerSpec, TFn } from "@/features/compendium/picker/types";
import type { MonsterStatBlock } from "@/data/types";
import type { MonsterArt } from "@/types/campaign";
import { toMonsterInput } from "./encounter-monster-input";
import type { MonsterInput } from "./encounter";

/**
 * Derive the encounter's ADD-mode monster spec from the browse `monsterSpec` by
 * spread: same facts (data · search · facets · row · detail), plus the add-mode
 * opt-ins. The quantity cap is 20 (the same ceiling the manual form enforces), so
 * an out-of-range count is untypeable, never clamped (golden rule 20). No
 * `existingIds`: encounter membership is not set-membership — the same statblock
 * is addable repeatedly (each add is a new group).
 */
export function makeEncounterMonsterSpec(
  onAdd: (input: MonsterInput) => void,
  t: TFn,
  /** The DM's SRD portrait override for a monster (by srdId), or undefined — copied
   *  onto the combatant at add time (Part B). */
  resolveArt: (srdId: string) => MonsterArt | undefined
): CompendiumPickerSpec<MonsterStatBlock> {
  return {
    ...monsterSpec,
    supportsQuantity: true,
    quantityMax: () => 20,
    addLabel: () => t("campaignHub.encounterAddMonster"),
    onAdd: (m, ctx, quantity) =>
      onAdd(toMonsterInput(m, ctx.locale, quantity ?? 1, resolveArt(m.id))),
  };
}
