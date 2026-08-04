import type { SessionState } from "@/types/character";
import type { ActiveCombatEffect } from "@/types/combat-effect";

/** Condition ids projected by live campaign-effect occurrences. */
export function projectedEncounterConditions(
  effects: ReadonlyArray<ActiveCombatEffect> | undefined
): string[] {
  return (effects ?? []).flatMap((effect) =>
    effect.payload.kind === "condition" ? [effect.payload.conditionId] : []
  );
}

/** The one read seam for condition state: manual/base chips plus source-owned
 * solo and encounter occurrences. Provenance stays separate so ending one source
 * never removes a manual override or another caster's identical condition. */
export function effectiveSessionConditions(
  session: Pick<
    SessionState,
    "conditions" | "concentrationConditions" | "encounterEffects" | "concentration"
  >
): string[] {
  return [
    ...new Set([
      ...session.conditions,
      ...(session.concentration ? (session.concentrationConditions ?? []) : []),
      ...projectedEncounterConditions(session.encounterEffects),
    ]),
  ];
}
