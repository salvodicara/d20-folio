import { vitalConditions } from "@/lib/character-vitals";
import { withImpliedConditions } from "@/lib/condition";
import { potionStateConditions } from "@/lib/potion-states";
import type { SessionState } from "@/types/character";
import type { ActiveCombatEffect } from "@/types/combat-effect";

/** Condition ids projected by live campaign-effect occurrences. */
export function projectedEncounterConditions(
  effects: ReadonlyArray<ActiveCombatEffect> | undefined
): string[] {
  return (effects ?? []).flatMap((effect) =>
    // A source's Exhaustion is a level (`effectiveExhaustion`), not a chip.
    effect.payload.kind === "condition" && effect.payload.conditionId !== "exhaustion"
      ? [effect.payload.conditionId]
      : []
  );
}

type ConditionSession = Pick<
  SessionState,
  "conditions" | "concentrationConditions" | "encounterEffects" | "concentration"
> & {
  readonly world?: unknown;
  readonly activeFeatures?: SessionState["activeFeatures"];
};

const NO_IMMUNITIES: ReadonlySet<string> = new Set();

/** The one read seam for condition state: manual/base chips plus source-owned
 * solo and encounter occurrences. Provenance stays separate so ending one source
 * never removes a manual override or another caster's identical condition.
 * Implied conditions (Unconscious → Incapacitated + Prone) are included.
 *
 * A condition the creature is immune to is suppressed: it and what only it implies
 * drop out, while the stored source stays, so it applies again when the immunity
 * ends (edge-case family M3). The sheet's immunities come from
 * `aggregateCharacterGrants`, which returns the effective list as `conditions`. */
export function effectiveSessionConditions(
  session: ConditionSession,
  immunities: ReadonlySet<string> = NO_IMMUNITIES
): string[] {
  const sources = [
    // The manual/base ledger reads through the ONE vitals projection seam
    // (session-truth reconciled against the persisted world).
    ...vitalConditions(session),
    ...(session.concentration ? (session.concentrationConditions ?? []) : []),
    ...projectedEncounterConditions(session.encounterEffects),
    // A lit potion state's own condition (Potion of Invisibility).
    ...potionStateConditions(session.activeFeatures ?? []),
  ];
  if (immunities.size === 0) return withImpliedConditions(sources);
  return withImpliedConditions(sources.filter((id) => !immunities.has(id))).filter(
    (id) => !immunities.has(id)
  );
}

/** The conditions the creature has but is immune to (shown as suppressed). */
export function suppressedSessionConditions(
  session: ConditionSession,
  immunities: ReadonlySet<string>
): string[] {
  if (immunities.size === 0) return [];
  return [
    ...new Set(effectiveSessionConditions(session).filter((id) => immunities.has(id))),
  ].sort();
}
