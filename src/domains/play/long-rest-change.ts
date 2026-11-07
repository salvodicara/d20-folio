/**
 * The Long Rest's «Cambia incantesimi preparati» step (owner, «Guida», 2026-11-05).
 * The RAW limit comes from each class's `longRestSpellChange`: «one» (Paladin, Ranger)
 * or «any» (Cleric, Druid, Wizard). A character with a «one» class and no «any» class
 * changes one spell; any «any» class lets it change what it wants. Only the step holds
 * the limit: the sheet allows changes at any time.
 */
import { classTables } from "@/data/classes";
import type { CharacterDoc } from "@/types/character";

export type LongRestChange = "one" | "any";

export function longRestChange(doc: CharacterDoc): LongRestChange | null {
  const rules = doc.character.classes.map(
    (c) => classTables.find((t) => t.id === c.classId)?.longRestSpellChange
  );
  if (rules.includes("any")) return "any";
  return rules.includes("one") ? "one" : null;
}

/**
 * Whether flipping spell `idx` keeps the step within its limit. «one» is one swap: at
 * most one spell out of the prepared set the step opened with and one spell in;
 * flipping a changed spell back is always allowed.
 */
export function canFlipInStep(
  rule: LongRestChange,
  start: ReadonlySet<number>,
  now: ReadonlySet<number>,
  idx: number
): boolean {
  if (rule === "any") return true;
  const out = [...start].filter((i) => !now.has(i));
  const added = [...now].filter((i) => !start.has(i));
  if (start.has(idx)) return !now.has(idx) || out.length === 0; // back in, or the one out
  return now.has(idx) || added.length === 0; // back out, or the one in
}
