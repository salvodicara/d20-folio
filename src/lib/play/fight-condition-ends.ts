/**
 * Conditions given in a fight end early, or ask for a repeat save, when the fight
 * says so (edge-case family M3): Abjure Foes' Frightened ends when the target takes
 * damage; a repeat-save condition asks its target at the end of each of its turns.
 * The fight's condition effects carry their source; the catalogue entry that applied
 * the condition says how it ends (`conditionApplication.ends`). This module reads two
 * looks at the fight and answers which effects end and which saves are due, through
 * the one rule `conditionsEndingOn`.
 */
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import type { ConditionEnd } from "@/data/types";
import {
  conditionsEndingOn,
  type ConditionEvent,
  type DueRepeatSave,
  type SourcedCondition,
} from "@/lib/condition-ends";
import { foldCombatEffectOps, rowIsIncapacitated } from "@/lib/combat-effects";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";

/** How a condition from this source ends early, per its catalogue entry. */
export function conditionEndsOf(
  source: Pick<ActiveCombatEffect["source"], "kind" | "id">,
  conditionId: string
): ReadonlyArray<ConditionEnd> {
  const applies = (options: ReadonlyArray<string> | undefined) =>
    options?.includes(conditionId) ?? false;
  if (source.kind === "spell") {
    const application = getSpellById(source.id)?.conditionApplication;
    return application && applies(application.options) ? (application.ends ?? []) : [];
  }
  const action = classFeatureIndex
    .get(source.id)
    ?.mechanics?.actions?.find((a) => applies(a.conditionApplication?.options));
  return action?.conditionApplication?.ends ?? [];
}

/** The fight's condition effects that can end early or ask for a repeat save. */
export function sourcedFightConditions(
  effectOps: ReadonlyArray<CombatEffectOp> | undefined
): SourcedCondition[] {
  return foldCombatEffectOps(effectOps).flatMap((effect) => {
    if (effect.payload.kind !== "condition") return [];
    const ends = conditionEndsOf(effect.source, effect.payload.conditionId);
    if (ends.length === 0) return [];
    return [
      {
        id: effect.id,
        conditionId: effect.payload.conditionId,
        targetId: effect.target.combatantId,
        actorId: effect.actor.combatantId,
        ...(effect.bindings?.saveDc !== undefined
          ? { saveDc: effect.bindings.saveDc }
          : {}),
        ends,
      },
    ];
  });
}

/** One look at the fight: each combatant's vitals and conditions, and whose turn. */
export interface FightLook {
  rows: ReadonlyArray<{
    id: string;
    currentHp: number;
    tempHp: number;
    conditions: ReadonlyArray<string>;
  }>;
  currentCombatantId: string | null;
}

/** What happened between two looks: who took damage, who became Incapacitated,
 *  whose turn ended. */
export function fightConditionEvents(
  before: FightLook,
  after: FightLook
): ConditionEvent[] {
  const events: ConditionEvent[] = [];
  const prior = new Map(before.rows.map((row) => [row.id, row]));
  for (const row of after.rows) {
    const was = prior.get(row.id);
    if (!was) continue;
    if (row.currentHp + row.tempHp < was.currentHp + was.tempHp) {
      events.push({ kind: "damaged", targetId: row.id });
    }
    if (rowIsIncapacitated(row) && !rowIsIncapacitated(was)) {
      events.push({ kind: "incapacitated", combatantId: row.id });
    }
  }
  if (
    before.currentCombatantId !== null &&
    before.currentCombatantId !== after.currentCombatantId
  ) {
    events.push({ kind: "turn-end", combatantId: before.currentCombatantId });
  }
  return events;
}

/** The condition effects that end, and the repeat saves due, between two looks at
 *  the fight. The first look (`before` null) primes: a reload is not an event. */
export function fightConditionEnds(
  effectOps: ReadonlyArray<CombatEffectOp> | undefined,
  before: FightLook | null,
  after: FightLook
): { ended: string[]; saves: DueRepeatSave[] } {
  if (!before) return { ended: [], saves: [] };
  const conditions = sourcedFightConditions(effectOps);
  if (conditions.length === 0) return { ended: [], saves: [] };
  const ended = new Set<string>();
  const saves: DueRepeatSave[] = [];
  for (const event of fightConditionEvents(before, after)) {
    const result = conditionsEndingOn(
      conditions.filter((c) => !ended.has(c.id)),
      event
    );
    for (const id of result.ended) ended.add(id);
    saves.push(...result.saves);
  }
  return { ended: [...ended], saves: saves.filter((s) => !ended.has(s.id)) };
}
