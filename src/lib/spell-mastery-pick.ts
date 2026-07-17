/**
 * Wizard L18 Spell Mastery picker.
 *
 * 2024 RAW (PHB Wizard L18): "Choose a 1st-level and a 2nd-level wizard
 * spell that are in your spellbook. You can cast those spells at their
 * lowest level without expending a spell slot when you have them prepared.
 * You can change your selections by spending 8 hours in study."
 *
 * Implementation:
 *   - Picker offers exactly 2 slots: one L1 spell + one L2 spell.
 *   - Eligibility: any SRD spell already on `character.spells[]` matching
 *     the level. Wizard-spell constraint is enforced by the spell already
 *     being in the spellbook (Wizards only learn from the Wizard list).
 *   - Resolution: sets `wizardSpellMastery: true` on each chosen SrdSpellRef.
 *
 * The flag is a per-spell-ref bit — the same architectural pattern as
 * `alwaysPrepared`. UI badges it on the spell card. The cast modal can
 * skip slot deduction when the spell is cast at its base level (future).
 *
 * Pure module. Player can always edit the flag manually on the spell card
 * for full homebrew override.
 */
import { spellIndex } from "@/data/spells";
import type { CustomSpell, SrdSpellRef } from "@/types/character";

/** Pending picks: `{ "level-1": spellId, "level-2": spellId }`. */
export interface SpellMasteryPicks {
  level1?: string;
  level2?: string;
}

/** Empty initial picks state for the wizard. */
export function emptySpellMasteryPicks(): SpellMasteryPicks {
  return {};
}

/** Wizard L18 grants exactly 2 slots; check both are filled. */
export function isSpellMasteryComplete(picks: SpellMasteryPicks): boolean {
  return picks.level1 != null && picks.level2 != null;
}

/**
 * SRD spells in the character's spellbook (`character.spells[]`) at an EXACT level —
 * stable ids only (the caller localizes each name off the `spell` catalogue by id; the
 * display name was stripped from the data layer). The ONE spellbook-by-level filter,
 * shared by the Wizard Spell Mastery (L1/L2) and Signature Spells (L3) pickers so the
 * two can never drift (golden rule 6).
 */
export function spellbookSpellsAtLevel(
  characterSpells: ReadonlyArray<SrdSpellRef | CustomSpell>,
  level: number
): ReadonlyArray<{ id: string }> {
  const out: { id: string }[] = [];
  for (const ref of characterSpells) {
    if ("custom" in ref) continue;
    const spell = spellIndex.get(ref.srdId);
    if (!spell || spell.level !== level) continue;
    out.push({ id: spell.id });
  }
  return out;
}

/**
 * Eligible SRD spells the player can pick for a Spell Mastery slot — the spellbook
 * filtered to the slot's exact level (1 or 2).
 */
export function eligibleSpellMasteryPicks(
  characterSpells: ReadonlyArray<SrdSpellRef | CustomSpell>,
  spellLevel: 1 | 2
): ReadonlyArray<{ id: string }> {
  return spellbookSpellsAtLevel(characterSpells, spellLevel);
}

/**
 * Apply the picks to a character's spells[] array, setting
 * `wizardSpellMastery: true` on the chosen refs. Idempotent. Clears the
 * flag on any other ref that was previously mastered (lets the player
 * change picks on subsequent level-ups or via the 8-hour-study mechanic).
 */
export function applySpellMasteryPicks(
  existing: ReadonlyArray<SrdSpellRef | CustomSpell>,
  picks: SpellMasteryPicks
): (SrdSpellRef | CustomSpell)[] {
  const chosen = new Set<string>();
  if (picks.level1) chosen.add(picks.level1);
  if (picks.level2) chosen.add(picks.level2);
  return existing.map((ref) => {
    if ("custom" in ref) return ref;
    if (chosen.has(ref.srdId)) {
      return { ...ref, wizardSpellMastery: true };
    }
    // Clear the flag on previously-mastered spells that aren't in the new picks.
    if (ref.wizardSpellMastery) {
      const next = { ...ref };
      delete next.wizardSpellMastery;
      return next;
    }
    return ref;
  });
}

/** True iff the given level has at least one eligible spell on the character. */
export function hasEligibleSpellsAtLevel(
  characterSpells: ReadonlyArray<SrdSpellRef | CustomSpell>,
  spellLevel: 1 | 2
): boolean {
  return eligibleSpellMasteryPicks(characterSpells, spellLevel).length > 0;
}
