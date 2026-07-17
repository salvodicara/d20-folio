/**
 * L10 — subclass-granted spellcasting (Eldritch Knight, Arcane Trickster).
 *
 * Some subclasses grant spellcasting even though the base class isn't a
 * caster. This module centralises the third-caster math so creation and
 * level-up stay in sync: given a class + subclass + character level it
 * returns the persisted spell-slot array, the casting ability, and the
 * prepared/cantrip maxima. Returns null when the subclass doesn't cast.
 *
 * Pure module — no React/store/Firebase deps. The slot progression
 * (shared by every "third"-fraction subclass) is taken from the
 * Eldritch Knight / Arcane Trickster tables on dnd2024.wikidot.com.
 */
import type { AbilityCode, ClassId, SubclassSpellcasting } from "@/data/types";
import type { CharacterData } from "@/types/character";
import { getClassTable } from "@/data/classes";

/**
 * Third-caster spell slots by character level → [L1, L2, L3, L4] counts.
 * Indexed by level (1-based via the lookup below); levels 1-2 have none
 * (the subclass is gained at level 3). Eldritch Knight / Arcane Trickster.
 */
const THIRD_CASTER_SLOTS: Readonly<Record<number, ReadonlyArray<number>>> = {
  3: [2],
  4: [3],
  5: [3],
  6: [3],
  7: [4, 2],
  8: [4, 2],
  9: [4, 2],
  10: [4, 3],
  11: [4, 3],
  12: [4, 3],
  13: [4, 3, 2],
  14: [4, 3, 2],
  15: [4, 3, 2],
  16: [4, 3, 3],
  17: [4, 3, 3],
  18: [4, 3, 3],
  19: [4, 3, 3, 1],
  20: [4, 3, 3, 1],
};

/**
 * Resolved spell-slot rows for a third-caster subclass at the given character
 * level. (Only the "third" fraction exists today — Eldritch Knight / Arcane
 * Trickster; widen this lookup when a half/full subclass-caster appears.)
 */
export function subclassSpellSlots(level: number): { level: number; total: number }[] {
  const row = THIRD_CASTER_SLOTS[Math.max(1, Math.min(20, level))] ?? [];
  return row.map((total, i) => ({ level: i + 1, total })).filter((s) => s.total > 0);
}

/** The subclass's spellcasting descriptor, or undefined if it doesn't cast. */
export function getSubclassSpellcasting(
  classId: string,
  subclassId: string | null | undefined
): SubclassSpellcasting | undefined {
  if (!subclassId) return undefined;
  const table = getClassTable(classId);
  return table?.subclasses.find((s) => s.id === subclassId)?.spellcasting;
}

/** Per-level entry of a `number[]` progression, clamped to the array bounds. */
function atLevel(progression: ReadonlyArray<number>, level: number): number {
  if (progression.length === 0) return 0;
  const idx = Math.max(1, Math.min(progression.length, level)) - 1;
  return progression[idx] ?? 0;
}

/**
 * The full resolved spellcasting state a subclass grants at a character
 * level, or null when the (class, subclass) doesn't grant spellcasting or
 * the level is below the subclass-spell threshold. The base class is assumed
 * NOT to be a caster (callers only use this when `classTable.spellcasting`
 * is absent), so there's no merge with class slots.
 */
export function subclassSpellcastingState(
  classId: string,
  subclassId: string | null | undefined,
  level: number
): {
  ability: AbilityCode;
  spellList: ClassId;
  schools?: string[];
  spellSlots: { level: number; total: number }[];
  preparedMax: number;
  cantripsMax: number;
  fixedCantrips: string[];
} | null {
  const sc = getSubclassSpellcasting(classId, subclassId);
  if (!sc) return null;
  const spellSlots = subclassSpellSlots(level);
  if (spellSlots.length === 0) return null; // below the casting threshold
  return {
    ability: sc.ability,
    spellList: sc.spellList,
    schools: sc.schools,
    spellSlots,
    preparedMax: atLevel(sc.preparedKnown, level),
    cantripsMax: atLevel(sc.cantripsKnown, level),
    fixedCantrips: sc.fixedCantrips ?? [],
  };
}

/**
 * Apply a third-caster subclass's spellcasting to a character at a level:
 * sets the persisted spell slots and (first time) the `spellcasting` block,
 * refreshing `preparedMax` each level. A no-op when the subclass doesn't cast
 * or the character is already a class caster (its `spellcasting` is preserved,
 * and a class caster never has a third-caster subclass anyway). Idempotent —
 * safe to call on every level-up and again when the subclass is first chosen.
 */
export function applySubclassSpellcasting(
  character: CharacterData,
  classId: string,
  subclassId: string | null | undefined,
  level: number
): CharacterData {
  const state = subclassSpellcastingState(classId, subclassId, level);
  if (!state) return character;
  const spellcasting = character.spellcasting
    ? { ...character.spellcasting, preparedMax: state.preparedMax }
    : {
        ability: state.ability,
        preparedCaster: true,
        preparedMax: state.preparedMax,
        saveDCOverride: null,
        attackBonusOverride: null,
      };
  // Always-known cantrips (Arcane Trickster's Mage Hand) — injected as
  // prepared + alwaysPrepared so they don't count against the cantrip budget.
  // Idempotent: skip any already on the character.
  const haveIds = new Set(
    character.spells.flatMap((s) => ("custom" in s ? [] : [s.srdId]))
  );
  const fixedRefs = state.fixedCantrips
    .filter((id) => !haveIds.has(id))
    .map((id) => ({ srdId: id, prepared: true, alwaysPrepared: true }));
  const spells =
    fixedRefs.length > 0 ? [...character.spells, ...fixedRefs] : character.spells;
  return { ...character, spellSlots: state.spellSlots, spellcasting, spells };
}
