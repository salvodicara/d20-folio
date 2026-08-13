/** Pure creature/object vitality kernel. It interprets facts and never rolls or mutates. */

import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import { materialRefKey } from "@/lib/action-journal";
import { conformOccurrenceGenerationRef } from "@/lib/mechanics-reference-schema";
import {
  CREATURE_DAMAGE_INPUT_SCHEMA,
  CREATURE_HEALING_INPUT_SCHEMA,
  CREATURE_MAXIMUM_SYNC_INPUT_SCHEMA,
  CREATURE_REVIVAL_INPUT_SCHEMA,
  CREATURE_VITALS_SCHEMA,
  CREATURE_ZERO_HIT_POINTS_INPUT_SCHEMA,
  DEATH_SAVE_OUTCOME_SCHEMA,
  OBJECT_HIT_POINT_INPUT_SCHEMA,
  OBJECT_VITALS_SCHEMA,
  TEMPORARY_HIT_POINTS_CLEAR_SCHEMA,
  TEMPORARY_HIT_POINTS_GRANT_SCHEMA,
  type CreatureDamageFacts,
  type CreatureHealingFacts,
  type CreatureMaximumSyncFacts,
  type CreatureRevivalFacts,
  type CreatureVitals,
  type CreatureVitalsTransitionResult,
  type ObjectDamageFacts,
  type ObjectMaximumSyncFacts,
  type ObjectRepairFacts,
  type ObjectVitals,
  type ObjectVitalsTransitionResult,
  type VitalsSchemaCustomTypes,
  type VitalsRejection,
  type ZeroHitPointsState,
} from "@/types/vitals";

export type {
  CreatureDamageFacts,
  CreatureDamageInput,
  CreatureHealingFacts,
  CreatureHealingInput,
  CreatureMaximumSyncFacts,
  CreatureMaximumSyncInput,
  CreatureRevivalFacts,
  CreatureRevivalInput,
  CreatureZeroHitPointsInput,
  CreatureVitals,
  CreatureVitalsTransitionResult,
  DeathSaveOutcome,
  ObjectDamageFacts,
  ObjectHitPointInput,
  ObjectMaximumSyncFacts,
  ObjectRepairFacts,
  ObjectVitals,
  ObjectVitalsTransitionResult,
  TemporaryHitPoints,
  TemporaryHitPointsClear,
  TemporaryHitPointsGrant,
  VitalsRejection,
  ZeroHitPointsPolicy,
  ZeroHitPointsState,
} from "@/types/vitals";

const MAX_HIT_POINTS = 1_000_000_000;

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
    ? (value as number)
    : null;
}

const VITALS_CONTEXT: ExactSchemaContext<
  VitalsSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "death-save-count": (value) => integer(value, 0, 2),
    "nonnegative-integer": (value) => integer(value, 0, MAX_HIT_POINTS),
    "occurrence-generation-ref": conformOccurrenceGenerationRef,
    "positive-integer": (value) => integer(value, 1, MAX_HIT_POINTS),
  },
  refs: {},
};

const conformVitalsStructure = exactConformer(CREATURE_VITALS_SCHEMA, VITALS_CONTEXT);
const conformObjectVitalsStructure = exactConformer(OBJECT_VITALS_SCHEMA, VITALS_CONTEXT);
const conformDamageInputStructure = exactConformer(
  CREATURE_DAMAGE_INPUT_SCHEMA,
  VITALS_CONTEXT
);
const conformHealingInputStructure = exactConformer(
  CREATURE_HEALING_INPUT_SCHEMA,
  VITALS_CONTEXT
);
const conformZeroHitPointsInputStructure = exactConformer(
  CREATURE_ZERO_HIT_POINTS_INPUT_SCHEMA,
  VITALS_CONTEXT
);
const conformMaximumSyncInputStructure = exactConformer(
  CREATURE_MAXIMUM_SYNC_INPUT_SCHEMA,
  VITALS_CONTEXT
);
const conformRevivalInputStructure = exactConformer(
  CREATURE_REVIVAL_INPUT_SCHEMA,
  VITALS_CONTEXT
);
const conformObjectHitPointInputStructure = exactConformer(
  OBJECT_HIT_POINT_INPUT_SCHEMA,
  VITALS_CONTEXT
);
const conformTemporaryGrantStructure = exactConformer(
  TEMPORARY_HIT_POINTS_GRANT_SCHEMA,
  VITALS_CONTEXT
);
const conformTemporaryClearStructure = exactConformer(
  TEMPORARY_HIT_POINTS_CLEAR_SCHEMA,
  VITALS_CONTEXT
);
const conformDeathSaveOutcomeStructure = exactConformer(
  DEATH_SAVE_OUTCOME_SCHEMA,
  VITALS_CONTEXT
);

