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
 *   2. the feat's answer — a spell whose casting ability is "the ability
 *      increased by this feat": the granting feat's live `featAbility`
 *      (`featAbilityOf`). The feat is named by `ref.featSpellAbility`, or traced
 *      from the pick's `freeCastSource` for a spell picked through such a feat's
 *      `choice-spell`. While the feat is unanswered, the chain continues below
 *      (the species marker its grant may name, then the class) — exactly what
 *      the spell read before the answer was stored.
 *   3. `ref.speciesSpellAbility` — a DEFERRED species pick: read the live
 *      `character.speciesSpellAbility`; while unpicked, the character's own casting
 *      ability when it is INT, WIS or CHA, else `SPECIES_SPELL_ABILITY_DEFAULT`.
 *      Custom spells can't carry this marker.
 *   4. `ref.viaClass` — the class the spell is prepared through, when the
 *      character casts with that class (two copies, two abilities).
 *   5. the OWNING class's spellcasting ability — the spell's owning caster class
 *      (multiclass-aware; identical to the single caster's ability for a
 *      single-class character). `spellClasses` (the SRD spell's `classes[]`)
 *      drives the derivation; omitting it falls back to the primary ability.
 *   6. `null` (homebrew custom spell on a non-caster character).
 */
import type { AbilityCode } from "@/data/types";
import type { CharacterData, CustomSpell, SrdSpellRef } from "@/types/character";
import { FEATS_BY_ID } from "@/data/feats";
import { featAbilityOf } from "@/lib/feat-ability";
import {
  casterClassAbilities,
  resolveSpellOwningAbility,
} from "@/lib/spell-owning-class";

/**
 * Default casting ability for "choose INT/WIS/CHA" species lineages when the
 * player hasn't made the pick yet. Charisma is the canonical RAW flavor for the
 * 2024 Tiefling (the only such lineage today) and the most common spellcasting
 * ability, so it's the sensible out-of-the-box default. Override-first: the
 * player sets `character.speciesSpellAbility` to change it.
 */
export const SPECIES_SPELL_ABILITY_DEFAULT: AbilityCode = "CHA";

/**
 * The species spell ability shown while the player hasn't picked it yet (the banner
 * still asks): the character's own casting ability when it is one of the species'
 * three (INT, WIS, CHA), so an elf Wizard's lineage spells don't read a Charisma DC;
 * Charisma otherwise.
 */
function unpickedSpeciesAbility(
  character: Pick<CharacterData, "spellcasting">
): AbilityCode {
  const own = character.spellcasting?.ability;
  return own === "INT" || own === "WIS" || own === "CHA"
    ? own
    : SPECIES_SPELL_ABILITY_DEFAULT;
}

/**
 * The feat whose "ability increased by this feat" casts `ref`, if any: its
 * `featSpellAbility` marker, or — for a spell picked through a feat's
 * `choice-spell` with `spellAbilitySource: "feat"` — the feat its free-cast
 * source names (`<featId>` or the per-spell `<featId>:<spellId>`).
 */
export function spellAbilityFeat(ref: SrdSpellRef | CustomSpell): string | undefined {
  if ("custom" in ref) return undefined;
  if (ref.featSpellAbility) return ref.featSpellAbility;
  const traced = ref.freeCastSource?.sourceId.split(":")[0];
  if (!traced) return undefined;
  const feat = FEATS_BY_ID.get(traced);
  return feat?.grants?.some(
    (g) => g.type === "choice-spell" && g.spellAbilitySource === "feat"
  )
    ? traced
    : undefined;
}

/**
 * Whether `ref`'s casting ability is pinned away from its class — a concrete
 * override, the species pick, or an answered feat — so its DC and attack are
 * the primary caster's, not an owning class's.
 */
export function spellAbilityPinned(
  ref: SrdSpellRef | CustomSpell,
  character: Pick<CharacterData, "features">
): boolean {
  if (ref.spellAbilityOverride != null) return true;
  if ("custom" in ref) return false;
  if (ref.speciesSpellAbility) return true;
  const feat = spellAbilityFeat(ref);
  return feat !== undefined && featAbilityOf(character, feat) !== null;
}

export function resolveSpellAbility(
  ref: SrdSpellRef | CustomSpell,
  character: Pick<
    CharacterData,
    "spellcasting" | "speciesSpellAbility" | "classes" | "features"
  >,
  /**
   * The SRD spell's `classes[]` list (which classes can learn it) — drives the
   * multiclass owning-class derivation in step 3. Omit (or pass undefined) for a
   * custom/homebrew spell or when provenance can't be derived; the resolver then
   * falls back to the primary `spellcasting.ability` (today's behavior).
   */
  spellClasses?: ReadonlyArray<string>
): AbilityCode | null {
  if (ref.spellAbilityOverride) return ref.spellAbilityOverride;
  const feat = spellAbilityFeat(ref);
  const answered = feat ? featAbilityOf(character, feat) : null;
  if (answered) return answered;
  if (!("custom" in ref) && ref.speciesSpellAbility) {
    return character.speciesSpellAbility ?? unpickedSpeciesAbility(character);
  }
  const primary = character.spellcasting?.ability;
  if (primary == null) return null;
  // Prepared through one class (a multiclass Cleric/Bard's Cure Wounds): that
  // class's ability, when the character casts with it.
  if (!("custom" in ref) && ref.viaClass) {
    const via = casterClassAbilities(character).find((c) => c.classId === ref.viaClass);
    if (via) return via.ability;
  }
  return resolveSpellOwningAbility(spellClasses, character, primary);
}
