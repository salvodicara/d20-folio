/**
 * Every hero's initiative bonus, by combatant id: what the roll planner needs to place a
 * roll. Before turns begin every roll re-sorts the whole order from each rolled hero's
 * total, so the map must hold them all; a hero missing from it would sort without their
 * bonus. The fight screen builds it here, once, for the players' rolls and for the d20s
 * the DM types for them.
 */
export function partyBonuses(
  pcs: Readonly<Record<string, { initiativeBonus: number }>>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(pcs).map(([id, pc]) => [id, pc.initiativeBonus])
  );
}