function sameOccurrence(
  left: CreatureVitals["hitPoints"]["temporary"]["sourceOccurrence"],
  right: CreatureVitals["hitPoints"]["temporary"]["sourceOccurrence"]
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.ordinal === right.ordinal &&
      left.occurrence.occurrenceId === right.occurrence.occurrenceId &&
      materialRefKey(left.occurrence.material) ===
        materialRefKey(right.occurrence.material))
  );
}

/** Exact persistence boundary plus the nonredundancy rules linking HP to zero state. */
export function conformCreatureVitals(value: unknown): Readonly<CreatureVitals> | null {
  const vitals = conformVitalsStructure(value);
  if (
    !vitals ||
    (vitals.hitPoints.current === 0) !== (vitals.zeroHitPoints !== null) ||
    (vitals.hitPoints.temporary.current === 0 &&
      vitals.hitPoints.temporary.sourceOccurrence !== null)
  ) {
    return null;
  }
  return vitals;
}

/** Exact object-HP boundary; destruction is derived from current HP being 0. */
export function conformObjectVitals(value: unknown): Readonly<ObjectVitals> | null {
  return conformObjectVitalsStructure(value);
}

function rejected(reason: VitalsRejection): {
  readonly reason: VitalsRejection;
  readonly status: "rejected";
} {
  return { reason, status: "rejected" };
}

function canonicalAfter<Facts>(
  before: Readonly<CreatureVitals>,
  afterValue: CreatureVitals,
  facts: Facts
): CreatureVitalsTransitionResult<Facts> {
  const after = conformCreatureVitals(afterValue);
  return after ? { after, before, facts, status: "applied" } : rejected("invalid-vitals");
}

function canonicalObjectAfter<Facts>(
  before: Readonly<ObjectVitals>,
  afterValue: ObjectVitals,
  facts: Facts
): ObjectVitalsTransitionResult<Facts> {
  const after = conformObjectVitals(afterValue);
  return after ? { after, before, facts, status: "applied" } : rejected("invalid-vitals");
}

function validateMaximum(vitals: CreatureVitals, maximumHitPoints: number): boolean {
  return vitals.hitPoints.current <= maximumHitPoints;
}

function temporaryAfterDamage(
  before: CreatureVitals["hitPoints"]["temporary"],
  lost: number
): CreatureVitals["hitPoints"]["temporary"] {
  const current = before.current - lost;
  return {
    current,
    sourceOccurrence: current === 0 ? null : before.sourceOccurrence,
  };
}

function deathFailures(before: ZeroHitPointsState, added: number): ZeroHitPointsState {
  const failures = (before?.kind === "dying" ? before.failures : 0) + added;
  if (failures >= 3) return { kind: "dead" };
  return {
    failures,
    kind: "dying",
    successes: before?.kind === "dying" ? before.successes : 0,
  };
}

