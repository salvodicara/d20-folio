/** Exact persisted and command grammar for creature hit points and death state. */

import {
  booleanSchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { OccurrenceRef } from "@/types/mechanics-reference";

const NONNEGATIVE_INTEGER_SCHEMA = customSchema<"nonnegative-integer", number>(
  "nonnegative-integer"
);
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);
const DEATH_SAVE_COUNT_SCHEMA = customSchema<"death-save-count", number>(
  "death-save-count"
);
const OCCURRENCE_REF_VALUE_SCHEMA = customSchema<"occurrence-ref", OccurrenceRef>(
  "occurrence-ref"
);
const NULL_SCHEMA = literalSchema(null);

export const TEMPORARY_HIT_POINTS_SCHEMA = objectSchema({
  current: NONNEGATIVE_INTEGER_SCHEMA,
  sourceOccurrence: unionSchema([OCCURRENCE_REF_VALUE_SCHEMA, NULL_SCHEMA]),
});
export type TemporaryHitPoints = InferExactSchema<typeof TEMPORARY_HIT_POINTS_SCHEMA>;

export const ZERO_HIT_POINTS_STATE_SCHEMA = unionSchema([
  discriminatedUnionSchema("kind", {
    dying: objectSchema({
      failures: DEATH_SAVE_COUNT_SCHEMA,
      kind: literalSchema("dying"),
      successes: DEATH_SAVE_COUNT_SCHEMA,
    }),
    stable: objectSchema({ kind: literalSchema("stable") }),
    dead: objectSchema({ kind: literalSchema("dead") }),
  }),
  NULL_SCHEMA,
]);
export type ZeroHitPointsState = InferExactSchema<typeof ZERO_HIT_POINTS_STATE_SCHEMA>;

/** `zeroHitPoints` is null exactly while `hitPoints.current` is positive. */
export const CREATURE_VITALS_SCHEMA = objectSchema({
  hitPoints: objectSchema({
    current: NONNEGATIVE_INTEGER_SCHEMA,
    temporary: TEMPORARY_HIT_POINTS_SCHEMA,
  }),
  zeroHitPoints: ZERO_HIT_POINTS_STATE_SCHEMA,
});
export type CreatureVitals = InferExactSchema<typeof CREATURE_VITALS_SCHEMA>;

/** Objects have HP but no creature-only THP, dying, death-save, or dead state. */
export const OBJECT_VITALS_SCHEMA = objectSchema({
  hitPoints: objectSchema({ current: NONNEGATIVE_INTEGER_SCHEMA }),
});
export type ObjectVitals = InferExactSchema<typeof OBJECT_VITALS_SCHEMA>;

/** Resolved table policy when damage would leave a creature at 0 HP. */
export const ZERO_HIT_POINTS_POLICY_SCHEMA = unionSchema([
  literalSchema("dying"),
  literalSchema("dead"),
  literalSchema("remain-at-one"),
]);
export type ZeroHitPointsPolicy = InferExactSchema<typeof ZERO_HIT_POINTS_POLICY_SCHEMA>;

/** Damage has already passed through every packet defense and adjustment. */
export const CREATURE_DAMAGE_INPUT_SCHEMA = objectSchema({
  amount: POSITIVE_INTEGER_SCHEMA,
  criticalHit: booleanSchema,
  maximumHitPoints: POSITIVE_INTEGER_SCHEMA,
  zeroHitPointsPolicy: ZERO_HIT_POINTS_POLICY_SCHEMA,
});
export type CreatureDamageInput = InferExactSchema<typeof CREATURE_DAMAGE_INPUT_SCHEMA>;

export const CREATURE_HEALING_INPUT_SCHEMA = objectSchema({
  amount: POSITIVE_INTEGER_SCHEMA,
  maximumHitPoints: POSITIVE_INTEGER_SCHEMA,
});
export type CreatureHealingInput = InferExactSchema<typeof CREATURE_HEALING_INPUT_SCHEMA>;

/** A non-damage effect that explicitly reduces a living creature to 0 HP. */
export const CREATURE_ZERO_HIT_POINTS_INPUT_SCHEMA = objectSchema({
  maximumHitPoints: POSITIVE_INTEGER_SCHEMA,
  zeroHitPointsPolicy: unionSchema([literalSchema("dying"), literalSchema("dead")]),
});
export type CreatureZeroHitPointsInput = InferExactSchema<
  typeof CREATURE_ZERO_HIT_POINTS_INPUT_SCHEMA
>;

/** Reconcile mutable current HP after the derived maximum changes. */
export const CREATURE_MAXIMUM_SYNC_INPUT_SCHEMA = objectSchema({
  maximumHitPoints: NONNEGATIVE_INTEGER_SCHEMA,
});
export type CreatureMaximumSyncInput = InferExactSchema<
  typeof CREATURE_MAXIMUM_SYNC_INPUT_SCHEMA
