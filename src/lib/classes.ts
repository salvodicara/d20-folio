/**
 * Multiclass `classes[]` helpers — the single derivation seam over the R4 model.
 *
 * The 2024 multiclass model (docs/ARCHITECTURE.md): a character is an ARRAY of
 * {@link ClassEntry} (single-class = exactly one entry). `classes[]` is the SOLE
 * source of truth — there is NO legacy `class`/`subclass`/`classId`/`subclassId`/
 * `level` projection on `CharacterData` (owner directive 2026-06-09: a superseded
 * field is removed COMPLETELY — one sole source of truth, no dead legacy mirrors).
 * Every consumer DERIVES what it needs off the array through these pure helpers:
 *   - `getClasses(character)` — the normalized, non-empty entry array.
 *   - `totalLevel(character)` — `sum(classes[].level)` (the DERIVED total; PB reads it).
 *   - `primaryClassEntry(character)` — the headline class (highest-level, ties → first).
 *   - `classEntryLevel(character, classId)` — a single class's level (0 if absent).
 *
 * Display names are DERIVED from the ids at render (golden rule 7: store the id,
 * derive the label) — SRD-free via `classNameById`/`subclassNameById` here, and
 * localized via `localizeClassName`/`localizeSubclassName` in the views.
 *
 * `getClasses` normalizes the array (validates ids/levels, clones entries) and
 * guarantees a non-empty result: a wholly-malformed / empty array falls back to a
 * single empty-id default entry so every consumer can read
 * `primaryClassEntry`/`totalLevel` safely.
 *
 * Pure + Firebase-free (composes only `srd-names`) so persistence and CI can both
 * use it.
 */

import type { ClassEntry } from "@/types/character";
import { classNameById, subclassNameById } from "@/data/srd-names";

/** The shape `getClasses` reads. `classes[]` is the SOLE source of truth. */
type ClassBearer = {
  classes?: ClassEntry[];
};

/** The empty default entry returned when a doc carries no well-formed class. */
const EMPTY_ENTRY: ClassEntry = { classId: "", level: 1 };

/**
 * The normalized, non-empty {@link ClassEntry} array for a character. `classes[]`
 * is the source of truth; each entry is validated + cloned. A wholly-malformed or
 * empty array yields a single empty-id default entry, so the result is ALWAYS
 * length ≥ 1 and every consumer can read `primaryClassEntry`/`totalLevel` safely.
 */
export function getClasses(character: ClassBearer): ClassEntry[] {
  const arr = character.classes;
  if (Array.isArray(arr) && arr.length > 0) {
    const valid = arr.map(normalizeEntry).filter((e) => e.level >= 1 && e.classId !== "");
    if (valid.length > 0) return valid;
  }
  return [{ ...EMPTY_ENTRY }];
}

const ENTRY_PICK_KEYS = [
  "weaponMasteries",
  "metamagicChoices",
  "invocationChoices",
  "maneuverChoices",
  "fightingStyles",
] as const;

function normalizeEntry(e: ClassEntry): ClassEntry {
  const out: ClassEntry = {
    classId: typeof e.classId === "string" ? e.classId : "",
    level:
      typeof e.level === "number" && Number.isFinite(e.level)
        ? Math.min(20, Math.max(1, Math.floor(e.level)))
        : 1,
  };
  if (e.subclassId) out.subclassId = e.subclassId;
  for (const key of ENTRY_PICK_KEYS) {
    const v = e[key];
    if (Array.isArray(v) && v.length > 0) out[key] = v;
  }
  return out;
}

/** `sum(classes[].level)` — the DERIVED total character level (never stored). */
export function totalLevel(character: ClassBearer): number {
  return getClasses(character).reduce((sum, e) => sum + e.level, 0);
}

/**
 * The PRIMARY class entry — the headline class for single-value display + the
 * single-class engine paths. The 2024 model has no formal "primary"; we pick the
 * HIGHEST-LEVEL entry (ties → the FIRST in the array, the class the character
 * started in). Stable + deterministic.
 */
export function primaryClassEntry(character: ClassBearer): ClassEntry {
  const classes = getClasses(character);
  return classes.reduce((best, e) => (e.level > best.level ? e : best));
}

/** True when the character has more than one class. */
export function isMulticlass(character: ClassBearer): boolean {
  return getClasses(character).length > 1;
}

/** The PRIMARY class's stable id — the headline class for single-value consumers. */
export function primaryClassId(character: ClassBearer): string {
  return primaryClassEntry(character).classId;
}

/** The PRIMARY subclass's stable id, or "" when the primary class has no subclass. */
export function primarySubclassId(character: ClassBearer): string {
  return primaryClassEntry(character).subclassId ?? "";
}

/**
 * The PRIMARY class's EN DISPLAY name, derived from its id (single source of truth —
 * store by id, derive the label). "" for an unknown/homebrew id. Localized display
 * goes through `localizeClassName` in the views; this is the SRD-free EN label the
 * roster reads.
 */
export function primaryClassName(character: ClassBearer): string {
  return classNameById(primaryClassId(character));
}

/** The PRIMARY subclass's EN display name, derived from its id ("" when none). */
export function primarySubclassName(character: ClassBearer): string {
  return subclassNameById(primarySubclassId(character));
}

/**
 * The level the character has IN a given class id (0 when the character doesn't
 * have that class). Used to resolve a class-feature's owning-class level so
 * features/riders/scaling resolve at THAT class's level, not the total — RAW for
 * a multiclass character, identical to the total for a single-class one.
 */
export function classEntryLevel(character: ClassBearer, classId: string): number {
  if (!classId) return 0;
  return getClasses(character)
    .filter((e) => e.classId === classId)
    .reduce((sum, e) => sum + e.level, 0);
}

/**
 * Every pick of a given kind across ALL class entries (deduped, order-stable). The
 * grant engine reads invocations/maneuvers/weapon-masteries off the character; with
 * picks living per-entry, this flattens them so a multiclass Warlock/Fighter still
 * surfaces both classes' picks. Single-class = that one entry's picks.
 */
export function allEntryPicks(
  character: ClassBearer,
  key: (typeof ENTRY_PICK_KEYS)[number]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of getClasses(character)) {
    for (const id of e[key] ?? []) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}
