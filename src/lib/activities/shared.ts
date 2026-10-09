/** Small helpers the activity translators share. */
import type { Grant } from "@/lib/grant-schema";
import { startingStatusLifetime, statusEndsOn } from "@/lib/status";
import type { WhileActiveDuration } from "@/lib/grants";
import type { ActivityDice, ActivityEffect, DiceTerm } from "./types";

/** Drop `undefined` and `false` fields so an absent fact stays absent. */
export function compact<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field === undefined || field === false) continue;
    out[key] = field;
  }
  return out as T;
}

/** A dice formula, or `undefined` when it declares nothing. */
export function dice(formula: ActivityDice): ActivityDice | undefined {
  const out = compact({
    ...formula,
    plus: formula.plus && formula.plus.length > 0 ? formula.plus : undefined,
  });
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The terms present, in order. */
export function terms(...candidates: Array<DiceTerm | undefined>): DiceTerm[] {
  return candidates.filter((term): term is DiceTerm => term !== undefined);
}

type WhileActive = Extract<Grant, { type: "while-active" }>;

/** The `while-active` grants of a catalogue entry, in declaration order. */
export function whileActiveGrants(
  grants: ReadonlyArray<Grant> | undefined
): WhileActive[] {
  return (grants ?? []).filter(
    (grant): grant is WhileActive => grant.type === "while-active"
  );
}

/** The status a `while-active` grant lights, in Phase 2's status vocabulary. */
export function statusEffect(
  grant: WhileActive,
  duration: WhileActiveDuration | undefined,
  concentration: boolean
): Extract<ActivityEffect, { kind: "status" }> {
  return compact({
    kind: "status" as const,
    key: grant.activeKey,
    recipient: grant.recipient === "selected" ? ("selected" as const) : ("self" as const),
    markScope: grant.targetScope,
    concentration: concentration ? (true as const) : undefined,
    lifetime: startingStatusLifetime(duration),
    endsOn: statusEndsOn(duration, concentration),
  });
}
