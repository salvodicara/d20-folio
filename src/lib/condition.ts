/** Pure 2024 condition closure, projection, and Exhaustion arithmetic. */

import { conformDamageDefenseRule } from "@/lib/damage";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import {
  conformEntityRef,
  conformOccurrenceGenerationRef,
} from "@/lib/mechanics-reference-schema";
import { conformCreatureVitals } from "@/lib/vitals";
import {
  CONDITION_INSTANCES_SCHEMA,
  EXHAUSTION_LEVELS,
  NON_EXHAUSTION_CONDITION_IDS,
  type ConditionInstance,
  type ConditionInstanceIdentity,
  type ConditionInstances,
  type ConditionProjection,
  type ConditionProvenance,
  type ConditionRequirementDefinition,
  type ConditionRuleTable,
  type ConditionSchemaCustomTypes,
  type DeterministicConditionEffect,
  type EffectiveCondition,
  type EntityConditionProjection,
  type ExhaustionLevel,
  type ExhaustionResolution,
  type IndependentConditionRequirement,
  type NonExhaustionConditionId,
  type NormalizedConditions,
  type SourceBoundConditionRequirement,
} from "@/types/condition";
import type { DamageDefenseRule } from "@/types/damage";
import type { EntityRef } from "@/types/mechanics-reference";

export type {
  ConditionInstance,
  ConditionInstances,
  ConditionProjection,
  ConditionProvenance,
  DeterministicConditionEffect,
  EffectiveCondition,
  ExhaustionLevel,
  ExhaustionResolution,
  IndependentConditionRequirement,
  NormalizedConditions,
  ProjectedConditionEffect,
  ProjectedConditionRequirement,
  SourceBoundConditionRequirement,
} from "@/types/condition";

const MAX_CONDITION_INSTANCES = 256;

function exactRecord(
  value: unknown,
  keys: ReadonlyArray<string>
): value is Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  const expected = [...keys].sort();
  return (
    ownKeys.length === expected.length &&
    ownKeys.every((key) => typeof key === "string") &&
    ownKeys
      .sort()
      .every(
        (key, index) =>
          key === expected[index] &&
          Object.getOwnPropertyDescriptor(value, key)?.enumerable === true &&
          "value" in (Object.getOwnPropertyDescriptor(value, key) ?? {})
      )
  );
}

function conformConditionIdentity(value: unknown): ConditionInstanceIdentity | null {
  if (exactRecord(value, ["kind", "ref"]) && value.kind === "occurrence") {
    const ref = conformOccurrenceGenerationRef(value.ref);
    return ref ? { kind: "occurrence", ref: structuredClone(ref) } : null;
  }
  if (exactRecord(value, ["kind", "target"]) && value.kind === "zero-hit-points") {
    const target = conformEntityRef(value.target);
    return target ? { kind: "zero-hit-points", target: structuredClone(target) } : null;
  }
  return null;
}

const CONDITION_SCHEMA_CONTEXT: ExactSchemaContext<
  ConditionSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "condition-instance-identity": conformConditionIdentity,
    "entity-ref": (value): EntityRef | null => conformEntityRef(value),
  },
  refs: {},
};

const conformInstancesStructure = exactConformer(
  CONDITION_INSTANCES_SCHEMA,
  CONDITION_SCHEMA_CONTEXT
);

function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
  return value;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonicalValue((value as Readonly<Record<string, unknown>>)[key]),
        ])
    );
  }
  return value;
}

