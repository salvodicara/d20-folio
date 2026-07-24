/**
 * The 2024 multiclass spellcaster slot table (docs/ARCHITECTURE.md).
 *
 * RAW: a multiclassed spellcaster's shared spell slots are determined by a single
 * "spellcaster level", then looked up on the Multiclass Spellcaster slot table
 * (which is identical to the full-caster progression). The spellcaster level is the
 * sum of weighted caster levels (2024 PHB "Multiclassing → Spell Slots", verified
 * against dnd2024.wikidot.com/multiclassing):
 *   - FULL casters  (Bard, Cleric, Druid, Sorcerer, Wizard): + full class level
 *   - HALF casters  (Paladin, Ranger, Artificer):            + ceil(level / 2)
 *     ("Half your levels (ROUND UP)" — 2024 changed this from 2014's round-down,
 *     consistent with half-casters now casting from level 1.)
 *   - THIRD casters (Eldritch Knight Fighter,
 *                    Arcane Trickster Rogue subclasses):     + floor(level / 3)
 *   - Warlock (Pact Magic):                                  NOT included — Pact
 *     Magic slots are SEPARATE and stacked on afterward.
 *
 * The single-class case (one entry) reduces to the same numbers the class table
 * already carries, so no behavior changes for single-class characters — this module
 * only diverges when `classes[]` has more than one slot-contributing entry.
 *
 * Pure + Firebase-free; ids only (no display strings).
 */

import type { ClassEntry } from "@/types/character";
import { pactSlots } from "@/data/classes/warlock";
import { classTableIndex } from "@/data/classes";
import { subclassSpellSlots, getSubclassSpellcasting } from "@/lib/subclass-spellcasting";
import { slotUsageKey } from "@/lib/cast-options";

/** Caster weighting per class id (2024 RAW). Absent id = non-caster (0 contribution). */
type CasterFraction = "full" | "half" | "third" | "none";

const CLASS_CASTER_FRACTION: Readonly<Record<string, CasterFraction>> = {
  bard: "full",
  cleric: "full",
  druid: "full",
  sorcerer: "full",
  wizard: "full",
  paladin: "half",
  ranger: "half",
  artificer: "half",
  // Warlock is intentionally NOT "full"/"half" — Pact Magic is its own track.
  warlock: "none",
  fighter: "none", // base Fighter is non-casting; the EK subclass adds a THIRD fraction
  rogue: "none", // base Rogue is non-casting; the AT subclass adds a THIRD fraction
  barbarian: "none",
  monk: "none",
};

/** Subclass ids that grant THIRD-caster progression on an otherwise non-casting class. */
const THIRD_CASTER_SUBCLASSES: ReadonlySet<string> = new Set([
  "eldritch-knight",
  "arcane-trickster",
]);

/**
 * The Multiclass Spellcaster slot table — slots [1st…9th] by combined caster level
 * (index 0 = caster level 1). Identical to the 2024 full-caster progression.
 */
const MULTICLASS_SLOTS: ReadonlyArray<readonly number[]> = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** The weighted caster-level CONTRIBUTION of a single class entry (2024 RAW). */
export function casterLevelContribution(entry: ClassEntry): number {
  const fraction = CLASS_CASTER_FRACTION[entry.classId] ?? "none";
  const lvl = entry.level;
  switch (fraction) {
    case "full":
      return lvl;
    case "half":
      // 2024 RAW: half-casters (Paladin / Ranger / Artificer) contribute HALF
      // their levels ROUNDED UP — a 1st-level Paladin already casts and
      // contributes 1 caster level. (2014 rounded down; 2024 changed it.)
      return Math.ceil(lvl / 2);
    case "none":
    case "third":
      break;
  }
  // THIRD-caster subclass on a non-casting base class (Eldritch Knight / Arcane
  // Trickster) — floor(level/3).
  if (entry.subclassId && THIRD_CASTER_SUBCLASSES.has(entry.subclassId)) {
    return Math.floor(lvl / 3);
  }
  return 0;
}

/**
 * The combined multiclass spellcaster level (sum of weighted caster levels across
 * all entries, EXCLUDING Warlock Pact Magic). 0 ⇒ no shared slots.
 */
