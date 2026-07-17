/**
 * Combat-castability gate (D&D 2024) — pure, testable.
 *
 * A spell only belongs in the combat action panel when the character can
 * actually cast it on their turn. Per the 2024 Spellcasting rules — identical
 * wording across the Cleric / Wizard / Bard / Sorcerer features:
 *
 *   "Prepared Spells of Level 1+. You prepare the list of level 1+ spells that
 *    are available for you to cast with this feature."
 *
 * So for a *prepared caster*, an unprepared level-1+ spell is NOT castable and
 * must not appear among combat actions.
 *
 * Always castable regardless of the prepared list:
 *   • Cantrips (level 0) — known via the separate Cantrips feature, never
 *     "prepared"; always available.
 *   • Always-prepared spells (Domain / Oath / Circle / subclass grants and
 *     Magic-Initiate-style feats — flagged `alwaysPrepared`) — RAW: "you always
 *     have [them] prepared." They don't count against the prepared budget but
 *     are always castable.
 *   • Wizard L18 Spell Mastery picks (`wizardSpellMastery`) — RAW: "You always
 *     have those spells prepared, and you can cast them at will."
 *   • Wizard L20 Signature Spells (`wizardSignatureSpell`, also `alwaysPrepared`)
 *     — always prepared, castable without a slot.
 *   • Free-castable spells (`hasFreeCast` — Fey-Touched / Shadow-Touched /
 *     free-cast heritage feats, etc.) — castable via a feature tracker without a
 *     slot, independent of the prepared list.
 *   • Every spell of a non-prepared ("known"-style) caster — their list *is*
 *     exactly the spells they chose, so there is no subset to filter.
 *
 * Ritual-only casting of an unprepared ritual (Wizard Ritual Adept) takes 10
 * minutes, so it is never a combat action and does not widen this gate.
 */
export interface SpellCombatCastability {
  /** Spell level (0 = cantrip). */
  level: number;
  /**
   * True when the class prepares a subset of a larger accessible pool
   * (Cleric / Druid / Paladin / Wizard …). False for "known"-style casters,
   * whose whole list is castable.
   */
  preparedCaster: boolean;
  /** The ref's `prepared` flag. */
  prepared?: boolean;
  /** Always-prepared grant (subclass / Domain / Oath / Circle / Magic Initiate). */
  alwaysPrepared?: boolean;
  /** Wizard L18 Spell Mastery pick — always prepared, at-will. */
  wizardSpellMastery?: boolean;
  /** Wizard L20 Signature Spell pick — always prepared. */
  wizardSignatureSpell?: boolean;
  /** Free-castable via a feature tracker (Fey-Touched and kin …). */
  hasFreeCast?: boolean;
}

export function isSpellCombatCastable(s: SpellCombatCastability): boolean {
  if (s.level <= 0) return true; // cantrip — always castable
  if (!s.preparedCaster) return true; // known-style caster — whole list castable
  return (
    s.prepared === true ||
    s.alwaysPrepared === true ||
    s.wizardSpellMastery === true ||
    s.wizardSignatureSpell === true ||
    s.hasFreeCast === true
  );
}
