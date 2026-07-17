/**
 * Per-spell OWNING-CLASS casting ability (the multiclass RAW seam).
 *
 * 2024 SRD 5.2.1, "Multiclassing → Spellcasting": a multiclass character uses
 * EACH class's own spellcasting ability for the spells learned through THAT
 * class — a Cleric / Wizard casts Guiding Bolt with Wisdom and Fireball with
 * Intelligence, even though they share one combined spell-slot table. The spell
 * save DC and spell attack bonus are therefore PER SPELL, keyed to the class the
 * spell was learned through, not one primary ability applied to everything.
 *
 * We DERIVE provenance — there is no stored per-spell `classId` (declare the
 * least; golden rule 2). A spell's owning class is the character's CASTER class
 * whose spell list contains the spell. The mapping is unambiguous in the
 * overwhelming majority of builds (a Cleric / Wizard shares only a handful of
 * spells); on a genuine tie (a spell on BOTH classes' lists) or no match we fall
 * back to the character's primary `spellcasting.ability` — exactly today's
 * behavior, so a single-class caster is unchanged BY CONSTRUCTION (one caster
 * class → its ability for every spell).
 *
 * This is the DEFAULT path only. A concrete per-spell override
 * (`spellAbilityOverride` — Magic Initiate, heritage feats) and the deferred-species
 * marker (`speciesSpellAbility`) still win FIRST in {@link resolveSpellAbility};
 * this resolver answers "which class ability backs this spell by default".
 */
import type { AbilityCode } from "@/data/types";
import type { CharacterData } from "@/types/character";
import { getClasses } from "@/lib/classes";
import { getClassTable } from "@/data/classes";
import { getSubclassSpellcasting } from "@/lib/subclass-spellcasting";

/**
 * One of the character's caster classes: the class id, the spell-LIST id used to
 * match a spell's `classes[]` membership, and the spellcasting ability. For a
 * base-class caster the list id IS the class id; for a subclass caster (Eldritch
 * Knight / Arcane Trickster) the list id is the subclass's borrowed `spellList`
 * (the Wizard list), while the ability is the subclass's (Intelligence).
 */
export interface CasterClassAbility {
  classId: string;
  /** The id to match against a spell's `data.classes[]` membership. */
  spellListId: string;
  ability: AbilityCode;
}

/**
 * Every caster class the character has, in class-entry order. A class entry is a
 * caster when its class table has a `spellcasting` block (full/half caster) OR
 * its chosen subclass grants spellcasting (third-caster EK / AT). Non-casters
 * (a Champion Fighter, a Berserker Barbarian) contribute nothing.
 *
 * Deduped by `classId` (a character can't have the same class twice, but keep it
 * total). The order matches `classes[]` so callers can treat the first entry as
 * the deterministic primary when needed.
 */
export function casterClassAbilities(
  character: Pick<CharacterData, "classes">
): CasterClassAbility[] {
  const out: CasterClassAbility[] = [];
  const seen = new Set<string>();
  for (const entry of getClasses(character)) {
    if (seen.has(entry.classId)) continue;
    const table = getClassTable(entry.classId);
    const classCasting = table?.spellcasting;
    if (classCasting) {
      seen.add(entry.classId);
      out.push({
        classId: entry.classId,
        spellListId: entry.classId,
        ability: classCasting.ability,
      });
      continue;
    }
    const subCasting = getSubclassSpellcasting(entry.classId, entry.subclassId);
    if (subCasting) {
      seen.add(entry.classId);
      out.push({
        classId: entry.classId,
        spellListId: subCasting.spellList,
        ability: subCasting.ability,
      });
    }
  }
  return out;
}

/**
 * Resolve the OWNING-class spellcasting ability for a spell by deriving which of
 * the character's caster classes can learn it (its `classes[]` membership).
 *
 *  - 0 or 1 caster classes → `fallback` (single-class behavior is unchanged: the
 *    one caster's ability already equals the primary `spellcasting.ability`).
 *  - exactly 1 matching caster class → THAT class's ability (the multiclass fix).
 *  - >1 matching caster classes (the spell is on several of the character's
 *    lists, e.g. Cure Wounds on Cleric AND Bard) → `fallback`; the build can't
 *    distinguish provenance from data alone, so we keep the deterministic primary
 *    rather than guess. A per-spell `spellAbilityOverride` lets the player pin it.
 *
 * `spellClasses` is the spell's `data.classes` list (the classes that can learn
 * it). `fallback` is the primary `spellcasting.ability`.
 */
export function resolveSpellOwningAbility(
  spellClasses: ReadonlyArray<string> | undefined,
  character: Pick<CharacterData, "classes">,
  fallback: AbilityCode
): AbilityCode {
  const match = uniqueOwningCaster(spellClasses, character);
  return match ? match.ability : fallback;
}

/**
 * The OWNING caster class's id for a spell (mirror of
 * {@link resolveSpellOwningAbility}) — used to scope a class-`scope`d grant bump
 * (`spell-save-dc-bonus` / `spell-attack-bonus`: "+1 to your Sorcerer spells").
 * Returns `fallbackClassId` (the primary class) on 0/1 caster classes or an
 * ambiguous/no match, so a single-class build and the no-derivation case both
 * scope to the primary exactly as before.
 */
export function resolveSpellOwningClassId(
  spellClasses: ReadonlyArray<string> | undefined,
  character: Pick<CharacterData, "classes">,
  fallbackClassId: string
): string {
  const match = uniqueOwningCaster(spellClasses, character);
  return match ? match.classId : fallbackClassId;
}

/**
 * The single caster class that can learn the spell, or null when the character
 * has ≤1 caster class, the spell carries no class list, or several of the
 * character's caster classes share it (ambiguous provenance). Shared by the
 * ability + classId resolvers so they always agree by construction.
 */
function uniqueOwningCaster(
  spellClasses: ReadonlyArray<string> | undefined,
  character: Pick<CharacterData, "classes">
): CasterClassAbility | null {
  const casters = casterClassAbilities(character);
  if (casters.length <= 1) return null;
  if (!spellClasses || spellClasses.length === 0) return null;
  const matches = casters.filter((c) => spellClasses.includes(c.spellListId));
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
