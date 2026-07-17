/**
 * Wizard pick utilities — pure helpers shared by the wizard orchestrators.
 */

/** Bounded multi-pick toggle (FIFO auto-replace past the limit — the same rule
 *  as the production OptionGrid). */
export function togglePick(
  picks: ReadonlyArray<string>,
  id: string,
  limit: number
): string[] {
  if (picks.includes(id)) return picks.filter((p) => p !== id);
  const next = [...picks, id];
  while (next.length > limit) next.shift();
  return next;
}
