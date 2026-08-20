/**
 * Locale-free, serializable facts produced by one reviewed combat resolution.
 *
 * A receipt records what the player entered at the table; it never infers a die
 * result. `occurrenceId` separates repeated uses of the same action, `instance`
 * separates its swings/rays, and the target binding prevents a result against one
 * creature from satisfying a prerequisite against another.
 */

import type {
  CombatAbilityCode,
  CombatOutcomeFact,
  CombatOutcomePredicate,
  CombatOutcomeReceipt,
  CombatOutcomeTarget,
  ReviewedCombatTargetOutcome,
} from "@/types/combat-outcome";

export type {
  CombatAttackResult,
  CombatOutcomeFact,
  CombatOutcomePredicate,
  CombatOutcomeReceipt,
  CombatOutcomeTarget,
  ReviewedCombatTargetOutcome,
} from "@/types/combat-outcome";

const ABILITIES = new Set<CombatAbilityCode>(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function wholeNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function wholePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseTarget(value: unknown): CombatOutcomeTarget | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "combatantId") ||
    !nonEmpty(value.combatantId)
  )
    return null;
  return { combatantId: value.combatantId };
}

/** Strict read-edge parser. Malformed or internally inconsistent facts are dropped. */
export function parseCombatOutcomeReceipt(value: unknown): CombatOutcomeReceipt | null {
  if (!isRecord(value)) return null;
  if (
    !nonEmpty(value.id) ||
    !nonEmpty(value.occurrenceId) ||
    !nonEmpty(value.actionId) ||
    !(value.instance === null || wholeNonNegative(value.instance)) ||
    !wholePositive(value.count) ||
    (value.instance !== null && value.count !== 1)
  ) {
    return null;
  }
  const target = parseTarget(value.target);
  if (!target || !isRecord(value.fact)) return null;
  const fact = value.fact;
  let parsedFact: CombatOutcomeFact | null = null;
  if (
    fact.kind === "attack" &&
    (fact.result === "hit" || fact.result === "miss" || fact.result === "critical-hit")
  ) {
    parsedFact = { kind: "attack", result: fact.result };
  } else if (
    fact.kind === "save" &&
    typeof fact.ability === "string" &&
    ABILITIES.has(fact.ability as CombatAbilityCode) &&
    (fact.result === "success" || fact.result === "failure")
  ) {
    parsedFact = {
      kind: "save",
      ability: fact.ability as CombatAbilityCode,
      result: fact.result,
    };
  } else if (
    fact.kind === "damage-reduction" &&
    finiteNonNegative(fact.incoming) &&
    finiteNonNegative(fact.reduced) &&
    finiteNonNegative(fact.remaining) &&
    fact.remaining <= fact.incoming &&
    fact.reduced === fact.incoming - fact.remaining
  ) {
    parsedFact = {
      kind: "damage-reduction",
      incoming: fact.incoming,
      reduced: fact.reduced,
      remaining: fact.remaining,
    };
  }
  return parsedFact
    ? {
        id: value.id,
        occurrenceId: value.occurrenceId,
        actionId: value.actionId,
        instance: value.instance,
        count: value.count,
        target,
        fact: parsedFact,
      }
    : null;
}

function sameTarget(a: CombatOutcomeTarget, b: CombatOutcomeTarget): boolean {
  return a.combatantId === b.combatantId;
}

/** Exact semantic matcher used by generic follow-up prerequisites. */
export function combatOutcomeMatches(
  receipt: CombatOutcomeReceipt,
  predicate: CombatOutcomePredicate
): boolean {
  if (predicate.actionId !== undefined && receipt.actionId !== predicate.actionId)
    return false;
  if (predicate.target && !sameTarget(receipt.target, predicate.target)) return false;
  const fact = receipt.fact;
  if (fact.kind !== predicate.kind) return false;
  switch (predicate.kind) {
    case "attack":
      return (
        fact.kind === "attack" &&
        (predicate.result === "success"
          ? fact.result === "hit" || fact.result === "critical-hit"
          : fact.result === predicate.result)
      );
    case "save":
      return (
        fact.kind === "save" &&
        fact.result === predicate.result &&
        (predicate.ability === undefined || fact.ability === predicate.ability)
      );
    case "damage-reduction":
      return (
        fact.kind === "damage-reduction" &&
        fact.incoming > 0 &&
        (predicate.result === "negated" ? fact.remaining === 0 : fact.remaining > 0)
      );
  }
}