/** Apply one already-resolved damage instance, including THP and every zero-HP rule. */
export function applyCreatureDamage(
  vitalsValue: unknown,
  inputValue: unknown
): CreatureVitalsTransitionResult<CreatureDamageFacts> {
  const before = conformCreatureVitals(vitalsValue);
  const input = conformDamageInputStructure(inputValue);
  if (!before) return rejected("invalid-vitals");
  if (!input) return rejected("invalid-input");
  if (!validateMaximum(before, input.maximumHitPoints)) {
    return rejected("maximum-conflict");
  }
  if (before.zeroHitPoints?.kind === "dead") return rejected("dead");

  const temporaryHitPointsLost = Math.min(
    before.hitPoints.temporary.current,
    input.amount
  );
  const afterTemporary = temporaryAfterDamage(
    before.hitPoints.temporary,
    temporaryHitPointsLost
  );
  const reachesHitPoints = input.amount - temporaryHitPointsLost;
  let hitPointsLost = Math.min(before.hitPoints.current, reachesHitPoints);
  let current = before.hitPoints.current - hitPointsLost;
  const overflowDamage = Math.max(0, reachesHitPoints - before.hitPoints.current);
  const wasAtZero = before.hitPoints.current === 0;
  const droppedToZero = !wasAtZero && current === 0;

  let zeroHitPoints: ZeroHitPointsState = before.zeroHitPoints;
  let deathSaveFailuresAdded = 0;
  let instantDeath = false;
  let remainedAtOne = false;
  if (wasAtZero) {
    instantDeath = input.amount >= input.maximumHitPoints;
    if (instantDeath) {
      zeroHitPoints = { kind: "dead" };
    } else {
      deathSaveFailuresAdded = input.criticalHit ? 2 : 1;
      zeroHitPoints = deathFailures(before.zeroHitPoints, deathSaveFailuresAdded);
    }
  } else if (droppedToZero) {
    if (input.zeroHitPointsPolicy === "remain-at-one") {
      current = 1;
      hitPointsLost = before.hitPoints.current - 1;
      remainedAtOne = true;
      zeroHitPoints = null;
    } else {
      instantDeath = overflowDamage >= input.maximumHitPoints;
      zeroHitPoints = instantDeath
        ? { kind: "dead" }
        : input.zeroHitPointsPolicy === "dying"
          ? { failures: 0, kind: "dying", successes: 0 }
          : { kind: "dead" };
    }
  }

  const afterValue: CreatureVitals = {
    hitPoints: { current, temporary: afterTemporary },
    zeroHitPoints,
  };
  const facts: CreatureDamageFacts = Object.freeze({
    becameDead: zeroHitPoints?.kind === "dead",
    concentrationDifficultyClass: Math.min(
      30,
      Math.max(10, Math.floor(input.amount / 2))
    ),
    damageTaken: input.amount,
    deathSaveFailuresAdded,
    hitPointsLost,
    instantDeath,
    overflowDamage,
    remainedAtOne,
    temporaryHitPointsLost,
    wouldDropToZero: droppedToZero,
  });
  return canonicalAfter(before, afterValue, facts);
}

/** Apply ordinary healing. Dead creatures require a separate resurrection program. */
export function healCreature(
  vitalsValue: unknown,
  inputValue: unknown
): CreatureVitalsTransitionResult<CreatureHealingFacts> {
  const before = conformCreatureVitals(vitalsValue);
  const input = conformHealingInputStructure(inputValue);
  if (!before) return rejected("invalid-vitals");
  if (!input) return rejected("invalid-input");
  if (!validateMaximum(before, input.maximumHitPoints)) {
    return rejected("maximum-conflict");
  }
  if (before.zeroHitPoints?.kind === "dead") return rejected("dead");
  const current = Math.min(
    input.maximumHitPoints,
    before.hitPoints.current + input.amount
  );
  const restored = current - before.hitPoints.current;
  if (restored === 0) return { status: "already-applied", vitals: before };
  const facts: CreatureHealingFacts = Object.freeze({
    requested: input.amount,
    restored,
    revivedFromZero: before.hitPoints.current === 0,
  });
  return canonicalAfter(
    before,
    {
      hitPoints: { ...before.hitPoints, current },
      zeroHitPoints: null,
    },
    facts
  );
}

/** Apply a non-damage effect that explicitly drops a living creature to 0 HP. */
export function reduceCreatureToZeroHitPoints(
  vitalsValue: unknown,
  inputValue: unknown
): CreatureVitalsTransitionResult<Readonly<Record<never, never>>> {
  const before = conformCreatureVitals(vitalsValue);
  const input = conformZeroHitPointsInputStructure(inputValue);
  if (!before) return rejected("invalid-vitals");
  if (!input) return rejected("invalid-input");
  if (!validateMaximum(before, input.maximumHitPoints)) {
    return rejected("maximum-conflict");
  }
  if (before.zeroHitPoints?.kind === "dead") return rejected("dead");
  if (before.hitPoints.current === 0) {
    return { status: "already-applied", vitals: before };
  }
  return canonicalAfter(
    before,
    {
      hitPoints: { ...before.hitPoints, current: 0 },
      zeroHitPoints:
        input.zeroHitPointsPolicy === "dying"
          ? { failures: 0, kind: "dying", successes: 0 }
          : { kind: "dead" },
    },
    Object.freeze({})
  );
}

/** Kill without fabricating damage; explicit kill effects bypass THP and death saves. */
export function killCreature(
  vitalsValue: unknown
): CreatureVitalsTransitionResult<Readonly<Record<never, never>>> {
  const before = conformCreatureVitals(vitalsValue);
  if (!before) return rejected("invalid-vitals");
  if (before.zeroHitPoints?.kind === "dead") {
    return { status: "already-applied", vitals: before };
  }
  return canonicalAfter(
    before,
    {
      hitPoints: { ...before.hitPoints, current: 0 },
      zeroHitPoints: { kind: "dead" },
    },
    Object.freeze({})
  );
}