function canonicalKey(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function unique(values: ReadonlyArray<string>): boolean {
  return new Set(values).size === values.length;
}

function canonicalDamageDefenseRule(
  rule: DamageDefenseRule
): Readonly<DamageDefenseRule> {
  const conformed = conformDamageDefenseRule(rule);
  if (!conformed) throw new TypeError("Invalid engine-owned condition defense");
  return conformed;
}

const PETRIFIED_DAMAGE_RESISTANCE = canonicalDamageDefenseRule({
  kind: "resistance",
  selector: {
    damageTypes: [],
    deliveries: [],
    forbiddenTraits: [],
    requiredTraits: [],
  },
  sourceId: "condition:petrified:all-damage-resistance",
});

/** The one exhaustive, locale-free authority for all fifteen 2024 conditions. */
export const CONDITION_RULES = deepFreeze({
  blinded: {
    effects: [
      { kind: "sense-unavailable", sense: "sight" },
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "attack",
      },
      {
        kind: "roll-mode",
        mode: "advantage",
        perspective: "against-self",
        test: "attack",
      },
    ],
    implications: [],
    kind: "occurrence",
    requirements: [
      {
        kind: "sense-dependent-ability-check",
        outcome: "automatic-failure",
        sense: "sight",
      },
    ],
  },
  charmed: {
    effects: [],
    implications: [],
    kind: "occurrence",
    requirements: [
      {
        kind: "harm-source-block",
        operations: ["attack", "damaging-ability", "damaging-magical-effect"],
      },
      { kind: "source-social-check", mode: "advantage" },
    ],
  },
  deafened: {
    effects: [{ kind: "sense-unavailable", sense: "hearing" }],
    implications: [],
    kind: "occurrence",
    requirements: [
      {
        kind: "sense-dependent-ability-check",
        outcome: "automatic-failure",
        sense: "hearing",
      },
    ],
  },
  exhaustion: {
    d20PenaltyPerLevel: -2,
    deadAtLevel: 6,
    kind: "levels",
    longRestRemoval: 1,
    maximumLevel: 6,
    minimumLevel: 0,
    speedPenaltyFtPerLevel: 5,
  },
  frightened: {
    effects: [],
    implications: [],
    kind: "occurrence",
    requirements: [
      {
        kind: "source-in-line-of-sight-roll",
        mode: "disadvantage",
        test: "ability-check",
      },
      {
        kind: "source-in-line-of-sight-roll",
        mode: "disadvantage",
        test: "attack",
      },
      { kind: "approach-source-block" },
    ],
  },
  grappled: {
    effects: [{ kind: "speed-zero" }],
    implications: [],
    kind: "occurrence",
    requirements: [
      { kind: "non-source-attack", mode: "disadvantage" },
      {
        exemption: "subject-tiny-or-two-plus-sizes-smaller",
        extraMovementCostPerFoot: 1,
        kind: "source-moves-grappled-subject",
      },
    ],
  },
  incapacitated: {
    effects: [
      {
        kind: "block-economy",
        slots: ["action", "bonus-action", "reaction"],
      },
      { kind: "break-concentration" },
      { kind: "speech-unavailable" },
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "initiative",
      },
    ],
    implications: [],
    kind: "occurrence",
    requirements: [],
  },
  invisible: {
    effects: [
      {
        kind: "roll-mode",
        mode: "advantage",
        perspective: "self",
        test: "initiative",
      },
    ],
    implications: [],
    kind: "occurrence",
    requirements: [
      {
        includesWornCarriedEquipment: true,
        kind: "seen-targeting",
        whenCreatorCannotSee: "ineligible",
      },
      {
        appliesWhen: "counterparty-cannot-see-subject",
        kind: "visibility-attack-roll",
        mode: "advantage",
        perspective: "self",
      },
      {
        appliesWhen: "counterparty-cannot-see-subject",
        kind: "visibility-attack-roll",
        mode: "disadvantage",
        perspective: "against-self",
      },
    ],
  },
  paralyzed: {
    effects: [
      { kind: "speed-zero" },
      { abilities: ["STR", "DEX"], kind: "auto-fail-save" },
      {
        kind: "roll-mode",
        mode: "advantage",
        perspective: "against-self",
        test: "attack",
      },
    ],
    implications: ["incapacitated"],
    kind: "occurrence",
    requirements: [{ distanceFt: 5, kind: "automatic-critical-on-hit" }],
  },
  petrified: {
    effects: [
      {
        includesWornCarriedNonmagicalObjects: true,
        kind: "inanimate-transformation",
      },
      { factor: 10, kind: "weight-multiplier" },
      { kind: "aging-suspended" },
      { kind: "speed-zero" },
      {
        kind: "roll-mode",
        mode: "advantage",
        perspective: "against-self",
        test: "attack",
      },
      { abilities: ["STR", "DEX"], kind: "auto-fail-save" },
      { kind: "damage-defense", rule: PETRIFIED_DAMAGE_RESISTANCE },
      { conditionId: "poisoned", kind: "condition-immunity" },
    ],
    implications: ["incapacitated"],
    kind: "occurrence",
    requirements: [],
  },
  poisoned: {
    effects: [
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "ability-check",
      },
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "attack",
      },
    ],
    implications: [],
    kind: "occurrence",
    requirements: [],
  },
  prone: {
    effects: [
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "attack",
      },
    ],
    implications: [],
    kind: "occurrence",
    requirements: [
      {
        crawlAllowed: true,
        kind: "prone-movement",
        standBlockedAtSpeedZero: true,
        standCost: "half-speed-round-down",
        standEndsCondition: true,
      },
      {
        beyond: "disadvantage",
        kind: "prone-attacks-against",
        thresholdFt: 5,
        within: "advantage",
      },
    ],
  },
  restrained: {
    effects: [
      { kind: "speed-zero" },
      {
        kind: "roll-mode",
        mode: "advantage",
        perspective: "against-self",
        test: "attack",
      },
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "attack",
      },
      {
        ability: "DEX",
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "saving-throw",
      },
    ],
    implications: [],
    kind: "occurrence",
    requirements: [],
  },
  stunned: {
    effects: [
      { abilities: ["STR", "DEX"], kind: "auto-fail-save" },
      {
        kind: "roll-mode",
        mode: "advantage",
        perspective: "against-self",
        test: "attack",
      },
    ],
    implications: ["incapacitated"],
    kind: "occurrence",
    requirements: [],
  },
  unconscious: {
    effects: [
      { kind: "drop-held-items" },
      { kind: "speed-zero" },
      {
        kind: "roll-mode",
        mode: "advantage",
        perspective: "against-self",
        test: "attack",
      },
      { abilities: ["STR", "DEX"], kind: "auto-fail-save" },
      { kind: "surroundings-unaware" },
    ],
    implications: ["incapacitated", "prone"],
    kind: "occurrence",
    requirements: [
      { distanceFt: 5, kind: "automatic-critical-on-hit" },
      { conditionId: "prone", kind: "condition-end-retains" },
    ],
  },
} satisfies ConditionRuleTable);