>;

/** Only a life-restoring rule, never ordinary healing, can consume this input. */
export const CREATURE_REVIVAL_INPUT_SCHEMA = objectSchema({
  hitPoints: POSITIVE_INTEGER_SCHEMA,
  maximumHitPoints: POSITIVE_INTEGER_SCHEMA,
});
export type CreatureRevivalInput = InferExactSchema<typeof CREATURE_REVIVAL_INPUT_SCHEMA>;

export const OBJECT_HIT_POINT_INPUT_SCHEMA = objectSchema({
  amount: POSITIVE_INTEGER_SCHEMA,
  maximumHitPoints: POSITIVE_INTEGER_SCHEMA,
});
export type ObjectHitPointInput = InferExactSchema<typeof OBJECT_HIT_POINT_INPUT_SCHEMA>;

export const TEMPORARY_HIT_POINTS_GRANT_SCHEMA = objectSchema({
  amount: POSITIVE_INTEGER_SCHEMA,
  decision: unionSchema([literalSchema("keep"), literalSchema("replace")]),
  sourceOccurrence: unionSchema([OCCURRENCE_REF_VALUE_SCHEMA, NULL_SCHEMA]),
});
export type TemporaryHitPointsGrant = InferExactSchema<
  typeof TEMPORARY_HIT_POINTS_GRANT_SCHEMA
>;

export const TEMPORARY_HIT_POINTS_CLEAR_SCHEMA = discriminatedUnionSchema("kind", {
  all: objectSchema({ kind: literalSchema("all") }),
  source: objectSchema({
    kind: literalSchema("source"),
    sourceOccurrence: OCCURRENCE_REF_VALUE_SCHEMA,
  }),
});
export type TemporaryHitPointsClear = InferExactSchema<
  typeof TEMPORARY_HIT_POINTS_CLEAR_SCHEMA
>;

export const DEATH_SAVE_OUTCOME_SCHEMA = unionSchema([
  literalSchema("success"),
  literalSchema("failure"),
  literalSchema("critical-success"),
  literalSchema("critical-failure"),
]);
export type DeathSaveOutcome = InferExactSchema<typeof DEATH_SAVE_OUTCOME_SCHEMA>;

export type VitalsSchemaCustomTypes = {
  readonly "death-save-count": number;
  readonly "nonnegative-integer": number;
  readonly "occurrence-ref": OccurrenceRef;
  readonly "positive-integer": number;
};

export interface CreatureDamageFacts {
  readonly damageTaken: number;
  readonly temporaryHitPointsLost: number;
  readonly hitPointsLost: number;
  readonly overflowDamage: number;
  readonly concentrationDifficultyClass: number;
  readonly wouldDropToZero: boolean;
  readonly deathSaveFailuresAdded: number;
  readonly becameDead: boolean;
  readonly instantDeath: boolean;
  readonly remainedAtOne: boolean;
}

export interface CreatureHealingFacts {
  readonly requested: number;
  readonly restored: number;
  readonly revivedFromZero: boolean;
}

export interface CreatureMaximumSyncFacts {
  readonly previousHitPoints: number;
  readonly currentHitPoints: number;
  readonly maximumReachedZero: boolean;
}

export interface CreatureRevivalFacts {
  readonly requested: number;
  readonly restored: number;
}

export interface ObjectDamageFacts {
  readonly destroyed: boolean;
  readonly hitPointsLost: number;
}

export interface ObjectRepairFacts {
  readonly requested: number;
  readonly restored: number;
  readonly restoredFromDestroyed: boolean;
}

export interface ObjectMaximumSyncFacts {
  readonly currentHitPoints: number;
  readonly previousHitPoints: number;
  readonly destroyedByMaximumChange: boolean;
}

export type VitalsRejection =
  | "invalid-vitals"
  | "invalid-input"
  | "maximum-conflict"
  | "dead"
  | "not-dead"
  | "not-dying";

export type VitalsTransitionResult<State, Facts> =
  | {
      readonly status: "applied";
      readonly before: Readonly<State>;
      readonly after: Readonly<State>;
      readonly facts: Facts;
    }
  | {
      readonly status: "already-applied";
      readonly vitals: Readonly<State>;
    }
  | {
      readonly status: "rejected";
      readonly reason: VitalsRejection;
    };

export type CreatureVitalsTransitionResult<Facts> = VitalsTransitionResult<
  CreatureVitals,
  Facts
>;
export type ObjectVitalsTransitionResult<Facts> = VitalsTransitionResult<
  ObjectVitals,
  Facts
>;
