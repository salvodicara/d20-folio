/**
 * Recovering expended spell slots (edge-case family M12). A recovery is a budget
 * and a ceiling: combined slot levels (Arcane Recovery: half the Wizard level) or a
 * number of slots (a spell's "up to two slots"), none above a slot level. Pure: the
 * player picks which slots; the commit restores them.
 */
import type { CatalogueEffect } from "@/lib/catalogue-effects";
import { amountAtCastLevel } from "@/lib/scalar";

/** What may be recovered: `totalLevels` OR `count`, none above `maxSlotLevel`. */
export interface SlotRecoveryRule {
  totalLevels?: number;
  count?: number;
  maxSlotLevel: number;
}

export interface SlotRecoveryPick {
  budget: { kind: "levels" | "slots"; cap: number; remaining: number };
  /** Each expended slot level within the ceiling, lowest first, with the pick so far
   *  and the most that still fits. */
  rows: { level: number; expended: number; count: number; max: number }[];
  /** The picks flattened (one 2nd + one 1st = [1, 2]). */
  slotLevels: number[];
}

/** The picker: which expended slots the rule can recover, and how many of each still
 *  fit the budget given the counts already picked. */
export function recoverableSlots(
  rule: SlotRecoveryRule,
  expended: ReadonlyArray<{ level: number; expended: number }>,
  counts: Readonly<Record<number, number>>
): SlotRecoveryPick {
  const byLevels = rule.count === undefined;
  const cap = rule.count ?? rule.totalLevels ?? 0;
  const eligible = expended
    .filter((e) => e.expended > 0 && e.level <= rule.maxSlotLevel)
    .sort((a, b) => a.level - b.level);
  const cost = (level: number) => (byLevels ? level : 1);
  const used = eligible.reduce(
    (sum, e) => sum + cost(e.level) * (counts[e.level] ?? 0),
    0
  );
  const remaining = cap - used;
  const rows = eligible.map((e) => {
    const count = counts[e.level] ?? 0;
    const fits = Math.floor(remaining / cost(e.level)) + count;
    return { ...e, count, max: Math.max(count, Math.min(e.expended, fits)) };
  });
  return {
    budget: { kind: byLevels ? "levels" : "slots", cap, remaining },
    rows,
    slotLevels: rows.flatMap((r) => Array.from({ length: r.count }, () => r.level)),
  };
}

/** Whether a chosen set of slot levels is within the rule. */
export function validSlotRecovery(
  rule: SlotRecoveryRule,
  slotLevels: ReadonlyArray<number>
): boolean {
  if (slotLevels.some((level) => level < 1 || level > rule.maxSlotLevel)) return false;
  if (rule.count !== undefined) return slotLevels.length <= rule.count;
  return slotLevels.reduce((a, b) => a + b, 0) <= (rule.totalLevels ?? 0);
}

/** A spell's `recover-slots` effect at the level it was cast: the ceiling read off
 *  the cast level, and `perUpcast` more of the budget per slot above the spell's. */
export function slotRecoveryRuleForCast(
  effect: Extract<CatalogueEffect, { kind: "recover-slots" }>,
  castLevel: number,
  spellLevel: number
): SlotRecoveryRule {
  const extra = Math.max(0, castLevel - spellLevel) * (effect.perUpcast ?? 0);
  const maxSlotLevel =
    effect.maxSlotLevel === undefined
      ? 9
      : amountAtCastLevel(effect.maxSlotLevel, castLevel);
  return effect.count !== undefined
    ? { count: effect.count + extra, maxSlotLevel }
    : { totalLevels: (effect.totalLevels ?? 0) + extra, maxSlotLevel };
}