/** Exact condition-instance boundary; multiplicity is retained, identities are unique. */
export function conformConditionInstances(
  value: unknown
): Readonly<ConditionInstances> | null {
  try {
    const instances = conformInstancesStructure(value);
    return instances &&
      instances.length <= MAX_CONDITION_INSTANCES &&
      unique(instances.map((instance) => canonicalKey(instance.identity)))
      ? instances
      : null;
  } catch {
    return null;
  }
}

function occurrenceRule(conditionId: NonExhaustionConditionId) {
  return CONDITION_RULES[conditionId];
}

function addProvenance(
  target: ConditionProvenance[],
  provenance: ConditionProvenance
): void {
  const key = canonicalKey(provenance);
  if (!target.some((entry) => canonicalKey(entry) === key)) target.push(provenance);
}

/** Union direct conditions and their implications while retaining every active lifetime. */
export function normalizeConditions(
  value: unknown
): Readonly<NormalizedConditions> | null {
  const instances = conformConditionInstances(value);
  if (!instances) return null;

  const byCondition = new Map<NonExhaustionConditionId, ConditionProvenance[]>();
  const visit = (
    instance: ConditionInstance,
    conditionId: NonExhaustionConditionId,
    path: ReadonlyArray<NonExhaustionConditionId>
  ): void => {
    if (path.slice(0, -1).includes(conditionId)) {
      throw new TypeError("Cyclic engine-owned condition implication");
    }
    const provenance: ConditionProvenance = {
      identity: instance.identity,
      path,
      source: instance.source,
    };
    const entries = byCondition.get(conditionId) ?? [];
    addProvenance(entries, provenance);
    byCondition.set(conditionId, entries);
    for (const implied of occurrenceRule(conditionId).implications) {
      visit(instance, implied, [...path, implied]);
    }
  };

  for (const instance of instances) {
    visit(instance, instance.conditionId, [instance.conditionId]);
  }

  const effective: EffectiveCondition[] = NON_EXHAUSTION_CONDITION_IDS.flatMap(
    (conditionId) => {
      const provenance = byCondition.get(conditionId);
      return provenance ? [{ conditionId, provenance }] : [];
    }
  );
  return deepFreeze({ effective, instances });
}