/** Clamp current HP to a changed derived maximum; a maximum of 0 causes death. */
export function synchronizeCreatureHitPointMaximum(
  vitalsValue: unknown,
  inputValue: unknown
): CreatureVitalsTransitionResult<CreatureMaximumSyncFacts> {
  const before = conformCreatureVitals(vitalsValue);
  const input = conformMaximumSyncInputStructure(inputValue);
  if (!before) return rejected("invalid-vitals");
  if (!input) return rejected("invalid-input");
  const current = Math.min(before.hitPoints.current, input.maximumHitPoints);
  const maximumReachedZero = input.maximumHitPoints === 0;
  if (
    current === before.hitPoints.current &&
    (!maximumReachedZero || before.zeroHitPoints?.kind === "dead")
  ) {
    return { status: "already-applied", vitals: before };
  }
  const zeroHitPoints = maximumReachedZero
    ? { kind: "dead" as const }
    : before.zeroHitPoints;
  return canonicalAfter(
    before,
    {
      hitPoints: { ...before.hitPoints, current },
      zeroHitPoints,
    },
    Object.freeze({
      currentHitPoints: current,
      maximumReachedZero,
      previousHitPoints: before.hitPoints.current,
    })
  );
}

/** Return a dead creature to life; ordinary healing deliberately cannot do this. */
export function reviveCreature(
  vitalsValue: unknown,
  inputValue: unknown
): CreatureVitalsTransitionResult<CreatureRevivalFacts> {
  const before = conformCreatureVitals(vitalsValue);
  const input = conformRevivalInputStructure(inputValue);
  if (!before) return rejected("invalid-vitals");
  if (!input) return rejected("invalid-input");
  if (before.zeroHitPoints?.kind !== "dead") return rejected("not-dead");
  const current = Math.min(input.hitPoints, input.maximumHitPoints);
  return canonicalAfter(
    before,
    {
      hitPoints: { ...before.hitPoints, current },
      zeroHitPoints: null,
    },
    Object.freeze({ requested: input.hitPoints, restored: current })
  );
}

/** Apply damage that already passed packet defenses and any damage threshold. */
export function applyObjectDamage(
  vitalsValue: unknown,
  inputValue: unknown
): ObjectVitalsTransitionResult<ObjectDamageFacts> {
  const before = conformObjectVitals(vitalsValue);
  const input = conformObjectHitPointInputStructure(inputValue);
  if (!before) return rejected("invalid-vitals");
  if (!input) return rejected("invalid-input");
  if (before.hitPoints.current > input.maximumHitPoints) {
    return rejected("maximum-conflict");
  }
  if (before.hitPoints.current === 0) {
    return { status: "already-applied", vitals: before };
  }
  const current = Math.max(0, before.hitPoints.current - input.amount);
  return canonicalObjectAfter(
    before,
    { hitPoints: { current } },
    Object.freeze({
      destroyed: current === 0,
      hitPointsLost: before.hitPoints.current - current,
    })
  );
}

/** Repair an object, including a destroyed one, only when a rule permits it. */
export function repairObject(
  vitalsValue: unknown,
  inputValue: unknown
): ObjectVitalsTransitionResult<ObjectRepairFacts> {
  const before = conformObjectVitals(vitalsValue);
  const input = conformObjectHitPointInputStructure(inputValue);
  if (!before) return rejected("invalid-vitals");
  if (!input) return rejected("invalid-input");
  if (before.hitPoints.current > input.maximumHitPoints) {
    return rejected("maximum-conflict");
  }
  const current = Math.min(
    input.maximumHitPoints,
    before.hitPoints.current + input.amount
  );
  const restored = current - before.hitPoints.current;
  if (restored === 0) return { status: "already-applied", vitals: before };
  return canonicalObjectAfter(
    before,
    { hitPoints: { current } },
    Object.freeze({
      requested: input.amount,
      restored,
      restoredFromDestroyed: before.hitPoints.current === 0,
    })
  );
}

/** Clamp object HP after its derived maximum changes; zero means destroyed. */
export function synchronizeObjectHitPointMaximum(
  vitalsValue: unknown,
  inputValue: unknown
): ObjectVitalsTransitionResult<ObjectMaximumSyncFacts> {
  const before = conformObjectVitals(vitalsValue);
  const input = conformMaximumSyncInputStructure(inputValue);
  if (!before) return rejected("invalid-vitals");
  if (!input) return rejected("invalid-input");
  const current = Math.min(before.hitPoints.current, input.maximumHitPoints);
  if (current === before.hitPoints.current) {
    return { status: "already-applied", vitals: before };
  }
  return canonicalObjectAfter(
    before,
    { hitPoints: { current } },
    Object.freeze({
      currentHitPoints: current,
      destroyedByMaximumChange: current === 0,
      previousHitPoints: before.hitPoints.current,
    })
  );
}

