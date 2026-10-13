/**
 * How a use is executed: whether it spends the turn's economy and stays turn-scoped,
 * and whether it is cast as a ritual (no slot, no source, no turn slot).
 */
import { getSpellById } from "@/data/spells";
import type { ResolvedAction } from "@/lib/smart-tracker";

export interface ActionExecution {
  consumesTurnEconomy: boolean;
  turnScoped: boolean;
  ritual: boolean;
  /** Cast without its components (Wish's duplicate): no material cost to offer. */
  withoutComponents?: true;
}

/** An ordinary turn action: it claims the turn's economy and is undone with the turn. */
export const TURN_EXECUTION: ActionExecution = {
  consumesTurnEconomy: true,
  turnScoped: true,
  ritual: false,
};

/**
 * The execution of a use. A ritual is allowed only for a levelled SRD ritual spell
 * (null otherwise). Spells, cast-pool uses and extended casts stand outside the
 * turn's economy; everything else is a turn action.
 */
export function executionFor(
  action: ResolvedAction,
  ritual: boolean
): ActionExecution | null {
  if (ritual) {
    const spell = action.spellId ? getSpellById(action.spellId) : undefined;
    if (action.source !== "spell" || !spell?.ritual || spell.level === 0) return null;
    return { consumesTurnEconomy: false, turnScoped: false, ritual: true };
  }
  if (
    action.source === "spell" ||
    action.castPoolSourceId ||
    action.castTiming === "extended"
  ) {
    return { consumesTurnEconomy: false, turnScoped: false, ritual: false };
  }
  return TURN_EXECUTION;
}

/** The ritual form of a spell: free, with every cost cleared. */
export function asRitualAction(action: ResolvedAction): ResolvedAction {
  return {
    ...action,
    type: "free",
    costsSlot: false,
    slotLevel: undefined,
    costTracker: undefined,
    trackerCost: undefined,
    costTrackerIsPool: undefined,
    costTrackerUnit: undefined,
    resourcePayment: undefined,
    resourceCost: undefined,
    costEquipment: undefined,
    alternateCost: undefined,
    castPoolSourceId: undefined,
  };
}
