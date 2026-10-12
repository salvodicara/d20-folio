/**
 * How many creatures one summon cast fields, and how each one is keyed in the
 * session. Pure — no catalogue reads.
 */
import type { SummonCount } from "@/data/types";

/** The most creatures one group tracks (a guard against a runaway stepper). */
export const MAX_SUMMONED = 20;

/**
 * The creatures one cast makes at `castLevel` (see {@link SummonCount}). Never
 * below 1, never above {@link MAX_SUMMONED}.
 */
export function summonCount(
  count: SummonCount | undefined,
  baseLevel: number,
  castLevel: number,
  spellMod: number
): number {
  let n = 1;
  if (count?.byLevel) {
    const levels = Object.keys(count.byLevel)
      .map(Number)
      .sort((a, b) => a - b);
    const at = levels.filter((l) => l <= castLevel).pop() ?? levels[0];
    n = at !== undefined ? (count.byLevel[at] ?? 1) : 1;
  } else if (count?.spellModPer) {
    n = Math.floor(spellMod / count.spellModPer);
  } else if (count) {
    n = (count.base ?? 1) + (count.perLevel ?? 0) * Math.max(0, castLevel - baseLevel);
  }
  return Math.min(MAX_SUMMONED, Math.max(1, n));
}

/** The session key of creature `n` (1-based) of a group: `"animate-dead#2"`. */
export function summonInstanceKey(groupId: string, n: number): string {
  return `${groupId}#${n}`;
}

/** `true` for a key {@link summonInstanceKey} made for `groupId`. */
export function isSummonInstanceOf(key: string, groupId: string): boolean {
  return key.startsWith(`${groupId}#`);
}

/** The instance number of a group key, or null for any other key. */
export function summonInstanceNumber(key: string, groupId: string): number | null {
  if (!isSummonInstanceOf(key, groupId)) return null;
  const n = Number(key.slice(groupId.length + 1));
  return Number.isInteger(n) && n >= 1 ? n : null;
}
