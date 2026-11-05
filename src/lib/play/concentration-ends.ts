/**
 * A state whose arrival ends its target's Concentration (the `ends-concentration`
 * grant: a spell whose failed save breaks it). The device that applies the state ends
 * it once, where it can: its own sheet's Concentration, another PC's through that
 * character's spends ledger, a monster's by revoking the effects the monster holds by
 * Concentration. Pure.
 */
import { concentrationEffectIdsOwnedBy } from "@/lib/combat-effects";
import { resolveCombatEffectGrants } from "@/lib/resolve-grant-sources";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
} from "@/types/combat-effect";

/** Whether this state ends the Concentration of the creature it lands on. */
export function effectEndsConcentration(effect: ActiveCombatEffect): boolean {
  return resolveCombatEffectGrants(effect).some(
    (grant) => grant.type === "ends-concentration"
  );
}

/** Whose Concentration the states a use writes end: mine (`selfId`), other PCs', and
 *  the effects monsters hold by Concentration in the fight (`operations`). */
export function concentrationBreaks(
  written: ReadonlyArray<ActiveCombatEffect>,
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  selfId: string
): { self: boolean; pcs: CombatantRef[]; monsterEffectIds: string[] } {
  let self = false;
  const pcs = new Map<string, CombatantRef>();
  const monsters = new Set<string>();
  for (const effect of written) {
    if (!effectEndsConcentration(effect)) continue;
    const { target } = effect;
    if (target.combatantId === selfId) self = true;
    else if (target.kind === "pc") pcs.set(target.combatantId, target);
    else monsters.add(target.combatantId);
  }
  return {
    self,
    pcs: [...pcs.values()],
    monsterEffectIds: [...monsters].flatMap((id) =>
      concentrationEffectIdsOwnedBy(operations, id)
    ),
  };
}
