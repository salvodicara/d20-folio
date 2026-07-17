/**
 * Shared helpers for the feat-/feature-choice resolver modules
 * (skill / tool / language / skill-or-tool / expertise).
 *
 * Pure module — no React/store deps and intentionally dependency-free so
 * any of the five choice modules can import it without risking an import
 * cycle (e.g. the existing feat-tool → feat-skill-tool edge).
 */

/**
 * A choice slot is complete when every slot has exactly its required number
 * of picks. Shared by all five `is*PicksComplete` gates, which previously
 * duplicated this loop byte-for-byte.
 */
export function arePicksComplete(
  slots: ReadonlyArray<{ slotId: string; amount: number }>,
  picks: Readonly<Record<string, ReadonlyArray<string>>>
): boolean {
  for (const slot of slots) {
    if ((picks[slot.slotId] ?? []).length !== slot.amount) return false;
  }
  return true;
}
