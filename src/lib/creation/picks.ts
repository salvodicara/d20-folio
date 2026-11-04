/**
 * Bounded multi-pick toggles — the pick rules the creation draft and the
 * level-up wizard share.
 *
 * Pure module — no React, no locale reads.
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

/**
 * The class-skill toggle: a skill the background already grants is LOCKED (a
 * no-op); a picked skill is removed; at the limit the OLDEST pick is replaced
 * (FIFO, matching the spell/feat pickers).
 */
export function toggleLockedPick(
  picks: ReadonlyArray<string>,
  id: string,
  limit: number,
  locked: ReadonlyArray<string>
): ReadonlyArray<string> {
  if (locked.includes(id)) return picks;
  if (picks.includes(id)) return picks.filter((s) => s !== id);
  if (picks.length >= limit) return [...picks.slice(1), id];
  return [...picks, id];
}
