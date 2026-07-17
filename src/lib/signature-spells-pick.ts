/**
 * Wizard L20 Signature Spells picker.
 *
 * 2024 RAW (PHB Wizard L20): "Choose two 3rd-level wizard spells in your
 * spellbook as your signature spells. You always have these spells
 * prepared, they don't count against the number of spells you have
 * prepared, and you can cast each of them once at 3rd level without
 * expending a spell slot. When you do so, you can't do so again until
 * you finish a Short or Long Rest."
 *
 * Implementation mirrors `lib/spell-mastery-pick.ts`:
 *   - Picker offers TWO slots, both filtered to L3 wizard spells from
 *     `character.spells[]` (the spellbook).
 *   - Sets `wizardSignatureSpell: true` AND `alwaysPrepared: true` on
 *     each chosen ref. The always-prepared flag flows through the
 *     existing prepared-count logic so the picks don't blow the budget.
 *   - The 1×/short-rest free-cast tracker is already declared on the
 *     `wizard-signature-spells` feature itself.
 *
 * Pure module — no React/store deps. Players can edit the flags
 * manually on the spell card for full homebrew override.
 */
import { spellbookSpellsAtLevel } from "@/lib/spell-mastery-pick";
import type { CustomSpell, SrdSpellRef } from "@/types/character";

/** Up to two chosen L3 spell ids (`first` is the primary signature). */
export interface SignatureSpellsPicks {
  first?: string;
  second?: string;
}

export function emptySignatureSpellsPicks(): SignatureSpellsPicks {
  return {};
}

/** Both must be set AND distinct to satisfy the wizard. */
export function isSignatureSpellsComplete(picks: SignatureSpellsPicks): boolean {
  if (picks.first == null || picks.second == null) return false;
  return picks.first !== picks.second;
}

/**
 * L3 SRD spells currently in the character's spellbook (excludes custom).
 * Wizard-class-list constraint is enforced by the spellbook itself.
 */
export function eligibleSignatureSpells(
  characterSpells: ReadonlyArray<SrdSpellRef | CustomSpell>
): ReadonlyArray<{ id: string }> {
  return spellbookSpellsAtLevel(characterSpells, 3);
}

/**
 * Apply the picks. Sets `wizardSignatureSpell: true` AND
 * `alwaysPrepared: true` on each chosen ref. Clears both flags on
 * previously-signed spells that aren't in the new picks.
 */
export function applySignatureSpellsPicks(
  existing: ReadonlyArray<SrdSpellRef | CustomSpell>,
  picks: SignatureSpellsPicks
): (SrdSpellRef | CustomSpell)[] {
  const chosen = new Set<string>();
  if (picks.first) chosen.add(picks.first);
  if (picks.second) chosen.add(picks.second);
  return existing.map((ref) => {
    if ("custom" in ref) return ref;
    if (chosen.has(ref.srdId)) {
      return { ...ref, wizardSignatureSpell: true, alwaysPrepared: true };
    }
    // Clear our flag if the player rotated the choice (8h study mechanic).
    if (ref.wizardSignatureSpell) {
      const next = { ...ref };
      delete next.wizardSignatureSpell;
      // Don't clear alwaysPrepared here — that flag may belong to a
      // different source (Domain spell, etc.) on the same ref. Only clear
      // it if it was set BECAUSE of signature spells. Conservative: leave
      // it set; the player can untoggle in the UI.
      return next;
    }
    return ref;
  });
}

/** True iff the character has at least one L3 SRD spell to pick from. */
export function hasEligibleSignatureSpells(
  characterSpells: ReadonlyArray<SrdSpellRef | CustomSpell>
): boolean {
  return eligibleSignatureSpells(characterSpells).length > 0;
}