export function combatOutcomePrerequisiteMet(
  predicate: CombatOutcomePredicate | undefined,
  receipts: ReadonlyArray<CombatOutcomeReceipt>
): boolean {
  return (
    predicate === undefined ||
    receipts.some((receipt) => combatOutcomeMatches(receipt, predicate))
  );
}

/** Matching receipts plus the deduplicated creatures those exact facts bind to. */
export function queryCombatOutcomes(
  predicate: CombatOutcomePredicate,
  receipts: ReadonlyArray<CombatOutcomeReceipt>
): { receipts: CombatOutcomeReceipt[]; targets: CombatOutcomeTarget[] } {
  const matches = receipts.filter((receipt) => combatOutcomeMatches(receipt, predicate));
  const seen = new Set<string>();
  const targets = matches.flatMap(({ target }) => {
    const key = target.combatantId;
    if (seen.has(key)) return [];
    seen.add(key);
    return [target];
  });
  return { receipts: matches, targets };
}

/** Pure monotonic, collision-checked allocator used by the persisted turn store. */
export function allocateCombatOutcomeOccurrenceId(input: {
  turnKey: string;
  actionId: string;
  currentOrdinal: number;
  existingIds: ReadonlySet<string>;
}): { id: string; nextOrdinal: number } {
  let nextOrdinal = Math.max(0, Math.floor(input.currentOrdinal)) + 1;
  const idAt = (ordinal: number): string =>
    `${input.turnKey}:outcome:${ordinal}:${encodeURIComponent(input.actionId)}`;
  while (input.existingIds.has(idAt(nextOrdinal))) nextOrdinal += 1;
  const id = idAt(nextOrdinal);
  return { id, nextOrdinal };
}

/** Compile player-reviewed target facts into immutable per-instance receipts. */
export function compileCombatOutcomeReceipts(input: {
  occurrenceId: string;
  actionId: string;
  targets: ReadonlyArray<ReviewedCombatTargetOutcome>;
}): CombatOutcomeReceipt[] {
  const receipts: CombatOutcomeReceipt[] = [];
  if (input.occurrenceId.length === 0 || input.actionId.length === 0) return receipts;
  const count = (value: number): number =>
    Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const add = (
    target: CombatOutcomeTarget,
    instance: number | null,
    count: number,
    fact: CombatOutcomeFact
  ): void => {
    receipts.push({
      id: `${input.occurrenceId}:${receipts.length}`,
      occurrenceId: input.occurrenceId,
      actionId: input.actionId,
      instance,
      count,
      target,
      fact,
    });
  };
  for (const reviewed of input.targets) {
    if (reviewed.target.combatantId.length === 0) {
      continue;
    }
    if (reviewed.attack) {
      if ("results" in reviewed.attack) {
        reviewed.attack.results.forEach((result, instance) => {
          add(reviewed.target, instance, 1, { kind: "attack", result });
        });
      } else {
        const attempts = count(reviewed.attack.attempts);
        const hits = Math.min(attempts, count(reviewed.attack.hits));
        const criticalHits = Math.min(hits, count(reviewed.attack.criticalHits ?? 0));
        if (attempts === 1) {
          add(reviewed.target, 0, 1, {
            kind: "attack",
            result: criticalHits > 0 ? "critical-hit" : hits > 0 ? "hit" : "miss",
          });
        } else {
          const normalHits = hits - criticalHits;
          const misses = attempts - hits;
          if (criticalHits > 0)
            add(reviewed.target, null, criticalHits, {
              kind: "attack",
              result: "critical-hit",
            });
          if (normalHits > 0)
            add(reviewed.target, null, normalHits, { kind: "attack", result: "hit" });
          if (misses > 0)
            add(reviewed.target, null, misses, { kind: "attack", result: "miss" });
        }
      }
    }
    if (reviewed.save) {
      if (!ABILITIES.has(reviewed.save.ability)) continue;
      const instances = Math.max(1, count(reviewed.save.instances ?? 1));
      add(reviewed.target, instances === 1 ? 0 : null, instances, {
        kind: "save",
        ability: reviewed.save.ability,
        result: reviewed.save.result,
      });
    }
    if (reviewed.damageReduction) {
      const incoming = Number.isFinite(reviewed.damageReduction.incoming)
        ? Math.max(0, reviewed.damageReduction.incoming)
        : 0;
      const remaining = Math.min(
        incoming,
        Number.isFinite(reviewed.damageReduction.remaining)
          ? Math.max(0, reviewed.damageReduction.remaining)
          : 0
      );
      add(reviewed.target, 0, 1, {
        kind: "damage-reduction",
        incoming,
        reduced: incoming - remaining,
        remaining,
      });
    }
  }
  return receipts;
}