function sourceBound(
  requirement: ConditionRequirementDefinition
): requirement is SourceBoundConditionRequirement {
  switch (requirement.kind) {
    case "harm-source-block":
    case "source-social-check":
    case "source-in-line-of-sight-roll":
    case "approach-source-block":
    case "non-source-attack":
    case "source-moves-grappled-subject":
      return true;
    case "sense-dependent-ability-check":
    case "seen-targeting":
    case "visibility-attack-roll":
    case "automatic-critical-on-hit":
    case "prone-movement":
    case "prone-attacks-against":
    case "condition-end-retains":
      return false;
  }
}

interface MutableEffectProjection {
  effect: DeterministicConditionEffect;
  provenance: ConditionProvenance[];
}

type MutableRequirementProjection =
  | {
      conditionSource: Readonly<EntityRef> | null;
      provenance: ConditionProvenance[];
      requirement: SourceBoundConditionRequirement;
    }
  | {
      provenance: ConditionProvenance[];
      requirement: IndependentConditionRequirement;
    };

/** Project only unconditional effects; unresolved table facts remain typed requirements. */
export function projectConditionEffects(
  value: unknown
): Readonly<ConditionProjection> | null {
  const normalized = normalizeConditions(value);
  if (!normalized) return null;

  const deterministicEffects: MutableEffectProjection[] = [];
  const effectsByKey = new Map<string, MutableEffectProjection>();
  const requirements: MutableRequirementProjection[] = [];
  const requirementsByKey = new Map<string, MutableRequirementProjection>();

  for (const condition of normalized.effective) {
    const rule = occurrenceRule(condition.conditionId);
    for (const effect of rule.effects) {
      const key = canonicalKey(effect);
      let projection = effectsByKey.get(key);
      if (!projection) {
        projection = { effect, provenance: [] };
        effectsByKey.set(key, projection);
        deterministicEffects.push(projection);
      }
      for (const provenance of condition.provenance) {
        addProvenance(projection.provenance, provenance);
      }
    }

    for (const requirement of rule.requirements) {
      if (sourceBound(requirement)) {
        for (const provenance of condition.provenance) {
          const key = canonicalKey({ requirement, source: provenance.source });
          let projection = requirementsByKey.get(key);
          if (!projection) {
            projection = {
              conditionSource: provenance.source,
              provenance: [],
              requirement,
            };
            requirementsByKey.set(key, projection);
            requirements.push(projection);
          }
          addProvenance(projection.provenance, provenance);
        }
      } else {
        const key = canonicalKey({ requirement });
        let projection = requirementsByKey.get(key);
        if (!projection) {
          projection = { provenance: [], requirement };
          requirementsByKey.set(key, projection);
          requirements.push(projection);
        }
        for (const provenance of condition.provenance) {
          addProvenance(projection.provenance, provenance);
        }
      }
    }
  }

  return deepFreeze({
    deterministicEffects,
    effective: normalized.effective,
    instances: normalized.instances,
    requirements,
  });
}

