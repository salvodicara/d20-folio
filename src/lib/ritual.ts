/**
 * Ritual-casting eligibility (D&D 2024).
 *
 * 2024 PHB p.235: "You can cast a spell as a Ritual if that spell has the
 * Ritual tag and you have the spell prepared."
 *
 * Wizards alone get the "Ritual Adept" feature (PHB 2024 p.184) which lets
 * them cast any ritual *in their spellbook*, prepared or not — for us that
 * collapses to "any ritual on the sheet" since we don't model the spellbook
 * separately from the character's spell list.
 *
 * Previous logic carved out Bard / Sorcerer / Warlock as "known casters" and
 * let them ritual-cast every known spell regardless of preparation. That was
 * a 2014 rule — in the 2024 PHB those classes are all prepared casters
 * (Bard Spells Prepared / Sorcerer Spells Prepared / Warlock Spells Prepared
 * columns) and thus follow the general rule.
 *
 * Cantrips never have the ritual tag, so we conservatively reject level 0.
 */

import type { SrdSpellData } from "@/data/types";

export function canRitualCast(args: {
  spell: Pick<SrdSpellData, "level" | "ritual">;
  classId: string;
  isPrepared: boolean;
}): boolean {
  const { spell, classId, isPrepared } = args;
  if (!spell.ritual) return false;
  if (spell.level <= 0) return false;

  // Ritual Adept (Wizard L1): every ritual in the spellbook counts.
  if (classId === "wizard") return true;
  // Everyone else: must currently be prepared.
  return isPrepared;
}
