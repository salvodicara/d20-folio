/**
 * What a failed repeat save does to its target (edge-case M3): each failure applies
 * the condition's `onFailedRepeatSave` (Vision of Elapsing Eons: 1 Exhaustion level).
 * The levels add to the level the sheet shows (sources' included), within the table's
 * maximum; an immune creature gains none. Pure: the caller writes the level.
 */
import { failedSaveExhaustion, type DueRepeatSave } from "@/lib/condition-ends";
import { effectiveExhaustion } from "@/lib/play/exhaustion";
import { setExhaustion } from "@/lib/play/vitals";
import type { CharacterDoc } from "@/types/character";

/** The failure's Exhaustion: the levels it gives and the level the sheet then shows;
 *  null when it changes nothing (none to give, at the maximum, or immune). */
export function failedRepeatSaveEffects(
  doc: CharacterDoc,
  save: Pick<DueRepeatSave, "onFail">
): { levels: number; exhaustion: number } | null {
  const levels = failedSaveExhaustion(save);
  if (levels === 0) return null;
  const max = doc.session.tableRules?.exhaustion.maxLevel ?? 6;
  const exhaustion = Math.min(max, effectiveExhaustion(doc.session) + levels);
  return setExhaustion(doc, exhaustion) ? { levels, exhaustion } : null;
}
