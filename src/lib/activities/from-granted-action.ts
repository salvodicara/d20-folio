/**
 * `granted-action` grants (the Hunter's options, learned maneuvers, homebrew
 * actions a source lacks a `mechanics` block for) → Activity. One translator for
 * the catalogue grant and for one character's aggregated granted action.
 */
import type { GrantedAction } from "@/lib/grants";
import type { Grant } from "@/lib/grant-schema";
import { compact } from "./shared";
import type { Activity, ActivityRequires, ActivityTranslation } from "./types";

type GrantedActionGrant = Extract<Grant, { type: "granted-action" }>;

/** The facts a granted action declares, from the grant or its aggregate. */
type GrantedActionFacts = Pick<
  GrantedActionGrant,
  "id" | "slot" | "cost" | "saveAbility" | "reactionTrigger" | "maxUsesPerTurn"
>;

function activityOf(
  facts: GrantedActionFacts,
  sourceId: string,
  requires?: ActivityRequires
): Activity {
  const actionId = facts.id ?? facts.slot;
  return compact({
    id: `granted-action:${sourceId}:${actionId}`,
    source: { kind: "granted-action" as const, sourceId, actionId },
    cost: compact({
      economy: facts.slot,
      trigger: facts.reactionTrigger,
      maxUsesPerTurn: facts.maxUsesPerTurn,
      pay: facts.cost ? [compact({ ...facts.cost })] : undefined,
    }),
    requires,
    save: facts.saveAbility ? { ability: facts.saveAbility } : undefined,
    effects: [],
  });
}

/**
 * A declared granted action as an Activity: its slot, structured trigger, cap
 * per turn, tracker cost and forced save. `requires` carries the choice-bundle
 * option it sits under (Horde Breaker under Hunter's Prey). The effect stays
 * catalogue text.
 */
export function activityFromGrantedAction(
  grant: GrantedActionFacts,
  sourceId: string,
  requires?: ActivityRequires
): ActivityTranslation {
  return { activity: activityOf(grant, sourceId, requires), gaps: [] };
}

/** One character's aggregated granted actions (`grantedActions`) as Activities. */
export function grantedActionActivities(
  actions: ReadonlyArray<GrantedAction>
): Activity[] {
  return actions.map((action) => activityOf(action, action.sourceId));
}
