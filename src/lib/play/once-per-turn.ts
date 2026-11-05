/**
 * A feature usable once per turn that the sheet offers in more than one place (Hand
 * of Harm: the Unarmed Strike's rider and its own card). One use claims the turn
 * for the feature: a rider records `once:<feature>` in the turn's free slot, a card
 * records its own id (which starts with the feature's id); either blocks the other,
 * and a second rider tap, until the turn ends. Pure.
 */
import type { LocText } from "@/lib/loc-text";

/** The turn entry a once-per-turn rider records for its feature. */
export const oncePerTurnEntry = (featureKey: string): string => `once:${featureKey}`;

/** The feature behind a rider, from its source's name reference. */
export function riderFeatureKey(source: LocText): string | undefined {
  return "srd" in source ? source.srd.key : undefined;
}

/** Whether the turn already holds a use of the feature: its rider's entry or any
 *  of its own actions. */
export function featureUsedThisTurn(
  turnIds: ReadonlyArray<string>,
  featureKey: string
): boolean {
  return turnIds.some(
    (id) => id === oncePerTurnEntry(featureKey) || id.startsWith(featureKey)
  );
}

/** The feature whose rider already claimed this turn, for an action of it. */
export function riderClaimedTurnFor(
  turnIds: ReadonlyArray<string>,
  actionId: string
): boolean {
  return turnIds.some(
    (id) => id.startsWith("once:") && actionId.startsWith(id.slice("once:".length))
  );
}
