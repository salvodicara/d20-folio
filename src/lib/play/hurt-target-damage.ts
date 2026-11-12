/**
 * A spell whose die grows against a hurt target, a creature missing any of its Hit
 * Points (a cantrip that tolls for the wounded): the row carries the base formula
 * and the bigger one, scaled the same way, and the target's Hit Points pick one.
 * Pure; the app never rolls.
 */

/** The same dice with a different face: "3d8+3" with "d12" → "3d12+3". */
export function hurtDice(formula: string, face: string): string {
  return formula.replace(/^(\d+)d\d+/, `$1${face}`);
}

/** The formula that applies to this target: the bigger one when it is missing any
 *  Hit Points, the base one at full or when its Hit Points are unknown. */
export function damageForTarget(
  summary: { damage?: string; damageIfHurt?: string },
  target: { currentHp: number; maxHp: number } | undefined
): string | undefined {
  const hurt = target !== undefined && target.currentHp < target.maxHp;
  return hurt && summary.damageIfHurt ? summary.damageIfHurt : summary.damage;
}
