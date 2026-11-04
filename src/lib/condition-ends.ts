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
import type { AbilityCode, ConditionEnd, RepeatSaveMoment } from "@/data/types";

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

/** Something that happened at the table. `by` on damage: who dealt it, when every
 *  hit said so (absent: unknown). */
export type ConditionEvent =
  | { kind: "damaged"; targetId: string; by?: ReadonlyArray<string> }
  | { kind: "turn-start"; combatantId: string }
  | { kind: "turn-end"; combatantId: string }
  | { kind: "incapacitated"; combatantId: string };

/** A repeat save the target owes: success ends the condition. `at`: the moment that
 *  made it due; `advantage`: rolled with Advantage; `when`: owed only in that
 *  situation (the prompt asks it first), with the one who applied it. */
export interface DueRepeatSave {
  id: string;
  conditionId: string;
  targetId: string;
  ability: AbilityCode;
  dc?: number;
  at: RepeatSaveMoment;
  advantage?: true;
  when?: "out-of-actor-sight";
  actorId?: string;
}

/** Which side of the fight a combatant is on. */
export type SideOf = (combatantId: string) => string;

/** Whether this end ends the condition on this event. */
function endsOn(
  end: ConditionEnd,
  condition: SourcedCondition,
  event: ConditionEvent,
  sideOf: SideOf | undefined
): boolean {
  if (end.on === "actor-incapacitated") {
    return event.kind === "incapacitated" && event.combatantId === condition.actorId;
  }
  if (end.on !== "target-damaged") return false;
  if (event.kind !== "damaged" || event.targetId !== condition.targetId) return false;
  if (end.by !== "actor-side") return true;
  // Only the one who applied it, or that one's allies: every hit's attacker known.
  const actor = condition.actorId;
  if (!actor || !sideOf || !event.by || event.by.length === 0) return false;
  return event.by.some((id) => id === actor || sideOf(id) === sideOf(actor));
}

/** The moment this event is, for a repeat save. */
function momentOf(event: ConditionEvent, targetId: string): RepeatSaveMoment | null {
  if (event.kind === "turn-end" && event.combatantId === targetId) {
    return "target-turn-end";
  }
  if (event.kind === "turn-start" && event.combatantId === targetId) {
    return "target-turn-start";
  }
  if (event.kind === "damaged" && event.targetId === targetId) return "target-damaged";
  return null;
}

function dueSave(
  condition: SourcedCondition,
  end: ConditionEnd & { on: "repeat-save" }
): DueRepeatSave {
  return {
    id: condition.id,
    conditionId: condition.conditionId,
    targetId: condition.targetId,
    ability: end.ability,
    ...(condition.saveDc !== undefined ? { dc: condition.saveDc } : {}),
    at: end.at,
    ...(end.advantage ? { advantage: true as const } : {}),
    ...(end.when ? { when: end.when } : {}),
    ...(condition.actorId !== undefined ? { actorId: condition.actorId } : {}),
  };
}

/**
 * What an event ends, and which repeat saves it makes due (at most one per condition
 * occurrence). `sideOf` answers "the actor's allies" for an end that only damage from
 * that side triggers.
 */
export function conditionsEndingOn(
  conditions: ReadonlyArray<SourcedCondition>,
  event: ConditionEvent,
  sideOf?: SideOf
): { ended: string[]; saves: DueRepeatSave[] } {
  const ended: string[] = [];
  const saves: DueRepeatSave[] = [];
  for (const condition of conditions) {
    if (condition.ends.some((end) => endsOn(end, condition, event, sideOf))) {
      ended.push(condition.id);
      continue;
    }
    const moment = momentOf(event, condition.targetId);
    const end = condition.ends.find(
      (e): e is ConditionEnd & { on: "repeat-save" } =>
        e.on === "repeat-save" && e.at === moment
    );
    if (end) saves.push(dueSave(condition, end));
  }
  return { ended, saves };
}

/** The repeat saves a combatant may spend its action on now (Otto's Irresistible
 *  Dance): offered on demand, never prompted. */
export function actionRepeatSaves(
  conditions: ReadonlyArray<SourcedCondition>,
  combatantId: string
): DueRepeatSave[] {
  return conditions.flatMap((condition) => {
    if (condition.targetId !== combatantId) return [];
    const end = condition.ends.find(
      (e): e is ConditionEnd & { on: "repeat-save" } =>
        e.on === "repeat-save" && e.at === "target-action"
    );
    return end ? [dueSave(condition, end)] : [];
  });
}
