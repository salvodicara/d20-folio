import { vitalConditions } from "@/lib/character-vitals";
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
  > & { readonly world?: unknown }
): string[] {
  return [
    ...new Set([
      // The manual/base ledger reads through the ONE vitals projection seam
      // (session-truth reconciled against the persisted world).
      ...vitalConditions(session),
      ...(session.concentration ? (session.concentrationConditions ?? []) : []),
      ...projectedEncounterConditions(session.encounterEffects),
    ]),
  ];
}
