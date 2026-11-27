/**
 * The Alert feat's Initiative Swap (SRD 5.2.1): right after rolling Initiative, the hero
 * may swap theirs with one willing ally in the same combat; the ally can't be
 * Incapacitated. On the new fight screen the DM performs it from the hero's line, as on
 * the classic screen. Here: who the hero may swap with.
 */
import { INCAPACITATING_CONDITIONS } from "@/lib/combat-test-context";

interface SwapRow {
  id: string;
  kind: "pc" | "monster";
  side?: "ally" | "enemy";
  initiative: number | null;
  conditions: readonly string[];
}

const INCAPACITATING: ReadonlySet<string> = new Set(INCAPACITATING_CONDITIONS);

/** The willing allies, in order: rolled, on the heroes' side, not Incapacitated. */
export function alertSwapAllies(rows: readonly SwapRow[], sourceId: string): string[] {
  return rows
    .filter(
      (r) =>
        r.id !== sourceId &&
        (r.kind === "pc" || r.side === "ally") &&
        r.initiative !== null &&
        !r.conditions.some((c) => INCAPACITATING.has(c))
    )
    .map((r) => r.id);
}

/** The lines' numbers after the swaps: each swapped pair shows the other's Initiative
 *  (the rule swaps the values; the order already trades their places). */
export function withSwappedInitiatives<
  T extends { id: string; initiative: number | null },
>(
  rows: readonly T[],
  swaps: ReadonlyArray<{ sourceId: string; targetId: string }> | undefined
): readonly T[] {
  if (!swaps?.length) return rows;
  const byId = new Map(rows.map((r) => [r.id, r.initiative]));
  const shown = new Map<string, number | null>();
  for (const { sourceId, targetId } of swaps) {
    if (!byId.has(sourceId) || !byId.has(targetId)) continue;
    shown.set(sourceId, byId.get(targetId) ?? null);
    shown.set(targetId, byId.get(sourceId) ?? null);
  }
  return rows.map((r) =>
    shown.has(r.id) ? { ...r, initiative: shown.get(r.id) ?? null } : r
  );
}
