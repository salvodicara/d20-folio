/**
 * Per-spell casting ability resolution.
 *
 * Most spells use the character's class spellcasting ability (Bard → CHA,
 * Wizard → INT, etc.). But feats and species can pin / defer the ability,
 * and a MULTICLASS caster uses each class's OWN ability per spell:
 *   - Magic Initiate (Cleric) → WIS regardless of base class
 *   - Magic Initiate (Wizard) → INT regardless of base class
 *   - Magic Initiate (Druid)  → WIS regardless of base class
 *   - Tiefling Fiendish Legacy / Otherworldly Presence → the INT/WIS/CHA the
 *     player chose for the species (deferred, override-able per character).
 *   - Cleric / Wizard multiclass → Guiding Bolt uses WIS, Fireball uses INT
 *     (2024 RAW: each spell is cast with the ability of the class it was learned
 *     through). Resolved by deriving the spell's owning caster class from its
 *     class-list membership (`resolveSpellOwningAbility`).
 *
 * Resolution order (first match wins):
 *   1. `ref.spellAbilityOverride` — a concrete ability pinned on the ref
 *      (Magic Initiate, heritage feats, manual per-spell edit).
 *   2. `ref.speciesSpellAbility` — a DEFERRED species pick: read the live
 *      `character.speciesSpellAbility`, defaulting to `SPECIES_SPELL_ABILITY_DEFAULT`
 *      when the player hasn't chosen yet. Custom spells can't carry this marker.
 *   3. the OWNING class's spellcasting ability — the spell's owning caster class
 *      (multiclass-aware; identical to the single caster's ability for a
 *      single-class character). `spellClasses` (the SRD spell's `classes[]`)
 *      drives the derivation; omitting it falls back to the primary ability.
 *   4. `null` (homebrew custom spell on a non-caster character).
 */
import type { AbilityCode } from "@/data/types";
import type { CharacterData, CustomSpell, SrdSpellRef } from "@/types/character";
import { resolveSpellOwningAbility } from "@/lib/spell-owning-class";

/**
 * Default casting ability for "choose INT/WIS/CHA" species lineages when the
 * player hasn't made the pick yet. Charisma is the canonical RAW flavor for the
 * 2024 Tiefling (the only such lineage today) and the most common spellcasting
 * ability, so it's the sensible out-of-the-box default. Override-first: the
 * player sets `character.speciesSpellAbility` to change it.
 */
export const SPECIES_SPELL_ABILITY_DEFAULT: AbilityCode = "CHA";

export function resolveSpellAbility(
  ref: SrdSpellRef | CustomSpell,
  character: Pick<CharacterData, "spellcasting" | "speciesSpellAbility" | "classes">,
  /**
   * The SRD spell's `classes[]` list (which classes can learn it) — drives the
   * multiclass owning-class derivation in step 3. Omit (or pass undefined) for a
   * custom/homebrew spell or when provenance can't be derived; the resolver then
   * falls back to the primary `spellcasting.ability` (today's behavior).
   */
  spellClasses?: ReadonlyArray<string>
): AbilityCode | null {
  if (ref.spellAbilityOverride) return ref.spellAbilityOverride;
  if (!("custom" in ref) && ref.speciesSpellAbility) {
    return character.speciesSpellAbility ?? SPECIES_SPELL_ABILITY_DEFAULT;
  }
  const primary = character.spellcasting?.ability;
  if (primary == null) return null;
  return resolveSpellOwningAbility(spellClasses, character, primary);
}
