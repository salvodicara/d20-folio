/**
 * Early ends of a condition (edge-case family M3), as one pure rule: given the
 * conditions on the table with where they came from, and something that happened,
 * which end now and which ask their target for a repeat save (the app never rolls;
 * the target's player or the DM enters the result).
 *
 * The ends come from the catalogue entry that applied the condition
 * (`CombatConditionApplication.ends`, a cunning-strike option's `ends`), so a new
 * source grows by data.
 */
import type { AbilityCode, ConditionEnd } from "@/data/types";

/** A condition occurrence with its source facts. */
export interface SourcedCondition {
  id: string;
  conditionId: string;
  targetId: string;
  /** Who applied it (the grappler, the rogue). */
  actorId?: string;
  /** The source's save DC, for a repeat save. */
  saveDc?: number;
  ends: ReadonlyArray<ConditionEnd>;
}

/** Something that happened at the table. */
export type ConditionEvent =
  | { kind: "damaged"; targetId: string }
  | { kind: "turn-end"; combatantId: string }
  | { kind: "incapacitated"; combatantId: string };

/** A repeat save the target owes: success ends the condition. */
export interface DueRepeatSave {
  id: string;
  conditionId: string;
  targetId: string;
  ability: AbilityCode;
  dc?: number;
}

export function conditionsEndingOn(
  conditions: ReadonlyArray<SourcedCondition>,
  event: ConditionEvent
): { ended: string[]; saves: DueRepeatSave[] } {
  const ended: string[] = [];
  const saves: DueRepeatSave[] = [];
  for (const condition of conditions) {
    for (const end of condition.ends) {
      if (
        (end.on === "target-damaged" &&
          event.kind === "damaged" &&
          event.targetId === condition.targetId) ||
        (end.on === "actor-incapacitated" &&
          event.kind === "incapacitated" &&
          event.combatantId === condition.actorId)
      ) {
        ended.push(condition.id);
        break;
      }
      if (
        end.on === "repeat-save" &&
        event.kind === "turn-end" &&
        event.combatantId === condition.targetId
      ) {
        saves.push({
          id: condition.id,
          conditionId: condition.conditionId,
          targetId: condition.targetId,
          ability: end.ability,
          ...(condition.saveDc !== undefined ? { dc: condition.saveDc } : {}),
        });
      }
    }
  }
  return { ended, saves };
}
