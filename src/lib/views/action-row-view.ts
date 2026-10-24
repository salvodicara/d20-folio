/**
 * The Play actions table's row facts: each action's group (the table's Actions / Bonus
 * / Reactions / Other filters), whether it can be cast as a ritual, and whether it is
 * available now or blocked, and why. One pure seam over the rules the Play cards use:
 * `executionFor` decides the ritual, and the depletion and condition gates decide
 * availability (`isActionDepleted` is the Play tab's former inline rule, unchanged).
 */
import type { ActionType } from "@/data/types";
import type { GatedSlot } from "@/lib/condition-effects";
import { executionFor } from "@/lib/play/cast-execution";
import { rollsToHit } from "@/lib/play/damage-tray";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { CombatAction } from "./combat-action-view";
import type { CharacterDoc } from "@/types/character";
import { resolveSpellCastOptions } from "./spell-cast-sources";

export type ActionGroup = "actions" | "bonus" | "reactions" | "other";

export type ActionAvailability =
  | { kind: "available" }
  | { kind: "blocked"; reason: "no-uses" | "condition" };

export interface ActionRowFacts {
  group: ActionGroup;
  /** It can be cast as a ritual (a levelled SRD ritual spell). */
  ritual: boolean;
  availability: ActionAvailability;
  /** The save DC the action forces, with its display lines (see `CombatAction`). */
  saveDc: CombatAction["saveDc"];
  /** It rolls to hit (a weapon, an attack-roll spell): the "Attacchi" filter. */
  attack: boolean;
  /** Its use is limited: counted uses, a resource pool or a spell slot to pay. */
  limitedUse: boolean;
}

/** How many rows each filter chip of the actions table shows. */
export interface ActionFilterCounts {
  all: number;
  attacks: number;
  actions: number;
  bonus: number;
  reactions: number;
  other: number;
  limited: number;
}

/** Count the rows under each filter chip. */
export function actionFilterCounts(
  rows: ReadonlyArray<ActionRowFacts>
): ActionFilterCounts {
  const count = (keep: (row: ActionRowFacts) => boolean) => rows.filter(keep).length;
  return {
    all: rows.length,
    attacks: count((row) => row.attack),
    actions: count((row) => row.group === "actions"),
    bonus: count((row) => row.group === "bonus"),
    reactions: count((row) => row.group === "reactions"),
    other: count((row) => row.group === "other"),
    limited: count((row) => row.limitedUse),
  };
}

const GROUP: Record<ActionType, ActionGroup> = {
  action: "actions",
  bonus: "bonus",
  reaction: "reactions",
  free: "other",
};

export function actionGroup(type: ActionType): ActionGroup {
  return GROUP[type];
}

/**
 * Nothing left to pay for the action. A tracked use is out when its count is 0; a spell
 * that costs a slot is out only when NO cast route remains (a free cast, an at-will
 * source or an item's charges still count), the same seam the cast picker reads.
 * Cantrips and uncounted actions never run out.
 */
export function isActionDepleted(
  character: CharacterDoc,
  action: ResolvedAction
): boolean {
  if (action.summary.uses != null) return action.summary.uses.current <= 0;
  if (action.costsSlot && action.slotLevel != null && action.spellId) {
    // The badge labels only name the options; depletion reads whether any remains.
    const routes = resolveSpellCastOptions(
      character,
      action.spellId,
      action.slotLevel,
      true,
      "en",
      {
        mastery: "",
        signature: "",
      }
    );
    return routes.length === 0;
  }
  return false;
}

export function actionRowFacts(
  character: CharacterDoc,
  action: CombatAction,
  blockedSlots: ReadonlySet<GatedSlot>
): ActionRowFacts {
  const depleted = isActionDepleted(character, action);
  // A free action is never condition-blocked (it has no gated slot).
  const conditionBlocked = action.type !== "free" && blockedSlots.has(action.type);
  return {
    group: actionGroup(action.type),
    ritual: executionFor(action, true)?.ritual === true,
    availability: depleted
      ? { kind: "blocked", reason: "no-uses" }
      : conditionBlocked
        ? { kind: "blocked", reason: "condition" }
        : { kind: "available" },
    saveDc: action.saveDc,
    attack: rollsToHit(action),
    limitedUse:
      action.summary.uses != null ||
      action.costTracker !== undefined ||
      action.resourcePayment !== undefined ||
      action.costsSlot,
  };
}
