/**
 * The turn's movement, one rule for every surface: your Speed, once more for each
 * Dash, plus what a use added (Tactical Shift, Instinctive Pounce: "move up to half
 * your Speed"). Pure.
 */

/** Feet a "move up to `fraction` of your Speed" gives, in whole 5-foot squares. */
export function selfMoveFeet(fraction: number, speedFt: number): number {
  if (!(fraction > 0) || !(speedFt > 0)) return 0;
  return Math.floor((speedFt * fraction) / 5) * 5;
}

/** How far this turn lets you move, in feet. */
export function turnMovementBudgetFt(
  speedFt: number,
  turn: { dashesThisTurn: number; extraMovementFt?: number }
): number {
  return speedFt * (1 + turn.dashesThisTurn) + (turn.extraMovementFt ?? 0);
}
