/**
 * The free object interaction (SRD 5.2.1 "Interacting with Things"): one object a
 * turn is free during your move or action; another one in the same turn takes the
 * Utilize action. The free use rides the turn's free economy slot (once per turn
 * by construction); this answers what a further use would cost.
 */

/**
 * The action a further use of `action` takes this turn, or null while its free
 * use is still open (or it has no such rule).
 */
export function repeatUseCost(
  action: { repeatUseCosts?: string },
  usedThisTurn: boolean
): string | null {
  return usedThisTurn ? (action.repeatUseCosts ?? null) : null;
}
