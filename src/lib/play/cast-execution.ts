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

/** A use outside the turn's economy: logged, claims no turn slot, outlives End Turn. */
const UNTIMED_EXECUTION: ActionExecution = {
  consumesTurnEconomy: false,
  turnScoped: false,
  ritual: false,
};

/** What tells the sheet a fight is on. */
export interface EncounterFacts {
  /** The open character is in a campaign encounter (any phase). */
  sharedEncounter: boolean;
  /** The solo round counter (1 = no round has been advanced). */
  soloRound: number;
  /** The solo Initiative roll as typed ("" = not rolled). */
  soloInitiative: string;
}

/**
 * Whether a fight is on (owner decision 2026-10-16: actions work outside combat). A
 * campaign encounter always is; solo, the player starts one by rolling Initiative or
 * advancing a round, and End Combat (round 1, Initiative cleared) leaves it. With no
 * fight the turn economy only logs: no per-turn budget, nothing waits for End Turn,
 * like D&D Beyond and Foundry, which track turns only inside a combat.
 */
export function encounterRunning(facts: EncounterFacts): boolean {
  return (
    facts.sharedEncounter || facts.soloRound > 1 || facts.soloInitiative.trim() !== ""
  );
}

/** How the sheet plays right now: a fight (turns gate the economy) or exploration. */
export type PlayMode = "combat" | "exploration";

/** The one derivation the turn bar, the economy and the playbook share. */
export function playMode(facts: EncounterFacts): PlayMode {
  return encounterRunning(facts) ? "combat" : "exploration";
}

/**
 * A once-per-turn use (Sneak Attack, `recovery: "per-turn"`) is spent only inside a
 * fight; outside one there is no turn for it to wait on, so the use is only logged.
 */
export function spendsOncePerTurnUse(
  recovery: string | undefined,
  inEncounter: boolean
): boolean {
  return inEncounter || recovery !== "per-turn";
}

/**
 * The execution of a use. A ritual is allowed only for a levelled SRD ritual spell
 * (null otherwise). Spells, cast-pool uses and extended casts stand outside the
 * turn's economy, and so does every use made outside a fight (`inEncounter` false);
 * everything else is a turn action.
 */
export function executionFor(
  action: ResolvedAction,
  ritual: boolean,
  inEncounter = true
): ActionExecution | null {
  if (ritual) {
    const spell = action.spellId ? getSpellById(action.spellId) : undefined;
    if (action.source !== "spell" || !spell?.ritual || spell.level === 0) return null;
    return { consumesTurnEconomy: false, turnScoped: false, ritual: true };
  }
  if (
    !inEncounter ||
    action.source === "spell" ||
    action.castPoolSourceId ||
    action.castTiming === "extended"
  ) {
    return UNTIMED_EXECUTION;
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
