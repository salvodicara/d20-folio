/**
 * Magical Discoveries (College of Lore, Bard 6): two spells from the Cleric, Druid
 * or Wizard list, always prepared (SRD 5.2.1: "You always have the chosen spells
 * prepared"). A pick made at level-up is stored `{ prepared, alwaysPrepared,
 * grantedBy: <the feature> }` (`applySpellChoicePicks`), so it sits outside the
 * Bard's prepared limit. Characters built before that mark existed hold their two
 * discoveries as ordinary prepared spells, taking two of the Bard's normal places.
 *
 * `unmarkedDiscoveries` finds them for the sheet's owed-choices banner; nothing is
 * rewritten until the player confirms, and `markDiscoveries` then writes the mark
 * on the spells chosen. A candidate is a spell on the sheet that only Magical
 * Discoveries can explain: on the Cleric, Druid or Wizard list, not on the Bard's
 * nor on another of the character's own classes' lists, not always prepared
 * already, and not picked through another source (`grantedBy`).
 *
 * «Whenever you gain a Bard level, you can replace one of the spells with another
 * spell that meets these requirements» (`discoverySwapAt`): a cantrip or a spell of
 * a level the Bard has slots for, from the lists the feature's own grant names. The
 * replacement is saved with `applyFeatSpellChange`, which keeps the mark and the
 * always-prepared flag.
 *
 * Pure module: character in, answer out.
 */
import { getClassFeatures } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import {
  pendingSpellChoicesForFeat,
  listAvailableForSlot,
} from "@/lib/feat-spell-choices";
import { preparedLevelledCount } from "@/lib/wizard-spellbook";
import type { CharacterData, CustomSpell, SrdSpellRef } from "@/types/character";

export const DISCOVERIES_FEATURE_ID = "bard-lore-additional-magical-secrets";
const SUBCLASS = "college-of-lore";
const PICKS = 2;
const LISTS: readonly string[] = ["cleric", "druid", "wizard"];

type DiscoveryBuild = Pick<CharacterData, "classes" | "spells">;

export interface UnmarkedDiscoveries {
  /** The spells on the sheet that can be the discoveries, in sheet order. */
  candidates: string[];
  /** How many discoveries still lack the mark (1 or 2). */
  missing: number;
}

const FEATURE_LEVEL =
  getClassFeatures("bard").find((f) => f.id === DISCOVERIES_FEATURE_ID)?.level ?? 6;

function isCandidate(ref: SrdSpellRef, otherClasses: ReadonlySet<string>): boolean {
  if (ref.alwaysPrepared || ref.grantedBy) return false;
  if (ref.viaClass && ref.viaClass !== "bard") return false;
  return offList(ref, otherClasses);
}

/** On the Cleric, Druid or Wizard list, and on neither the Bard's nor another of
 *  the character's own classes' lists. */
function offList(ref: SrdSpellRef, otherClasses: ReadonlySet<string>): boolean {
  const lists = getSpellById(ref.srdId)?.classes ?? [];
  return (
    lists.some((list) => LISTS.includes(list)) &&
    !lists.includes("bard") &&
    !lists.some((list) => otherClasses.has(list))
  );
}

function otherClassIds(character: DiscoveryBuild): Set<string> {
  return new Set(
    character.classes.flatMap((c) => (c.classId === "bard" ? [] : [c.classId]))
  );
}

/** The Magical Discoveries a Lore Bard holds without the mark, or null when none are owed. */
export function unmarkedDiscoveries(
  character: DiscoveryBuild
): UnmarkedDiscoveries | null {
  const lore = character.classes.some(
    (c) => c.classId === "bard" && c.subclassId === SUBCLASS && c.level >= FEATURE_LEVEL
  );
  if (!lore) return null;
  const refs = character.spells.filter((s): s is SrdSpellRef => !("custom" in s));
  const otherClasses = otherClassIds(character);
  // A pick made: marked by the feature, or (stored before the source was recorded)
  // an off-list spell already always prepared that no other source explains.
  const made = refs.filter(
    (s) =>
      s.grantedBy === DISCOVERIES_FEATURE_ID ||
      (s.alwaysPrepared === true &&
        !s.grantedBy &&
        offList(s, otherClasses) &&
        (!s.viaClass || s.viaClass === "bard"))
  ).length;
  const missing = PICKS - made;
  if (missing <= 0) return null;
  const candidates = [
    ...new Set(refs.filter((s) => isCandidate(s, otherClasses)).map((s) => s.srdId)),
  ];
  return candidates.length > 0 ? { candidates, missing } : null;
}

/**
 * The character with `spellIds` marked as its Magical Discoveries (always prepared,
 * granted by the feature). Only candidates are marked, at most as many as are
 * missing; the same character comes back when nothing is marked.
 */
export function markDiscoveries<C extends DiscoveryBuild>(
  character: C,
  spellIds: readonly string[]
): C {
  const owed = unmarkedDiscoveries(character);
  if (!owed) return character;
  const chosen = new Set(
    spellIds.filter((id) => owed.candidates.includes(id)).slice(0, owed.missing)
  );
  if (chosen.size === 0) return character;
  const otherClasses = otherClassIds(character);
  const spells = character.spells.map((s) => {
    if ("custom" in s || !chosen.has(s.srdId) || !isCandidate(s, otherClasses)) return s;
    chosen.delete(s.srdId);
    return {
      ...s,
      prepared: true,
      alwaysPrepared: true,
      grantedBy: DISCOVERIES_FEATURE_ID,
    };
  });
  return { ...character, spells };
}

/** How many of the Bard's normal prepared places marking `spellIds` frees (a cantrip
 *  or an unprepared spell frees none). */
export function discoveryPlacesFreed(
  character: DiscoveryBuild,
  spellIds: readonly string[]
): number {
  return (
    preparedLevelledCount(character) -
    preparedLevelledCount(markDiscoveries(character, spellIds))
  );
}

export interface DiscoverySwap {
  /** The feature's picks on the sheet, any of which may be replaced. */
  picks: SrdSpellRef[];
  /** What a pick may become: the grant's lists, a cantrip or a castable level,
   *  never a spell already on the sheet. */
  pool: string[];
}

/** The swap a Bard reaching `newBardLevel` may make, or null when none is offered. */
export function discoverySwapAt(
  spells: ReadonlyArray<SrdSpellRef | CustomSpell>,
  subclassId: string,
  newBardLevel: number,
  slotRows: Record<string, ReadonlyArray<number>>
): DiscoverySwap | null {
  const feature = getClassFeatures("bard").find((f) => f.id === DISCOVERIES_FEATURE_ID);
  if (!feature?.subclass || feature.subclass !== subclassId.toLowerCase()) return null;
  // «Whenever you gain a Bard level» after the one that granted the picks.
  if (newBardLevel <= feature.level) return null;
  const picks = spells.filter(
    (s): s is SrdSpellRef => !("custom" in s) && s.grantedBy === DISCOVERIES_FEATURE_ID
  );
  const slot = pendingSpellChoicesForFeat(feature, { spellSlotsByClass: slotRows }).find(
    (s) => s.kind === "spell"
  );
  if (picks.length === 0 || !slot) return null;
  const known = new Set(spells.flatMap((s) => ("custom" in s ? [] : [s.srdId])));
  return { picks, pool: listAvailableForSlot(slot, known).map((s) => s.id) };
}