/** Apply the table's explicit keep/replace choice; THP never stack or heal. */
export function grantTemporaryHitPoints(
  vitalsValue: unknown,
  grantValue: unknown
): CreatureVitalsTransitionResult<Readonly<Record<never, never>>> {
  const before = conformCreatureVitals(vitalsValue);
  const grant = conformTemporaryGrantStructure(grantValue);
  if (!before) return rejected("invalid-vitals");
  if (!grant) return rejected("invalid-input");
  if (before.zeroHitPoints?.kind === "dead") return rejected("dead");
  if (grant.decision === "keep") {
    return before.hitPoints.temporary.current > 0
      ? { status: "already-applied", vitals: before }
      : rejected("invalid-input");
  }
  if (
    before.hitPoints.temporary.current === grant.amount &&
    sameOccurrence(before.hitPoints.temporary.sourceOccurrence, grant.sourceOccurrence)
  ) {
    return { status: "already-applied", vitals: before };
  }
  return canonicalAfter(
    before,
    {
      ...before,
      hitPoints: {
        ...before.hitPoints,
        temporary: {
          current: grant.amount,
          sourceOccurrence: grant.sourceOccurrence,
        },
      },
    },
    Object.freeze({})
  );
}

/** Clear all THP or only the pool still owned by one exact occurrence. */
export function clearTemporaryHitPoints(
  vitalsValue: unknown,
  clearValue: unknown
): CreatureVitalsTransitionResult<Readonly<Record<never, never>>> {
  const before = conformCreatureVitals(vitalsValue);
  const clear = conformTemporaryClearStructure(clearValue);
  if (!before) return rejected("invalid-vitals");
  if (!clear) return rejected("invalid-input");
  if (
    before.hitPoints.temporary.current === 0 ||
    (clear.kind === "source" &&
      !sameOccurrence(
        before.hitPoints.temporary.sourceOccurrence,
        clear.sourceOccurrence
      ))
  ) {
    return { status: "already-applied", vitals: before };
  }
  return canonicalAfter(
    before,
    {
      ...before,
      hitPoints: {
        ...before.hitPoints,
        temporary: { current: 0, sourceOccurrence: null },
      },
    },
    Object.freeze({})
  );
}

/** A successful stabilization attempt clears all death-save marks. */
export function stabilizeCreature(
  vitalsValue: unknown
): CreatureVitalsTransitionResult<Readonly<Record<never, never>>> {
  const before = conformCreatureVitals(vitalsValue);
  if (!before) return rejected("invalid-vitals");
  if (before.zeroHitPoints?.kind === "dead") return rejected("dead");
  if (before.zeroHitPoints?.kind === "stable") {
    return { status: "already-applied", vitals: before };
  }
  if (before.zeroHitPoints?.kind !== "dying") return rejected("not-dying");
  return canonicalAfter(
    before,
    { ...before, zeroHitPoints: { kind: "stable" } },
    Object.freeze({})
  );
}

/** Apply one reviewed death-save outcome; a natural 20 restores exactly 1 HP. */
export function applyDeathSaveOutcome(
  vitalsValue: unknown,
  outcomeValue: unknown
): CreatureVitalsTransitionResult<Readonly<Record<never, never>>> {
  const before = conformCreatureVitals(vitalsValue);
  const outcome = conformDeathSaveOutcomeStructure(outcomeValue);
  if (!before) return rejected("invalid-vitals");
  if (!outcome) return rejected("invalid-input");
  if (before.zeroHitPoints?.kind === "dead") return rejected("dead");
  if (before.zeroHitPoints?.kind !== "dying") return rejected("not-dying");

  if (outcome === "critical-success") {
    return canonicalAfter(
      before,
      {
        ...before,
        hitPoints: { ...before.hitPoints, current: 1 },
        zeroHitPoints: null,
      },
      Object.freeze({})
    );
  }
  if (outcome === "success") {
    const successes = before.zeroHitPoints.successes + 1;
    return canonicalAfter(
      before,
      {
        ...before,
        zeroHitPoints:
          successes >= 3 ? { kind: "stable" } : { ...before.zeroHitPoints, successes },
      },
      Object.freeze({})
    );
  }
  const added = outcome === "critical-failure" ? 2 : 1;
  return canonicalAfter(
    before,
    { ...before, zeroHitPoints: deathFailures(before.zeroHitPoints, added) },
    Object.freeze({})
  );
}
