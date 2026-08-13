/** Exact, locale-free contracts for the 2024 condition rules. */

import {
  arraySchema,
  customSchema,
  literalSchema,
  objectSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { AbilityCode } from "@/types/ability";
import type { DamageDefenseRule } from "@/types/damage";
import type { EntityRef, OccurrenceRef } from "@/types/mechanics-reference";

export const CONDITION_IDS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

export const CONDITION_ID_SCHEMA = unionSchema(
  CONDITION_IDS.map((conditionId) => literalSchema(conditionId))
);

export const NON_EXHAUSTION_CONDITION_IDS = [
  "blinded",
  "charmed",
  "deafened",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const satisfies ReadonlyArray<Exclude<ConditionId, "exhaustion">>;
export type NonExhaustionConditionId = (typeof NON_EXHAUSTION_CONDITION_IDS)[number];

export const NON_EXHAUSTION_CONDITION_ID_SCHEMA = unionSchema(
  NON_EXHAUSTION_CONDITION_IDS.map((conditionId) => literalSchema(conditionId))
);

export const EXHAUSTION_LEVELS = [0, 1, 2, 3, 4, 5, 6] as const;
export type ExhaustionLevel = (typeof EXHAUSTION_LEVELS)[number];

export const EXHAUSTION_LEVEL_SCHEMA = unionSchema(
  EXHAUSTION_LEVELS.map((level) => literalSchema(level))
);

const ENTITY_REF_SCHEMA = customSchema<"entity-ref", EntityRef>("entity-ref");
const CONDITION_INSTANCE_IDENTITY_SCHEMA = customSchema<
  "condition-instance-identity",
  ConditionInstanceIdentity
>("condition-instance-identity");
const NULL_SCHEMA = literalSchema(null);

export type ConditionInstanceIdentity =
  | { readonly kind: "occurrence"; readonly ref: OccurrenceRef }
  | { readonly kind: "zero-hit-points"; readonly target: EntityRef };

/** Exhaustion never enters this occurrence shape; it is the separate level above. */
export const CONDITION_INSTANCE_SCHEMA = objectSchema({
  conditionId: NON_EXHAUSTION_CONDITION_ID_SCHEMA,
  identity: CONDITION_INSTANCE_IDENTITY_SCHEMA,
  source: unionSchema([ENTITY_REF_SCHEMA, NULL_SCHEMA]),
});

export type ConditionInstance = InferExactSchema<typeof CONDITION_INSTANCE_SCHEMA>;

export const CONDITION_INSTANCES_SCHEMA = arraySchema(CONDITION_INSTANCE_SCHEMA);
export type ConditionInstances = InferExactSchema<typeof CONDITION_INSTANCES_SCHEMA>;

export type ConditionSchemaCustomTypes = {
  readonly "condition-instance-identity": ConditionInstanceIdentity;
  readonly "entity-ref": EntityRef;
};

export type ConditionEconomySlot = "action" | "bonus-action" | "reaction";
export type ConditionSense = "hearing" | "sight";
export type ConditionRollMode = "advantage" | "disadvantage";

export type ConditionRollEffect =
  | {
      readonly kind: "roll-mode";
      readonly mode: ConditionRollMode;
      readonly perspective: "self";
      readonly test: "ability-check" | "attack" | "initiative";
    }
  | {
      readonly ability: AbilityCode;
      readonly kind: "roll-mode";
      readonly mode: ConditionRollMode;
      readonly perspective: "self";
      readonly test: "saving-throw";
    }
  | {
      readonly kind: "roll-mode";
      readonly mode: ConditionRollMode;
      readonly perspective: "against-self";
      readonly test: "attack";
    };

/** Effects that need no unobserved spatial, visibility, target, or size fact. */
export type DeterministicConditionEffect =
  | ConditionRollEffect
  | {
      readonly kind: "block-economy";
      readonly slots: ReadonlyArray<ConditionEconomySlot>;
    }
  | { readonly kind: "break-concentration" }
  | { readonly abilities: ReadonlyArray<AbilityCode>; readonly kind: "auto-fail-save" }
  | { readonly kind: "speed-zero" }
  | { readonly kind: "sense-unavailable"; readonly sense: ConditionSense }
  | { readonly kind: "speech-unavailable" }
  | { readonly kind: "drop-held-items" }
  | { readonly kind: "surroundings-unaware" }
  | {
      readonly includesWornCarriedNonmagicalObjects: true;
      readonly kind: "inanimate-transformation";
    }
  | { readonly factor: 10; readonly kind: "weight-multiplier" }
  | { readonly kind: "aging-suspended" }
  | {
      readonly conditionId: NonExhaustionConditionId;
      readonly kind: "condition-immunity";
    }
  | { readonly kind: "damage-defense"; readonly rule: Readonly<DamageDefenseRule> };

/** Source-relative rules use the source recorded on each condition instance. */
export type SourceBoundConditionRequirement =
  | {
      readonly kind: "harm-source-block";
      readonly operations: readonly [
        "attack",
        "damaging-ability",
        "damaging-magical-effect",
      ];
    }
  | { readonly kind: "source-social-check"; readonly mode: "advantage" }
  | {
      readonly kind: "source-in-line-of-sight-roll";
      readonly mode: "disadvantage";
      readonly test: "ability-check" | "attack";
    }
  | { readonly kind: "approach-source-block" }
  | { readonly kind: "non-source-attack"; readonly mode: "disadvantage" }
  | {
      readonly exemption: "subject-tiny-or-two-plus-sizes-smaller";
      readonly extraMovementCostPerFoot: 1;
      readonly kind: "source-moves-grappled-subject";
    };

/** Rules whose truth requires a table fact the condition state does not own. */
export type IndependentConditionRequirement =
  | {
      readonly kind: "sense-dependent-ability-check";
      readonly outcome: "automatic-failure";
      readonly sense: ConditionSense;
    }
  | {
      readonly includesWornCarriedEquipment: true;
      readonly kind: "seen-targeting";
      readonly whenCreatorCannotSee: "ineligible";
    }
  | {
      readonly appliesWhen: "counterparty-cannot-see-subject";
      readonly kind: "visibility-attack-roll";
      readonly mode: ConditionRollMode;
      readonly perspective: "against-self" | "self";
    }
  | {
      readonly distanceFt: 5;
      readonly kind: "automatic-critical-on-hit";
    }
  | {
      readonly crawlAllowed: true;
      readonly kind: "prone-movement";
      readonly standBlockedAtSpeedZero: true;
      readonly standCost: "half-speed-round-down";
      readonly standEndsCondition: true;
    }
  | {
      readonly beyond: "disadvantage";
      readonly kind: "prone-attacks-against";
      readonly thresholdFt: 5;
      readonly within: "advantage";
    }
  | {
      readonly conditionId: "prone";
      readonly kind: "condition-end-retains";
    };

export type ConditionRequirementDefinition =
  | SourceBoundConditionRequirement
  | IndependentConditionRequirement;

export interface OccurrenceConditionRule {
  readonly effects: ReadonlyArray<DeterministicConditionEffect>;
  readonly implications: ReadonlyArray<NonExhaustionConditionId>;
  readonly kind: "occurrence";
  readonly requirements: ReadonlyArray<ConditionRequirementDefinition>;
}

export interface ExhaustionConditionRule {
  readonly d20PenaltyPerLevel: -2;
  readonly deadAtLevel: 6;
  readonly kind: "levels";
  readonly longRestRemoval: 1;
  readonly maximumLevel: 6;
  readonly minimumLevel: 0;
  readonly speedPenaltyFtPerLevel: 5;
}

export type ConditionRuleTable = {
  readonly exhaustion: ExhaustionConditionRule;
} & {
  readonly [Condition in NonExhaustionConditionId]: OccurrenceConditionRule;
};

export interface ConditionProvenance {
  readonly identity: ConditionInstanceIdentity;
  readonly path: ReadonlyArray<NonExhaustionConditionId>;
  readonly source: Readonly<EntityRef> | null;
}

export interface EffectiveCondition {
  readonly conditionId: NonExhaustionConditionId;
  readonly provenance: ReadonlyArray<ConditionProvenance>;
}

export interface NormalizedConditions {
  readonly effective: ReadonlyArray<EffectiveCondition>;
  readonly instances: ReadonlyArray<ConditionInstance>;
}

export interface ProjectedConditionEffect {
  readonly effect: DeterministicConditionEffect;
  readonly provenance: ReadonlyArray<ConditionProvenance>;
}

export type ProjectedConditionRequirement =
  | {
      readonly conditionSource: Readonly<EntityRef> | null;
      readonly provenance: ReadonlyArray<ConditionProvenance>;
      readonly requirement: SourceBoundConditionRequirement;
    }
  | {
      readonly provenance: ReadonlyArray<ConditionProvenance>;
      readonly requirement: IndependentConditionRequirement;
    };

export interface ConditionProjection extends NormalizedConditions {
  readonly deterministicEffects: ReadonlyArray<ProjectedConditionEffect>;
  readonly requirements: ReadonlyArray<ProjectedConditionRequirement>;
}

/** World-bound condition view consumed by economy, D20, damage, and concentration. */
export interface EntityConditionProjection {
  readonly breaksConcentration: boolean;
  readonly incapacitated: boolean;
  readonly projection: ConditionProjection;
  readonly unconsciousDerivedFromZeroHitPoints: boolean;
}

export interface ExhaustionResolution {
  readonly d20Penalty: number;
  readonly dead: boolean;
  readonly speedPenaltyFt: number;
}