export function multiclassCasterLevel(classes: ClassEntry[]): number {
  return classes.reduce((sum, e) => sum + casterLevelContribution(e), 0);
}

/** The Warlock entry's level across the array (0 if none) — drives Pact Magic. */
function warlockLevel(classes: ClassEntry[]): number {
  return classes
    .filter((e) => e.classId === "warlock")
    .reduce((sum, e) => sum + e.level, 0);
}

export interface SpellSlotEntry {
  level: number;
  total: number;
  pactMagic?: boolean;
}

/**
 * The full spell-slot list for a (possibly multiclassed) character: the SHARED
 * slots from the multiclass table (by combined caster level) PLUS the Warlock's
 * Pact Magic slots stacked separately (RAW: Pact Magic and shared slots are
 * distinct pools). Single-class reduces to the class-table values exactly.
 */
export function computeMulticlassSpellSlots(classes: ClassEntry[]): SpellSlotEntry[] {
  const out: SpellSlotEntry[] = [];

  const casterLevel = multiclassCasterLevel(classes);
  if (casterLevel >= 1) {
    const row = MULTICLASS_SLOTS[Math.min(casterLevel, 20) - 1] ?? [];
    row.forEach((total, i) => {
      if (total > 0) out.push({ level: i + 1, total });
    });
  }

  // Warlock Pact Magic — separate pool, marked `pactMagic: true`.
  const wl = warlockLevel(classes);
  if (wl >= 1) {
    const pact = pactSlots(wl); // { slotLevel, slots }
    if (pact.slots > 0) {
      out.push({ level: pact.slotLevel, total: pact.slots, pactMagic: true });
    }
  }

  return out;
}

/**
 * The ONE spell-slot derivation seam for a `classes[]` build (single OR multi):
 *   - multiclass → {@link computeMulticlassSpellSlots} (shared table + Pact Magic);
 *   - single-class with base-table slots → the class table's own row, with the
 *     Warlock's slots marked `pactMagic: true` (the flag the Bio-tab reconcile
 *     used to drop — slots must derive identically everywhere);
 *   - single-class third-caster subclass (Eldritch Knight / Arcane Trickster) →
 *     the shared third-caster table at the entry's level;
 *   - anything else → `[]` (a genuine non-caster).
 *
 * Level-up, the Bio-tab reconcile, and the dev scenario builder all read THIS, so
 * a slot table can never disagree across surfaces (golden rule 6).
 */
export function deriveSpellSlots(classes: ClassEntry[]): SpellSlotEntry[] {
  if (classes.length > 1) return computeMulticlassSpellSlots(classes);
  const entry = classes[0];
  if (!entry) return [];
  const row = classTableIndex
    .get(entry.classId)
    ?.levels.find((l) => l.level === entry.level)?.spellSlots;
  if (row && row.some((t) => t > 0)) {
    const pact = entry.classId === "warlock";
    return row.flatMap((total, i) =>
      total > 0 ? [{ level: i + 1, total, ...(pact ? { pactMagic: true } : {}) }] : []
    );
  }
  // Third-caster subclass on a non-casting base class.
  if (getSubclassSpellcasting(entry.classId, entry.subclassId)) {
    return subclassSpellSlots(entry.level);
  }
  return [];
}

/**
 * RA-33 — apply the durable per-level max-count overrides onto a derived slot list.
 * Overrides are keyed by {@link slotUsageKey} (`"1"`..`"9"` shared, `"pact-N"`
 * Pact Magic), so a normal and a Pact row at the same level override independently.
 * Only levels the base list already carries are overridable (this never invents an
 * ungranted slot level); a non-finite or negative value is ignored (the sole guard
 * against a garbage map — this is the ONLY path from the override map to a derived
 * count), a non-integer is floored, and a `0` drops the row. Absent map = identity.
 */
export function applySlotMaxOverrides(
  base: SpellSlotEntry[],
  overrides: Readonly<Record<string, number>> | undefined
): SpellSlotEntry[] {
  if (!overrides) return base;
  return base
    .map((slot) => {
      const o = overrides[slotUsageKey(slot)];
      return typeof o === "number" && Number.isFinite(o) && o >= 0
        ? { ...slot, total: Math.floor(o) }
        : slot;
    })
    .filter((s) => s.total > 0);
}
