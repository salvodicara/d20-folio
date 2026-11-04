/**
 * Conditions with a source (edge-case family M3). Frightened imposes its roll
 * penalties only while its source is in sight. Each source-gated condition the
 * character has is an instance: from an encounter effect (its source is the effect's
 * actor) or from a chip (its source when the chip names one). For each instance the
 * sheet derives "can you see the source?" with {@link canSee}; when it can't decide,
 * the table's stored answer for that instance does, and when there is none the
 * condition applies in full.
 *
 * The one entry point for a sheet's condition effects is
 * {@link sheetConditionEffects}: every caller goes through it, so no caller forgets
 * the facts (a guard test holds the line).
 */
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  CONDITION_GATES,
  resolveConditionEffects,
  type ConditionFacts,
  type ResolvedConditionEffects,
} from "@/lib/condition-effects";
import { canSee, litLightLevel, type SightContext } from "@/lib/light-states";
import type { ConditionId } from "@/types/condition";
import type { CharacterDoc, SessionState } from "@/types/character";

/** What the sheet knows of the fight: each combatant's conditions (an Invisible
 *  source). Absent outside a fight, or where the caller has no encounter. */
export interface ConditionEncounter {
  rows: ReadonlyArray<{ id: string; conditions: ReadonlyArray<string> }>;
}

/** One source-gated condition the character has. */
export interface ConditionSourceInstance {
  /** Where the table's answer is stored: `effect:<id>` or `condition:<id>`. */
  key: string;
  conditionId: string;
  /** The combatant that caused it, when known. */
  sourceId?: string;
  /** Whether the character sees the source: derived, else the table's answer;
   *  undefined when neither says. */
  seesSource?: boolean;
  /** The sheet derived `seesSource` itself; no answer is needed. */
  derived: boolean;
}

/** A sheet: the build and as much of the session as the facts read. */
export interface ConditionDoc {
  character: CharacterDoc["character"];
  session: Parameters<typeof aggregateCharacterGrants>[1] &
    Partial<
      Pick<
        SessionState,
        "conditions" | "encounterEffects" | "conditionSources" | "seesSource"
      >
    >;
}
type Doc = ConditionDoc;

function seesSourceGated(conditionId: string): boolean {
  return (
    CONDITION_GATES[conditionId as ConditionId]?.suppressedUnless?.includes(
      "sees-source"
    ) ?? false
  );
}

/** The source-gated conditions the character has, each with what is known of its
 *  source. */
export function conditionSourceInstances(
  doc: Doc,
  encounter?: ConditionEncounter
): ConditionSourceInstance[] {
  const agg = aggregateCharacterGrants(doc.character, doc.session);
  const active = new Set(agg.conditions);
  const raw: { key: string; conditionId: string; sourceId?: string }[] = [];
  for (const effect of doc.session.encounterEffects ?? []) {
    const { payload } = effect;
    if (payload.kind !== "condition" || !seesSourceGated(payload.conditionId)) continue;
    raw.push({
      key: `effect:${effect.id}`,
      conditionId: payload.conditionId,
      sourceId: effect.actor.combatantId,
    });
  }
  for (const id of doc.session.conditions ?? []) {
    if (!seesSourceGated(id)) continue;
    const sourceId = doc.session.conditionSources?.[id];
    raw.push({
      key: `condition:${id}`,
      conditionId: id,
      ...(sourceId ? { sourceId } : {}),
    });
  }
  const viewer = {
    conditions: agg.conditions,
    sight: {
      darkvisionFt: agg.darkvisionFt,
      blindsightFt: agg.blindsightFt,
      truesightFt: agg.truesightFt,
      magicalDarknessSightFt: agg.magicalDarknessSightFt,
    },
    seeInvisibleFt: agg.seeInvisibleFt,
  };
  const light = litLightLevel(doc.session);
  const ctx: SightContext = light ? { light } : {};
  const answers = doc.session.seesSource ?? {};
  return raw
    .filter((i) => active.has(i.conditionId))
    .map((i) => {
      // An unknown source can still be out of sight for the viewer alone (Blinded).
      const row = encounter?.rows.find((r) => r.id === i.sourceId);
      const derived = canSee(viewer, row ? { conditions: row.conditions } : {}, ctx);
      const sees = derived ?? answers[i.key];
      return {
        ...i,
        derived: derived !== undefined,
        ...(sees !== undefined ? { seesSource: sees } : {}),
      };
    });
}

/** Whether the table should answer "can you see its source?" for this instance:
 *  nothing on the sheet decides it. */
export function needsSeesAnswer(instance: ConditionSourceInstance): boolean {
  return !instance.derived;
}

/** The facts a sheet's condition effects depend on. A source-gated condition holds
 *  while any of its sources is (or may be) in sight. */
export function conditionFactsFor(
  doc: Doc,
  encounter?: ConditionEncounter
): ConditionFacts {
  const instances = conditionSourceInstances(doc, encounter);
  if (instances.length === 0) return {};
  return instances.every((i) => i.seesSource === false) ? { seesSource: false } : {};
}

/** The character's condition effects, with the facts they depend on. */
export function sheetConditionEffects(
  doc: Doc,
  encounter?: ConditionEncounter
): ResolvedConditionEffects {
  const conditions = aggregateCharacterGrants(doc.character, doc.session).conditions;
  return resolveConditionEffects(conditions, conditionFactsFor(doc, encounter));
}

/** The effects of no conditions (a caller with no sheet). */
export const NO_CONDITION_EFFECTS: ResolvedConditionEffects = resolveConditionEffects(
  [],
  {}
);
