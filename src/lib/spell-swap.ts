/**
 * Spell-swap helpers for the Level-Up wizard.
 *
 * Known-casters (Bard, Sorcerer, Ranger, Warlock) may optionally replace
 * exactly one spell they already know with a different eligible spell
 * whenever they gain a level. These helpers manage the choice state.
 */

import { isCustomSpell } from "@/types/character";
import type { CustomSpell, SrdSpellRef } from "@/types/character";

export interface SpellSwapChoice {
  /** SRD ID of the spell being removed, or null if no swap chosen */
  removeId: string | null;
  /** SRD ID of the replacement spell, or null if no swap chosen */
  replaceId: string | null;
}

export function emptySwapChoice(): SpellSwapChoice {
  return { removeId: null, replaceId: null };
}

/**
 * Returns true when the choice is in a half-filled invalid state:
 * one picker has a value but the other does not.
 *
 * Valid states:
 * - both null → skip the swap (valid)
 * - both set  → apply the swap (valid)
 *
 * Invalid state:
 * - only one set → user must complete or clear
 */
export function isSwapIncomplete(choice: SpellSwapChoice): boolean {
  return (choice.removeId === null) !== (choice.replaceId === null);
}

/**
 * Apply a confirmed spell swap: drop the SRD spell matching `removeId` and
 * append a fresh SRD ref for `replaceId`. Custom (homebrew) spells are always
 * preserved — only the targeted SRD ref is removed.
 *
 * The production caller (the LevelUpWizard commit step) guards both ids non-null
 * before calling, so the params are plain strings (not nullable). Pure: returns
 * a new array, never mutates the input.
 */
export function applySpellSwap(
  spells: Array<SrdSpellRef | CustomSpell>,
  removeId: string,
  replaceId: string
): Array<SrdSpellRef | CustomSpell> {
  const withoutOld = spells.filter((s) => isCustomSpell(s) || s.srdId !== removeId);
  return [...withoutOld, { srdId: replaceId }];
}