/**
 * Add the creature-state implications that are not persisted as condition
 * occurrences. Dead is not itself a condition, but it still ends Concentration.
 */
export function projectCreatureConditions(
  value: unknown,
  targetValue: unknown,
  vitalsValue: unknown
): Readonly<EntityConditionProjection> | null {
  const instances = conformConditionInstances(value);
  const target = conformEntityRef(targetValue);
  const vitals = conformCreatureVitals(vitalsValue);
  if (!instances || !target || !vitals) return null;

  const unconsciousDerivedFromZeroHitPoints =
    vitals.zeroHitPoints?.kind === "dying" || vitals.zeroHitPoints?.kind === "stable";
  const complete: ConditionInstance[] = [...instances];
  if (unconsciousDerivedFromZeroHitPoints) {
    complete.push({
      conditionId: "unconscious",
      identity: { kind: "zero-hit-points", target },
      source: null,
    });
  }
  complete.sort((left, right) => canonicalKey(left).localeCompare(canonicalKey(right)));

  const projection = projectConditionEffects(complete);
  if (!projection) return null;
  const incapacitated = projection.effective.some(
    ({ conditionId }) => conditionId === "incapacitated"
  );
  const conditionBreaksConcentration = projection.deterministicEffects.some(
    ({ effect }) => effect.kind === "break-concentration"
  );
  return deepFreeze({
    breaksConcentration:
      conditionBreaksConcentration || vitals.zeroHitPoints?.kind === "dead",
    incapacitated,
    projection,
    unconsciousDerivedFromZeroHitPoints,
  });
}

/** Strict persisted Exhaustion boundary. */
export function conformExhaustionLevel(value: unknown): ExhaustionLevel | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    !Object.is(value, -0) &&
    EXHAUSTION_LEVELS.includes(value as ExhaustionLevel)
    ? (value as ExhaustionLevel)
    : null;
}

/** Resolve the complete numeric footprint of one valid Exhaustion level. */
export function resolveExhaustion(value: unknown): Readonly<ExhaustionResolution> | null {
  const level = conformExhaustionLevel(value);
  if (level === null) return null;
  const rule = CONDITION_RULES.exhaustion;
  return deepFreeze({
    d20Penalty: level === 0 ? 0 : rule.d20PenaltyPerLevel * level,
    dead: level === rule.deadAtLevel,
    speedPenaltyFt: rule.speedPenaltyFtPerLevel * level,
  });
}

function transitionAmount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    value >= 0
    ? value
    : null;
}

/** Gain levels, clamped at death; a saturated level is an idempotent result. */
export function gainExhaustion(
  value: unknown,
  amount: unknown = 1
): ExhaustionLevel | null {
  const level = conformExhaustionLevel(value);
  const count = transitionAmount(amount);
  if (level === null || count === null) return null;
  return Math.min(
    CONDITION_RULES.exhaustion.maximumLevel,
    level + Math.min(count, CONDITION_RULES.exhaustion.maximumLevel)
  ) as ExhaustionLevel;
}

/** Remove levels, clamped at zero; an empty level is an idempotent result. */
export function removeExhaustion(
  value: unknown,
  amount: unknown = 1
): ExhaustionLevel | null {
  const level = conformExhaustionLevel(value);
  const count = transitionAmount(amount);
  if (level === null || count === null) return null;
  return Math.max(
    CONDITION_RULES.exhaustion.minimumLevel,
    level - count
  ) as ExhaustionLevel;
}

/** The Exhaustion rule's deterministic Long-Rest transition. */
export function applyLongRestExhaustion(value: unknown): ExhaustionLevel | null {
  return removeExhaustion(value, CONDITION_RULES.exhaustion.longRestRemoval);
}
